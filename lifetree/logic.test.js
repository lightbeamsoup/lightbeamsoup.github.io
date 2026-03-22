import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryFeed, computeOccurrenceDate, createArchivedSeriesRecord, nthWeekdayOfMonth } from "./logic.js";

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
