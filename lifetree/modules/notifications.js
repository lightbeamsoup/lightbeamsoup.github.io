export const DEFAULT_EMAIL_SUMMARY_SEND_TIME = "20:00";
export const DEFAULT_EMAIL_SUMMARY_FREQUENCY = "daily";
export const DEFAULT_EMAIL_SUMMARY_WEEKDAY = 0;
export const DEFAULT_EMAIL_REMINDER_AGENDA_TIME = "07:00";
export const DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES = 15;
export const MAX_NOTIFICATION_HISTORY_ENTRIES = 20;
export const DEFAULT_NOTIFICATION_TIMEZONE = "America/Los_Angeles";

export function normalizeNotifications(value) {
  const email = value?.email && typeof value.email === "object" ? value.email : {};
  const summaries = normalizeEmailSummaryConfig(email.summaries);
  const reminders = normalizeEmailReminderConfig(email.reminders);
  const history = normalizeEmailSummaryHistory(email.history);
  return {
    email: {
      recipientEmail: normalizeRecipientEmail(email.recipientEmail),
      summaries,
      reminders,
      history,
      updatedAt: Math.max(
        typeof email.updatedAt === "number" ? email.updatedAt : 0,
        summaries.updatedAt || 0,
        reminders.updatedAt || 0,
        history[0]?.at || 0
      )
    }
  };
}

export function choosePreferredNotifications(localValue, remoteValue) {
  const local = normalizeNotifications(localValue);
  const remote = normalizeNotifications(remoteValue);
  const preferredEmail = (local.email.updatedAt || 0) >= (remote.email.updatedAt || 0)
    ? local.email
    : remote.email;

  return {
    email: {
      recipientEmail: preferredEmail.recipientEmail,
      summaries: preferredEmail.summaries,
      reminders: preferredEmail.reminders,
      history: mergeNotificationHistory(local.email.history, remote.email.history),
      updatedAt: Math.max(local.email.updatedAt || 0, remote.email.updatedAt || 0)
    }
  };
}

export function normalizeEmailSummaryConfig(value) {
  const include = normalizeEmailSummaryInclude(value?.include);
  return {
    enabled: value?.enabled === true,
    frequency: value?.frequency === "weekly" ? "weekly" : DEFAULT_EMAIL_SUMMARY_FREQUENCY,
    sendTime: normalizeNotificationTime(value?.sendTime, DEFAULT_EMAIL_SUMMARY_SEND_TIME),
    weekday: normalizeWeekday(value?.weekday, DEFAULT_EMAIL_SUMMARY_WEEKDAY),
    timezone: normalizeNotificationTimezone(value?.timezone),
    include,
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  };
}

export function normalizeEmailSummaryInclude(value) {
  return {
    overdue: value?.overdue !== false,
    dueSoon: value?.dueSoon !== false,
    completed: value?.completed !== false,
    recurringProgress: value?.recurringProgress !== false,
    treePoints: value?.treePoints !== false,
    widgetHighlights: value?.widgetHighlights !== false
  };
}

export function normalizeEmailReminderConfig(value) {
  return {
    enabled: value?.enabled === true,
    dueSoonEnabled: value?.dueSoonEnabled !== false,
    overdueEnabled: value?.overdueEnabled !== false,
    dailyAgendaEnabled: value?.dailyAgendaEnabled === true,
    dailyAgendaTime: normalizeNotificationTime(value?.dailyAgendaTime, DEFAULT_EMAIL_REMINDER_AGENDA_TIME),
    quietHoursEnabled: value?.quietHoursEnabled === true,
    quietHoursStart: normalizeNotificationTime(value?.quietHoursStart, "21:00"),
    quietHoursEnd: normalizeNotificationTime(value?.quietHoursEnd, "07:00"),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  };
}

export function normalizeRecipientEmail(value) {
  const candidate = String(value || "").trim().slice(0, 160);
  if (!candidate) {
    return "";
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

export function normalizeReminderMinutes(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.round(parsed);
}

export function normalizeNotificationTime(value, fallback = DEFAULT_EMAIL_SUMMARY_SEND_TIME) {
  const candidate = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : fallback;
}

export function normalizeNotificationTimezone(value, fallback = getRuntimeNotificationTimezone()) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return fallback;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

export function normalizeWeekday(value, fallback = DEFAULT_EMAIL_SUMMARY_WEEKDAY) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    return fallback;
  }
  return parsed;
}

export function normalizeEmailSummaryHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      at: typeof entry.at === "number" ? entry.at : 0,
      status: entry.status === "error" ? "error" : "sent",
      recipientEmail: normalizeRecipientEmail(entry.recipientEmail),
      subject: typeof entry.subject === "string" ? entry.subject.slice(0, 200) : "",
      summaryKey: typeof entry.summaryKey === "string" ? entry.summaryKey.slice(0, 120) : ""
    }))
    .filter((entry) => entry.id && entry.at > 0)
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_NOTIFICATION_HISTORY_ENTRIES);
}

export function appendEmailSummaryHistoryEntry(existingEntries, nextEntry) {
  return normalizeEmailSummaryHistory([
    nextEntry,
    ...normalizeEmailSummaryHistory(existingEntries)
  ]);
}

function getRuntimeNotificationTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_NOTIFICATION_TIMEZONE;
  } catch {
    return DEFAULT_NOTIFICATION_TIMEZONE;
  }
}

function mergeNotificationHistory(localEntries, remoteEntries) {
  const mergedById = new Map();
  for (const entry of [...normalizeEmailSummaryHistory(localEntries), ...normalizeEmailSummaryHistory(remoteEntries)]) {
    const existing = mergedById.get(entry.id);
    if (!existing || (entry.at || 0) >= (existing.at || 0)) {
      mergedById.set(entry.id, entry);
    }
  }
  return Array.from(mergedById.values())
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_NOTIFICATION_HISTORY_ENTRIES);
}
