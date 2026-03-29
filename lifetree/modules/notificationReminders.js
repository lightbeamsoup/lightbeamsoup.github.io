import { formatTaskDisplayName, WEEKDAY_LABELS } from "../logic.js";
import { getWidgetDefinition } from "../widgets/registry.js";
import {
  DEFAULT_NOTIFICATION_TIMEZONE,
  DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES,
  normalizeNotificationTime,
  normalizeNotificationTimezone,
  normalizeRecipientEmail,
  normalizeReminderMinutes
} from "./notifications.js";

const LIFETREE_APP_URL = "https://www.joshcodes.ai/lifetree";
const REMINDER_TEMPLATE_ORDER = ["agenda", "due-soon", "overdue"];

export function buildEmailReminderTemplates({
  store,
  emailConfig,
  now = new Date(),
  fallbackRecipientEmail = "",
  respectQuietHours = false,
  includeKinds = null,
  requireDailyAgendaTime = false
}) {
  const reminders = emailConfig?.reminders || {};
  const summaries = emailConfig?.summaries || {};
  const timeZone = normalizeNotificationTimezone(
    summaries.timezone,
    DEFAULT_NOTIFICATION_TIMEZONE
  );
  const recipientEmail = normalizeRecipientEmail(emailConfig?.recipientEmail || fallbackRecipientEmail || "");
  const displayName = String(store?.profile?.displayName || "").trim() || "Lifetree";
  const quietHoursActive = reminders.quietHoursEnabled === true
    && isTimeWithinWindow(getZonedTimeString(now, timeZone), reminders.quietHoursStart, reminders.quietHoursEnd);
  const candidates = collectEmailReminderCandidates({
    store,
    emailConfig,
    now,
    timeZone,
    includeKinds,
    requireDailyAgendaTime
  });
  return buildReminderTemplatesFromCandidates({
    reminders,
    displayName,
    recipientEmail,
    candidates,
    now,
    timeZone,
    quietHoursActive,
    suppressedByQuietHours: respectQuietHours && quietHoursActive
  });
}

export function buildScheduledEmailReminderTemplates({
  store,
  emailConfig,
  now = new Date(),
  fallbackRecipientEmail = "",
  lookbackWindowMs = 0
}) {
  const reminders = emailConfig?.reminders || {};
  const summaries = emailConfig?.summaries || {};
  const timeZone = normalizeNotificationTimezone(
    summaries.timezone,
    DEFAULT_NOTIFICATION_TIMEZONE
  );
  const quietHoursActive = reminders.quietHoursEnabled === true
    && isTimeWithinWindow(getZonedTimeString(now, timeZone), reminders.quietHoursStart, reminders.quietHoursEnd);
  if (quietHoursActive) {
    return buildEmailReminderTemplates({
      store,
      emailConfig,
      now,
      fallbackRecipientEmail,
      respectQuietHours: true,
      requireDailyAgendaTime: true
    });
  }

  const sentKeys = buildSentReminderKeySet(emailConfig?.history);
  const candidates = collectEmailReminderCandidates({
    store,
    emailConfig,
    now,
    timeZone,
    requireDailyAgendaTime: true,
    lookbackWindowMs
  });
  const filteredCandidates = {
    dueSoon: candidates.dueSoon.filter((candidate) => !sentKeys.has(candidate.key)),
    overdue: candidates.overdue.filter((candidate) => !sentKeys.has(candidate.key)),
    dailyAgenda: candidates.dailyAgendaKey && !sentKeys.has(candidates.dailyAgendaKey) ? candidates.dailyAgenda : [],
    dailyAgendaKey: candidates.dailyAgendaKey && !sentKeys.has(candidates.dailyAgendaKey) ? candidates.dailyAgendaKey : "",
    all: []
  };
  filteredCandidates.all = [
    ...filteredCandidates.dueSoon,
    ...filteredCandidates.overdue,
    ...filteredCandidates.dailyAgenda
  ];

  return buildReminderTemplatesFromCandidates({
    reminders,
    displayName: String(store?.profile?.displayName || "").trim() || "Lifetree",
    recipientEmail: normalizeRecipientEmail(emailConfig?.recipientEmail || fallbackRecipientEmail || ""),
    candidates: filteredCandidates,
    now,
    timeZone,
    quietHoursActive: false,
    suppressedByQuietHours: false
  });
}

export function collectEmailReminderCandidates({
  store,
  emailConfig,
  now = new Date(),
  timeZone = DEFAULT_NOTIFICATION_TIMEZONE,
  includeKinds = null,
  requireDailyAgendaTime = false,
  lookbackWindowMs = 0
}) {
  const reminders = emailConfig?.reminders || {};
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const currentDate = getZonedDateString(now, timeZone);
  const nowTimestamp = now.getTime();
  const localTime = getZonedTimeString(now, timeZone);
  const dueSoon = [];
  const overdue = [];
  const dailyAgenda = [];
  const dueSoonAllowed = includeKinds ? includeKinds.dueSoon !== false : reminders.dueSoonEnabled !== false;
  const overdueAllowed = includeKinds ? includeKinds.overdue !== false : reminders.overdueEnabled !== false;
  const dailyAgendaAllowed = includeKinds ? includeKinds.dailyAgenda !== false : reminders.dailyAgendaEnabled === true;
  const dailyAgendaKey = dailyAgendaAllowed ? `agenda:${currentDate}` : "";

  for (const task of tasks) {
    if (!shouldIncludeTaskForReminder(task, { nowTimestamp, taskMap })) {
      continue;
    }

    const dueTimestamp = getReminderTaskDueTimestamp(task, timeZone);
    if (!Number.isFinite(dueTimestamp)) {
      continue;
    }
    const dueSoonMinutes = normalizeReminderMinutes(task?.reminders?.dueSoonMinutes, DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES);
    const overdueMinutes = normalizeReminderMinutes(task?.reminders?.overdueMinutes, Number(task?.lateGraceMinutes) || 0);
    const dueDate = task?.dueDate || task?.startDate || "";
    const baseKey = `${task.id}|${dueDate}|${task?.timeOfDay || "23:59"}`;

    if (dueSoonAllowed) {
      const dueSoonStart = dueTimestamp - dueSoonMinutes * 60_000;
      const dueSoonRecentlyCrossed = lookbackWindowMs > 0
        && dueSoonStart <= nowTimestamp
        && dueSoonStart > nowTimestamp - lookbackWindowMs;
      if ((nowTimestamp >= dueSoonStart && nowTimestamp < dueTimestamp) || dueSoonRecentlyCrossed) {
        dueSoon.push({ key: `due-soon:${baseKey}`, task, dueTimestamp });
      }
    }

    if (overdueAllowed) {
      const overdueAt = dueTimestamp + overdueMinutes * 60_000;
      if (nowTimestamp >= overdueAt) {
        overdue.push({ key: `overdue:${baseKey}`, task, dueTimestamp });
      }
    }

  }

  if (dailyAgendaAllowed && (!requireDailyAgendaTime || localTime >= normalizeNotificationTime(reminders.dailyAgendaTime, "07:00"))) {
    dailyAgenda.push(...collectDailyAgendaCandidates(tasks, currentDate, timeZone));
  }

  const sortCandidates = (left, right) => left.dueTimestamp - right.dueTimestamp
    || String(left.task?.name || "").localeCompare(String(right.task?.name || ""));
  dueSoon.sort(sortCandidates);
  const dueSoonTaskIds = new Set(dueSoon.map((candidate) => candidate.task?.id).filter(Boolean));
  const filteredOverdue = overdue.filter((candidate) => !dueSoonTaskIds.has(candidate.task?.id));
  filteredOverdue.sort(sortCandidates);
  dailyAgenda.sort(sortCandidates);

  return {
    dueSoon,
    overdue: filteredOverdue,
    dailyAgenda,
    dailyAgendaKey,
    all: [
      ...dueSoon,
      ...filteredOverdue,
      ...dailyAgenda
    ]
  };
}

export function buildSentReminderKeySet(historyEntries) {
  const sentKeys = new Set();
  for (const entry of Array.isArray(historyEntries) ? historyEntries : []) {
    if (entry?.status !== "sent" || entry?.kind !== "reminder") {
      continue;
    }
    if (Array.isArray(entry.reminderEventKeys)) {
      for (const key of entry.reminderEventKeys) {
        if (typeof key === "string" && key) {
          sentKeys.add(key);
        }
      }
    } else if (typeof entry.reminderKey === "string" && entry.reminderKey) {
      sentKeys.add(entry.reminderKey);
    }
  }
  return sentKeys;
}

export function buildReminderEventKeys(candidates) {
  const keys = [
    ...(Array.isArray(candidates?.dueSoon) ? candidates.dueSoon.map((candidate) => candidate.key) : []),
    ...(Array.isArray(candidates?.overdue) ? candidates.overdue.map((candidate) => candidate.key) : [])
  ];
  if (Array.isArray(candidates?.dailyAgenda) && candidates.dailyAgenda.length > 0 && candidates?.dailyAgendaKey) {
    keys.push(candidates.dailyAgendaKey);
  }
  return [...new Set(keys)].sort();
}

export function renderEmailReminderBodyHtml(preview) {
  const intro = buildReminderTemplateIntro(preview);
  const itemsHtml = preview.items.length > 0
    ? `
      <ul style="margin: 0; padding-left: 20px; color: #4f637a; line-height: 1.55;">
        ${preview.items.map((item) => renderReminderHtmlItem(item)).join("")}
      </ul>
    `
    : `<p style="margin: 0; color: #4f637a;">No reminder events are due right now.</p>`;
  return `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f5efe4; color: #253243; font-family: Georgia, 'Times New Roman', serif;">
    <main style="max-width: 720px; margin: 0 auto; background: #fffaf3; border: 1px solid rgba(37, 50, 67, 0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(37, 50, 67, 0.12);">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #e57b4b;">${escapeHtml(preview.eyebrow)}</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #253243;">${escapeHtml(preview.subject)}</h1>
      <p style="margin: 0 0 14px; color: #4f637a;">${escapeHtml(preview.scheduleLabel)}${preview.recipientEmail ? ` · Sent to ${escapeHtml(preview.recipientEmail)}` : ""}</p>
      <p style="margin: 0 0 20px; color: #4f637a;">${escapeHtml(intro)}</p>
      ${itemsHtml}
      <p style="margin: 24px 0 0; color: #4f637a;">Open Lifetree: <a href="${LIFETREE_APP_URL}" style="color: #e57b4b;">${LIFETREE_APP_URL}</a></p>
    </main>
  </body>
</html>`;
}

export function renderEmailReminderBodyText(preview) {
  const lines = [preview.subject, preview.scheduleLabel];
  if (preview.recipientEmail) {
    lines.push(`Sent to ${preview.recipientEmail}`);
  }
  lines.push("");
  lines.push(buildReminderTemplateIntro(preview));
  lines.push("");
  if (preview.items.length === 0) {
    lines.push("No reminder events are due right now.");
  } else {
    lines.push(...preview.items.map((item) => `- ${formatReminderTextItem(item)}`));
    lines.push("");
  }
  lines.push(`Open Lifetree: ${LIFETREE_APP_URL}`);
  return lines.join("\n").trim();
}

export function buildReminderScheduleLabel(remindersConfig, timeZone = DEFAULT_NOTIFICATION_TIMEZONE, templateKind = "due-soon") {
  if (templateKind === "agenda") {
    return `Daily agenda${remindersConfig.dailyAgendaEnabled === true ? ` at ${formatTimeLabel(remindersConfig.dailyAgendaTime)}` : ""} · ${timeZone}`;
  }
  if (templateKind === "overdue") {
    return `Overdue reminder · ${timeZone}`;
  }
  return `Due soon reminder · ${timeZone}`;
}

function buildReminderTemplatesFromCandidates({
  reminders,
  displayName,
  recipientEmail,
  candidates,
  now,
  timeZone,
  quietHoursActive = false,
  suppressedByQuietHours = false
}) {
  if (reminders.enabled !== true) {
    return [];
  }

  const templateSpecs = [
    {
      templateKind: "agenda",
      items: candidates.dailyAgenda,
      eventKeys: Array.isArray(candidates.dailyAgenda) && candidates.dailyAgenda.length > 0 && candidates.dailyAgendaKey
        ? [candidates.dailyAgendaKey]
        : []
    },
    {
      templateKind: "due-soon",
      items: candidates.dueSoon,
      eventKeys: (Array.isArray(candidates.dueSoon) ? candidates.dueSoon : []).map((candidate) => candidate.key)
    },
    {
      templateKind: "overdue",
      items: candidates.overdue,
      eventKeys: (Array.isArray(candidates.overdue) ? candidates.overdue : []).map((candidate) => candidate.key)
    }
  ];

  return templateSpecs
    .map((spec) => buildReminderTemplatePreview({
      displayName,
      recipientEmail,
      reminders,
      now,
      timeZone,
      quietHoursActive,
      suppressedByQuietHours,
      templateKind: spec.templateKind,
      candidates: spec.items,
      eventKeys: spec.eventKeys
    }))
    .filter(Boolean)
    .sort((left, right) => REMINDER_TEMPLATE_ORDER.indexOf(left.templateKind) - REMINDER_TEMPLATE_ORDER.indexOf(right.templateKind));
}

function buildReminderTemplatePreview({
  displayName,
  recipientEmail,
  reminders,
  now,
  timeZone,
  quietHoursActive,
  suppressedByQuietHours,
  templateKind,
  candidates,
  eventKeys
}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  if (safeCandidates.length === 0) {
    return null;
  }
  const items = safeCandidates.map((candidate) => buildReminderPreviewItem(candidate.task, timeZone));
  const dateCopy = formatDateInTimeZone(now, timeZone);
  return {
    templateKind,
    eyebrow: templateKind === "agenda" ? "Lifetree agenda" : templateKind === "overdue" ? "Lifetree overdue reminder" : "Lifetree reminder",
    subject: buildReminderSubject(displayName, templateKind, dateCopy),
    recipientEmail,
    enabled: reminders.enabled === true,
    scheduleLabel: buildReminderScheduleLabel(reminders, timeZone, templateKind),
    items,
    quietHoursActive,
    suppressedByQuietHours,
    eventCount: items.length,
    eventKeys: [...new Set(eventKeys)].sort(),
    reminderKey: [...new Set(eventKeys)].sort().join("|").slice(0, 240)
  };
}

function shouldIncludeTaskForReminder(task, { nowTimestamp, taskMap }) {
  if (!task || task.archived || task.historyOnly || task.status !== "open") {
    return false;
  }
  if (task?.reminders?.enabled !== true) {
    return false;
  }
  if (typeof task.notBeforeAt === "number" && task.notBeforeAt > nowTimestamp) {
    return false;
  }
  const dependencyIds = getTaskDependencyIds(task);
  return !dependencyIds.some((dependencyId) => {
    const dependency = taskMap.get(dependencyId);
    if (!dependency) {
      return false;
    }
    const definition = getWidgetDefinition(task.ownerWidgetType);
    const satisfied = definition?.isDependencySatisfied?.({ task, dependency });
    if (typeof satisfied === "boolean") {
      return !satisfied;
    }
    return dependency.status !== "done";
  });
}

function getTaskDependencyIds(task) {
  const ids = Array.isArray(task?.dependencies) ? [...task.dependencies] : [];
  if (typeof task?.sequenceDependencyId === "string" && task.sequenceDependencyId) {
    ids.push(task.sequenceDependencyId);
  }
  return [...new Set(ids)];
}

function getReminderTaskDueTimestamp(task, timeZone) {
  const dueDate = task?.dueDate || task?.startDate || "";
  if (!dueDate) {
    return Number.NaN;
  }
  const taskTimeZone = getReminderTaskTimeZone(task, timeZone);
  return zonedDateTimeToTimestamp(dueDate, task?.timeOfDay || "23:59", taskTimeZone);
}

function buildReminderPreviewItem(task, timeZone) {
  const dueDate = task?.dueDate || task?.startDate || "";
  const timeOfDay = task?.timeOfDay || "23:59";
  const taskTimeZone = getReminderTaskTimeZone(task, timeZone);
  const dueTimestamp = zonedDateTimeToTimestamp(dueDate, timeOfDay, taskTimeZone);
  const dueCopy = Number.isFinite(dueTimestamp)
    ? formatDateTimeInTimeZone(dueTimestamp, taskTimeZone)
    : `${dueDate} ${timeOfDay}`.trim();
  const status = task?.status === "done" ? "completed" : (task?.status === "skipped" ? "skipped" : "open");
  return {
    label: `${formatTaskDisplayName(task)} · Due ${dueCopy}${taskTimeZone !== timeZone ? ` (${taskTimeZone})` : ""}`,
    status
  };
}

function collectDailyAgendaCandidates(tasks, currentDate, timeZone) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => {
      if (!task || task.archived) {
        return false;
      }
      const dueTimestamp = getReminderTaskDueTimestamp(task, timeZone);
      const dueDate = Number.isFinite(dueTimestamp)
        ? getZonedDateString(new Date(dueTimestamp), timeZone)
        : (task?.dueDate || task?.startDate || "");
      if (dueDate !== currentDate) {
        return false;
      }
      return task.status === "open" || task.status === "done" || task.status === "skipped";
    })
    .map((task) => ({
      key: `agenda:${currentDate}:${task.id}`,
      task,
      dueTimestamp: getReminderTaskDueTimestamp(task, timeZone)
    }));
}

function getReminderTaskTimeZone(task, fallbackTimeZone) {
  const candidate = typeof task?.widgetTaskMeta?.timeZone === "string" ? task.widgetTaskMeta.timeZone.trim() : "";
  if (!candidate) {
    return fallbackTimeZone;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallbackTimeZone;
  }
}

function renderReminderHtmlItem(item) {
  const normalized = normalizeReminderPreviewItem(item);
  const statusCopy = normalized.status === "completed"
    ? "Completed"
    : normalized.status === "skipped"
      ? "Skipped"
      : "";
  const labelHtml = normalized.status === "open"
    ? escapeHtml(normalized.label)
    : `<span style="text-decoration: line-through; color: #7c8ba1;">${escapeHtml(normalized.label)}</span>`;
  const badgeHtml = statusCopy
    ? ` <span style="display: inline-block; margin-left: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: ${normalized.status === "completed" ? "#40734c" : "#9a5a33"};">${statusCopy}</span>`
    : "";
  return `<li style="margin-bottom: 6px;">${labelHtml}${badgeHtml}</li>`;
}

function formatReminderTextItem(item) {
  const normalized = normalizeReminderPreviewItem(item);
  if (normalized.status === "completed") {
    return `[Completed] ${normalized.label}`;
  }
  if (normalized.status === "skipped") {
    return `[Skipped] ${normalized.label}`;
  }
  return normalized.label;
}

function normalizeReminderPreviewItem(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      label: String(item.label || ""),
      status: item.status === "completed" || item.status === "skipped" ? item.status : "open"
    };
  }
  return {
    label: String(item || ""),
    status: "open"
  };
}

function buildReminderSubject(displayName, templateKind, dateCopy) {
  if (templateKind === "agenda") {
    return `${displayName}'s agenda · ${dateCopy}`;
  }
  if (templateKind === "overdue") {
    return `Overdue tasks for ${displayName} · ${dateCopy}`;
  }
  return `Reminders for ${displayName} · ${dateCopy}`;
}

function buildReminderTemplateIntro(preview) {
  if (preview.templateKind === "agenda") {
    return "Here is everything due today. Tasks already completed or skipped stay listed so the day is easy to review at a glance.";
  }
  if (preview.templateKind === "overdue") {
    return "These tasks are now past their overdue threshold and still need attention.";
  }
  return "These tasks are approaching their due time and may need attention soon.";
}

function zonedDateTimeToTimestamp(dateString, timeString, timeZone) {
  const parts = String(dateString || "").split("-").map((part) => Number(part));
  const timeParts = normalizeNotificationTime(timeString, "23:59").split(":").map((part) => Number(part));
  const [year, month, day] = parts;
  const [hours, minutes] = timeParts;
  if (!year || !month || !day) {
    return Number.NaN;
  }
  const guess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const first = adjustZonedTimestamp(guess, year, month, day, hours, minutes, timeZone);
  return adjustZonedTimestamp(first, year, month, day, hours, minutes, timeZone);
}

function adjustZonedTimestamp(guess, year, month, day, hours, minutes, timeZone) {
  const actual = getZonedParts(new Date(guess), timeZone);
  const actualUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hours,
    actual.minutes,
    0
  );
  const desiredUtc = Date.UTC(year, month - 1, day, hours, minutes, 0);
  return guess + (desiredUtc - actualUtc);
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date).reduce((result, item) => {
    if (item.type !== "literal") {
      result[item.type] = Number(item.value);
    }
    return result;
  }, {});
  return {
    year: parts.year || 0,
    month: parts.month || 1,
    day: parts.day || 1,
    hours: parts.hour || 0,
    minutes: parts.minute || 0
  };
}

function getZonedDateString(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getZonedTimeString(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function isTimeWithinWindow(timeValue, startValue, endValue) {
  const time = normalizeNotificationTime(timeValue);
  const start = normalizeNotificationTime(startValue, "21:00");
  const end = normalizeNotificationTime(endValue, "07:00");
  if (start === end) {
    return true;
  }
  if (start < end) {
    return time >= start && time < end;
  }
  return time >= start || time < end;
}

function formatDateInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric"
  }).format(value);
}

function formatDateTimeInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimeLabel(value) {
  const [hours, minutes] = normalizeNotificationTime(value, "07:00").split(":").map((part) => Number(part));
  return new Date(2000, 0, 1, hours, minutes, 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
