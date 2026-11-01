# Goalroom local Codex companion

The Ask AI panel uses the existing Codex CLI ChatGPT sign-in. Cloudflare serves the database/API; it never receives Codex credentials. Model requests consume the user's Codex plan allowance. This companion refuses API-key authentication rather than silently enabling separate API billing.

## Start

1. Install Node 24 and the official Codex CLI. Run `codex login` if not already signed in with ChatGPT.
2. From this repository, run `npm run companion`.
3. Open the **paired URL printed in the terminal**. It uses a random token in the URL fragment, which the page removes and keeps only in that tab's session storage.
4. Create a synthetic sandbox, or sign in with existing Goalroom sandbox credentials. Choose **Ask AI**.
5. Try `Which of my goals are overdue?`. To update records, select **Allow goal changes for this request**, then describe the change.

Each request starts a new conversation. The companion runs only while the terminal process is running. Ctrl+C stops it and invalidates its pairing token. Restarting requires opening the new paired link. The GitHub Pages Ask AI panel provides these instructions; actual model execution happens in the local copy of the tracker at `http://127.0.0.1:3487/agent-lab/`, backed by the same hosted database. This avoids a public HTTPS page requesting access to the local network.

If `codex` is not discoverable as an executable on Windows, set `GOALROOM_CODEX_BIN` to the absolute path of the official `codex.exe`. `GOALROOM_PORT` optionally changes the loopback port. Do not place authentication tokens in either variable.

## Boundaries

- Binds to `127.0.0.1` only. Host checks prevent DNS rebinding; an exact origin allowlist rejects other websites. AI endpoints require the random 256-bit pairing secret.
- Accepts only the fixed Goalroom API and shared action schemas. No arbitrary URL, shell command, file path, or model provider can be submitted by the page.
- Creates ephemeral Codex app-server threads in a fresh temporary directory, with read-only sandboxing, unrelated features disabled, configured MCP servers disabled, and all non-Goalroom server requests rejected. Goalroom tool names are prefixed to avoid collisions with Codex's own goal tools.
- Reads are the default. Write tools are omitted and independently rejected by the host unless the user enables changes. Cloudflare checks the signed-in account's hierarchy on every action. Versions and idempotency keys protect writes.
- Limits: one active run, 8,000-character prompt, 16 KiB HTTP body, 20 action requests, 180-second run timeout, and 15-second action timeout. Cancel stops the model process; already committed writes remain committed. Check the tracker before retrying a cancelled mutation.
- Goal text is treated as untrusted data. Model output is displayed as plain text. The host holds the tracker bearer token; it is not included in the prompt or tool outputs. Codex's own authentication remains managed by Codex.

The app-server/dynamic-tool protocol is experimental. Tested with Codex `0.166.0-alpha.5.1`; older CLIs may require an update. This is a local demonstration, not a public hosted model proxy.

## Verification and benchmarks

`npm run test:companion` tests tool validation, read-only enforcement, fixed API forwarding, denied responses, pairing, origin/host checks, and route restrictions. `npm run test:goals` and `npm run test:cloudflare` verify the underlying permissions and persistence.

`node companion/benchmark.mjs` runs three real model scenarios and independently checks final records. It creates one fresh sandbox and consumes Codex plan usage. `node companion/benchmark-api.mjs` measures a direct API update in another fresh sandbox. Both write sanitized results to `agent-lab/benchmarks.json`. The service has a 10-sandboxes-per-IP-per-hour limit; do not repeatedly run these scripts as a load test. Native WebMCP and browser timings were measured using the real in-app browser, not simulated handlers.

See [the benchmark report](../docs/goalroom-benchmarks.md) for results and limitations, and [the official app-server documentation](https://learn.chatgpt.com/docs/app-server) for the protocol.
