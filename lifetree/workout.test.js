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
