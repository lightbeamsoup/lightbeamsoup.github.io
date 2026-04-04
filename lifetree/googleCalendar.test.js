import test from "node:test";
import assert from "node:assert/strict";
import {
  choosePreferredGoogleCalendarIntegration,
  normalizeGoogleCalendarIntegration
} from "./modules/googleCalendar.js";

test("google calendar integration normalizes pending deletions and expires stale entries", () => {
  const now = Date.now();
  const integration = normalizeGoogleCalendarIntegration({
    calendarId: "lifetree-cal",
    pendingDeletions: [
      {
        calendarId: "lifetree-cal",
        eventId: "event-1",
        taskId: "task-1",
        deletedAt: now
      },
      {
        calendarId: "lifetree-cal",
        eventId: "event-2",
        taskId: "task-2",
        deletedAt: now - (1000 * 60 * 60 * 24 * 45)
      }
    ]
  });

  assert.equal(integration.pendingDeletions.length, 1);
  assert.equal(integration.pendingDeletions[0].eventId, "event-1");
  assert.equal(integration.pendingDeletions[0].taskId, "task-1");
});

test("google calendar integration merges pending deletions across local and remote copies", () => {
  const now = Date.now();
  const local = {
    calendarId: "lifetree-cal",
    updatedAt: 10,
    pendingDeletions: [
      {
        id: "lifetree-cal:event-1",
        calendarId: "lifetree-cal",
        eventId: "event-1",
        taskId: "task-1",
        deletedAt: now - 1000,
        kind: "task"
      }
    ]
  };
  const remote = {
    calendarId: "lifetree-cal",
    updatedAt: 20,
    pendingDeletions: [
      {
        id: "lifetree-cal:event-2",
        calendarId: "lifetree-cal",
        eventId: "event-2",
        taskId: "task-2",
        deletedAt: now,
        kind: "series"
      }
    ]
  };

  const preferred = choosePreferredGoogleCalendarIntegration(local, remote);
  assert.equal(preferred.calendarId, "lifetree-cal");
  assert.deepEqual(
    preferred.pendingDeletions.map((entry) => entry.id),
    ["lifetree-cal:event-2", "lifetree-cal:event-1"]
  );
});
