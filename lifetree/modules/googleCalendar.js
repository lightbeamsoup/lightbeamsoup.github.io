export const GOOGLE_CALENDAR_INTEGRATION_SCHEMA_VERSION = 1;
export const DEFAULT_LIFETREE_CALENDAR_SUMMARY = "Lifetree";
const MAX_PENDING_GOOGLE_CALENDAR_DELETIONS = 200;
const GOOGLE_CALENDAR_PENDING_DELETION_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;

function normalizeGoogleCalendarPendingDeletion(value, now = Date.now()) {
  const source = value && typeof value === "object" ? value : {};
  const eventId = typeof source.eventId === "string" ? source.eventId.trim() : "";
  const calendarId = typeof source.calendarId === "string" ? source.calendarId.trim() : "";
  const deletedAt = typeof source.deletedAt === "number" ? source.deletedAt : 0;
  if (!eventId || deletedAt <= 0 || deletedAt < now - GOOGLE_CALENDAR_PENDING_DELETION_RETENTION_MS) {
    return null;
  }
  return {
    id: typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : `${calendarId || "lifetree"}:${eventId}`,
    calendarId,
    eventId,
    taskId: typeof source.taskId === "string" ? source.taskId.trim() : "",
    deletedAt,
    kind: source.kind === "series" ? "series" : "task"
  };
}

function normalizeGoogleCalendarPendingDeletions(value, now = Date.now()) {
  const merged = new Map();
  for (const entry of Array.isArray(value) ? value : []) {
    const normalized = normalizeGoogleCalendarPendingDeletion(entry, now);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.calendarId}|${normalized.eventId}`;
    const existing = merged.get(key);
    if (!existing || normalized.deletedAt >= existing.deletedAt) {
      merged.set(key, normalized);
    }
  }
  return Array.from(merged.values())
    .sort((left, right) => right.deletedAt - left.deletedAt)
    .slice(0, MAX_PENDING_GOOGLE_CALENDAR_DELETIONS);
}

function mergeGoogleCalendarPendingDeletions(localValue, remoteValue) {
  return normalizeGoogleCalendarPendingDeletions([
    ...normalizeGoogleCalendarPendingDeletions(remoteValue),
    ...normalizeGoogleCalendarPendingDeletions(localValue)
  ]);
}

export function normalizeGoogleCalendarIntegration(value) {
  const source = value && typeof value === "object" ? value : {};
  const lastCalendarSyncStatus = String(source.lastCalendarSyncStatus || "").trim().toLowerCase();
  return {
    connected: source.connected === true || Boolean(source.calendarId),
    calendarId: typeof source.calendarId === "string" ? source.calendarId : "",
    calendarSummary: typeof source.calendarSummary === "string" && source.calendarSummary.trim()
      ? source.calendarSummary.trim()
      : DEFAULT_LIFETREE_CALENDAR_SUMMARY,
    calendarTimeZone: typeof source.calendarTimeZone === "string" ? source.calendarTimeZone.trim() : "",
    lastCalendarSyncAt: typeof source.lastCalendarSyncAt === "number" ? source.lastCalendarSyncAt : 0,
    lastCalendarSyncStatus: lastCalendarSyncStatus === "success" || lastCalendarSyncStatus === "error"
      ? lastCalendarSyncStatus
      : "idle",
    lastCalendarSyncMessage: typeof source.lastCalendarSyncMessage === "string" ? source.lastCalendarSyncMessage.trim() : "",
    lastCalendarSyncToken: typeof source.lastCalendarSyncToken === "string" ? source.lastCalendarSyncToken : "",
    pendingDeletions: normalizeGoogleCalendarPendingDeletions(source.pendingDeletions),
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : 0,
    schemaVersion: GOOGLE_CALENDAR_INTEGRATION_SCHEMA_VERSION
  };
}

export function normalizeIntegrations(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    googleCalendar: normalizeGoogleCalendarIntegration(source.googleCalendar)
  };
}

export function choosePreferredGoogleCalendarIntegration(localValue, remoteValue) {
  const local = normalizeGoogleCalendarIntegration(localValue);
  const remote = normalizeGoogleCalendarIntegration(remoteValue);
  const pendingDeletions = mergeGoogleCalendarPendingDeletions(local.pendingDeletions, remote.pendingDeletions);

  if ((local.updatedAt || 0) !== (remote.updatedAt || 0)) {
    const winner = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
    return {
      ...winner,
      pendingDeletions
    };
  }
  if (!!local.calendarId !== !!remote.calendarId) {
    const winner = local.calendarId ? local : remote;
    return {
      ...winner,
      pendingDeletions
    };
  }
  if ((local.lastCalendarSyncAt || 0) !== (remote.lastCalendarSyncAt || 0)) {
    const winner = (local.lastCalendarSyncAt || 0) >= (remote.lastCalendarSyncAt || 0) ? local : remote;
    return {
      ...winner,
      pendingDeletions
    };
  }
  return {
    ...local,
    pendingDeletions
  };
}

export function choosePreferredIntegrations(localValue, remoteValue) {
  const local = normalizeIntegrations(localValue);
  const remote = normalizeIntegrations(remoteValue);
  return {
    googleCalendar: choosePreferredGoogleCalendarIntegration(local.googleCalendar, remote.googleCalendar)
  };
}
