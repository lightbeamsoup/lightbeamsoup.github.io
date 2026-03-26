# Lifetree Notes

## Project shape
- `lifetree/` is the main app.
- The app is a browser-first ES module app with local persistence plus optional Google Drive sync through the backend.
- `lifetree/app.js` is still the main orchestrator, but a growing amount of feature logic has been split into modules.
- [`TODO.md`](/home/jbk/lightbeamsoup.github.io/TODO.md) tracks queued product and technical follow-up work.

## Primary entry points
- [`lifetree/index.html`](/home/jbk/lightbeamsoup.github.io/lifetree/index.html): page structure, modals, tree shell, Task Desk layout.
- [`lifetree/style.css`](/home/jbk/lightbeamsoup.github.io/lifetree/style.css): all shared styling for the Lifetree shell, widgets, modals, and Task Desk.
- [`lifetree/app.js`](/home/jbk/lightbeamsoup.github.io/lifetree/app.js): app wiring, store lifecycle, task actions, widget orchestration, history, persistence, and tree shell coordination.

## Modules
- [`lifetree/modules/driveSync.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/driveSync.js): Google auth state, Drive load/save, merge flow, startup sync, unload sync.
- [`lifetree/modules/autosave.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/autosave.js): periodic Drive autosave controller driven by profile settings and store fingerprints.
- [`lifetree/modules/profile.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/profile.js): profile normalization plus autosave defaults and interval bounds.
- [`lifetree/modules/taskDesk.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/taskDesk.js): Task Desk modal open/close behavior.
- [`lifetree/modules/widgetDetail.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/widgetDetail.js): widget detail modal controller.
- [`lifetree/modules/canopy.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/canopy.js): canopy rendering for manual tasks on the main shell.
- [`lifetree/modules/points.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/points.js): task-point defaults, ledger normalization, tree-point normalization, and developer point/fruit summaries.
- [`lifetree/modules/treeStyles.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/treeStyles.js): tree skin catalog, ownership/equip state, style application, purchase logic.
- [`lifetree/modules/time.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/time.js): local time/date formatting and tree sky temporal calculations.
- [`lifetree/modules/treeState.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/treeState.js): point aggregation and fruit-growth display state.

## Widgets
- [`lifetree/widgets/registry.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/registry.js): widget registration and shared widget metadata.
- [`lifetree/widgets/energy.js`](/home/jbk/lightbeamsoup.github.io/lifetree/widgets/energy.js): Energy widget rendering, schedule ownership, history graph, vote flow, and widget-specific task rules.

## Core task/data logic
- [`lifetree/logic.js`](/home/jbk/lightbeamsoup.github.io/lifetree/logic.js): recurring-date math, task ordering, history feed derivation, widget completion helpers, skip logic, and logical task identity.
- [`lifetree/logic.test.js`](/home/jbk/lightbeamsoup.github.io/lifetree/logic.test.js): Node test coverage for the logic module.

## Tree assets
- [`lifetree/images/oak-tree-hub.svg`](/home/jbk/lightbeamsoup.github.io/lifetree/images/oak-tree-hub.svg): default tree art.
- [`lifetree/images/oak-tree-hub-spring-grass.svg`](/home/jbk/lightbeamsoup.github.io/lifetree/images/oak-tree-hub-spring-grass.svg): current alternate grass skin.
- [`lifetree/tree_stub.py`](/home/jbk/lightbeamsoup.github.io/lifetree/tree_stub.py): standalone Python tree rendering stub for quick experimentation.

## Working guidance
- Prefer adding new widget-specific behavior inside `lifetree/widgets/` rather than branching further inside `app.js`.
- Prefer adding pure calculations to `lifetree/logic.js` or the small utility modules under `lifetree/modules/` rather than expanding `app.js`.
- Keep `app.js` focused on orchestration: DOM wiring, store updates, modal coordination, and cross-module integration.
- When changing persistent data, update normalization paths in `app.js` so older stores still load safely.
- Settings/profile changes should update both the settings modal in [`lifetree/index.html`](/home/jbk/lightbeamsoup.github.io/lifetree/index.html) and the profile normalization defaults in [`lifetree/modules/profile.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/profile.js).
- After each edit turn is complete and ready for a new prompt, create a local commit by default, but do not push unless the user explicitly asks.
- Never run `git add` and `git commit` in parallel. Git staging/commit commands should always be executed serially to avoid `.git/index.lock` races.
- Drive sync behavior now has three layers:
  - manual auth/load/save flow in [`lifetree/modules/driveSync.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/driveSync.js)
  - autosave cadence in [`lifetree/modules/autosave.js`](/home/jbk/lightbeamsoup.github.io/lifetree/modules/autosave.js)
  - settings/UI wiring in [`lifetree/app.js`](/home/jbk/lightbeamsoup.github.io/lifetree/app.js)

## Quick verification
- `node --check lifetree/app.js`
- `node --check lifetree/modules/*.js`
- `node --check lifetree/widgets/*.js`
- `node --test lifetree/logic.test.js`
