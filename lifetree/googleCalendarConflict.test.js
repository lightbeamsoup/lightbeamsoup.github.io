import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRemoteDeletedGoogleCalendarTask,
  shouldTreatMissingLinkedGoogleCalendarEventAsRemoteDeletion
} from "./modules/googleCalendarConflict.js";

test("missing linked Google events become remote deletions only when local sync is otherwise clean", () => {
  const baseTask = {
    googleCalendar: {
      eventId: "event-1"
    },
    needsPush: false,
    needsStatusPush: false
  };

  assert.equal(shouldTreatMissingLinkedGoogleCalendarEventAsRemoteDeletion(baseTask, {
    linkedEventMissing: true,
    canonicalEvent: null
  }), true);
  assert.equal(shouldTreatMissingLinkedGoogleCalendarEventAsRemoteDeletion({
    ...baseTask,
    needsPush: true
  }, {
    linkedEventMissing: true,
    canonicalEvent: null
  }), false);
  assert.equal(shouldTreatMissingLinkedGoogleCalendarEventAsRemoteDeletion(baseTask, {
    linkedEventMissing: true,
    canonicalEvent: { id: "event-1" }
  }), false);
});

test("remote deletion removes open one-off tasks and cleans dependency references", () => {
  const markers = [];
  const store = {
    tasks: [
      {
        id: "task-1",
        name: "Dog walk",
        status: "open",
        templateId: "",
        recurrence: { type: "none" },
        history: [],
        googleCalendar: {
          calendarId: "lifetree-cal",
          eventId: "event-1"
        },
        dependencies: [],
        sequenceDependencyId: "",
        createdAt: 10,
        updatedAt: 10
      },
      {
        id: "task-2",
        name: "Feed dog",
        status: "open",
        templateId: "",
        recurrence: { type: "none" },
        history: [],
        googleCalendar: {},
        dependencies: ["task-1"],
        sequenceDependencyId: "task-1",
        createdAt: 20,
        updatedAt: 20
      }
    ]
  };

  const result = applyRemoteDeletedGoogleCalendarTask(store, "task-1", {
    now: 50,
    addDeletionMarker: (type, value, deletedAt) => {
      markers.push({ type, value, deletedAt });
    }
  });

  assert.equal(result.changed, true);
  assert.equal(result.removedCount, 1);
  assert.equal(result.archivedCount, 0);
  assert.deepEqual(markers, [{
    type: "task-id",
    value: "task-1",
    deletedAt: 50
  }]);
  assert.deepEqual(store.tasks.map((task) => task.id), ["task-2"]);
  assert.deepEqual(store.tasks[0].dependencies, []);
  assert.equal(store.tasks[0].sequenceDependencyId, "");
});

test("remote deletion archives recurring history and removes the active series from sync", () => {
  const markers = [];
  const store = {
    tasks: [
      {
        id: "series-1",
        name: "Energy check-in",
        status: "done",
        templateId: "",
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
        history: [{
          id: "hist-1",
          type: "completed",
          at: 100
        }],
        googleCalendar: {
          calendarId: "lifetree-cal",
          eventId: "event-series"
        },
        dependencies: [],
        sequenceDependencyId: "",
        createdAt: 10,
        updatedAt: 10
      },
      {
        id: "series-1-open",
        name: "Energy check-in",
        status: "open",
        templateId: "series-1",
        recurrence: { type: "generated", sourceType: "daily" },
        history: [],
        googleCalendar: {},
        dependencies: [],
        sequenceDependencyId: "",
        createdAt: 20,
        updatedAt: 20
      },
      {
        id: "series-1-closed",
        name: "Energy check-in",
        status: "done",
        templateId: "series-1",
        recurrence: { type: "generated", sourceType: "daily" },
        history: [{
          id: "hist-2",
          type: "completed",
          at: 120
        }],
        googleCalendar: {
          calendarId: "lifetree-cal",
          eventId: "instance-event"
        },
        dependencies: ["series-1-open"],
        sequenceDependencyId: "series-1-open",
        createdAt: 30,
        updatedAt: 30
      },
      {
        id: "task-3",
        name: "Something else",
        status: "open",
        templateId: "",
        recurrence: { type: "none" },
        history: [],
        googleCalendar: {},
        dependencies: ["series-1-open"],
        sequenceDependencyId: "series-1-open",
        createdAt: 40,
        updatedAt: 40
      }
    ]
  };

  const result = applyRemoteDeletedGoogleCalendarTask(store, "series-1", {
    now: 500,
    addDeletionMarker: (type, value, deletedAt) => {
      markers.push({ type, value, deletedAt });
    }
  });

  assert.equal(result.changed, true);
  assert.equal(result.removedCount, 2);
  assert.equal(result.archivedCount, 2);
  assert.deepEqual(markers, [{
    type: "series-id",
    value: "series-1",
    deletedAt: 500
  }]);
  assert.ok(store.tasks.find((task) => task.id === "series-1::archived"));
  assert.equal(store.tasks.find((task) => task.id === "series-1::archived")?.googleCalendar?.eventId || "", "");
  assert.equal(store.tasks.find((task) => task.id === "series-1-closed")?.archived, true);
  assert.equal(store.tasks.find((task) => task.id === "series-1-closed")?.googleCalendar?.eventId || "", "");
  assert.equal(store.tasks.some((task) => task.id === "series-1"), false);
  assert.equal(store.tasks.some((task) => task.id === "series-1-open"), false);
  assert.deepEqual(store.tasks.find((task) => task.id === "task-3")?.dependencies || [], []);
  assert.equal(store.tasks.find((task) => task.id === "task-3")?.sequenceDependencyId || "", "");
});
