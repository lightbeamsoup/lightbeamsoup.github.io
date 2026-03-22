# Lifetree Backend

This backend enables Google OAuth authorization code flow with refresh tokens for Lifetree.

## Required environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TOKEN_SECRET`
- `DATA_DIR` recommended in production for persistent token storage

See `.env.example` for local development defaults.

## Local run

1. `cp .env.example .env`
2. Fill in Google OAuth values.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000/lifetree/`

## Railway deployment

1. Create a new Railway project from this repo.
2. Add a persistent volume and note its mount path, for example `/data`.
3. Set environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://www.joshcodes.ai/api/auth/google/callback`
   - `TOKEN_SECRET` as a long random secret
   - `DATA_DIR=/data`
   - `COOKIE_SECURE=true`
4. In Railway, attach the custom domain `www.joshcodes.ai` to this service and point DNS at Railway.
5. Add these Google OAuth settings:
   - Authorized JavaScript origin: `https://www.joshcodes.ai`
   - Authorized redirect URI: `https://www.joshcodes.ai/api/auth/google/callback`
6. Deploy and open `https://www.joshcodes.ai/lifetree/`

Without a persistent volume, Railway restarts or redeploys will lose stored refresh tokens and sessions.

## Recommended production shape

Serve the whole site from this Node app on `www.joshcodes.ai`.

That means:
- the homepage is served by Express
- `/lifetree/` is served by Express
- OAuth callbacks stay on the same domain
- session cookies stay first-party
- `lifetree/config.js` should keep `apiBase: ""`

This is simpler and more reliable than mixing GitHub Pages with a separate backend domain.
