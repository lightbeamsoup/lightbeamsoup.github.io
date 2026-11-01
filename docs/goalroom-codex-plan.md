# Using Goalroom with an existing Codex plan

The first version needs no model inference inside Cloudflare. Codex is the agent; Goalroom is the tool service. The site and database do not require an OpenAI API key.

```text
Your Codex session (ChatGPT sign-in and plan limits)
  ├─ browser clicks
  ├─ WebMCP page tools
  └─ direct HTTP requests
         ↓
Cloudflare Worker: validate identity, enforce hierarchy, execute actions
         ↓
D1: synthetic records, sessions, retry history, request telemetry
```

## Recommended first step: existing Codex desktop/CLI

Use a Codex session signed in with ChatGPT. The installed CLI's `codex login status` reported `Logged in using ChatGPT` on 2026-11-01. This is a local status check, not a guarantee of remaining quota or a particular model's availability. Agent use counts against the applicable plan limits; an API-key-authenticated session uses API billing instead.

Run the same benchmark prompt in three fresh sandboxes. Keep the model, role, task, and starting data constant, and explicitly specify browser-only, WebMCP-only, or HTTP-only access. Record agent turns/tool events separately from Goalroom's server request telemetry. The app never needs your ChatGPT credentials.

For repeatable local CLI runs, `codex exec --json` produces an event stream and `--output-last-message` saves the final answer. Select a model already available in your plan rather than hardcoding a new model. Use the CLI's ordinary sandbox/approval controls. Do not place passwords, API tokens, or ChatGPT login tokens in command arguments or committed prompts.

Official authentication guidance: https://learn.chatgpt.com/docs/auth

## Later: an AI button in the page

A local companion can run Codex app-server on your computer, accept an explicit local task, and return progress to a local UI. Keep it bound to loopback, require authorization, and allow only the Goalroom tools for this experiment. Do not expose an unrestricted shell or an unauthenticated localhost bridge to the public website. This local companion is a proposed next phase, not an implemented public endpoint.

Codex app-server's existing authentication is supported for local/open-source applications, and the official documentation says it has never been permitted for commercial or hosted services. Do not upload the desktop/CLI credential cache to Cloudflare or turn it into a public model proxy.

Official app-server guidance: https://learn.chatgpt.com/docs/app-server

## Hosted model calls under a user's plan

OpenAI now documents **Sign in with ChatGPT plan usage** for eligible Responses API requests in open-source and locally hosted apps, with explicit registration, user consent, granted scopes, stable host IDs, and token handling. Paid/remotely hosted apps are directed to an interest/approval path. Publishing this repository does not establish eligibility for the hosted integration.

If that route becomes appropriate, implement the documented OAuth flow and current preview restrictions. Do not repurpose the existing Codex login token. A conventional OpenAI API key is another route, but uses separate usage-based billing; no such key or model endpoint is configured here.

Official plan-usage overview: https://developers.openai.com/siwc/token-sharing-open-source

Official preview limitations: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
