import { WEEKDAY_LABELS, buildHistoryFeed, toDateString } from "../logic.js";
import { formatPointsLabel } from "./points.js";
import { buildPointSummary, buildFruitDisplayState } from "./treeState.js";
import {
  DEFAULT_NOTIFICATION_TIMEZONE,
  normalizeNotificationTime,
  normalizeNotificationTimezone,
  normalizeRecipientEmail
} from "./notifications.js";

const LIFETREE_APP_URL = "https://www.joshcodes.ai/lifetree";

const BASE_CATEGORIES = [
  { key: "fun", label: "Fun", color: "#f4b64e", builtin: true, active: true },
  { key: "friends", label: "Friends", color: "#5ca8f5", builtin: true, active: true },
  { key: "family", label: "Family", color: "#f28ca8", builtin: true, active: true },
  { key: "productivity", label: "Productivity", color: "#7dbf74", builtin: true, active: true },
  { key: "health", label: "Health", color: "#6dc7bf", builtin: true, active: true }
];

const RECURRING_GROUP_LABELS = {
  daily: "Dailies",
  weekly: "Weeklies",
  monthly: "Monthlies"
};

export function buildEmailSummaryPreview({
  store,
  emailConfig,
  now = new Date(),
  fallbackRecipientEmail = ""
}) {
  const summaryConfig = emailConfig?.summaries || {};
  const timeZone = normalizeNotificationTimezone(summaryConfig.timezone, DEFAULT_NOTIFICATION_TIMEZONE);
  const nowTimestamp = now.getTime();
  const summaryWindowMs = summaryConfig.frequency === "weekly"
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const recipientEmail = normalizeRecipientEmail(emailConfig?.recipientEmail || fallbackRecipientEmail || "");
  const displayName = String(store?.profile?.displayName || "").trim() || "Lifetree";
  const localToday = getZonedDateString(now, timeZone);
  const localNowKey = getZonedDateTimeKey(now, timeZone);
  const localWindowEndKey = getZonedDateTimeKey(new Date(nowTimestamp + summaryWindowMs), timeZone);
  const subject = `${displayName} ${summaryConfig.frequency === "weekly" ? "weekly" : "daily"} summary · ${formatDateInTimeZone(now, timeZone)}`;
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const openTasks = tasks
    .filter((task) => task?.status === "open" && !task?.archived && !task?.historyOnly)
    .map((task) => ({ task, dueKey: getNotificationTaskDueKey(task) }))
    .filter((entry) => entry.dueKey);
  const overdueTasks = openTasks
    .filter((entry) => entry.dueKey < localNowKey)
    .sort((left, right) => left.dueKey.localeCompare(right.dueKey))
    .slice(0, 5)
    .map((entry) => formatNotificationTaskLine(entry.task));
  const dueSoonTasks = openTasks
    .filter((entry) => entry.dueKey >= localNowKey && entry.dueKey <= localWindowEndKey)
    .sort((left, right) => left.dueKey.localeCompare(right.dueKey))
    .slice(0, 5)
    .map((entry) => formatNotificationTaskLine(entry.task));
  const recentCompleted = buildHistoryFeed(tasks)
    .filter((entry) => entry.type === "completed" && (entry.at || 0) >= nowTimestamp - summaryWindowMs)
    .slice(0, 5)
    .map((entry) => `${entry.taskName} · ${formatDateTimeInTimeZone(entry.at, timeZone)}`);
  const recentSkipped = buildHistoryFeed(tasks)
    .filter((entry) => entry.type === "skipped" && (entry.at || 0) >= nowTimestamp - summaryWindowMs)
    .slice(0, 5)
    .map((entry) => `${entry.taskName} · ${formatDateTimeInTimeZone(entry.at, timeZone)}`);
  const recurringProgress = buildRecurringProgressItems(tasks, localToday).slice(0, 6);
  const treeSummary = buildTreeSummary(store, timeZone);
  const widgetHighlights = buildWidgetHighlights(store?.widgets, now, timeZone).slice(0, 4);
  const sections = [];

  if (summaryConfig.include?.overdue) {
    sections.push({ title: "Overdue tasks", items: overdueTasks });
  }
  if (summaryConfig.include?.dueSoon) {
    sections.push({
      title: summaryConfig.frequency === "weekly" ? "Due in the next 7 days" : "Due in the next 24 hours",
      items: dueSoonTasks
    });
  }
  if (summaryConfig.include?.completed) {
    sections.push({ title: "Recently completed", items: recentCompleted });
    sections.push({ title: "Recently skipped", items: recentSkipped });
  }
  if (summaryConfig.include?.recurringProgress) {
    sections.push({ title: "Recurring progress", items: recurringProgress });
  }
  if (summaryConfig.include?.treePoints) {
    sections.push({ title: "Tree and points", items: treeSummary });
  }
  if (summaryConfig.include?.widgetHighlights) {
    sections.push({ title: "Widget highlights", items: widgetHighlights });
  }

  return {
    subject,
    recipientEmail,
    enabled: summaryConfig.enabled === true,
    scheduleLabel: buildNotificationScheduleLabel(summaryConfig, { includeTimezone: true }),
    sections: sections.filter((section) => section.items.length > 0),
    summaryKey: buildEmailSummaryKey(summaryConfig, now)
  };
}

export function renderEmailSummaryBodyHtml(preview) {
  const sectionsHtml = preview.sections.length > 0
    ? preview.sections.map((section) => `
      <section style="margin: 0 0 20px;">
        <h2 style="margin: 0 0 10px; font-size: 18px; color: #253243;">${escapeHtml(section.title)}</h2>
        <ul style="margin: 0; padding-left: 20px; color: #4f637a; line-height: 1.55;">
          ${section.items.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    `).join("")
    : `<p style="margin: 0; color: #4f637a;">No matching content yet. As tasks, widgets, and tree progress change, this summary will fill in automatically.</p>`;

  return `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f5efe4; color: #253243; font-family: Georgia, 'Times New Roman', serif;">
    <main style="max-width: 720px; margin: 0 auto; background: #fffaf3; border: 1px solid rgba(37, 50, 67, 0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(37, 50, 67, 0.12);">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #e57b4b;">Lifetree summary</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #253243;">${escapeHtml(preview.subject)}</h1>
      <p style="margin: 0 0 24px; color: #4f637a;">${escapeHtml(preview.scheduleLabel)}${preview.recipientEmail ? ` · Sent to ${escapeHtml(preview.recipientEmail)}` : ""}</p>
      ${sectionsHtml}
      <p style="margin: 24px 0 0; color: #4f637a;">Open Lifetree: <a href="${LIFETREE_APP_URL}" style="color: #e57b4b;">${LIFETREE_APP_URL}</a></p>
    </main>
  </body>
</html>`;
}

export function renderEmailSummaryBodyText(preview) {
  const lines = [preview.subject, preview.scheduleLabel];
  if (preview.recipientEmail) {
    lines.push(`Sent to ${preview.recipientEmail}`);
  }
  lines.push("");
  if (preview.sections.length === 0) {
    lines.push("No matching content yet. As tasks, widgets, and tree progress change, this summary will fill in automatically.");
  } else {
    for (const section of preview.sections) {
      lines.push(section.title);
      lines.push(...section.items.map((item) => `- ${item}`));
      lines.push("");
    }
  }
  lines.push(`Open Lifetree: ${LIFETREE_APP_URL}`);
  return lines.join("\n").trim();
}

export function buildNotificationScheduleLabel(summaryConfig, { includeTimezone = false } = {}) {
  const normalizedTime = normalizeNotificationTime(summaryConfig?.sendTime);
  const timeCopy = formatTimeLabel(normalizedTime);
  const timezone = normalizeNotificationTimezone(summaryConfig?.timezone, DEFAULT_NOTIFICATION_TIMEZONE);
  if (summaryConfig?.frequency === "weekly") {
    return `Weekly · ${WEEKDAY_LABELS[Number(summaryConfig?.weekday) || 0]} at ${timeCopy}${includeTimezone ? ` · ${timezone}` : ""}`;
  }
  return `Daily · ${timeCopy}${includeTimezone ? ` · ${timezone}` : ""}`;
}

export function buildEmailSummaryKey(summaryConfig, now = new Date()) {
  const timeZone = normalizeNotificationTimezone(summaryConfig?.timezone, DEFAULT_NOTIFICATION_TIMEZONE);
  const localDate = getZonedDateString(now, timeZone);
  if (summaryConfig?.frequency === "weekly") {
    const weekdayIndex = getZonedWeekday(now, timeZone);
    return `weekly:${shiftDateString(localDate, -weekdayIndex)}`;
  }
  return `daily:${localDate}`;
}

export function shouldEmailSummarySendNow(emailConfig, now = new Date()) {
  const summaries = emailConfig?.summaries || {};
  if (summaries.enabled !== true) {
    return { due: false, summaryKey: "", reason: "disabled" };
  }
  const timeZone = normalizeNotificationTimezone(summaries.timezone, DEFAULT_NOTIFICATION_TIMEZONE);
  const localTime = getZonedTimeString(now, timeZone);
  const sendTime = normalizeNotificationTime(summaries.sendTime);
  if (localTime < sendTime) {
    return { due: false, summaryKey: buildEmailSummaryKey(summaries, now), reason: "not-yet" };
  }
  if (summaries.frequency === "weekly" && getZonedWeekday(now, timeZone) !== (Number(summaries.weekday) || 0)) {
    return { due: false, summaryKey: buildEmailSummaryKey(summaries, now), reason: "weekday-mismatch" };
  }

  const summaryKey = buildEmailSummaryKey(summaries, now);
  const alreadySent = (Array.isArray(emailConfig?.history) ? emailConfig.history : []).some((entry) => (
    entry?.status === "sent" && entry?.summaryKey === summaryKey
  ));
  return {
    due: !alreadySent,
    summaryKey,
    reason: alreadySent ? "already-sent" : "due"
  };
}

function buildRecurringProgressItems(tasks, today) {
  const weekStart = shiftDateString(today, -weekdayFromDateString(today));
  const weekEnd = shiftDateString(weekStart, 6);
  const monthKey = today.slice(0, 7);
  const groups = new Map();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const kind = getRecurringGroupKind(task);
    const dueDate = task?.dueDate || task?.startDate || "";
    if (!kind || !dueDate || task?.archived || task?.historyOnly) {
      continue;
    }
    if (task.status !== "open" && task.status !== "done" && task.status !== "skipped") {
      continue;
    }
    if (kind === "daily" && dueDate !== today) {
      continue;
    }
    if (kind === "weekly" && (dueDate < weekStart || dueDate > weekEnd)) {
      continue;
    }
    if (kind === "monthly" && !dueDate.startsWith(monthKey)) {
      continue;
    }

    const signature = `${kind}:${task?.linkedSeries?.groupId || task?.templateId || task?.ownerTaskKey || task?.name || task?.id || dueDate}`;
    const group = groups.get(signature) || {
      kind,
      label: task.name || "Recurring task",
      total: 0,
      completed: 0
    };
    group.total += 1;
    if (task.status === "done") {
      group.completed += 1;
    }
    groups.set(signature, group);
  }

  return Array.from(groups.values())
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label))
    .map((group) => `${RECURRING_GROUP_LABELS[group.kind]}: ${group.label} · ${group.completed}/${group.total}`);
}

function buildTreeSummary(store) {
  const pointLedger = Array.isArray(store?.pointLedger) ? store.pointLedger : [];
  const treeState = store?.treeState || {};
  const categories = buildCategoryList(store, pointLedger);
  const categoryMap = new Map(categories.map((category) => [category.key, category]));
  const pointSummary = buildPointSummary(pointLedger);
  const treeDisplayState = buildFruitDisplayState({
    pointLedger,
    treeState,
    categories,
    resolveCategorySnapshot: (categoryKey) => resolveCategorySnapshot(categoryMap, pointLedger, categoryKey)
  });
  return [
    `${formatPointsLabel(pointSummary.totalPoints || 0)} banked reward points`,
    `${formatPointsLabel(treeDisplayState.growingPoints || 0)} growing on the tree`,
    `${treeDisplayState.ripeFruitCount || 0} ripe fruit ready now`
  ];
}

function buildWidgetHighlights(widgets, now, timeZone) {
  return (Array.isArray(widgets) ? widgets : []).map((widget) => {
    if (widget?.type === "energy") {
      const entries = Array.isArray(widget?.data?.entries) ? widget.data.entries : [];
      const latest = entries[entries.length - 1];
      return latest ? `Energy: ${latest.level}/5 at ${formatDateTimeInTimeZone(latest.at, timeZone)}` : "Energy: no recent votes";
    }
    if (widget?.type === "workout") {
      const workouts = Array.isArray(widget?.data?.workoutEntries) ? widget.data.workoutEntries : [];
      const latestWorkout = workouts[workouts.length - 1];
      const calorieCopy = `${sumWorkoutCaloriesForCurrentWeek(workouts, now, timeZone)} cal this week`;
      return latestWorkout
        ? `Workout Coach: ${latestWorkout.workoutType || "Workout"} at ${formatDateTimeInTimeZone(latestWorkout.at, timeZone)} · ${calorieCopy}`
        : `Workout Coach: ${calorieCopy}`;
    }
    return `${widget?.type || "Widget"} is active`;
  });
}

function getNotificationTaskDueKey(task) {
  const dueDate = task?.dueDate || task?.startDate || "";
  if (!dueDate) {
    return "";
  }
  const timeOfDay = task?.timeOfDay || "23:59";
  return `${dueDate}T${timeOfDay}`;
}

function formatNotificationTaskLine(task) {
  const dueDate = task?.dueDate || task?.startDate || "";
  const timeOfDay = task?.timeOfDay || "23:59";
  const recurringGroup = getRecurringGroupKind(task);
  const recurringLabel = recurringGroup ? ` · ${capitalizeWord(recurringGroup)}` : "";
  return `${task?.name || "Task"}${recurringLabel} · ${formatTaskDueLabel(dueDate, timeOfDay)}`;
}

function getRecurringGroupKind(task) {
  const recurrenceType = task?.recurrence?.type === "generated"
    ? task?.recurrence?.sourceType || ""
    : task?.recurrence?.type || "";
  if (recurrenceType === "daily") {
    return "daily";
  }
  if (recurrenceType === "weekly") {
    return "weekly";
  }
  if (recurrenceType === "monthly-date" || recurrenceType === "monthly-weekday") {
    return "monthly";
  }
  return "";
}

function buildCategoryList(store, pointLedger) {
  const categoryMap = new Map(BASE_CATEGORIES.map((category) => [category.key, { ...category }]));
  for (const category of Array.isArray(store?.categories) ? store.categories : []) {
    if (category?.key) {
      categoryMap.set(category.key, {
        key: category.key,
        label: category.label || category.key,
        color: category.color || "#7dbf74",
        active: category.active !== false,
        builtin: category.builtin === true
      });
    }
  }
  for (const entry of Array.isArray(pointLedger) ? pointLedger : []) {
    if (entry?.categoryKey && !categoryMap.has(entry.categoryKey)) {
      categoryMap.set(entry.categoryKey, {
        key: entry.categoryKey,
        label: entry.categoryLabel || entry.categoryKey,
        color: entry.categoryColor || "#7dbf74",
        active: true,
        builtin: false
      });
    }
  }
  return Array.from(categoryMap.values());
}

function resolveCategorySnapshot(categoryMap, pointLedger, categoryKey) {
  if (categoryMap.has(categoryKey)) {
    return categoryMap.get(categoryKey);
  }
  const matchingEntry = (Array.isArray(pointLedger) ? pointLedger : []).find((entry) => entry?.categoryKey === categoryKey);
  if (matchingEntry) {
    return {
      key: categoryKey,
      label: matchingEntry.categoryLabel || categoryKey,
      color: matchingEntry.categoryColor || "#7dbf74",
      active: true,
      builtin: false
    };
  }
  return {
    key: categoryKey || "productivity",
    label: capitalizeWord(categoryKey || "productivity"),
    color: "#7dbf74",
    active: true,
    builtin: false
  };
}

function sumWorkoutCaloriesForCurrentWeek(entries, now, timeZone) {
  const today = getZonedDateString(now, timeZone);
  const weekStart = shiftDateString(today, -weekdayFromDateString(today));
  const weekEnd = shiftDateString(weekStart, 6);
  return (Array.isArray(entries) ? entries : []).reduce((sum, entry) => {
    const entryDate = entry?.at ? getZonedDateString(new Date(entry.at), timeZone) : "";
    if (!entryDate || entryDate < weekStart || entryDate > weekEnd) {
      return sum;
    }
    const calories = Number(entry?.caloriesBurned);
    return sum + (Number.isFinite(calories) && calories > 0 ? Math.round(calories) : 0);
  }, 0);
}

function formatTaskDueLabel(dateString, timeString) {
  const parsed = new Date(`${dateString}T${timeString || "23:59"}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `${dateString} ${timeString || "23:59"}`.trim();
  }
  return `${parsed.toLocaleDateString([], { month: "short", day: "numeric" })} at ${parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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
  }).format(value);
}

function formatTimeLabel(value) {
  const [hours, minutes] = normalizeNotificationTime(value).split(":").map((part) => Number(part));
  return new Date(2000, 0, 1, hours, minutes, 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getZonedDateString(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function getZonedTimeString(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return formatter.format(date);
}

function getZonedDateTimeKey(date, timeZone) {
  return `${getZonedDateString(date, timeZone)}T${getZonedTimeString(date, timeZone)}`;
}

function getZonedWeekday(date, timeZone) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long"
  }).format(date);
  return WEEKDAY_LABELS.indexOf(label);
}

function shiftDateString(dateString, days) {
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toDateString(parsed);
}

function weekdayFromDateString(dateString) {
  const parsed = new Date(`${dateString}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getUTCDay();
}

function capitalizeWord(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
