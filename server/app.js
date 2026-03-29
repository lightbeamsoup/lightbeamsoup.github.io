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
const FLIGHTAWARE_AEROAPI_KEY = String(process.env.FLIGHTAWARE_AEROAPI_KEY || "").trim();
const TRAVEL_WEATHER_CACHE_TTL_MS = 1000 * 60 * 60;
const US_STATE_NAME_BY_CODE = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia"
};
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
const travelLiveCache = new Map();

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

app.post("/api/travel/live", async (req, res) => {
  try {
    const trips = normalizeTravelLiveTrips(req.body?.trips);
    if (trips.length === 0) {
      res.json({ ok: true, trips: [] });
      return;
    }

    logTravelLive("verbose", "Received travel live request", {
      tripCount: trips.length,
      forcedFlightRefreshCount: trips.filter((trip) => trip.forceFlightRefresh).length,
      tripIds: trips.map((trip) => trip.tripId)
    });
    const snapshots = await Promise.all(trips.map((trip) => buildTravelLiveSnapshot(trip)));
    logTravelLive("verbose", "Resolved travel live request", {
      tripCount: snapshots.length,
      flightStatusCounts: snapshots.reduce((result, snapshot) => {
        const key = snapshot?.flight?.status || "none";
        result[key] = (result[key] || 0) + 1;
        return result;
      }, {})
    });
    res.json({
      ok: true,
      trips: snapshots
    });
  } catch (error) {
    logTravelLive("basic", "Travel live request failed", {
      message: String(error?.message || "Travel live lookup failed")
    });
    res.status(500).json({ error: String(error?.message || "Travel live lookup failed") });
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
    if (ENABLE_NOTIFICATION_SCHEDULER) {
      logNotification("basic", "Scheduler enabled on web service", {
        intervalMs: SUMMARY_SCHEDULER_INTERVAL_MS,
        reminderLookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS,
        logLevel: NOTIFICATION_LOG_LEVEL,
        dataDir,
        storePath
      });
    }
  });
} else {
  console.log("Lifetree notification worker starting without the web server.");
  const healthApp = express();
  healthApp.get("/healthz", (_req, res) => {
    res.json({ ok: true, mode: "worker" });
  });
  healthApp.listen(PORT, () => {
    console.log(`Lifetree notification worker healthcheck listening on http://localhost:${PORT}/healthz`);
    logNotification("basic", "Scheduler enabled on worker service", {
      intervalMs: SUMMARY_SCHEDULER_INTERVAL_MS,
      reminderLookbackWindowMs: REMINDER_LOOKBACK_WINDOW_MS,
      logLevel: NOTIFICATION_LOG_LEVEL,
      dataDir,
      storePath
    });
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

function logTravelLive(level, message, context = null) {
  if (!shouldLogNotifications(level)) {
    return;
  }
  if (context && Object.keys(context).length > 0) {
    console.log(`[travel-live] ${message} ${JSON.stringify(context)}`);
    return;
  }
  console.log(`[travel-live] ${message}`);
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

function normalizeTravelLiveTrips(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 3)
    .map((trip) => normalizeTravelLiveTrip(trip))
    .filter(Boolean);
}

function normalizeTravelLiveTrip(value) {
  const tripId = typeof value?.tripId === "string" ? value.tripId : "";
  if (!tripId) {
    return null;
  }

  const weather = normalizeTravelWeatherRequest(value?.weather);
  const flight = normalizeTravelFlightRequest(value?.flight);
  if (!weather && !flight) {
    return null;
  }

  return {
    tripId,
    weather,
    flight,
    forceFlightRefresh: value?.forceFlightRefresh === true,
    existingSnapshot: normalizeTravelLiveSnapshot(value?.existingSnapshot)
  };
}

function normalizeTravelLiveSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const weather = normalizeTravelWeatherSnapshot(value.weather);
  const flight = normalizeTravelFlightSnapshot(value.flight);
  if (!weather && !flight) {
    return null;
  }
  return {
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : (typeof value.fetchedAt === "number" ? value.fetchedAt : 0),
    weather,
    flight
  };
}

function normalizeTravelWeatherSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const days = Array.isArray(value.days)
    ? value.days
        .slice(0, 6)
        .map((day) => ({
          date: normalizeDateString(day?.date),
          shortLabel: sanitizeTravelText(day?.shortLabel, 24),
          dateLabel: sanitizeTravelText(day?.dateLabel, 24),
          temperatureLabel: sanitizeTravelText(day?.temperatureLabel, 40),
          conditionLabel: sanitizeTravelText(day?.conditionLabel, 80)
        }))
        .filter((day) => day.date || day.shortLabel || day.temperatureLabel || day.conditionLabel)
    : [];
  return {
    status: sanitizeTravelText(value.status, 32),
    message: sanitizeTravelText(value.message, 240),
    query: sanitizeTravelText(value.query, 160),
    locationLabel: sanitizeTravelText(value.locationLabel, 120),
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    nextRefreshAt: typeof value.nextRefreshAt === "number" ? value.nextRefreshAt : 0,
    days
  };
}

function normalizeTravelFlightSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    status: sanitizeTravelText(value.status, 32),
    message: sanitizeTravelText(value.message, 240),
    flightLabel: sanitizeTravelText(value.flightLabel, 40),
    statusLabel: sanitizeTravelText(value.statusLabel, 80),
    departureCode: sanitizeTravelText(value.departureCode, 8).toUpperCase(),
    arrivalCode: sanitizeTravelText(value.arrivalCode, 8).toUpperCase(),
    departureTimeLabel: sanitizeTravelText(value.departureTimeLabel, 80),
    gate: sanitizeTravelText(value.gate, 12),
    terminal: sanitizeTravelText(value.terminal, 12),
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    nextRefreshAt: typeof value.nextRefreshAt === "number" ? value.nextRefreshAt : 0
  };
}

function normalizeTravelWeatherRequest(value) {
  const destinationQuery = sanitizeTravelText(value?.destinationQuery, 160);
  if (!destinationQuery) {
    return null;
  }
  const candidateQueries = Array.isArray(value?.candidateQueries)
    ? value.candidateQueries
        .map((entry) => sanitizeTravelText(entry, 160))
        .filter(Boolean)
        .filter((entry, index, list) => list.indexOf(entry) === index)
    : [];
  return {
    destinationQuery,
    candidateQueries,
    startDate: normalizeDateString(value?.startDate),
    endDate: normalizeDateString(value?.endDate)
  };
}

function normalizeTravelFlightRequest(value) {
  const flightNumber = sanitizeTravelText(value?.flightNumber, 24).toUpperCase();
  const flightDate = normalizeDateString(value?.flightDate);
  if (!flightNumber || !flightDate) {
    return null;
  }
  return {
    leg: sanitizeTravelText(value?.leg, 16).toLowerCase(),
    flightNumber,
    flightDate,
    scheduledTimestamp: normalizeTimestamp(value?.scheduledTimestamp),
    departureCode: extractAirportCode(value?.departureCode),
    arrivalCode: extractAirportCode(value?.arrivalCode),
    displayTimeZone: sanitizeTravelText(value?.displayTimeZone, 80),
    scheduledDate: normalizeDateString(value?.scheduledDate),
    scheduledTime: normalizeTimeString(value?.scheduledTime)
  };
}

async function buildTravelLiveSnapshot(trip) {
  const cacheKey = JSON.stringify({
    tripId: trip.tripId,
    weather: trip.weather,
    flight: trip.flight
  });
  const now = Date.now();
  const cached = travelLiveCache.get(cacheKey);
  const durableSnapshot = pickTravelLiveSnapshot(cached?.snapshot || null, trip.existingSnapshot);
  if (cached && now < cached.expiresAt && !trip.forceFlightRefresh) {
    logTravelLive("verbose", "Travel live cache hit", {
      tripId: trip.tripId,
      expiresAt: cached.expiresAt
    });
    return cached.snapshot;
  }
  if (durableSnapshot && !trip.forceFlightRefresh && !shouldRefreshTravelSnapshot(trip, durableSnapshot, now)) {
    logTravelLive("verbose", "Reusing persisted travel live snapshot", {
      tripId: trip.tripId,
      flightNextRefreshAt: durableSnapshot.flight?.nextRefreshAt || 0,
      weatherNextRefreshAt: durableSnapshot.weather?.nextRefreshAt || 0
    });
    travelLiveCache.set(cacheKey, {
      expiresAt: Math.min(
        trip.weather ? resolveTravelComponentExpiresAt(durableSnapshot.weather, now + TRAVEL_WEATHER_CACHE_TTL_MS) : Number.POSITIVE_INFINITY,
        trip.flight ? resolveTravelComponentExpiresAt(durableSnapshot.flight, computeFlightSnapshotExpiresAt(trip.flight, now)) : Number.POSITIVE_INFINITY
      ),
      snapshot: durableSnapshot
    });
    return durableSnapshot;
  }

  logTravelLive("verbose", cached ? "Travel live cache stale" : "Travel live cache miss", {
    tripId: trip.tripId,
    forceFlightRefresh: trip.forceFlightRefresh === true
  });
  const cachedSnapshot = durableSnapshot;
  const [weather, flight] = await Promise.all([
    trip.weather
      ? (
          cachedSnapshot?.weather && !shouldRefreshTravelLiveComponent(cachedSnapshot.weather, now)
            ? (
                logTravelLive("verbose", "Reusing cached travel weather snapshot", {
                  tripId: trip.tripId,
                  nextRefreshAt: cachedSnapshot.weather?.nextRefreshAt || 0
                }),
                Promise.resolve(cachedSnapshot.weather)
              )
            : fetchTravelWeatherSnapshot(trip.weather).catch((error) => {
                logTravelLive("basic", "Weather lookup failed", {
                  tripId: trip.tripId,
                  destinationQuery: trip.weather?.destinationQuery || "",
                  message: String(error?.message || "Forecast unavailable right now.")
                });
                return {
                  status: "error",
                  message: "Forecast unavailable right now.",
                  fetchedAt: now,
                  nextRefreshAt: now + TRAVEL_WEATHER_CACHE_TTL_MS
                };
              })
        )
      : Promise.resolve(null),
    trip.flight
      ? (
          !trip.forceFlightRefresh && cachedSnapshot?.flight && !shouldRefreshTravelLiveComponent(cachedSnapshot.flight, now)
            ? (
                logTravelLive("verbose", "Reusing cached FlightAware snapshot", {
                  tripId: trip.tripId,
                  flightNumber: trip.flight?.flightNumber || "",
                  nextRefreshAt: cachedSnapshot.flight?.nextRefreshAt || 0
                }),
                Promise.resolve(cachedSnapshot.flight)
              )
            : fetchTravelFlightSnapshot(trip.flight, {
                tripId: trip.tripId,
                forceRefresh: trip.forceFlightRefresh === true
              }).catch((error) => {
                const message = String(error?.message || "Live flight status is unavailable right now.");
                logTravelLive("basic", "FlightAware lookup failed", {
                  tripId: trip.tripId,
                  flightNumber: trip.flight?.flightNumber || "",
                  message
                });
                return {
                  status: "error",
                  message: "Live flight status is unavailable right now.",
                  fetchedAt: now,
                  nextRefreshAt: computeFlightSnapshotExpiresAt(trip.flight, now)
                };
              })
        )
      : Promise.resolve(null)
  ]);

  const snapshot = {
    tripId: trip.tripId,
    status: "ok",
    weather,
    flight,
    fetchedAt: now,
    updatedAt: now
  };
  const expiresAt = Math.min(
    trip.weather ? resolveTravelComponentExpiresAt(weather, now + TRAVEL_WEATHER_CACHE_TTL_MS) : Number.POSITIVE_INFINITY,
    trip.flight ? resolveTravelComponentExpiresAt(flight, computeFlightSnapshotExpiresAt(trip.flight, now)) : Number.POSITIVE_INFINITY
  );
  travelLiveCache.set(cacheKey, {
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + TRAVEL_WEATHER_CACHE_TTL_MS,
    snapshot
  });
  return snapshot;
}

function pickTravelLiveSnapshot(left, right) {
  const normalizedLeft = normalizeTravelLiveSnapshot(left);
  const normalizedRight = normalizeTravelLiveSnapshot(right);
  if (!normalizedLeft) {
    return normalizedRight;
  }
  if (!normalizedRight) {
    return normalizedLeft;
  }
  const leftUpdatedAt = Math.max(normalizedLeft.updatedAt || 0, normalizedLeft.fetchedAt || 0);
  const rightUpdatedAt = Math.max(normalizedRight.updatedAt || 0, normalizedRight.fetchedAt || 0);
  return rightUpdatedAt > leftUpdatedAt ? normalizedRight : normalizedLeft;
}

function shouldRefreshTravelSnapshot(trip, snapshot, now = Date.now()) {
  const weatherDue = Boolean(trip.weather) && shouldRefreshTravelLiveComponent(snapshot.weather, now);
  const flightDue = Boolean(trip.flight) && shouldRefreshTravelLiveComponent(snapshot.flight, now);
  return weatherDue || flightDue;
}

function shouldRefreshTravelLiveComponent(component, now = Date.now()) {
  const nextRefreshAt = Number(component?.nextRefreshAt || 0);
  if (!nextRefreshAt) {
    return true;
  }
  return nextRefreshAt <= now;
}

function resolveTravelComponentExpiresAt(component, fallback) {
  const nextRefreshAt = Number(component?.nextRefreshAt || 0);
  return Number.isFinite(nextRefreshAt) && nextRefreshAt > 0 ? nextRefreshAt : fallback;
}

async function fetchTravelWeatherSnapshot(request) {
  const now = Date.now();
  const candidateQueries = Array.from(new Set(
    [
      request.destinationQuery,
      ...(Array.isArray(request.candidateQueries) ? request.candidateQueries : [])
    ].flatMap((query) => buildTravelWeatherQueries(query))
  ));
  let result = null;
  let selectedQuery = candidateQueries[0] || request.destinationQuery;
  for (const query of candidateQueries) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", query);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "en");
    geoUrl.searchParams.set("format", "json");
    const geoPayload = await fetchJsonFromUrl(geoUrl);
    const nextResult = Array.isArray(geoPayload?.results) ? geoPayload.results[0] : null;
    if (hasValidTravelCoordinates(nextResult)) {
      result = nextResult;
      selectedQuery = query;
      if (query !== request.destinationQuery) {
        logTravelLive("verbose", "Weather lookup used fallback destination query", {
          originalQuery: request.destinationQuery,
          selectedQuery: query
        });
      }
      break;
    }
  }
  if (!hasValidTravelCoordinates(result)) {
    return {
      status: "not-found",
      query: request.destinationQuery,
      message: `Could not find weather for ${request.destinationQuery}.`,
      fetchedAt: now,
      nextRefreshAt: now + TRAVEL_WEATHER_CACHE_TTL_MS
    };
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(result.latitude));
  forecastUrl.searchParams.set("longitude", String(result.longitude));
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "16");
  const forecastPayload = await fetchJsonFromUrl(forecastUrl);
  const days = buildWeatherDaySnapshots(forecastPayload?.daily);
  const relevantDays = selectRelevantWeatherDays(days, request.startDate, request.endDate);
  if (relevantDays.length === 0) {
    return {
      status: "out-of-range",
      query: selectedQuery,
      locationLabel: buildWeatherLocationLabel(result),
      message: "Forecast will appear closer to departure.",
      fetchedAt: now,
      nextRefreshAt: now + TRAVEL_WEATHER_CACHE_TTL_MS
    };
  }

  return {
    status: "ok",
    query: selectedQuery,
    locationLabel: buildWeatherLocationLabel(result) || selectedQuery,
    days: relevantDays.slice(0, 4),
    fetchedAt: now,
    nextRefreshAt: now + TRAVEL_WEATHER_CACHE_TTL_MS
  };
}

function buildTravelWeatherQueries(destinationQuery) {
  const base = sanitizeTravelText(destinationQuery, 160);
  if (!base) {
    return [];
  }
  const queries = [];
  const pushQuery = (value) => {
    const normalized = sanitizeTravelText(value, 160);
    if (normalized && !queries.includes(normalized)) {
      queries.push(normalized);
    }
  };

  pushQuery(base);
  const parts = base.split(",").map((part) => sanitizeTravelText(part, 80)).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[0];
    const stateCode = parts[1].replace(/[^A-Za-z]/g, "").toUpperCase();
    if (city && US_STATE_NAME_BY_CODE[stateCode]) {
      pushQuery(`${city}, ${US_STATE_NAME_BY_CODE[stateCode]}`);
    }
    if (city) {
      pushQuery(city);
    }
  }

  const stripped = base.replace(/\s+[A-Z]{2}\.?$/, "").trim();
  if (stripped && stripped !== base) {
    pushQuery(stripped);
  }
  return queries;
}

function hasValidTravelCoordinates(result) {
  const latitude = Number(result?.latitude);
  const longitude = Number(result?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function buildWeatherDaySnapshots(daily) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  return times.map((date, index) => {
    const high = Number(daily?.temperature_2m_max?.[index]);
    const low = Number(daily?.temperature_2m_min?.[index]);
    const precip = Number(daily?.precipitation_probability_max?.[index]);
    const weatherCode = Number(daily?.weather_code?.[index]);
    return {
      date,
      shortLabel: formatShortWeekday(date),
      dateLabel: formatMonthDay(date),
      temperatureLabel: Number.isFinite(high) && Number.isFinite(low)
        ? `${Math.round(high)}/${Math.round(low)}F`
        : "",
      conditionLabel: [
        describeWeatherCode(weatherCode),
        Number.isFinite(precip) ? `${Math.round(precip)}% rain` : ""
      ].filter(Boolean).join(" · ")
    };
  });
}

function selectRelevantWeatherDays(days, startDate, endDate) {
  if (!Array.isArray(days) || days.length === 0) {
    return [];
  }
  const normalizedStart = normalizeDateString(startDate);
  const normalizedEnd = normalizeDateString(endDate);
  if (!normalizedStart) {
    return days.slice(0, 4);
  }
  const filtered = days.filter((day) => {
    if (!day?.date || day.date < normalizedStart) {
      return false;
    }
    if (normalizedEnd && day.date > normalizedEnd) {
      return false;
    }
    return true;
  });
  return filtered;
}

function buildWeatherLocationLabel(result) {
  return [
    sanitizeTravelText(result?.name, 80),
    sanitizeTravelText(result?.admin1, 80),
    sanitizeTravelText(result?.country, 80)
  ].filter(Boolean).slice(0, 2).join(", ");
}

async function fetchTravelFlightSnapshot(request, { tripId = "", forceRefresh = false } = {}) {
  const now = Date.now();
  if (!FLIGHTAWARE_AEROAPI_KEY) {
    return {
      status: "unconfigured",
      message: "Set FLIGHTAWARE_AEROAPI_KEY to show live flight status.",
      fetchedAt: now,
      nextRefreshAt: now + TRAVEL_WEATHER_CACHE_TTL_MS
    };
  }

  const lookup = normalizeFlightLookup(request);
  const flightsUrl = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(lookup.flightLabel)}`);
  flightsUrl.searchParams.set("max_pages", "1");
  logTravelLive("verbose", "FlightAware lookup started", {
    tripId,
    flightLabel: lookup.flightLabel,
    flightDate: lookup.flightDate,
    departureCode: lookup.departureCode,
    arrivalCode: lookup.arrivalCode,
    forceRefresh
  });

  try {
    const payload = await fetchJsonFromUrl(flightsUrl, {
      headers: {
        "x-apikey": FLIGHTAWARE_AEROAPI_KEY
      }
    });
    const flight = pickBestFlight(payload?.flights, lookup);
    if (!flight) {
      logTravelLive("verbose", "FlightAware could not match flight", {
        tripId,
        flightLabel: lookup.flightLabel,
        candidateCount: Array.isArray(payload?.flights) ? payload.flights.length : 0
      });
      return {
        status: "not-found",
        message: `No live status found for ${lookup.flightLabel} yet.`,
        fetchedAt: now,
        nextRefreshAt: computeFlightSnapshotExpiresAt(request, now)
      };
    }

    const snapshot = {
      status: "ok",
      flightLabel: lookup.flightLabel,
      statusLabel: titleCaseWords(flight?.status || "scheduled"),
      departureCode: sanitizeTravelText(
        flight?.origin?.code_iata || flight?.origin?.code || flight?.origin?.code_icao,
        8
      ) || lookup.departureCode,
      arrivalCode: sanitizeTravelText(
        flight?.destination?.code_iata || flight?.destination?.code || flight?.destination?.code_icao,
        8
      ) || lookup.arrivalCode,
      departureTimeLabel: formatIsoInTimeZone(
        flight?.estimated_out || flight?.scheduled_out,
        request.displayTimeZone
      ) || formatDateTimeLabel(request.scheduledDate, request.scheduledTime),
      gate: sanitizeTravelText(flight?.gate_origin, 12),
      terminal: sanitizeTravelText(flight?.terminal_origin, 12),
      fetchedAt: now,
      nextRefreshAt: computeFlightSnapshotExpiresAt(request, now)
    };
    logTravelLive("verbose", "FlightAware matched flight", {
      tripId,
      flightLabel: lookup.flightLabel,
      statusLabel: snapshot.statusLabel,
      departureCode: snapshot.departureCode,
      arrivalCode: snapshot.arrivalCode
    });
    return snapshot;
  } catch (error) {
    const message = String(error?.message || "Live flight status is unavailable right now.");
    logTravelLive("basic", "FlightAware request failed", {
      tripId,
      flightLabel: lookup.flightLabel,
      message
    });
    return {
      status: "error",
      message: "Live flight status is unavailable right now.",
      fetchedAt: now,
      nextRefreshAt: computeFlightSnapshotExpiresAt(request, now)
    };
  }
}

function normalizeFlightLookup(request) {
  const compact = sanitizeTravelText(request.flightNumber, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/);
  return {
    flightNumber: match ? match[2] : compact,
    airlineCode: match ? match[1] : "",
    departureCode: extractAirportCode(request.departureCode),
    arrivalCode: extractAirportCode(request.arrivalCode),
    flightDate: normalizeDateString(request.flightDate),
    scheduledTimestamp: normalizeTimestamp(request.scheduledTimestamp),
    flightLabel: compact || sanitizeTravelText(request.flightNumber, 24).toUpperCase()
  };
}

function pickBestFlight(entries, lookup) {
  const flights = Array.isArray(entries) ? entries : [];
  const scored = flights.map((entry) => ({
    entry,
    score: scoreFlightEntry(entry, lookup)
  })).sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].entry : null;
}

function computeFlightSnapshotExpiresAt(request, now = Date.now()) {
  const departureAt = normalizeTimestamp(request?.scheduledTimestamp);
  if (!Number.isFinite(departureAt) || departureAt <= now) {
    return now + TRAVEL_WEATHER_CACHE_TTL_MS;
  }

  const msUntilDeparture = departureAt - now;
  if (msUntilDeparture > 1000 * 60 * 60 * 12) {
    return Math.min(departureAt - (1000 * 60 * 60 * 12), departureAt);
  }
  if (msUntilDeparture > 1000 * 60 * 60 * 8) {
    return Math.min(departureAt - (1000 * 60 * 60 * 8), departureAt);
  }
  if (msUntilDeparture > 1000 * 60 * 60 * 4) {
    return Math.min(departureAt - (1000 * 60 * 60 * 4), departureAt);
  }
  if (msUntilDeparture > 1000 * 60 * 60 * 2) {
    return now + 1000 * 60 * 15;
  }
  return now + 1000 * 60 * 10;
}

function scoreFlightEntry(entry, lookup) {
  let score = 0;
  const entryIdent = sanitizeTravelText(entry?.ident_iata || entry?.ident, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const entryFlightNumber = sanitizeTravelText(entry?.flight_number, 12).toUpperCase();
  const entryDeparture = sanitizeTravelText(entry?.origin?.code_iata || entry?.origin?.code, 8).toUpperCase();
  const entryArrival = sanitizeTravelText(entry?.destination?.code_iata || entry?.destination?.code, 8).toUpperCase();
  if (entryIdent && entryIdent === lookup.flightLabel) {
    score += 8;
  }
  if (lookup.flightNumber && entryFlightNumber === lookup.flightNumber) {
    score += 4;
  }
  if (lookup.departureCode && entryDeparture === lookup.departureCode) {
    score += 2;
  }
  if (lookup.arrivalCode && entryArrival === lookup.arrivalCode) {
    score += 2;
  }
  if (lookup.flightDate && sanitizeTravelText(entry?.scheduled_out_local?.split?.("T")?.[0] || entry?.scheduled_out?.split?.("T")?.[0], 10) === lookup.flightDate) {
    score += 2;
  }
  if (lookup.scheduledTimestamp && Number.isFinite(lookup.scheduledTimestamp)) {
    const scheduledOut = Date.parse(entry?.scheduled_out || "");
    if (Number.isFinite(scheduledOut)) {
      const diff = Math.abs(scheduledOut - lookup.scheduledTimestamp);
      if (diff <= 1000 * 60 * 90) {
        score += 3;
      }
    }
  }
  return score;
}

async function fetchJsonFromUrl(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed with ${response.status}`);
  }
  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }
  return payload;
}

function sanitizeTravelText(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeTimeString(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : "";
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function extractAirportCode(value) {
  const text = sanitizeTravelText(value, 120).toUpperCase();
  const match = text.match(/\b([A-Z]{3})\b/);
  return match?.[1] || "";
}

function formatShortWeekday(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
}

function formatMonthDay(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatIsoInTimeZone(value, timeZone) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }
}

function formatDateTimeLabel(dateString, timeString) {
  if (!dateString) {
    return "";
  }
  const parsed = new Date(`${dateString}T${timeString || "12:00"}`);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }
  const options = timeString
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", options).format(parsed);
}

function describeWeatherCode(code) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
