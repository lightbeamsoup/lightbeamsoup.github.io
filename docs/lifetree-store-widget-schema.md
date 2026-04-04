# Lifetree Store and Widget Schema

## Goal

Keep the main Lifetree store small, normalized, and safe to load from either local storage or Google Drive, while letting each widget own its own settings and history payload.

For the current normalized record hints used in code, see [`lifetree/types.js`](/home/jbk/lightbeamsoup.github.io/lifetree/types.js).
For Google Calendar-specific linkage fields, see [`docs/lifetree-google-calendar-schema.md`](/home/jbk/lightbeamsoup.github.io/docs/lifetree-google-calendar-schema.md).

## Store envelope

`lifetree/modules/storeData.js` normalizes the top-level store to version `19`.

```js
store = {
  version,
  updatedAt,
  userUpdatedAt,
  userFingerprint,
  driveFileId,
  profile,
  integrations,
  notifications,
  tasks,
  pointLedger,
  pointHistory,
  treeState,
  devSettings,
  categories,
  widgets,
  retiredWidgets,
  recurringBonusSelections,
  deletionMarkers
};
```

Notes:

- `updatedAt` tracks any persisted store write.
- `userUpdatedAt` and `userFingerprint` track user-content changes and intentionally ignore sync-only metadata noise.
- `widgets` is the active shell payload.
- `retiredWidgets` keeps recoverable widget state after a widget is removed without clearing its history.
- `deletionMarkers` suppress stale Drive tasks and series after local deletes.

## Task record

Every normalized task carries:

- identity: `id`, `templateId`, `occurrenceIndex`, `seriesOriginId`
- schedule: `startDate`, `dueDate`, `timeOfDay`, `notBeforeAt`, `lateGraceMinutes`, `recurrence`
- ownership: `ownerWidgetId`, `ownerWidgetType`, `ownerTaskKey`, `widgetTaskKind`, `widgetTaskMeta`
- task behavior: `status`, `skipRule`, `widgetCompletion`, `dependencies`, `linkedSeries`
- points/category: `pointsValue`, `pointsEntryId`, `categoryKey`, `categoryLabel`, `categoryColor`, `importance`
- lifecycle: `createdAt`, `updatedAt`, `archived`, `historyOnly`, `hideAfterAt`, `history`
- Google linkage: `googleCalendar`

Notes:

- Widget-owned schedules still live in `store.tasks`; widgets do not replace task records.
- `widgetTaskMeta` is widget-specific and should stay lightweight enough to survive normalization safely.
- `googleCalendar` is always normalized, even for tasks that do not currently have a linked event.

## Widget record envelope

All widget records use the same outer shape:

```js
widget = {
  id,
  type,
  slotIndex,
  settings,
  data,
  createdAt,
  updatedAt
};
```

Notes:

- `type` selects the definition from [`lifetree/widgets/registry.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/registry.js).
- `settings` is the user-controlled configuration for the widget.
- `data` is widget-owned state or history that is not better represented as Lifetree tasks.
- Widget normalization happens inside the widget definition, then store normalization dedupes by `type`.

## Current widget payloads

### Energy

Defined in [`lifetree/widgets/energy.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/energy.js).

- `settings.reminderTimes`: daily reminder times owned by the widget
- `settings.maxCheckins`: cap for reminder slots per day
- `data.entries`: recorded energy votes
- `data.historyRange`: current chart range preference

### Workout Coach

Defined in [`lifetree/widgets/workout.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/workout.js).

- `settings.workoutPlans`: recurring workout plan definitions
- `settings.weightTracking`: weight logging preferences and optional schedule
- `data.workoutEntries`: completed workout history
- `data.weightEntries`: logged weight history

### Travel Buddy

Defined in [`lifetree/widgets/travel.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/travel.js).

- `settings.homeLocation`
- `settings.homeTimeZone`
- `data.trips`: active and saved trip records
- `data.packingTemplates`: reusable packing templates
- `data.itineraryTemplates`: reusable itinerary templates
- `data.liveSnapshots`: cached flight/weather shell data

## Ownership split

Use this rule when adding new fields:

- Put scheduling, recurrence, completion state, dependencies, and category/point behavior in `store.tasks`.
- Put widget configuration, widget-native history, and cached presentation data in `widget.settings` or `widget.data`.
- Put cross-cutting app state in a top-level store block only if it is not widget-specific.
