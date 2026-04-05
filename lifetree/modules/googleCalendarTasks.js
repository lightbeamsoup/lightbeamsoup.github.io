import { normalizeGoogleCalendarIntegration } from "./googleCalendar.js";

export const GOOGLE_CALENDAR_TASK_SCHEMA_VERSION = 1;
export const GOOGLE_CALENDAR_TIME_ZONE_MODE_FLOATING = "floating-local";
export const GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED = "fixed";
const GOOGLE_CALENDAR_EVENT_PAYLOAD_VERSION = 2;

const DEFAULT_LINK_SOURCE = "lifetree";
const GOOGLE_WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const GOOGLE_BYSETPOS_BY_ORDINAL = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  last: -1
};
const ORDINAL_BY_GOOGLE_BYSETPOS = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last"
};
const DURATION_MINUTES_BY_LENGTH = {
  "very-short": 15,
  short: 30,
  medium: 60,
  long: 90,
  "very-long": 120
};

export function normalizeGoogleCalendarTaskLink(value, { calendarId = "" } = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    calendarId: typeof source.calendarId === "string" ? source.calendarId : String(calendarId || ""),
    eventId: typeof source.eventId === "string" ? source.eventId : "",
    recurringEventId: typeof source.recurringEventId === "string" ? source.recurringEventId : "",
    originalStartDate: typeof source.originalStartDate === "string" ? source.originalStartDate : "",
    originalTimeOfDay: typeof source.originalTimeOfDay === "string" ? source.originalTimeOfDay : "",
    source: typeof source.source === "string" && source.source.trim()
      ? source.source.trim()
      : DEFAULT_LINK_SOURCE,
    linkedAt: typeof source.linkedAt === "number" ? source.linkedAt : 0,
    lastSeenGoogleUpdatedAt: typeof source.lastSeenGoogleUpdatedAt === "string" ? source.lastSeenGoogleUpdatedAt : "",
    scheduleFingerprint: typeof source.scheduleFingerprint === "string" ? source.scheduleFingerprint : "",
    statusMirroredAt: typeof source.statusMirroredAt === "number" ? source.statusMirroredAt : 0,
    schemaVersion: GOOGLE_CALENDAR_TASK_SCHEMA_VERSION
  };
}

export function isGoogleCalendarSchedulableTask(task) {
  if (!task || typeof task !== "object") {
    return false;
  }
  if (task.archived === true || task.historyOnly === true) {
    return false;
  }
  if (!task.dueDate || typeof task.dueDate !== "string") {
    return false;
  }
  const recurrenceType = String(task?.recurrence?.type || "none");
  if (recurrenceType === "generated" || recurrenceType === "archived-series") {
    return false;
  }
  if (task.templateId && recurrenceType !== "none") {
    return false;
  }
  if (recurrenceType !== "none") {
    return true;
  }
  return task.status === "open";
}

function isGoogleCalendarStatusMirrorableTask(task) {
  if (!task || typeof task !== "object") {
    return false;
  }
  if (task.archived === true || task.historyOnly === true) {
    return false;
  }
  if (!task.dueDate || typeof task.dueDate !== "string") {
    return false;
  }
  const recurrenceType = String(task?.recurrence?.type || "none");
  if (recurrenceType === "generated" || recurrenceType === "archived-series") {
    return false;
  }
  if (task.templateId && recurrenceType !== "none") {
    return false;
  }
  if (recurrenceType !== "none") {
    return false;
  }
  const googleCalendar = normalizeGoogleCalendarTaskLink(task.googleCalendar);
  return Boolean(googleCalendar.eventId);
}

export function buildGoogleCalendarTaskScheduleFingerprint(task) {
  const userTimeZone = String(task?.userTimeZone || "").trim();
  const timeZoneMode = resolveGoogleCalendarTaskTimeZoneMode(task);
  const effectiveTimeZone = resolveGoogleCalendarTaskTimeZone(task, userTimeZone);
  return JSON.stringify(sortObjectKeys({
    eventPayloadVersion: GOOGLE_CALENDAR_EVENT_PAYLOAD_VERSION,
    name: String(task?.name || ""),
    details: String(task?.details || ""),
    startDate: String(task?.startDate || ""),
    dueDate: String(task?.dueDate || ""),
    timeOfDay: String(task?.timeOfDay || ""),
    length: String(task?.length || "medium"),
    recurrence: normalizeExportRecurrence(task?.recurrence),
    reminders: normalizeExportReminders(task?.reminders),
    importance: String(task?.importance || "medium"),
    categoryKey: String(task?.categoryKey || ""),
    lateGraceMinutes: Number.isFinite(Number(task?.lateGraceMinutes)) ? Number(task.lateGraceMinutes) : 0,
    ownerWidgetType: String(task?.ownerWidgetType || ""),
    widgetTaskKind: String(task?.widgetTaskKind || ""),
    timeZoneMode,
    timeZone: effectiveTimeZone,
    location: resolveGoogleCalendarTaskLocation(task)
  }));
}

export function buildGoogleCalendarScheduleSyncRequest(store, googleCalendarIntegration, { userTimeZone = "" } = {}) {
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const calendar = normalizeGoogleCalendarIntegration(googleCalendarIntegration);
  const calendarId = calendar.calendarId;
  const calendarSummary = calendar.calendarSummary || "Lifetree";
  const calendarTimeZone = calendar.calendarTimeZone;
  const eligibleTasks = tasks.filter((task) => isGoogleCalendarSchedulableTask(task) || isGoogleCalendarStatusMirrorableTask(task));
  const syncTasks = eligibleTasks
    .map((task) => {
      const googleCalendar = normalizeGoogleCalendarTaskLink(task.googleCalendar, { calendarId });
      const scheduleFingerprint = buildGoogleCalendarTaskScheduleFingerprint({
        ...task,
        userTimeZone
      });
      const timeZoneMode = resolveGoogleCalendarTaskTimeZoneMode({
        ...task,
        userTimeZone
      });
      const instanceStatusChanges = String(task?.recurrence?.type || "none") !== "none"
        ? buildGoogleCalendarRecurringInstanceStatusChanges(tasks, task, calendarId, userTimeZone)
        : [];
      const statusMirrorState = getGoogleCalendarTaskStatusMirrorState(task);
      const statusMirrorVersion = getGoogleCalendarTaskStatusMirrorVersion(task);
      const needsRemoteCheck = Boolean(googleCalendar.eventId);
      const needsPush = !googleCalendar.eventId
        || googleCalendar.calendarId !== calendarId
        || googleCalendar.scheduleFingerprint !== scheduleFingerprint;
      const needsStatusPush = Boolean(googleCalendar.eventId) && statusMirrorVersion > (googleCalendar.statusMirroredAt || 0);
      return {
        needsRemoteCheck,
        needsPush,
        needsStatusPush,
        taskId: task.id,
        name: String(task.name || ""),
        details: String(task.details || ""),
        startDate: String(task.startDate || ""),
        dueDate: String(task.dueDate || ""),
        timeOfDay: String(task.timeOfDay || ""),
        length: String(task.length || "medium"),
        recurrence: normalizeExportRecurrence(task.recurrence),
        reminders: normalizeExportReminders(task.reminders),
        importance: String(task.importance || "medium"),
        categoryKey: String(task.categoryKey || ""),
        lateGraceMinutes: Number.isFinite(Number(task.lateGraceMinutes)) ? Number(task.lateGraceMinutes) : 0,
        ownerWidgetType: String(task.ownerWidgetType || ""),
        ownerTaskKey: String(task.ownerTaskKey || ""),
        widgetTaskKind: String(task.widgetTaskKind || ""),
        widgetTaskMeta: normalizeExportWidgetTaskMeta(task.widgetTaskMeta),
        userTimeZone: String(userTimeZone || "").trim(),
        timeZoneMode,
        googleCalendar,
        scheduleFingerprint,
        statusMirrorVersion,
        statusMirrorLifecycleType: statusMirrorState.lifecycleType,
        instanceStatusChanges
      };
    })
    .filter((task) => task.needsPush || task.needsStatusPush || task.needsRemoteCheck);

  return {
    calendarId,
    calendarSummary,
    calendarTimeZone,
    userTimeZone: String(userTimeZone || "").trim(),
    totalEligibleTasks: eligibleTasks.length,
    pendingDeletions: Array.isArray(calendar.pendingDeletions) ? calendar.pendingDeletions : [],
    tasks: syncTasks
  };
}

export function normalizeGoogleCalendarSyncTask(value, { calendarId = "", calendarTimeZone = "", userTimeZone = "" } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const recurrence = normalizeExportRecurrence(source.recurrence);
  const widgetTaskMeta = normalizeExportWidgetTaskMeta(source.widgetTaskMeta);
  const normalized = {
    needsRemoteCheck: source.needsRemoteCheck === true,
    needsPush: source.needsPush === true,
    needsStatusPush: source.needsStatusPush === true,
    taskId: typeof source.taskId === "string" ? source.taskId : "",
    name: typeof source.name === "string" ? source.name.trim() : "",
    details: typeof source.details === "string" ? source.details : "",
    startDate: typeof source.startDate === "string" ? source.startDate : "",
    dueDate: typeof source.dueDate === "string" ? source.dueDate : "",
    timeOfDay: typeof source.timeOfDay === "string" ? source.timeOfDay : "",
    length: typeof source.length === "string" ? source.length : "medium",
    recurrence,
    reminders: normalizeExportReminders(source.reminders),
    importance: typeof source.importance === "string" ? source.importance : "medium",
    categoryKey: typeof source.categoryKey === "string" ? source.categoryKey : "",
    lateGraceMinutes: Number.isFinite(Number(source.lateGraceMinutes)) ? Number(source.lateGraceMinutes) : 0,
    ownerWidgetType: typeof source.ownerWidgetType === "string" ? source.ownerWidgetType : "",
    ownerTaskKey: typeof source.ownerTaskKey === "string" ? source.ownerTaskKey : "",
    widgetTaskKind: typeof source.widgetTaskKind === "string" ? source.widgetTaskKind : "",
    widgetTaskMeta,
    googleCalendar: normalizeGoogleCalendarTaskLink(source.googleCalendar, { calendarId }),
    userTimeZone: String(source.userTimeZone || userTimeZone || "").trim(),
    status: typeof source.status === "string" ? source.status : "open",
    history: Array.isArray(source.history) ? source.history : [],
    statusMirrorLifecycleType: typeof source.statusMirrorLifecycleType === "string" ? source.statusMirrorLifecycleType : "",
    statusMirrorVersion: Number.isFinite(Number(source.statusMirrorVersion)) ? Number(source.statusMirrorVersion) : 0,
    scheduleFingerprint: typeof source.scheduleFingerprint === "string"
      ? source.scheduleFingerprint
      : buildGoogleCalendarTaskScheduleFingerprint(source)
  };
  normalized.timeZoneMode = resolveGoogleCalendarTaskTimeZoneMode(normalized);
  normalized.timeZone = resolveGoogleCalendarTaskTimeZone(normalized, normalized.userTimeZone || calendarTimeZone);
  return normalized;
}

export function getGoogleCalendarEventTaskId(event) {
  const privateProps = event?.extendedProperties?.private;
  if (!privateProps || typeof privateProps !== "object") {
    return "";
  }
  return typeof privateProps.lifetreeTaskId === "string" ? privateProps.lifetreeTaskId : "";
}

function getGoogleCalendarEventUpdatedAt(event) {
  const parsed = Date.parse(String(event?.updated || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isGoogleCalendarRecurringInstanceOverrideEvent(event) {
  return typeof event?.recurringEventId === "string" && event.recurringEventId.trim().length > 0;
}

export function isGoogleCalendarDeletedEvent(event) {
  return String(event?.status || "").trim().toLowerCase() === "cancelled";
}

export function chooseCanonicalGoogleCalendarTaskEvent(events, task, linkedEventId = "") {
  const uniqueEvents = Array.from(new Map(
    (Array.isArray(events) ? events : [])
      .filter((event) => event && typeof event.id === "string" && event.id)
      .map((event) => [event.id, event])
  ).values());
  if (uniqueEvents.length === 0) {
    return null;
  }
  const recurrenceType = String(task?.recurrence?.type || "none");
  const isRecurringTask = recurrenceType !== "none";
  const preferred = [...uniqueEvents].sort((left, right) => {
    if (linkedEventId) {
      if (left.id === linkedEventId && right.id !== linkedEventId) {
        return -1;
      }
      if (right.id === linkedEventId && left.id !== linkedEventId) {
        return 1;
      }
    }
    if (isRecurringTask) {
      const leftIsMaster = !isGoogleCalendarRecurringInstanceOverrideEvent(left);
      const rightIsMaster = !isGoogleCalendarRecurringInstanceOverrideEvent(right);
      if (leftIsMaster !== rightIsMaster) {
        return leftIsMaster ? -1 : 1;
      }
    }
    return getGoogleCalendarEventUpdatedAt(right) - getGoogleCalendarEventUpdatedAt(left);
  });
  return preferred[0] || null;
}

export function splitGoogleCalendarTaskEvents(events, task, linkedEventId = "") {
  const uniqueEvents = Array.from(new Map(
    (Array.isArray(events) ? events : [])
      .filter((event) => event && typeof event.id === "string" && event.id)
      .map((event) => [event.id, event])
  ).values());
  const canonicalEvent = chooseCanonicalGoogleCalendarTaskEvent(uniqueEvents, task, linkedEventId);
  const recurrenceType = String(task?.recurrence?.type || "none");
  const instanceOverrideEvents = recurrenceType !== "none"
    ? uniqueEvents.filter((event) => event?.id && event.id !== canonicalEvent?.id && isGoogleCalendarRecurringInstanceOverrideEvent(event))
    : [];
  const instanceOverrideIds = new Set(instanceOverrideEvents.map((event) => event.id));
  const duplicateEvents = canonicalEvent
    ? uniqueEvents.filter((event) => event?.id && event.id !== canonicalEvent.id && !instanceOverrideIds.has(event.id))
    : [];
  return {
    uniqueEvents,
    canonicalEvent,
    instanceOverrideEvents,
    duplicateEvents
  };
}

export function findOrphanedGoogleCalendarTaskEvents(events, tasks) {
  const taskIds = new Set(
    (Array.isArray(tasks) ? tasks : [])
      .map((task) => normalizeGoogleCalendarSyncTask(task))
      .map((task) => task.taskId)
      .filter(Boolean)
  );
  return Array.from(new Map(
    (Array.isArray(events) ? events : [])
      .filter((event) => event && typeof event.id === "string" && event.id)
      .filter((event) => {
        const taskId = getGoogleCalendarEventTaskId(event);
        return taskId && !taskIds.has(taskId);
      })
      .map((event) => [event.id, event])
  ).values());
}

export function buildGoogleCalendarEventPayload(task, { calendarTimeZone = "" } = {}) {
  const normalized = normalizeGoogleCalendarSyncTask(task, {
    calendarId: task?.googleCalendar?.calendarId || "",
    calendarTimeZone
  });
  const timeZone = normalized.timeZone || calendarTimeZone || "";
  const summary = normalized.name || "Untitled task";
  const description = buildGoogleCalendarEventDescription(normalized);
  const recurrence = buildGoogleCalendarRecurrence(normalized);
  const reminders = buildGoogleCalendarEventReminders(normalized);
  const startEnd = buildGoogleCalendarEventStartEnd(normalized, timeZone);
  const location = resolveGoogleCalendarTaskLocation(normalized);

  return {
    summary,
    description,
    ...(location ? { location } : {}),
    ...startEnd,
    ...(recurrence.length ? { recurrence } : {}),
    reminders,
    transparency: "opaque",
    visibility: "private",
    extendedProperties: {
      private: buildGoogleCalendarExtendedProperties(normalized)
    }
  };
}

export function buildGoogleCalendarTaskSchedulePatchFromEvent(event, { calendarTimeZone = "", userTimeZone = "" } = {}) {
  const start = parseGoogleCalendarEventStart(event, calendarTimeZone);
  const details = extractTaskDetailsFromGoogleDescription(event?.description);
  const recurrence = parseGoogleCalendarRecurrence(event?.recurrence);
  const reminders = parseGoogleCalendarEventReminders(event?.reminders);
  const privateProps = event?.extendedProperties?.private && typeof event.extendedProperties.private === "object"
    ? event.extendedProperties.private
    : {};
  const timeZoneMode = normalizeGoogleCalendarTimeZoneMode(privateProps.lifetreeTimeZoneMode);
  const widgetTimeZone = timeZoneMode === GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED
    && typeof start.timeZone === "string"
    && start.timeZone.trim()
    ? start.timeZone.trim()
    : "";
  const location = typeof event?.location === "string" ? event.location.trim() : "";
  const patch = {
    name: typeof event?.summary === "string" && event.summary.trim() ? event.summary.trim() : "Untitled task",
    details,
    startDate: start.startDate,
    dueDate: start.dueDate,
    timeOfDay: start.timeOfDay,
    recurrence,
    reminders,
    length: normalizeLengthValue(privateProps.lifetreeLength),
    importance: normalizeImportanceValue(privateProps.lifetreeImportance),
    categoryKey: typeof privateProps.lifetreeCategoryKey === "string" ? privateProps.lifetreeCategoryKey : "",
    lateGraceMinutes: normalizeNonNegativeNumber(privateProps.lifetreeLateGraceMinutes, 0),
    ownerWidgetType: typeof privateProps.lifetreeWidgetType === "string" ? privateProps.lifetreeWidgetType : "",
    widgetTaskKind: typeof privateProps.lifetreeWidgetTaskKind === "string" ? privateProps.lifetreeWidgetTaskKind : "",
    widgetTaskMeta: {
      ...(widgetTimeZone ? { timeZone: widgetTimeZone } : {}),
      ...(location ? { googleCalendarLocation: location } : {})
    },
    timeZoneMode
  };
  return {
    ...patch,
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint({
      ...patch,
      userTimeZone
    })
  };
}

function normalizeExportRecurrence(value) {
  const source = value && typeof value === "object" ? value : {};
  const recurrenceCount = source.count === null
    ? null
    : (Number.isFinite(Number(source.count)) ? Number(source.count) : null);
  return {
    type: typeof source.type === "string" ? source.type : "none",
    interval: Number.isFinite(Number(source.interval)) ? Number(source.interval) : 1,
    weekday: Number.isFinite(Number(source.weekday)) ? Number(source.weekday) : 0,
    day: Number.isFinite(Number(source.day)) ? Number(source.day) : 1,
    ordinal: typeof source.ordinal === "string" ? source.ordinal : "first",
    sourceType: typeof source.sourceType === "string" ? source.sourceType : "",
    endDate: typeof source.endDate === "string" ? source.endDate : "",
    count: recurrenceCount,
    forever: source.forever === true
  };
}

function normalizeExportReminders(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source.enabled === true,
    dueSoonMinutes: Number.isFinite(Number(source.dueSoonMinutes)) ? Number(source.dueSoonMinutes) : null,
    overdueMinutes: Number.isFinite(Number(source.overdueMinutes)) ? Number(source.overdueMinutes) : null
  };
}

function normalizeExportWidgetTaskMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  if (typeof value.timeZone === "string" && value.timeZone.trim()) {
    normalized.timeZone = value.timeZone.trim();
  }
  if (typeof value.timeZoneMode === "string" && value.timeZoneMode.trim()) {
    normalized.timeZoneMode = normalizeGoogleCalendarTimeZoneMode(value.timeZoneMode);
  }
  if (typeof value.location === "string" && value.location.trim()) {
    normalized.location = value.location.trim();
  }
  if (typeof value.googleCalendarLocation === "string" && value.googleCalendarLocation.trim()) {
    normalized.googleCalendarLocation = value.googleCalendarLocation.trim();
  }
  return normalized;
}

export function normalizeGoogleCalendarTimeZoneMode(value) {
  return value === GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED
    ? GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED
    : GOOGLE_CALENDAR_TIME_ZONE_MODE_FLOATING;
}

export function resolveGoogleCalendarTaskTimeZoneMode(task) {
  const configured = normalizeGoogleCalendarTimeZoneMode(task?.widgetTaskMeta?.timeZoneMode);
  if (configured === GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED || configured === GOOGLE_CALENDAR_TIME_ZONE_MODE_FLOATING) {
    if (task?.widgetTaskMeta && Object.prototype.hasOwnProperty.call(task.widgetTaskMeta, "timeZoneMode")) {
      return configured;
    }
  }
  const explicit = String(task?.widgetTaskMeta?.timeZone || "").trim();
  return explicit ? GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED : GOOGLE_CALENDAR_TIME_ZONE_MODE_FLOATING;
}

function resolveGoogleCalendarTaskTimeZone(task, fallbackTimeZone = "") {
  const explicit = String(task?.widgetTaskMeta?.timeZone || "").trim();
  if (resolveGoogleCalendarTaskTimeZoneMode(task) === GOOGLE_CALENDAR_TIME_ZONE_MODE_FIXED) {
    return explicit || String(fallbackTimeZone || "").trim();
  }
  return String(task?.userTimeZone || fallbackTimeZone || "").trim();
}

function resolveGoogleCalendarTaskLocation(task) {
  const explicit = String(task?.widgetTaskMeta?.googleCalendarLocation || "").trim();
  if (explicit) {
    return explicit;
  }
  return String(task?.widgetTaskMeta?.location || "").trim();
}

function buildGoogleCalendarEventDescription(task) {
  const parts = [];
  if (task.details) {
    parts.push(task.details.trim());
  }
  const statusLine = buildGoogleCalendarStatusDescription(task);
  const footer = [
    "Created by Lifetree.",
    statusLine,
    `Lifetree task ID: ${task.taskId}`,
    task.ownerWidgetType ? `Lifetree widget: ${humanizeWidgetLabel(task.ownerWidgetType)}` : ""
  ].filter(Boolean).join("\n");
  parts.push(footer);
  return parts.filter(Boolean).join("\n\n");
}

function humanizeWidgetLabel(widgetType) {
  if (widgetType === "travel") {
    return "Travel Buddy";
  }
  if (widgetType === "workout") {
    return "Workout Coach";
  }
  if (widgetType === "energy") {
    return "Energy";
  }
  return widgetType;
}

function buildGoogleCalendarExtendedProperties(task) {
  const statusState = getGoogleCalendarTaskStatusMirrorState(task);
  return {
    lifetreeTaskId: task.taskId,
    lifetreeTaskKind: task.recurrence.type === "none" ? "one-off" : "recurring-master",
    lifetreeWidgetType: String(task.ownerWidgetType || ""),
    lifetreeWidgetTaskKind: String(task.widgetTaskKind || ""),
    lifetreeCategoryKey: String(task.categoryKey || ""),
    lifetreeImportance: String(task.importance || "medium"),
    lifetreeLength: String(task.length || "medium"),
    lifetreeLateGraceMinutes: String(task.lateGraceMinutes || 0),
    lifetreeTimeZoneMode: resolveGoogleCalendarTaskTimeZoneMode(task),
    lifetreeEventTimeZone: String(task.timeZone || ""),
    lifetreeStatus: statusState.status,
    lifetreeStatusAt: statusState.changedAt > 0 ? String(statusState.changedAt) : "",
    lifetreeLifecycleType: statusState.lifecycleType,
    lifetreeSchemaVersion: String(GOOGLE_CALENDAR_TASK_SCHEMA_VERSION)
  };
}

function buildGoogleCalendarStatusDescription(task) {
  const statusState = getGoogleCalendarTaskStatusMirrorState(task);
  const displayTimeZone = resolveGoogleCalendarTaskTimeZone(task, task?.userTimeZone || "");
  if (statusState.lifecycleType === "completed") {
    return `Lifetree status: completed ${formatGoogleCalendarStatusTimestamp(statusState.changedAt, displayTimeZone)}`;
  }
  if (statusState.lifecycleType === "skipped") {
    return `Lifetree status: skipped ${formatGoogleCalendarStatusTimestamp(statusState.changedAt, displayTimeZone)}`;
  }
  if (statusState.lifecycleType === "reopened") {
    return `Lifetree status: open (restored ${formatGoogleCalendarStatusTimestamp(statusState.changedAt, displayTimeZone)})`;
  }
  return "";
}

function getGoogleCalendarTaskStatusMirrorState(task) {
  const explicitLifecycleType = typeof task?.statusMirrorLifecycleType === "string" ? task.statusMirrorLifecycleType : "";
  const explicitVersion = Number.isFinite(Number(task?.statusMirrorVersion)) ? Number(task.statusMirrorVersion) : 0;
  if (explicitLifecycleType === "completed" || explicitLifecycleType === "skipped" || explicitLifecycleType === "reopened") {
    return {
      status: explicitLifecycleType === "completed"
        ? "completed"
        : explicitLifecycleType === "skipped"
          ? "skipped"
          : "open",
      lifecycleType: explicitLifecycleType,
      changedAt: explicitVersion
    };
  }
  const latestLifecycle = getLatestGoogleCalendarLifecycleEntry(task);
  if (!latestLifecycle) {
    return {
      status: "open",
      lifecycleType: "",
      changedAt: 0
    };
  }
  if (latestLifecycle.type === "completed") {
    return {
      status: "completed",
      lifecycleType: "completed",
      changedAt: latestLifecycle.at || 0
    };
  }
  if (latestLifecycle.type === "skipped") {
    return {
      status: "skipped",
      lifecycleType: "skipped",
      changedAt: latestLifecycle.at || 0
    };
  }
  return {
    status: "open",
    lifecycleType: "reopened",
    changedAt: latestLifecycle.at || 0
  };
}

function getGoogleCalendarTaskStatusMirrorVersion(task) {
  return getGoogleCalendarTaskStatusMirrorState(task).changedAt || 0;
}

function buildGoogleCalendarRecurringInstanceStatusChanges(tasks, templateTask, calendarId, userTimeZone) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => (
      task
      && task.archived !== true
      && task.templateId === templateTask.id
      && String(task?.recurrence?.type || "") === "generated"
    ))
    .map((task) => buildGoogleCalendarRecurringInstanceStatusChange(templateTask, task, calendarId, userTimeZone))
    .filter(Boolean);
}

function buildGoogleCalendarRecurringInstanceStatusChange(templateTask, instanceTask, calendarId, userTimeZone) {
  const googleCalendar = normalizeGoogleCalendarTaskLink(instanceTask.googleCalendar, { calendarId });
  const statusMirrorState = getGoogleCalendarTaskStatusMirrorState(instanceTask);
  const statusMirrorVersion = statusMirrorState.changedAt || 0;
  if (!statusMirrorVersion || statusMirrorVersion <= (googleCalendar.statusMirroredAt || 0)) {
    return null;
  }

  const originalStartDate = googleCalendar.originalStartDate || String(instanceTask.startDate || instanceTask.dueDate || "");
  const originalTimeOfDay = googleCalendar.originalTimeOfDay || String(instanceTask.timeOfDay || "");
  if (!originalStartDate) {
    return null;
  }

  const scheduleTask = {
    ...instanceTask,
    id: templateTask.id,
    recurrence: { type: "none" },
    userTimeZone
  };

  return {
    sourceTaskId: String(instanceTask.id || ""),
    taskId: templateTask.id,
    name: String(instanceTask.name || ""),
    details: String(instanceTask.details || ""),
    startDate: String(instanceTask.startDate || ""),
    dueDate: String(instanceTask.dueDate || ""),
    timeOfDay: String(instanceTask.timeOfDay || ""),
    length: String(instanceTask.length || "medium"),
    recurrence: { type: "none" },
    reminders: normalizeExportReminders(instanceTask.reminders),
    importance: String(instanceTask.importance || "medium"),
    categoryKey: String(instanceTask.categoryKey || ""),
    lateGraceMinutes: Number.isFinite(Number(instanceTask.lateGraceMinutes)) ? Number(instanceTask.lateGraceMinutes) : 0,
    ownerWidgetType: String(instanceTask.ownerWidgetType || ""),
    ownerTaskKey: String(instanceTask.ownerTaskKey || ""),
    widgetTaskKind: String(instanceTask.widgetTaskKind || ""),
    widgetTaskMeta: normalizeExportWidgetTaskMeta(instanceTask.widgetTaskMeta),
    userTimeZone: String(userTimeZone || "").trim(),
    timeZoneMode: resolveGoogleCalendarTaskTimeZoneMode(scheduleTask),
    googleCalendar,
    originalStartDate,
    originalTimeOfDay,
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint(scheduleTask),
    statusMirrorVersion,
    statusMirrorLifecycleType: statusMirrorState.lifecycleType
  };
}

function getLatestGoogleCalendarLifecycleEntry(task) {
  const history = Array.isArray(task?.history) ? task.history : [];
  let latest = null;
  for (const item of history) {
    if (!item || (item.type !== "completed" && item.type !== "skipped" && item.type !== "reopened")) {
      continue;
    }
    if (!latest || (item.at || 0) > (latest.at || 0)) {
      latest = item;
    }
  }
  return latest;
}

function formatGoogleCalendarStatusTimestamp(value, timeZone = "") {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) {
    return "";
  }
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {})
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {})
  });
  return `${month}, ${time}`;
}

function buildGoogleCalendarEventReminders(task) {
  if (task.reminders.enabled !== true) {
    return {
      useDefault: false,
      overrides: []
    };
  }
  const dueSoonMinutes = Number.isFinite(task.reminders.dueSoonMinutes) ? task.reminders.dueSoonMinutes : null;
  return {
    useDefault: false,
    overrides: dueSoonMinutes !== null
      ? [{ method: "popup", minutes: dueSoonMinutes }]
      : []
  };
}

function parseGoogleCalendarEventReminders(value) {
  const source = value && typeof value === "object" ? value : {};
  const overrides = Array.isArray(source.overrides) ? source.overrides : [];
  const popupOverride = overrides.find((entry) => Number.isFinite(Number(entry?.minutes)));
  const dueSoonMinutes = popupOverride ? Number(popupOverride.minutes) : null;
  return {
    enabled: source.useDefault === true || overrides.length > 0,
    dueSoonMinutes,
    overdueMinutes: null
  };
}

function buildGoogleCalendarEventStartEnd(task, timeZone) {
  const durationMinutes = DURATION_MINUTES_BY_LENGTH[task.length] || DURATION_MINUTES_BY_LENGTH.medium;
  const hasTime = Boolean(task.timeOfDay);
  const startDate = task.startDate || task.dueDate;
  const dueDate = task.dueDate || task.startDate;

  if (!hasTime) {
    const eventStartDate = normalizeDateString(startDate || dueDate);
    const eventEndDate = normalizeDateString(dueDate || startDate);
    const exclusiveEndDate = eventEndDate
      ? addDaysToDateString(eventEndDate, 1)
      : addDaysToDateString(eventStartDate, 1);
    return {
      start: {
        date: eventStartDate
      },
      end: {
        date: exclusiveEndDate
      }
    };
  }

  const safeStartDate = normalizeDateString(startDate || dueDate);
  const safeDueDate = normalizeDateString(dueDate || startDate);
  const safeTime = normalizeTimeString(task.timeOfDay) || "23:59";
  if (safeStartDate && safeDueDate && safeStartDate !== safeDueDate) {
    return {
      start: {
        dateTime: buildGoogleCalendarDateTimeValue(safeStartDate, safeTime, timeZone),
        ...(timeZone ? { timeZone } : {})
      },
      end: {
        dateTime: buildGoogleCalendarDateTimeValue(safeDueDate, safeTime, timeZone),
        ...(timeZone ? { timeZone } : {})
      }
    };
  }

  const end = addMinutesToDateTimeString(safeDueDate || safeStartDate, safeTime, durationMinutes);
  return {
    start: {
      dateTime: buildGoogleCalendarDateTimeValue(safeDueDate || safeStartDate, safeTime, timeZone),
      ...(timeZone ? { timeZone } : {})
    },
    end: {
      dateTime: buildGoogleCalendarDateTimeValue(end.slice(0, 10), end.slice(11, 16), timeZone),
      ...(timeZone ? { timeZone } : {})
    }
  };
}

export function parseGoogleCalendarEventStart(event, calendarTimeZone) {
  const start = event?.start && typeof event.start === "object"
    ? event.start
    : (event && typeof event === "object" && (typeof event.date === "string" || typeof event.dateTime === "string") ? event : {});
  const end = event?.end && typeof event.end === "object" ? event.end : {};
  const eventTimeZone = typeof start.timeZone === "string" && start.timeZone.trim()
    ? start.timeZone.trim()
    : (typeof end.timeZone === "string" && end.timeZone.trim()
      ? end.timeZone.trim()
      : String(calendarTimeZone || "").trim());

  if (typeof start.date === "string" && start.date) {
    const startDate = normalizeDateString(start.date);
    const normalizedEndDate = typeof end.date === "string" ? normalizeDateString(end.date) : "";
    const dueDate = normalizedEndDate
      ? addDaysToDateString(normalizedEndDate, -1)
      : startDate;
    return {
      startDate,
      dueDate,
      timeOfDay: "",
      timeZone: ""
    };
  }

  const startDateTime = typeof start.dateTime === "string" ? start.dateTime : "";
  const endDateTime = typeof end.dateTime === "string" ? end.dateTime : "";
  const startDate = normalizeDateString(startDateTime.slice(0, 10));
  const dueDate = normalizeDateString((endDateTime || startDateTime).slice(0, 10));
  const timeOfDay = normalizeTimeString(startDateTime.slice(11, 16));
  return {
    startDate,
    dueDate: dueDate || startDate,
    timeOfDay,
    timeZone: eventTimeZone
  };
}

function buildGoogleCalendarRecurrence(task) {
  const recurrence = normalizeExportRecurrence(task.recurrence);
  if (!recurrence || recurrence.type === "none") {
    return [];
  }

  const parts = [];
  if (recurrence.type === "daily") {
    parts.push("FREQ=DAILY");
    if ((recurrence.interval || 1) > 1) {
      parts.push(`INTERVAL=${recurrence.interval}`);
    }
  } else if (recurrence.type === "weekly") {
    parts.push("FREQ=WEEKLY");
    if ((recurrence.interval || 1) > 1) {
      parts.push(`INTERVAL=${recurrence.interval}`);
    }
    parts.push(`BYDAY=${GOOGLE_WEEKDAY_CODES[recurrence.weekday] || "SU"}`);
  } else if (recurrence.type === "monthly-date") {
    parts.push("FREQ=MONTHLY");
    if ((recurrence.interval || 1) > 1) {
      parts.push(`INTERVAL=${recurrence.interval}`);
    }
    parts.push(`BYMONTHDAY=${Math.min(31, Math.max(1, recurrence.day || 1))}`);
  } else if (recurrence.type === "monthly-weekday") {
    parts.push("FREQ=MONTHLY");
    if ((recurrence.interval || 1) > 1) {
      parts.push(`INTERVAL=${recurrence.interval}`);
    }
    parts.push(`BYDAY=${GOOGLE_WEEKDAY_CODES[recurrence.weekday] || "SU"}`);
    parts.push(`BYSETPOS=${GOOGLE_BYSETPOS_BY_ORDINAL[recurrence.ordinal] || 1}`);
  } else {
    return [];
  }

  if (Number.isFinite(recurrence.count) && recurrence.count > 0) {
    parts.push(`COUNT=${recurrence.count}`);
  } else if (recurrence.endDate) {
    parts.push(`UNTIL=${String(recurrence.endDate).replaceAll("-", "")}`);
  }

  return [`RRULE:${parts.join(";")}`];
}

function parseGoogleCalendarRecurrence(recurrenceLines) {
  if (!Array.isArray(recurrenceLines) || recurrenceLines.length === 0) {
    return { type: "none" };
  }
  const rruleLine = recurrenceLines.find((line) => typeof line === "string" && line.startsWith("RRULE:"));
  if (!rruleLine) {
    return { type: "none" };
  }
  const fields = Object.fromEntries(
    rruleLine.slice("RRULE:".length)
      .split(";")
      .map((entry) => entry.split("="))
      .filter(([key, value]) => key && value)
  );
  const interval = normalizePositiveNumber(fields.INTERVAL, 1);
  const count = normalizePositiveNumber(fields.COUNT, null);
  const endDate = normalizeUntilDate(fields.UNTIL);
  const forever = !count && !endDate;

  if (fields.FREQ === "DAILY") {
    return {
      type: "daily",
      interval,
      weekday: 0,
      day: 1,
      ordinal: "first",
      sourceType: "",
      endDate,
      count,
      forever
    };
  }

  if (fields.FREQ === "WEEKLY") {
    return {
      type: "weekly",
      interval,
      weekday: GOOGLE_WEEKDAY_CODES.indexOf(String(fields.BYDAY || "SU")),
      day: 1,
      ordinal: "first",
      sourceType: "",
      endDate,
      count,
      forever
    };
  }

  if (fields.FREQ === "MONTHLY" && fields.BYMONTHDAY) {
    return {
      type: "monthly-date",
      interval,
      weekday: 0,
      day: normalizePositiveNumber(fields.BYMONTHDAY, 1),
      ordinal: "first",
      sourceType: "",
      endDate,
      count,
      forever
    };
  }

  if (fields.FREQ === "MONTHLY" && fields.BYDAY && fields.BYSETPOS) {
    return {
      type: "monthly-weekday",
      interval,
      weekday: GOOGLE_WEEKDAY_CODES.indexOf(String(fields.BYDAY || "SU")),
      day: 1,
      ordinal: ORDINAL_BY_GOOGLE_BYSETPOS[Number(fields.BYSETPOS)] || "first",
      sourceType: "",
      endDate,
      count,
      forever
    };
  }

  return { type: "none" };
}

function normalizeDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function normalizeTimeString(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function addDaysToDateString(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function extractTaskDetailsFromGoogleDescription(description) {
  const text = typeof description === "string" ? description.trim() : "";
  if (!text) {
    return "";
  }
  const footerMarker = "\n\nCreated by Lifetree.";
  const footerIndex = text.indexOf(footerMarker);
  if (footerIndex >= 0) {
    return text.slice(0, footerIndex).trim();
  }
  if (text === "Created by Lifetree.") {
    return "";
  }
  return text;
}

function normalizeUntilDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const compact = text.slice(0, 8);
  if (!/^\d{8}$/.test(compact)) {
    return "";
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function normalizePositiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeLengthValue(value) {
  const text = String(value || "");
  return DURATION_MINUTES_BY_LENGTH[text] ? text : "medium";
}

function normalizeImportanceValue(value) {
  const text = String(value || "").toLowerCase();
  return text === "low" || text === "high" ? text : "medium";
}

function addMinutesToDateTimeString(dateString, timeString, minutes) {
  const date = new Date(`${dateString}T${timeString}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

function buildGoogleCalendarDateTimeValue(dateString, timeString, timeZone = "") {
  const safeDate = normalizeDateString(dateString);
  const safeTime = normalizeTimeString(timeString) || "00:00";
  const safeTimeZone = String(timeZone || "").trim();
  if (!safeDate) {
    return "";
  }
  if (!safeTimeZone) {
    return `${safeDate}T${safeTime}:00`;
  }
  const offsetMinutes = resolveTimeZoneOffsetMinutes(safeDate, safeTime, safeTimeZone);
  return `${safeDate}T${safeTime}:00${formatTimeZoneOffset(offsetMinutes)}`;
}

function resolveTimeZoneOffsetMinutes(dateString, timeString, timeZone) {
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  const [hour, minute] = timeString.split(":").map((value) => Number(value));
  const baseUtc = Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0);
  let offsetMinutes = getTimeZoneOffsetMinutes(timeZone, baseUtc);
  let candidateUtc = baseUtc - (offsetMinutes * 60_000);
  const refinedOffsetMinutes = getTimeZoneOffsetMinutes(timeZone, candidateUtc);
  if (refinedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = refinedOffsetMinutes;
    candidateUtc = baseUtc - (offsetMinutes * 60_000);
    offsetMinutes = getTimeZoneOffsetMinutes(timeZone, candidateUtc);
  }
  return offsetMinutes;
}

function getTimeZoneOffsetMinutes(timeZone, timestamp) {
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const zonedUtc = Date.UTC(
    Number(parts.year || 0),
    Math.max(0, Number(parts.month || 1) - 1),
    Number(parts.day || 1),
    Number(parts.hour || 0),
    Number(parts.minute || 0),
    Number(parts.second || 0)
  );
  return Math.round((zonedUtc - timestamp) / 60_000);
}

function formatTimeZoneOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = sortObjectKeys(value[key]);
  }
  return result;
}
