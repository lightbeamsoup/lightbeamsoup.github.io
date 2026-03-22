import { buildHistoryFeed, computeOccurrenceDate, createArchivedSeriesRecord, nthWeekdayOfMonth, toDateString } from "./logic.js";

const LOCAL_STORE_KEY = "task_deck_store_v2";
const LEGACY_COOKIE_NAME = "task_deck_store";
const MAX_TASKS = 180;
const MAX_ROLLING_SERIES_INSTANCES = 100;
const DEV_EMAIL = "jbkallman@gmail.com";

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

const appConfig = window.TASK_DECK_CONFIG || {};
const API_BASE = resolveApiBase(appConfig.apiBase || "");
const FETCH_CREDENTIALS = API_BASE && API_BASE !== window.location.origin ? "include" : "same-origin";

const form = document.getElementById("taskForm");
const submitButton = document.getElementById("submitButton");
const cancelEditButton = document.getElementById("cancelEdit");
const clearFormButton = document.getElementById("clearForm");
const editPanel = document.getElementById("editPanel");
const editTitle = document.getElementById("editTitle");
const editCopy = document.getElementById("editCopy");
const editScope = document.getElementById("editScope");
const editScopeRow = document.getElementById("editScopeRow");
const taskNameInput = document.getElementById("taskName");
const taskDetailsInput = document.getElementById("taskDetails");
const startDateInput = document.getElementById("startDate");
const dueDateInput = document.getElementById("dueDate");
const timeOfDayInput = document.getElementById("timeOfDay");
const taskLengthInput = document.getElementById("taskLength");
const dependenciesSelect = document.getElementById("dependencies");
const recurrenceType = document.getElementById("recurrenceType");
const recurrenceForeverInput = document.getElementById("recurrenceForever");
const recurrenceExtras = Array.from(document.querySelectorAll(".recurrence-extra"));
const taskGrid = document.getElementById("taskGrid");
const emptyState = document.getElementById("emptyState");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const historySort = document.getElementById("historySort");
const historyFilter = document.getElementById("historyFilter");
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
const developerPanel = document.getElementById("developerPanel");
const developerEmail = document.getElementById("developerEmail");
const clearDriveDataButton = document.getElementById("clearDriveData");

const authState = {
  authenticated: false,
  user: null
};

const editState = {
  taskId: "",
  scope: "single"
};

let store = loadStore();
reconcileRecurringSeries();

renderAll();
updateRecurrenceVisibility();
refreshAuthStatus();

form.addEventListener("submit", handleSubmit);
clearFormButton.addEventListener("click", resetComposer);
cancelEditButton.addEventListener("click", clearEditState);
editScope.addEventListener("change", () => {
  editState.scope = editScope.value;
  syncEditPanel();
});
recurrenceType.addEventListener("change", updateRecurrenceVisibility);
recurrenceForeverInput.addEventListener("change", updateRecurrenceVisibility);
statusFilter.addEventListener("change", renderTaskGrid);
lengthFilter.addEventListener("change", renderTaskGrid);
sortBy.addEventListener("change", renderTaskGrid);
searchQuery.addEventListener("input", renderTaskGrid);
historySort.addEventListener("change", renderHistoryPanel);
historyFilter.addEventListener("change", renderHistoryPanel);
googleSignInButton.addEventListener("click", connectGoogle);
googleSignOutButton.addEventListener("click", disconnectGoogle);
loadDriveButton.addEventListener("click", loadFromDrive);
saveDriveButton.addEventListener("click", saveToDrive);
clearDriveDataButton.addEventListener("click", clearDriveData);

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    return;
  }

  if (editState.taskId) {
    applyTaskEdit(formData);
    return;
  }

  const task = buildTaskFromForm(formData);
  store.tasks.unshift(task);

  if (task.recurrence.type !== "none") {
    regenerateSeries(task.id, { preserveClosed: false });
  }

  trimTasks();
  persistStore();
  resetComposer();
  renderAll();
  setSyncStatus("Saved locally. Use Save to Drive when you want to sync.", "info");
}

function buildTaskFromForm(formData, originalTask = null) {
  return {
    id: originalTask?.id || createId(),
    templateId: originalTask?.templateId || "",
    occurrenceIndex: originalTask?.occurrenceIndex || 0,
    name: String(formData.get("name") || "").trim(),
    details: String(formData.get("details") || "").trim(),
    startDate: String(formData.get("startDate") || ""),
    dueDate: String(formData.get("dueDate") || ""),
    timeOfDay: String(formData.get("timeOfDay") || ""),
    length: String(formData.get("length") || "medium"),
    status: originalTask?.status || "open",
    createdAt: originalTask?.createdAt || Date.now(),
    dependencies: Array.from(dependenciesSelect.selectedOptions).map((option) => option.value),
    recurrence: buildRecurrence(formData, originalTask?.recurrence),
    history: Array.isArray(originalTask?.history) ? originalTask.history : []
  };
}

function buildRecurrence(formData, originalRecurrence = null) {
  const type = String(formData.get("recurrenceType") || "none");
  if (type === "none") {
    return { type: "none" };
  }

  const recurrence = {
    type,
    endDate: String(formData.get("recurrenceEndDate") || ""),
    count: parsePositiveNumber(formData.get("recurrenceCount")),
    forever: Boolean(formData.get("recurrenceForever")),
    interval: originalRecurrence?.interval || 1,
    weekday: originalRecurrence?.weekday ?? 0,
    day: originalRecurrence?.day || 1,
    ordinal: originalRecurrence?.ordinal || "first"
  };

  if (recurrence.forever) {
    recurrence.endDate = "";
    recurrence.count = null;
  }

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

function applyTaskEdit(formData) {
  const task = store.tasks.find((item) => item.id === editState.taskId);
  if (!task) {
    clearEditState();
    return;
  }

  const scope = editState.scope;
  if (scope === "series" && (task.templateId || task.recurrence.type !== "none")) {
    const template = getSeriesTemplate(task);
    if (!template) {
      clearEditState();
      return;
    }

    const updatedTemplate = buildTaskFromForm(formData, template);
    updatedTemplate.templateId = "";
    updatedTemplate.occurrenceIndex = 0;
    updatedTemplate.status = template.status;
    updatedTemplate.history = [...template.history];
    pushHistory(updatedTemplate, "edited");
    replaceTask(updatedTemplate);
    regenerateSeries(template.id, { preserveClosed: true });
  } else {
    const updatedTask = buildTaskFromForm(formData, task);
    updatedTask.recurrence = task.templateId ? { type: "generated" } : updatedTask.recurrence;
    updatedTask.history = [...task.history];
    pushHistory(updatedTask, "edited");
    replaceTask(updatedTask);
  }

  trimTasks();
  persistStore();
  clearEditState();
  renderAll();
  setSyncStatus("Saved locally. Use Save to Drive when you want to sync.", "info");
}

function replaceTask(nextTask) {
  store.tasks = store.tasks.map((task) => (task.id === nextTask.id ? nextTask : task));
}

function regenerateSeries(templateId, { preserveClosed }) {
  const template = store.tasks.find((task) => task.id === templateId && !task.templateId);
  if (!template || template.recurrence.type === "none") {
    return;
  }

  const existingInstances = store.tasks.filter((task) => task.templateId === templateId);
  const preserved = preserveClosed
    ? existingInstances.filter((task) => task.status !== "open")
    : [];
  const preservedIndexes = new Set(preserved.map((task) => task.occurrenceIndex));
  const existingByIndex = new Map(existingInstances.map((task) => [task.occurrenceIndex, task]));

  store.tasks = store.tasks.filter((task) => task.templateId !== templateId);
  store.tasks.push(...preserved);

  const startBase = template.startDate || todayString();
  const dueBase = template.dueDate || template.startDate || todayString();
  const rollingSeries = isRollingSeries(template.recurrence);
  const absoluteLimit = Number.isFinite(getSeriesOccurrenceLimit(template.recurrence))
    ? getSeriesOccurrenceLimit(template.recurrence)
    : Number.MAX_SAFE_INTEGER;
  let openSlotsRemaining = rollingSeries
    ? Math.max(MAX_ROLLING_SERIES_INSTANCES - (template.status === "open" ? 1 : 0), 0)
    : Number.MAX_SAFE_INTEGER;

  for (let index = 1; index <= absoluteLimit; index += 1) {
    const nextStart = computeOccurrenceDate(startBase, template.recurrence, index);
    const nextDue = computeOccurrenceDate(dueBase, template.recurrence, index);
    if (!nextStart || !nextDue) {
      break;
    }
    if (template.recurrence.endDate && nextStart > template.recurrence.endDate) {
      break;
    }
    if (preservedIndexes.has(index)) {
      continue;
    }
    if (rollingSeries && openSlotsRemaining <= 0) {
      break;
    }

    const existing = existingByIndex.get(index);
    const nextTask = buildGeneratedInstance(template, index, nextStart, nextDue, existing);
    store.tasks.push(nextTask);
    if (nextTask.status === "open") {
      openSlotsRemaining -= 1;
    }
  }
}

function renderAll() {
  renderDependencyOptions();
  renderSummary();
  renderTaskGrid();
  renderHistoryPanel();
  renderDeveloperPanel();
  syncEditPanel();
  updateGoogleButtons();
}

function renderDependencyOptions() {
  const currentSelection = new Set(Array.from(dependenciesSelect.selectedOptions).map((option) => option.value));
  dependenciesSelect.innerHTML = "";

  for (const task of getDependencyCandidates()) {
    if (task.id === editState.taskId) {
      continue;
    }
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.name;
    option.selected = currentSelection.has(task.id);
    dependenciesSelect.appendChild(option);
  }
}

function getDependencyCandidates() {
  return store.tasks.filter((task) => !task.templateId && !task.archived);
}

function renderSummary() {
  const visible = getVisibleCards();
  openCount.textContent = String(visible.filter((card) => card.status === "open").length);
  doneCount.textContent = String(visible.filter((card) => card.status === "done").length);
  recurringCount.textContent = String(visible.filter((card) => card.kind === "series").length);
}

function renderTaskGrid() {
  const cards = sortCards(filterCards(getVisibleCards()));
  taskGrid.innerHTML = "";

  if (cards.length === 0) {
    emptyState.classList.add("visible");
    return;
  }
  emptyState.classList.remove("visible");

  for (const cardData of cards) {
    const blocked = isBlocked(cardData.task);
    const article = document.createElement("article");
    article.className = `task-card${cardData.status === "done" ? " done" : ""}${cardData.status === "skipped" ? " skipped" : ""}${blocked ? " blocked" : ""}`;
    article.innerHTML = `
      <h3>${escapeHtml(cardData.displayName)}</h3>
      <div class="chip-row">
        <span class="task-chip length-${cardData.task.length}">${humanizeLength(cardData.task.length)}</span>
        <span class="task-chip">${escapeHtml(statusLabel(cardData.status))}</span>
        ${cardData.kind === "series" ? `<span class="task-chip">${escapeHtml(describeRecurrence(cardData.template.recurrence))}</span>` : ""}
      </div>
      <div class="task-meta">
        <span>Start: ${cardData.task.startDate || "unset"}${cardData.task.timeOfDay ? ` at ${cardData.task.timeOfDay}` : ""}</span>
        <span>Due: ${cardData.task.dueDate || "unset"}${cardData.task.timeOfDay ? ` at ${cardData.task.timeOfDay}` : ""}</span>
        <span>Created: ${formatDate(cardData.task.createdAt)}</span>
      </div>
      <p class="task-details">${escapeHtml(cardData.task.details || "No details yet.")}</p>
      <div class="dependency-list">${renderDependencies(cardData.task)}</div>
      <div class="recurrence-copy">${escapeHtml(cardSummary(cardData))}</div>
      <div class="history-copy">${escapeHtml(renderHistory(cardData.task))}</div>
      <div class="task-actions">${renderActions(cardData)}</div>
    `;
    taskGrid.appendChild(article);
  }

  taskGrid.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleTaskAction);
  });
}

function renderHistoryPanel() {
  const feed = buildHistoryFeed(store.tasks, historySort.value, historyFilter.value);
  historyList.innerHTML = "";

  if (feed.length === 0) {
    historyEmpty.classList.add("visible");
    return;
  }

  historyEmpty.classList.remove("visible");

  for (const item of feed) {
    const entry = document.createElement("article");
    entry.className = "history-entry";
    entry.innerHTML = `
      <div>
        <strong>${escapeHtml(item.taskName)}</strong>
        <span>${escapeHtml(historyTypeLabel(item.type))}</span>
      </div>
      <span>${formatDateTime(item.at)}</span>
    `;
    historyList.appendChild(entry);
  }
}

function getVisibleCards() {
  const cards = [];
  for (const task of store.tasks) {
    if (task.templateId || task.archived) {
      continue;
    }

    if (task.recurrence.type === "none") {
      cards.push({
        key: task.id,
        kind: "single",
        task,
        template: null,
        status: task.status,
        displayName: task.name
      });
      continue;
    }

    const seriesInstances = getSeriesInstances(task);
    const active = seriesInstances.find((item) => item.status === "open") || seriesInstances[seriesInstances.length - 1] || task;
    cards.push({
      key: task.id,
      kind: "series",
      task: active,
      template: task,
      status: active.status,
      displayName: active.name
    });
  }
  return cards;
}

function getSeriesInstances(template) {
  return [template, ...store.tasks.filter((task) => task.templateId === template.id)].sort((left, right) => {
    if (left.occurrenceIndex !== right.occurrenceIndex) {
      return left.occurrenceIndex - right.occurrenceIndex;
    }
    return compareDateish(left.dueDate, right.dueDate);
  });
}

function filterCards(cards) {
  const status = statusFilter.value;
  const length = lengthFilter.value;
  const query = searchQuery.value.trim().toLowerCase();

  return cards.filter((card) => {
    if (length !== "all" && card.task.length !== length) {
      return false;
    }
    if (status === "open" && card.status !== "open") {
      return false;
    }
    if (status === "done" && card.status !== "done") {
      return false;
    }
    if (status === "skipped" && card.status !== "skipped") {
      return false;
    }
    if (status === "blocked" && !isBlocked(card.task)) {
      return false;
    }
    if (status === "recurring" && card.kind !== "series") {
      return false;
    }
    if (!query) {
      return true;
    }
    return `${card.displayName} ${card.task.details}`.toLowerCase().includes(query);
  });
}

function sortCards(cards) {
  const mode = sortBy.value;
  const sorted = [...cards];
  sorted.sort((left, right) => {
    if (mode === "name") {
      return left.displayName.localeCompare(right.displayName);
    }
    if (mode === "length") {
      return LENGTH_ORDER[left.task.length] - LENGTH_ORDER[right.task.length];
    }
    if (mode === "created-at") {
      return right.task.createdAt - left.task.createdAt;
    }
    if (mode === "start-date") {
      return compareDateish(left.task.startDate, right.task.startDate);
    }
    return compareDateish(left.task.dueDate, right.task.dueDate);
  });
  return sorted;
}

function handleTaskAction(event) {
  const action = event.currentTarget.getAttribute("data-action");
  const id = event.currentTarget.getAttribute("data-id");
  const scope = event.currentTarget.getAttribute("data-scope") || "single";
  const task = store.tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  if (action === "toggle") {
    if (task.status === "open" && isBlocked(task)) {
      setSyncStatus("That task is blocked by unfinished prerequisites.", "error");
      return;
    }
    task.status = task.status === "done" ? "open" : "done";
    pushHistory(task, task.status === "done" ? "completed" : "reopened");
  }

  if (action === "skip") {
    task.status = "skipped";
    pushHistory(task, "skipped");
  }

  if (action === "delete") {
    deleteTask(task, scope);
  }

  if (action === "edit") {
    beginEdit(task, scope);
    return;
  }

  persistStore();
  renderAll();
  setSyncStatus("Saved locally. Sync to Drive when ready.", "info");
}

function deleteTask(task, scope) {
  if (scope === "series" && (task.templateId || task.recurrence.type !== "none")) {
    const template = getSeriesTemplate(task);
    if (!template) {
      return;
    }
    rememberDeletedSeries(template.id);
    const removedIds = new Set([template.id]);
    const templateNeedsArchive = template.status !== "open" || (template.history?.length || 0) > 0;
    if (templateNeedsArchive) {
      store.tasks.push(createArchivedSeriesRecord(template));
    }
    store.tasks = store.tasks.filter((item) => {
      if (item.id === template.id) {
        return false;
      }
      if (item.templateId !== template.id) {
        return true;
      }
      if (item.status === "open") {
        removedIds.add(item.id);
        return false;
      }
      return true;
    });
    for (const item of store.tasks) {
      item.dependencies = item.dependencies.filter((dependencyId) => !removedIds.has(dependencyId));
    }
    return;
  }

  rememberDeletedTask(task.id);
  store.tasks = store.tasks.filter((item) => item.id !== task.id);
  for (const item of store.tasks) {
    item.dependencies = item.dependencies.filter((dependencyId) => dependencyId !== task.id);
  }
}

function beginEdit(task, scope) {
  const target = scope === "series" ? getSeriesTemplate(task) : task;
  if (!target) {
    return;
  }

  editState.taskId = task.id;
  editState.scope = scope;
  editScope.value = scope;
  taskNameInput.value = target.name;
  taskDetailsInput.value = target.details;
  startDateInput.value = target.startDate;
  dueDateInput.value = target.dueDate;
  timeOfDayInput.value = target.timeOfDay || "";
  taskLengthInput.value = target.length;
  const dependencySet = new Set(target.dependencies || []);
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = dependencySet.has(option.value);
  });
  applyRecurrenceToForm(scope === "series" ? target.recurrence : { type: "none" });
  updateRecurrenceVisibility();
  syncEditPanel();
}

function applyRecurrenceToForm(recurrence) {
  recurrenceType.value = recurrence?.type || "none";
  document.getElementById("weeklyInterval").value = recurrence?.interval || 1;
  document.getElementById("weeklyWeekday").value = String(recurrence?.weekday ?? 0);
  document.getElementById("monthlyDay").value = recurrence?.day || 1;
  document.getElementById("monthlyInterval").value = recurrence?.interval || 1;
  document.getElementById("monthlyOrdinal").value = recurrence?.ordinal || "first";
  document.getElementById("monthlyWeekday").value = String(recurrence?.weekday ?? 0);
  document.getElementById("recurrenceEndDate").value = recurrence?.endDate || "";
  document.getElementById("recurrenceCount").value = recurrence?.count || "";
  recurrenceForeverInput.checked = Boolean(recurrence?.forever);
}

function syncEditPanel() {
  const editing = Boolean(editState.taskId);
  editPanel.classList.toggle("hidden", !editing);
  cancelEditButton.classList.toggle("hidden", !editing);
  submitButton.textContent = editing ? "Save task" : "Add task";
  if (!editing) {
    return;
  }

  const task = store.tasks.find((item) => item.id === editState.taskId);
  const seriesEligible = Boolean(task && (task.templateId || task.recurrence.type !== "none"));
  editScopeRow.classList.toggle("hidden", !seriesEligible);
  editTitle.textContent = editState.scope === "series" ? "Editing series" : "Editing task";
  editCopy.textContent = editState.scope === "series"
    ? "Changes will update the recurring template and rebuild future open instances."
    : "Changes apply only to this task or current instance.";
}

function clearEditState() {
  editState.taskId = "";
  editState.scope = "single";
  resetComposer();
  renderAll();
}

function resetComposer() {
  form.reset();
  recurrenceForeverInput.checked = false;
  updateRecurrenceVisibility();
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = false;
  });
  editPanel.classList.add("hidden");
  cancelEditButton.classList.add("hidden");
  submitButton.textContent = "Add task";
}

function getSeriesTemplate(task) {
  if (!task) {
    return null;
  }
  return task.templateId ? store.tasks.find((item) => item.id === task.templateId) : task;
}

function statusLabel(status) {
  if (status === "done") {
    return "Completed";
  }
  if (status === "skipped") {
    return "Skipped";
  }
  return "Open";
}

function cardSummary(cardData) {
  if (cardData.kind !== "series") {
    return describeCompletionGate(cardData.task);
  }

  const instances = getSeriesInstances(cardData.template);
  const openInstances = instances.filter((item) => item.status === "open");
  const current = openInstances[0] || cardData.task;
  const next = openInstances[1];
  const remaining = openInstances.length;
  const rolling = isRollingSeries(cardData.template.recurrence);
  if (!next) {
    return remaining > 0
      ? `${describeCompletionGate(current)} ${rolling ? "No later instance is queued yet." : "Last remaining series instance."}`
      : "Series finished.";
  }
  const remainderCopy = rolling
    ? `${remaining} scheduled ahead in the rolling queue.`
    : `${remaining} instances left.`;
  return `${describeCompletionGate(current)} Next repeat after this: ${next.dueDate || next.startDate || "unscheduled"}. ${remainderCopy}`;
}

function renderHistory(task) {
  if (!task.history || task.history.length === 0) {
    return task.timeOfDay ? `Time: ${task.timeOfDay}` : "No history yet.";
  }
  const latest = task.history[task.history.length - 1];
  return `Latest activity: ${latest.type} on ${formatDate(latest.at)}${task.timeOfDay ? ` at ${task.timeOfDay}` : ""}`;
}

function renderActions(cardData) {
  const buttons = [];
  const task = cardData.task;
  buttons.push(`<button type="button" class="task-action" data-action="toggle" data-id="${task.id}">${task.status === "done" ? "Mark open" : "Mark done"}</button>`);
  if (task.status === "open") {
    buttons.push(`<button type="button" class="task-action" data-action="skip" data-id="${task.id}">Skip</button>`);
  }
  buttons.push(`<button type="button" class="task-action" data-action="edit" data-id="${task.id}" data-scope="single">Edit task</button>`);
  if (cardData.kind === "series") {
    buttons.push(`<button type="button" class="task-action" data-action="edit" data-id="${task.id}" data-scope="series">Edit series</button>`);
    buttons.push(`<button type="button" class="task-action" data-action="delete" data-id="${task.id}" data-scope="series">Delete series</button>`);
  } else {
    buttons.push(`<button type="button" class="task-action" data-action="delete" data-id="${task.id}">Delete</button>`);
  }
  return buttons.join("");
}

function pushHistory(task, type) {
  if (!Array.isArray(task.history)) {
    task.history = [];
  }
  task.history.push({ type, at: Date.now() });
}

function historyTypeLabel(type) {
  if (type === "completed") return "Marked completed";
  if (type === "skipped") return "Skipped";
  if (type === "edited") return "Edited";
  if (type === "reopened") return "Reopened";
  return type;
}

function isBlocked(task) {
  if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) {
    return false;
  }
  return task.dependencies.some((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    return dependency && dependency.status !== "done";
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
    if (task.status === "done") {
      return "Completed.";
    }
    if (task.status === "skipped") {
      return "Skipped.";
    }
    return "Ready to work.";
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
    return recurrence.forever ? "Daily forever" : "Daily";
  }
  if (recurrence.type === "weekly") {
    return `Every ${recurrence.interval || 1} week on ${WEEKDAY_LABELS[recurrence.weekday || 0]}${recurrence.forever ? ", forever" : ""}`;
  }
  if (recurrence.type === "monthly-date") {
    return `Monthly on day ${recurrence.day}${recurrence.forever ? ", forever" : ""}`;
  }
  if (recurrence.type === "monthly-weekday") {
    return `${ORDINAL_LABELS[recurrence.ordinal]} ${WEEKDAY_LABELS[recurrence.weekday || 0]}${recurrence.forever ? ", forever" : ""}`;
  }
  return "Recurring";
}

function updateRecurrenceVisibility() {
  const value = recurrenceType.value;
  for (const block of recurrenceExtras) {
    const targets = block.getAttribute("data-show-for").split(" ");
    block.classList.toggle("visible", targets.includes(value));
  }

  const recurring = value !== "none";
  recurrenceForeverInput.disabled = !recurring;
  document.getElementById("recurrenceEndDate").disabled = !recurring || recurrenceForeverInput.checked;
  document.getElementById("recurrenceCount").disabled = !recurring || recurrenceForeverInput.checked;
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
    version: 4,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
    driveFileId: typeof input.driveFileId === "string" ? input.driveFileId : "",
    tasks,
    deletedTaskIds: normalizeDeletedIds(input.deletedTaskIds),
    deletedSeriesIds: normalizeDeletedIds(input.deletedSeriesIds)
  };
}

function normalizeTask(task) {
  return {
    id: typeof task.id === "string" ? task.id : createId(),
    templateId: typeof task.templateId === "string" ? task.templateId : "",
    occurrenceIndex: typeof task.occurrenceIndex === "number" ? task.occurrenceIndex : 0,
    name: typeof task.name === "string" ? task.name : "Untitled task",
    details: typeof task.details === "string" ? task.details : "",
    startDate: typeof task.startDate === "string" ? task.startDate : "",
    dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
    timeOfDay: typeof task.timeOfDay === "string" ? task.timeOfDay : "",
    length: LENGTH_ORDER[task.length] ? task.length : "medium",
    status: normalizeStatus(task),
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter((id) => typeof id === "string") : [],
    recurrence: normalizeRecurrence(task.recurrence),
    archived: task.archived === true,
    seriesOriginId: typeof task.seriesOriginId === "string" ? task.seriesOriginId : "",
    history: Array.isArray(task.history)
      ? task.history.filter((item) => typeof item?.type === "string" && typeof item?.at === "number")
      : []
  };
}

function normalizeStatus(task) {
  if (task.status === "done" || task.completed === true) {
    return "done";
  }
  if (task.status === "skipped" || task.skipped === true) {
    return "skipped";
  }
  return "open";
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
    count: typeof recurrence.count === "number" ? recurrence.count : null,
    forever: recurrence.forever === true
  };
}

function persistStore() {
  store.updatedAt = Date.now();
  persistLocalStore(store);
}

function persistLocalStore(nextStore) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(nextStore));
}

function createEmptyStore() {
  return {
    version: 4,
    updatedAt: Date.now(),
    driveFileId: "",
    tasks: [],
    deletedTaskIds: [],
    deletedSeriesIds: []
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

async function refreshAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/status`, { credentials: FETCH_CREDENTIALS });
    const payload = await response.json();
    authState.authenticated = Boolean(payload.authenticated);
    authState.user = payload.user || null;
    setSyncStatus(
      authState.authenticated && authState.user?.email
        ? `Connected as ${authState.user.email}.`
        : "Local-only mode. Configure the Lifetree backend to enable Google Drive sync.",
      authState.authenticated ? "success" : "info"
    );
  } catch {
    authState.authenticated = false;
    authState.user = null;
    setSyncStatus(describeBackendUnavailable(), "error");
  }
  updateGoogleButtons();
}

function connectGoogle() {
  const returnTo = encodeURIComponent(getReturnToTarget());
  window.location.href = `${API_BASE}/api/auth/google/start?returnTo=${returnTo}`;
}

async function disconnectGoogle() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: FETCH_CREDENTIALS });
  } catch {}
  authState.authenticated = false;
  authState.user = null;
  updateGoogleButtons();
  setSyncStatus("Disconnected. Local cache remains on this device.", "info");
}

async function loadFromDrive() {
  if (!authState.authenticated) {
    setSyncStatus("Connect Google first to load from Drive.", "error");
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/lifetree/load`, { credentials: FETCH_CREDENTIALS });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Drive load failed");
    }
    if (!payload.found) {
      setSyncStatus("No Drive task file found yet. Save to Drive to create it.", "info");
      return;
    }
    const remoteStore = normalizeStore(payload.payload);
    remoteStore.driveFileId = payload.fileId || "";
    const previousLocalStore = store;
    if ((previousLocalStore.updatedAt || 0) > (remoteStore.updatedAt || 0)) {
      const keepLocalChanges = window.confirm(
        "This browser has newer local changes than Google Drive. Press OK to keep and merge your newer local changes, or Cancel to discard them and load Google Drive exactly as stored."
      );
      if (keepLocalChanges) {
        store = mergeStores(store, remoteStore);
        reconcileRecurringSeries();
        persistStore();
        renderAll();
        setSyncStatus("Loaded Google Drive data and kept newer local changes during merge.", "success");
        return;
      }

      store = remoteStore;
      reconcileRecurringSeries();
      persistStore();
      renderAll();
      setSyncStatus("Discarded newer local changes and loaded the Google Drive version.", "success");
      return;
    }

    store = mergeStores(store, remoteStore);
    reconcileRecurringSeries();
    persistStore();
    renderAll();
    setSyncStatus(describeMergeResult(previousLocalStore, remoteStore), "success");
  } catch (error) {
    setSyncStatus(`Load failed: ${error.message}`, "error");
  }
}

async function saveToDrive() {
  if (!authState.authenticated) {
    setSyncStatus("Connect Google first to save to Drive.", "error");
    return;
  }
  try {
    const remoteResponse = await fetch(`${API_BASE}/api/lifetree/load`, { credentials: FETCH_CREDENTIALS });
    const remotePayload = await remoteResponse.json();
    if (remoteResponse.ok && remotePayload.found) {
      const remoteStore = normalizeStore(remotePayload.payload);
      remoteStore.driveFileId = remotePayload.fileId || "";
      store = mergeStores(store, remoteStore);
      reconcileRecurringSeries();
      persistStore();
      renderAll();
    }

    const saveResponse = await fetch(`${API_BASE}/api/lifetree/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: FETCH_CREDENTIALS,
      body: JSON.stringify({ payload: store })
    });
    const savePayload = await saveResponse.json();
    if (!saveResponse.ok) {
      throw new Error(savePayload.error || "Drive save failed");
    }
    if (savePayload.fileId) {
      store.driveFileId = savePayload.fileId;
      persistStore();
    }
    setSyncStatus("Merged local and remote changes, then saved the Lifetree data to Google Drive app data.", "success");
  } catch (error) {
    setSyncStatus(`Save failed: ${error.message}`, "error");
  }
}

function mergeStores(localStore, remoteStore) {
  const deletedTaskIds = unionIds(localStore.deletedTaskIds, remoteStore.deletedTaskIds);
  const deletedSeriesIds = unionIds(localStore.deletedSeriesIds, remoteStore.deletedSeriesIds);
  const mergedById = new Map();
  for (const task of filterDeletedTasks(remoteStore.tasks, deletedTaskIds, deletedSeriesIds)) {
    mergedById.set(task.id, task);
  }
  for (const task of filterDeletedTasks(localStore.tasks, deletedTaskIds, deletedSeriesIds)) {
    const existing = mergedById.get(task.id);
    if (!existing) {
      mergedById.set(task.id, task);
      continue;
    }
    mergedById.set(task.id, choosePreferredTask(task, existing, localStore.updatedAt, remoteStore.updatedAt));
  }
  return {
    version: 4,
    updatedAt: Math.max(localStore.updatedAt || 0, remoteStore.updatedAt || 0, Date.now()),
    driveFileId: remoteStore.driveFileId || localStore.driveFileId || "",
    tasks: Array.from(mergedById.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TASKS),
    deletedTaskIds,
    deletedSeriesIds
  };
}

function choosePreferredTask(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt) {
  if (localTask.status !== remoteTask.status) {
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }
  if (
    localTask.name !== remoteTask.name ||
    localTask.details !== remoteTask.details ||
    localTask.timeOfDay !== remoteTask.timeOfDay ||
    (localTask.dueDate || "") !== (remoteTask.dueDate || "")
  ) {
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
  googleSignInButton.disabled = authState.authenticated;
  googleSignOutButton.disabled = !authState.authenticated;
  loadDriveButton.disabled = !authState.authenticated;
  saveDriveButton.disabled = !authState.authenticated;
  clearDriveDataButton.disabled = !isDeveloperUser();
  renderDeveloperPanel();
}

function setSyncStatus(message, tone) {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function renderDeveloperPanel() {
  const visible = isDeveloperUser();
  developerPanel.classList.toggle("hidden", !visible);
  if (visible) {
    developerEmail.textContent = authState.user.email;
  }
}

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? (trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed) : "";
}

function resolveApiBase(configuredValue) {
  const normalized = normalizeApiBase(configuredValue);
  if (normalized) {
    return normalized;
  }

  if (isLocalhostHost(window.location.hostname) && window.location.port !== "3000") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  return "";
}

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getReturnToTarget() {
  if (!API_BASE || API_BASE === window.location.origin) {
    return window.location.pathname;
  }

  return window.location.href;
}

function describeBackendUnavailable() {
  if (API_BASE && API_BASE !== window.location.origin) {
    return `Backend not reachable at ${API_BASE}. Start the Lifetree server there, then reload this page.`;
  }

  if (isLocalhostHost(window.location.hostname)) {
    return "Backend not reachable. If the Lifetree server is running on localhost:3000, open http://localhost:3000/lifetree/ or let this page connect to that backend.";
  }

  return "Backend not reachable. Start the Lifetree server to enable Google Drive sync.";
}

function compareDateish(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const leftKey = left;
  const rightKey = right;
  return leftKey.localeCompare(rightKey);
}

function humanizeLength(value) {
  return value.replace("-", " ");
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function todayString() {
  return toDateString(new Date());
}

function formatDate(value) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function normalizeDeletedIds(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => typeof item === "string" && item)))
    : [];
}

function unionIds(left = [], right = []) {
  return Array.from(new Set([...(left || []), ...(right || [])]));
}

function filterDeletedTasks(tasks, deletedTaskIds, deletedSeriesIds) {
  const deletedTaskSet = new Set(deletedTaskIds || []);
  const deletedSeriesSet = new Set(deletedSeriesIds || []);
  return tasks.filter((task) => {
    if (deletedTaskSet.has(task.id)) {
      return false;
    }
    if (deletedSeriesSet.has(task.id)) {
      return false;
    }
    if (task.templateId && deletedSeriesSet.has(task.templateId) && task.status === "open") {
      return false;
    }
    return true;
  });
}

function rememberDeletedTask(taskId) {
  store.deletedTaskIds = unionIds(store.deletedTaskIds, [taskId]);
}

function rememberDeletedSeries(templateId) {
  store.deletedSeriesIds = unionIds(store.deletedSeriesIds, [templateId]);
}

function isInfiniteRecurrence(recurrence) {
  return Boolean(
    recurrence &&
    recurrence.type !== "none" &&
    recurrence.type !== "generated" &&
    (recurrence.forever || (!recurrence.count && !recurrence.endDate))
  );
}

function isRollingSeries(recurrence) {
  return isInfiniteRecurrence(recurrence) || (recurrence?.count || 0) > MAX_ROLLING_SERIES_INSTANCES;
}

function getSeriesOccurrenceLimit(recurrence) {
  if (typeof recurrence?.count === "number" && recurrence.count > 0) {
    return recurrence.count - 1;
  }
  return Number.POSITIVE_INFINITY;
}

function buildGeneratedInstance(template, occurrenceIndex, startDate, dueDate, existingTask = null) {
  return {
    id: existingTask?.id || createId(),
    templateId: template.id,
    occurrenceIndex,
    name: template.name,
    details: template.details,
    startDate,
    dueDate,
    timeOfDay: template.timeOfDay,
    length: template.length,
    status: existingTask?.status || "open",
    createdAt: existingTask?.createdAt || Date.now() + occurrenceIndex,
    dependencies: [],
    recurrence: { type: "generated" },
    history: Array.isArray(existingTask?.history) ? existingTask.history : []
  };
}

function reconcileRecurringSeries() {
  for (const task of [...store.tasks]) {
    if (!task.templateId && task.recurrence.type !== "none" && !store.deletedSeriesIds.includes(task.id)) {
      regenerateSeries(task.id, { preserveClosed: true });
    }
  }
  store.tasks = filterDeletedTasks(store.tasks, store.deletedTaskIds, store.deletedSeriesIds);
  trimTasks();
}

function isDeveloperUser() {
  return authState.authenticated && authState.user?.email === DEV_EMAIL;
}

async function clearDriveData() {
  if (!isDeveloperUser()) {
    return;
  }
  if (!window.confirm("Delete the Lifetree data stored in Google Drive app data? Local tasks on this browser will stay intact.")) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/lifetree/reset`, {
      method: "POST",
      credentials: FETCH_CREDENTIALS
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Google Drive reset failed");
    }
    store.driveFileId = "";
    persistStore();
    setSyncStatus(payload.cleared ? "Cleared the Lifetree Google Drive data. Local tasks are unchanged." : "No Google Drive Lifetree data was stored for this account.", "success");
  } catch (error) {
    setSyncStatus(`Drive reset failed: ${error.message}`, "error");
  }
}

function getCookie(name) {
  const prefix = `${name}=`;
  const row = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : "";
}

function escapeHtml(value) {
  return String(value)
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
