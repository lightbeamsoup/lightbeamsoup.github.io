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

export function buildEmailReminderPreview({
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
  const eventKeys = buildReminderEventKeys(candidates);
  const sections = [];

  if (reminders.enabled === true && candidates.dueSoon.length > 0) {
    sections.push({
      title: "Due soon",
      items: candidates.dueSoon.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }
  if (reminders.enabled === true && candidates.overdue.length > 0) {
    sections.push({
      title: "Overdue",
      items: candidates.overdue.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }
  if (reminders.enabled === true && candidates.dailyAgenda.length > 0) {
    sections.push({
      title: "Today's agenda",
      items: candidates.dailyAgenda.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }

  return {
    subject: `${displayName} reminders · ${formatDateInTimeZone(now, timeZone)}`,
    recipientEmail,
    enabled: reminders.enabled === true,
    scheduleLabel: buildReminderScheduleLabel(reminders, timeZone),
    sections,
    quietHoursActive,
    suppressedByQuietHours: respectQuietHours && quietHoursActive,
    eventCount: candidates.dueSoon.length + candidates.overdue.length + candidates.dailyAgenda.length,
    eventKeys,
    reminderKey: eventKeys.join("|").slice(0, 240)
  };
}

export function buildScheduledEmailReminderPreview({
  store,
  emailConfig,
  now = new Date(),
  fallbackRecipientEmail = ""
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
    return buildEmailReminderPreview({
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
    requireDailyAgendaTime: true
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

  return buildEmailReminderPreviewFromCandidates({
    store,
    emailConfig,
    now,
    fallbackRecipientEmail,
    candidates: filteredCandidates,
    quietHoursActive: false,
    suppressedByQuietHours: false,
    timeZone
  });
}

export function collectEmailReminderCandidates({
  store,
  emailConfig,
  now = new Date(),
  timeZone = DEFAULT_NOTIFICATION_TIMEZONE,
  includeKinds = null,
  requireDailyAgendaTime = false
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
      if (nowTimestamp >= dueSoonStart && nowTimestamp < dueTimestamp) {
        dueSoon.push({ key: `due-soon:${baseKey}`, task, dueTimestamp });
      }
    }

    if (overdueAllowed) {
      const overdueAt = dueTimestamp + overdueMinutes * 60_000;
      if (nowTimestamp >= overdueAt) {
        overdue.push({ key: `overdue:${baseKey}`, task, dueTimestamp });
      }
    }

    if (
      dailyAgendaAllowed
      && dueDate === currentDate
      && (!requireDailyAgendaTime || localTime >= normalizeNotificationTime(reminders.dailyAgendaTime, "07:00"))
    ) {
      dailyAgenda.push({ key: dailyAgendaKey, task, dueTimestamp });
    }
  }

  const sortCandidates = (left, right) => left.dueTimestamp - right.dueTimestamp
    || String(left.task?.name || "").localeCompare(String(right.task?.name || ""));
  dueSoon.sort(sortCandidates);
  overdue.sort(sortCandidates);
  dailyAgenda.sort(sortCandidates);

  return {
    dueSoon,
    overdue,
    dailyAgenda,
    dailyAgendaKey,
    all: [
      ...dueSoon,
      ...overdue,
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
  const sectionsHtml = preview.sections.length > 0
    ? preview.sections.map((section) => `
      <section style="margin: 0 0 20px;">
        <h2 style="margin: 0 0 10px; font-size: 18px; color: #253243;">${escapeHtml(section.title)}</h2>
        <ul style="margin: 0; padding-left: 20px; color: #4f637a; line-height: 1.55;">
          ${section.items.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    `).join("")
    : `<p style="margin: 0; color: #4f637a;">No reminder events are due right now.</p>`;

  return `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f5efe4; color: #253243; font-family: Georgia, 'Times New Roman', serif;">
    <main style="max-width: 720px; margin: 0 auto; background: #fffaf3; border: 1px solid rgba(37, 50, 67, 0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(37, 50, 67, 0.12);">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #e57b4b;">Lifetree reminders</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #253243;">${escapeHtml(preview.subject)}</h1>
      <p style="margin: 0 0 24px; color: #4f637a;">${escapeHtml(preview.scheduleLabel)}${preview.recipientEmail ? ` · Sent to ${escapeHtml(preview.recipientEmail)}` : ""}</p>
      ${sectionsHtml}
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
  if (preview.sections.length === 0) {
    lines.push("No reminder events are due right now.");
  } else {
    for (const section of preview.sections) {
      lines.push(section.title);
      lines.push(...section.items.map((item) => `- ${item}`));
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

export function buildReminderScheduleLabel(remindersConfig, timeZone = DEFAULT_NOTIFICATION_TIMEZONE) {
  const parts = [];
  if (remindersConfig.enabled === true) {
    if (remindersConfig.dueSoonEnabled !== false) {
      parts.push("Due soon");
    }
    if (remindersConfig.overdueEnabled !== false) {
      parts.push("Overdue");
    }
    if (remindersConfig.dailyAgendaEnabled === true) {
      parts.push(`Daily agenda at ${formatTimeLabel(remindersConfig.dailyAgendaTime)}`);
    }
  } else {
    parts.push("Reminders saved only");
  }
  if (remindersConfig.quietHoursEnabled === true) {
    parts.push(`Quiet hours ${formatTimeLabel(remindersConfig.quietHoursStart)}-${formatTimeLabel(remindersConfig.quietHoursEnd)}`);
  }
  parts.push(timeZone);
  return parts.join(" · ");
}

function buildEmailReminderPreviewFromCandidates({
  store,
  emailConfig,
  now,
  fallbackRecipientEmail,
  candidates,
  quietHoursActive,
  suppressedByQuietHours,
  timeZone
}) {
  const reminders = emailConfig?.reminders || {};
  const recipientEmail = normalizeRecipientEmail(emailConfig?.recipientEmail || fallbackRecipientEmail || "");
  const displayName = String(store?.profile?.displayName || "").trim() || "Lifetree";
  const eventKeys = buildReminderEventKeys(candidates);
  const sections = [];
  if (reminders.enabled === true && candidates.dueSoon.length > 0) {
    sections.push({
      title: "Due soon",
      items: candidates.dueSoon.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }
  if (reminders.enabled === true && candidates.overdue.length > 0) {
    sections.push({
      title: "Overdue",
      items: candidates.overdue.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }
  if (reminders.enabled === true && candidates.dailyAgenda.length > 0) {
    sections.push({
      title: "Today's agenda",
      items: candidates.dailyAgenda.map((candidate) => formatReminderTaskLine(candidate.task, timeZone))
    });
  }
  return {
    subject: `${displayName} reminders · ${formatDateInTimeZone(now, timeZone)}`,
    recipientEmail,
    enabled: reminders.enabled === true,
    scheduleLabel: buildReminderScheduleLabel(reminders, timeZone),
    sections,
    quietHoursActive,
    suppressedByQuietHours,
    eventCount: candidates.dueSoon.length + candidates.overdue.length + candidates.dailyAgenda.length,
    eventKeys,
    reminderKey: eventKeys.join("|").slice(0, 240)
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
  return zonedDateTimeToTimestamp(dueDate, task?.timeOfDay || "23:59", timeZone);
}

function formatReminderTaskLine(task, timeZone) {
  const dueDate = task?.dueDate || task?.startDate || "";
  const timeOfDay = task?.timeOfDay || "23:59";
  const dueTimestamp = zonedDateTimeToTimestamp(dueDate, timeOfDay, timeZone);
  const dueCopy = Number.isFinite(dueTimestamp)
    ? formatDateTimeInTimeZone(dueTimestamp, timeZone)
    : `${dueDate} ${timeOfDay}`.trim();
  return `${formatTaskDisplayName(task)} · Due ${dueCopy}`;
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
