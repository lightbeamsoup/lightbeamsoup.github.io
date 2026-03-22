import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryFeed,
  computeOccurrenceDate,
  createArchivedSeriesRecord,
  findNextWidgetCompletionTask,
  isTaskEligibleForWidgetCompletion,
  nthWeekdayOfMonth
  ,
  shouldAutoSkipTask
} from "./logic.js";

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

test("builds history feed with sorting and filtering", () => {
  const tasks = [
    {
      id: "a",
      name: "Alpha",
      status: "done",
      history: [
        { type: "completed", at: 100 },
        { type: "edited", at: 200 }
      ]
    },
    {
      id: "b",
      name: "Beta",
      status: "skipped",
      history: [{ type: "skipped", at: 150 }]
    }
  ];

  const newest = buildHistoryFeed(tasks, "newest", "all");
  assert.equal(newest[0].type, "edited");
  const filtered = buildHistoryFeed(tasks, "newest", "skipped");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].taskName, "Beta");
});

test("preserves deleted series template history through archived records", () => {
  const archived = createArchivedSeriesRecord({
    id: "series-1",
    templateId: "",
    occurrenceIndex: 0,
    name: "Workout",
    status: "done",
    recurrence: { type: "weekly", interval: 1, weekday: 2 },
    history: [{ type: "completed", at: 300 }]
  });

  const feed = buildHistoryFeed([archived], "newest", "completed");
  assert.equal(feed.length, 1);
  assert.equal(feed[0].taskName, "Workout");
  assert.equal(feed[0].type, "completed");
  assert.equal(archived.archived, true);
  assert.equal(archived.id, "series-1::archived");
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
