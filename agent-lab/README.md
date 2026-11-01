# Goalroom: employee goals interface experiment

Open `/agent-lab/`, create a synthetic sandbox, and sign in with a generated test account. The account menu fills credentials; the server verifies the password. Download credentials from Agent playground to reuse the sandbox elsewhere. They are saved in this tab's session storage, not the repository. All employees and goals are fictional.

## Storage and deployment

The page stays on GitHub Pages at `https://www.joshcodes.ai/agent-lab/`. Its production API runs on Cloudflare Workers at `https://goalroom-api.joshcodes-ai.workers.dev` with persistent Cloudflare D1 storage. `agent-lab/config.js` selects this endpoint. No Railway service, domain move, or OpenAI API key is required.

Browser sessions use bearer tokens in tab session storage, so cross-origin operation does not depend on third-party cookies. CORS allows only the exact www and apex website origins by default. Local Express previews remain available using Node 24 and `npm start`.

### Cloudflare maintenance

- Configuration: `cloudflare/wrangler.jsonc`; runtime: `cloudflare/worker.js`; schema: `cloudflare/migrations/`.
- Authenticate with the official Wrangler CLI. Credentials stay outside the repository.
- Apply new schema migrations with `npx wrangler d1 migrations apply goalroom --remote --config cloudflare/wrangler.jsonc`.
- Publish changed backend code with `npm run deploy:cloudflare`. A GitHub push updates the frontend but does not redeploy the Worker automatically.
- Test the real local D1 binding with `npm run test:cloudflare`. `node cloudflare/smoke.mjs` tests the hosted API using disposable synthetic records.
- `npm run dev:cloudflare` starts a local Worker at port 8787. Local and hosted D1 databases are separate. Apply migrations with `--local` for local preview. Keep `ALLOW_LOCAL_PREVIEW=false` in production; enable it only in a local development override when the page is served at port 3004.

D1 stores each sandbox as a bounded JSON aggregate with an optimistic revision. A conditional SQL update commits goal changes, hierarchy changes, and their retry record together. Conflicts reload current data and recheck authorization; repeated conflicts return 409. Authentication sessions and indexed action telemetry use separate tables. The Node/Express and Cloudflare runtimes share fixture definitions, validation, and hierarchy predicates.

Generated credentials are random 192-bit sandbox access keys, labeled passwords by the UI. The Worker stores only a contextual SHA-256 digest of each key. It does not accept user-chosen passwords or reset them. This avoids expensive password derivation inside the free Worker's CPU budget without weakening protection of low-entropy human passwords, because there are none. Do not extend this scheme to real employee passwords; use managed identity for that scope.

Sandboxes expire after 24 hours, sessions after one hour or at sandbox expiry. Expired data is cleaned during later sandbox creation. Cloudflare limits per sandbox: 200 goals, 1,000 notes, 500 committed writes, and 1 MB of serialized state. The service caps active sandboxes at 100, creation at 10 per source IP/hour, login attempts at 100/hour, and authenticated requests at 5,000/hour. Rate counters are durable D1 records and do not store raw IP addresses. Quotas protect this small experiment; provider free-plan limits can still temporarily reject requests.

This does not use Lifetree accounts or Google permissions. Every synthetic role's credentials are intentionally available to its sandbox creator. Do not put real employee information here. The earlier Express/SQLite backend is retained for local development; it is not the production host.

## Permissions

| Role | Read scope | Writes |
| --- | --- | --- |
| Employee | Self | Own progress and notes |
| Supervisor | Self and direct reports | Assign goals / feedback for direct reports; own progress |
| Department head | Self and reporting subtree | Assign goals / feedback in subtree; own progress |
| Administrator | Entire sandbox | Assign goals, add feedback, change managers |

Every operation checks the current identity and hierarchy on the server. Records outside scope return 404 without revealing existence. Hierarchy changes affect existing sessions immediately. Managers must have a supervisory role in the same department; cycles are rejected. Supervisors add separate feedback rather than modifying an employee's progress. Account/role creation is intentionally out of scope for this fixed synthetic fixture.

## Three interfaces

1. **Browser:** filter goal cards, open a goal, and use its forms. People & hierarchy shows permitted employees; administrators can change reporting lines.
2. **WebMCP:** sign in with the page open in a compatible browser. Tools: `get_identity`, `list_employees`, `list_goals`, `get_goal`, `create_goal`, `update_progress`, `add_feedback`, `set_manager`. Feature detection uses `document.modelContext`, with an earlier `navigator.modelContext` fallback. Tools call the shared API actions and refresh the page. Unsupported browsers retain normal UI features.
3. **Direct HTTP API:** authenticate for a bearer token; no browser session is needed. Agents need an HTTP-capable tool. This version does not expose a separate remote MCP JSON-RPC server.

### API examples

Production API URL: `https://goalroom-api.joshcodes-ai.workers.dev/api/agent-lab/v1`

Create a fixture. Save the response: credentials are returned once.

```http
POST /api/agent-lab/v1/workspaces
Content-Type: application/json

{}
```

Authenticate using a returned account:

```http
POST /api/agent-lab/v1/login
Content-Type: application/json

{"workspace":"SANDBOX_ID","email":"alex-r@example.test","password":"GENERATED_PASSWORD"}
```

Use the response's token:

```http
POST /api/agent-lab/v1/actions/list_goals
Authorization: Bearer TOKEN
Content-Type: application/json
X-Goals-Channel: api

{"status":"overdue"}
```

Update your own goal using its current version:

```http
POST /api/agent-lab/v1/actions/update_progress
Authorization: Bearer TOKEN
Content-Type: application/json

{"id":"alex-r-1","version":1,"progress":80,"note":"Two improvements delivered.","idempotencyKey":"unique-progress-request-001"}
```

Reuse the same key and exact input on retries. Different input with the same key returns 409. Stale versions return 409; read the goal again. Transactions make the mutation and retry record atomic. The page stores its bearer session in tab session storage. The Cloudflare API accepts bearer authentication only. The optional local Express backend also supports an HttpOnly SameSite=Strict cookie with same-origin write checks. Cross-origin page clients use bearer tokens, and CORS checks the exact website origin. Bearer clients outside browsers need no Origin. Secure cookies are enabled in production/Railway.

Additional routes: `GET /me`, `GET /employees`, `GET /goals`, `GET /goals/:id`, `POST /goals`, `PATCH /goals/:id/progress`, `POST /goals/:id/feedback`, `GET /events`, `POST /logout`. REST writes use an `Idempotency-Key` header instead of JSON `idempotencyKey`. `GET /openapi.json` documents the canonical action endpoints. Login and fixture setup are documented above.

## Comparison protocol

Create a **fresh sandbox per interface**, use the same role, and run identical instructions. Due dates are relative to fixture creation. Two employees are named Alex; use full names / IDs.

| Scenario | Account | Expected result |
| --- | --- | --- |
| Set release goal to 80% with a note | Alex Rivera | `alex-r-1`: progress 80, version 2, one note |
| Assign Priya a training goal; add feedback to `priya-1` | Evan | One new goal; one feedback note; no other writes |
| List overdue goals across Engineering | Maya | 4 seeded overdue goals, including indirect reports |
| Read `alex-c-1` | Evan | 404; no restricted data |
| Repeat a write with the same key | Same actor | One mutation |

Use Start run / Finish run for manual end-to-end timing. Export comparison JSON. For external HTTP tests, start the timer in the page with the same account, make API calls, then finish. The table shows the last 100 action requests for that identity. Channel labels are client supplied, not authorization signals. UI snapshot refresh, sign-in, and telemetry requests are excluded. Runs exceeding 100 action requests may be truncated.

Measure separately:

- Stopwatch time includes human/model/network/browser waiting.
- Server time includes validation, authorization, and data work; excludes network/model time.
- Action request count is not model turns or browser clicks. Obtain those from agent execution traces.
- Verify task success and collateral changes by reading final state against the table. Success is **not automatically scored**.

Do not infer end-to-end speed from server milliseconds alone. WebMCP needs an open page; HTTP does not.

## Local checks

```text
npm ci
npm run test:goals
npm run test:cloudflare
npm test
npm start
```

Set `ENABLE_NOTIFICATION_SCHEDULER=false` for local preview. Tests use isolated SQLite databases to check auth, cross-sandbox scope, hierarchy changes, versions, retries, CSRF, and persistence. Native WebMCP registration and execution also require a compatible browser.

## Model usage

The tracker makes no model calls. Use the existing Codex session/plan as the agent, with this service as its tool API. See [Codex plan integration design](../docs/goalroom-codex-plan.md) for repeatable runs, a proposed local companion, and the separately documented hosted Sign in with ChatGPT route.
