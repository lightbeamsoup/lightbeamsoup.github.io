import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const defaultDataDir = path.join(__dirname, "data");
const dataDir = resolveDataDir(process.env.DATA_DIR, defaultDataDir);
const storePath = path.join(dataDir, "auth-store.json");

const PORT = Number(process.env.PORT || 3000);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "10mb";
const SESSION_COOKIE = "lifetree_session";
const DRIVE_FILE_NAME = "task-deck-store.json";
const DEV_EMAIL = "jbkallman@gmail.com";
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata"
].join(" ");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (isAllowedDevOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie || "");
  next();
});

app.get("/api/auth/status", (req, res) => {
  const store = loadStore();
  const session = getSession(store, req.cookies[SESSION_COOKIE] || "");
  const user = session?.userId ? store.users[session.userId] : null;

  if (!user) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      email: user.email,
      name: user.name
    }
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/google/start", (req, res) => {
  assertOAuthEnv();

  const sessionId = ensureSessionId(req, res);
  const store = loadStore();
  const session = getSession(store, sessionId) || createSessionRecord();
  const state = crypto.randomUUID();
  session.state = state;
  session.returnTo = sanitizeReturnTo(String(req.query.returnTo || "/lifetree/"));
  session.updatedAt = Date.now();
  store.sessions[sessionId] = session;
  saveStore(store);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI || "");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", OAUTH_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  res.redirect(authUrl.toString());
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    assertOAuthEnv();
    const store = loadStore();
    const sessionId = req.cookies[SESSION_COOKIE] || "";
    const session = getSession(store, sessionId);
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!session || !code || !state || state !== session.state) {
      res.status(400).send("OAuth state validation failed.");
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    const existingUser = session.userId ? store.users[session.userId] : null;
    const refreshToken = tokens.refresh_token || decryptIfPresent(existingUser?.refreshToken);
    if (!accessToken || !refreshToken) {
      throw new Error("Google did not return a refresh token. Revoke the app and try connecting again.");
    }

    const profile = await fetchGoogleProfile(accessToken);
    store.users[profile.sub] = {
      userId: profile.sub,
      email: profile.email || "",
      name: profile.name || profile.email || "Google user",
      refreshToken: encrypt(refreshToken),
      updatedAt: Date.now()
    };
    session.userId = profile.sub;
    session.state = "";
    session.updatedAt = Date.now();
    store.sessions[sessionId] = session;
    saveStore(store);

    res.redirect(session.returnTo || "/lifetree/");
  } catch (error) {
    res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

app.post("/api/auth/logout", (req, res) => {
  const store = loadStore();
  const sessionId = req.cookies[SESSION_COOKIE] || "";
  if (sessionId) {
    delete store.sessions[sessionId];
    saveStore(store);
  }

  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: shouldUseSecureCookies()
  }));
  res.json({ ok: true });
});

app.get("/api/lifetree/load", async (req, res) => {
  try {
    const user = requireUser(req);
    const accessToken = await refreshAccessToken(user);
    const file = await findDriveFile(accessToken);
    if (!file) {
      res.json({ found: false });
      return;
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(await formatGoogleError(response, "Drive download failed"));
    }

    const payload = await response.json();
    res.json({ found: true, fileId: file.id, modifiedTime: file.modifiedTime || "", payload });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post("/api/lifetree/save", async (req, res) => {
  try {
    const user = requireUser(req);
    const accessToken = await refreshAccessToken(user);
    const payload = req.body?.payload;
    const fileId = typeof req.body?.fileId === "string" ? req.body.fileId : "";
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Missing payload" });
      return;
    }

    const file = await upsertDriveFile(accessToken, payload, fileId);
    res.json({ ok: true, fileId: file.id, modifiedTime: file.modifiedTime || "" });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post("/api/lifetree/reset", async (req, res) => {
  try {
    const user = requireUser(req);
    if (user.email !== DEV_EMAIL) {
      res.status(403).json({ error: "Developer reset is restricted to the owner account." });
      return;
    }

    const accessToken = await refreshAccessToken(user);
    const file = await findDriveFile(accessToken);
    if (!file) {
      res.json({ ok: true, cleared: false });
      return;
    }

    await deleteDriveFile(accessToken, file.id);
    res.json({ ok: true, cleared: true });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      error: `Lifetree data is too large for the current request limit (${REQUEST_BODY_LIMIT}).`
    });
    return;
  }
  next(error);
});

app.use(express.static(rootDir, { extensions: ["html"] }));

app.listen(PORT, () => {
  console.log(`Lifetree server listening on http://localhost:${PORT}`);
});

function assertOAuthEnv() {
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TOKEN_SECRET"]) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function requireUser(req) {
  const store = loadStore();
  const session = getSession(store, req.cookies[SESSION_COOKIE] || "");
  if (!session?.userId) {
    throw new Error("Not authenticated");
  }

  const user = store.users[session.userId];
  if (!user) {
    throw new Error("Missing stored user");
  }

  return user;
}

function getSession(store, sessionId) {
  return sessionId ? store.sessions[sessionId] || null : null;
}

function ensureSessionId(req, res) {
  const existing = req.cookies[SESSION_COOKIE];
  if (existing) {
    return existing;
  }

  const sessionId = crypto.randomUUID();
  const sessionCookie = serializeCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "Lax",
    secure: shouldUseSecureCookies()
  });
  res.setHeader("Set-Cookie", sessionCookie);

  const store = loadStore();
  store.sessions[sessionId] = createSessionRecord();
  saveStore(store);
  return sessionId;
}

function createSessionRecord() {
  return {
    userId: "",
    state: "",
    returnTo: "/lifetree/",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function exchangeCodeForTokens(code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Token exchange failed"));
  }

  return response.json();
}

async function refreshAccessToken(user) {
  const refreshToken = decryptIfPresent(user.refreshToken);
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Token refresh failed"));
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Token refresh did not return an access token");
  }

  return payload.access_token;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Profile fetch failed"));
  }

  return response.json();
}

async function findDriveFile(accessToken) {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Drive lookup failed"));
  }

  const payload = await response.json();
  return Array.isArray(payload.files) && payload.files.length > 0 ? payload.files[0] : null;
}

async function upsertDriveFile(accessToken, payload, preferredFileId = "") {
  const existing = preferredFileId ? { id: preferredFileId } : await findDriveFile(accessToken);
  const metadata = existing
    ? { name: DRIVE_FILE_NAME, mimeType: "application/json" }
    : { name: DRIVE_FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] };
  const boundary = `lifetree-${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const response = await fetch(
    existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime",
    {
      method: existing ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  if (response.status === 404 && preferredFileId) {
    const fallbackExisting = await findDriveFile(accessToken);
    if (!fallbackExisting || fallbackExisting.id === preferredFileId) {
      throw new Error(await formatGoogleError(response, "Drive upload failed"));
    }
    return upsertDriveFile(accessToken, payload, fallbackExisting.id);
  }

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Drive upload failed"));
  }

  return response.json();
}

async function deleteDriveFile(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Drive delete failed"));
  }
}

function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    return { users: {}, sessions: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return { users: {}, sessions: {} };
  }
}

function saveStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function parseCookies(header) {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((result, part) => {
      const [key, ...rest] = part.split("=");
      result[key] = decodeURIComponent(rest.join("="));
      return result;
    }, {});
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function sanitizeReturnTo(value) {
  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (isAllowedDevOrigin(parsed.origin) && parsed.pathname.startsWith("/")) {
      return parsed.toString();
    }
  } catch {}

  return "/lifetree/";
}

function shouldUseSecureCookies() {
  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }
  return true;
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const key = getCipherKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptIfPresent(value) {
  if (!value) {
    return "";
  }

  const [ivPart, tagPart, encryptedPart] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getCipherKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function getCipherKey() {
  return crypto.createHash("sha256").update(process.env.TOKEN_SECRET || "").digest();
}

function resolveDataDir(configuredDir, fallbackDir) {
  const preferredDir = configuredDir ? path.resolve(configuredDir) : fallbackDir;
  if (ensureDirectoryWritable(preferredDir)) {
    return preferredDir;
  }

  if (preferredDir !== fallbackDir && ensureDirectoryWritable(fallbackDir)) {
    console.warn(`DATA_DIR ${preferredDir} is not writable. Falling back to ${fallbackDir}.`);
    return fallbackDir;
  }

  return preferredDir;
}

function ensureDirectoryWritable(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isAllowedDevOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      parsed.protocol === "http:"
    );
  } catch {
    return false;
  }
}

async function formatGoogleError(response, prefix) {
  let detail = "";

  try {
    const payload = await response.clone().json();
    const topLevel = payload?.error;
    const first = Array.isArray(topLevel?.errors) ? topLevel.errors[0] : null;
    const reason = first?.reason || "";
    const message = first?.message || topLevel?.message || "";
    detail = [reason, message].filter(Boolean).join(": ");
  } catch {
    detail = (await response.text()).trim();
  }

  return detail ? `${prefix} (${response.status}) - ${detail}` : `${prefix} (${response.status})`;
}
