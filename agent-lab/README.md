# Goalroom: employee goals interface experiment

Open `/agent-lab/`, create a synthetic sandbox, and sign in with a generated test account. The account menu fills credentials; the server verifies the password. Download credentials from Agent playground to reuse the sandbox elsewhere. They are saved in this tab's session storage, not the repository. All employees and goals are fictional.

## Storage and deployment

The current public domain was verified to serve GitHub Pages on 2026-11-01. GitHub Pages publishes the frontend but cannot execute this server or SQLite API. The repository's Railway configuration alone does not establish a live backend. Serve the site from the Express service to keep the page and API on the same origin, or configure a separate API host and explicit CORS/token handling before using split hosting. The page reports a missing backend rather than pretending to save data locally.

- Node 24 is required (`node:sqlite`, no extra database package).
- SQLite lives at `DATA_DIR/employee-goals.sqlite`, or `server/data/employee-goals.sqlite` locally. Use the existing Railway persistent volume and one web service instance. Do not share the file between separate instances/workers.
- Sandboxes expire after 24 hours; expired records are removed at the next creation/login. Sessions expire after one hour or at sandbox expiry.
- Limits: 10 sandboxes per source IP per hour, 100 login attempts per IP per hour, 100 active sandboxes. These in-process limits are for the synthetic experiment.
- This does not use Lifetree accounts or Google permissions. All synthetic role credentials are intentionally available to the sandbox creator. Do not put real employee information here.

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

Base URL: `https://www.joshcodes.ai/api/agent-lab/v1`

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

Reuse the same key and exact input on retries. Different input with the same key returns 409. Stale versions return 409; read the goal again. Transactions make the mutation and retry record atomic. Browser clients use an HttpOnly SameSite=Strict cookie; cookie writes require a matching Origin. Bearer clients need no Origin. Secure cookies are enabled in production/Railway.

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
npm test
npm start
```

Set `ENABLE_NOTIFICATION_SCHEDULER=false` for local preview. Tests use isolated SQLite databases to check auth, cross-sandbox scope, hierarchy changes, versions, retries, CSRF, and persistence. Native WebMCP registration and execution also require a compatible browser.
