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

test("workout widget normalization dedupes duplicate plan ids for the same plan", () => {
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [
        {
          id: "dog-walk",
          name: "Dog walk",
          workoutType: "Dog walk",
          durationMinutes: 15,
          intensity: "low",
          caloriesBurned: 50,
          recurrence: {
            type: "daily",
            interval: 1,
            timeOfDay: "18:30",
            additionalTimes: []
          },
          updatedAt: 100
        },
        {
          id: "dog-walk",
          name: "Dog walk",
          workoutType: "Dog walk",
          durationMinutes: 15,
          intensity: "low",
          caloriesBurned: 60,
          recurrence: {
            type: "daily",
            interval: 1,
            timeOfDay: "18:30",
            additionalTimes: []
          },
          updatedAt: 200
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
    createId: () => "unused-id",
    now: 100,
    maxWidgets: 5
  });

  assert.equal(widget.settings.workoutPlans.length, 1);
  assert.equal(widget.settings.workoutPlans[0].id, "dog-walk");
  assert.equal(widget.settings.workoutPlans[0].caloriesBurned, 60);
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

test("workout widget recovers a plan when generated evidence still points at an inactive archived template", () => {
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
        id: "dog-walk-template",
        templateId: "",
        occurrenceIndex: 0,
        name: "Dog walk",
        details: "Created by Workout Coach.",
        startDate: "2026-04-04",
        dueDate: "2026-04-04",
        timeOfDay: "18:30",
        status: "done",
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
        archived: true,
        history: [
          {
            id: "hist-template",
            type: "completed",
            at: Date.parse("2026-04-04T18:35:00-07:00")
          }
        ]
      },
      {
        id: "dog-walk-generated",
        templateId: "dog-walk-template",
        occurrenceIndex: 2,
        name: "Dog walk",
        details: "Created by Workout Coach.",
        startDate: "2026-04-04",
        dueDate: "2026-04-04",
        timeOfDay: "18:30",
        status: "done",
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
        recurrence: {
          type: "generated",
          sourceType: "daily"
        },
        archived: true,
        history: [
          {
            id: "hist-generated",
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
  assert.equal(widget.settings.workoutPlans[0].workoutType, "Dog walk");
  assert.ok(store.tasks.some((task) => !task.templateId && task.widgetTaskKind === "workout-session" && task.name === "Dog walk" && task.ownerWidgetId === widget.id));
});

test("workout widget does not auto-skip the recurring master template itself", () => {
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [
        {
          id: "yoga-plan",
          name: "Yoga",
          workoutType: "Yoga",
          durationMinutes: 60,
          intensity: "moderate",
          caloriesBurned: 250,
          recurrence: {
            type: "weekly",
            interval: 1,
            weekdays: [3],
            timeOfDay: "19:30",
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
    createId: () => "widget-id",
    now: 100,
    maxWidgets: 5
  });

  const store = { tasks: [] };
  let createdTaskId = 0;
  workoutWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `task-${++createdTaskId}`,
      todayString: () => "2026-04-01",
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#7dbf74"
      }),
      regenerateSeries: () => {},
      retireWidgetOwnedSeries: () => {}
    }
  });

  const template = store.tasks.find((task) => !task.templateId && task.widgetTaskKind === "workout-session");
  const generated = {
    ...template,
    id: "generated-1",
    templateId: template.id,
    recurrence: { type: "generated", sourceType: "weekly" },
    dueDate: "2026-04-08",
    startDate: "2026-04-08"
  };
  store.tasks.push(generated);

  const shouldSkipTemplate = workoutWidgetDefinition.shouldAutoSkipOwnedTask({
    task: template,
    now: new Date("2026-04-02T06:00:00-07:00"),
    store
  });
  const shouldSkipGenerated = workoutWidgetDefinition.shouldAutoSkipOwnedTask({
    task: generated,
    now: new Date("2026-04-09T06:00:00-07:00"),
    store
  });

  assert.equal(shouldSkipTemplate, false);
  assert.equal(shouldSkipGenerated, true);
});

test("workout widget reopens matching skipped and archived recurring masters from widget settings", () => {
  const widget = workoutWidgetDefinition.normalizeWidget({
    id: "workout-widget",
    type: "workout",
    slotIndex: 0,
    settings: {
      workoutPlans: [
        {
          id: "yoga-wed",
          name: "Yoga",
          workoutType: "Yoga",
          durationMinutes: 60,
          intensity: "moderate",
          caloriesBurned: 250,
          recurrence: {
            type: "weekly",
            interval: 1,
            weekdays: [3],
            timeOfDay: "19:30",
            additionalTimes: []
          }
        },
        {
          id: "yoga-sat",
          name: "Yoga",
          workoutType: "Yoga",
          durationMinutes: 75,
          intensity: "high",
          caloriesBurned: 250,
          recurrence: {
            type: "weekly",
            interval: 1,
            weekdays: [6],
            timeOfDay: "09:45",
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
    createId: () => "widget-id",
    now: 100,
    maxWidgets: 5
  });

  const store = {
    tasks: [
      {
        id: "yoga-wed-template",
        templateId: "",
        occurrenceIndex: 0,
        name: "Yoga",
        details: "Created by Workout Coach.",
        startDate: "2026-04-01",
        dueDate: "2026-04-01",
        timeOfDay: "19:30",
        lateGraceMinutes: 15,
        notBeforeAt: 0,
        pointsValue: 3,
        pointsEntryId: "",
        length: "medium",
        categoryKey: "health",
        categoryLabel: "Health",
        categoryColor: "#7dbf74",
        importance: "medium",
        status: "skipped",
        createdAt: 100,
        updatedAt: 200,
        ownerWidgetId: widget.id,
        ownerWidgetType: "workout",
        ownerTaskKey: "workout-plan:yoga-wed:weekday:3",
        widgetTaskKind: "workout-session",
        widgetTaskMeta: {
          planId: "yoga-wed",
          workoutType: "Yoga",
          durationMinutes: 60,
          intensity: "moderate",
          caloriesBurned: 250,
          recurrenceType: "weekly",
          slotKey: "workout-plan:yoga-wed:weekday:3"
        },
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
        archived: false,
        history: []
      },
      {
        id: "yoga-sat-template",
        templateId: "",
        occurrenceIndex: 0,
        name: "Yoga",
        details: "Created by Workout Coach.",
        startDate: "2026-03-28",
        dueDate: "2026-03-28",
        timeOfDay: "09:45",
        lateGraceMinutes: 15,
        notBeforeAt: 0,
        pointsValue: 3,
        pointsEntryId: "",
        length: "long",
        categoryKey: "health",
        categoryLabel: "Health",
        categoryColor: "#7dbf74",
        importance: "medium",
        status: "done",
        createdAt: 100,
        updatedAt: 200,
        ownerWidgetId: widget.id,
        ownerWidgetType: "workout",
        ownerTaskKey: "workout-plan:yoga-sat:weekday:6",
        widgetTaskKind: "workout-session",
        widgetTaskMeta: {
          planId: "yoga-sat",
          workoutType: "Yoga",
          durationMinutes: 75,
          intensity: "high",
          caloriesBurned: 250,
          recurrenceType: "weekly",
          slotKey: "workout-plan:yoga-sat:weekday:6"
        },
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
        archived: true,
        history: []
      }
    ]
  };

  const regenerated = [];
  workoutWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => "new-task",
      todayString: () => "2026-04-04",
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#7dbf74"
      }),
      regenerateSeries: (taskId) => regenerated.push(taskId),
      retireWidgetOwnedSeries: () => {}
    }
  });

  const wednesdayTemplate = store.tasks.find((task) => task.id === "yoga-wed-template");
  const saturdayTemplate = store.tasks.find((task) => task.id === "yoga-sat-template");

  assert.equal(wednesdayTemplate.status, "open");
  assert.equal(wednesdayTemplate.archived, false);
  assert.equal(wednesdayTemplate.dueDate, "2026-04-08");
  assert.equal(saturdayTemplate.status, "open");
  assert.equal(saturdayTemplate.archived, false);
  assert.equal(saturdayTemplate.dueDate, "2026-04-04");
  assert.deepEqual(new Set(regenerated), new Set(["yoga-wed-template", "yoga-sat-template"]));
});
