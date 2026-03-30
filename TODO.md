# TODO

## Open items

### Travel Buddy

- Widgets: Create a Hydration widget that tracks ounces consumed and grows a plant as you water it.
- Integrations: Add Google Calendar integration.
- Integrations: Add Apple Fitness integration.
- Notifications: Move auth/session storage into a shared backend before re-enabling the dedicated Railway worker.
- Canopy: Decide how dailies should be marked complete directly from the shell view.
- Notifications: Consolidate repeated activities in email summaries and reminders.
- Tasks: Add task snoozing.

### Codebase Maintenance

- Codebase: Continue extracting `app.js` orchestration into smaller feature modules.
- Codebase: Extract tree action/state orchestration out of `app.js` into a dedicated tree controller module.
- Codebase: Extract task composer, recurrence, skip-rule, and reminder form logic out of `app.js`.
- Codebase: Extract store normalization, merge, and comparable-signature logic out of `app.js`.
- Codebase: Continue splitting Travel Buddy into focused render, live-data, task-sync, and state modules.
- Codebase: Split Workout Coach into focused render, chart, task-sync, and state modules.
- Codebase: Split `lifetree/style.css` further from imported chunks into feature-owned stylesheets and shared utility layers.
- Codebase: Consolidate repeated dark-mode card/chip/form styling into shared CSS utilities after the stylesheet split.
- Codebase: Add lightweight Lifetree store and widget schema docs.
- Codebase: Add reusable fixture stores for travel, workout, and Drive-conflict scenarios.
- Codebase: Add JSDoc typedefs for core store, task, and widget records.

## Recently completed

### Drive Sync

- 2026-03-29: Add passive remote-drift detection on focus/online, pause autosave when Drive changed elsewhere, and disable the blind pagehide overwrite path.
- 2026-03-29: Make Drive merge/conflict popups clearer about overwrite versus merge behavior and show exact local/Drive timestamps.
- 2026-03-29: Move task conflict precedence from whole-store timestamps to task-level `updatedAt` values.
- 2026-03-29: Coordinate multiple open browser sessions/tabs before silent saves using `BroadcastChannel` remote-state notices.

### Codebase Maintenance

- 2026-03-29: Split `lifetree/style.css` into imported stylesheet chunks so the top-level file stops carrying the whole UI.
- 2026-03-29: Extract Task Desk task/history rendering and delegated click wiring out of `app.js` into `lifetree/modules/taskHistoryUi.js`.
- 2026-03-29: Extract the tree style modal rendering helpers out of `app.js` into `lifetree/modules/treeUi.js`.
- 2026-03-29: Extract the tree fruit/detail rendering helpers out of `app.js` into `lifetree/modules/treeUi.js`.
- 2026-03-29: Extract the notification preview/history rendering helpers out of `app.js` into `lifetree/modules/notificationUi.js`.
- 2026-03-29: Extract the Travel Buddy render layer into a dedicated `lifetree/widgets/travel/render.js` module.

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

- 2026-03-29: Replace the workout history chart with bucketed calories bars and matching weight overlays across daily, weekly, monthly, and yearly views.
- 2026-03-28: Clean up the workout modal by splitting it into Overview, Plans, and Weight tabs.
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

### Travel Buddy

- 2026-03-29: Scaffold the `Travel Buddy` widget and register the widget-provided `Travel` category.
- 2026-03-29: Build the shell around upcoming trip info with quick access into active and upcoming trip tabs.
- 2026-03-29: Add an `Overview` tab with a trip status board and a `New trip` button.
- 2026-03-29: Make each trip its own modal tab with editing for itinerary, transit, lodging, and trip notes.
- 2026-03-29: Let trips be deleted from within their own tabs.
- 2026-03-29: Add per-trip packing list management plus dedicated saved packing-list and saved itinerary tabs.
- 2026-03-29: Add reusable itinerary and packing-list templates that can be saved from a trip and reused later.
- 2026-03-29: Add a Travel Buddy settings tab with home location and home time zone preferences.
- 2026-03-29: Add flight numbers and richer transit leg details to trip itineraries.
- 2026-03-29: Add packing-list item quantities and preserve them in saved packing templates and itinerary templates.
- 2026-03-29: Generate flight check-in tasks 24 hours before departure and make them timezone-aware by trip stage.
- 2026-03-29: Let trips auto-transition into and out of active status around departure/return while supporting manual start/end controls.
- 2026-03-29: Add custom itinerary tasks that stay anchored to departure time and carry into saved itinerary templates.
- 2026-03-29: Surface active one-off trip tasks into the canopy from itinerary and flight milestones.
- 2026-03-29: Generate travel tasks from itinerary and packing details, and default those widget-owned tasks into the `Travel` category.
- 2026-03-29: Improve packing lists with category grouping, checkbox packing state, shell unpacked counts, and an auto-generated packing task tied to the checklist.

### Widget Shells And Canopy

- 2026-03-28: Tighten vertical spacing and modal sizing in the canopy daily/weekly/monthly expansions and show-all views.
- 2026-03-28: Bucket slower-than-weekly recurring tasks as monthlies and document the rule.
- 2026-03-28: Add shell previews for daily, weekly, and monthly recurring groups that show still-due items and progress.
- 2026-03-26: Make `Remove widget` less prominent and move it to an `x` in the upper-right corner of the widget shell.
- 2026-03-26: Visually reflect when a recurring bonus has already been claimed for the current period.
- 2026-03-26: Add matching widget-owned task metadata to Energy tasks.
- 2026-03-26: Update the Energy shell to surface the richer widget task state more clearly.
- 2026-03-25: Add quick task add.
- 2026-03-25: Collect dailies into a mini modal.

### UI, Tree, And Backend

- 2026-03-29: Add 2:1 banked point exchanges between categories in the tree detail modal.
- 2026-03-29: Add the Cherry Blossom 2026 spring canopy skin for 50 Health points.
- 2026-03-26: Fix tree modal dark mode styling and history presentation.
- 2026-03-25: Add dark mode, including automatic dark mode by time window.
- 2026-03-25: Add clearer Google Drive sync hints and sync status details.
- 2026-03-25: Make autosave update at least the timestamp even if data has not otherwise changed.
