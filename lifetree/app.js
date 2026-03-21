const LOCAL_STORE_KEY = "task_deck_store_v2";
const LEGACY_COOKIE_NAME = "task_deck_store";
const DRIVE_FILE_NAME = "task-deck-store.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const MAX_TASKS = 120;

const LENGTH_ORDER = {
  "very-short": 1,
  short: 2,
  medium: 3,
  long: 4,
  "very-long": 5
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_LABELS = {
  first: "first",
  second: "second",
  third: "third",
  fourth: "fourth",
  last: "last"
};

const form = document.getElementById("taskForm");
const clearFormButton = document.getElementById("clearForm");
const dependenciesSelect = document.getElementById("dependencies");
const recurrenceType = document.getElementById("recurrenceType");
const recurrenceExtras = Array.from(document.querySelectorAll(".recurrence-extra"));
const taskGrid = document.getElementById("taskGrid");
const emptyState = document.getElementById("emptyState");
const statusFilter = document.getElementById("statusFilter");
const lengthFilter = document.getElementById("lengthFilter");
const sortBy = document.getElementById("sortBy");
const searchQuery = document.getElementById("searchQuery");
const openCount = document.getElementById("openCount");
const doneCount = document.getElementById("doneCount");
const recurringCount = document.getElementById("recurringCount");
const syncStatus = document.getElementById("syncStatus");
const googleSignInButton = document.getElementById("googleSignIn");
const googleSignOutButton = document.getElementById("googleSignOut");
const loadDriveButton = document.getElementById("loadDrive");
const saveDriveButton = document.getElementById("saveDrive");

const googleConfig = window.TASK_DECK_CONFIG || {};

const googleState = {
  clientId: typeof googleConfig.googleClientId === "string" ? googleConfig.googleClientId.trim() : "",
  tokenClient: null,
  accessToken: "",
  fileId: "",
  tokenResolver: null,
  tokenRejecter: null,
  ready: false
};

let store = loadStore();
googleState.fileId = store.driveFileId || "";

renderAll();
updateRecurrenceVisibility();
bootstrapGoogleIntegration();

form.addEventListener("submit", handleSubmit);
clearFormButton.addEventListener("click", () => {
  form.reset();
  updateRecurrenceVisibility();
});
recurrenceType.addEventListener("change", updateRecurrenceVisibility);
statusFilter.addEventListener("change", renderTaskGrid);
lengthFilter.addEventListener("change", renderTaskGrid);
sortBy.addEventListener("change", renderTaskGrid);
searchQuery.addEventListener("input", renderTaskGrid);
googleSignInButton.addEventListener("click", connectGoogle);
googleSignOutButton.addEventListener("click", disconnectGoogle);
loadDriveButton.addEventListener("click", loadFromDrive);
saveDriveButton.addEventListener("click", saveToDrive);

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    return;
  }

  const task = {
    id: createId(),
    name,
    details: String(formData.get("details") || "").trim(),
    startDate: String(formData.get("startDate") || ""),
    dueDate: String(formData.get("dueDate") || ""),
    length: String(formData.get("length") || "medium"),
    completed: false,
    createdAt: Date.now(),
    dependencies: Array.from(dependenciesSelect.selectedOptions).map((option) => option.value),
    recurrence: buildRecurrence(formData)
  };

  store.tasks.unshift(task);
  trimTasks();

  if (task.recurrence.type !== "none") {
    seedRecurringChildren(task);
  }

  persistStore();
  form.reset();
  updateRecurrenceVisibility();
  renderAll();
  setSyncStatus("Saved locally. Use Save to Drive when you want to sync.", "info");
}

function buildRecurrence(formData) {
  const type = String(formData.get("recurrenceType") || "none");
  if (type === "none") {
    return { type: "none" };
  }

  const recurrence = {
    type,
    endDate: String(formData.get("recurrenceEndDate") || ""),
    count: parsePositiveNumber(formData.get("recurrenceCount"))
  };

  if (type === "daily") {
    recurrence.interval = 1;
  }

  if (type === "weekly") {
    recurrence.interval = parsePositiveNumber(formData.get("weeklyInterval")) || 1;
    recurrence.weekday = Number(formData.get("weeklyWeekday") || 0);
  }

  if (type === "monthly-date") {
    recurrence.interval = parsePositiveNumber(formData.get("monthlyInterval")) || 1;
    recurrence.day = parsePositiveNumber(formData.get("monthlyDay")) || 1;
  }

  if (type === "monthly-weekday") {
    recurrence.ordinal = String(formData.get("monthlyOrdinal") || "first");
    recurrence.weekday = Number(formData.get("monthlyWeekday") || 0);
    recurrence.interval = 1;
  }

  return recurrence;
}

function seedRecurringChildren(templateTask) {
  const maxOccurrences = Math.min(templateTask.recurrence.count || 6, 24);
  const startBase = templateTask.startDate || todayString();
  const dueBase = templateTask.dueDate || templateTask.startDate || todayString();

  for (let index = 1; index <= maxOccurrences; index += 1) {
    const nextStart = computeOccurrenceDate(startBase, templateTask.recurrence, index);
    const nextDue = computeOccurrenceDate(dueBase, templateTask.recurrence, index);

    if (!nextStart || !nextDue) {
      break;
    }

    if (templateTask.recurrence.endDate && nextStart > templateTask.recurrence.endDate) {
      break;
    }

    store.tasks.push({
      id: createId(),
      templateId: templateTask.id,
      name: `${templateTask.name} #${index + 1}`,
      details: templateTask.details,
      startDate: nextStart,
      dueDate: nextDue,
      length: templateTask.length,
      completed: false,
      createdAt: Date.now() + index,
      dependencies: [],
      recurrence: { type: "generated" }
    });
  }

  trimTasks();
}

function computeOccurrenceDate(baseDate, recurrence, offset) {
  const date = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (recurrence.type === "daily") {
    date.setDate(date.getDate() + offset);
    return toDateString(date);
  }

  if (recurrence.type === "weekly") {
    date.setDate(date.getDate() + offset * 7 * recurrence.interval);
    moveToWeekday(date, recurrence.weekday);
    return toDateString(date);
  }

  if (recurrence.type === "monthly-date") {
    date.setMonth(date.getMonth() + offset * recurrence.interval, recurrence.day);
    return toDateString(date);
  }

  if (recurrence.type === "monthly-weekday") {
    const target = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12, 0, 0);
    return nthWeekdayOfMonth(target.getFullYear(), target.getMonth(), recurrence.weekday, recurrence.ordinal);
  }

  return "";
}

function moveToWeekday(date, weekday) {
  const diff = weekday - date.getDay();
  date.setDate(date.getDate() + diff);
}

function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  if (ordinal === "last") {
    const date = new Date(year, month + 1, 0, 12, 0, 0);
    while (date.getDay() !== weekday) {
      date.setDate(date.getDate() - 1);
    }
    return toDateString(date);
  }

  const positions = { first: 1, second: 2, third: 3, fourth: 4 };
  const occurrence = positions[ordinal] || 1;
  const date = new Date(year, month, 1, 12, 0, 0);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() + 1);
  }
  date.setDate(date.getDate() + (occurrence - 1) * 7);
  return toDateString(date);
}

function renderAll() {
  renderDependencyOptions();
  renderSummary();
  renderTaskGrid();
  updateGoogleButtons();
}

function renderDependencyOptions() {
  const currentSelection = new Set(Array.from(dependenciesSelect.selectedOptions).map((option) => option.value));
  dependenciesSelect.innerHTML = "";

  for (const task of store.tasks) {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.name;
    option.selected = currentSelection.has(task.id);
    dependenciesSelect.appendChild(option);
  }
}

function renderSummary() {
  openCount.textContent = String(store.tasks.filter((task) => !task.completed).length);
  doneCount.textContent = String(store.tasks.filter((task) => task.completed).length);
  recurringCount.textContent = String(
    store.tasks.filter((task) => task.recurrence.type !== "none" && task.recurrence.type !== "generated").length
  );
}

function renderTaskGrid() {
  const tasks = sortTasks(filterTasks(store.tasks));
  taskGrid.innerHTML = "";

  if (tasks.length === 0) {
    emptyState.classList.add("visible");
    return;
  }

  emptyState.classList.remove("visible");

  for (const task of tasks) {
    const card = document.createElement("article");
    const blocked = isBlocked(task);
    card.className = `task-card${task.completed ? " done" : ""}${blocked ? " blocked" : ""}`;
    card.innerHTML = `
      <h3>${escapeHtml(task.name)}</h3>
      <div class="chip-row">
        <span class="task-chip length-${task.length}">${humanizeLength(task.length)}</span>
        ${task.completed ? '<span class="task-chip">Completed</span>' : '<span class="task-chip">Open</span>'}
        ${task.recurrence.type !== "none" ? `<span class="task-chip">${escapeHtml(describeRecurrence(task.recurrence))}</span>` : ""}
      </div>
      <div class="task-meta">
        <span>Start: ${task.startDate || "unset"}</span>
        <span>Due: ${task.dueDate || "unset"}</span>
        <span>Created: ${formatDate(task.createdAt)}</span>
      </div>
      <p class="task-details">${escapeHtml(task.details || "No details yet.")}</p>
      <div class="dependency-list">${renderDependencies(task)}</div>
      <div class="recurrence-copy">${task.templateId ? "Generated from recurring template" : describeCompletionGate(task)}</div>
      <div class="task-actions">
        <button type="button" class="task-action" data-action="toggle" data-id="${task.id}">
          ${task.completed ? "Mark open" : "Mark done"}
        </button>
        <button type="button" class="task-action" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    `;
    taskGrid.appendChild(card);
  }

  taskGrid.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleTaskAction);
  });
}

function handleTaskAction(event) {
  const button = event.currentTarget;
  const id = button.getAttribute("data-id");
  const action = button.getAttribute("data-action");

  if (action === "toggle") {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }

    if (!task.completed && isBlocked(task)) {
      setSyncStatus("That task is blocked by unfinished prerequisites.", "error");
      return;
    }

    task.completed = !task.completed;
  }

  if (action === "delete") {
    store.tasks = store.tasks.filter((task) => task.id !== id);
    for (const task of store.tasks) {
      task.dependencies = task.dependencies.filter((dependencyId) => dependencyId !== id);
    }
  }

  persistStore();
  renderAll();
  setSyncStatus("Saved locally. Sync to Drive when ready.", "info");
}

function filterTasks(tasks) {
  const status = statusFilter.value;
  const length = lengthFilter.value;
  const query = searchQuery.value.trim().toLowerCase();

  return tasks.filter((task) => {
    if (length !== "all" && task.length !== length) {
      return false;
    }

    if (status === "open" && task.completed) {
      return false;
    }

    if (status === "done" && !task.completed) {
      return false;
    }

    if (status === "blocked" && !isBlocked(task)) {
      return false;
    }

    if (status === "recurring" && task.recurrence.type === "none" && !task.templateId) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${task.name} ${task.details}`.toLowerCase().includes(query);
  });
}

function sortTasks(tasks) {
  const mode = sortBy.value;
  const sorted = [...tasks];

  sorted.sort((left, right) => {
    if (mode === "name") {
      return left.name.localeCompare(right.name);
    }

    if (mode === "length") {
      return LENGTH_ORDER[left.length] - LENGTH_ORDER[right.length];
    }

    if (mode === "created-at") {
      return right.createdAt - left.createdAt;
    }

    if (mode === "start-date") {
      return compareDateish(left.startDate, right.startDate);
    }

    return compareDateish(left.dueDate, right.dueDate);
  });

  return sorted;
}

function isBlocked(task) {
  if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) {
    return false;
  }

  return task.dependencies.some((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    return dependency && !dependency.completed;
  });
}

function renderDependencies(task) {
  if (!task.dependencies || task.dependencies.length === 0) {
    return "No prerequisite tasks.";
  }

  const names = task.dependencies.map((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    return dependency ? dependency.name : "missing task";
  });

  return `Depends on: ${escapeHtml(names.join(", "))}`;
}

function describeCompletionGate(task) {
  if (!task.dependencies || task.dependencies.length === 0) {
    return task.completed ? "Completed." : "Ready to work.";
  }

  return isBlocked(task) ? "Finish prerequisite tasks before this one can complete." : "All prerequisites are clear.";
}

function describeRecurrence(recurrence) {
  if (!recurrence || recurrence.type === "none") {
    return "One-off";
  }
  if (recurrence.type === "generated") {
    return "Recurring copy";
  }
  if (recurrence.type === "daily") {
    return "Daily";
  }
  if (recurrence.type === "weekly") {
    return `Every ${recurrence.interval || 1} week on ${WEEKDAY_LABELS[recurrence.weekday || 0]}`;
  }
  if (recurrence.type === "monthly-date") {
    return `Monthly on day ${recurrence.day}`;
  }
  if (recurrence.type === "monthly-weekday") {
    return `${ORDINAL_LABELS[recurrence.ordinal]} ${WEEKDAY_LABELS[recurrence.weekday || 0]}`;
  }
  return "Recurring";
}

function updateRecurrenceVisibility() {
  const value = recurrenceType.value;
  for (const block of recurrenceExtras) {
    const targets = block.getAttribute("data-show-for").split(" ");
    block.classList.toggle("visible", targets.includes(value));
  }
}

function loadStore() {
  const local = loadLocalStore();
  if (local) {
    return local;
  }

  const legacy = loadLegacyCookieStore();
  if (legacy) {
    persistLocalStore(legacy);
    clearLegacyCookie();
    return legacy;
  }

  return createEmptyStore();
}

function loadLocalStore() {
  const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadLegacyCookieStore() {
  const raw = getCookie(LEGACY_COOKIE_NAME);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tasks)) {
      return null;
    }
    return normalizeStore(parsed);
  } catch {
    return null;
  }
}

function normalizeStore(input) {
  const tasks = Array.isArray(input.tasks) ? input.tasks.map(normalizeTask).slice(0, MAX_TASKS) : [];
  return {
    version: 2,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
    driveFileId: typeof input.driveFileId === "string" ? input.driveFileId : "",
    tasks
  };
}

function normalizeTask(task) {
  return {
    id: typeof task.id === "string" ? task.id : createId(),
    templateId: typeof task.templateId === "string" ? task.templateId : "",
    name: typeof task.name === "string" ? task.name : "Untitled task",
    details: typeof task.details === "string" ? task.details : "",
    startDate: typeof task.startDate === "string" ? task.startDate : "",
    dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
    length: LENGTH_ORDER[task.length] ? task.length : "medium",
    completed: Boolean(task.completed),
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter((id) => typeof id === "string") : [],
    recurrence: normalizeRecurrence(task.recurrence)
  };
}

function normalizeRecurrence(recurrence) {
  if (!recurrence || typeof recurrence !== "object") {
    return { type: "none" };
  }

  return {
    type: typeof recurrence.type === "string" ? recurrence.type : "none",
    interval: typeof recurrence.interval === "number" ? recurrence.interval : 1,
    weekday: typeof recurrence.weekday === "number" ? recurrence.weekday : 0,
    day: typeof recurrence.day === "number" ? recurrence.day : 1,
    ordinal: typeof recurrence.ordinal === "string" ? recurrence.ordinal : "first",
    endDate: typeof recurrence.endDate === "string" ? recurrence.endDate : "",
    count: typeof recurrence.count === "number" ? recurrence.count : null
  };
}

function persistStore() {
  store.updatedAt = Date.now();
  store.driveFileId = googleState.fileId;
  persistLocalStore(store);
}

function persistLocalStore(nextStore) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(nextStore));
}

function createEmptyStore() {
  return {
    version: 2,
    updatedAt: Date.now(),
    driveFileId: "",
    tasks: []
  };
}

function trimTasks() {
  if (store.tasks.length > MAX_TASKS) {
    store.tasks = store.tasks.slice(0, MAX_TASKS);
  }
}

function clearLegacyCookie() {
  document.cookie = `${LEGACY_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

function initGoogleIntegration() {
  if (!googleState.clientId) {
    setSyncStatus("Local-only mode. Add your Google OAuth client ID in lifetree/config.js to enable Drive sync.", "info");
    updateGoogleButtons();
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    setSyncStatus("Google Identity Services did not load. Refresh the page and try again.", "error");
    updateGoogleButtons();
    return;
  }

  googleState.tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: googleState.clientId,
    scope: DRIVE_SCOPE,
    callback: handleTokenResponse
  });
  googleState.ready = true;
    setSyncStatus("Google Drive sync is ready. Connect Google to load or save your Lifetree data.", "info");
  updateGoogleButtons();
}

function bootstrapGoogleIntegration(attempt = 0) {
  if (!googleState.clientId) {
    initGoogleIntegration();
    return;
  }

  if (window.google?.accounts?.oauth2) {
    initGoogleIntegration();
    return;
  }

  if (attempt >= 20) {
    setSyncStatus("Google Identity Services did not finish loading. Refresh the page and try again.", "error");
    updateGoogleButtons();
    return;
  }

  window.setTimeout(() => bootstrapGoogleIntegration(attempt + 1), 250);
}

function handleTokenResponse(response) {
  if (response.error) {
    if (googleState.tokenRejecter) {
      googleState.tokenRejecter(new Error(response.error));
    }
  } else {
    googleState.accessToken = response.access_token || "";
    if (googleState.tokenResolver) {
      googleState.tokenResolver(googleState.accessToken);
    }
  }

  googleState.tokenResolver = null;
  googleState.tokenRejecter = null;
  updateGoogleButtons();
}

async function connectGoogle() {
  try {
    await ensureAccessToken(true);
    setSyncStatus("Connected to Google. You can now load from Drive or save to Drive.", "success");
  } catch (error) {
    setSyncStatus(`Google sign-in failed: ${error.message}`, "error");
  }
}

function disconnectGoogle() {
  if (window.google?.accounts?.oauth2 && googleState.accessToken) {
    window.google.accounts.oauth2.revoke(googleState.accessToken, () => {});
  }

  googleState.accessToken = "";
  googleState.fileId = store.driveFileId || "";
  updateGoogleButtons();
  setSyncStatus("Disconnected. Local cache remains on this device.", "info");
}

async function loadFromDrive() {
  try {
    const token = await ensureAccessToken(false);
    const file = await findDriveFile(token);
    if (!file) {
      setSyncStatus("No Drive task file found yet. Save to Drive to create it.", "info");
      return;
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(await formatGoogleError(response, "Drive download failed"));
    }

    const remoteStore = normalizeStore(await response.json());
    remoteStore.driveFileId = file.id;
    const previousLocalStore = store;
    store = mergeStores(store, remoteStore);
    googleState.fileId = file.id;
    persistStore();
    renderAll();
    setSyncStatus(describeMergeResult(previousLocalStore, remoteStore), "success");
  } catch (error) {
    setSyncStatus(`Load failed: ${error.message}`, "error");
  }
}

async function saveToDrive() {
  try {
    const token = await ensureAccessToken(false);
    const existingFile = await findDriveFile(token);

    if (existingFile) {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(await formatGoogleError(response, "Drive download failed"));
      }

      const remoteStore = normalizeStore(await response.json());
      remoteStore.driveFileId = existingFile.id;
      store = mergeStores(store, remoteStore);
      googleState.fileId = existingFile.id;
      persistStore();
      renderAll();
    }

    const savedFile = await upsertDriveFile(token, store);
    googleState.fileId = savedFile.id;
    store.driveFileId = savedFile.id;
    persistStore();
    renderAll();
    setSyncStatus("Merged local and remote changes, then saved the Lifetree data to Google Drive app data.", "success");
  } catch (error) {
    setSyncStatus(`Save failed: ${error.message}`, "error");
  }
}

function ensureAccessToken(forceConsent) {
  if (!googleState.ready || !googleState.tokenClient) {
    return Promise.reject(new Error("Google OAuth is not configured yet"));
  }

  if (googleState.accessToken) {
    return Promise.resolve(googleState.accessToken);
  }

  return new Promise((resolve, reject) => {
    googleState.tokenResolver = resolve;
    googleState.tokenRejecter = reject;
    googleState.tokenClient.requestAccessToken({
      prompt: forceConsent ? "consent" : ""
    });
  });
}

async function findDriveFile(token) {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Drive lookup failed"));
  }

  const payload = await response.json();
  return Array.isArray(payload.files) && payload.files.length > 0 ? payload.files[0] : null;
}

async function upsertDriveFile(token, nextStore) {
  const existing = googleState.fileId ? { id: googleState.fileId } : await findDriveFile(token);
  const metadata = existing
    ? { name: DRIVE_FILE_NAME, mimeType: "application/json" }
    : { name: DRIVE_FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] };
  const boundary = `taskdeck-${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify({ ...nextStore, driveFileId: existing?.id || "" })}\r\n` +
    `--${boundary}--`;

  const method = existing ? "PATCH" : "POST";
  const endpoint = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime";

  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!response.ok) {
    throw new Error(await formatGoogleError(response, "Drive upload failed"));
  }

  return response.json();
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
    try {
      detail = (await response.text()).trim();
    } catch {
      detail = "";
    }
  }

  return detail ? `${prefix} (${response.status}) - ${detail}` : `${prefix} (${response.status})`;
}

function mergeStores(localStore, remoteStore) {
  const mergedById = new Map();

  for (const task of remoteStore.tasks) {
    mergedById.set(task.id, task);
  }

  for (const task of localStore.tasks) {
    const existing = mergedById.get(task.id);
    if (!existing) {
      mergedById.set(task.id, task);
      continue;
    }

    mergedById.set(task.id, choosePreferredTask(task, existing, localStore.updatedAt, remoteStore.updatedAt));
  }

  const mergedTasks = Array.from(mergedById.values())
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_TASKS);

  return {
    version: 2,
    updatedAt: Math.max(localStore.updatedAt || 0, remoteStore.updatedAt || 0, Date.now()),
    driveFileId: remoteStore.driveFileId || localStore.driveFileId || "",
    tasks: mergedTasks
  };
}

function choosePreferredTask(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt) {
  if (localTask.completed !== remoteTask.completed) {
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }

  const localDue = localTask.dueDate || "";
  const remoteDue = remoteTask.dueDate || "";
  if (localTask.name !== remoteTask.name || localTask.details !== remoteTask.details || localDue !== remoteDue) {
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }

  return localTask.createdAt >= remoteTask.createdAt ? localTask : remoteTask;
}

function describeMergeResult(localStore, remoteStore) {
  if ((remoteStore.updatedAt || 0) > (localStore.updatedAt || 0)) {
    return "Loaded and merged newer changes from Google Drive into the local Lifetree data.";
  }

  if ((remoteStore.updatedAt || 0) < (localStore.updatedAt || 0)) {
    return "Loaded Google Drive data and preserved newer local changes during merge.";
  }

  return "Loaded and merged Google Drive data.";
}

function updateGoogleButtons() {
  const configured = Boolean(googleState.clientId);
  const connected = Boolean(googleState.accessToken);

  googleSignInButton.disabled = !configured || connected || !googleState.ready;
  googleSignOutButton.disabled = !connected;
  loadDriveButton.disabled = !connected;
  saveDriveButton.disabled = !connected;
}

function setSyncStatus(message, tone) {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function compareDateish(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function humanizeLength(value) {
  return value.replace("-", " ");
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayString() {
  return toDateString(new Date());
}

function formatDate(value) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function getCookie(name) {
  const prefix = `${name}=`;
  const row = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : "";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
