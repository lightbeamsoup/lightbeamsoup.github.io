import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLogicalWidgetTaskKey,
  buildHistoryFeed,
  compareTaskResolutionPreference,
  compactTaskHistory,
  computeRecurringNotBeforeAt,
  computeOccurrenceDate,
  createArchivedSeriesRecord,
  findNextWidgetCompletionTask,
  getLatestLifecycleEntry,
  isTaskEligibleForWidgetCompletion,
  nthWeekdayOfMonth
  ,
  shouldAutoSkipTask
} from "./logic.js";
import { computeInitialReminderDate, findActiveEnergyCompletionTask, syncEnergyTaskChain } from "./widgets/energy.js";

test("computes weekly recurrence dates", () => {
  const result = computeOccurrenceDate("2026-03-23", { type: "weekly", interval: 1, weekday: 2 }, 1);
  assert.equal(result, "2026-03-31");
});

test("computes last weekday of month", () => {
  const result = nthWeekdayOfMonth(2026, 2, 2, "last");
  assert.equal(result, "2026-03-31");
});

test("computes monthly weekday recurrence with interval", () => {
  const result = computeOccurrenceDate("2026-03-03", { type: "monthly-weekday", interval: 2, weekday: 2, ordinal: "first" }, 1);
  assert.equal(result, "2026-05-05");
});

test("computes recurring not-before timestamps by cadence", () => {
  assert.equal(computeRecurringNotBeforeAt("daily", "2026-03-23"), new Date(2026, 2, 23, 0, 0, 0, 0).getTime());
  assert.equal(computeRecurringNotBeforeAt("weekly", "2026-03-25"), new Date(2026, 2, 22, 0, 0, 0, 0).getTime());
  assert.equal(computeRecurringNotBeforeAt("monthly-date", "2026-03-25"), new Date(2026, 2, 1, 0, 0, 0, 0).getTime());
});

test("builds history feed with sorting and filtering while ignoring edit-only records", () => {
  const tasks = [
    {
      id: "a",
      name: "Alpha",
      status: "done",
      history: [
        { id: "a-1", type: "completed", at: 100 },
        { id: "a-2", type: "edited", at: 200 }
      ]
    },
    {
      id: "b",
      name: "Beta",
      status: "skipped",
      history: [{ id: "b-1", type: "skipped", at: 150 }]
    }
  ];

  const newest = buildHistoryFeed(tasks, "newest", "all");
  assert.equal(newest[0].type, "skipped");
  assert.equal(newest[0].historyId, "b-1");
  assert.equal(newest.some((item) => item.type === "edited"), false);
  const filtered = buildHistoryFeed(tasks, "newest", "skipped");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].taskName, "Beta");
});

test("history feed includes due timing details", () => {
  const tasks = [
    {
      id: "energy-1",
      name: "Morning energy check-in",
      status: "done",
      dueDate: "2026-03-22",
      timeOfDay: "07:00",
      history: [{ id: "energy-1-h1", type: "completed", at: new Date("2026-03-22T07:05:00").getTime() }]
    },
    {
      id: "energy-2",
      name: "Midday energy check-in",
      status: "skipped",
      dueDate: "2026-03-22",
      timeOfDay: "12:00",
      history: [{ id: "energy-2-h1", type: "skipped", at: new Date("2026-03-22T12:30:00").getTime() }]
    }
  ];

  const feed = buildHistoryFeed(tasks, "newest", "all");
  const completed = feed.find((item) => item.taskId === "energy-1");
  const skipped = feed.find((item) => item.taskId === "energy-2");

  assert.equal(completed.scheduledLabel, "Due Mar 22 at 7:00 AM");
  assert.equal(completed.timingStatus, "on-time");
  assert.equal(completed.timingLabel, "On time");
  assert.equal(skipped.timingStatus, "missed");
  assert.equal(skipped.timingLabel, "Missed due time");
});

test("history feed respects task-specific late grace minutes", () => {
  const tasks = [
    {
      id: "energy-grace",
      name: "Evening energy check-in",
      status: "done",
      dueDate: "2026-03-22",
      timeOfDay: "19:00",
      lateGraceMinutes: 60,
      history: [{ id: "energy-grace-h1", type: "completed", at: new Date("2026-03-22T19:45:00").getTime() }]
    },
    {
      id: "manual-grace",
      name: "Clothes return",
      status: "skipped",
      dueDate: "2026-03-22",
      timeOfDay: "20:00",
      lateGraceMinutes: 15,
      history: [{ id: "manual-grace-h1", type: "skipped", at: new Date("2026-03-22T20:10:00").getTime() }]
    }
  ];

  const feed = buildHistoryFeed(tasks, "newest", "all");
  const energy = feed.find((item) => item.taskId === "energy-grace");
  const manual = feed.find((item) => item.taskId === "manual-grace");

  assert.equal(energy.timingStatus, "on-time");
  assert.equal(energy.timingLabel, "On time");
  assert.equal(manual.timingStatus, "neutral");
  assert.equal(manual.timingLabel, "Skipped within grace period");
});

test("preserves deleted series template history through archived records", () => {
  const archived = createArchivedSeriesRecord({
    id: "series-1",
    templateId: "",
    occurrenceIndex: 0,
    name: "Workout",
    status: "done",
    recurrence: { type: "weekly", interval: 1, weekday: 2 },
    history: [{ id: "series-1-h1", type: "completed", at: 300 }]
  });

  const feed = buildHistoryFeed([archived], "newest", "completed");
  assert.equal(feed.length, 1);
  assert.equal(feed[0].taskName, "Workout");
  assert.equal(feed[0].type, "completed");
  assert.equal(feed[0].historyId, "series-1-h1");
  assert.equal(archived.archived, true);
  assert.equal(archived.id, "series-1::archived");
});

test("archived series records keep a canonical id when re-archived", () => {
  const firstArchived = createArchivedSeriesRecord({
    id: "series-2",
    templateId: "",
    occurrenceIndex: 0,
    name: "Energy check-in",
    status: "skipped",
    recurrence: { type: "daily", interval: 1 },
    history: [{ id: "series-2-h1", type: "skipped", at: 400 }]
  });

  const secondArchived = createArchivedSeriesRecord(firstArchived);
  assert.equal(secondArchived.id, "series-2::archived");
  assert.equal(secondArchived.seriesOriginId, "series-2");
});

test("prefers the task with stronger lifecycle evidence during merges", () => {
  const staleOpen = {
    id: "energy-merge",
    status: "open",
    createdAt: 10,
    history: []
  };
  const completed = {
    id: "energy-merge",
    status: "done",
    createdAt: 5,
    history: [{ id: "energy-merge-h1", type: "completed", at: 500 }]
  };

  assert.ok(compareTaskResolutionPreference(completed, staleOpen) > 0);
  assert.equal(getLatestLifecycleEntry(completed)?.type, "completed");
});

test("prefers completed over skipped for the same logical task without a reopen", () => {
  const completed = {
    id: "energy-slot",
    status: "done",
    createdAt: 10,
    history: [{ id: "slot-h1", type: "completed", at: 100 }]
  };
  const skipped = {
    id: "energy-slot",
    status: "skipped",
    createdAt: 20,
    history: [{ id: "slot-h2", type: "skipped", at: 200 }]
  };

  assert.ok(compareTaskResolutionPreference(completed, skipped) > 0);
});

test("logical widget task keys ignore status and lifecycle noise", () => {
  const doneTask = {
    ownerWidgetType: "energy",
    ownerTaskKey: "energy-reminder-1",
    templateId: "series-1",
    occurrenceIndex: 1,
    dueDate: "2026-03-22",
    startDate: "2026-03-22",
    timeOfDay: "12:00",
    status: "done",
    history: [{ id: "a", type: "completed", at: 100 }]
  };
  const skippedTask = {
    ...doneTask,
    status: "skipped",
    history: [{ id: "b", type: "skipped", at: 200 }]
  };

  assert.equal(buildLogicalWidgetTaskKey(doneTask), buildLogicalWidgetTaskKey(skippedTask));
});

test("energy task keys collapse reminder-label drift for the same scheduled slot", () => {
  const morningKeyTask = {
    ownerWidgetType: "energy",
    ownerTaskKey: "energy-reminder-0",
    templateId: "",
    occurrenceIndex: 0,
    recurrence: { type: "daily" },
    dueDate: "2026-03-22",
    startDate: "2026-03-22",
    timeOfDay: "12:00"
  };
  const middayKeyTask = {
    ...morningKeyTask,
    ownerTaskKey: "energy-reminder-1"
  };

  assert.equal(buildLogicalWidgetTaskKey(morningKeyTask), buildLogicalWidgetTaskKey(middayKeyTask));
});

test("compacts repeated lifecycle history entries", () => {
  const compacted = compactTaskHistory([
    { id: "h1", type: "skipped", at: 100 },
    { id: "h2", type: "skipped", at: 200 },
    { id: "h3", type: "reopened", at: 300 },
    { id: "h4", type: "completed", at: 400 },
    { id: "h5", type: "completed", at: 500 }
  ]);

  assert.deepEqual(compacted.map((item) => item.id), ["h2", "h3", "h5"]);
});

test("compacts invalid closed-state lifecycle transitions without a reopen", () => {
  const compacted = compactTaskHistory([
    { id: "h1", type: "completed", at: 100 },
    { id: "h2", type: "skipped", at: 200 },
    { id: "h3", type: "reopened", at: 300 },
    { id: "h4", type: "skipped", at: 400 }
  ]);

  assert.deepEqual(compacted.map((item) => item.id), ["h1", "h3", "h4"]);
});

test("current-day widget completion does not allow future tasks", () => {
  const tomorrowTask = {
    id: "future",
    ownerWidgetId: "energy-1",
    status: "open",
    dueDate: "2026-03-22",
    timeOfDay: "07:00",
    widgetCompletion: { mechanism: "energy-vote", lockout: "current-day" }
  };

  assert.equal(isTaskEligibleForWidgetCompletion(tomorrowTask, "2026-03-21"), false);
});

test("finds the next eligible widget-owned task by schedule order", () => {
  const tasks = [
    {
      id: "future",
      ownerWidgetId: "energy-1",
      status: "open",
      dueDate: "2026-03-22",
      timeOfDay: "07:00",
      occurrenceIndex: 1,
      createdAt: 1,
      widgetCompletion: { mechanism: "energy-vote", lockout: "current-day" }
    },
    {
      id: "midday",
      ownerWidgetId: "energy-1",
      status: "open",
      dueDate: "2026-03-21",
      timeOfDay: "12:00",
      occurrenceIndex: 0,
      createdAt: 2,
      widgetCompletion: { mechanism: "energy-vote", lockout: "current-day" }
    },
    {
      id: "morning",
      ownerWidgetId: "energy-1",
      status: "open",
      dueDate: "2026-03-21",
      timeOfDay: "07:00",
      occurrenceIndex: 0,
      createdAt: 3,
      widgetCompletion: { mechanism: "energy-vote", lockout: "current-day" }
    }
  ];

  const nextTask = findNextWidgetCompletionTask(tasks, "energy-1", "energy-vote", "2026-03-21");
  assert.equal(nextTask.id, "morning");
});

test("auto-skip can trigger after a due-time grace period", () => {
  const task = {
    id: "late-task",
    status: "open",
    dueDate: "2026-03-21",
    timeOfDay: "09:00",
    skipRule: { type: "after-due-minutes", graceMinutes: 30 }
  };

  assert.equal(shouldAutoSkipTask(task, new Date("2026-03-21T09:20:00")), false);
  assert.equal(shouldAutoSkipTask(task, new Date("2026-03-21T09:31:00")), true);
});

test("auto-skip can trigger at end of scheduled day", () => {
  const task = {
    id: "end-of-day",
    status: "open",
    dueDate: "2026-03-21",
    skipRule: { type: "end-of-day" }
  };

  assert.equal(shouldAutoSkipTask(task, new Date("2026-03-21T22:00:00")), false);
  assert.equal(shouldAutoSkipTask(task, new Date("2026-03-22T00:01:00")), true);
});

test("energy completion only targets the active reminder window", () => {
  const tasks = [
    {
      id: "morning",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "skipped",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "07:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" }
    },
    {
      id: "midday",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "open",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "12:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" }
    },
    {
      id: "evening",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "open",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "19:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" }
    }
  ];

  const beforeMorning = findActiveEnergyCompletionTask(tasks, "energy-1", "energy-vote", new Date("2026-03-22T06:59:59"));
  const midday = findActiveEnergyCompletionTask(tasks, "energy-1", "energy-vote", new Date("2026-03-22T12:30:00"));

  assert.equal(beforeMorning, null);
  assert.equal(midday?.id, "midday");
});

test("energy task chain blocks tomorrow morning until today evening is cleared", () => {
  const tasks = [
    {
      id: "morning-today",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "done",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "07:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: []
    },
    {
      id: "midday-today",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "done",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "12:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: []
    },
    {
      id: "evening-today",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "open",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "19:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: []
    },
    {
      id: "morning-tomorrow",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "open",
      archived: false,
      dueDate: "2026-03-23",
      timeOfDay: "07:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: []
    }
  ];

  syncEnergyTaskChain(tasks, "energy-1");
  const activeAt8am = findActiveEnergyCompletionTask(tasks, "energy-1", "energy-vote", new Date("2026-03-23T08:00:00"));
  assert.equal(activeAt8am, null);

  tasks.find((task) => task.id === "evening-today").status = "skipped";
  const morningNextDay = findActiveEnergyCompletionTask(tasks, "energy-1", "energy-vote", new Date("2026-03-23T08:00:00"));
  assert.equal(morningNextDay?.id, "morning-tomorrow");
  assert.deepEqual(tasks.find((task) => task.id === "morning-tomorrow").dependencies, ["evening-today"]);
});

test("energy completion does not allow tomorrow's reminder before midnight", () => {
  const tasks = [
    {
      id: "evening-today",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "skipped",
      archived: false,
      dueDate: "2026-03-22",
      timeOfDay: "19:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: [],
      notBeforeAt: new Date("2026-03-22T00:00:00").getTime()
    },
    {
      id: "morning-tomorrow",
      ownerWidgetId: "energy-1",
      ownerWidgetType: "energy",
      status: "open",
      archived: false,
      dueDate: "2026-03-23",
      timeOfDay: "07:00",
      widgetCompletion: { mechanism: "energy-vote", lockout: "scheduled-window" },
      dependencies: ["evening-today"],
      notBeforeAt: new Date("2026-03-23T00:00:00").getTime()
    }
  ];

  const beforeMidnight = tasks.filter((task) => !(typeof task.notBeforeAt === "number" && task.notBeforeAt > new Date("2026-03-22T23:30:00").getTime()));
  const afterMidnight = tasks.filter((task) => !(typeof task.notBeforeAt === "number" && task.notBeforeAt > new Date("2026-03-23T08:00:00").getTime()));

  assert.equal(findActiveEnergyCompletionTask(beforeMidnight, "energy-1", "energy-vote", new Date("2026-03-22T23:30:00")), null);
  assert.equal(findActiveEnergyCompletionTask(afterMidnight, "energy-1", "energy-vote", new Date("2026-03-23T08:00:00"))?.id, "morning-tomorrow");
});

test("fresh energy widget seeds only the current and future reminder windows for today", () => {
  const reminderTimes = ["07:00", "12:00", "19:00"];
  const eveningNow = new Date("2026-03-22T20:15:00");

  assert.equal(computeInitialReminderDate("2026-03-22", reminderTimes, 0, eveningNow), "2026-03-23");
  assert.equal(computeInitialReminderDate("2026-03-22", reminderTimes, 1, eveningNow), "2026-03-23");
  assert.equal(computeInitialReminderDate("2026-03-22", reminderTimes, 2, eveningNow), "2026-03-22");
});
