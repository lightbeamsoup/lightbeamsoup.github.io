import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPointsForLength,
  mergePointHistory,
  mergePointLedger,
  normalizeDevSettings,
  normalizePointHistory,
  normalizePointLedger,
  normalizeTaskPoints,
  normalizeTreeState as normalizeTreeStateBase,
  choosePreferredTreeState as choosePreferredTreeStateBase
} from "./modules/points.js";
import { normalizeProfile, choosePreferredProfile } from "./modules/profile.js";
import { normalizeNotifications, choosePreferredNotifications } from "./modules/notifications.js";
import { createStoreDataBindings } from "./modules/storeData.js";
import { createTaskComposerBindings } from "./modules/taskComposer.js";
import { compactTaskHistory, buildLogicalWidgetTaskKey, compareTaskResolutionPreference } from "./logic.js";
import {
  createDriveConflictFixtureStores,
  createTravelFixtureStore,
  createWorkoutFixtureStore,
  malformedDrivePayloadFixtures
} from "./testFixtures.js";

function createStoreDataTestBindings() {
  let idCounter = 0;
  const createId = () => `test-id-${++idCounter}`;
  const defaultCategoryKey = "productivity";
  const defaultCategoryColor = "#7dbf74";
  const baseCategories = [
    { key: "fun", label: "Fun", color: "#f4b64e", builtin: true },
    { key: "friends", label: "Friends", color: "#5ca8f5", builtin: true },
    { key: "family", label: "Family", color: "#f28ca8", builtin: true },
    { key: "productivity", label: "Productivity", color: "#7dbf74", builtin: true },
    { key: "health", label: "Health", color: "#6dc7bf", builtin: true },
    { key: "travel", label: "Travel", color: "#4a7fd6", builtin: false }
  ];
  const lengthOrder = {
    "very-short": 1,
    short: 2,
    medium: 3,
    long: 4,
    "very-long": 5
  };
  const normalizeImportance = (value) => value === "low" || value === "high" ? value : "medium";
  const normalizeWidgetTaskMeta = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return JSON.parse(JSON.stringify(value));
  };
  const normalizeWidgetCompletion = (value) => ({
    mechanism: typeof value?.mechanism === "string" ? value.mechanism : "",
    lockout: typeof value?.lockout === "string" ? value.lockout : "none"
  });
  const normalizeLinkedSeries = (linkedSeries) => {
    if (!linkedSeries || typeof linkedSeries !== "object") {
      return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
    }
    const groupId = typeof linkedSeries.groupId === "string" ? linkedSeries.groupId : "";
    const kind = linkedSeries.kind === "daily-window" || linkedSeries.kind === "weekly-window"
      ? linkedSeries.kind
      : "";
    const slotIndex = Number.isInteger(linkedSeries.slotIndex) ? linkedSeries.slotIndex : 0;
    const slotCount = Number.isInteger(linkedSeries.slotCount) ? linkedSeries.slotCount : 1;
    if (!groupId || !kind || slotCount <= 1 || slotIndex < 0 || slotIndex >= slotCount) {
      return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
    }
    return { groupId, kind, slotIndex, slotCount };
  };
  const deriveTaskNotBeforeAt = ({ dueDate = "", startDate = "" } = {}) => {
    const baseline = dueDate || startDate;
    return baseline ? Date.parse(`${baseline}T00:00:00Z`) : 0;
  };
  const resolveCategorySnapshot = (categoryKey) => {
    const key = typeof categoryKey === "string" && categoryKey ? categoryKey : defaultCategoryKey;
    const match = baseCategories.find((category) => category.key === key) || baseCategories.find((category) => category.key === defaultCategoryKey);
    return {
      key: match.key,
      label: match.label,
      color: match.color
    };
  };
  const taskComposer = createTaskComposerBindings({
    createId,
    getMaxTaskPoints: () => 10,
    resolveCategorySnapshot,
    normalizeImportance,
    normalizeTaskPoints,
    normalizeWidgetTaskMeta,
    normalizeWidgetCompletion,
    normalizeLinkedSeries,
    deriveTaskNotBeforeAt,
    lengthOrder,
    todayString: () => "2026-04-03"
  });

  const normalizeWidgets = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((widget) => widget && typeof widget === "object" && typeof widget.type === "string" && widget.type)
      .map((widget) => ({
        id: typeof widget.id === "string" && widget.id ? widget.id : createId(),
        type: widget.type,
        createdAt: typeof widget.createdAt === "number" ? widget.createdAt : 0,
        updatedAt: typeof widget.updatedAt === "number" ? widget.updatedAt : 0,
        settings: widget.settings && typeof widget.settings === "object" ? widget.settings : {},
        data: widget.data && typeof widget.data === "object" ? widget.data : {}
      }));
  };
  const getWidgetUpdatedAt = (widget) => widget?.updatedAt || widget?.createdAt || 0;
  const mergeWidgetLists = (localWidgets = [], remoteWidgets = []) => {
    const mergedByType = new Map();
    for (const widget of normalizeWidgets(remoteWidgets)) {
      mergedByType.set(widget.type, widget);
    }
    for (const widget of normalizeWidgets(localWidgets)) {
      const existing = mergedByType.get(widget.type);
      if (!existing || getWidgetUpdatedAt(widget) >= getWidgetUpdatedAt(existing)) {
        mergedByType.set(widget.type, widget);
      }
    }
    return Array.from(mergedByType.values());
  };
  const mergeRetiredWidgets = (localRetired = [], remoteRetired = [], activeWidgets = []) => {
    const activeTypes = new Set(normalizeWidgets(activeWidgets).map((widget) => widget.type));
    const mergedByType = new Map();
    for (const widget of normalizeWidgets(remoteRetired)) {
      if (!activeTypes.has(widget.type)) {
        mergedByType.set(widget.type, widget);
      }
    }
    for (const widget of normalizeWidgets(localRetired)) {
      if (activeTypes.has(widget.type)) {
        continue;
      }
      const existing = mergedByType.get(widget.type);
      if (!existing || getWidgetUpdatedAt(widget) >= getWidgetUpdatedAt(existing)) {
        mergedByType.set(widget.type, widget);
      }
    }
    return Array.from(mergedByType.values());
  };
  const compareWidgetFingerprints = (left, right) => String(left?.type || "").localeCompare(String(right?.type || ""));
  const listWidgetCategories = (widgets = []) => {
    const categories = [];
    if (normalizeWidgets(widgets).some((widget) => widget.type === "travel")) {
      categories.push({ key: "travel", label: "Travel", color: "#4a7fd6" });
    }
    return categories;
  };
  const slugifyCategoryKey = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const normalizeTreeStyleState = (value) => ({
    ownedSkins: Array.isArray(value?.ownedSkins) ? value.ownedSkins : [],
    equipped: value?.equipped && typeof value.equipped === "object" ? value.equipped : {},
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  });
  const listPurchasableTreeSkins = () => [];
  const normalizeTreeState = (value) => normalizeTreeStateBase(value, {
    normalizeTreeStyleState,
    slugifyCategoryKey,
    listPurchasableTreeSkins
  });
  const choosePreferredTreeState = (localTreeState, remoteTreeState) => choosePreferredTreeStateBase(localTreeState, remoteTreeState, {
    normalizeTreeStyleState,
    slugifyCategoryKey,
    listPurchasableTreeSkins
  });

  return createStoreDataBindings({
    baseCategories,
    defaultCategoryKey,
    defaultCategoryColor,
    createId,
    defaultPointsForLength,
    normalizeTaskPoints,
    compactTaskHistory,
    buildLogicalWidgetTaskKey,
    compareTaskResolutionPreference,
    normalizeWidgets,
    listWidgetCategories,
    mergeWidgetLists,
    mergeRetiredWidgets,
    normalizeProfile,
    choosePreferredProfile,
    normalizeNotifications,
    choosePreferredNotifications,
    normalizeDevSettings,
    normalizeTreeState,
    choosePreferredTreeState,
    normalizePointLedgerBase: normalizePointLedger,
    normalizePointHistoryBase: normalizePointHistory,
    mergePointLedger,
    mergePointHistory,
    normalizeImportance,
    normalizeTaskReminders: taskComposer.normalizeTaskReminders,
    normalizeWidgetTaskMeta,
    normalizeWidgetCompletion,
    normalizeSkipRule: taskComposer.normalizeSkipRule,
    normalizeRecurrence: taskComposer.normalizeRecurrence,
    deriveTaskNotBeforeAt,
    parsePositiveOrZeroNumber: taskComposer.parsePositiveOrZeroNumber,
    getWidgetUpdatedAt,
    compareWidgetFingerprints
  });
}

test("normalizeStore handles malformed and older Drive payload fixtures", () => {
  const bindings = createStoreDataTestBindings();

  for (const payload of malformedDrivePayloadFixtures) {
    const store = bindings.normalizeStore(payload);
    assert.ok(Array.isArray(store.tasks));
    assert.ok(Array.isArray(store.widgets));
    assert.ok(Array.isArray(store.categories));
    assert.ok(store.notifications?.email);
    assert.ok(typeof store.userFingerprint === "string");
  }
});

test("fixture stores cover travel and workout widget scenarios", () => {
  const bindings = createStoreDataTestBindings();
  const travelStore = bindings.normalizeStore(createTravelFixtureStore());
  const workoutStore = bindings.normalizeStore(createWorkoutFixtureStore());

  assert.equal(travelStore.widgets[0]?.type, "travel");
  assert.equal(workoutStore.widgets[0]?.type, "workout");
  assert.ok(travelStore.tasks.some((task) => task.ownerWidgetType === "travel"));
  assert.ok(workoutStore.tasks.some((task) => task.ownerWidgetType === "workout"));
});

test("drive conflict fixtures distinguish safe auto-merges from ambiguous ones", () => {
  const bindings = createStoreDataTestBindings();
  const fixtures = createDriveConflictFixtureStores();

  const safeLocal = bindings.normalizeStore(fixtures.autoMerge.local);
  const safeRemote = bindings.normalizeStore(fixtures.autoMerge.remote);
  const mergedSafe = bindings.mergeStores(safeLocal, safeRemote);
  assert.equal(bindings.canAutoMergeDriveConflict(safeLocal, safeRemote), true);
  assert.ok(mergedSafe.tasks.some((task) => task.id === "local-task-1"));
  assert.ok(mergedSafe.tasks.some((task) => task.id === "remote-task-1"));

  const ambiguousLocal = bindings.normalizeStore(fixtures.ambiguous.local);
  const ambiguousRemote = bindings.normalizeStore(fixtures.ambiguous.remote);
  assert.equal(bindings.canAutoMergeDriveConflict(ambiguousLocal, ambiguousRemote), false);
});

test("user content fingerprint ignores calendar linkage and travel live snapshot metadata", () => {
  const bindings = createStoreDataTestBindings();
  const baseStore = bindings.normalizeStore({
    integrations: {
      googleCalendar: {
        connected: true,
        calendarId: "lifetree-cal",
        lastCalendarSyncAt: 100,
        lastCalendarSyncStatus: "success",
        lastCalendarSyncMessage: "Synced"
      }
    },
    tasks: [
      {
        id: "task-1",
        name: "Energy check-in",
        dueDate: "2026-04-05",
        startDate: "2026-04-05",
        timeOfDay: "07:00",
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
        googleCalendar: {
          calendarId: "lifetree-cal",
          eventId: "event-a",
          scheduleFingerprint: "fingerprint-a"
        }
      }
    ],
    widgets: [
      {
        id: "travel-widget",
        type: "travel",
        updatedAt: 100,
        settings: {},
        data: {
          trips: [],
          liveSnapshots: {
            tripA: {
              fetchedAt: 100,
              flight: {
                status: "ok",
                flightLabel: "UA123"
              }
            }
          }
        }
      }
    ]
  });
  const metadataOnlyStore = bindings.normalizeStore({
    ...baseStore,
    integrations: {
      googleCalendar: {
        connected: true,
        calendarId: "lifetree-cal",
        lastCalendarSyncAt: 200,
        lastCalendarSyncStatus: "success",
        lastCalendarSyncMessage: "Updated again"
      }
    },
    tasks: [
      {
        ...baseStore.tasks[0],
        googleCalendar: {
          calendarId: "lifetree-cal",
          eventId: "event-b",
          scheduleFingerprint: "fingerprint-b",
          lastSeenGoogleUpdatedAt: "2026-04-04T20:00:00.000Z"
        }
      }
    ],
    widgets: [
      {
        ...baseStore.widgets[0],
        updatedAt: 200,
        data: {
          ...baseStore.widgets[0].data,
          liveSnapshots: {
            tripA: {
              fetchedAt: 200,
              weather: {
                status: "ok",
                query: "Albuquerque, New Mexico"
              }
            }
          }
        }
      }
    ]
  });

  assert.notEqual(bindings.computeStoreFingerprint(baseStore), bindings.computeStoreFingerprint(metadataOnlyStore));
  assert.equal(bindings.computeUserContentFingerprint(baseStore), bindings.computeUserContentFingerprint(metadataOnlyStore));
});
