# Lifetree Backend

This backend enables Google OAuth authorization code flow with refresh tokens for Lifetree.

## Required environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TOKEN_SECRET`
- `DATA_DIR` recommended in production for persistent token storage
- `LIFETREE_SERVER_MODE` optional, defaults to `web`; set to `worker` for a notifications-only process
- `REQUEST_BODY_LIMIT` optional, defaults to `10mb`
- `ENABLE_NOTIFICATION_SCHEDULER` optional, defaults to `true`
- `SUMMARY_SCHEDULER_INTERVAL_MS` optional, defaults to `300000` (5 minutes)
- `NOTIFICATION_LOG_LEVEL` optional, one of `off`, `basic`, or `verbose`; defaults to `off`

See `.env.example` for local development defaults.

Project follow-up items live in [`TODO.md`](/home/jbk/lightbeamsoup.github.io/TODO.md).

## Local run

1. `cp .env.example .env`
2. Fill in Google OAuth values.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000/lifetree/`

If you want to test the email scheduler as a standalone backend process locally, run:

```bash
npm run start:worker
```

## Railway deployment

1. Create a new Railway project from this repo.
2. Add a persistent volume and note its mount path, for example `/data`.
3. Set environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://www.joshcodes.ai/api/auth/google/callback`
   - `TOKEN_SECRET` as a long random secret
   - `DATA_DIR=/data`
   - `LIFETREE_SERVER_MODE=web`
   - `COOKIE_SECURE=true`
   - `REQUEST_BODY_LIMIT=10mb`
   - `ENABLE_NOTIFICATION_SCHEDULER=true`
   - `SUMMARY_SCHEDULER_INTERVAL_MS=300000`
   - `NOTIFICATION_LOG_LEVEL=verbose` while debugging notifications
   - Do not set `PORT` manually on Railway. Railway injects its own port and the service must use that value for health checks to pass.
4. In Railway, attach the custom domain `www.joshcodes.ai` to this service and point DNS at Railway.
5. Add these Google OAuth settings:
   - Authorized JavaScript origin: `https://www.joshcodes.ai`
   - Authorized redirect URI: `https://www.joshcodes.ai/api/auth/google/callback`
6. Deploy and open `https://www.joshcodes.ai/lifetree/`

## Dedicated notification worker

The dedicated worker mode exists, but on Railway it should stay disabled for now unless auth/session storage is moved into a shared backend. The worker and web services need access to the same auth store, and the current file-backed storage is not a reliable way to share that state across separate Railway services.

If you do want to experiment with the worker later, the shape is:

1. Create a second Railway service or worker from this repo.
2. Mount the same persistent volume path used by the web service, for example `/data`.
3. Set environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://www.joshcodes.ai/api/auth/google/callback`
   - `TOKEN_SECRET`
   - `DATA_DIR=/data`
   - `LIFETREE_SERVER_MODE=worker`
   - `ENABLE_NOTIFICATION_SCHEDULER=true`
   - `SUMMARY_SCHEDULER_INTERVAL_MS=300000`
   - Do not set `PORT` manually on Railway.
4. The repo `railway.json` start command can stay at the default `npm start`; worker mode is selected automatically from `LIFETREE_SERVER_MODE=worker`.
5. If you override the Railway start command manually, use:

   ```bash
   npm run start:worker
   ```

For the current Railway deployment, prefer leaving the worker disabled and running the scheduler on the web service instead.

Without a persistent volume, Railway restarts or redeploys will lose stored refresh tokens and sessions.

## Email summary scheduler

If email summaries or reminders are enabled in Lifetree, the backend polls saved user accounts on an interval, loads each user's Drive-backed Lifetree store, and sends due notifications through the connected Gmail account. The scheduler uses notification history stored in Lifetree data to dedupe sends per time window or reminder event.

For Railway debugging, set:

```env
ENABLE_NOTIFICATION_SCHEDULER=true
NOTIFICATION_LOG_LEVEL=verbose
```

on the web service. That will log scheduler startup, each polling tick, per-user reminder candidate counts, built templates, and each sent email.

## Recommended production shape

Serve the whole site from this Node app on `www.joshcodes.ai`.

That means:
- the homepage is served by Express
- `/lifetree/` is served by Express
- OAuth callbacks stay on the same domain
- session cookies stay first-party
- `lifetree/config.js` should keep `apiBase: ""`

This is simpler and more reliable than mixing GitHub Pages with a separate backend domain.
