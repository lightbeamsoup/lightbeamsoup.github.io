# Lifetree Google Calendar Integration Schema

## Goal

Use a dedicated Google Calendar named `Lifetree` as the source of truth for scheduling:

- event date/time
- recurrence
- reminder timing
- location and travel-facing schedule details

Lifetree remains the source of truth for:

- completion history
- points and tree state
- widget ownership and widget-specific behavior
- merge/deletion markers and local/Drive sync state

## High-level model

Each scheduled Lifetree item should have:

1. A lightweight local task record in Lifetree
2. A linked Google Calendar event in the dedicated `Lifetree` calendar

The Google event owns the schedule.
The Lifetree task owns local-only behavior and history.

## Store schema

Add a new top-level integration block:

```js
store.integrations = {
  googleCalendar: {
    connected: false,
    calendarId: "",
    calendarSummary: "Lifetree",
    calendarTimeZone: "",
    lastCalendarSyncAt: 0,
    lastCalendarSyncStatus: "", // idle | success | error
    lastCalendarSyncMessage: "",
    lastCalendarSyncToken: "",
    pendingDeletions: [],
    schemaVersion: 1
  }
};
```

Notes:

- `calendarId` is the stable Google calendar ID for the dedicated Lifetree calendar.
- `calendarTimeZone` should follow the user's current browser timezone when the dedicated calendar is set up or refreshed.
- `lastCalendarSyncToken` is for incremental event sync if the implementation uses Google sync tokens.
- `pendingDeletions` is a bounded queue of linked Google events that should be removed on the next manual calendar sync after a local task/series delete.
- This block should be normalized with safe defaults so older stores still load.

## Local task linkage schema

Scheduled tasks should keep a lightweight Google linkage block:

```js
task.googleCalendar = {
  calendarId: "",
  eventId: "",
  recurringEventId: "",
  source: "lifetree", // reserved for future imports
  linkedAt: 0,
  lastSeenGoogleUpdatedAt: "",
  scheduleFingerprint: "",
  statusMirroredAt: 0
};
```

Notes:

- `eventId` is the concrete Google event ID for a one-off event or a recurring master.
- `recurringEventId` is populated for Google instance overrides when applicable.
- `lastSeenGoogleUpdatedAt` mirrors Google’s event `updated` timestamp for conflict checks.
- `scheduleFingerprint` is a local comparable signature for schedule-only fields.
- `statusMirroredAt` tracks when completion/skip metadata was last written back to Google.

Unsheduled tasks should omit `task.googleCalendar` entirely or normalize it to empty values.

## Timezone model

Lifetree scheduled tasks should use one of two timezone modes:

- `floating-local`: the task happens at the same local clock time for the user's current timezone, such as a `7:00 AM` Energy check-in
- `fixed`: the task is anchored to a specific timezone, such as a flight check-in tied to the departure location

Recommended local task representation:

```js
task.widgetTaskMeta = {
  timeZoneMode: "floating-local|fixed",
  timeZone: "" // only set for fixed-timezone tasks
};
```

Google Calendar mapping rules:

- always send an explicit event timezone
- use the user's current browser timezone for `floating-local` tasks
- use `widgetTaskMeta.timeZone` for `fixed` tasks
- store `lifetreeTimeZoneMode` and `lifetreeEventTimeZone` in `extendedProperties.private`
- when pulling Google edits back into Lifetree, only persist `widgetTaskMeta.timeZone` for `fixed` tasks

## Google event schema

### Google-native fields

Use standard Google event fields for:

- `summary`
- `description`
- `location`
- `start`
- `end`
- `recurrence`
- `reminders`
- `transparency`
- `visibility`

### Extended private properties

Use `extendedProperties.private` for machine-readable Lifetree metadata:

```json
{
  "lifetreeTaskId": "task-or-template-id",
  "lifetreeTaskKind": "one-off|recurring-master|generated-instance",
  "lifetreeWidgetType": "travel|workout|energy|",
  "lifetreeWidgetTaskKind": "flight-checkin|travel-pack|workout-session|",
  "lifetreeCategoryKey": "travel",
  "lifetreeImportance": "medium",
  "lifetreeLength": "medium",
  "lifetreeLateGraceMinutes": "15",
  "lifetreeStatus": "open|completed|skipped",
  "lifetreeStatusAt": "1712268720000",
  "lifetreeLifecycleType": "completed|skipped|reopened|",
  "lifetreeSchemaVersion": "1"
}
```

Rules:

- keep values string-serializable
- only store data needed to reconstruct schedule-linked behavior
- do not store full history, points, or large widget payloads here
- mirror only the latest lifecycle state, not the full audit history

## Event description convention

Event descriptions should remain human-readable. Append a short Lifetree footer, for example:

```text
Created by Lifetree.

Lifetree status: completed Apr 4, 7:12 AM
Lifetree widget: Travel Buddy
Lifetree task ID: abc123
```

Rules:

- descriptions may contain current status
- descriptions should not be treated as the canonical history log
- detailed audit history stays only in Lifetree

## Mapping rules

### One-off tasks

- one Lifetree task -> one Google event
- Google schedule edits update the local task schedule fields
- local completion/skip updates event description/private metadata only

### Recurring series

- one Lifetree template/series -> one recurring Google event
- edited single occurrences become Google instance overrides
- Lifetree should keep enough local linkage to map exceptions back to the parent series
- when a Google instance override can be matched back to a generated Lifetree occurrence by its original scheduled start, Lifetree should pull that override into the generated local occurrence instead of treating it as a duplicate recurring master

### Widget-owned scheduled tasks

Widget-owned tasks still sync through the same calendar:

- Travel flight check-in
- Travel packing task
- Workout scheduled sessions
- Energy scheduled check-ins

The widget association stays local and is mirrored minimally in `extendedProperties.private`.

## Conflict policy

Recommended precedence:

- Google Calendar wins for schedule fields:
  - start/end
  - recurrence
  - reminders
  - location
- Lifetree wins for local-only fields:
  - history
  - points
  - widget-local state
  - deletion markers
  - Drive/local sync metadata

If both sides changed:

1. compare Google `updated` vs local `lastSeenGoogleUpdatedAt`
2. if only schedule changed in Google, apply Google schedule locally
3. if only status/history changed locally, mirror status back to Google
4. if Google deleted the linked event and Lifetree has no unsynced local schedule/status changes, the remote delete wins locally
5. if Google deleted the linked event but Lifetree still has unsynced local schedule/status changes, recreate the event from Lifetree
6. if both changed in overlapping ways, prefer Google for schedule and preserve local history/state

## Deletion rules

- deleting a scheduled Lifetree task should delete or cancel the linked Google event
- local deletions should enqueue `pendingDeletions` items in `store.integrations.googleCalendar` so manual calendar sync can remove the linked Google events even across devices
- if a linked event ID goes stale, Lifetree should first try to relink by `lifetreeTaskId` before creating a replacement Google event
- duplicate Google events with the same `lifetreeTaskId` should be deduped during manual sync, keeping one canonical event link
- deleting the Google event should not automatically recreate it
- when Google deleted the linked event and Lifetree has no unsynced local changes for that task, the local task/series should be removed or archived locally and saved back to Drive
- when Google deleted the linked event but Lifetree still has unsynced local changes, manual sync should recreate the Google event and preserve the local schedule
- if a local task is completed/skipped and later archived, the Google event may remain as past calendar history unless explicitly removed

## Sync phases

Implementation order should follow this shape:

1. create/find the dedicated `Lifetree` calendar
2. store and normalize `store.integrations.googleCalendar`
3. export scheduled tasks and series one-way to Google
4. record `task.googleCalendar` linkage locally
5. support inbound Google edits for schedule fields
6. mirror completion/skip/restore status back into Google metadata
7. add recurring exception handling and conflict diagnostics

## Non-goals

Google Calendar should not store:

- point ledger history
- tree state
- full task audit history
- full widget payloads
- Drive merge/deletion bookkeeping

Those remain local to Lifetree and Drive sync.
