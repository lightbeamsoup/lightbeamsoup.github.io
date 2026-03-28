import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  buildEmailSummaryPreview,
  renderEmailSummaryBodyHtml,
  renderEmailSummaryBodyText,
  shouldEmailSummarySendNow
} from "../lifetree/modules/notificationSummary.js";
import {
  buildEmailReminderTemplates,
  buildSentReminderKeySet,
  collectEmailReminderCandidates,
  buildScheduledEmailReminderTemplates,
  renderEmailReminderBodyHtml,
  renderEmailReminderBodyText
} from "../lifetree/modules/notificationReminders.js";
import {
  appendNotificationHistoryEntry,
  appendEmailSummaryHistoryEntry,
  normalizeNotifications,
  normalizeRecipientEmail
} from "../lifetree/modules/notifications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const defaultDataDir = path.join(__dirname, "data");
const dataDir = resolveDataDir(process.env.DATA_DIR, defaultDataDir);
const storePath = path.join(dataDir, "auth-store.json");

const PORT = Number(process.env.PORT || 3000);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "10mb";
const SUMMARY_SCHEDULER_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.SUMMARY_SCHEDULER_INTERVAL_MS || 300_000) || 300_000
);
const REMINDER_LOOKBACK_WINDOW_MS = SUMMARY_SCHEDULER_INTERVAL_MS + 15_000;
const NOTIFICATION_LOG_LEVEL = normalizeNotificationLogLevel(process.env.NOTIFICATION_LOG_LEVEL);
const ENABLE_NOTIFICATION_SCHEDULER = process.env.ENABLE_NOTIFICATION_SCHEDULER !== "false";
const SERVER_MODE = resolveServerMode(process.env.LIFETREE_SERVER_MODE, process.argv.slice(2));
const RUNS_WEB_SERVER = SERVER_MODE !== "worker";
const SESSION_COOKIE = "lifetree_session";
const DRIVE_FILE_NAME = "task-deck-store.json";
const DEV_EMAIL = "jbkallman@gmail.com";
const LIFETREE_APP_URL = "https://www.joshcodes.ai/lifetree";
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/gmail.send"
].join(" ");
const notificationSchedulerState = {
  inFlight: false,
  timerId: null
};

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

app.post("/api/notifications/send-summary", async (req, res) => {
  try {
    await handleNotificationSendRequest(req, res, {
      missingRecipientMessage: "Choose a valid recipient email before sending a summary.",
      missingSubjectMessage: "Missing summary subject.",
      missingBodyMessage: "Missing summary body."
    });
  } catch (error) {
    const message = String(error?.message || "Email summary send failed");
    const statusCode = message === "Not authenticated" || message === "Missing stored user"
      ? 401
      : message.includes("(403)")
        ? 403
        : 500;
    res.status(statusCode).json({ error: message });
  }
});

app.post("/api/notifications/send-reminder", async (req, res) => {
  try {
    await handleNotificationSendRequest(req, res, {
      missingRecipientMessage: "Choose a valid recipient email before sending reminders.",
      missingSubjectMessage: "Missing reminder subject.",
      missingBodyMessage: "Missing reminder body."
    });
  } catch (error) {
    const message = String(error?.message || "Email reminder send failed");
    const statusCode = message === "Not authenticated" || message === "Missing stored user"
      ? 401
      : message.includes("(403)")
        ? 403
        : 500;
    res.status(statusCode).json({ error: message });
  }
});

app.post("/api/notifications/dev-send-test", async (req, res) => {
  try {
    const user = requireUser(req);
    if (normalizeRecipientEmail(user.email) !== DEV_EMAIL) {
      res.status(403).json({ error: "Developer test email is restricted to the owner account." });
      return;
    }

    const accessToken = await refreshAccessToken(user);
    const recipientEmail = normalizeRecipientEmail(req.body?.recipientEmail) || normalizeRecipientEmail(user.email);
    if (!recipientEmail) {
      res.status(400).json({ error: "Choose a valid recipient email before sending a test notification." });
      return;
    }

    const sentAt = Date.now();
    const timestamp = new Date(sentAt).toISOString();
    const subject = `Lifetree test notification · ${timestamp}`;
    const html = `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f5efe4; color: #253243; font-family: Georgia, 'Times New Roman', serif;">
    <main style="max-width: 720px; margin: 0 auto; background: #fffaf3; border: 1px solid rgba(37, 50, 67, 0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(37, 50, 67, 0.12);">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #e57b4b;">Lifetree dev test</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #253243;">Test notification delivery</h1>
      <p style="margin: 0 0 14px; color: #4f637a;">This email bypasses normal summary/reminder timing and dedupe checks.</p>
      <ul style="margin: 0; padding-left: 20px; color: #4f637a; line-height: 1.55;">
        <li>Sent at: ${escapeHtml(timestamp)}</li>
        <li>Server mode: ${escapeHtml(SERVER_MODE)}</li>
        <li>Scheduler enabled: ${ENABLE_NOTIFICATION_SCHEDULER ? "true" : "false"}</li>
      </ul>
      <p style="margin: 24px 0 0; color: #4f637a;">Open Lifetree: <a href="${LIFETREE_APP_URL}" style="color: #e57b4b;">${LIFETREE_APP_URL}</a></p>
    </main>
  </body>
</html>`;
    const text = [
      "Lifetree dev test",
      "",
      "This email bypasses normal summary/reminder timing and dedupe checks.",
      `Sent at: ${timestamp}`,
      `Server mode: ${SERVER_MODE}`,
      `Scheduler enabled: ${ENABLE_NOTIFICATION_SCHEDULER ? "true" : "false"}`,
      "",
      `Open Lifetree: ${LIFETREE_APP_URL}`
    ].join("\n");

    const delivery = await sendGmailMessage(accessToken, {
      fromEmail: normalizeRecipientEmail(user.email),
      recipientEmail,
      subject,
      html,
      text
    });

    res.json({
      ok: true,
      id: delivery.id || "",
      threadId: delivery.threadId || "",
      sentAt
    });
  } catch (error) {
    const message = String(error?.message || "Test notification send failed");
    const statusCode = message === "Not authenticated" || message === "Missing stored user"
      ? 401
      : message.includes("(403)")
        ? 403
        : 500;
    res.status(statusCode).json({ error: message });
  }
});

app.get("/api/notifications/dev-diagnostics", async (req, res) => {
  try {
    const user = requireUser(req);
    if (normalizeRecipientEmail(user.email) !== DEV_EMAIL) {
      res.status(403).json({ error: "Notification diagnostics are restricted to the owner account." });
      return;
    }

    const accessToken = await refreshAccessToken(user);
    const file = await findDriveFile(accessToken);
    if (!file) {
      res.json({
        ok: true,
        found: false,
        reason: "no-drive-file"
      });
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
    const notifications = normalizeNotifications(payload.notifications);
    const emailConfig = notifications.email;
    const now = new Date();
    const recipientEmail = normalizeRecipientEmail(emailConfig.recipientEmail || user.email);
    const summaryDueCheck = shouldEmailSummarySendNow(emailConfig, now);
    const summaryPreview = buildEmailSummaryPreview({
      store: payload,
      emailConfig,
      now,
      fallbackRecipientEmail: normalizeRecipientEmail(user.email)
    });
    const reminderCandidates = collectEmailReminderCandidates({
      store: payload,
      emailConfig,
      now,
      timeZone: emailConfig.summaries.timezone,
      requireDailyAgendaTime: true,
      lookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS
    });
    const scheduledReminderTemplates = buildScheduledEmailReminderTemplates({
      store: payload,
      emailConfig,
      now,
      fallbackRecipientEmail: normalizeRecipientEmail(user.email),
      lookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS
    });
    const manualReminderTemplates = buildEmailReminderTemplates({
      store: payload,
      emailConfig,
      now,
      fallbackRecipientEmail: normalizeRecipientEmail(user.email),
      requireDailyAgendaTime: false
    });
    const sentReminderKeys = buildSentReminderKeySet(emailConfig.history);

    res.json({
      ok: true,
      found: true,
      nowIso: now.toISOString(),
      userEmail: normalizeRecipientEmail(user.email),
      recipientEmail,
      fileId: file.id,
      fileModifiedTime: file.modifiedTime || "",
      summary: {
        enabled: emailConfig.summaries.enabled === true,
        frequency: emailConfig.summaries.frequency,
        sendTime: emailConfig.summaries.sendTime,
        weekday: emailConfig.summaries.weekday,
        timezone: emailConfig.summaries.timezone,
        dueCheck: summaryDueCheck,
        preview: {
          recipientEmail: summaryPreview.recipientEmail,
          subject: summaryPreview.subject,
          summaryKey: summaryPreview.summaryKey,
          sectionCount: Array.isArray(summaryPreview.sections) ? summaryPreview.sections.length : 0
        }
      },
      reminders: {
        enabled: emailConfig.reminders.enabled === true,
        dueSoonEnabled: emailConfig.reminders.dueSoonEnabled !== false,
        overdueEnabled: emailConfig.reminders.overdueEnabled !== false,
        dailyAgendaEnabled: emailConfig.reminders.dailyAgendaEnabled === true,
        dailyAgendaTime: emailConfig.reminders.dailyAgendaTime,
        quietHoursEnabled: emailConfig.reminders.quietHoursEnabled === true,
        quietHoursStart: emailConfig.reminders.quietHoursStart,
        quietHoursEnd: emailConfig.reminders.quietHoursEnd,
        sentReminderKeyCount: sentReminderKeys.size,
        rawCandidates: {
          dueSoonCount: reminderCandidates.dueSoon.length,
          overdueCount: reminderCandidates.overdue.length,
          dailyAgendaCount: reminderCandidates.dailyAgenda.length,
          dailyAgendaKey: reminderCandidates.dailyAgendaKey || "",
          dueSoon: reminderCandidates.dueSoon.slice(0, 8).map((candidate) => ({
            key: candidate.key,
            taskId: candidate.task?.id || "",
            taskName: candidate.task?.name || "",
            dueDate: candidate.task?.dueDate || candidate.task?.startDate || "",
            timeOfDay: candidate.task?.timeOfDay || ""
          })),
          overdue: reminderCandidates.overdue.slice(0, 8).map((candidate) => ({
            key: candidate.key,
            taskId: candidate.task?.id || "",
            taskName: candidate.task?.name || "",
            dueDate: candidate.task?.dueDate || candidate.task?.startDate || "",
            timeOfDay: candidate.task?.timeOfDay || ""
          }))
        },
        scheduledTemplates: scheduledReminderTemplates.map((template) => ({
          templateKind: template.templateKind,
          subject: template.subject,
          eventCount: template.eventCount,
          eventKeys: Array.isArray(template.eventKeys) ? template.eventKeys : [],
          suppressedByQuietHours: template.suppressedByQuietHours === true
        })),
        manualTemplates: manualReminderTemplates.map((template) => ({
          templateKind: template.templateKind,
          subject: template.subject,
          eventCount: template.eventCount,
          eventKeys: Array.isArray(template.eventKeys) ? template.eventKeys : [],
          suppressedByQuietHours: template.suppressedByQuietHours === true
        }))
      },
      history: normalizeNotifications(payload.notifications).email.history.slice(0, 10).map((entry) => ({
        at: entry.at,
        status: entry.status,
        kind: entry.kind,
        reminderTemplateKind: entry.reminderTemplateKind,
        subject: entry.subject,
        summaryKey: entry.summaryKey,
        reminderKey: entry.reminderKey,
        reminderEventKeys: entry.reminderEventKeys
      }))
    });
  } catch (error) {
    const message = String(error?.message || "Notification diagnostics failed");
    const statusCode = message === "Not authenticated" || message === "Missing stored user"
      ? 401
      : message.includes("(403)")
        ? 403
        : 500;
    res.status(statusCode).json({ error: message });
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

if (RUNS_WEB_SERVER) {
  app.listen(PORT, () => {
    console.log(`Lifetree server listening on http://localhost:${PORT}`);
  });
} else {
  console.log("Lifetree notification worker starting without the web server.");
  const healthApp = express();
  healthApp.get("/healthz", (_req, res) => {
    res.json({ ok: true, mode: "worker" });
  });
  healthApp.listen(PORT, () => {
    console.log(`Lifetree notification worker healthcheck listening on http://localhost:${PORT}/healthz`);
  });
}

if (!RUNS_WEB_SERVER && !ENABLE_NOTIFICATION_SCHEDULER) {
  console.error("Worker mode requires ENABLE_NOTIFICATION_SCHEDULER=true.");
  process.exit(1);
}

if (ENABLE_NOTIFICATION_SCHEDULER) {
  startNotificationScheduler();
}

function normalizeNotificationLogLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "verbose") {
    return "verbose";
  }
  if (normalized === "basic") {
    return "basic";
  }
  return "off";
}

function shouldLogNotifications(level) {
  if (NOTIFICATION_LOG_LEVEL === "verbose") {
    return true;
  }
  if (NOTIFICATION_LOG_LEVEL === "basic") {
    return level !== "verbose";
  }
  return false;
}

function logNotification(level, message, context = null) {
  if (!shouldLogNotifications(level)) {
    return;
  }
  if (context && Object.keys(context).length > 0) {
    console.log(`[notifications] ${message} ${JSON.stringify(context)}`);
    return;
  }
  console.log(`[notifications] ${message}`);
}

async function handleNotificationSendRequest(req, res, {
  missingRecipientMessage,
  missingSubjectMessage,
  missingBodyMessage
}) {
  const user = requireUser(req);
  const accessToken = await refreshAccessToken(user);
  const recipientEmail = normalizeRecipientEmail(req.body?.recipientEmail) || normalizeRecipientEmail(user.email);
  const subject = sanitizeEmailHeader(req.body?.subject, 220);
  const html = sanitizeEmailBody(req.body?.html, 200_000);
  const text = sanitizeEmailBody(req.body?.text, 80_000);

  if (!recipientEmail) {
    res.status(400).json({ error: missingRecipientMessage });
    return;
  }
  if (!subject) {
    res.status(400).json({ error: missingSubjectMessage });
    return;
  }
  if (!html && !text) {
    res.status(400).json({ error: missingBodyMessage });
    return;
  }

  const delivery = await sendGmailMessage(accessToken, {
    fromEmail: normalizeRecipientEmail(user.email),
    recipientEmail,
    subject,
    html: html || `<pre>${escapeHtml(text)}</pre>`,
    text: text || stripHtmlToText(html)
  });

  res.json({
    ok: true,
    id: delivery.id || "",
    threadId: delivery.threadId || "",
    sentAt: Date.now()
  });
}

function assertOAuthEnv() {
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TOKEN_SECRET"]) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function resolveServerMode(envValue, argv) {
  if (Array.isArray(argv) && argv.includes("--worker")) {
    return "worker";
  }
  return String(envValue || "").toLowerCase() === "worker" ? "worker" : "web";
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

async function sendGmailMessage(accessToken, { fromEmail, recipientEmail, subject, html, text }) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw: buildRawEmailMessage({
        fromEmail,
        recipientEmail,
        subject,
        html,
        text
      })
    })
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Gmail send failed"));
  }

  return response.json();
}

function startNotificationScheduler() {
  if (notificationSchedulerState.timerId) {
    return;
  }
  logNotification("basic", "Scheduler started", {
    intervalMs: SUMMARY_SCHEDULER_INTERVAL_MS,
    reminderLookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS,
    mode: SERVER_MODE
  });
  notificationSchedulerState.timerId = setInterval(() => {
    void runNotificationScheduler();
  }, SUMMARY_SCHEDULER_INTERVAL_MS);
  setTimeout(() => {
    void runNotificationScheduler();
  }, 15_000);
}

async function runNotificationScheduler() {
  if (notificationSchedulerState.inFlight) {
    logNotification("verbose", "Scheduler tick skipped because a prior run is still in flight");
    return;
  }
  notificationSchedulerState.inFlight = true;
  try {
    const store = loadStore();
    const users = Object.values(store.users || {});
    logNotification("verbose", "Scheduler tick started", {
      userCount: users.length,
      at: new Date().toISOString()
    });
    if (users.length === 0) {
      logNotification("basic", "Scheduler found no authenticated users; check that the worker can read the same auth store as the web service", {
        dataDir,
        storePath
      });
    }
    for (const user of users) {
      try {
        await processScheduledNotificationsForUser(user);
      } catch (error) {
        console.error(`Notification scheduler failed for ${user?.email || user?.userId || "unknown user"}: ${error.message}`);
      }
    }
  } finally {
    notificationSchedulerState.inFlight = false;
  }
}

async function processScheduledNotificationsForUser(user) {
  if (!user?.refreshToken) {
    logNotification("verbose", "Skipping user without refresh token", {
      userEmail: normalizeRecipientEmail(user?.email || "")
    });
    return;
  }

  const accessToken = await refreshAccessToken(user);
  const file = await findDriveFile(accessToken);
  if (!file) {
    logNotification("verbose", "No Drive store found for user", {
      userEmail: normalizeRecipientEmail(user?.email || "")
    });
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
  const notifications = normalizeNotifications(payload.notifications);
  const emailConfig = notifications.email;
  let history = emailConfig.history;
  let changed = false;
  const now = new Date();
  const userEmail = normalizeRecipientEmail(user.email);
  const reminderCandidates = collectEmailReminderCandidates({
    store: payload,
    emailConfig,
    now,
    timeZone: emailConfig.summaries.timezone,
    requireDailyAgendaTime: true,
    lookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS
  });
  const dueCheck = shouldEmailSummarySendNow(emailConfig, now);
  logNotification("verbose", "Evaluated notification state for user", {
    userEmail,
    fileId: file.id,
    summaryDue: dueCheck.due,
    summaryReason: dueCheck.reason || (dueCheck.due ? "due" : ""),
    dueSoonCount: reminderCandidates.dueSoon.length,
    overdueCount: reminderCandidates.overdue.length,
    dailyAgendaCount: reminderCandidates.dailyAgenda.length
  });
  if (dueCheck.due) {
    const preview = buildEmailSummaryPreview({
      store: payload,
      emailConfig,
      now,
      fallbackRecipientEmail: userEmail
    });
    if (preview.recipientEmail) {
      await sendGmailMessage(accessToken, {
        fromEmail: userEmail,
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        html: renderEmailSummaryBodyHtml(preview),
        text: renderEmailSummaryBodyText(preview)
      });
      logNotification("basic", "Sent summary email", {
        userEmail,
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        summaryKey: preview.summaryKey || dueCheck.summaryKey
      });

      history = appendEmailSummaryHistoryEntry(history, {
        id: crypto.randomUUID(),
        at: Date.now(),
        status: "sent",
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        summaryKey: preview.summaryKey || dueCheck.summaryKey
      });
      changed = true;
    }
  }

  const reminderTemplates = buildScheduledEmailReminderTemplates({
    store: payload,
    emailConfig,
    now,
    fallbackRecipientEmail: userEmail,
    lookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS
  });
  logNotification("verbose", "Built scheduled reminder templates", {
    userEmail,
    templates: reminderTemplates.map((template) => ({
      templateKind: template.templateKind,
      eventCount: template.eventCount,
      suppressedByQuietHours: template.suppressedByQuietHours,
      subject: template.subject
    }))
  });
  for (const reminderPreview of reminderTemplates) {
    if (!reminderPreview.recipientEmail || reminderPreview.items.length === 0 || reminderPreview.suppressedByQuietHours) {
      continue;
    }

    await sendGmailMessage(accessToken, {
      fromEmail: userEmail,
      recipientEmail: reminderPreview.recipientEmail,
      subject: reminderPreview.subject,
      html: renderEmailReminderBodyHtml(reminderPreview),
      text: renderEmailReminderBodyText(reminderPreview)
    });
    logNotification("basic", "Sent reminder email", {
      userEmail,
      recipientEmail: reminderPreview.recipientEmail,
      templateKind: reminderPreview.templateKind,
      eventCount: reminderPreview.eventCount,
      subject: reminderPreview.subject
    });

    history = appendNotificationHistoryEntry(history, {
      id: crypto.randomUUID(),
      at: Date.now(),
      status: "sent",
      kind: "reminder",
      reminderTemplateKind: reminderPreview.templateKind || "",
      recipientEmail: reminderPreview.recipientEmail,
      subject: reminderPreview.subject,
      reminderKey: reminderPreview.reminderKey || "",
      reminderEventKeys: Array.isArray(reminderPreview.eventKeys) ? reminderPreview.eventKeys : []
    });
    changed = true;
  }

  if (!changed) {
    logNotification("verbose", "No scheduled notifications sent for user", {
      userEmail
    });
    return;
  }

  payload.notifications = normalizeNotifications({
    ...payload.notifications,
    email: {
      ...emailConfig,
      history,
      updatedAt: Date.now()
    }
  });
  await upsertDriveFile(accessToken, payload, file.id);
  logNotification("verbose", "Persisted notification history back to Drive", {
    userEmail,
    fileId: file.id
  });
}

function buildRawEmailMessage({ fromEmail, recipientEmail, subject, html, text }) {
  const boundary = `lifetree-${crypto.randomUUID()}`;
  const message = [
    fromEmail ? `From: ${fromEmail}` : "",
    `To: ${recipientEmail}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    ""
  ]
    .filter((line, index) => line || index >= 4)
    .join("\r\n");

  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

function sanitizeEmailHeader(value, maxLength = 200) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeEmailBody(value, maxLength = 100_000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;
}

function stripHtmlToText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
