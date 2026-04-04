export const GOOGLE_CALENDAR_TASK_SCHEMA_VERSION = 1;

const DEFAULT_LINK_SOURCE = "lifetree";
const GOOGLE_WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const GOOGLE_BYSETPOS_BY_ORDINAL = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  last: -1
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
  if (task.archived === true || task.historyOnly === true || task.status !== "open") {
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
  return true;
}

export function buildGoogleCalendarTaskScheduleFingerprint(task) {
  return JSON.stringify(sortObjectKeys({
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
    timeZone: resolveGoogleCalendarTaskTimeZone(task, "")
  }));
}

export function buildGoogleCalendarScheduleSyncRequest(store, googleCalendarIntegration) {
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const calendar = googleCalendarIntegration && typeof googleCalendarIntegration === "object"
    ? googleCalendarIntegration
    : {};
  const calendarId = typeof calendar.calendarId === "string" ? calendar.calendarId : "";
  const calendarSummary = typeof calendar.calendarSummary === "string" && calendar.calendarSummary.trim()
    ? calendar.calendarSummary.trim()
    : "Lifetree";
  const calendarTimeZone = typeof calendar.calendarTimeZone === "string" ? calendar.calendarTimeZone.trim() : "";
  const eligibleTasks = tasks.filter(isGoogleCalendarSchedulableTask);
  const syncTasks = eligibleTasks
    .map((task) => {
      const googleCalendar = normalizeGoogleCalendarTaskLink(task.googleCalendar, { calendarId });
      const scheduleFingerprint = buildGoogleCalendarTaskScheduleFingerprint(task);
      const needsSync = !googleCalendar.eventId
        || googleCalendar.calendarId !== calendarId
        || googleCalendar.scheduleFingerprint !== scheduleFingerprint;
      return {
        needsSync,
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
        googleCalendar,
        scheduleFingerprint
      };
    })
    .filter((task) => task.needsSync)
    .map(({ needsSync: _needsSync, ...task }) => task);

  return {
    calendarId,
    calendarSummary,
    calendarTimeZone,
    totalEligibleTasks: eligibleTasks.length,
    tasks: syncTasks
  };
}

export function normalizeGoogleCalendarSyncTask(value, { calendarId = "", calendarTimeZone = "" } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const recurrence = normalizeExportRecurrence(source.recurrence);
  const widgetTaskMeta = normalizeExportWidgetTaskMeta(source.widgetTaskMeta);
  const normalized = {
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
    scheduleFingerprint: typeof source.scheduleFingerprint === "string"
      ? source.scheduleFingerprint
      : buildGoogleCalendarTaskScheduleFingerprint(source)
  };
  normalized.timeZone = resolveGoogleCalendarTaskTimeZone(normalized, calendarTimeZone);
  return normalized;
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

function normalizeExportRecurrence(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    type: typeof source.type === "string" ? source.type : "none",
    interval: Number.isFinite(Number(source.interval)) ? Number(source.interval) : 1,
    weekday: Number.isFinite(Number(source.weekday)) ? Number(source.weekday) : 0,
    day: Number.isFinite(Number(source.day)) ? Number(source.day) : 1,
    ordinal: typeof source.ordinal === "string" ? source.ordinal : "first",
    sourceType: typeof source.sourceType === "string" ? source.sourceType : "",
    endDate: typeof source.endDate === "string" ? source.endDate : "",
    count: Number.isFinite(Number(source.count)) ? Number(source.count) : null,
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
  if (typeof value.location === "string" && value.location.trim()) {
    normalized.location = value.location.trim();
  }
  if (typeof value.googleCalendarLocation === "string" && value.googleCalendarLocation.trim()) {
    normalized.googleCalendarLocation = value.googleCalendarLocation.trim();
  }
  return normalized;
}

function resolveGoogleCalendarTaskTimeZone(task, fallbackTimeZone = "") {
  const explicit = String(task?.widgetTaskMeta?.timeZone || "").trim();
  return explicit || String(fallbackTimeZone || "").trim();
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
  const footer = [
    "Created by Lifetree.",
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
  return {
    lifetreeTaskId: task.taskId,
    lifetreeTaskKind: task.recurrence.type === "none" ? "one-off" : "recurring-master",
    lifetreeWidgetType: String(task.ownerWidgetType || ""),
    lifetreeWidgetTaskKind: String(task.widgetTaskKind || ""),
    lifetreeCategoryKey: String(task.categoryKey || ""),
    lifetreeImportance: String(task.importance || "medium"),
    lifetreeLength: String(task.length || "medium"),
    lifetreeLateGraceMinutes: String(task.lateGraceMinutes || 0),
    lifetreeSchemaVersion: String(GOOGLE_CALENDAR_TASK_SCHEMA_VERSION)
  };
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
        dateTime: `${safeStartDate}T${safeTime}:00`,
        ...(timeZone ? { timeZone } : {})
      },
      end: {
        dateTime: `${safeDueDate}T${safeTime}:00`,
        ...(timeZone ? { timeZone } : {})
      }
    };
  }

  const end = addMinutesToDateTimeString(safeDueDate || safeStartDate, safeTime, durationMinutes);
  return {
    start: {
      dateTime: `${safeDueDate || safeStartDate}T${safeTime}:00`,
      ...(timeZone ? { timeZone } : {})
    },
    end: {
      dateTime: end,
      ...(timeZone ? { timeZone } : {})
    }
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

function addMinutesToDateTimeString(dateString, timeString, minutes) {
  const date = new Date(`${dateString}T${timeString}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
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
