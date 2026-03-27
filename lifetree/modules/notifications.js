export const DEFAULT_EMAIL_SUMMARY_SEND_TIME = "20:00";
export const DEFAULT_EMAIL_SUMMARY_FREQUENCY = "daily";
export const DEFAULT_EMAIL_SUMMARY_WEEKDAY = 0;
export const MAX_NOTIFICATION_HISTORY_ENTRIES = 20;

export function normalizeNotifications(value) {
  const email = value?.email && typeof value.email === "object" ? value.email : {};
  const summaries = normalizeEmailSummaryConfig(email.summaries);
  const history = normalizeEmailSummaryHistory(email.history);
  return {
    email: {
      recipientEmail: normalizeRecipientEmail(email.recipientEmail),
      summaries,
      history,
      updatedAt: Math.max(
        typeof email.updatedAt === "number" ? email.updatedAt : 0,
        summaries.updatedAt || 0,
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

export function normalizeRecipientEmail(value) {
  const candidate = String(value || "").trim().slice(0, 160);
  if (!candidate) {
    return "";
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

export function normalizeNotificationTime(value, fallback = DEFAULT_EMAIL_SUMMARY_SEND_TIME) {
  const candidate = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : fallback;
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
