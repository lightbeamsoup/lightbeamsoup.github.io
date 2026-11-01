# Goalroom benchmarks — November 1, 2026

## Ask AI, including model reasoning

Actual Codex app-server runs using the existing ChatGPT login, `gpt-6.1-sol`, low reasoning effort. Each scenario used a new ephemeral thread. The three scenarios shared one newly created synthetic sandbox, with independent employee/supervisor records. Timings include process startup, authentication/model discovery, model reasoning, action calls and network latency; final independent verification is outside the timed interval.

| Scenario | Time | Goalroom calls | Result |
| --- | ---: | ---: | --- |
| Employee: update release goal to 80%, add note, verify | 10.872 s | 4 | Pass |
| Supervisor: assign Priya a goal, add feedback, verify both | 15.920 s | 7 | Pass |
| Head: count overdue subtree goals and probe cross-department access | 9.935 s | 3 | Pass |

The final data confirmed the employee update and note, exactly one requested assignment and the supervisor feedback, four overdue goals in Maya's subtree, and a 404 without record contents for `alex-c-1`. Read-only tools made no writes. An additional UI smoke test correctly reported the employee's overdue goal through the Ask AI form in approximately 9.8 seconds with two tool calls.

## Transport workflow, excluding model reasoning

Identical task: Alex Rivera reads `alex-r-1`, changes progress from 60 to 80 with the note `Transport benchmark: release checks complete`, then reads the saved record. Each path started in a separate fresh sandbox with version 1 and no notes. Final records had progress 80, version 2 and one note.

| Path | Observed time | Action calls | Automatic snapshot calls | Result |
| --- | ---: | ---: | ---: | --- |
| Browser forms | 1.674 s | 3 | 3 | Pass |
| Native WebMCP | 7.914 s | 3 | 3 | Pass |
| Direct hosted API | 0.646 s | 3 | 0 | Pass |

Browser forms used one batched sequence of semantic UI interactions, including opening, editing, saving, closing and reopening the goal. Native WebMCP used the browser's actual `webmcp` capability with the registered `get_goal`, `update_progress`, and `get_goal` tools. It did not invoke handlers directly or emulate WebMCP. Timers surrounded the driver calls. Setup, login, tool discovery and model reasoning were excluded.

Browser and WebMCP ran the local tracker through its same-origin proxy to the hosted Cloudflare API. Both automatically refresh the page snapshot after each action. Direct API calls went straight to the hosted Worker and did not refresh the UI. Native WebMCP time includes the in-app browser tool bridge. These implementation differences are part of the observed workflows, so this is not an isolated protocol-overhead measurement.

## Interpretation and limits

Direct API was fastest in this small test. Native WebMCP was slower than the batched browser workflow in this particular browser/bridge setup. WebMCP still provides structured operations and shares the browser session, but this measurement does not support claiming that it is always faster.

There is one observation per scenario/interface, no randomized order, no percentile distribution, and no same-model browser-versus-WebMCP reasoning comparison. Do not extrapolate these numbers to general agent speed or reliability. Cold starts, network conditions, bridge implementation, caching and model variability may materially change results. Development probes before the final measurements found and fixed a Windows cleanup issue and a name collision with Codex's own goal-management tools; final-version results are reported here.

Raw sanitized model output, tool arguments/statuses/timings and token usage are in [benchmarks.json](../agent-lab/benchmarks.json). It contains no sandbox passwords, bearer tokens, pairing secrets or Codex credentials. Reproduction scripts and local companion instructions are in [companion/README.md](../companion/README.md).
