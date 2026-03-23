import {
  buildLogicalWidgetTaskKey,
  buildHistoryFeed,
  compareTaskResolutionPreference,
  compactTaskHistory,
  computeRecurringNotBeforeAt,
  computeOccurrenceDate,
  createArchivedSeriesRecord,
  findNextWidgetCompletionTask,
  getLatestLifecycleEntry,
  nthWeekdayOfMonth,
  shouldAutoSkipTask,
  toDateString
} from "./logic.js";
import { renderCanopyColumns } from "./modules/canopy.js";
import { createAutosaveController } from "./modules/autosave.js";
import { createDriveSyncController, resolveApiBase } from "./modules/driveSync.js";
import {
  buildTaskPointEntry as buildTaskPointEntryBase,
  choosePreferredTreeState as choosePreferredTreeStateBase,
  DEFAULT_MAX_TASK_POINTS,
  defaultPointsForLength,
  formatPointsLabel,
  mergePointLedger as mergePointLedgerBase,
  normalizeDevSettings,
  normalizePointLedger as normalizePointLedgerBase,
  normalizeTaskPoints,
  normalizeTreeState as normalizeTreeStateBase,
  renderDeveloperFruitSummary as renderDeveloperFruitSummaryBase,
  renderDeveloperPointsSummary as renderDeveloperPointsSummaryBase
} from "./modules/points.js";
import {
  choosePreferredProfile,
  normalizeAutosaveIntervalMinutes,
  normalizeProfile
} from "./modules/profile.js";
import { createTaskDeskController } from "./modules/taskDesk.js";
import { buildPointSummary, buildFruitDisplayState } from "./modules/treeState.js";
import {
  buildAppliedTreeAppearance,
  buildTreeStyleCatalog,
  getTreeBankedPointsByCategory,
  getTreeSkin,
  getTreeStylePartLabel,
  listPurchasableTreeSkins,
  normalizeTreeStyleState,
  purchaseTreeSkin,
  removeOwnedTreeSkin,
  equipTreeSkin
} from "./modules/treeStyles.js";
import { buildTemporalState, formatDate, formatDateTime } from "./modules/time.js";
import { createWidgetDetailController } from "./modules/widgetDetail.js";
import {
  getWidgetDefinition,
  getWidgetUpdatedAt,
  listWidgetCategories,
  mergeWidgetLists,
  normalizeWidgetList,
  normalizeWidgetRecord,
  ownerWidgetLabel,
  listWidgetDefinitions
} from "./widgets/registry.js";

const LOCAL_STORE_KEY = "task_deck_store_v2";
const LEGACY_COOKIE_NAME = "task_deck_store";
const MAX_TASKS = 3000;
const MAX_ROLLING_SERIES_INSTANCES = 100;
const MAX_WIDGETS = 5;
const MAX_VISIBLE_HISTORY_ENTRIES = 25;
const COMPLETED_ONE_OFF_DISMISS_MS = 5000;
const ACTION_UNDO_MS = 5000;
const DEV_EMAIL = "jbkallman@gmail.com";
const DEFAULT_CATEGORY_COLOR = "#7dbf74";
const DEFAULT_CATEGORY_KEY = "productivity";
const DEFAULT_IMPORTANCE = "medium";
const DEFAULT_LATE_GRACE_MINUTES = 15;
const TEMPORAL_REFRESH_MS = 30_000;

const BASE_CATEGORIES = [
  { key: "fun", label: "Fun", color: "#f4b64e", builtin: true },
  { key: "friends", label: "Friends", color: "#5ca8f5", builtin: true },
  { key: "family", label: "Family", color: "#f28ca8", builtin: true },
  { key: "productivity", label: "Productivity", color: "#7dbf74", builtin: true },
  { key: "health", label: "Health", color: "#6dc7bf", builtin: true }
];

const IMPORTANCE_DEFINITIONS = {
  low: { label: "Low", color: "#d8e6f3" },
  medium: { label: "Medium", color: "#ffe2b8" },
  high: { label: "High", color: "#f6b6b6" }
};

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
const HERO_COLLAPSED_KEY = "lifetree_hero_collapsed";

const dashboardHero = document.getElementById("dashboardHero");
const toggleHeroButton = document.getElementById("toggleHero");
const heroWelcome = document.getElementById("heroWelcome");
const heroClock = document.getElementById("heroClock");
const heroClockMeta = document.getElementById("heroClockMeta");
const openSettingsButton = document.getElementById("openSettings");
const canopyColumns = document.getElementById("canopyColumns");
const treeHarvestButton = document.getElementById("treeHarvestButton");
const treeSkyLayer = document.getElementById("treeSkyLayer");
const treeSun = document.getElementById("treeSun");
const treeMoon = document.getElementById("treeMoon");
const treeStarField = document.getElementById("treeStarField");
const treeShellImage = document.getElementById("treeShellImage");
const treeFruitLayer = document.getElementById("treeFruitLayer");
const treeHarvestHint = document.getElementById("treeHarvestHint");
const treeBankSummary = document.getElementById("treeBankSummary");
const treePointSummary = document.getElementById("treePointSummary");
const openTreeStyleButton = document.getElementById("openTreeStyle");
const openTreeDetailButton = document.getElementById("openTreeDetail");
const treeStyleModal = document.getElementById("treeStyleModal");
const closeTreeStyleButton = document.getElementById("closeTreeStyle");
const closeTreeStyleBackdrop = document.getElementById("closeTreeStyleBackdrop");
const treeStyleBody = document.getElementById("treeStyleBody");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsButton = document.getElementById("closeSettings");
const closeSettingsBackdrop = document.getElementById("closeSettingsBackdrop");
const cancelSettingsButton = document.getElementById("cancelSettings");
const settingsForm = document.getElementById("settingsForm");
const settingsDisplayNameInput = document.getElementById("settingsDisplayName");
const settingsAutosaveEnabledInput = document.getElementById("settingsAutosaveEnabled");
const settingsAutosaveIntervalInput = document.getElementById("settingsAutosaveInterval");
const taskDeskModal = document.getElementById("taskDeskModal");
const openTaskDeskButton = document.getElementById("openTaskDesk");
const closeTaskDeskButton = document.getElementById("closeTaskDesk");
const closeTaskDeskBackdrop = document.getElementById("closeTaskDeskBackdrop");
const widgetSlots = Array.from(document.querySelectorAll(".widget-slot"));
const widgetMenu = document.getElementById("widgetMenu");
const widgetMenuTitle = document.getElementById("widgetMenuTitle");
const widgetMenuCopy = document.getElementById("widgetMenuCopy");
const widgetMenuOptions = document.getElementById("widgetMenuOptions");
const closeWidgetMenuButton = document.getElementById("closeWidgetMenu");
const widgetDetailModal = document.getElementById("widgetDetailModal");
const closeWidgetDetailButton = document.getElementById("closeWidgetDetail");
const closeWidgetDetailBackdrop = document.getElementById("closeWidgetDetailBackdrop");
const widgetDetailTitle = document.getElementById("widgetDetailTitle");
const widgetDetailSubtitle = document.getElementById("widgetDetailSubtitle");
const widgetDetailBody = document.getElementById("widgetDetailBody");
const treeDetailModal = document.getElementById("treeDetailModal");
const closeTreeDetailButton = document.getElementById("closeTreeDetail");
const closeTreeDetailBackdrop = document.getElementById("closeTreeDetailBackdrop");
const treeDetailBody = document.getElementById("treeDetailBody");
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
const lateGraceMinutesInput = document.getElementById("lateGraceMinutes");
const skipRuleTypeInput = document.getElementById("skipRuleType");
const skipGraceMinutesInput = document.getElementById("skipGraceMinutes");
const skipGraceRow = document.getElementById("skipGraceRow");
const taskLengthInput = document.getElementById("taskLength");
const taskPointsInput = document.getElementById("taskPoints");
const taskCategoryInput = document.getElementById("taskCategory");
const taskImportanceInput = document.getElementById("taskImportance");
const categoryList = document.getElementById("categoryList");
const newCategoryNameInput = document.getElementById("newCategoryName");
const newCategoryColorInput = document.getElementById("newCategoryColor");
const addCategoryButton = document.getElementById("addCategory");
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
const historyWidgetFilter = document.getElementById("historyWidgetFilter");
const clearWidgetHistoryButton = document.getElementById("clearWidgetHistory");
const clearAllHistoryButton = document.getElementById("clearAllHistory");
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
const openDeveloperButton = document.getElementById("openDeveloper");
const developerModal = document.getElementById("developerModal");
const closeDeveloperButton = document.getElementById("closeDeveloper");
const closeDeveloperBackdrop = document.getElementById("closeDeveloperBackdrop");
const developerPanel = document.getElementById("developerPanel");
const developerEmail = document.getElementById("developerEmail");
const developerWidgetType = document.getElementById("developerWidgetType");
const developerMaxTaskPoints = document.getElementById("developerMaxTaskPoints");
const developerInjectCategory = document.getElementById("developerInjectCategory");
const developerInjectPoints = document.getElementById("developerInjectPoints");
const developerInjectSource = document.getElementById("developerInjectSource");
const developerFruitCategory = document.getElementById("developerFruitCategory");
const developerFruitDelta = document.getElementById("developerFruitDelta");
const developerBankedCategory = document.getElementById("developerBankedCategory");
const developerBankedDelta = document.getElementById("developerBankedDelta");
const developerTreeSkin = document.getElementById("developerTreeSkin");
const grantTreeSkinButton = document.getElementById("grantTreeSkin");
const removeTreeSkinButton = document.getElementById("removeTreeSkin");
const copyWidgetDiagnosticsButton = document.getElementById("copyWidgetDiagnostics");
const cleanWidgetDataButton = document.getElementById("cleanWidgetData");
const clearWidgetDriveDataButton = document.getElementById("clearWidgetDriveData");
const injectPointsButton = document.getElementById("injectPoints");
const addFruitGrowthButton = document.getElementById("addFruitGrowth");
const removeFruitGrowthButton = document.getElementById("removeFruitGrowth");
const addBankedPointsButton = document.getElementById("addBankedPoints");
const removeBankedPointsButton = document.getElementById("removeBankedPoints");
const resetFruitGrowthButton = document.getElementById("resetFruitGrowth");
const clearDriveDataButton = document.getElementById("clearDriveData");
const developerFruitSummary = document.getElementById("developerFruitSummary");
const developerPointsSummary = document.getElementById("developerPointsSummary");

const authState = {
  authenticated: false,
  user: null
};

const editState = {
  taskId: "",
  scope: "single"
};

const widgetMenuState = {
  slotIndex: null
};

const pendingDeleteState = {
  taskId: "",
  scope: "single"
};
const pendingActions = new Map();
const widgetDetailState = {
  widgetId: "",
  cleanup: null
};

let store = loadStore();

const taskDeskController = createTaskDeskController({
  taskDeskModal,
  closeWidgetMenu
});
const { openTaskDesk, closeTaskDesk, isTaskDeskOpen } = taskDeskController;

const widgetDetailController = createWidgetDetailController({
  widgetDetailModal,
  closeWidgetDetailButton,
  closeWidgetDetailBackdrop,
  closeWidgetMenu
});
const {
  openWidgetDetail: openWidgetDetailModal,
  closeWidgetDetail: closeWidgetDetailModal,
  isWidgetDetailOpen
} = widgetDetailController;

const driveSyncController = createDriveSyncController({
  apiBase: API_BASE,
  fetchCredentials: FETCH_CREDENTIALS,
  authState,
  getStore: () => store,
  setStore: (nextStore) => {
    store = nextStore;
  },
  normalizeStore,
  mergeStores,
  ensureWidgetIntegrity,
  ensureWidgetTasks,
  reconcileRecurringSeries,
  persistStore,
  renderAll,
  setSyncStatus,
  updateGoogleButtons,
  getReturnToTarget,
  describeMergeResult,
  computeStoreFingerprint
});
const {
  refreshAuthStatus,
  connectGoogle,
  disconnectGoogle,
  loadFromDrive,
  saveToDrive,
  initializeFromDrive,
  saveToDriveOnExit
} = driveSyncController;

let autosaveController = createAutosaveController({
  getProfile: () => normalizeProfile(store.profile),
  getStore: () => store,
  isAuthenticated: () => authState.authenticated,
  computeStoreFingerprint,
  saveToDrive
});

updateRecurrenceVisibility();
updateSkipVisibility();
applyHeroState(loadHeroCollapsed());
taskPointsInput.dataset.auto = "true";
syncTaskPointsDefault();
renderTemporalUi();
window.setInterval(renderTemporalUi, TEMPORAL_REFRESH_MS);

toggleHeroButton.addEventListener("click", toggleHeroCollapsed);
openSettingsButton.addEventListener("click", openSettings);
openTaskDeskButton.addEventListener("click", openTaskDesk);
closeTaskDeskButton.addEventListener("click", closeTaskDesk);
closeTaskDeskBackdrop.addEventListener("click", closeTaskDesk);
closeWidgetMenuButton.addEventListener("click", closeWidgetMenu);
widgetMenuOptions.addEventListener("click", handleWidgetMenuSelection);
canopyColumns.addEventListener("click", handleCanopyAction);
treeHarvestButton.addEventListener("click", harvestRipeFruit);
openTreeStyleButton.addEventListener("click", openTreeStyle);
openTreeDetailButton.addEventListener("click", openTreeDetail);
widgetSlots.forEach((slot) => {
  slot.addEventListener("click", handleWidgetSlotClick);
});
document.addEventListener("keydown", handleGlobalKeydown);
form.addEventListener("submit", handleSubmit);
clearFormButton.addEventListener("click", resetComposer);
cancelEditButton.addEventListener("click", clearEditState);
addCategoryButton.addEventListener("click", handleAddCategory);
categoryList.addEventListener("input", handleCategoryListInput);
categoryList.addEventListener("click", handleCategoryListClick);
editScope.addEventListener("change", () => {
  editState.scope = editScope.value;
  syncEditPanel();
});
recurrenceType.addEventListener("change", updateRecurrenceVisibility);
recurrenceForeverInput.addEventListener("change", updateRecurrenceVisibility);
skipRuleTypeInput.addEventListener("change", updateSkipVisibility);
taskLengthInput.addEventListener("change", syncTaskPointsDefault);
taskPointsInput.addEventListener("input", syncTaskPointsAutoState);
statusFilter.addEventListener("change", renderTaskGrid);
lengthFilter.addEventListener("change", renderTaskGrid);
sortBy.addEventListener("change", renderTaskGrid);
searchQuery.addEventListener("input", renderTaskGrid);
historySort.addEventListener("change", renderHistoryPanel);
historyFilter.addEventListener("change", renderHistoryPanel);
historyWidgetFilter.addEventListener("change", renderHistoryPanel);
googleSignInButton.addEventListener("click", connectGoogle);
googleSignOutButton.addEventListener("click", handleGoogleDisconnect);
loadDriveButton.addEventListener("click", handleManualLoadFromDrive);
saveDriveButton.addEventListener("click", handleManualSaveToDrive);
clearDriveDataButton.addEventListener("click", clearDriveData);
openDeveloperButton.addEventListener("click", openDeveloper);
developerMaxTaskPoints.addEventListener("change", updateMaxTaskPointsSetting);
injectPointsButton.addEventListener("click", injectDeveloperPoints);
addFruitGrowthButton.addEventListener("click", () => adjustDeveloperFruitGrowth(1));
removeFruitGrowthButton.addEventListener("click", () => adjustDeveloperFruitGrowth(-1));
addBankedPointsButton.addEventListener("click", () => adjustDeveloperBankedPoints(1));
removeBankedPointsButton.addEventListener("click", () => adjustDeveloperBankedPoints(-1));
grantTreeSkinButton.addEventListener("click", buySelectedTreeSkin);
removeTreeSkinButton.addEventListener("click", removeSelectedTreeSkin);
resetFruitGrowthButton.addEventListener("click", resetDeveloperFruitGrowth);
copyWidgetDiagnosticsButton.addEventListener("click", copyWidgetDiagnostics);
cleanWidgetDataButton.addEventListener("click", runLocalWidgetCleanup);
clearWidgetDriveDataButton.addEventListener("click", clearWidgetDriveData);
clearWidgetHistoryButton.addEventListener("click", clearSelectedHistorySource);
clearAllHistoryButton.addEventListener("click", clearAllHistory);
window.addEventListener("pagehide", () => {
  saveToDriveOnExit();
});
closeSettingsButton.addEventListener("click", closeSettings);
closeSettingsBackdrop.addEventListener("click", closeSettings);
cancelSettingsButton.addEventListener("click", closeSettings);
settingsForm.addEventListener("submit", handleSettingsSubmit);
settingsAutosaveEnabledInput.addEventListener("change", syncSettingsAutosaveInputs);
closeTreeDetailButton.addEventListener("click", closeTreeDetail);
closeTreeDetailBackdrop.addEventListener("click", closeTreeDetail);
closeTreeStyleButton.addEventListener("click", closeTreeStyle);
closeTreeStyleBackdrop.addEventListener("click", closeTreeStyle);
treeStyleBody.addEventListener("click", handleTreeStyleAction);
closeDeveloperButton.addEventListener("click", closeDeveloper);
closeDeveloperBackdrop.addEventListener("click", closeDeveloper);

initializeApp();

async function initializeApp() {
  const startupResult = await initializeFromDrive({ timeoutMs: 10000 });
  finalizeStoreState();
  renderAll();
  autosaveController.refreshSchedule();
  if (startupResult.loaded && startupResult.synced) {
    autosaveController.markCurrentAsSaved();
  }

  if (startupResult.timedOut) {
    setSyncStatus("Google Drive did not respond within 10 seconds. Using local data on this device.", "info");
    return;
  }

  if (!authState.authenticated) {
    refreshAuthStatus({ suppressUnavailableError: true });
  }
}

async function handleGoogleDisconnect() {
  await disconnectGoogle();
  autosaveController.clearSavedBaseline();
  autosaveController.refreshSchedule();
}

async function handleManualLoadFromDrive() {
  const result = await loadFromDrive();
  autosaveController.refreshSchedule();
  if (result?.applied && result.synced) {
    autosaveController.markCurrentAsSaved();
  }
}

async function handleManualSaveToDrive() {
  const success = await saveToDrive();
  if (success) {
    autosaveController.markCurrentAsSaved();
  }
}

function finalizeStoreState() {
  const before = JSON.stringify(store);
  ensureWidgetIntegrity();
  cleanupDetachedWidgetTasks();
  cleanupLegacyWidgetArtifacts();
  reconcileRecurringSeries();
  ensureWidgetTasks();
  repairTaskStatusFromHistory();
  if (JSON.stringify(store) !== before) {
    persistStore();
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (!widgetMenu.classList.contains("hidden")) {
    closeWidgetMenu();
    return;
  }

  if (isSettingsOpen()) {
    closeSettings();
    return;
  }

  if (isWidgetDetailOpen()) {
    closeWidgetDetail();
    return;
  }

  if (isTreeDetailOpen()) {
    closeTreeDetail();
    return;
  }

  if (isTreeStyleOpen()) {
    closeTreeStyle();
    return;
  }

  if (isDeveloperOpen()) {
    closeDeveloper();
    return;
  }

  if (isTaskDeskOpen()) {
    closeTaskDesk();
  }
}

function openTreeStyle() {
  treeStyleModal.classList.remove("hidden");
  treeStyleModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("tree-style-open");
  renderTreeStyleIfOpen();
}

function openTreeDetail() {
  treeDetailModal.classList.remove("hidden");
  treeDetailModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("tree-detail-open");
  renderTreeDetailIfOpen();
}

function openDeveloper() {
  if (!isDeveloperUser()) {
    return;
  }
  developerModal.classList.remove("hidden");
  developerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("developer-open");
  renderDeveloperPanel();
}

function openSettings() {
  const profile = normalizeProfile(store.profile);
  settingsDisplayNameInput.value = profile.displayName;
  settingsAutosaveEnabledInput.checked = profile.autosaveEnabled;
  settingsAutosaveIntervalInput.value = String(profile.autosaveIntervalMinutes);
  syncSettingsAutosaveInputs();
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
  window.setTimeout(() => settingsDisplayNameInput.focus(), 0);
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
}

function isSettingsOpen() {
  return !settingsModal.classList.contains("hidden");
}

function closeTreeDetail() {
  treeDetailModal.classList.add("hidden");
  treeDetailModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tree-detail-open");
}

function isTreeDetailOpen() {
  return !treeDetailModal.classList.contains("hidden");
}

function closeTreeStyle() {
  treeStyleModal.classList.add("hidden");
  treeStyleModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tree-style-open");
}

function isTreeStyleOpen() {
  return !treeStyleModal.classList.contains("hidden");
}

function closeDeveloper() {
  developerModal.classList.add("hidden");
  developerModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("developer-open");
}

function isDeveloperOpen() {
  return !developerModal.classList.contains("hidden");
}

function toggleHeroCollapsed() {
  const nextCollapsed = !dashboardHero.classList.contains("collapsed");
  applyHeroState(nextCollapsed);
  window.localStorage.setItem(HERO_COLLAPSED_KEY, nextCollapsed ? "1" : "0");
}

function loadHeroCollapsed() {
  return window.localStorage.getItem(HERO_COLLAPSED_KEY) === "1";
}

function applyHeroState(collapsed) {
  dashboardHero.classList.toggle("collapsed", collapsed);
  toggleHeroButton.textContent = collapsed ? "Expand banner" : "Collapse banner";
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const currentProfile = normalizeProfile(store.profile);
  const displayName = String(settingsDisplayNameInput.value || "").trim().slice(0, 40);
  const autosaveEnabled = settingsAutosaveEnabledInput.checked;
  const autosaveIntervalMinutes = normalizeAutosaveIntervalMinutes(settingsAutosaveIntervalInput.value);
  const unchanged = (
    displayName === currentProfile.displayName
    && autosaveEnabled === currentProfile.autosaveEnabled
    && autosaveIntervalMinutes === currentProfile.autosaveIntervalMinutes
  );
  if (unchanged) {
    closeSettings();
    return;
  }
  store.profile = normalizeProfile({
    ...store.profile,
    displayName,
    autosaveEnabled,
    autosaveIntervalMinutes,
    updatedAt: Date.now()
  });
  persistStore();
  renderTemporalUi();
  autosaveController.refreshSchedule();
  closeSettings();
  setSyncStatus(displayName ? `Saved settings for ${displayName}.` : "Saved Lifetree settings.", "info");
}

function syncSettingsAutosaveInputs() {
  settingsAutosaveIntervalInput.disabled = !settingsAutosaveEnabledInput.checked;
}

function handleWidgetSlotClick(event) {
  const slot = event.currentTarget;
  const slotIndex = Number(slot.getAttribute("data-slot-index"));
  const actionTarget = event.target.closest("[data-widget-action]");

  if (!actionTarget) {
    if (!store.widgets.some((widget) => widget.slotIndex === slotIndex)) {
      openWidgetMenu(slotIndex);
    }
    return;
  }

  const action = actionTarget.getAttribute("data-widget-action");
  if (action === "add-widget") {
    openWidgetMenu(slotIndex);
    return;
  }

  const widget = store.widgets.find((item) => item.slotIndex === slotIndex);
  const definition = getWidgetDefinition(widget?.type);
  if (widget && definition?.handleAction?.({
    action,
    actionTarget,
    widget,
    helpers: {
      getStore: () => store,
      applyAutoSkipRules,
      completeNextTaskFromWidget,
      openWidgetDetail,
      stageWidgetAction,
      getPendingActionForWidget,
      undoPendingAction,
      reconcileRecurringSeries,
      persistStore,
      renderAll,
      setSyncStatus
    }
  })) {
    return;
  }

  if (action === "open-task-desk") {
    openTaskDesk();
    return;
  }

  if (action === "open-widget-detail") {
    if (widget) {
      openWidgetDetail(widget);
    }
    return;
  }

  if (action === "remove-widget") {
    const widget = store.widgets.find((item) => item.slotIndex === slotIndex);
    if (!widget) {
      return;
    }
    removeWidget(widget);
  }
}

function openWidgetDetail(widget) {
  widgetDetailState.widgetId = widget.id;
  openWidgetDetailModal();
  renderWidgetDetailIfOpen();
}

function closeWidgetDetail() {
  if (typeof widgetDetailState.cleanup === "function") {
    widgetDetailState.cleanup();
  }
  widgetDetailState.cleanup = null;
  widgetDetailState.widgetId = "";
  widgetDetailBody.innerHTML = "";
  closeWidgetDetailModal();
}

function renderWidgetDetailIfOpen() {
  if (!widgetDetailState.widgetId) {
    return;
  }

  const widget = store.widgets.find((item) => item.id === widgetDetailState.widgetId);
  if (!widget) {
    closeWidgetDetail();
    return;
  }

  const definition = getWidgetDefinition(widget.type);
  if (!definition?.renderDetail) {
    closeWidgetDetail();
    return;
  }

  if (typeof widgetDetailState.cleanup === "function") {
    widgetDetailState.cleanup();
    widgetDetailState.cleanup = null;
  }

  widgetDetailTitle.textContent = definition.detailTitle || definition.title || "Widget detail";
  widgetDetailSubtitle.textContent = definition.detailSubtitle || "Expanded controls for this Lifetree widget.";
  widgetDetailBody.innerHTML = definition.renderDetail({
    widget,
    tasks: store.tasks,
    escapeHtml,
    formatDate,
    formatDateTime,
    isDeveloperUser: isDeveloperUser(),
    getPendingActionForWidget
  });
  widgetDetailState.cleanup = definition.mountDetail?.({
    widget,
    container: widgetDetailBody,
    isDeveloperUser: isDeveloperUser(),
    helpers: {
      getStore: () => store,
      createId,
      todayString,
      resolveCategorySnapshot,
      openTaskDesk,
      openWidgetDetail,
      closeWidgetDetail,
      setSyncStatus,
      renderAll,
      persistStore,
      reconcileRecurringSeries,
      regenerateSeries,
      stageWidgetAction,
      getPendingActionForWidget,
      completeNextTaskFromWidget,
      undoPendingAction,
      retireWidgetOwnedSeries
    }
  }) || null;
}

function handleCanopyAction(event) {
  const actionTarget = event.target.closest("[data-canopy-action]");
  if (!actionTarget) {
    return;
  }

  const taskId = actionTarget.getAttribute("data-task-id");
  const action = actionTarget.getAttribute("data-canopy-action");
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task || task.archived || task.status !== "open") {
    return;
  }
  const pendingAction = getPendingActionForTask(taskId);

  if (action === "undo") {
    const pendingKey = actionTarget.getAttribute("data-pending-key");
    if (pendingKey) {
      undoPendingAction(pendingKey, "Undid the pending canopy action.");
    }
    return;
  }

  if (pendingAction) {
    return;
  }

  clearPendingDelete();

  if (action === "complete") {
    if (isBlocked(task)) {
      setSyncStatus("That task is blocked by unfinished prerequisites.", "error");
      return;
    }
    stagePendingAction({
      key: `complete:${task.id}`,
      taskId: task.id,
      description: `Pending completion for ${task.name}. Click undo within 5 seconds to cancel.`,
      commit: () => {
        const nextTask = store.tasks.find((item) => item.id === task.id);
        if (!nextTask || nextTask.archived || nextTask.status !== "open" || isBlocked(nextTask)) {
          return false;
        }
        markTaskCompleted(nextTask);
        return { message: `Completed ${nextTask.name} from the canopy.`, tone: "info" };
      }
    });
    return;
  }

  if (action === "skip") {
    stagePendingAction({
      key: `skip:${task.id}`,
      taskId: task.id,
      description: `Pending skip for ${task.name}. Click undo within 5 seconds to cancel.`,
      commit: () => {
        const nextTask = store.tasks.find((item) => item.id === task.id);
        if (!nextTask || nextTask.archived || nextTask.status !== "open") {
          return false;
        }
        markTaskSkipped(nextTask);
        return { message: `Skipped ${nextTask.name} from the canopy.`, tone: "info" };
      }
    });
  }
}

function openWidgetMenu(slotIndex) {
  widgetMenuState.slotIndex = slotIndex;
  widgetMenu.classList.remove("hidden");
  widgetMenuTitle.textContent = `Choose a widget for slot ${slotIndex + 1}`;
  widgetMenuCopy.textContent = "Start small. Widget types cannot be duplicated, and each definition owns its own task rules.";
  renderWidgetMenuOptions();
}

function closeWidgetMenu() {
  widgetMenuState.slotIndex = null;
  widgetMenu.classList.add("hidden");
}

function handleWidgetMenuSelection(event) {
  const button = event.target.closest("[data-widget-type]");
  if (!button) {
    return;
  }
  addWidgetTypeToSelectedSlot(button.getAttribute("data-widget-type"));
}

function renderWidgetMenuOptions() {
  widgetMenuOptions.innerHTML = listWidgetDefinitions().map((definition) => {
    const disabled = definition.singleton && store.widgets.some((widget) => widget.type === definition.type);
    return `
      <button
        type="button"
        class="primary-button"
        data-widget-type="${definition.type}"
        ${disabled ? "disabled" : ""}
      >
        ${definition.menuLabel}
      </button>
    `;
  }).join("");
}

function addWidgetTypeToSelectedSlot(type) {
  if (widgetMenuState.slotIndex === null) {
    return;
  }

  const definition = getWidgetDefinition(type);
  if (!definition) {
    setSyncStatus("That widget type is not registered yet.", "error");
    closeWidgetMenu();
    return;
  }

  if (definition.singleton && store.widgets.some((widget) => widget.type === definition.type)) {
    setSyncStatus(`${definition.title} is already part of this Lifetree.`, "error");
    closeWidgetMenu();
    return;
  }

  const retired = getRetiredWidgetByType(definition.type);
  const widget = definition.createWidget({
    slotIndex: widgetMenuState.slotIndex,
    retiredWidget: retired,
    createId,
    now: Date.now()
  });

  store.widgets.push(widget);
  removeRetiredWidgetByType(widget.type);
  ensureWidgetIntegrity();
  ensureWidgetTasks();
  persistStore();
  renderAll();
  closeWidgetMenu();
  setSyncStatus(
    retired
      ? `Added ${definition.title} back and restored its prior widget data.`
      : `Added ${definition.title}.`,
    "info"
  );
}

function removeWidget(widget) {
  const widgetLabel = ownerWidgetLabel({ ownerWidgetType: widget.type });
  if (!window.confirm(`Remove the ${widgetLabel} from this Lifetree? Future widget tasks will be removed.`)) {
    return;
  }

  const removeHistory = window.confirm(
    "Press OK to remove all history from this widget too. Press Cancel to keep its past records so a future version of the widget can inherit them."
  );

  removeWidgetTasks(widget, { removeHistory });
  store.widgets = store.widgets.filter((item) => item.id !== widget.id);

  if (removeHistory) {
    removeRetiredWidgetByType(widget.type);
  } else {
    rememberRetiredWidget(widget);
  }

  persistStore();
  renderAll();
  setSyncStatus(
    removeHistory
      ? `Removed the ${widgetLabel} and cleared its history.`
      : `Removed the ${widgetLabel} and kept its history for later reuse.`,
    "info"
  );
}

function removeWidgetTasks(widget, { removeHistory }) {
  const removedIds = new Set();

  for (const task of [...store.tasks]) {
    if (task.ownerWidgetId !== widget.id) {
      continue;
    }

    const isTemplate = !task.templateId && task.recurrence.type !== "none";
    const hasHistory = Array.isArray(task.history) && task.history.length > 0;

    if (removeHistory) {
      if (isTemplate) {
        rememberDeletedSeries(task.id);
      } else {
        rememberDeletedTask(task);
      }
      removedIds.add(task.id);
      continue;
    }

    if (isTemplate) {
      rememberDeletedSeries(task.id);
      removedIds.add(task.id);
      if (task.status !== "open" || hasHistory) {
        upsertArchivedSeriesRecord({ ...task, archived: true });
      }
      continue;
    }

    if (task.status === "open" && !hasHistory) {
      rememberDeletedTask(task);
      removedIds.add(task.id);
      continue;
    }

    task.archived = true;
  }

  store.tasks = store.tasks.filter((task) => {
    if (removedIds.has(task.id)) {
      return false;
    }
    if (!removeHistory && task.templateId && removedIds.has(task.templateId)) {
      if (task.status === "open" && (!Array.isArray(task.history) || task.history.length === 0)) {
        return false;
      }
      task.archived = true;
      return true;
    }
    return true;
  });

  for (const task of store.tasks) {
    task.dependencies = task.dependencies.filter((dependencyId) => !removedIds.has(dependencyId));
  }
}

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
  const skipRule = originalTask?.skipRule?.type === "widget-lockout"
    ? normalizeSkipRule(originalTask.skipRule)
    : buildSkipRule(formData, originalTask?.skipRule);
  const categorySnapshot = resolveCategorySnapshot(String(formData.get("category") || ""), originalTask);
  const recurrence = buildRecurrence(formData, originalTask?.recurrence);

  return {
    id: originalTask?.id || createId(),
    templateId: originalTask?.templateId || "",
    occurrenceIndex: originalTask?.occurrenceIndex || 0,
    name: String(formData.get("name") || "").trim(),
    details: String(formData.get("details") || "").trim(),
    startDate: String(formData.get("startDate") || ""),
    dueDate: String(formData.get("dueDate") || ""),
    timeOfDay: String(formData.get("timeOfDay") || ""),
    lateGraceMinutes: parsePositiveOrZeroNumber(formData.get("lateGraceMinutes")) ?? originalTask?.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES,
    notBeforeAt: deriveTaskNotBeforeAt({
      recurrence,
      startDate: String(formData.get("startDate") || ""),
      dueDate: String(formData.get("dueDate") || ""),
      originalTask
    }),
    pointsValue: normalizeTaskPoints(formData.get("points"), originalTask?.pointsValue, getMaxTaskPoints()),
    pointsEntryId: originalTask?.pointsEntryId || "",
    length: String(formData.get("length") || "medium"),
    categoryKey: categorySnapshot.key,
    categoryLabel: categorySnapshot.label,
    categoryColor: categorySnapshot.color,
    importance: normalizeImportance(String(formData.get("importance") || originalTask?.importance || DEFAULT_IMPORTANCE)),
    status: originalTask?.status || "open",
    createdAt: originalTask?.createdAt || Date.now(),
    ownerWidgetId: originalTask?.ownerWidgetId || "",
    ownerWidgetType: originalTask?.ownerWidgetType || "",
    ownerTaskKey: originalTask?.ownerTaskKey || "",
    widgetCompletion: normalizeWidgetCompletion(originalTask?.widgetCompletion),
    skipRule,
    dependencies: Array.from(dependenciesSelect.selectedOptions).map((option) => option.value),
    recurrence,
    history: Array.isArray(originalTask?.history) ? originalTask.history : []
  };
}

function buildSkipRule(formData, originalSkipRule = null) {
  const type = String(formData.get("skipRuleType") || originalSkipRule?.type || "none");
  if (type === "none") {
    return { type: "none" };
  }

  if (type === "after-due-minutes") {
    return {
      type,
      graceMinutes: parsePositiveOrZeroNumber(formData.get("skipGraceMinutes")) ?? originalSkipRule?.graceMinutes ?? 0
    };
  }

  if (type === "end-of-day") {
    return { type };
  }

  return normalizeSkipRule(originalSkipRule);
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
    replaceTask(updatedTemplate);
    regenerateSeries(template.id, { preserveClosed: true });
  } else {
    const updatedTask = buildTaskFromForm(formData, task);
    updatedTask.recurrence = task.templateId ? { type: "generated" } : updatedTask.recurrence;
    updatedTask.history = [...task.history];
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
  syncTaskPointAward(nextTask);
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
  if (applyAutoSkipRules()) {
    reconcileRecurringSeries();
    persistStore();
  }
  if (applyCompletedTaskHistoryOnly()) {
    persistStore();
  }
  if (applyAutoArchiving()) {
    persistStore();
  }
  renderCanopy();
  renderTemporalUi();
  renderTreeCore();
  renderWidgetOrbit();
  renderCategoryOptions();
  renderCategoryManager();
  renderDependencyOptions();
  renderHistorySourceOptions();
  renderSummary();
  renderTaskGrid();
  renderHistoryPanel();
  renderDeveloperPanel();
  renderWidgetDetailIfOpen();
  renderTreeStyleIfOpen();
  renderTreeDetailIfOpen();
  syncEditPanel();
  updateGoogleButtons();
}

function getTreeDisplayState() {
  return buildFruitDisplayState({
    pointLedger: store.pointLedger,
    treeState: normalizeTreeState(store.treeState),
    categories: getAllCategoryDefinitions(),
    resolveCategorySnapshot
  });
}

function getPointLedgerSummary() {
  return buildPointSummary(store.pointLedger);
}

function normalizeTreeState(value) {
  return normalizeTreeStateBase(value, {
    normalizeTreeStyleState,
    slugifyCategoryKey
  });
}

function choosePreferredTreeState(localTreeState, remoteTreeState) {
  return choosePreferredTreeStateBase(localTreeState, remoteTreeState, {
    normalizeTreeStyleState,
    slugifyCategoryKey
  });
}

function normalizePointLedger(value) {
  return normalizePointLedgerBase(value, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot
  });
}

function mergePointLedger(localEntries = [], remoteEntries = []) {
  return mergePointLedgerBase(localEntries, remoteEntries, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot
  });
}

function buildTaskPointEntry(task, at = Date.now(), id = createId()) {
  return buildTaskPointEntryBase(task, {
    at,
    id,
    createId,
    normalizeCategoryColor,
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    resolveCategorySnapshot,
    ownerWidgetLabel
  });
}

function renderDeveloperPointsSummary(summary) {
  return renderDeveloperPointsSummaryBase(summary, { escapeHtml });
}

function renderDeveloperFruitSummary(treeState) {
  return renderDeveloperFruitSummaryBase(treeState, { escapeHtml });
}

function renderCanopy() {
  const manualCards = getVisibleCards()
    .filter((card) => !card.task.ownerWidgetType && !card.task.archived && card.status === "open")
    .map((card) => ({
      ...card,
      blocked: isBlocked(card.task),
      blockedNote: describeCompletionGate(card.task)
    }));

  renderCanopyColumns(canopyColumns, {
    cards: manualCards,
    today: todayString(),
    escapeHtml,
    formatDate,
    getPendingActionForTask
  });
}

function renderTemporalUi(now = new Date()) {
  renderHeroStatus(now);
  renderTreeSky(now);
}

function renderHeroStatus(now = new Date()) {
  const profile = normalizeProfile(store.profile);
  const temporal = buildTemporalState(now);
  heroWelcome.textContent = profile.displayName ? `Welcome ${profile.displayName}` : "Welcome";
  heroClock.textContent = temporal.clockLabel;
  heroClockMeta.textContent = `${temporal.phaseLabel} · ${temporal.dateLabel}`;
  heroClockMeta.title = temporal.timeZoneLabel;
  dashboardHero.dataset.phase = temporal.phase;
}

function renderTreeSky(now = new Date()) {
  const temporal = buildTemporalState(now);
  const appearance = buildAppliedTreeAppearance(normalizeTreeState(store.treeState).styleState, temporal.phase);
  const background = appearance.background || {};
  const sunMoon = appearance.sunMoon || {};
  treeHarvestButton.dataset.phase = temporal.phase;
  treeSkyLayer.style.setProperty("--sky-top", background.skyTop || temporal.skyTop);
  treeSkyLayer.style.setProperty("--sky-bottom", background.skyBottom || temporal.skyBottom);
  treeSkyLayer.style.setProperty("--horizon-glow", background.horizonGlow || temporal.horizonGlow);
  treeSun.style.left = `${temporal.sunLeft}%`;
  treeSun.style.top = `${temporal.sunTop}%`;
  treeSun.style.opacity = String(sunMoon.sunOpacity ?? temporal.sunOpacity);
  treeMoon.style.left = `${temporal.moonLeft}%`;
  treeMoon.style.top = `${temporal.moonTop}%`;
  treeMoon.style.opacity = String(sunMoon.moonOpacity ?? temporal.moonOpacity);
  treeStarField.style.opacity = String(sunMoon.starOpacity ?? temporal.starOpacity);
  if (treeShellImage.getAttribute("src") !== appearance.treeImageSrc) {
    treeShellImage.setAttribute("src", appearance.treeImageSrc);
  }
}

function renderTreeCore() {
  const treeState = getTreeDisplayState();
  treeHarvestButton.classList.toggle("ripe-ready", treeState.ripeFruitCount > 0);
  treeHarvestHint.textContent = treeState.ripeFruitCount > 0
    ? `${treeState.ripeFruitCount} ripe ${treeState.ripeFruitCount === 1 ? "fruit is" : "fruits are"} ready to harvest for ${formatPointsLabel(treeState.ripePoints)}.`
    : "No ripe fruit right now. The tree becomes harvestable as fruit ripens.";

  treeFruitLayer.innerHTML = treeState.fruitDescriptors.map((fruit) => `
    <span
      class="tree-fruit stage-${fruit.stage}${fruit.ripe ? " ripe" : ""}"
      style="
        --fruit-color: ${escapeHtml(fruit.color)};
        --fruit-size: ${fruit.size}px;
        left: ${fruit.left}%;
        top: ${fruit.top}%;
      "
      title="${escapeHtml(`${fruit.categoryLabel}: ${fruit.points}/25 growth points`)}"
    ></span>
  `).join("");

  treeBankSummary.innerHTML = `
    <span class="tree-bank-label">Banked reward points</span>
    <strong>${escapeHtml(formatPointsLabel(treeState.bankedPoints))}</strong>
  `;

  const visibleCategories = treeState.categories.filter((category) => category.bankedPoints > 0);
  treePointSummary.innerHTML = visibleCategories.length > 0
    ? visibleCategories.map((category) => `
      <span
        class="tree-point-pill"
        style="--chip-color: ${escapeHtml(category.color)}"
        title="${escapeHtml(`${category.label}: ${formatPointsLabel(category.bankedPoints)} banked`)}"
      >
        ${escapeHtml(String(category.bankedPoints))}
      </span>
    `).join("")
    : '<span class="tree-point-empty">No banked fruit points yet.</span>';
}

function renderTreeDetailIfOpen() {
  if (!isTreeDetailOpen()) {
    return;
  }

  const treeState = getTreeDisplayState();
  const pointSummary = getPointLedgerSummary();
  const visibleCategories = treeState.categories.filter((category) => category.availablePoints > 0 || category.bankedPoints > 0 || category.earnedPoints > 0 || category.adjustmentPoints !== 0);

  treeDetailBody.innerHTML = `
    <section class="tree-detail-layout">
      <section class="tree-detail-overview">
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.bankedPoints))}</strong>
          <span>Banked reward points</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.growingPoints))}</strong>
          <span>Currently growing on the tree</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.ripePoints))}</strong>
          <span>Ready to harvest now</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(String(treeState.ripeFruitCount))}</strong>
          <span>Ripe fruits on the branches</span>
        </article>
      </section>

      <section class="tree-detail-section">
        <div class="tree-detail-section-header">
          <div>
            <p class="eyebrow">Fruit</p>
            <h3>Current fruit by category</h3>
          </div>
          <button type="button" class="primary-button" data-tree-detail-action="harvest">Harvest ripe fruit</button>
        </div>
        <div class="tree-detail-categories">
          ${visibleCategories.length > 0 ? visibleCategories.map((category) => `
            <article class="tree-detail-card">
              <div class="tree-detail-card-header">
                <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(category.color)}">${escapeHtml(category.label)}</span>
                <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(category.color)}">${escapeHtml(formatPointsLabel(category.availablePoints))}</span>
              </div>
              <div class="tree-detail-fruit-row">
                ${category.fruits.length > 0 ? category.fruits.map((fruit) => `
                  <span class="tree-fruit detail stage-${fruit.stage}${fruit.ripe ? " ripe" : ""}" style="--fruit-color: ${escapeHtml(category.color)}; --fruit-size: ${11 + (fruit.stage * 4)}px;"></span>
                `).join("") : '<span class="tree-point-empty">No visible fruit</span>'}
              </div>
              <p>${category.visibleFruitCount} / 3 fruits visible${category.overflowPoints > 0 ? ` · ${formatPointsLabel(category.overflowPoints)} waiting off-branch` : ""}</p>
              <p>${escapeHtml(formatPointsLabel(category.ripePoints))} ripe · ${escapeHtml(formatPointsLabel(category.bankedPoints))} banked</p>
            </article>
          `).join("") : '<p class="tree-point-empty">No fruit has started growing yet.</p>'}
        </div>
      </section>

      <section class="tree-detail-section">
        <div class="tree-detail-section-header">
          <div>
            <p class="eyebrow">Points</p>
            <h3>Point source breakdown</h3>
          </div>
        </div>
        <div class="tree-detail-sources">
          ${pointSummary.bySource.length > 0 ? pointSummary.bySource.map((entry) => `
            <div class="developer-point-item source">
              <span>${escapeHtml(entry.label)}</span>
              <strong>${escapeHtml(formatPointsLabel(entry.points))}</strong>
            </div>
          `).join("") : '<p class="tree-point-empty">No point sources recorded yet.</p>'}
        </div>
      </section>
    </section>
  `;

  treeDetailBody.querySelector("[data-tree-detail-action='harvest']")?.addEventListener("click", () => {
    harvestRipeFruit();
  });
}

function renderTreeStyleIfOpen() {
  if (!isTreeStyleOpen()) {
    return;
  }

  const treeState = normalizeTreeState(store.treeState);
  const catalog = buildTreeStyleCatalog(treeState);
  const bankedPoints = getTreeBankedPointsByCategory(treeState);
  const bankedCategories = Object.entries(bankedPoints)
    .map(([key, points]) => {
      const category = resolveCategorySnapshot(key);
      return {
        key,
        points,
        label: category.label,
        color: category.color
      };
    })
    .filter((entry) => entry.points > 0)
    .sort((left, right) => right.points - left.points || left.label.localeCompare(right.label));

  treeStyleBody.innerHTML = `
    <section class="tree-style-layout">
      <section class="tree-style-summary">
        <div>
          <p class="eyebrow">Unlocked Looks</p>
          <h3>Spend harvested points on new appearances</h3>
          <p class="sync-status">Owned skins stay available once purchased. Equip any owned skin for each tree part whenever you want.</p>
        </div>
        <div class="tree-style-bank-grid">
          ${bankedCategories.length > 0 ? bankedCategories.map((entry) => `
            <span class="task-chip category-chip tree-style-bank-pill" style="--chip-color: ${escapeHtml(entry.color)}">
              ${escapeHtml(entry.label)} · ${escapeHtml(formatPointsLabel(entry.points))}
            </span>
          `).join("") : '<span class="tree-point-empty">No harvested points banked yet.</span>'}
        </div>
      </section>

      ${catalog.map((part) => {
        const equipped = getTreeSkin(part.equippedSkinId);
        return `
          <section class="tree-style-section">
            <div class="tree-style-part-header">
              <div>
                <p class="eyebrow">${escapeHtml(getTreeStylePartLabel(part.key))}</p>
                <h3>${escapeHtml(getTreeStylePartLabel(part.key))}</h3>
              </div>
              <span class="task-chip">${escapeHtml(equipped?.label || "Default")}</span>
            </div>
            <div class="tree-style-grid">
              ${part.skins.map((skin) => {
                const costCategory = skin.cost ? resolveCategorySnapshot(skin.cost.categoryKey) : null;
                return `
                  <article class="tree-style-card${skin.equipped ? " equipped" : ""}${!skin.owned ? " locked" : ""}">
                    <div class="tree-style-card-header">
                      <strong>${escapeHtml(skin.label)}</strong>
                      <span class="task-chip${skin.equipped ? " importance-high" : ""}">${escapeHtml(
                        skin.equipped
                          ? "Equipped"
                          : skin.owned
                            ? "Owned"
                            : skin.default
                              ? "Default"
                              : "Locked"
                      )}</span>
                    </div>
                    <p>${escapeHtml(skin.description || "Appearance option for this tree part.")}</p>
                    ${skin.cost ? `
                      <div class="tree-style-cost">
                        <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(costCategory?.color || DEFAULT_CATEGORY_COLOR)}">
                          ${escapeHtml(costCategory?.label || skin.cost.categoryKey)}
                        </span>
                        <span>${escapeHtml(formatPointsLabel(skin.cost.points))} required · ${escapeHtml(formatPointsLabel(skin.bankedPoints || 0))} banked</span>
                      </div>
                    ` : '<div class="tree-style-cost"><span class="task-action-note">Always available.</span></div>'}
                    <div class="tree-style-card-actions">
                      ${skin.equipped
                        ? '<span class="task-action-note">Currently active</span>'
                        : skin.owned
                          ? `<button type="button" class="primary-button" data-tree-style-action="equip" data-tree-style-part="${escapeHtml(part.key)}" data-tree-style-skin="${escapeHtml(skin.id)}">Equip</button>`
                          : `<button type="button" class="ghost-button" data-tree-style-action="buy" data-tree-style-part="${escapeHtml(part.key)}" data-tree-style-skin="${escapeHtml(skin.id)}" ${skin.affordable ? "" : "disabled"}>Buy skin</button>`}
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("")}
    </section>
  `;
}

function handleTreeStyleAction(event) {
  const button = event.target.closest("[data-tree-style-action]");
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-tree-style-action");
  const part = button.getAttribute("data-tree-style-part") || "";
  const skinId = button.getAttribute("data-tree-style-skin") || "";
  if (!skinId) {
    return;
  }

  if (action === "buy") {
    const result = purchaseTreeSkin(normalizeTreeState(store.treeState), skinId);
    if (!result.changed) {
      setSyncStatus(result.reason === "insufficient-points" ? "Not enough harvested fruit points for that skin yet." : "That skin is already available.", "error");
      return;
    }
    store.treeState = normalizeTreeState({
      ...result.treeState,
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus(`Unlocked ${result.skin.label}.`, "success");
    return;
  }

  if (action === "equip") {
    const result = equipTreeSkin(normalizeTreeState(store.treeState), part, skinId);
    if (!result.changed) {
      setSyncStatus("That skin is not available to equip.", "error");
      return;
    }
    store.treeState = normalizeTreeState({
      ...result.treeState,
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus(`Equipped ${result.skin.label}.`, "info");
  }
}

function harvestRipeFruit() {
  const treeState = getTreeDisplayState();
  if (treeState.ripePoints <= 0) {
    setSyncStatus("There is no ripe fruit to harvest yet.", "info");
    return;
  }

  const harvestedByCategory = { ...normalizeTreeState(store.treeState).harvestedByCategory };
  for (const category of treeState.categories) {
    if (category.ripePoints <= 0) {
      continue;
    }
    harvestedByCategory[category.key] = (harvestedByCategory[category.key] || 0) + category.ripePoints;
  }

  store.treeState = normalizeTreeState({
    ...store.treeState,
    harvestedByCategory,
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus(`Harvested ${formatPointsLabel(treeState.ripePoints)} from ${treeState.ripeFruitCount} ripe ${treeState.ripeFruitCount === 1 ? "fruit" : "fruits"}.`, "info");
}

function renderCategoryOptions() {
  const currentValue = taskCategoryInput.value || "";
  const categories = getSelectableCategories();
  taskCategoryInput.innerHTML = categories.map((category) => `
    <option value="${category.key}">${escapeHtml(category.label)}</option>
  `).join("");

  if (editState.taskId) {
    const editingTask = store.tasks.find((task) => task.id === editState.taskId);
    if (editingTask?.categoryKey && !categories.some((category) => category.key === editingTask.categoryKey)) {
      const option = document.createElement("option");
      option.value = editingTask.categoryKey;
      option.textContent = `${editingTask.categoryLabel} (inactive)`;
      taskCategoryInput.appendChild(option);
    }
  }

  const hasCurrent = Array.from(taskCategoryInput.options).some((option) => option.value === currentValue);
  taskCategoryInput.value = hasCurrent ? currentValue : (categories[0]?.key || "");
}

function renderCategoryManager() {
  categoryList.innerHTML = getManagedCategoryDefinitions().map((category) => `
    <div class="category-item">
      <div class="category-swatch">
        <input
          type="color"
          value="${category.color}"
          data-category-key="${category.key}"
          aria-label="Color for ${escapeHtml(category.label)}"
        />
      </div>
      <div class="category-copy">
        <strong>${escapeHtml(category.label)}</strong>
        <span>${category.builtin ? "Base category" : "Custom category"}</span>
      </div>
      ${category.builtin
        ? '<span class="task-action-note">Built-in</span>'
        : `<button type="button" class="ghost-button" data-category-action="delete" data-category-key="${category.key}">Delete</button>`}
    </div>
  `).join("");
}

function handleAddCategory() {
  const label = newCategoryNameInput.value.trim();
  if (!label) {
    return;
  }

  const key = slugifyCategoryKey(label);
  const existing = store.categories.find((category) => category.key === key);
  if (existing) {
    existing.label = label;
    existing.color = normalizeCategoryColor(newCategoryColorInput.value);
    existing.active = true;
    existing.updatedAt = Date.now();
  } else {
    store.categories.push(createCategoryDefinition({
      key,
      label,
      color: newCategoryColorInput.value,
      builtin: false,
      active: true,
      updatedAt: Date.now()
    }));
  }

  persistStore();
  newCategoryNameInput.value = "";
  newCategoryColorInput.value = DEFAULT_CATEGORY_COLOR;
  renderAll();
  taskCategoryInput.value = key;
  setSyncStatus(`Added ${label} as a task category.`, "info");
}

function handleCategoryListInput(event) {
  const input = event.target.closest("input[type='color'][data-category-key]");
  if (!input) {
    return;
  }

  const category = store.categories.find((item) => item.key === input.getAttribute("data-category-key"));
  if (!category) {
    return;
  }

  category.color = normalizeCategoryColor(input.value);
  category.updatedAt = Date.now();
  persistStore();
  renderAll();
}

function handleCategoryListClick(event) {
  const button = event.target.closest("[data-category-action='delete']");
  if (!button) {
    return;
  }

  const category = store.categories.find((item) => item.key === button.getAttribute("data-category-key"));
  if (!category || category.builtin) {
    return;
  }

  category.active = false;
  category.updatedAt = Date.now();
  if (taskCategoryInput.value === category.key) {
    taskCategoryInput.value = DEFAULT_CATEGORY_KEY;
  }
  persistStore();
  renderAll();
  setSyncStatus(`Removed ${category.label} from future task choices. Existing tasks keep their category snapshot.`, "info");
}

function renderWidgetOrbit() {
  for (const slot of widgetSlots) {
    const slotIndex = Number(slot.getAttribute("data-slot-index"));
    const widget = store.widgets.find((item) => item.slotIndex === slotIndex);
    slot.classList.remove("empty", "filled");

    if (!widget) {
      slot.classList.add("empty");
      slot.innerHTML = `
        <div class="plus">+</div>
        <strong>Empty slot</strong>
        <p>Add a Lifetree widget here.</p>
        <button type="button" class="ghost-button" data-widget-action="add-widget">Choose widget</button>
      `;
      continue;
    }

    const definition = getWidgetDefinition(widget.type);
    if (definition?.render) {
      slot.classList.add("filled");
      slot.innerHTML = definition.render({
        widget,
        tasks: store.tasks,
        escapeHtml,
        formatDateTime,
        getPendingActionForWidget
      });
      continue;
    }

    slot.classList.add("filled");
    slot.innerHTML = `
      <div class="widget-slot-header">
        <h3>Unknown widget</h3>
        <span class="widget-badge">Stub</span>
      </div>
      <p>This widget type is not rendered yet.</p>
    `;
  }
}

function completeNextTaskFromWidget(widget, mechanism, at = Date.now()) {
  const definition = getWidgetDefinition(widget.type);
  const candidateTasks = store.tasks.filter((task) => !isBlocked(task));
  const nextTask = definition?.findCompletionTask?.({
    tasks: candidateTasks,
    widget,
    mechanism,
    at
  }) || findNextWidgetCompletionTask(
    candidateTasks,
    widget.id,
    mechanism,
    toDateString(new Date(at))
  );
  if (!nextTask) {
    return null;
  }

  nextTask.status = "done";
  pushHistory(nextTask, "completed");
  return nextTask;
}

function stageWidgetAction(widget, actionType, metadata) {
  const key = `widget:${widget.id}:${actionType}`;
  stagePendingAction({
    key,
    widgetId: widget.id,
    description: metadata.description,
    commit: () => metadata.commit(),
    ...metadata
  });
}

function getPendingActionForWidget(widgetId, actionType = "") {
  const prefix = actionType ? `widget:${widgetId}:${actionType}` : `widget:${widgetId}:`;
  for (const [key, value] of pendingActions.entries()) {
    if (key.startsWith(prefix)) {
      return value;
    }
  }
  return null;
}

function getPendingActionForTask(taskId) {
  for (const value of pendingActions.values()) {
    if (value.taskId === taskId) {
      return value;
    }
  }
  return null;
}

function stagePendingAction({ key, taskId = "", widgetId = "", description, commit, ...metadata }) {
  clearPendingAction(key);
  const timerId = window.setTimeout(() => {
    commitPendingAction(key);
  }, ACTION_UNDO_MS);
  pendingActions.set(key, { key, taskId, widgetId, description, commit, timerId, ...metadata });
  renderAll();
  if (description) {
    setSyncStatus(description, "info");
  }
}

function clearPendingAction(key) {
  const existing = pendingActions.get(key);
  if (!existing) {
    return;
  }
  window.clearTimeout(existing.timerId);
  pendingActions.delete(key);
}

function undoPendingAction(key, message = "Undid the pending action.") {
  if (!pendingActions.has(key)) {
    return;
  }
  clearPendingAction(key);
  renderAll();
  setSyncStatus(message, "info");
}

function commitPendingAction(key) {
  const pending = pendingActions.get(key);
  if (!pending) {
    return;
  }

  pendingActions.delete(key);
  window.clearTimeout(pending.timerId);
  const result = pending.commit?.();
  if (!result) {
    renderAll();
    return;
  }

  reconcileRecurringSeries();
  persistStore();
  renderAll();
  if (result.message) {
    setSyncStatus(result.message, result.tone || "info");
  }
}

function applyAutoSkipRules(now = new Date()) {
  let changed = false;

  for (const task of store.tasks) {
    if (shouldSkipTask(task, now)) {
      task.status = "skipped";
      pushHistory(task, "skipped");
      changed = true;
    }
  }

  return changed;
}

function shouldSkipTask(task, now = new Date()) {
  if (shouldAutoSkipTask(task, now)) {
    return true;
  }

  if (task.skipRule?.type === "widget-lockout") {
    return shouldSkipWidgetLockoutTask(task, now);
  }

  return false;
}

function shouldSkipWidgetLockoutTask(task, now = new Date()) {
  const definition = getWidgetDefinition(task.ownerWidgetType);
  return definition?.shouldAutoSkipOwnedTask?.({ task, now, store }) || false;
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
  const visible = getVisibleCards().filter((card) => !card.task.archived);
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
    article.className = `task-card${cardData.status === "done" ? " done" : ""}${cardData.status === "skipped" ? " skipped" : ""}${cardData.task.archived ? " archived" : ""}${blocked ? " blocked" : ""}`;
    article.style.setProperty("--task-category-color", cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR);
    article.innerHTML = `
      <h3>${escapeHtml(cardData.displayName)}</h3>
      <div class="chip-row">
        <span class="task-chip length-${cardData.task.length}">${humanizeLength(cardData.task.length)}</span>
        <span class="task-chip">${escapeHtml(statusLabel(cardData.task.archived ? "archived" : cardData.status))}</span>
        <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR)}">${escapeHtml(cardData.task.categoryLabel || "Uncategorized")}</span>
        <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR)}">${escapeHtml(formatPointsLabel(cardData.task.pointsValue))}</span>
        <span class="task-chip importance-${escapeHtml(cardData.task.importance || DEFAULT_IMPORTANCE)}">${escapeHtml(IMPORTANCE_DEFINITIONS[cardData.task.importance || DEFAULT_IMPORTANCE]?.label || "Medium")}</span>
        ${cardData.task.ownerWidgetType ? `<span class="task-chip">${escapeHtml(ownerWidgetLabel(cardData.task))}</span>` : ""}
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
  const feed = getVisibleHistoryFeed();
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
      <div class="history-entry-copy">
        <strong>${escapeHtml(item.taskName)}</strong>
        <span>${escapeHtml(historyTypeLabel(item.type))}${item.ownerWidgetType ? ` · ${escapeHtml(ownerWidgetLabel(item))}` : ""}</span>
        <span>${escapeHtml(item.scheduledLabel || "No scheduled due time")}</span>
      </div>
      <div class="history-entry-actions">
        <span>${formatDateTime(item.at)}</span>
        ${item.timingLabel ? `<span class="history-indicator ${escapeHtml(historyIndicatorClass(item.timingStatus))}">${escapeHtml(item.timingLabel)}</span>` : ""}
        <button type="button" class="ghost-button" data-history-action="reuse" data-task-id="${item.taskId}">Reuse task</button>
        <button type="button" class="ghost-button" data-history-action="delete" data-task-id="${item.taskId}" data-history-id="${item.historyId}">Delete</button>
      </div>
    `;
    historyList.appendChild(entry);
  }

  historyList.querySelectorAll("[data-history-action]").forEach((button) => {
    button.addEventListener("click", handleHistoryAction);
  });
}

function getVisibleHistoryFeed() {
  const source = historyWidgetFilter.value;
  return buildHistoryFeed(store.tasks, historySort.value, historyFilter.value).filter((item) => {
    if (source === "manual") {
      return !item.ownerWidgetType;
    }
    if (source === "all") {
      return true;
    }
    return item.ownerWidgetType === source;
  });
}

function renderHistorySourceOptions() {
  const currentValue = historyWidgetFilter.value || "all";
  const widgetTypes = Array.from(new Set(store.tasks.map((task) => task.ownerWidgetType).filter(Boolean))).sort();
  historyWidgetFilter.innerHTML = `
    <option value="all">All sources</option>
    <option value="manual">Manual tasks</option>
    ${widgetTypes.map((type) => `<option value="${type}">${escapeHtml(ownerWidgetLabel({ ownerWidgetType: type }))}</option>`).join("")}
  `;
  historyWidgetFilter.value = widgetTypes.includes(currentValue) || currentValue === "all" || currentValue === "manual"
    ? currentValue
    : "all";
}

function handleHistoryAction(event) {
  const taskId = event.currentTarget.getAttribute("data-task-id");
  const action = event.currentTarget.getAttribute("data-history-action");
  const task = store.tasks.find((item) => item.id === taskId);
  if (action === "reuse" && !task) {
    return;
  }

  if (action === "reuse") {
    populateComposerFromHistory(task);
    setSyncStatus(`Loaded ${task.name} into the new task form.`, "info");
    return;
  }

  if (action === "delete") {
    const historyId = event.currentTarget.getAttribute("data-history-id");
    if (!historyId) {
      return;
    }
    const changed = removeHistoryEntriesById(new Set([historyId]));
    if (!changed) {
      setSyncStatus("That history record could not be found.", "error");
      return;
    }
    pruneHistoryOnlyTasksWithoutHistory();
    persistStore();
    renderAll();
    setSyncStatus("Deleted that history record.", "info");
  }
}

function clearSelectedHistorySource() {
  const source = historyWidgetFilter.value;
  const historyIds = collectHistoryIdsForTasks((task) => matchesHistorySource(task, source));
  const changed = removeHistoryEntriesById(historyIds);

  if (!changed) {
    setSyncStatus("No matching history records were found to clear.", "info");
    return;
  }

  pruneHistoryOnlyTasksWithoutHistory();
  persistStore();
  renderAll();
  setSyncStatus(source === "all" ? "Cleared all visible history sources." : "Cleared history for the selected source.", "info");
}

function clearAllHistory() {
  const historyIds = collectHistoryIdsForTasks(() => true);
  const changed = removeHistoryEntriesById(historyIds);

  if (!changed) {
    setSyncStatus("There was no history to clear.", "info");
    return;
  }

  pruneHistoryOnlyTasksWithoutHistory();
  persistStore();
  renderAll();
  setSyncStatus("Cleared all task history.", "info");
}

function collectHistoryIdsForTasks(predicate) {
  const historyIds = new Set();

  for (const task of store.tasks) {
    if (!predicate(task)) {
      continue;
    }
    for (const item of Array.isArray(task.history) ? task.history : []) {
      if (item?.type === "edited" || !item?.id) {
        continue;
      }
      historyIds.add(item.id);
    }
  }

  return historyIds;
}

function matchesHistorySource(task, source) {
  if (source === "manual") {
    return !task.ownerWidgetType;
  }
  if (source === "all") {
    return true;
  }
  return task.ownerWidgetType === source;
}

function removeHistoryEntriesById(historyIds) {
  if (!historyIds || historyIds.size === 0) {
    return false;
  }

  let changed = false;
  const recurringTemplatesToAdvance = new Set();
  const removedTaskIds = new Set();

  for (const task of store.tasks) {
    const currentHistory = Array.isArray(task.history) ? task.history : [];
    const nextHistory = currentHistory.filter((item) => !historyIds.has(item.id));
    if (nextHistory.length !== currentHistory.length) {
      const wasClosed = task.status !== "open";
      task.history = nextHistory;
      changed = true;

      if ((Array.isArray(task.history) ? task.history.length : 0) === 0 && wasClosed) {
        if (isAdvanceableRecurringTemplate(task)) {
          rememberDeletedTaskKey(task);
          recurringTemplatesToAdvance.add(task.id);
          continue;
        }

        revokePointsForTask(task);
        if (task.recurrence?.type !== "archived-series") {
          rememberDeletedTask(task);
        }
        removedTaskIds.add(task.id);
        continue;
      }

      if (syncTaskStatusWithLifecycle(task)) {
        changed = true;
      }

      if ((Array.isArray(task.history) ? task.history.length : 0) > 0 || task.status === "open") {
        continue;
      }

      revokePointsForTask(task);
      if (task.recurrence?.type !== "archived-series") {
        rememberDeletedTask(task);
      }
      removedTaskIds.add(task.id);
    }
  }

  if (removedTaskIds.size > 0) {
    store.tasks = store.tasks.filter((task) => !removedTaskIds.has(task.id));
    for (const task of store.tasks) {
      task.dependencies = task.dependencies.filter((dependencyId) => !removedTaskIds.has(dependencyId));
    }
  }

  for (const templateId of recurringTemplatesToAdvance) {
    const template = store.tasks.find((task) => task.id === templateId);
    if (!template) {
      continue;
    }
    if (advanceRecurringTemplateAfterHistoryRemoval(template)) {
      changed = true;
    }
  }

  return changed;
}

function repairTaskStatusFromHistory() {
  let changed = false;

  for (const task of store.tasks) {
    const latest = getLatestLifecycleEntry(task);
    if (!latest) {
      continue;
    }

    const nextStatus = latest.type === "completed"
      ? "done"
      : latest.type === "skipped"
        ? "skipped"
        : "open";

    if (task.status !== nextStatus) {
      task.status = nextStatus;
      task.historyOnly = false;
      task.hideAfterAt = 0;
      changed = true;
    }

    const hadPoints = Boolean(task.pointsEntryId);
    syncTaskPointAward(task);
    if (hadPoints !== Boolean(task.pointsEntryId)) {
      changed = true;
    }
  }

  return changed;
}

function syncTaskStatusWithLifecycle(task) {
  const latest = getLatestLifecycleEntry(task);
  const nextStatus = latest
    ? (latest.type === "completed" ? "done" : latest.type === "skipped" ? "skipped" : "open")
    : "open";

  let changed = false;
  if (task.status !== nextStatus) {
    task.status = nextStatus;
    task.historyOnly = false;
    task.hideAfterAt = 0;
    changed = true;
  }

  const hadPoints = Boolean(task.pointsEntryId);
  syncTaskPointAward(task);
  if (hadPoints !== Boolean(task.pointsEntryId)) {
    changed = true;
  }

  return changed;
}

function isAdvanceableRecurringTemplate(task) {
  return Boolean(
    task
    && !task.templateId
    && task.recurrence
    && task.recurrence.type !== "none"
    && task.recurrence.type !== "generated"
    && task.recurrence.type !== "archived-series"
  );
}

function advanceRecurringTemplateAfterHistoryRemoval(task) {
  const currentStart = task.startDate || task.dueDate || "";
  const currentDue = task.dueDate || task.startDate || "";
  const nextStart = currentStart ? computeOccurrenceDate(currentStart, task.recurrence, 1) : "";
  const nextDue = currentDue ? computeOccurrenceDate(currentDue, task.recurrence, 1) : "";

  if (!nextStart && !nextDue) {
    revokePointsForTask(task);
    rememberDeletedSeries(task.id);
    store.tasks = store.tasks.filter((item) => item.id !== task.id && item.templateId !== task.id);
    for (const item of store.tasks) {
      item.dependencies = item.dependencies.filter((dependencyId) => dependencyId !== task.id);
    }
    return true;
  }

  revokePointsForTask(task);
  task.startDate = nextStart || currentStart;
  task.dueDate = nextDue || nextStart || currentDue;
  task.notBeforeAt = deriveRecurringInstanceNotBeforeAt(task.recurrence, task.dueDate || task.startDate);
  task.status = "open";
  task.archived = false;
  task.historyOnly = false;
  task.hideAfterAt = 0;
  task.history = [];
  regenerateSeries(task.id, { preserveClosed: true });
  return true;
}

function getVisibleCards() {
  const cards = [];
  for (const task of store.tasks) {
    if (task.templateId || task.historyOnly) {
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
    if (status === "archived") {
      if (!card.task.archived) {
        return false;
      }
    } else if (card.task.archived) {
      return false;
    }
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
    if (status === "archived" && !card.task.archived) {
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
    return `${card.displayName} ${card.task.details} ${card.task.categoryLabel} ${card.task.importance} ${ownerWidgetLabel(card.task)}`.toLowerCase().includes(query);
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
  const pendingAction = getPendingActionForTask(id);

  if (action === "undo") {
    const pendingKey = event.currentTarget.getAttribute("data-pending-key");
    if (pendingKey) {
      undoPendingAction(pendingKey, "Undid the pending task action.");
    }
    return;
  }

  if (pendingAction) {
    return;
  }

  if (action !== "delete") {
    clearPendingDelete();
  }

  if (action === "toggle") {
    if (task.status === "open" && isBlocked(task)) {
      setSyncStatus(describeBlockedTask(task), "error");
      return;
    }
    if (task.status === "done") {
      markTaskOpen(task);
    } else {
      stagePendingAction({
        key: `complete:${task.id}`,
        taskId: task.id,
        description: `Pending completion for ${task.name}. Click undo within 5 seconds to cancel.`,
        commit: () => {
          const nextTask = store.tasks.find((item) => item.id === task.id);
          if (!nextTask || nextTask.archived || nextTask.status !== "open" || isBlocked(nextTask)) {
            return false;
          }
          markTaskCompleted(nextTask);
          return { message: `Completed ${nextTask.name}.`, tone: "info" };
        }
      });
      return;
    }
  }

  if (action === "skip") {
    stagePendingAction({
      key: `skip:${task.id}`,
      taskId: task.id,
      description: `Pending skip for ${task.name}. Click undo within 5 seconds to cancel.`,
      commit: () => {
        const nextTask = store.tasks.find((item) => item.id === task.id);
        if (!nextTask || nextTask.archived || nextTask.status !== "open") {
          return false;
        }
        markTaskSkipped(nextTask);
        return { message: `Skipped ${nextTask.name}.`, tone: "info" };
      }
    });
    return;
  }

  if (action === "delete") {
    if (isWidgetProtectedTask(task)) {
      setSyncStatus("That task belongs to an active widget. Remove the widget to remove its protected tasks.", "error");
      return;
    }
    if (!isDeletePending(task.id, scope)) {
      setPendingDelete(task.id, scope);
      renderTaskGrid();
      setSyncStatus("Delete is armed for this card. Click delete again on the card to confirm.", "info");
      return;
    }
    stagePendingAction({
      key: `delete:${scope}:${task.id}`,
      taskId: task.id,
      description: `Pending delete for ${task.name}. Click undo within 5 seconds to cancel.`,
      commit: () => {
        const nextTask = store.tasks.find((item) => item.id === task.id);
        if (!nextTask) {
          return false;
        }
        deleteTask(nextTask, scope);
        clearPendingDelete();
        return {
          message: scope === "series" ? `Deleted the ${nextTask.name} series.` : `Deleted ${nextTask.name}.`,
          tone: "info"
        };
      }
    });
    clearPendingDelete();
    renderAll();
    return;
  }

  if (action === "archive") {
    task.archived = true;
  }

  if (action === "restore") {
    task.archived = false;
  }

  if (action === "edit") {
    beginEdit(task, scope);
    return;
  }

  reconcileRecurringSeries();
  persistStore();
  renderAll();
  setSyncStatus("Saved locally. Sync to Drive when ready.", "info");
}

function isWidgetProtectedTask(task) {
  if (!task.ownerWidgetId || !task.ownerWidgetType) {
    return false;
  }
  return store.widgets.some((widget) => widget.id === task.ownerWidgetId && widget.type === task.ownerWidgetType);
}

function isDeletePending(taskId, scope) {
  return pendingDeleteState.taskId === taskId && pendingDeleteState.scope === scope;
}

function setPendingDelete(taskId, scope) {
  pendingDeleteState.taskId = taskId;
  pendingDeleteState.scope = scope;
}

function clearPendingDelete() {
  pendingDeleteState.taskId = "";
  pendingDeleteState.scope = "single";
}

function markTaskCompleted(task, at = Date.now()) {
  task.status = "done";
  task.historyOnly = false;
  task.hideAfterAt = isAutoDismissTask(task) ? at + COMPLETED_ONE_OFF_DISMISS_MS : 0;
  awardPointsForTask(task, at);
  pushHistory(task, "completed", at);
}

function markTaskSkipped(task, at = Date.now()) {
  task.status = "skipped";
  task.historyOnly = false;
  task.hideAfterAt = 0;
  pushHistory(task, "skipped", at);
}

function markTaskOpen(task, at = Date.now()) {
  task.status = "open";
  task.historyOnly = false;
  task.hideAfterAt = 0;
  revokePointsForTask(task);
  pushHistory(task, "reopened", at);
}

function isAutoDismissTask(task) {
  return !task.templateId && task.recurrence.type === "none" && !task.ownerWidgetType;
}

function applyCompletedTaskHistoryOnly(now = Date.now()) {
  let changed = false;
  for (const task of store.tasks) {
    if (!task.historyOnly && task.status === "done" && isAutoDismissTask(task) && task.hideAfterAt && task.hideAfterAt <= now) {
      task.historyOnly = true;
      task.hideAfterAt = 0;
      changed = true;
    }
  }
  return changed;
}

function populateComposerFromHistory(task) {
  clearPendingDelete();
  editState.taskId = "";
  editState.scope = "single";
  form.reset();
  taskNameInput.value = task.name;
  taskDetailsInput.value = task.details || "";
  startDateInput.value = "";
  dueDateInput.value = "";
  timeOfDayInput.value = "";
  lateGraceMinutesInput.value = String(task.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES);
  setTaskPointsInput(task.pointsValue ?? defaultPointsForLength(task.length));
  taskLengthInput.value = task.length;
  taskCategoryInput.value = task.categoryKey || DEFAULT_CATEGORY_KEY;
  taskImportanceInput.value = normalizeImportance(task.importance || DEFAULT_IMPORTANCE);
  skipRuleTypeInput.value = "none";
  skipGraceMinutesInput.value = 15;
  recurrenceType.value = "none";
  recurrenceForeverInput.checked = false;
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = false;
  });
  updateSkipVisibility();
  updateRecurrenceVisibility();
  syncEditPanel();
  taskNameInput.focus();
}

function pruneHistoryOnlyTasksWithoutHistory() {
  store.tasks = store.tasks.filter((task) => !task.historyOnly || (Array.isArray(task.history) && task.history.length > 0));
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
      upsertArchivedSeriesRecord(template);
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

  rememberDeletedTask(task);
  store.tasks = store.tasks.filter((item) => item.id !== task.id);
  for (const item of store.tasks) {
    item.dependencies = item.dependencies.filter((dependencyId) => dependencyId !== task.id);
  }
}

function retireWidgetOwnedSeries(template) {
  if (!template) {
    return;
  }

  const removedIds = new Set([template.id]);
  const templateNeedsArchive = template.status !== "open" || (template.history?.length || 0) > 0;
  if (templateNeedsArchive) {
    upsertArchivedSeriesRecord(template);
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
  lateGraceMinutesInput.value = String(target.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES);
  setTaskPointsInput(target.pointsValue ?? defaultPointsForLength(target.length));
  taskLengthInput.value = target.length;
  renderCategoryOptions();
  taskCategoryInput.value = target.categoryKey || DEFAULT_CATEGORY_KEY;
  taskImportanceInput.value = normalizeImportance(target.importance || DEFAULT_IMPORTANCE);
  const dependencySet = new Set(target.dependencies || []);
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = dependencySet.has(option.value);
  });
  applySkipRuleToForm(target.skipRule);
  applyRecurrenceToForm(scope === "series" ? target.recurrence : { type: "none" });
  updateSkipVisibility();
  updateRecurrenceVisibility();
  syncEditPanel();
}

function applySkipRuleToForm(skipRule) {
  skipRuleTypeInput.value = skipRule?.type === "widget-lockout" ? "none" : (skipRule?.type || "none");
  skipGraceMinutesInput.value = skipRule?.graceMinutes ?? 15;
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
  lateGraceMinutesInput.value = String(DEFAULT_LATE_GRACE_MINUTES);
  setTaskPointsInput(defaultPointsForLength(taskLengthInput.value || "medium"));
  taskCategoryInput.value = DEFAULT_CATEGORY_KEY;
  taskImportanceInput.value = DEFAULT_IMPORTANCE;
  newCategoryColorInput.value = DEFAULT_CATEGORY_COLOR;
  updateRecurrenceVisibility();
  updateSkipVisibility();
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
  if (status === "archived") {
    return "Archived";
  }
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
  const protectedTask = isWidgetProtectedTask(task);
  const deleteScope = cardData.kind === "series" ? "series" : "single";
  const deletePending = !protectedTask && isDeletePending(task.id, deleteScope);
  const pendingAction = getPendingActionForTask(task.id);
  if (pendingAction) {
    return `
      <span class="task-action-note danger">${escapeHtml(pendingAction.description || "Pending action.")}</span>
      <button type="button" class="task-action" data-action="undo" data-id="${task.id}" data-pending-key="${pendingAction.key}">Undo</button>
    `;
  }
  if (!task.archived) {
    buttons.push(`<button type="button" class="task-action" data-action="toggle" data-id="${task.id}">${task.status === "done" ? "Mark open" : "Mark done"}</button>`);
  }
  if (!task.archived && task.status === "open") {
    buttons.push(`<button type="button" class="task-action" data-action="skip" data-id="${task.id}">Skip</button>`);
  }
  if (!task.archived) {
    buttons.push(`<button type="button" class="task-action" data-action="edit" data-id="${task.id}" data-scope="single">Edit task</button>`);
  }
  if (task.archived) {
    buttons.push(`<button type="button" class="task-action" data-action="restore" data-id="${task.id}">Restore</button>`);
  } else if (task.status !== "open") {
    buttons.push(`<button type="button" class="task-action" data-action="archive" data-id="${task.id}">Archive</button>`);
  }
  if (cardData.kind === "series") {
    if (!task.archived) {
      buttons.push(`<button type="button" class="task-action" data-action="edit" data-id="${task.id}" data-scope="series">Edit series</button>`);
    }
    if (!protectedTask) {
      buttons.push(`<button type="button" class="task-action" data-action="delete" data-id="${task.id}" data-scope="series">${deletePending ? "Confirm delete series" : "Delete series"}</button>`);
    }
  } else {
    if (!protectedTask) {
      buttons.push(`<button type="button" class="task-action" data-action="delete" data-id="${task.id}">${deletePending ? "Confirm delete" : "Delete"}</button>`);
    }
  }
  const notes = [];
  if (protectedTask) {
    notes.push('<span class="task-action-note">Protected by its active widget. Remove the widget to remove this task.</span>');
  }
  if (deletePending) {
    notes.push('<span class="task-action-note danger">Delete is armed. Click the delete button again to confirm.</span>');
  }
  return `${notes.join("")}${buttons.join("")}`;
}

function pushHistory(task, type, at = Date.now()) {
  if (!Array.isArray(task.history)) {
    task.history = [];
  }
  const latest = task.history[task.history.length - 1] || null;
  if (latest?.type === type) {
    task.history[task.history.length - 1] = {
      ...latest,
      at
    };
    return;
  }
  task.history.push({ id: createId(), type, at });
}

function applyAutoArchiving() {
  const visibleHistoryEntries = buildHistoryFeed(store.tasks, "newest", "all").filter((item) => !item.archived);
  if (visibleHistoryEntries.length <= MAX_VISIBLE_HISTORY_ENTRIES) {
    return false;
  }

  const candidates = store.tasks
    .filter((task) => !task.archived && task.status !== "open" && Array.isArray(task.history) && task.history.length > 0)
    .sort((left, right) => latestHistoryAt(left) - latestHistoryAt(right));

  let remaining = visibleHistoryEntries.length;
  let changed = false;

  for (const task of candidates) {
    if (remaining <= MAX_VISIBLE_HISTORY_ENTRIES) {
      break;
    }
    task.archived = true;
    remaining -= task.history.length;
    changed = true;
  }

  return changed;
}

function latestHistoryAt(task) {
  const history = Array.isArray(task.history) ? task.history : [];
  if (history.length === 0) {
    return task.createdAt || 0;
  }
  return history.reduce((latest, item) => Math.max(latest, item.at || 0), 0);
}

function historyTypeLabel(type) {
  if (type === "completed") return "Marked completed";
  if (type === "skipped") return "Skipped";
  if (type === "edited") return "Edited";
  if (type === "reopened") return "Reopened";
  return type;
}

function historyIndicatorClass(status) {
  if (status === "on-time") {
    return "on-time";
  }
  if (status === "late" || status === "missed") {
    return "late";
  }
  return "neutral";
}

function isBlocked(task) {
  if (isTaskNotYetAvailable(task)) {
    return true;
  }
  if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) {
    return false;
  }
  return task.dependencies.some((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    if (!dependency) {
      return false;
    }
    const definition = getWidgetDefinition(task.ownerWidgetType);
    const satisfied = definition?.isDependencySatisfied?.({ task, dependency });
    if (typeof satisfied === "boolean") {
      return !satisfied;
    }
    return dependency.status !== "done";
  });
}

function renderDependencies(task) {
  const availabilityLabel = formatTaskAvailability(task);
  if ((!task.dependencies || task.dependencies.length === 0) && !availabilityLabel) {
    return "No prerequisite tasks.";
  }
  if ((!task.dependencies || task.dependencies.length === 0) && availabilityLabel) {
    return `Not before ${availabilityLabel}.`;
  }
  const names = task.dependencies.map((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    return dependency ? dependency.name : "missing task";
  });
  return availabilityLabel
    ? `Depends on: ${escapeHtml(names.join(", "))}. Not before ${availabilityLabel}.`
    : `Depends on: ${escapeHtml(names.join(", "))}`;
}

function describeCompletionGate(task) {
  const availabilityLabel = formatTaskAvailability(task);
  if (availabilityLabel) {
    return `Not available until ${availabilityLabel}.`;
  }
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

function isTaskNotYetAvailable(task, now = Date.now()) {
  return typeof task?.notBeforeAt === "number" && task.notBeforeAt > 0 && now < task.notBeforeAt;
}

function formatTaskAvailability(task) {
  if (!isTaskNotYetAvailable(task)) {
    return "";
  }
  return formatDateTime(task.notBeforeAt, { includePhase: true });
}

function describeBlockedTask(task) {
  const availabilityLabel = formatTaskAvailability(task);
  if (availabilityLabel) {
    return `That task is not available until ${availabilityLabel}.`;
  }
  return "That task is blocked by unfinished prerequisites.";
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

function updateSkipVisibility() {
  const value = skipRuleTypeInput.value;
  const editingTask = editState.taskId ? store.tasks.find((task) => task.id === editState.taskId) : null;
  const widgetManaged = editingTask?.skipRule?.type === "widget-lockout";
  skipGraceRow.classList.toggle("hidden", value !== "after-due-minutes");
  skipGraceMinutesInput.disabled = value !== "after-due-minutes" || widgetManaged;
  skipRuleTypeInput.disabled = widgetManaged;
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
    version: 12,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
    driveFileId: typeof input.driveFileId === "string" ? input.driveFileId : "",
    profile: normalizeProfile(input.profile),
    tasks,
    pointLedger: normalizePointLedger(input.pointLedger),
    treeState: normalizeTreeState(input.treeState),
    devSettings: normalizeDevSettings(input.devSettings),
    categories: normalizeCategoryDefinitions(input.categories),
    widgets: normalizeWidgets(input.widgets),
    retiredWidgets: normalizeWidgets(input.retiredWidgets),
    deletedTaskIds: normalizeDeletedIds(input.deletedTaskIds),
    deletedTaskKeys: normalizeDeletedIds(input.deletedTaskKeys),
    deletedSeriesIds: normalizeDeletedIds(input.deletedSeriesIds)
  };
}

function normalizeTask(task) {
  const fallbackCategory = BASE_CATEGORIES.find((category) => category.key === (typeof task.categoryKey === "string" ? task.categoryKey : DEFAULT_CATEGORY_KEY))
    || BASE_CATEGORIES.find((category) => category.key === DEFAULT_CATEGORY_KEY)
    || BASE_CATEGORIES[0];
  return {
    id: typeof task.id === "string" ? task.id : createId(),
    templateId: typeof task.templateId === "string" ? task.templateId : "",
    occurrenceIndex: typeof task.occurrenceIndex === "number" ? task.occurrenceIndex : 0,
    name: typeof task.name === "string" ? task.name : "Untitled task",
    details: typeof task.details === "string" ? task.details : "",
    startDate: typeof task.startDate === "string" ? task.startDate : "",
    dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
    timeOfDay: typeof task.timeOfDay === "string" ? task.timeOfDay : "",
    lateGraceMinutes: parsePositiveOrZeroNumber(task.lateGraceMinutes) ?? DEFAULT_LATE_GRACE_MINUTES,
    notBeforeAt: typeof task.notBeforeAt === "number"
      ? task.notBeforeAt
      : deriveTaskNotBeforeAt({
        recurrence: normalizeRecurrence(task.recurrence),
        startDate: typeof task.startDate === "string" ? task.startDate : "",
        dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
        originalTask: task
      }),
    length: LENGTH_ORDER[task.length] ? task.length : "medium",
    pointsValue: normalizeTaskPoints(task.pointsValue, defaultPointsForLength(task.length)),
    pointsEntryId: typeof task.pointsEntryId === "string" ? task.pointsEntryId : "",
    categoryKey: typeof task.categoryKey === "string" ? task.categoryKey : DEFAULT_CATEGORY_KEY,
    categoryLabel: typeof task.categoryLabel === "string" ? task.categoryLabel : fallbackCategory.label,
    categoryColor: normalizeCategoryColor(task.categoryColor || fallbackCategory.color),
    importance: normalizeImportance(task.importance),
    status: normalizeStatus(task),
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    ownerWidgetId: typeof task.ownerWidgetId === "string" ? task.ownerWidgetId : "",
    ownerWidgetType: typeof task.ownerWidgetType === "string" ? task.ownerWidgetType : "",
    ownerTaskKey: typeof task.ownerTaskKey === "string" ? task.ownerTaskKey : "",
    widgetCompletion: normalizeWidgetCompletion(task.widgetCompletion),
    skipRule: normalizeSkipRule(task.skipRule),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter((id) => typeof id === "string") : [],
    recurrence: normalizeRecurrence(task.recurrence),
    archived: task.archived === true,
    historyOnly: task.historyOnly === true,
    hideAfterAt: typeof task.hideAfterAt === "number" ? task.hideAfterAt : 0,
    seriesOriginId: typeof task.seriesOriginId === "string" ? task.seriesOriginId : "",
    history: Array.isArray(task.history)
      ? compactTaskHistory(task.history
        .filter((item) => typeof item?.type === "string" && typeof item?.at === "number")
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id ? item.id : `${typeof task.id === "string" ? task.id : "task"}-history-${index}-${item.at}`,
          type: item.type,
          at: item.at
        })))
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
    sourceType: typeof recurrence.sourceType === "string" ? recurrence.sourceType : "",
    endDate: typeof recurrence.endDate === "string" ? recurrence.endDate : "",
    count: typeof recurrence.count === "number" ? recurrence.count : null,
    forever: recurrence.forever === true
  };
}

function normalizeCategoryDefinitions(value) {
  const mergedByKey = new Map(BASE_CATEGORIES.map((category) => [category.key, createCategoryDefinition(category)]));

  if (Array.isArray(value)) {
    for (const category of value) {
      const normalized = createCategoryDefinition(category);
      if (!normalized) {
        continue;
      }
      const existing = mergedByKey.get(normalized.key);
      if (!existing) {
        mergedByKey.set(normalized.key, normalized);
        continue;
      }
      mergedByKey.set(normalized.key, choosePreferredCategoryDefinition(normalized, existing));
    }
  }

  return Array.from(mergedByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function createCategoryDefinition(category) {
  const key = slugifyCategoryKey(category?.key || category?.label || "");
  if (!key) {
    return null;
  }

  const baseCategory = BASE_CATEGORIES.find((item) => item.key === key);
  return {
    key,
    label: typeof category?.label === "string" && category.label.trim() ? category.label.trim() : (baseCategory?.label || "Category"),
    color: normalizeCategoryColor(category?.color || baseCategory?.color || DEFAULT_CATEGORY_COLOR),
    builtin: category?.builtin === true || Boolean(baseCategory?.builtin),
    active: category?.active !== false,
    updatedAt: typeof category?.updatedAt === "number" ? category.updatedAt : 0
  };
}

function mergeCategoryDefinitions(localCategories = [], remoteCategories = []) {
  const mergedByKey = new Map();

  for (const category of normalizeCategoryDefinitions(remoteCategories)) {
    mergedByKey.set(category.key, category);
  }
  for (const category of normalizeCategoryDefinitions(localCategories)) {
    const existing = mergedByKey.get(category.key);
    if (!existing) {
      mergedByKey.set(category.key, category);
      continue;
    }
    mergedByKey.set(category.key, choosePreferredCategoryDefinition(category, existing));
  }

  return Array.from(mergedByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function choosePreferredCategoryDefinition(localCategory, remoteCategory) {
  return (localCategory.updatedAt || 0) >= (remoteCategory.updatedAt || 0) ? localCategory : remoteCategory;
}

function getVisibleCategoryDefinitions() {
  return getAllCategoryDefinitions().filter((category) => category.active !== false);
}

function getSelectableCategories() {
  return getVisibleCategoryDefinitions();
}

function getManagedCategoryDefinitions() {
  return normalizeCategoryDefinitions(store.categories).filter((category) => category.active !== false);
}

function getAllCategoryDefinitions() {
  const mergedByKey = new Map();

  for (const category of normalizeCategoryDefinitions(store.categories)) {
    mergedByKey.set(category.key, category);
  }
  for (const category of listWidgetCategories(store.widgets)) {
    const normalized = createCategoryDefinition(category);
    if (normalized && !mergedByKey.has(normalized.key)) {
      mergedByKey.set(normalized.key, normalized);
    }
  }

  return Array.from(mergedByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function resolveCategorySnapshot(categoryKey, originalTask = null) {
  const selectedKey = slugifyCategoryKey(categoryKey || originalTask?.categoryKey || DEFAULT_CATEGORY_KEY);
  const currentCategory = getAllCategoryDefinitions().find((category) => category.key === selectedKey);
  if (currentCategory) {
    return {
      key: currentCategory.key,
      label: currentCategory.label,
      color: currentCategory.color
    };
  }

  if (originalTask?.categoryKey) {
    return {
      key: originalTask.categoryKey,
      label: originalTask.categoryLabel || "Category",
      color: normalizeCategoryColor(originalTask.categoryColor)
    };
  }

  const fallback = BASE_CATEGORIES.find((category) => category.key === DEFAULT_CATEGORY_KEY) || BASE_CATEGORIES[0];
  return {
    key: fallback.key,
    label: fallback.label,
    color: fallback.color
  };
}

function normalizeCategoryColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_CATEGORY_COLOR;
}

function slugifyCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeImportance(value) {
  return value === "low" || value === "high" ? value : DEFAULT_IMPORTANCE;
}

function persistStore({ touchUpdatedAt = true } = {}) {
  if (touchUpdatedAt) {
    store.updatedAt = Date.now();
  }
  persistLocalStore(store);
}

function persistLocalStore(nextStore) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(nextStore));
}

function createEmptyStore() {
  return {
    version: 12,
    updatedAt: Date.now(),
    driveFileId: "",
    profile: normalizeProfile({}),
    tasks: [],
    pointLedger: [],
    treeState: normalizeTreeState({}),
    devSettings: normalizeDevSettings({}),
    categories: normalizeCategoryDefinitions([]),
    widgets: [],
    retiredWidgets: [],
    deletedTaskIds: [],
    deletedTaskKeys: [],
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

function mergeStores(localStore, remoteStore) {
  const deletedTaskIds = unionIds(localStore.deletedTaskIds, remoteStore.deletedTaskIds);
  const deletedTaskKeys = unionIds(localStore.deletedTaskKeys, remoteStore.deletedTaskKeys);
  const deletedSeriesIds = unionIds(localStore.deletedSeriesIds, remoteStore.deletedSeriesIds);
  const mergedCategories = mergeCategoryDefinitions(localStore.categories, remoteStore.categories);
  const mergedWidgets = mergeWidgetLists(localStore.widgets, remoteStore.widgets, widgetRegistryHelpers(), MAX_WIDGETS);
  const mergedById = new Map();
  for (const task of filterDeletedTasks(remoteStore.tasks, deletedTaskIds, deletedTaskKeys, deletedSeriesIds)) {
    mergedById.set(task.id, task);
  }
  for (const task of filterDeletedTasks(localStore.tasks, deletedTaskIds, deletedTaskKeys, deletedSeriesIds)) {
    const existing = mergedById.get(task.id);
    if (!existing) {
      mergedById.set(task.id, task);
      continue;
    }
    mergedById.set(task.id, choosePreferredTask(task, existing, localStore.updatedAt, remoteStore.updatedAt));
  }
  return {
    version: 12,
    updatedAt: Math.max(localStore.updatedAt || 0, remoteStore.updatedAt || 0),
    driveFileId: remoteStore.driveFileId || localStore.driveFileId || "",
    profile: choosePreferredProfile(localStore.profile, remoteStore.profile),
    tasks: Array.from(mergedById.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TASKS),
    pointLedger: mergePointLedger(localStore.pointLedger, remoteStore.pointLedger),
    treeState: choosePreferredTreeState(localStore.treeState, remoteStore.treeState),
    devSettings: (localStore.updatedAt || 0) >= (remoteStore.updatedAt || 0)
      ? normalizeDevSettings(localStore.devSettings)
      : normalizeDevSettings(remoteStore.devSettings),
    categories: mergedCategories,
    widgets: mergedWidgets,
    retiredWidgets: mergeRetiredWidgets(localStore.retiredWidgets, remoteStore.retiredWidgets, mergedWidgets),
    deletedTaskIds,
    deletedTaskKeys,
    deletedSeriesIds
  };
}

function computeStoreFingerprint(sourceStore) {
  const normalized = normalizeStore(sourceStore || createEmptyStore());
  const comparable = {
    profile: {
      displayName: normalizeProfile(normalized.profile).displayName,
      autosaveEnabled: normalizeProfile(normalized.profile).autosaveEnabled,
      autosaveIntervalMinutes: normalizeProfile(normalized.profile).autosaveIntervalMinutes
    },
    tasks: normalized.tasks
      .map((task) => ({
        id: task.id,
        templateId: task.templateId,
        occurrenceIndex: task.occurrenceIndex,
        name: task.name,
        details: task.details,
        startDate: task.startDate,
        dueDate: task.dueDate,
        timeOfDay: task.timeOfDay,
        lateGraceMinutes: task.lateGraceMinutes,
        notBeforeAt: task.notBeforeAt || 0,
        pointsValue: task.pointsValue,
        pointsEntryId: task.pointsEntryId || "",
        length: task.length,
        categoryKey: task.categoryKey,
        categoryLabel: task.categoryLabel,
        categoryColor: task.categoryColor,
        importance: task.importance,
        status: task.status,
        createdAt: task.createdAt,
        ownerWidgetId: task.ownerWidgetId,
        ownerWidgetType: task.ownerWidgetType,
        ownerTaskKey: task.ownerTaskKey,
        widgetCompletion: {
          mechanism: task.widgetCompletion?.mechanism || "",
          lockout: task.widgetCompletion?.lockout || "none"
        },
        skipRule: normalizeSkipRule(task.skipRule),
        dependencies: [...(task.dependencies || [])].sort(),
        recurrence: normalizeRecurrence(task.recurrence),
        archived: task.archived === true,
        historyOnly: task.historyOnly === true,
        hideAfterAt: task.hideAfterAt || 0,
        seriesOriginId: task.seriesOriginId || "",
        history: [...(task.history || [])]
          .map((item) => ({
            id: item.id,
            type: item.type,
            at: item.at
          }))
          .sort((left, right) => {
            if (left.at !== right.at) {
              return left.at - right.at;
            }
            return left.id.localeCompare(right.id);
          })
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    pointLedger: normalizePointLedger(normalized.pointLedger)
      .map((entry) => sortObjectKeys(entry))
      .sort((left, right) => left.id.localeCompare(right.id)),
    treeState: sortObjectKeys(normalizeTreeState(normalized.treeState)),
    devSettings: sortObjectKeys(normalizeDevSettings(normalized.devSettings)),
    categories: normalizeCategoryDefinitions(normalized.categories)
      .map((category) => ({
        active: category.active !== false,
        builtin: category.builtin === true,
        color: category.color,
        key: category.key,
        label: category.label
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    widgets: normalizeWidgets(normalized.widgets)
      .map((widget) => sortObjectKeys(widget))
      .sort(compareWidgetFingerprints),
    retiredWidgets: normalizeWidgets(normalized.retiredWidgets)
      .map((widget) => sortObjectKeys(widget))
      .sort(compareWidgetFingerprints),
    deletedTaskIds: [...normalized.deletedTaskIds].sort(),
    deletedTaskKeys: [...normalized.deletedTaskKeys].sort(),
    deletedSeriesIds: [...normalized.deletedSeriesIds].sort()
  };

  return JSON.stringify(sortObjectKeys(comparable));
}

function choosePreferredTask(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt) {
  if (localTask.status !== remoteTask.status) {
    if (localTask.status === "done" && localTask.pointsEntryId && !remoteTask.pointsEntryId) {
      return localTask;
    }
    if (remoteTask.status === "done" && remoteTask.pointsEntryId && !localTask.pointsEntryId) {
      return remoteTask;
    }
    const resolutionComparison = compareTaskResolutionPreference(localTask, remoteTask);
    if (resolutionComparison !== 0) {
      return resolutionComparison >= 0 ? localTask : remoteTask;
    }
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }
  if (localTask.historyOnly !== remoteTask.historyOnly || localTask.hideAfterAt !== remoteTask.hideAfterAt) {
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }
  if (
    localTask.name !== remoteTask.name ||
    localTask.details !== remoteTask.details ||
    localTask.timeOfDay !== remoteTask.timeOfDay ||
    localTask.lateGraceMinutes !== remoteTask.lateGraceMinutes ||
    (localTask.notBeforeAt || 0) !== (remoteTask.notBeforeAt || 0) ||
    localTask.pointsValue !== remoteTask.pointsValue ||
    (localTask.pointsEntryId || "") !== (remoteTask.pointsEntryId || "") ||
    localTask.categoryKey !== remoteTask.categoryKey ||
    localTask.categoryLabel !== remoteTask.categoryLabel ||
    localTask.categoryColor !== remoteTask.categoryColor ||
    localTask.importance !== remoteTask.importance ||
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
  clearWidgetDriveDataButton.disabled = !isDeveloperUser();
  renderDeveloperPanel();
}

function setSyncStatus(message, tone) {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function renderDeveloperPanel() {
  const visible = isDeveloperUser();
  openDeveloperButton.classList.toggle("hidden", !visible);
  developerPanel.classList.toggle("hidden", !visible);
  if (!visible) {
    closeDeveloper();
    developerFruitSummary.innerHTML = "";
    developerPointsSummary.innerHTML = "";
    return;
  }

  developerEmail.textContent = authState.user.email;

  const currentWidgetValue = developerWidgetType.value || "";
  developerWidgetType.innerHTML = listWidgetDefinitions().map((definition) => `
    <option value="${definition.type}">${escapeHtml(definition.title)}</option>
  `).join("");
  developerWidgetType.value = Array.from(developerWidgetType.options).some((option) => option.value === currentWidgetValue)
    ? currentWidgetValue
    : (developerWidgetType.options[0]?.value || "");

  const categories = getSelectableCategories();
  const currentCategoryValue = developerInjectCategory.value || "";
  developerInjectCategory.innerHTML = categories.map((category) => `
    <option value="${category.key}">${escapeHtml(category.label)}</option>
  `).join("");
  developerInjectCategory.value = Array.from(developerInjectCategory.options).some((option) => option.value === currentCategoryValue)
    ? currentCategoryValue
    : (categories[0]?.key || DEFAULT_CATEGORY_KEY);
  const currentFruitCategoryValue = developerFruitCategory.value || "";
  developerFruitCategory.innerHTML = categories.map((category) => `
    <option value="${category.key}">${escapeHtml(category.label)}</option>
  `).join("");
  developerFruitCategory.value = Array.from(developerFruitCategory.options).some((option) => option.value === currentFruitCategoryValue)
    ? currentFruitCategoryValue
    : (categories[0]?.key || DEFAULT_CATEGORY_KEY);
  const currentBankedCategoryValue = developerBankedCategory.value || "";
  developerBankedCategory.innerHTML = categories.map((category) => `
    <option value="${category.key}">${escapeHtml(category.label)}</option>
  `).join("");
  developerBankedCategory.value = Array.from(developerBankedCategory.options).some((option) => option.value === currentBankedCategoryValue)
    ? currentBankedCategoryValue
    : (categories[0]?.key || DEFAULT_CATEGORY_KEY);

  const currentTreeSkinValue = developerTreeSkin.value || "";
  const purchasableSkins = listPurchasableTreeSkins();
  developerTreeSkin.innerHTML = purchasableSkins.map((skin) => {
    const partLabel = getTreeStylePartLabel(skin.part);
    const owned = normalizeTreeStyleState(store.treeState?.styleState).ownedSkinIds.includes(skin.id);
    return `<option value="${skin.id}">${escapeHtml(`${partLabel} · ${skin.label}${owned ? " (owned)" : ""}`)}</option>`;
  }).join("");
  developerTreeSkin.value = Array.from(developerTreeSkin.options).some((option) => option.value === currentTreeSkinValue)
    ? currentTreeSkinValue
    : (purchasableSkins[0]?.id || "");
  const hasSkins = purchasableSkins.length > 0;
  developerTreeSkin.disabled = !hasSkins;
  grantTreeSkinButton.disabled = !hasSkins;
  removeTreeSkinButton.disabled = !hasSkins;

  const devSettings = normalizeDevSettings(store.devSettings);
  developerMaxTaskPoints.value = String(devSettings.maxTaskPoints);
  taskPointsInput.max = String(devSettings.maxTaskPoints);
  developerFruitSummary.innerHTML = renderDeveloperFruitSummary(getTreeDisplayState());
  developerPointsSummary.innerHTML = renderDeveloperPointsSummary(getPointLedgerSummary());
}

function updateMaxTaskPointsSetting() {
  const nextValue = Math.max(1, Math.min(50, parsePositiveNumber(developerMaxTaskPoints.value) || DEFAULT_MAX_TASK_POINTS));
  store.devSettings = normalizeDevSettings({
    ...store.devSettings,
    maxTaskPoints: nextValue
  });
  developerMaxTaskPoints.value = String(nextValue);
  syncTaskPointsDefault();
  persistStore();
  renderDeveloperPanel();
  setSyncStatus(`Max task points updated to ${nextValue}. Future task edits use this cap.`, "info");
}

function injectDeveloperPoints() {
  if (!isDeveloperUser()) {
    return;
  }

  const category = resolveCategorySnapshot(developerInjectCategory.value || DEFAULT_CATEGORY_KEY);
  const points = normalizeTaskPoints(developerInjectPoints.value, 1, 1000);
  const source = String(developerInjectSource.value || "").trim() || "Developer injection";
  if (points <= 0) {
    setSyncStatus("Injected points must be at least 1.", "error");
    return;
  }

  store.pointLedger = mergePointLedger(store.pointLedger, [{
    id: createId(),
    taskId: "",
    taskName: "",
    at: Date.now(),
    points,
    categoryKey: category.key,
    categoryLabel: category.label,
    categoryColor: category.color,
    sourceKey: `developer:${slugifyCategoryKey(source) || "injection"}`,
    sourceType: "developer",
    sourceLabel: source
  }]);

  persistStore();
  renderDeveloperPanel();
  setSyncStatus(`Injected ${formatPointsLabel(points)} into ${category.label}.`, "info");
}

function adjustDeveloperFruitGrowth(direction) {
  if (!isDeveloperUser()) {
    return;
  }

  const category = resolveCategorySnapshot(developerFruitCategory.value || DEFAULT_CATEGORY_KEY);
  const delta = normalizeTaskPoints(developerFruitDelta.value, 1, 75);
  if (delta <= 0) {
    setSyncStatus("Fruit growth changes must be at least 1 point.", "error");
    return;
  }

  const treeState = normalizeTreeState(store.treeState);
  const nextValue = (treeState.devFruitPoints[category.key] || 0) + (direction * delta);
  const nextFruitPoints = { ...treeState.devFruitPoints };
  if (nextValue === 0) {
    delete nextFruitPoints[category.key];
  } else {
    nextFruitPoints[category.key] = nextValue;
  }

  store.treeState = normalizeTreeState({
    ...treeState,
    devFruitPoints: nextFruitPoints,
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus(
    `${direction > 0 ? "Added" : "Removed"} ${formatPointsLabel(delta)} of test fruit growth for ${category.label}.`,
    "info"
  );
}

function adjustDeveloperBankedPoints(direction) {
  if (!isDeveloperUser()) {
    return;
  }

  const category = resolveCategorySnapshot(developerBankedCategory.value || DEFAULT_CATEGORY_KEY);
  const delta = normalizeTaskPoints(developerBankedDelta.value, 1, 1000);
  if (delta <= 0) {
    setSyncStatus("Banked point changes must be at least 1 point.", "error");
    return;
  }

  const treeState = normalizeTreeState(store.treeState);
  const nextValue = Math.max(0, (treeState.harvestedByCategory[category.key] || 0) + (direction * delta));
  const nextHarvested = { ...treeState.harvestedByCategory };
  if (nextValue === 0) {
    delete nextHarvested[category.key];
  } else {
    nextHarvested[category.key] = nextValue;
  }

  store.treeState = normalizeTreeState({
    ...treeState,
    harvestedByCategory: nextHarvested,
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus(
    `${direction > 0 ? "Added" : "Removed"} ${formatPointsLabel(delta)} of banked fruit points for ${category.label}.`,
    "info"
  );
}

function resetDeveloperFruitGrowth() {
  if (!isDeveloperUser()) {
    return;
  }
  store.treeState = normalizeTreeState({
    ...store.treeState,
    devFruitPoints: {},
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus("Cleared developer fruit-growth adjustments.", "info");
}

function buySelectedTreeSkin() {
  if (!isDeveloperUser()) {
    return;
  }
  const skinId = developerTreeSkin.value || "";
  if (!skinId) {
    return;
  }
  const result = purchaseTreeSkin(normalizeTreeState(store.treeState), skinId);
  if (!result.changed) {
    setSyncStatus(result.reason === "insufficient-points" ? "Not enough banked points to buy that skin yet." : "That skin is already owned.", "error");
    return;
  }
  store.treeState = normalizeTreeState({
    ...result.treeState,
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus(`Bought ${result.skin.label}.`, "success");
}

function removeSelectedTreeSkin() {
  if (!isDeveloperUser()) {
    return;
  }
  const skinId = developerTreeSkin.value || "";
  if (!skinId) {
    return;
  }
  const result = removeOwnedTreeSkin(normalizeTreeState(store.treeState), skinId);
  if (!result.changed) {
    setSyncStatus("That skin is not currently owned.", "error");
    return;
  }
  store.treeState = normalizeTreeState({
    ...result.treeState,
    updatedAt: Date.now()
  });
  persistStore();
  renderAll();
  setSyncStatus(`Removed ${result.skin.label} from the available skins.`, "info");
}

function getReturnToTarget() {
  if (!API_BASE || API_BASE === window.location.origin) {
    return window.location.pathname;
  }

  return window.location.href;
}

function compareDateish(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const leftKey = left;
  const rightKey = right;
  return leftKey.localeCompare(rightKey);
}

function compareWidgetFingerprints(left, right) {
  if ((left.type || "") !== (right.type || "")) {
    return (left.type || "").localeCompare(right.type || "");
  }
  if ((left.slotIndex ?? -1) !== (right.slotIndex ?? -1)) {
    return (left.slotIndex ?? -1) - (right.slotIndex ?? -1);
  }
  return (left.id || "").localeCompare(right.id || "");
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = sortObjectKeys(value[key]);
  }
  return result;
}

function humanizeLength(value) {
  return value.replace("-", " ");
}

function getMaxTaskPoints() {
  return normalizeDevSettings(store?.devSettings).maxTaskPoints;
}

function setTaskPointsInput(value) {
  taskPointsInput.value = String(normalizeTaskPoints(value, defaultPointsForLength(taskLengthInput.value), getMaxTaskPoints()));
  taskPointsInput.dataset.auto = value === defaultPointsForLength(taskLengthInput.value) ? "true" : "false";
}

function syncTaskPointsDefault() {
  taskPointsInput.max = String(getMaxTaskPoints());
  const suggested = defaultPointsForLength(taskLengthInput.value || "medium");
  if (taskPointsInput.dataset.auto !== "false") {
    taskPointsInput.value = String(normalizeTaskPoints(suggested, suggested, getMaxTaskPoints()));
  } else {
    taskPointsInput.value = String(normalizeTaskPoints(taskPointsInput.value, suggested, getMaxTaskPoints()));
  }
}

function syncTaskPointsAutoState() {
  const current = normalizeTaskPoints(taskPointsInput.value, defaultPointsForLength(taskLengthInput.value), getMaxTaskPoints());
  taskPointsInput.value = String(current);
  taskPointsInput.dataset.auto = current === defaultPointsForLength(taskLengthInput.value || "medium") ? "true" : "false";
}

function awardPointsForTask(task, at = Date.now()) {
  if (task.status !== "done") {
    return null;
  }

  const existingEntry = task.pointsEntryId
    ? store.pointLedger.find((entry) => entry.id === task.pointsEntryId)
    : null;
  if (existingEntry) {
    return existingEntry;
  }

  const entry = buildTaskPointEntry(task, at, task.pointsEntryId || createId());
  if (!entry) {
    task.pointsEntryId = "";
    return null;
  }

  task.pointsEntryId = entry.id;
  store.pointLedger = mergePointLedger(store.pointLedger, [entry]);
  return entry;
}

function revokePointsForTask(task) {
  if (!task.pointsEntryId) {
    return false;
  }

  const nextLedger = store.pointLedger.filter((entry) => entry.id !== task.pointsEntryId);
  const changed = nextLedger.length !== store.pointLedger.length;
  store.pointLedger = nextLedger;
  task.pointsEntryId = "";
  return changed;
}

function syncTaskPointAward(task) {
  if (task.status !== "done") {
    revokePointsForTask(task);
    return;
  }

  const existingEntry = task.pointsEntryId
    ? store.pointLedger.find((entry) => entry.id === task.pointsEntryId)
    : null;
  const nextEntry = buildTaskPointEntry(task, existingEntry?.at || Date.now(), task.pointsEntryId || createId());
  if (!nextEntry) {
    revokePointsForTask(task);
    return;
  }

  task.pointsEntryId = nextEntry.id;
  store.pointLedger = [
    ...store.pointLedger.filter((entry) => entry.id !== nextEntry.id),
    nextEntry
  ].sort((left, right) => left.at - right.at);
}

function deriveTaskNotBeforeAt({ recurrence, startDate, dueDate, originalTask = null }) {
  if (typeof originalTask?.notBeforeAt === "number" && originalTask.notBeforeAt > 0 && recurrence?.type === "none") {
    return originalTask.notBeforeAt;
  }

  const recurrenceType = recurrence?.type === "generated"
    ? recurrence?.sourceType || ""
    : recurrence?.type || "";
  if (!recurrenceType || recurrenceType === "none" || recurrenceType === "archived-series") {
    return 0;
  }

  const scheduledDate = dueDate || startDate || "";
  return deriveRecurringInstanceNotBeforeAt(recurrence, scheduledDate);
}

function deriveRecurringInstanceNotBeforeAt(recurrence, scheduledDate) {
  const recurrenceType = recurrence?.type === "generated"
    ? recurrence?.sourceType || ""
    : recurrence?.type || "";
  return computeRecurringNotBeforeAt(recurrenceType, scheduledDate);
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parsePositiveOrZeroNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function todayString() {
  return toDateString(new Date());
}

function widgetRegistryHelpers() {
  return {
    createId,
    now: Date.now(),
    maxWidgets: MAX_WIDGETS
  };
}

function normalizeWidgets(value) {
  return normalizeWidgetList(value, widgetRegistryHelpers(), MAX_WIDGETS);
}

function normalizeWidgetCompletion(value) {
  if (!value || typeof value !== "object") {
    return { mechanism: "", lockout: "none" };
  }
  return {
    mechanism: typeof value.mechanism === "string" ? value.mechanism : "",
    lockout: typeof value.lockout === "string" ? value.lockout : "none"
  };
}

function normalizeSkipRule(value) {
  if (!value || typeof value !== "object") {
    return { type: "none" };
  }

  if (value.type === "after-due-minutes") {
    return {
      type: value.type,
      graceMinutes: parsePositiveOrZeroNumber(value.graceMinutes) ?? 0
    };
  }

  if (value.type === "end-of-day") {
    return { type: value.type };
  }

  if (value.type === "widget-lockout") {
    return {
      type: value.type,
      policy: typeof value.policy === "string" ? value.policy : ""
    };
  }

  return { type: "none" };
}

function mergeRetiredWidgets(localRetired = [], remoteRetired = [], activeWidgets = []) {
  const mergedByType = new Map();
  const activeTypes = new Set(normalizeWidgets(activeWidgets).map((widget) => widget.type));

  for (const widget of normalizeWidgets(remoteRetired)) {
    if (!activeTypes.has(widget.type)) {
      mergedByType.set(widget.type, widget);
    }
  }
  for (const widget of normalizeWidgets(localRetired)) {
    if (activeTypes.has(widget.type)) {
      continue;
    }
    const existing = mergedByType.get(widget.type);
    if (!existing) {
      mergedByType.set(widget.type, widget);
      continue;
    }
    mergedByType.set(widget.type, getWidgetUpdatedAt(widget) >= getWidgetUpdatedAt(existing) ? widget : existing);
  }

  return Array.from(mergedByType.values()).slice(0, MAX_WIDGETS);
}

function getRetiredWidgetByType(type) {
  return normalizeWidgets(store.retiredWidgets).find((widget) => widget.type === type) || null;
}

function removeRetiredWidgetByType(type) {
  store.retiredWidgets = normalizeWidgets(store.retiredWidgets).filter((widget) => widget.type !== type);
}

function rememberRetiredWidget(widget) {
  removeRetiredWidgetByType(widget.type);
  store.retiredWidgets = [...normalizeWidgets(store.retiredWidgets), normalizeWidgetRecord(widget, widgetRegistryHelpers())].filter(Boolean);
}

function normalizeDeletedIds(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => typeof item === "string" && item)))
    : [];
}

function unionIds(left = [], right = []) {
  return Array.from(new Set([...(left || []), ...(right || [])]));
}

function filterDeletedTasks(tasks, deletedTaskIds, deletedTaskKeys, deletedSeriesIds) {
  const deletedTaskSet = new Set(deletedTaskIds || []);
  const deletedTaskKeySet = new Set(deletedTaskKeys || []);
  const deletedSeriesSet = new Set(deletedSeriesIds || []);
  return tasks.filter((task) => {
    if (deletedTaskSet.has(task.id)) {
      return false;
    }
    if (deletedTaskKeySet.has(buildLogicalWidgetTaskKey(task))) {
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

function rememberDeletedTask(taskOrId, taskRecord = null) {
  const task = typeof taskOrId === "object" && taskOrId
    ? taskOrId
    : taskRecord;
  const taskId = typeof taskOrId === "string"
    ? taskOrId
    : typeof task?.id === "string"
      ? task.id
      : "";

  if (taskId) {
    store.deletedTaskIds = unionIds(store.deletedTaskIds, [taskId]);
  }

  if (task) {
    store.deletedTaskKeys = unionIds(store.deletedTaskKeys, [buildLogicalWidgetTaskKey(task)]);
  }
}

function rememberDeletedTaskKey(task) {
  if (!task) {
    return;
  }
  store.deletedTaskKeys = unionIds(store.deletedTaskKeys, [buildLogicalWidgetTaskKey(task)]);
}

function rememberDeletedSeries(templateId) {
  store.deletedSeriesIds = unionIds(store.deletedSeriesIds, [templateId]);
}

function cleanupDetachedWidgetTasks() {
  const activeWidgetTypes = new Set(store.widgets.map((widget) => widget.type));
  const activeWidgetByType = new Map(store.widgets.map((widget) => [widget.type, widget]));
  const removedIds = new Set();

  for (const task of store.tasks) {
    if (!task.ownerWidgetType) {
      continue;
    }

    const activeWidget = activeWidgetByType.get(task.ownerWidgetType);
    if (activeWidget && task.ownerWidgetId === activeWidget.id) {
      continue;
    }

    if (activeWidget && task.ownerWidgetId !== activeWidget.id) {
      if (task.templateId) {
        if (task.status === "open" && (!Array.isArray(task.history) || task.history.length === 0)) {
          removedIds.add(task.id);
          continue;
        }
        task.archived = true;
        continue;
      }
      if (task.recurrence.type !== "none") {
        rememberDeletedSeries(task.id);
        removedIds.add(task.id);
        continue;
      }
      if (task.status === "open" && (!Array.isArray(task.history) || task.history.length === 0)) {
        rememberDeletedTask(task);
        removedIds.add(task.id);
        continue;
      }
      task.archived = true;
      continue;
    }

    if (!activeWidgetTypes.has(task.ownerWidgetType)) {
      if (task.templateId) {
        if (task.status === "open" && (!Array.isArray(task.history) || task.history.length === 0)) {
          removedIds.add(task.id);
          continue;
        }
        task.archived = true;
        continue;
      }

      if (task.recurrence.type !== "none") {
        rememberDeletedSeries(task.id);
        removedIds.add(task.id);
        continue;
      }

      if (task.status === "open" && (!Array.isArray(task.history) || task.history.length === 0)) {
        rememberDeletedTask(task);
        removedIds.add(task.id);
        continue;
      }
      task.archived = true;
    }
  }

  if (removedIds.size > 0) {
    store.tasks = store.tasks.filter((task) => !removedIds.has(task.id) && !removedIds.has(task.templateId));
  }
}

function ensureWidgetIntegrity() {
  store.widgets = normalizeWidgets(store.widgets).map((widget, index, widgets) => {
    const occupiedSlots = new Set(widgets.slice(0, index).map((item) => item.slotIndex));
    if (occupiedSlots.has(widget.slotIndex)) {
      return {
        ...widget,
        slotIndex: findFirstOpenSlot(occupiedSlots)
      };
    }
    return widget;
  });
}

function findFirstOpenSlot(occupiedSlots = new Set()) {
  for (let index = 0; index < MAX_WIDGETS; index += 1) {
    if (!occupiedSlots.has(index)) {
      return index;
    }
  }
  return 0;
}

function ensureWidgetTasks() {
  for (const widget of store.widgets) {
    const definition = getWidgetDefinition(widget.type);
    definition?.ensureTasks?.({
      widget,
      store,
      helpers: widgetRuntimeHelpers()
    });
  }
  syncWidgetOwnedTasks();
}

function syncWidgetOwnedTasks() {
  for (const widget of store.widgets) {
    const definition = getWidgetDefinition(widget.type);
    definition?.syncOwnedTasks?.({
      widget,
      store
    });
  }
}

function widgetRuntimeHelpers() {
  return {
    createId,
    todayString,
    regenerateSeries,
    resolveCategorySnapshot
  };
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
    lateGraceMinutes: parsePositiveOrZeroNumber(existingTask?.lateGraceMinutes ?? template.lateGraceMinutes) ?? DEFAULT_LATE_GRACE_MINUTES,
    notBeforeAt: typeof existingTask?.notBeforeAt === "number"
      ? existingTask.notBeforeAt
      : deriveRecurringInstanceNotBeforeAt(template.recurrence, dueDate || startDate),
    pointsValue: normalizeTaskPoints(existingTask?.pointsValue ?? template.pointsValue, defaultPointsForLength(template.length)),
    pointsEntryId: existingTask?.pointsEntryId || "",
    length: template.length,
    categoryKey: existingTask?.categoryKey || template.categoryKey || DEFAULT_CATEGORY_KEY,
    categoryLabel: existingTask?.categoryLabel || template.categoryLabel || resolveCategorySnapshot(template.categoryKey || DEFAULT_CATEGORY_KEY).label,
    categoryColor: normalizeCategoryColor(existingTask?.categoryColor || template.categoryColor || resolveCategorySnapshot(template.categoryKey || DEFAULT_CATEGORY_KEY).color),
    importance: normalizeImportance(existingTask?.importance || template.importance || DEFAULT_IMPORTANCE),
    status: existingTask?.status || "open",
    createdAt: existingTask?.createdAt || Date.now() + occurrenceIndex,
    ownerWidgetId: existingTask?.ownerWidgetId || template.ownerWidgetId || "",
    ownerWidgetType: existingTask?.ownerWidgetType || template.ownerWidgetType || "",
    ownerTaskKey: existingTask?.ownerTaskKey || template.ownerTaskKey || "",
    widgetCompletion: normalizeWidgetCompletion(existingTask?.widgetCompletion || template.widgetCompletion),
    skipRule: normalizeSkipRule(existingTask?.skipRule || template.skipRule),
    dependencies: [],
    recurrence: { type: "generated", sourceType: template.recurrence.type },
    history: Array.isArray(existingTask?.history) ? existingTask.history : []
  };
}

function reconcileRecurringSeries() {
  for (const task of [...store.tasks]) {
    if (!task.templateId && task.recurrence.type !== "none" && !store.deletedSeriesIds.includes(task.id)) {
      regenerateSeries(task.id, { preserveClosed: true });
    }
  }
  store.tasks = filterDeletedTasks(store.tasks, store.deletedTaskIds, store.deletedTaskKeys, store.deletedSeriesIds);
  syncWidgetOwnedTasks();
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
    persistStore({ touchUpdatedAt: false });
    setSyncStatus(payload.cleared ? "Cleared the Lifetree Google Drive data. Local tasks are unchanged." : "No Google Drive Lifetree data was stored for this account.", "success");
  } catch (error) {
    setSyncStatus(`Drive reset failed: ${error.message}`, "error");
  }
}

async function copyWidgetDiagnostics() {
  const widgetType = getDeveloperSelectedWidgetType();
  if (!widgetType) {
    return;
  }

  const diagnostics = JSON.stringify(buildWidgetDiagnostics(store, widgetType), null, 2);
  try {
    await navigator.clipboard.writeText(diagnostics);
    setSyncStatus(`Copied ${widgetType} diagnostics to the clipboard. Paste that output here if you want me to inspect it.`, "info");
  } catch {
    setSyncStatus("Clipboard access failed. Open DevTools and copy the diagnostics from the console instead.", "error");
    console.log(diagnostics);
  }
}

function runLocalWidgetCleanup() {
  const widgetType = getDeveloperSelectedWidgetType();
  if (!widgetType) {
    return;
  }

  const summary = { changed: false, removedTasks: 0 };
  mergeCleanupSummary(summary, cleanupWidgetArtifacts(store, widgetType));
  mergeCleanupSummary(summary, cleanupDuplicateArchivedSeriesRecords(store, widgetType));
  ensureWidgetIntegrity();
  cleanupDetachedWidgetTasks();
  reconcileRecurringSeries();
  ensureWidgetTasks();
  if (!summary.changed) {
    renderAll();
    setSyncStatus(`No ${widgetType} cleanup changes were needed in local data.`, "info");
    return;
  }

  persistStore();
  renderAll();
  setSyncStatus(`Cleaned ${widgetType} data locally. Removed ${summary.removedTasks} duplicate or stale tasks.`, "success");
}

async function clearWidgetDriveData() {
  if (!isDeveloperUser()) {
    return;
  }
  const widgetType = getDeveloperSelectedWidgetType();
  if (!widgetType) {
    return;
  }
  if (!window.confirm(`Delete all Google Drive data for the ${widgetType} widget? Local browser data will stay intact.`)) {
    return;
  }

  try {
    const loadResponse = await fetch(`${API_BASE}/api/lifetree/load`, {
      credentials: FETCH_CREDENTIALS
    });
    const loadPayload = await loadResponse.json();
    if (!loadResponse.ok) {
      throw new Error(loadPayload.error || "Drive load failed");
    }
    if (!loadPayload.found) {
      setSyncStatus("No Google Drive Lifetree data exists yet for this account.", "info");
      return;
    }

    const remoteStore = normalizeStore(loadPayload.payload);
    remoteStore.driveFileId = loadPayload.fileId || "";
    const summary = purgeWidgetData(remoteStore, widgetType);
    if (!summary.changed) {
      setSyncStatus(`No ${widgetType} data was found in Google Drive.`, "info");
      return;
    }
    remoteStore.updatedAt = Date.now();

    const saveResponse = await fetch(`${API_BASE}/api/lifetree/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: FETCH_CREDENTIALS,
      body: JSON.stringify({ payload: remoteStore })
    });
    const savePayload = await saveResponse.json();
    if (!saveResponse.ok) {
      throw new Error(savePayload.error || "Drive save failed");
    }

    setSyncStatus(`Cleared ${widgetType} data from Google Drive. Removed ${summary.removedTasks} tasks and ${summary.removedWidgets} widgets.`, "success");
  } catch (error) {
    setSyncStatus(`Widget Drive reset failed: ${error.message}`, "error");
  }
}

function getDeveloperSelectedWidgetType() {
  return developerWidgetType.value || listWidgetDefinitions()[0]?.type || "";
}

function buildWidgetDiagnostics(targetStore, widgetType) {
  const activeWidget = targetStore.widgets.find((widget) => widget.type === widgetType) || null;
  const widgetTasks = targetStore.tasks.filter((task) => task.ownerWidgetType === widgetType);
  const duplicateGroups = Array.from(groupWidgetTasks(widgetTasks).entries())
    .filter(([, tasks]) => tasks.length > 1)
    .map(([signature, tasks]) => ({
      signature,
      count: tasks.length,
      taskIds: tasks.map((task) => task.id),
      ownerWidgetIds: Array.from(new Set(tasks.map((task) => task.ownerWidgetId).filter(Boolean))),
      dueDate: tasks[0]?.dueDate || "",
      timeOfDay: tasks[0]?.timeOfDay || "",
      statuses: Array.from(new Set(tasks.map((task) => task.status)))
    }));

  return {
    widgetType,
    activeWidgetId: activeWidget?.id || null,
    widgets: targetStore.widgets.filter((widget) => widget.type === widgetType).map((widget) => ({
      id: widget.id,
      slotIndex: widget.slotIndex,
      createdAt: widget.createdAt
    })),
    retiredWidgets: targetStore.retiredWidgets.filter((widget) => widget.type === widgetType).map((widget) => ({
      id: widget.id,
      createdAt: widget.createdAt
    })),
    taskCount: widgetTasks.length,
    taskCountByOwnerWidgetId: countBy(widgetTasks, (task) => task.ownerWidgetId || "none"),
    taskCountByStatus: countBy(widgetTasks, (task) => task.status),
    deletedTaskIds: targetStore.deletedTaskIds.filter((taskId) => widgetTasks.some((task) => task.id === taskId)),
    deletedTaskKeys: targetStore.deletedTaskKeys.filter((key) => key.startsWith(`${widgetType}|`)),
    closedTasks: widgetTasks
      .filter((task) => task.status !== "open")
      .sort((left, right) => {
        const leftKey = `${left.dueDate || left.startDate || ""}|${left.timeOfDay || ""}|${left.name || ""}`;
        const rightKey = `${right.dueDate || right.startDate || ""}|${right.timeOfDay || ""}|${right.name || ""}`;
        return leftKey.localeCompare(rightKey);
      })
      .map((task) => ({
        id: task.id,
        name: task.name,
        ownerTaskKey: task.ownerTaskKey || "",
        dueDate: task.dueDate || "",
        timeOfDay: task.timeOfDay || "",
        status: task.status,
        archived: task.archived === true,
        lastHistory: Array.isArray(task.history) && task.history.length > 0
          ? task.history[task.history.length - 1]
          : null
      })),
    statusMismatches: widgetTasks
      .map((task) => ({
        id: task.id,
        name: task.name,
        ownerTaskKey: task.ownerTaskKey || "",
        dueDate: task.dueDate || "",
        timeOfDay: task.timeOfDay || "",
        status: task.status,
        latestLifecycle: getLatestLifecycleEntry(task)
      }))
      .filter((task) => {
        if (!task.latestLifecycle) {
          return false;
        }
        if (task.latestLifecycle.type === "completed") {
          return task.status !== "done";
        }
        if (task.latestLifecycle.type === "skipped") {
          return task.status !== "skipped";
        }
        if (task.latestLifecycle.type === "reopened") {
          return task.status !== "open";
        }
        return false;
      }),
    duplicateGroups
  };
}

function cleanupWidgetArtifacts(targetStore, widgetType) {
  const activeWidget = targetStore.widgets.find((widget) => widget.type === widgetType) || null;
  const removedTaskIds = new Set();
  const duplicateGroups = groupWidgetTasks(targetStore.tasks.filter((task) => task.ownerWidgetType === widgetType));

  for (const tasks of duplicateGroups.values()) {
    if (tasks.length < 2) {
      continue;
    }
    const keep = choosePreferredWidgetTask(tasks, activeWidget?.id || "");
    keep.history = mergeDuplicateWidgetTaskHistories(keep, tasks);
    for (const task of tasks) {
      if (task.id !== keep.id) {
        removedTaskIds.add(task.id);
      }
    }
  }

  if (activeWidget) {
    const activeKeys = new Set(
      targetStore.tasks
        .filter((task) => task.ownerWidgetType === widgetType && task.ownerWidgetId === activeWidget.id && task.status === "open")
        .map((task) => widgetTaskIdentity(task))
    );

    for (const task of targetStore.tasks) {
      if (
        task.ownerWidgetType === widgetType &&
        task.ownerWidgetId &&
        task.ownerWidgetId !== activeWidget.id &&
        task.status === "open" &&
        activeKeys.has(widgetTaskIdentity(task))
      ) {
        removedTaskIds.add(task.id);
      }
    }
  }

  if (removedTaskIds.size === 0) {
    return { changed: false, removedTasks: 0 };
  }

  targetStore.tasks = targetStore.tasks.filter((task) => !removedTaskIds.has(task.id) && !removedTaskIds.has(task.templateId));
  for (const task of targetStore.tasks) {
    task.dependencies = task.dependencies.filter((dependencyId) => !removedTaskIds.has(dependencyId));
  }

  return { changed: true, removedTasks: removedTaskIds.size };
}

function cleanupLegacyWidgetArtifacts() {
  let changed = false;
  for (const definition of listWidgetDefinitions()) {
    if (cleanupWidgetArtifacts(store, definition.type).changed) {
      changed = true;
    }
  }
  if (cleanupDuplicateArchivedSeriesRecords(store).changed) {
    changed = true;
  }
  return changed;
}

function cleanupDuplicateArchivedSeriesRecords(targetStore, widgetType = "") {
  const duplicateGroups = new Map();

  for (const task of targetStore.tasks) {
    if (task.recurrence?.type !== "archived-series" || task.archived !== true) {
      continue;
    }
    if (widgetType && task.ownerWidgetType !== widgetType) {
      continue;
    }

    const signature = [
      task.ownerWidgetType || "manual",
      task.ownerTaskKey || task.name,
      task.startDate || "",
      task.dueDate || "",
      task.timeOfDay || "",
      task.status,
      latestHistoryFingerprint(task)
    ].join("|");
    const existing = duplicateGroups.get(signature) || [];
    existing.push(task);
    duplicateGroups.set(signature, existing);
  }

  const removedTaskIds = new Set();
  for (const tasks of duplicateGroups.values()) {
    if (tasks.length < 2) {
      continue;
    }
    const keep = choosePreferredWidgetTask(tasks, "");
    for (const task of tasks) {
      if (task.id === keep.id) {
        continue;
      }
      removedTaskIds.add(task.id);
    }
    keep.history = mergeDuplicateWidgetTaskHistories(keep, tasks);
  }

  if (removedTaskIds.size === 0) {
    return { changed: false, removedTasks: 0 };
  }

  targetStore.tasks = targetStore.tasks.filter((task) => !removedTaskIds.has(task.id));
  return { changed: true, removedTasks: removedTaskIds.size };
}

function upsertArchivedSeriesRecord(template) {
  const archivedRecord = createArchivedSeriesRecord(template);
  const existingIndex = store.tasks.findIndex((task) =>
    task.id === archivedRecord.id
    || (
      task.recurrence?.type === "archived-series"
      && task.archived === true
      && task.ownerWidgetType === archivedRecord.ownerWidgetType
      && (task.ownerTaskKey || task.name) === (archivedRecord.ownerTaskKey || archivedRecord.name)
      && (task.startDate || "") === (archivedRecord.startDate || "")
      && (task.dueDate || "") === (archivedRecord.dueDate || "")
      && (task.timeOfDay || "") === (archivedRecord.timeOfDay || "")
      && task.status === archivedRecord.status
    )
  );

  if (existingIndex === -1) {
    store.tasks.push(archivedRecord);
    return archivedRecord;
  }

  const existing = store.tasks[existingIndex];
  const preferred = choosePreferredWidgetTask([existing, archivedRecord], "");
  const mergedHistory = mergeHistoryItems(existing.history, archivedRecord.history);
  store.tasks[existingIndex] = {
    ...existing,
    ...archivedRecord,
    ...preferred,
    history: mergedHistory
  };
  return store.tasks[existingIndex];
}

function purgeWidgetData(targetStore, widgetType) {
  const widgetIds = new Set(targetStore.widgets.filter((widget) => widget.type === widgetType).map((widget) => widget.id));
  const retiredIds = new Set(targetStore.retiredWidgets.filter((widget) => widget.type === widgetType).map((widget) => widget.id));
  const removedTaskIds = new Set(
    targetStore.tasks
      .filter((task) => task.ownerWidgetType === widgetType)
      .map((task) => task.id)
  );

  targetStore.widgets = targetStore.widgets.filter((widget) => widget.type !== widgetType);
  targetStore.retiredWidgets = targetStore.retiredWidgets.filter((widget) => widget.type !== widgetType);
  targetStore.tasks = targetStore.tasks.filter((task) => !removedTaskIds.has(task.id) && !removedTaskIds.has(task.templateId));
  for (const task of targetStore.tasks) {
    task.dependencies = task.dependencies.filter((dependencyId) => !removedTaskIds.has(dependencyId));
  }

  return {
    changed: removedTaskIds.size > 0 || widgetIds.size > 0 || retiredIds.size > 0,
    removedTasks: removedTaskIds.size,
    removedWidgets: widgetIds.size + retiredIds.size
  };
}

function groupWidgetTasks(tasks) {
  const grouped = new Map();
  for (const task of tasks) {
    const signature = buildWidgetTaskSignature(task);
    const existing = grouped.get(signature) || [];
    existing.push(task);
    grouped.set(signature, existing);
  }
  return grouped;
}

function buildWidgetTaskSignature(task) {
  return buildLogicalWidgetTaskKey(task);
}

function widgetTaskIdentity(task) {
  return buildLogicalWidgetTaskKey(task);
}

function choosePreferredWidgetTask(tasks, activeWidgetId) {
  return [...tasks].sort((left, right) => {
    if (Boolean(right.ownerWidgetId === activeWidgetId) !== Boolean(left.ownerWidgetId === activeWidgetId)) {
      return Number(right.ownerWidgetId === activeWidgetId) - Number(left.ownerWidgetId === activeWidgetId);
    }
    if (Boolean(right.pointsEntryId) !== Boolean(left.pointsEntryId)) {
      return Number(Boolean(right.pointsEntryId)) - Number(Boolean(left.pointsEntryId));
    }
    if (right.status !== left.status) {
      return widgetStatusRank(right.status) - widgetStatusRank(left.status);
    }
    if ((right.history?.length || 0) !== (left.history?.length || 0)) {
      return (right.history?.length || 0) - (left.history?.length || 0);
    }
    if (Number(left.archived) !== Number(right.archived)) {
      return Number(left.archived) - Number(right.archived);
    }
    return (right.createdAt || 0) - (left.createdAt || 0);
  })[0];
}

function mergeHistoryItems(...groups) {
  const merged = new Map();
  for (const item of groups.flatMap((group) => group || [])) {
    if (!item?.id) {
      continue;
    }
    merged.set(item.id, item);
  }
  return Array.from(merged.values()).sort((a, b) => (a.at || 0) - (b.at || 0));
}

function mergeDuplicateWidgetTaskHistories(preferredTask, duplicateTasks) {
  const matchingStatusTasks = duplicateTasks.filter((task) => task.status === preferredTask.status);
  const sourceTasks = matchingStatusTasks.length > 0 ? matchingStatusTasks : [preferredTask];
  return compactTaskHistory(mergeHistoryItems(...sourceTasks.map((task) => task.history || [])));
}

function widgetStatusRank(status) {
  if (status === "done") {
    return 3;
  }
  if (status === "skipped") {
    return 2;
  }
  return 1;
}

function latestHistoryFingerprint(task) {
  const latest = Array.isArray(task.history) && task.history.length > 0 ? task.history[task.history.length - 1] : null;
  return latest ? `${latest.type}:${latest.at}` : "";
}

function mergeCleanupSummary(target, summary) {
  target.changed = target.changed || Boolean(summary.changed);
  target.removedTasks += summary.removedTasks || 0;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
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
