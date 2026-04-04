import test from "node:test";
import assert from "node:assert/strict";
import {
  computeInitialReminderDate,
  energyWidgetDefinition,
  reconcileEnergyReminderSettings,
  repairEnergyReminderTemplates
} from "./widgets/energy.js";

test("energy ensureTasks recreates a missing reminder template at the earliest open occurrence", () => {
  const widget = {
    id: "energy-widget",
    type: "energy",
    settings: {
      reminderTimes: ["07:00", "12:00", "19:00"],
      maxCheckins: 12
    },
    data: {
      entries: []
    }
  };
  const store = {
    tasks: [
      {
        id: "generated-2",
        templateId: "missing-template",
        occurrenceIndex: 2,
        ownerWidgetId: widget.id,
        ownerWidgetType: "energy",
        ownerTaskKey: "energy-reminder-0",
        widgetTaskKind: "energy-checkin",
        status: "open",
        archived: false,
        startDate: "2026-04-06",
        dueDate: "2026-04-06",
        timeOfDay: "07:00",
        recurrence: { type: "generated", sourceType: "daily" }
      },
      {
        id: "generated-1",
        templateId: "missing-template",
        occurrenceIndex: 1,
        ownerWidgetId: widget.id,
        ownerWidgetType: "energy",
        ownerTaskKey: "energy-reminder-0",
        widgetTaskKind: "energy-checkin",
        status: "open",
        archived: false,
        startDate: "2026-04-05",
        dueDate: "2026-04-05",
        timeOfDay: "07:00",
        recurrence: { type: "generated", sourceType: "daily" }
      }
    ]
  };
  const regenerated = [];
  let nextId = 0;

  energyWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `new-template-${nextId++}`,
      todayString: () => "2026-04-04",
      regenerateSeries: (templateId) => {
        regenerated.push(templateId);
      },
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#77aa77"
      })
    }
  });

  const template = store.tasks.find((task) => task.ownerTaskKey === "energy-reminder-0" && !task.templateId);
  assert.ok(template);
  assert.equal(template.dueDate, "2026-04-05");
  assert.equal(template.startDate, "2026-04-05");
  assert.ok(regenerated.includes(template.id));
});

test("energy reminder repair pulls future-drifted templates back to the current slot window", () => {
  const tasks = [
    {
      id: "energy-template",
      templateId: "",
      occurrenceIndex: 0,
      ownerWidgetId: "energy-widget",
      ownerWidgetType: "energy",
      ownerTaskKey: "energy-reminder-0",
      widgetTaskKind: "energy-checkin",
      status: "open",
      archived: false,
      startDate: "2026-04-12",
      dueDate: "2026-04-12",
      timeOfDay: "07:00",
      notBeforeAt: 0,
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
    }
  ];
  const regenerated = [];

  const changed = repairEnergyReminderTemplates(tasks, "energy-widget", {
    reminderTimes: ["07:00", "12:00", "19:00"],
    today: "2026-04-04",
    now: new Date("2026-04-04T17:00:00-07:00"),
    regenerateSeries: (templateId) => {
      regenerated.push(templateId);
    }
  });

  assert.deepEqual(changed, ["energy-template"]);
  assert.equal(tasks[0].startDate, "2026-04-05");
  assert.equal(tasks[0].dueDate, "2026-04-05");
  assert.equal(tasks[0].timeOfDay, "07:00");
  assert.ok(tasks[0].notBeforeAt > 0);
  assert.deepEqual(regenerated, ["energy-template"]);
});

test("energy reminder settings recover missing slots from open widget tasks", () => {
  const widget = {
    id: "energy-widget",
    type: "energy",
    settings: {
      reminderTimes: ["19:00"],
      maxCheckins: 12
    },
    data: {
      entries: []
    }
  };
  const tasks = [
    {
      id: "energy-0",
      ownerWidgetId: widget.id,
      ownerWidgetType: "energy",
      ownerTaskKey: "energy-reminder-0",
      templateId: "generated-0",
      timeOfDay: "07:00",
      status: "open",
      archived: false
    },
    {
      id: "energy-1",
      ownerWidgetId: widget.id,
      ownerWidgetType: "energy",
      ownerTaskKey: "energy-reminder-1",
      templateId: "generated-1",
      timeOfDay: "12:00",
      status: "open",
      archived: false
    },
    {
      id: "energy-2",
      ownerWidgetId: widget.id,
      ownerWidgetType: "energy",
      ownerTaskKey: "energy-reminder-2",
      templateId: "",
      timeOfDay: "19:00",
      status: "open",
      archived: false
    }
  ];

  const reminderTimes = reconcileEnergyReminderSettings(widget, tasks);

  assert.deepEqual(reminderTimes, ["07:00", "12:00", "19:00"]);
  assert.deepEqual(widget.settings.reminderTimes, ["07:00", "12:00", "19:00"]);
});

test("energy ensureTasks recreates recurring reminder templates when stale non-template tasks occupy a slot key", () => {
  const widget = {
    id: "energy-widget",
    type: "energy",
    settings: {
      reminderTimes: ["07:00", "12:00", "19:00"],
      maxCheckins: 12
    },
    data: {
      entries: []
    }
  };
  const store = {
    tasks: [
      {
        id: "stale-closed",
        templateId: "",
        occurrenceIndex: 0,
        ownerWidgetId: widget.id,
        ownerWidgetType: "energy",
        ownerTaskKey: "energy-reminder-0",
        widgetTaskKind: "energy-checkin",
        status: "done",
        archived: false,
        startDate: "2026-04-04",
        dueDate: "2026-04-04",
        timeOfDay: "07:00",
        recurrence: { type: "none" },
        history: [{ id: "h1", type: "completed", at: 1 }]
      }
    ]
  };
  const regenerated = [];
  let nextId = 0;

  energyWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `new-template-${nextId++}`,
      todayString: () => "2026-04-04",
      regenerateSeries: (templateId) => {
        regenerated.push(templateId);
      },
      resolveCategorySnapshot: () => ({
        key: "health",
        label: "Health",
        color: "#77aa77"
      })
    }
  });

  const templates = store.tasks.filter((task) => !task.templateId && task.recurrence?.type === "daily");
  assert.equal(templates.length, 3);
  assert.ok(templates.some((task) => task.ownerTaskKey === "energy-reminder-0"));
  assert.ok(templates.some((task) => task.ownerTaskKey === "energy-reminder-1"));
  assert.ok(templates.some((task) => task.ownerTaskKey === "energy-reminder-2"));
  assert.equal(regenerated.length, 3);
});

test("energy initial reminder date advances the current slot after its scheduled time has passed", () => {
  const dueDate = computeInitialReminderDate(
    "2026-04-04",
    ["07:00", "12:00", "19:00"],
    1,
    new Date("2026-04-04T15:00:00-07:00")
  );

  assert.equal(dueDate, "2026-04-05");
});
