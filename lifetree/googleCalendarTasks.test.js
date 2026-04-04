import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleCalendarEventPayload,
  buildGoogleCalendarScheduleSyncRequest,
  buildGoogleCalendarTaskScheduleFingerprint,
  normalizeGoogleCalendarTaskLink
} from "./modules/googleCalendarTasks.js";

test("schedule sync request exports only scheduled tasks that need Google Calendar updates", () => {
  const recurringTask = {
    id: "weekly-retinol",
    name: "Retinol",
    details: "Use carefully.",
    dueDate: "2026-04-08",
    startDate: "2026-04-08",
    timeOfDay: "21:30",
    length: "very-short",
    recurrence: {
      type: "weekly",
      interval: 1,
      weekday: 3,
      endDate: "",
      count: null,
      forever: true
    },
    reminders: {
      enabled: true,
      dueSoonMinutes: 60,
      overdueMinutes: 15
    },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "",
    ownerTaskKey: "",
    widgetTaskKind: "",
    widgetTaskMeta: {},
    status: "open",
    archived: false,
    historyOnly: false,
    templateId: ""
  };

  const alreadySyncedTask = {
    id: "dog-walk",
    name: "Dog walk",
    details: "",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "18:30",
    length: "medium",
    recurrence: { type: "none" },
    reminders: { enabled: true, dueSoonMinutes: 15, overdueMinutes: 15 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "workout",
    ownerTaskKey: "dog-walk",
    widgetTaskKind: "workout-session",
    widgetTaskMeta: {},
    status: "open",
    archived: false,
    historyOnly: false,
    templateId: ""
  };
  alreadySyncedTask.googleCalendar = normalizeGoogleCalendarTaskLink({
    calendarId: "lifetree-cal",
    eventId: "event-1",
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint(alreadySyncedTask)
  }, { calendarId: "lifetree-cal" });

  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      recurringTask,
      alreadySyncedTask,
      {
        id: "generated",
        name: "Generated instance",
        dueDate: "2026-04-05",
        startDate: "2026-04-05",
        timeOfDay: "07:00",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "daily" },
        reminders: { enabled: true, dueSoonMinutes: 15, overdueMinutes: 15 },
        status: "open",
        archived: false,
        historyOnly: false,
        templateId: "template-1"
      },
      {
        id: "unscheduled",
        name: "Loose note",
        dueDate: "",
        startDate: "2026-04-05",
        timeOfDay: "",
        length: "medium",
        recurrence: { type: "none" },
        reminders: { enabled: false, dueSoonMinutes: null, overdueMinutes: null },
        status: "open",
        archived: false,
        historyOnly: false,
        templateId: ""
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 2);
  assert.deepEqual(payload.tasks.map((task) => task.taskId), ["weekly-retinol"]);
});

test("event payload builds recurrence, reminders, and metadata for recurring tasks", () => {
  const payload = buildGoogleCalendarEventPayload({
    taskId: "energy-1",
    name: "Energy check-in",
    details: "Created by the Energy widget.",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "07:00",
    length: "very-short",
    recurrence: {
      type: "weekly",
      interval: 2,
      weekday: 0,
      endDate: "2026-05-31",
      count: null,
      forever: false
    },
    reminders: {
      enabled: true,
      dueSoonMinutes: 30,
      overdueMinutes: 15
    },
    importance: "high",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "energy",
    ownerTaskKey: "energy-1",
    widgetTaskKind: "check-in",
    widgetTaskMeta: {
      timeZone: "America/Los_Angeles"
    },
    googleCalendar: {}
  }, {
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.summary, "Energy check-in");
  assert.deepEqual(payload.recurrence, ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;UNTIL=20260531"]);
  assert.deepEqual(payload.reminders, {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 30 }]
  });
  assert.equal(payload.extendedProperties.private.lifetreeWidgetType, "energy");
  assert.equal(payload.extendedProperties.private.lifetreeTaskKind, "recurring-master");
});
