import { energyWidgetDefinition } from "./energy.js";
import { travelWidgetDefinition } from "./travel.js";
import { workoutWidgetDefinition } from "./workout.js";

/** @typedef {import("../types.js").LifetreeWidgetRecord} LifetreeWidgetRecord */

/**
 * Widget definitions describe one plugin type and keep its lifecycle in one place.
 * A definition may provide:
 * - `type`, `title`, `ownerLabel`, `menuLabel`
 * - `singleton` to prevent duplicates
 * - `createWidget`, `normalizeWidget`, `getUpdatedAt`
 * - `render` for slot UI
 * - `handleAction` for widget-specific button handling
 * - `ensureTasks` for owned-task provisioning
 * - `shouldAutoSkipOwnedTask` for widget-specific lockout rules
 */
const WIDGET_DEFINITIONS = [energyWidgetDefinition, workoutWidgetDefinition, travelWidgetDefinition];
const WIDGET_DEFINITION_MAP = new Map(WIDGET_DEFINITIONS.map((definition) => [definition.type, definition]));

export function listWidgetDefinitions() {
  return WIDGET_DEFINITIONS;
}

export function getWidgetDefinition(type) {
  return WIDGET_DEFINITION_MAP.get(type) || null;
}

export function ownerWidgetLabel(task) {
  return getWidgetDefinition(task?.ownerWidgetType)?.ownerLabel || "";
}

/**
 * @param {unknown} widget
 * @param {Record<string, unknown>} helpers
 * @returns {LifetreeWidgetRecord | null}
 */
export function normalizeWidgetRecord(widget, helpers) {
  const definition = getWidgetDefinition(widget?.type);
  return definition?.normalizeWidget ? definition.normalizeWidget(widget, helpers) : null;
}

/**
 * @param {unknown} value
 * @param {Record<string, unknown>} helpers
 * @param {number} maxWidgets
 * @returns {LifetreeWidgetRecord[]}
 */
export function normalizeWidgetList(value, helpers, maxWidgets) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenTypes = new Set();
  const widgets = [];

  for (const widget of value) {
    const normalized = normalizeWidgetRecord(widget, helpers);
    if (!normalized || seenTypes.has(normalized.type)) {
      continue;
    }
    seenTypes.add(normalized.type);
    widgets.push(normalized);
    if (widgets.length >= maxWidgets) {
      break;
    }
  }

  return widgets;
}

/**
 * @param {LifetreeWidgetRecord[]} [localWidgets=[]]
 * @param {LifetreeWidgetRecord[]} [remoteWidgets=[]]
 * @param {Record<string, unknown>} helpers
 * @param {number} maxWidgets
 * @returns {LifetreeWidgetRecord[]}
 */
export function mergeWidgetLists(localWidgets = [], remoteWidgets = [], helpers, maxWidgets) {
  const mergedByType = new Map();

  for (const widget of normalizeWidgetList(remoteWidgets, helpers, maxWidgets)) {
    mergedByType.set(widget.type, widget);
  }
  for (const widget of normalizeWidgetList(localWidgets, helpers, maxWidgets)) {
    const existing = mergedByType.get(widget.type);
    if (!existing) {
      mergedByType.set(widget.type, widget);
      continue;
    }
    mergedByType.set(widget.type, choosePreferredWidget(widget, existing));
  }

  return Array.from(mergedByType.values()).slice(0, maxWidgets);
}

function choosePreferredWidget(localWidget, remoteWidget) {
  const localLatest = getWidgetUpdatedAt(localWidget);
  const remoteLatest = getWidgetUpdatedAt(remoteWidget);
  return localLatest >= remoteLatest ? localWidget : remoteWidget;
}

/**
 * @param {LifetreeWidgetRecord} widget
 * @returns {number}
 */
export function getWidgetUpdatedAt(widget) {
  const definition = getWidgetDefinition(widget?.type);
  return definition?.getUpdatedAt ? definition.getUpdatedAt(widget) : (widget?.createdAt || 0);
}

export function listWidgetCategories(widgets = []) {
  const categories = [];
  const seenKeys = new Set();

  for (const widget of widgets) {
    const definition = getWidgetDefinition(widget?.type);
    const provided = definition?.getCategories?.(widget) || [];
    for (const category of provided) {
      if (!category?.key || seenKeys.has(category.key)) {
        continue;
      }
      seenKeys.add(category.key);
      categories.push(category);
    }
  }

  return categories;
}
