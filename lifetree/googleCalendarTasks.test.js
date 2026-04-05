import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleCalendarTaskSchedulePatchFromEvent,
  buildGoogleCalendarEventPayload,
  buildGoogleCalendarScheduleSyncRequest,
  buildGoogleCalendarTaskScheduleFingerprint,
  chooseCanonicalGoogleCalendarTaskEvent,
  findOrphanedGoogleCalendarTaskEvents,
  isGoogleCalendarDeletedEvent,
  isGoogleCalendarRecurringInstanceOverrideEvent,
  normalizeGoogleCalendarTaskLink,
  normalizeGoogleCalendarSyncTask,
  parseGoogleCalendarEventStart,
  splitGoogleCalendarTaskEvents
} from "./modules/googleCalendarTasks.js";

test("schedule sync request includes eligible linked tasks and marks whether they need a push", () => {
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
  assert.deepEqual(payload.tasks.map((task) => task.taskId), ["weekly-retinol", "dog-walk"]);
  assert.equal(payload.tasks.find((task) => task.taskId === "weekly-retinol")?.needsPush, true);
  assert.equal(payload.tasks.find((task) => task.taskId === "dog-walk")?.needsPush, false);
  assert.equal(payload.tasks.find((task) => task.taskId === "dog-walk")?.needsRemoteCheck, true);
});

test("schedule sync request carries pending Google Calendar deletions", () => {
  const now = Date.now();
  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: []
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles",
    pendingDeletions: [
      {
        id: "lifetree-cal:event-1",
        calendarId: "lifetree-cal",
        eventId: "event-1",
        taskId: "task-1",
        deletedAt: now,
        kind: "task"
      }
    ]
  });

  assert.equal(payload.tasks.length, 0);
  assert.deepEqual(payload.pendingDeletions, [
    {
      id: "lifetree-cal:event-1",
      calendarId: "lifetree-cal",
      eventId: "event-1",
      taskId: "task-1",
      deletedAt: now,
      kind: "task"
    }
  ]);
});

test("schedule sync request includes recurring instance status changes for generated occurrences", () => {
  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      {
        id: "nasal-spray-template",
        name: "Nasal spray",
        details: "",
        dueDate: "2026-03-22",
        startDate: "2026-03-22",
        timeOfDay: "19:01",
        length: "very-short",
        recurrence: {
          type: "daily",
          interval: 1,
          weekday: 0,
          day: 1,
          ordinal: "first",
          endDate: "",
          count: null,
          forever: true
        },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
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
        templateId: "",
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          eventId: "master-event"
        }, { calendarId: "lifetree-cal" })
      },
      {
        id: "nasal-spray-2026-04-04",
        templateId: "nasal-spray-template",
        occurrenceIndex: 13,
        name: "Nasal spray",
        details: "",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "19:01",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "daily" },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 15,
        ownerWidgetType: "",
        ownerTaskKey: "",
        widgetTaskKind: "",
        widgetTaskMeta: {},
        status: "done",
        archived: false,
        historyOnly: false,
        history: [
          {
            id: "history-1",
            type: "completed",
            at: 1775364060000
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          statusMirroredAt: 0
        }, { calendarId: "lifetree-cal" })
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].taskId, "nasal-spray-template");
  assert.equal(payload.tasks[0].instanceStatusChanges.length, 1);
  assert.deepEqual(payload.tasks[0].instanceStatusChanges[0], {
    sourceTaskId: "nasal-spray-2026-04-04",
    taskId: "nasal-spray-template",
    name: "Nasal spray",
    details: "",
    startDate: "2026-04-04",
    dueDate: "2026-04-04",
    timeOfDay: "19:01",
    length: "very-short",
    recurrence: { type: "none" },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "",
    ownerTaskKey: "",
    widgetTaskKind: "",
    widgetTaskMeta: {},
    userTimeZone: "America/Los_Angeles",
    timeZoneMode: "floating-local",
    googleCalendar: normalizeGoogleCalendarTaskLink({
      calendarId: "lifetree-cal",
      statusMirroredAt: 0
    }, { calendarId: "lifetree-cal" }),
    originalStartDate: "2026-04-04",
    originalTimeOfDay: "19:01",
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint({
      id: "nasal-spray-template",
      name: "Nasal spray",
      details: "",
      startDate: "2026-04-04",
      dueDate: "2026-04-04",
      timeOfDay: "19:01",
      length: "very-short",
      recurrence: { type: "none" },
      reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
      importance: "medium",
      categoryKey: "health",
      lateGraceMinutes: 15,
      ownerWidgetType: "",
      widgetTaskKind: "",
      widgetTaskMeta: {},
      userTimeZone: "America/Los_Angeles"
    }),
    statusMirrorVersion: 1775364060000,
    statusMirrorLifecycleType: "completed"
  });
});

test("schedule sync request includes recurring instance status changes when the current occurrence is the recurring master", () => {
  const completedAt = 1775353763410;
  const masterTask = {
    id: "dog-walk-template",
    name: "Dog walk",
    details: "Created by Workout Coach.",
    dueDate: "2026-04-04",
    startDate: "2026-04-04",
    timeOfDay: "18:30",
    length: "medium",
    recurrence: {
      type: "daily",
      interval: 1,
      weekday: 0,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "workout",
    ownerTaskKey: "workout-plan:dog-walk:slot:0",
    widgetTaskKind: "workout-session",
    widgetTaskMeta: {
      planId: "dog-walk"
    },
    status: "done",
    archived: false,
    historyOnly: false,
    templateId: "",
    history: [
      {
        id: "history-1",
        type: "completed",
        at: completedAt
      }
    ],
    googleCalendar: normalizeGoogleCalendarTaskLink({
      calendarId: "lifetree-cal",
      eventId: "dog-walk-master",
      statusMirroredAt: 0
    }, { calendarId: "lifetree-cal" })
  };
  masterTask.googleCalendar.scheduleFingerprint = buildGoogleCalendarTaskScheduleFingerprint({
    ...masterTask,
    userTimeZone: "America/Los_Angeles",
    seriesAnchorDate: "2026-04-04"
  });

  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [masterTask]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].taskId, "dog-walk-template");
  assert.equal(payload.tasks[0].needsStatusPush, false);
  assert.equal(payload.tasks[0].instanceStatusChanges.length, 1);
  assert.deepEqual(payload.tasks[0].instanceStatusChanges[0], {
    sourceTaskId: "dog-walk-template",
    taskId: "dog-walk-template",
    name: "Dog walk",
    details: "Created by Workout Coach.",
    startDate: "2026-04-04",
    dueDate: "2026-04-04",
    timeOfDay: "18:30",
    length: "medium",
    recurrence: { type: "none" },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "workout",
    ownerTaskKey: "workout-plan:dog-walk:slot:0",
    widgetTaskKind: "workout-session",
    widgetTaskMeta: {},
    userTimeZone: "America/Los_Angeles",
    timeZoneMode: "floating-local",
    googleCalendar: normalizeGoogleCalendarTaskLink({
      calendarId: "lifetree-cal",
      eventId: "",
      recurringEventId: "",
      originalStartDate: "2026-04-04",
      originalTimeOfDay: "18:30",
      scheduleFingerprint: masterTask.googleCalendar.scheduleFingerprint,
      statusMirroredAt: 0
    }, { calendarId: "lifetree-cal" }),
    originalStartDate: "2026-04-04",
    originalTimeOfDay: "18:30",
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint({
      id: "dog-walk-template",
      name: "Dog walk",
      details: "Created by Workout Coach.",
      startDate: "2026-04-04",
      dueDate: "2026-04-04",
      timeOfDay: "18:30",
      length: "medium",
      recurrence: { type: "none" },
      reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
      importance: "medium",
      categoryKey: "health",
      lateGraceMinutes: 15,
      ownerWidgetType: "workout",
      widgetTaskKind: "workout-session",
      widgetTaskMeta: {
        planId: "dog-walk"
      },
      userTimeZone: "America/Los_Angeles"
    }),
    statusMirrorVersion: completedAt,
    statusMirrorLifecycleType: "completed"
  });
});

test("schedule sync request prefers a generated recurring occurrence over the master when both point at the same day", () => {
  const masterTask = {
    id: "weight-template",
    name: "Weight check-in",
    details: "Created by Workout Coach. Log your weight in lbs.",
    dueDate: "2026-04-04",
    startDate: "2026-04-04",
    timeOfDay: "07:00",
    length: "very-short",
    recurrence: {
      type: "weekly",
      interval: 1,
      weekday: 6,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "workout",
    ownerTaskKey: "weight-checkin:weekday:6",
    widgetTaskKind: "weight-checkin",
    widgetTaskMeta: {},
    status: "done",
    archived: false,
    historyOnly: false,
    templateId: "",
    history: [
      {
        id: "history-master",
        type: "completed",
        at: 1774705685466
      }
    ],
    googleCalendar: normalizeGoogleCalendarTaskLink({
      calendarId: "lifetree-cal",
      eventId: "weight-master",
      statusMirroredAt: 0
    }, { calendarId: "lifetree-cal" })
  };

  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      masterTask,
      {
        id: "weight-2026-04-04",
        templateId: "weight-template",
        occurrenceIndex: 1,
        name: "7:00 AM Weight check-in (Completed)",
        details: "Created by Workout Coach. Log your weight in lbs.",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "07:00",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "weekly" },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 15,
        ownerWidgetType: "workout",
        ownerTaskKey: "weight-checkin:weekday:6",
        widgetTaskKind: "weight-checkin",
        widgetTaskMeta: {},
        status: "done",
        archived: true,
        historyOnly: false,
        history: [
          {
            id: "history-generated",
            type: "completed",
            at: 1775312518007
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          statusMirroredAt: 0
        }, { calendarId: "lifetree-cal" })
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].instanceStatusChanges.length, 1);
  assert.equal(payload.tasks[0].instanceStatusChanges[0].sourceTaskId, "weight-2026-04-04");
  assert.equal(payload.tasks[0].instanceStatusChanges[0].name, "Weight check-in");
  assert.equal(payload.tasks[0].instanceStatusChanges[0].statusMirrorVersion, 1775312518007);
});

test("schedule sync request does not remirror a recurring master when the same occurrence already exists as a mirrored generated task", () => {
  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      {
        id: "weight-template",
        name: "Weight check-in",
        details: "Created by Workout Coach. Log your weight in lbs.",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "07:00",
        length: "very-short",
        recurrence: {
          type: "weekly",
          interval: 1,
          weekday: 6,
          day: 1,
          ordinal: "first",
          endDate: "",
          count: null,
          forever: true
        },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 15,
        ownerWidgetType: "workout",
        ownerTaskKey: "weight-checkin:weekday:6",
        widgetTaskKind: "weight-checkin",
        widgetTaskMeta: {},
        status: "done",
        archived: false,
        historyOnly: false,
        templateId: "",
        history: [
          {
            id: "history-master",
            type: "completed",
            at: 1774705685466
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          eventId: "weight-master",
          statusMirroredAt: 0
        }, { calendarId: "lifetree-cal" })
      },
      {
        id: "weight-2026-04-04",
        templateId: "weight-template",
        occurrenceIndex: 1,
        name: "7:00 AM Weight check-in (Completed)",
        details: "Created by Workout Coach. Log your weight in lbs.",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "07:00",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "weekly" },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 15,
        ownerWidgetType: "workout",
        ownerTaskKey: "weight-checkin:weekday:6",
        widgetTaskKind: "weight-checkin",
        widgetTaskMeta: {},
        status: "done",
        archived: true,
        historyOnly: false,
        history: [
          {
            id: "history-generated",
            type: "completed",
            at: 1775312518007
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          eventId: "weight-master_20260404T140000Z",
          recurringEventId: "weight-master",
          originalStartDate: "2026-04-04",
          originalTimeOfDay: "07:00",
          statusMirroredAt: 1775312518007
        }, { calendarId: "lifetree-cal" })
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].instanceStatusChanges.length, 0);
});

test("schedule sync request matches archived recurring instance status changes after a series template is recreated", () => {
  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      {
        id: "nasal-spray-template-new",
        name: "Nasal spray",
        details: "Created by Lifetree.\nLifetree task ID: nasal-spray-template-new",
        dueDate: "2026-03-22",
        startDate: "2026-03-22",
        timeOfDay: "19:01",
        length: "very-short",
        recurrence: {
          type: "daily",
          interval: 1,
          weekday: 0,
          day: 1,
          ordinal: "first",
          endDate: "",
          count: null,
          forever: true
        },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
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
        templateId: "",
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          eventId: "master-event"
        }, { calendarId: "lifetree-cal" })
      },
      {
        id: "nasal-spray-2026-04-04",
        templateId: "nasal-spray-template-old",
        occurrenceIndex: 13,
        name: "Nasal spray",
        details: "",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "19:01",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "daily" },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 15,
        ownerWidgetType: "",
        ownerTaskKey: "",
        widgetTaskKind: "",
        widgetTaskMeta: {},
        status: "done",
        archived: true,
        historyOnly: false,
        history: [
          {
            id: "history-1",
            type: "completed",
            at: 1775364060000
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          statusMirroredAt: 0
        }, { calendarId: "lifetree-cal" })
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].taskId, "nasal-spray-template-new");
  assert.equal(payload.tasks[0].instanceStatusChanges.length, 1);
  assert.equal(payload.tasks[0].instanceStatusChanges[0]?.sourceTaskId, "nasal-spray-2026-04-04");
});

test("recurring google payload anchors the series to the earliest pending instance date while preserving local due dates in metadata", () => {
  const syncRequest = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      {
        id: "energy-template",
        name: "Energy check-in",
        details: "Created by the Energy widget.",
        dueDate: "2026-04-05",
        startDate: "2026-04-05",
        timeOfDay: "12:00",
        length: "very-short",
        recurrence: {
          type: "daily",
          interval: 1,
          weekday: 0,
          day: 1,
          ordinal: "first",
          endDate: "",
          count: null,
          forever: true
        },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 60,
        ownerWidgetType: "energy",
        ownerTaskKey: "energy-reminder-1",
        widgetTaskKind: "energy-checkin",
        widgetTaskMeta: {},
        status: "open",
        archived: false,
        historyOnly: false,
        templateId: "",
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          eventId: "master-event"
        }, { calendarId: "lifetree-cal" })
      },
      {
        id: "energy-2026-04-04",
        templateId: "energy-template",
        occurrenceIndex: 1,
        name: "Energy check-in",
        details: "",
        dueDate: "2026-04-04",
        startDate: "2026-04-04",
        timeOfDay: "12:00",
        length: "very-short",
        recurrence: { type: "generated", sourceType: "daily" },
        reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
        importance: "medium",
        categoryKey: "health",
        lateGraceMinutes: 60,
        ownerWidgetType: "energy",
        ownerTaskKey: "energy-reminder-1",
        widgetTaskKind: "energy-checkin",
        widgetTaskMeta: {},
        status: "done",
        archived: true,
        historyOnly: false,
        history: [
          {
            id: "history-1",
            type: "completed",
            at: 1775323587866
          }
        ],
        googleCalendar: normalizeGoogleCalendarTaskLink({
          calendarId: "lifetree-cal",
          statusMirroredAt: 0
        }, { calendarId: "lifetree-cal" })
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(syncRequest.tasks.length, 1);
  assert.equal(syncRequest.tasks[0].seriesAnchorDate, "2026-04-04");

  const payload = buildGoogleCalendarEventPayload(syncRequest.tasks[0], {
    calendarTimeZone: "America/Los_Angeles"
  });
  assert.equal(payload.start.dateTime, "2026-04-04T12:00:00-07:00");
  assert.equal(payload.extendedProperties.private.lifetreeStartDate, "2026-04-05");
  assert.equal(payload.extendedProperties.private.lifetreeDueDate, "2026-04-05");

  const patch = buildGoogleCalendarTaskSchedulePatchFromEvent({
    summary: payload.summary,
    description: payload.description,
    start: payload.start,
    end: payload.end,
    recurrence: payload.recurrence,
    reminders: payload.reminders,
    extendedProperties: payload.extendedProperties
  }, {
    calendarTimeZone: "America/Los_Angeles",
    userTimeZone: "America/Los_Angeles"
  });
  assert.equal(patch.startDate, "2026-04-05");
  assert.equal(patch.dueDate, "2026-04-05");
});

test("recurring master lifecycle does not mark the whole Google series completed or skipped", () => {
  const recurringMaster = {
    taskId: "yoga-template",
    name: "Yoga",
    details: "Created by Workout Coach.",
    dueDate: "2026-04-01",
    startDate: "2026-04-01",
    timeOfDay: "19:30",
    length: "medium",
    recurrence: {
      type: "weekly",
      interval: 1,
      weekday: 3,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "workout",
    ownerTaskKey: "workout-plan:yoga:weekday:3",
    widgetTaskKind: "workout-session",
    widgetTaskMeta: {},
    status: "skipped",
    history: [
      {
        id: "history-1",
        type: "skipped",
        at: 1775134003477
      }
    ],
    userTimeZone: "America/Los_Angeles"
  };

  const payload = buildGoogleCalendarEventPayload(recurringMaster, {
    calendarTimeZone: "America/Los_Angeles"
  });
  assert.equal(payload.summary, "Yoga");
  assert.doesNotMatch(payload.description, /Lifetree status: skipped/);

  const firstFingerprint = buildGoogleCalendarTaskScheduleFingerprint({
    ...recurringMaster,
    dueDate: "2026-04-01",
    startDate: "2026-04-01",
    seriesAnchorDate: "2026-04-01"
  });
  const movedFingerprint = buildGoogleCalendarTaskScheduleFingerprint({
    ...recurringMaster,
    dueDate: "2026-04-08",
    startDate: "2026-04-08",
    seriesAnchorDate: "2026-04-01"
  });
  assert.equal(firstFingerprint, movedFingerprint);
});

test("google calendar sync task normalization preserves push and remote-check flags", () => {
  const normalized = normalizeGoogleCalendarSyncTask({
    taskId: "energy-checkin",
    name: "Energy check-in",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "07:00",
    recurrence: { type: "daily", interval: 1, weekday: 0, day: 1, ordinal: "first", endDate: "", count: null, forever: true },
    reminders: { enabled: true, dueSoonMinutes: 30, overdueMinutes: 15 },
    needsRemoteCheck: true,
    needsPush: true,
    needsStatusPush: false
  }, {
    calendarId: "lifetree-cal",
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(normalized.needsRemoteCheck, true);
  assert.equal(normalized.needsPush, true);
  assert.equal(normalized.needsStatusPush, false);
});

test("orphaned google calendar task events are detected by missing lifetree task id matches", () => {
  const orphans = findOrphanedGoogleCalendarTaskEvents([
    {
      id: "event-keep",
      extendedProperties: {
        private: {
          lifetreeTaskId: "task-keep"
        }
      }
    },
    {
      id: "event-orphan",
      extendedProperties: {
        private: {
          lifetreeTaskId: "task-missing"
        }
      }
    },
    {
      id: "event-manual"
    }
  ], [
    {
      taskId: "task-keep",
      name: "Keep me",
      dueDate: "2026-04-05",
      startDate: "2026-04-05",
      timeOfDay: "07:00",
      recurrence: { type: "daily", interval: 1, weekday: 0, day: 1, ordinal: "first", endDate: "", count: null, forever: true }
    }
  ]);

  assert.deepEqual(orphans.map((event) => event.id), ["event-orphan"]);
});

test("recurring Google instance overrides are not treated as duplicate series events", () => {
  const task = {
    taskId: "energy-template",
    recurrence: {
      type: "daily",
      interval: 1,
      weekday: 0,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    }
  };
  const master = {
    id: "master-event",
    updated: "2026-04-04T20:00:00.000Z",
    recurringEventId: ""
  };
  const override = {
    id: "override-event",
    updated: "2026-04-04T21:00:00.000Z",
    recurringEventId: "master-event",
    originalStartTime: {
      dateTime: "2026-04-05T12:00:00-07:00",
      timeZone: "America/Los_Angeles"
    },
    start: {
      dateTime: "2026-04-05T13:00:00-07:00",
      timeZone: "America/Los_Angeles"
    }
  };

  assert.equal(isGoogleCalendarRecurringInstanceOverrideEvent(override), true);
  assert.equal(chooseCanonicalGoogleCalendarTaskEvent([override, master], task, "").id, "master-event");

  const split = splitGoogleCalendarTaskEvents([override, master], task, "");
  assert.equal(split.canonicalEvent?.id, "master-event");
  assert.deepEqual(split.instanceOverrideEvents.map((event) => event.id), ["override-event"]);
  assert.deepEqual(split.duplicateEvents.map((event) => event.id), []);

  const originalStart = parseGoogleCalendarEventStart(override.originalStartTime, "America/Los_Angeles");
  assert.equal(originalStart.startDate, "2026-04-05");
  assert.equal(originalStart.timeOfDay, "12:00");
});

test("cancelled Google Calendar events are treated as deleted", () => {
  assert.equal(isGoogleCalendarDeletedEvent({ status: "cancelled" }), true);
  assert.equal(isGoogleCalendarDeletedEvent({ status: "confirmed" }), false);
  assert.equal(isGoogleCalendarDeletedEvent({}), false);
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
  assert.equal(payload.start.dateTime, "2026-04-05T07:00:00-07:00");
  assert.equal(payload.extendedProperties.private.lifetreeWidgetType, "energy");
  assert.equal(payload.extendedProperties.private.lifetreeTaskKind, "recurring-master");
});

test("floating-local tasks use the current user timezone while fixed tasks keep their own timezone", () => {
  const floatingTask = {
    taskId: "energy-checkin",
    name: "Energy check-in",
    details: "",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "07:00",
    length: "very-short",
    recurrence: { type: "none" },
    reminders: { enabled: true, dueSoonMinutes: 30, overdueMinutes: 15 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 15,
    ownerWidgetType: "energy",
    ownerTaskKey: "energy-checkin",
    widgetTaskKind: "check-in",
    widgetTaskMeta: {
      timeZoneMode: "floating-local"
    },
    googleCalendar: {},
    userTimeZone: "America/New_York"
  };
  const fixedTask = {
    ...floatingTask,
    taskId: "flight-checkin",
    name: "Flight check-in",
    widgetTaskKind: "flight-checkin",
    widgetTaskMeta: {
      timeZoneMode: "fixed",
      timeZone: "America/Denver"
    }
  };

  const floatingPayload = buildGoogleCalendarEventPayload(floatingTask, {
    calendarTimeZone: "UTC"
  });
  const fixedPayload = buildGoogleCalendarEventPayload(fixedTask, {
    calendarTimeZone: "UTC"
  });
  const syncPayload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [
      {
        id: "energy-checkin",
        ...floatingTask,
        status: "open",
        archived: false,
        historyOnly: false,
        templateId: ""
      },
      {
        id: "flight-checkin",
        ...fixedTask,
        status: "open",
        archived: false,
        historyOnly: false,
        templateId: ""
      }
    ]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "UTC"
  }, {
    userTimeZone: "America/New_York"
  });

  assert.equal(floatingPayload.start.timeZone, "America/New_York");
  assert.equal(floatingPayload.extendedProperties.private.lifetreeTimeZoneMode, "floating-local");
  assert.equal(fixedPayload.start.timeZone, "America/Denver");
  assert.equal(fixedPayload.extendedProperties.private.lifetreeTimeZoneMode, "fixed");
  assert.equal(syncPayload.tasks[0].scheduleFingerprint, buildGoogleCalendarTaskScheduleFingerprint(syncPayload.tasks[0]));
  assert.equal(syncPayload.tasks[1].scheduleFingerprint, buildGoogleCalendarTaskScheduleFingerprint(syncPayload.tasks[1]));
});

test("google event payload uses explicit timezone offsets for local wall-clock tasks", () => {
  const payload = buildGoogleCalendarEventPayload({
    taskId: "uk-eta",
    name: "UK ETA",
    details: "",
    dueDate: "2026-04-04",
    startDate: "2026-04-04",
    timeOfDay: "19:01",
    length: "medium",
    recurrence: { type: "none" },
    reminders: { enabled: false, dueSoonMinutes: 0, overdueMinutes: 0 },
    importance: "medium",
    categoryKey: "productivity",
    lateGraceMinutes: 15,
    widgetTaskMeta: {
      timeZoneMode: "fixed",
      timeZone: "America/Los_Angeles"
    },
    googleCalendar: {},
    userTimeZone: "America/Los_Angeles"
  }, {
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.start.dateTime, "2026-04-04T19:01:00-07:00");
  assert.equal(payload.end.dateTime, "2026-04-04T20:01:00-07:00");
});

test("linked resolved tasks request status-only Google sync when lifecycle changed", () => {
  const completedTask = {
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
    status: "done",
    archived: false,
    historyOnly: false,
    templateId: "",
    history: [{ id: "dog-walk-h1", type: "completed", at: 200 }]
  };
  completedTask.googleCalendar = normalizeGoogleCalendarTaskLink({
    calendarId: "lifetree-cal",
    eventId: "event-1",
    scheduleFingerprint: buildGoogleCalendarTaskScheduleFingerprint(completedTask),
    statusMirroredAt: 0
  }, { calendarId: "lifetree-cal" });

  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [completedTask]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].needsPush, false);
  assert.equal(payload.tasks[0].needsStatusPush, true);
  assert.equal(payload.tasks[0].statusMirrorVersion, 200);
});

test("closed recurring templates still stay schedulable for Google Calendar export", () => {
  const recurringTemplate = {
    id: "energy-reminder-0",
    name: "Energy check-in",
    details: "Created by the Energy widget.",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "07:00",
    length: "very-short",
    recurrence: {
      type: "daily",
      interval: 1,
      weekday: 0,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    },
    reminders: { enabled: true, dueSoonMinutes: 30, overdueMinutes: 15 },
    importance: "medium",
    categoryKey: "health",
    lateGraceMinutes: 60,
    ownerWidgetType: "energy",
    ownerTaskKey: "energy-reminder-0",
    widgetTaskKind: "energy-checkin",
    widgetTaskMeta: {
      timeZoneMode: "floating-local"
    },
    status: "done",
    archived: false,
    historyOnly: false,
    templateId: "",
    googleCalendar: {}
  };

  const payload = buildGoogleCalendarScheduleSyncRequest({
    tasks: [recurringTemplate]
  }, {
    calendarId: "lifetree-cal",
    calendarSummary: "Lifetree",
    calendarTimeZone: "America/Los_Angeles"
  }, {
    userTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.totalEligibleTasks, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.tasks[0].taskId, "energy-reminder-0");
  assert.equal(payload.tasks[0].needsPush, true);
  assert.equal(payload.tasks[0].needsStatusPush, false);
});

test("event payload mirrors lifecycle state into the Google description footer and private metadata", () => {
  const payload = buildGoogleCalendarEventPayload({
    taskId: "pack-trip",
    name: "Pack for departure",
    details: "Finish the packing list.",
    dueDate: "2026-04-05",
    startDate: "2026-04-05",
    timeOfDay: "20:00",
    length: "medium",
    recurrence: { type: "none" },
    reminders: { enabled: true, dueSoonMinutes: 60, overdueMinutes: 15 },
    importance: "high",
    categoryKey: "travel",
    lateGraceMinutes: 15,
    ownerWidgetType: "travel",
    ownerTaskKey: "pack-trip",
    widgetTaskKind: "travel-pack",
    widgetTaskMeta: {
      timeZoneMode: "floating-local"
    },
    history: [{ id: "pack-trip-h1", type: "completed", at: new Date("2026-04-04T19:15:00-07:00").getTime() }],
    status: "done",
    googleCalendar: {},
    userTimeZone: "America/Los_Angeles"
  }, {
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(payload.summary, "8:00 PM Pack for departure (Completed)");
  assert.match(payload.description, /Lifetree status: completed/);
  assert.equal(payload.extendedProperties.private.lifetreeStatus, "completed");
  assert.equal(payload.extendedProperties.private.lifetreeLifecycleType, "completed");
});

test("schedule patch parser reads Google event schedule fields back into Lifetree form", () => {
  const patch = buildGoogleCalendarTaskSchedulePatchFromEvent({
    summary: "Retinol",
    description: "Use every other week.\n\nCreated by Lifetree.\n\nLifetree task ID: weekly-retinol",
    location: "Bathroom",
    start: {
      dateTime: "2026-04-08T21:30:00-07:00",
      timeZone: "America/Los_Angeles"
    },
    end: {
      dateTime: "2026-04-08T21:45:00-07:00",
      timeZone: "America/Los_Angeles"
    },
    recurrence: [
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;UNTIL=20260531"
    ],
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 45 }]
    },
    extendedProperties: {
      private: {
        lifetreeLength: "very-short",
        lifetreeImportance: "medium",
        lifetreeCategoryKey: "health",
        lifetreeLateGraceMinutes: "15",
        lifetreeTimeZoneMode: "fixed",
        lifetreeWidgetType: "travel",
        lifetreeWidgetTaskKind: "check-in"
      }
    }
  }, {
    calendarTimeZone: "America/Los_Angeles"
  });

  assert.equal(patch.name, "Retinol");
  assert.equal(patch.details, "Use every other week.");
  assert.equal(patch.startDate, "2026-04-08");
  assert.equal(patch.dueDate, "2026-04-08");
  assert.equal(patch.timeOfDay, "21:30");
  assert.deepEqual(patch.recurrence, {
    type: "weekly",
    interval: 2,
    weekday: 3,
    day: 1,
    ordinal: "first",
    sourceType: "",
    endDate: "2026-05-31",
    count: null,
    forever: false
  });
  assert.equal(patch.reminders.dueSoonMinutes, 45);
  assert.equal(patch.widgetTaskMeta.googleCalendarLocation, "Bathroom");
});
