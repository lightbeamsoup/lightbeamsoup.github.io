export const GOOGLE_CALENDAR_INTEGRATION_SCHEMA_VERSION = 1;
export const DEFAULT_LIFETREE_CALENDAR_SUMMARY = "Lifetree";

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

  if ((local.updatedAt || 0) !== (remote.updatedAt || 0)) {
    return (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
  }
  if (!!local.calendarId !== !!remote.calendarId) {
    return local.calendarId ? local : remote;
  }
  if ((local.lastCalendarSyncAt || 0) !== (remote.lastCalendarSyncAt || 0)) {
    return (local.lastCalendarSyncAt || 0) >= (remote.lastCalendarSyncAt || 0) ? local : remote;
  }
  return local;
}

export function choosePreferredIntegrations(localValue, remoteValue) {
  const local = normalizeIntegrations(localValue);
  const remote = normalizeIntegrations(remoteValue);
  return {
    googleCalendar: choosePreferredGoogleCalendarIntegration(local.googleCalendar, remote.googleCalendar)
  };
}
