# TODO

## Open items

- Widgets: Create a Travel Buddy widget.
- Widgets: Create a Hydration widget that tracks ounces consumed and grows a plant as you water it.
- Integrations: Add Google Calendar integration.
- Integrations: Add Apple Fitness integration.
- Workout Coach: Clean up the workout modal by adding tabs.
- Tasks: Create a preview for daily and weekly tasks.
- Tasks: Understand and document how tasks get placed into weeklies versus monthlies.
- Tree styles: Create a spring canopy skin.
- Drive sync: Make merge/conflict popups clearer about what happened and what each choice will do.

## Recently completed

### Notifications

- 2026-03-27: Add a top-bar `Notifications` modal with delivery settings, content toggles, preview, and send history.
- 2026-03-27: Store notification settings in Drive-synced Lifetree data under a dedicated `notifications.email` block instead of `profile`.
- 2026-03-27: Build reusable summary-generation logic for overdue tasks, due-soon tasks, recurring progress, widget highlights, and tree/point status.
- 2026-03-27: Add backend summary sending and send-history logging through the authenticated Google account.
- 2026-03-27: Add email summaries, including a manual developer trigger for daily summaries.
- 2026-03-27: Add a scheduler/dedupe layer so summaries send automatically from the backend and can later be reused for reminder emails.
- 2026-03-27: Add reminder settings to the Notifications modal and persist them in the Drive-synced `notifications.email` config.
- 2026-03-27: Build reminder candidate selection, preview it in the Notifications modal, and send reminder emails manually through the connected Google account.
- 2026-03-27: Add automated reminder sending with backend scheduler dedupe, plus a developer daily agenda email trigger.
- 2026-03-28: Add an always-on backend worker mode so email summaries and reminders can keep sending when Lifetree itself is closed.

### Workout Coach

- 2026-03-26: Scaffold the widget and register it in the widget menu.
- 2026-03-26: Add workout plans with workout type, duration, intensity, and daily/weekly linked schedules.
- 2026-03-26: Add widget-owned task metadata for workout sessions and weight check-ins.
- 2026-03-26: Add daily and weekly progress views that roll up repeated instances into one tracked card.
- 2026-03-26: Add workout completion logging with actual duration and intensity overrides.
- 2026-03-26: Add ad hoc workout logging from the shell and modal.
- 2026-03-26: Add calories-burned defaults for recurring workouts plus completion overrides.
- 2026-03-26: Show weekly calories burned in the shell.
- 2026-03-26: Track calories burned and weight together in the workout modal history chart.
- 2026-03-26: Add open weight logging plus optional scheduled weight check-ins.
- 2026-03-26: Add per-widget weight units and decide how points should work for unscheduled weight logs.

### Widget Shells And Canopy

- 2026-03-26: Make `Remove widget` less prominent and move it to an `x` in the upper-right corner of the widget shell.
- 2026-03-26: Visually reflect when a recurring bonus has already been claimed for the current period.
- 2026-03-26: Add matching widget-owned task metadata to Energy tasks.
- 2026-03-26: Update the Energy shell to surface the richer widget task state more clearly.
- 2026-03-25: Add quick task add.
- 2026-03-25: Collect dailies into a mini modal.

### UI, Tree, And Backend

- 2026-03-26: Fix tree modal dark mode styling and history presentation.
- 2026-03-25: Add dark mode, including automatic dark mode by time window.
- 2026-03-25: Add clearer Google Drive sync hints and sync status details.
- 2026-03-25: Make autosave update at least the timestamp even if data has not otherwise changed.
