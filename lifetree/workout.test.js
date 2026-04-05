import test from "node:test";
import assert from "node:assert/strict";
import { workoutWidgetDefinition } from "./widgets/workout.js";

test("workout widget normalization backfills distinct ids for legacy plans before syncing templates", () => {
  let idCounter = 0;
  const createId = () => `generated-${++idCounter}`;
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [
        {
          name: "Yoga",
          workoutType: "Yoga",
          durationMinutes: 60,
          intensity: "moderate",
          caloriesBurned: 250,
          recurrence: {
            type: "daily",
            interval: 1,
            timeOfDay: "19:30",
            additionalTimes: []
          }
        },
        {
          name: "Dog walk",
          workoutType: "Dog walk",
          durationMinutes: 30,
          intensity: "low",
          caloriesBurned: 150,
          recurrence: {
            type: "daily",
            interval: 1,
            timeOfDay: "18:30",
            additionalTimes: []
          }
        }
      ],
      weightTracking: {
        enabled: false
      }
    },
    data: {
      workoutEntries: [],
      weightEntries: []
    },
    createdAt: 100,
    updatedAt: 100
  }, {
    createId,
    now: 100,
    maxWidgets: 5
  });

  const planIds = widget.settings.workoutPlans.map((plan) => plan.id);
  assert.equal(planIds.length, 2);
  assert.ok(planIds[0]);
  assert.ok(planIds[1]);
  assert.notEqual(planIds[0], planIds[1]);

  const store = {
    tasks: []
  };
  const templateIdSeed = { value: 0 };
  workoutWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `task-${++templateIdSeed.value}`,
      todayString: () => "2026-04-04",
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#7dbf74"
      }),
      regenerateSeries: () => {},
      retireWidgetOwnedSeries: () => {}
    }
  });

  assert.equal(store.tasks.length, 2);
  assert.deepEqual(
    new Set(store.tasks.map((task) => task.name)),
    new Set(["Yoga", "Dog walk"])
  );
  assert.deepEqual(
    new Set(store.tasks.map((task) => task.ownerTaskKey)),
    new Set([
      `workout-plan:${planIds[0]}:slot:0`,
      `workout-plan:${planIds[1]}:slot:0`
    ])
  );
});

test("workout widget recovers an orphaned daily plan from a generated task whose template is missing", () => {
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [],
      weightTracking: {
        enabled: false
      }
    },
    data: {
      workoutEntries: [],
      weightEntries: []
    },
    createdAt: 100,
    updatedAt: 100
  }, {
    createId: () => "widget-id",
    now: 100,
    maxWidgets: 5
  });

  const store = {
    tasks: [
      {
        id: "dog-walk-generated",
        templateId: "missing-template",
        occurrenceIndex: 5,
        name: "Dog walk",
        details: "Created by Workout Coach.",
        startDate: "2026-04-04",
        dueDate: "2026-04-04",
        timeOfDay: "18:30",
        lateGraceMinutes: 15,
        notBeforeAt: 0,
        pointsValue: 3,
        pointsEntryId: "",
        length: "medium",
        categoryKey: "health",
        categoryLabel: "Health",
        categoryColor: "#7dbf74",
        importance: "medium",
        status: "done",
        createdAt: 100,
        updatedAt: 200,
        ownerWidgetId: "workout-widget",
        ownerWidgetType: "workout",
        ownerTaskKey: "workout-plan:dog-walk:slot:0",
        widgetTaskKind: "workout-session",
        widgetTaskMeta: {
          planId: "dog-walk",
          workoutType: "Dog walk",
          durationMinutes: 30,
          intensity: "low",
          caloriesBurned: 150,
          recurrenceType: "daily",
          slotKey: "workout-plan:dog-walk:slot:0"
        },
        linkedSeries: {
          groupId: "workout-widget:workout-plan:dog-walk",
          kind: "daily-window",
          slotIndex: 0,
          slotCount: 1
        },
        sequenceDependencyId: "",
        widgetCompletion: {
          mechanism: "workout-log",
          lockout: "current-day"
        },
        skipRule: {
          type: "widget-lockout",
          policy: "workout-next-window"
        },
        dependencies: [],
        recurrence: {
          type: "generated",
          sourceType: "daily"
        },
        archived: false,
        historyOnly: false,
        history: [
          {
            id: "hist-1",
            type: "completed",
            at: 200
          }
        ]
      }
    ]
  };

  let createdTaskId = 0;
  workoutWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `task-${++createdTaskId}`,
      todayString: () => "2026-04-04",
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#7dbf74"
      }),
      regenerateSeries: () => {},
      retireWidgetOwnedSeries: () => {}
    }
  });

  assert.equal(widget.settings.workoutPlans.length, 1);
  assert.equal(widget.settings.workoutPlans[0].id, "dog-walk");
  assert.equal(widget.settings.workoutPlans[0].workoutType, "Dog walk");
  assert.equal(widget.settings.workoutPlans[0].recurrence?.type, "daily");
  assert.equal(widget.settings.workoutPlans[0].recurrence?.timeOfDay, "18:30");
  assert.ok(store.tasks.some((task) => !task.templateId && task.widgetTaskKind === "workout-session" && task.name === "Dog walk"));
});

test("workout widget recovers a plan from recent archived-series evidence after widget ownership drifts", () => {
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget-current",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [],
      weightTracking: {
        enabled: false
      }
    },
    data: {
      workoutEntries: [],
      weightEntries: []
    },
    createdAt: 100,
    updatedAt: 100
  }, {
    createId: () => "widget-id",
    now: 100,
    maxWidgets: 5
  });

  const store = {
    tasks: [
      {
        id: "dog-walk-template::archived",
        templateId: "",
        occurrenceIndex: 0,
        name: "Dog walk",
        details: "Created by Workout Coach.",
        startDate: "2026-04-04",
        dueDate: "2026-04-04",
        timeOfDay: "18:30",
        lateGraceMinutes: 15,
        notBeforeAt: 0,
        pointsValue: 3,
        pointsEntryId: "",
        length: "medium",
        categoryKey: "health",
        categoryLabel: "Health",
        categoryColor: "#7dbf74",
        importance: "medium",
        status: "done",
        createdAt: 100,
        updatedAt: 200,
        ownerWidgetId: "workout-widget-old",
        ownerWidgetType: "workout",
        ownerTaskKey: "workout-plan:dog-walk:slot:0",
        widgetTaskKind: "workout-session",
        widgetTaskMeta: {
          planId: "dog-walk",
          workoutType: "Dog walk",
          durationMinutes: 30,
          intensity: "low",
          caloriesBurned: 150,
          recurrenceType: "daily",
          slotKey: "workout-plan:dog-walk:slot:0"
        },
        linkedSeries: {
          groupId: "workout-widget-old:workout-plan:dog-walk",
          kind: "daily-window",
          slotIndex: 0,
          slotCount: 1
        },
        sequenceDependencyId: "",
        widgetCompletion: {
          mechanism: "workout-log",
          lockout: "current-day"
        },
        skipRule: {
          type: "widget-lockout",
          policy: "workout-next-window"
        },
        dependencies: [],
        recurrence: {
          type: "archived-series"
        },
        archived: true,
        historyOnly: false,
        history: [
          {
            id: "hist-1",
            type: "completed",
            at: Date.parse("2026-04-04T18:35:00-07:00")
          }
        ]
      }
    ]
  };

  let createdTaskId = 0;
  workoutWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `task-${++createdTaskId}`,
      todayString: () => "2026-04-04",
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#7dbf74"
      }),
      regenerateSeries: () => {},
      retireWidgetOwnedSeries: () => {}
    }
  });

  assert.equal(widget.settings.workoutPlans.length, 1);
  assert.equal(widget.settings.workoutPlans[0].id, "dog-walk");
  assert.equal(widget.settings.workoutPlans[0].workoutType, "Dog walk");
  assert.equal(widget.settings.workoutPlans[0].recurrence?.type, "daily");
  assert.equal(widget.settings.workoutPlans[0].recurrence?.timeOfDay, "18:30");
  assert.ok(store.tasks.some((task) => !task.templateId && task.widgetTaskKind === "workout-session" && task.name === "Dog walk" && task.ownerWidgetId === widget.id));
});
