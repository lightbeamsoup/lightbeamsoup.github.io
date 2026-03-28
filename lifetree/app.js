import {
  buildLogicalWidgetTaskKey,
  buildHistoryFeed,
  compareTaskResolutionPreference,
  compareTaskSchedule,
  compactTaskHistory,
  computeRecurringNotBeforeAt,
  computeOccurrenceDate,
  createArchivedSeriesRecord,
  formatTaskDisplayName,
  findNextWidgetCompletionTask,
  getLatestLifecycleEntry,
  getOpenTaskDeadlineState,
  nthWeekdayOfMonth,
  shouldAutoSkipTask,
  toDateString
} from "./logic.js";
import {
  buildCanopyColumnsData,
  getCanopyRecurringGroupKey,
  renderCanopyColumns,
  renderCanopyDetailContent
} from "./modules/canopy.js";
import { createAutosaveController } from "./modules/autosave.js";
import { createDriveSyncController, resolveApiBase } from "./modules/driveSync.js";
import {
  buildTaskPointEntry as buildTaskPointEntryBase,
  choosePreferredTreeState as choosePreferredTreeStateBase,
  DEFAULT_MAX_POINT_HISTORY_ENTRIES,
  DEFAULT_MAX_TASK_POINTS,
  defaultPointsForLength,
  formatPointsLabel,
  mergePointLedger as mergePointLedgerBase,
  mergePointHistory as mergePointHistoryBase,
  normalizeDevSettings,
  normalizePointLedger as normalizePointLedgerBase,
  normalizePointHistory as normalizePointHistoryBase,
  normalizeTaskPoints,
  normalizeTreeState as normalizeTreeStateBase,
  renderDeveloperFruitSummary as renderDeveloperFruitSummaryBase,
  renderDeveloperPointsSummary as renderDeveloperPointsSummaryBase
} from "./modules/points.js";
import {
  buildEmailSummaryKey as buildEmailSummaryKeyShared,
  buildEmailSummaryPreview as buildEmailSummaryPreviewShared,
  renderEmailSummaryBodyHtml as renderEmailSummaryBodyHtmlShared,
  renderEmailSummaryBodyText as renderEmailSummaryBodyTextShared
} from "./modules/notificationSummary.js";
import {
  buildEmailReminderTemplates as buildEmailReminderTemplatesShared,
  renderEmailReminderBodyHtml as renderEmailReminderBodyHtmlShared,
  renderEmailReminderBodyText as renderEmailReminderBodyTextShared
} from "./modules/notificationReminders.js";
import {
  DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES,
  appendNotificationHistoryEntry,
  choosePreferredNotifications,
  normalizeEmailReminderConfig,
  normalizeEmailSummaryConfig,
  normalizeNotifications,
  normalizeNotificationTimezone,
  normalizeReminderMinutes,
  normalizeRecipientEmail,
  normalizeWeekday,
  normalizeNotificationTime
} from "./modules/notifications.js";
import {
  isDarkModeActive,
  choosePreferredProfile,
  normalizeThemeTime,
  normalizeAutosaveIntervalMinutes,
  normalizeHelpTooltipDelayMs,
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
const MAX_DELETION_MARKERS = 300;
const DELETION_MARKER_RETENTION_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_ROLLING_SERIES_INSTANCES = 7;
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
const RECURRING_BONUS_POINTS = {
  daily: 5,
  weekly: 25,
  monthly: 50
};

const BASE_CATEGORIES = [
  { key: "fun", label: "Fun", color: "#f4b64e", builtin: true },
  { key: "friends", label: "Friends", color: "#5ca8f5", builtin: true },
  { key: "family", label: "Family", color: "#f28ca8", builtin: true },
  { key: "productivity", label: "Productivity", color: "#7dbf74", builtin: true },
  { key: "health", label: "Health", color: "#6dc7bf", builtin: true }
];

const IMPORTANCE_DEFINITIONS = {
  low: { label: "Low priority", color: "#d8e6f3", icon: "↓" },
  medium: { label: "Medium priority", color: "#ffe2b8", icon: "" },
  high: { label: "High priority", color: "#f6b6b6", icon: "!" }
};

const LENGTH_ORDER = {
  "very-short": 1,
  short: 2,
  medium: 3,
  long: 4,
  "very-long": 5
};
const LINKED_SERIES_KIND_DAILY = "daily-window";
const LINKED_SERIES_KIND_WEEKLY = "weekly-window";

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
const MOBILE_TASK_DESK_MEDIA = "(max-width: 860px)";

const dashboardHero = document.getElementById("dashboardHero");
const toggleHeroButton = document.getElementById("toggleHero");
const heroWelcome = document.getElementById("heroWelcome");
const heroClock = document.getElementById("heroClock");
const heroClockMeta = document.getElementById("heroClockMeta");
const openNotificationsButton = document.getElementById("openNotifications");
const openSettingsButton = document.getElementById("openSettings");
const canopyColumns = document.getElementById("canopyColumns");
const openQuickAddButton = document.getElementById("openQuickAdd");
const quickAddModal = document.getElementById("quickAddModal");
const closeQuickAddButton = document.getElementById("closeQuickAdd");
const closeQuickAddBackdrop = document.getElementById("closeQuickAddBackdrop");
const cancelQuickAddButton = document.getElementById("cancelQuickAdd");
const quickAddForm = document.getElementById("quickAddForm");
const quickTaskNameInput = document.getElementById("quickTaskName");
const quickTaskDueDateInput = document.getElementById("quickTaskDueDate");
const quickTaskTimeOfDayInput = document.getElementById("quickTaskTimeOfDay");
const quickTaskCategoryInput = document.getElementById("quickTaskCategory");
const quickTaskLengthInput = document.getElementById("quickTaskLength");
const quickTaskImportanceInput = document.getElementById("quickTaskImportance");
const canopyDetailModal = document.getElementById("canopyDetailModal");
const closeCanopyDetailButton = document.getElementById("closeCanopyDetail");
const closeCanopyDetailBackdrop = document.getElementById("closeCanopyDetailBackdrop");
const canopyDetailTitle = document.getElementById("canopyDetailTitle");
const canopyDetailSubtitle = document.getElementById("canopyDetailSubtitle");
const canopyDetailBody = document.getElementById("canopyDetailBody");
const canopyDetailFooter = document.getElementById("canopyDetailFooter");
const treeHarvestButton = document.getElementById("treeHarvestButton");
const treeSkyLayer = document.getElementById("treeSkyLayer");
const treeSun = document.getElementById("treeSun");
const treeMoon = document.getElementById("treeMoon");
const treeStarField = document.getElementById("treeStarField");
const treeShellImage = document.getElementById("treeShellImage");
const treeFruitLayer = document.getElementById("treeFruitLayer");
const treeHarvestHint = document.getElementById("treeHarvestHint");
const treeBankSummary = document.getElementById("treeBankSummary");
const treeCoreTitle = document.getElementById("treeCoreTitle");
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
const settingsDarkModeEnabledInput = document.getElementById("settingsDarkModeEnabled");
const settingsAutoDarkModeEnabledInput = document.getElementById("settingsAutoDarkModeEnabled");
const settingsAutoDarkModeStartInput = document.getElementById("settingsAutoDarkModeStart");
const settingsAutoDarkModeEndInput = document.getElementById("settingsAutoDarkModeEnd");
const settingsHelpTextEnabledInput = document.getElementById("settingsHelpTextEnabled");
const settingsHelpTooltipDelayInput = document.getElementById("settingsHelpTooltipDelay");
const notificationsModal = document.getElementById("notificationsModal");
const closeNotificationsButton = document.getElementById("closeNotifications");
const closeNotificationsBackdrop = document.getElementById("closeNotificationsBackdrop");
const cancelNotificationsButton = document.getElementById("cancelNotifications");
const notificationsForm = document.getElementById("notificationsForm");
const notificationsSummaryEnabledInput = document.getElementById("notificationsSummaryEnabled");
const notificationsRecipientEmailInput = document.getElementById("notificationsRecipientEmail");
const notificationsFrequencyInput = document.getElementById("notificationsFrequency");
const notificationsSendTimeInput = document.getElementById("notificationsSendTime");
const notificationsWeekdayInput = document.getElementById("notificationsWeekday");
const notificationsWeekdayRow = document.getElementById("notificationsWeekdayRow");
const notificationsRemindersEnabledInput = document.getElementById("notificationsRemindersEnabled");
const notificationsReminderDueSoonEnabledInput = document.getElementById("notificationsReminderDueSoonEnabled");
const notificationsReminderOverdueEnabledInput = document.getElementById("notificationsReminderOverdueEnabled");
const notificationsReminderDailyAgendaEnabledInput = document.getElementById("notificationsReminderDailyAgendaEnabled");
const notificationsReminderDailyAgendaTimeInput = document.getElementById("notificationsReminderDailyAgendaTime");
const notificationsReminderQuietHoursEnabledInput = document.getElementById("notificationsReminderQuietHoursEnabled");
const notificationsReminderQuietHoursStartInput = document.getElementById("notificationsReminderQuietHoursStart");
const notificationsReminderQuietHoursEndInput = document.getElementById("notificationsReminderQuietHoursEnd");
const notificationsIncludeOverdueInput = document.getElementById("notificationsIncludeOverdue");
const notificationsIncludeDueSoonInput = document.getElementById("notificationsIncludeDueSoon");
const notificationsIncludeCompletedInput = document.getElementById("notificationsIncludeCompleted");
const notificationsIncludeRecurringProgressInput = document.getElementById("notificationsIncludeRecurringProgress");
const notificationsIncludeTreePointsInput = document.getElementById("notificationsIncludeTreePoints");
const notificationsIncludeWidgetHighlightsInput = document.getElementById("notificationsIncludeWidgetHighlights");
const notificationsPreview = document.getElementById("notificationsPreview");
const notificationsHistory = document.getElementById("notificationsHistory");
const sendNotificationSummaryButton = document.getElementById("sendNotificationSummary");
const sendNotificationReminderButton = document.getElementById("sendNotificationReminder");
const taskDeskModal = document.getElementById("taskDeskModal");
const openTaskDeskButton = document.getElementById("openTaskDesk");
const closeTaskDeskButton = document.getElementById("closeTaskDesk");
const closeTaskDeskBackdrop = document.getElementById("closeTaskDeskBackdrop");
const taskDeskTabs = document.getElementById("taskDeskTabs");
const taskDeskPaneButtons = Array.from(document.querySelectorAll("[data-desk-pane-button]"));
const taskDeskPanes = Array.from(document.querySelectorAll("[data-desk-pane]"));
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
const toggleCategoryOptionsButton = document.getElementById("toggleCategoryOptions");
const categoryPanelBody = document.getElementById("categoryPanelBody");
const taskImportanceInput = document.getElementById("taskImportance");
const categoryList = document.getElementById("categoryList");
const newCategoryNameInput = document.getElementById("newCategoryName");
const newCategoryColorInput = document.getElementById("newCategoryColor");
const addCategoryButton = document.getElementById("addCategory");
const toggleDependenciesButton = document.getElementById("toggleDependencies");
const dependenciesPanelBody = document.getElementById("dependenciesPanelBody");
const dependenciesSelect = document.getElementById("dependencies");
const toggleReminderOptionsButton = document.getElementById("toggleReminderOptions");
const reminderPanelBody = document.getElementById("reminderPanelBody");
const taskRemindersEnabledInput = document.getElementById("taskRemindersEnabled");
const taskReminderDueSoonMinutesInput = document.getElementById("taskReminderDueSoonMinutes");
const taskReminderOverdueMinutesInput = document.getElementById("taskReminderOverdueMinutes");
const taskReminderDefaultsCopy = document.getElementById("taskReminderDefaultsCopy");
const toggleRecurrenceOptionsButton = document.getElementById("toggleRecurrenceOptions");
const recurrencePanelBody = document.getElementById("recurrencePanelBody");
const recurrenceType = document.getElementById("recurrenceType");
const recurrenceForeverInput = document.getElementById("recurrenceForever");
const recurrenceExtras = Array.from(document.querySelectorAll(".recurrence-extra"));
const weeklyDayPicker = document.getElementById("weeklyDayPicker");
const addDailyInstanceTimeButton = document.getElementById("addDailyInstanceTime");
const dailyInstanceTimes = document.getElementById("dailyInstanceTimes");
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
const syncLocalCard = document.getElementById("syncLocalCard");
const syncLocalValue = document.getElementById("syncLocalValue");
const syncDriveCard = document.getElementById("syncDriveCard");
const syncDriveValue = document.getElementById("syncDriveValue");
const syncAutosaveCard = document.getElementById("syncAutosaveCard");
const syncAutosaveValue = document.getElementById("syncAutosaveValue");
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
const developerMaxPointHistoryEntries = document.getElementById("developerMaxPointHistoryEntries");
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
const copyNotificationDiagnosticsButton = document.getElementById("copyNotificationDiagnostics");
const downloadDriveDataButton = document.getElementById("downloadDriveData");
const importDriveDataButton = document.getElementById("importDriveData");
const sendDeveloperNotificationTestButton = document.getElementById("sendDeveloperNotificationTest");
const sendDeveloperDailySummaryButton = document.getElementById("sendDeveloperDailySummary");
const sendDeveloperDailyAgendaButton = document.getElementById("sendDeveloperDailyAgenda");
const cleanWidgetDataButton = document.getElementById("cleanWidgetData");
const clearWidgetDriveDataButton = document.getElementById("clearWidgetDriveData");
const injectPointsButton = document.getElementById("injectPoints");
const addFruitGrowthButton = document.getElementById("addFruitGrowth");
const removeFruitGrowthButton = document.getElementById("removeFruitGrowth");
const addBankedPointsButton = document.getElementById("addBankedPoints");
const removeBankedPointsButton = document.getElementById("removeBankedPoints");
const resetFruitGrowthButton = document.getElementById("resetFruitGrowth");
const clearDriveDataButton = document.getElementById("clearDriveData");
const developerImportJsonInput = document.getElementById("developerImportJson");
const developerFruitSummary = document.getElementById("developerFruitSummary");
const developerPointsSummary = document.getElementById("developerPointsSummary");
const helpTooltip = document.getElementById("helpTooltip");

const authState = {
  authenticated: false,
  user: null
};

const editState = {
  taskId: "",
  scope: "single",
  linkedGroupId: ""
};
const composerPanelState = {
  categoryOptionsOpen: false,
  dependenciesOpen: false,
  reminderOptionsOpen: false,
  recurrenceOpen: false
};
const composerReminderState = {
  userTouched: false
};

const widgetMenuState = {
  slotIndex: null,
  selectedType: ""
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
const canopyState = {
  columns: [],
  detail: {
    kind: "",
    columnKey: "",
    groupKey: ""
  }
};
const helpTooltipState = {
  timerId: 0,
  target: null,
  mode: "",
  anchorX: 0,
  anchorY: 0,
  consumeNextClick: false,
  pressPointerId: null,
  pressStartX: 0,
  pressStartY: 0
};

let store = loadStore();
const mobileTaskDeskQuery = window.matchMedia(MOBILE_TASK_DESK_MEDIA);
let activeTaskDeskPane = "tasks";
const syncState = {
  remoteUpdatedAt: 0,
  remoteFingerprint: "",
  remoteSavedAt: 0,
  remoteUserUpdatedAt: 0,
  remoteUserFingerprint: ""
};
const driveSaveState = {
  inFlight: false,
  mode: ""
};
const notificationSendState = {
  inFlight: false,
  kind: ""
};
const localFingerprintCache = {
  storeRef: null,
  updatedAt: Number.NaN,
  fingerprint: ""
};

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
  getKnownRemoteState: () => syncState,
  setStore: (nextStore) => {
    store = nextStore;
  },
  normalizeStore,
  mergeStores,
  finalizeStoreState,
  ensureWidgetIntegrity,
  ensureWidgetTasks,
  reconcileRecurringSeries,
  persistStore,
  renderAll,
  setSyncStatus,
  updateGoogleButtons,
  getReturnToTarget,
  describeMergeResult,
  computeStoreFingerprint,
  computeUserContentFingerprint
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
  saveToDrive: async (options) => {
    setDriveSaveInFlight(true, "autosave");
    try {
      const result = await saveToDrive(options);
      if (result?.success) {
        rememberRemoteStoreState({
          updatedAt: result.remoteUpdatedAt,
          fingerprint: result.remoteFingerprint,
          savedAt: result.remoteSavedAt,
          userUpdatedAt: result.remoteUserUpdatedAt,
          userFingerprint: result.remoteUserFingerprint
        });
        renderSyncMeta();
      }
      return result;
    } finally {
      setDriveSaveInFlight(false);
    }
  }
});

updateRecurrenceVisibility();
updateSkipVisibility();
syncTaskReminderInputs();
applyHeroState(loadHeroCollapsed());
syncComposerPanelState();
renderDailyInstanceTimes();
setWeeklyDaySelection([Number(document.getElementById("weeklyWeekday").value || 0)]);
taskPointsInput.dataset.auto = "true";
syncTaskPointsDefault();
renderTemporalUi();
window.setInterval(renderTemporalUi, TEMPORAL_REFRESH_MS);
applyTaskDeskPaneState();

toggleHeroButton.addEventListener("click", toggleHeroCollapsed);
openNotificationsButton.addEventListener("click", openNotifications);
openSettingsButton.addEventListener("click", openSettings);
openQuickAddButton.addEventListener("click", openQuickAdd);
openTaskDeskButton.addEventListener("click", () => handleOpenTaskDesk("composer"));
closeCanopyDetailButton.addEventListener("click", closeCanopyDetail);
closeCanopyDetailBackdrop.addEventListener("click", closeCanopyDetail);
closeTaskDeskButton.addEventListener("click", closeTaskDesk);
closeTaskDeskBackdrop.addEventListener("click", closeTaskDesk);
taskDeskTabs.addEventListener("click", handleTaskDeskTabClick);
closeWidgetMenuButton.addEventListener("click", closeWidgetMenu);
widgetMenuOptions.addEventListener("click", handleWidgetMenuSelection);
canopyColumns.addEventListener("click", handleCanopyAction);
canopyDetailBody.addEventListener("click", handleCanopyAction);
canopyDetailBody.addEventListener("change", handleCanopyChange);
document.addEventListener("pointerover", handleHelpPointerOver, true);
document.addEventListener("pointerout", handleHelpPointerOut, true);
document.addEventListener("pointerdown", handleHelpPointerDown, true);
document.addEventListener("pointerup", handleHelpPointerUp, true);
document.addEventListener("pointercancel", handleHelpPointerCancel, true);
document.addEventListener("pointermove", handleHelpPointerMove, true);
document.addEventListener("click", handleHelpTooltipClick, true);
window.addEventListener("scroll", hideHelpTooltip, true);
window.addEventListener("resize", hideHelpTooltip);
treeHarvestButton.addEventListener("click", harvestRipeFruit);
openTreeStyleButton.addEventListener("click", openTreeStyle);
openTreeDetailButton.addEventListener("click", openTreeDetail);
widgetSlots.forEach((slot) => {
  slot.addEventListener("click", handleWidgetSlotClick);
  slot.addEventListener("submit", handleWidgetSlotSubmit);
});
document.addEventListener("keydown", handleGlobalKeydown);
mobileTaskDeskQuery.addEventListener("change", applyTaskDeskPaneState);
form.addEventListener("submit", handleSubmit);
quickAddForm.addEventListener("submit", handleQuickAddSubmit);
clearFormButton.addEventListener("click", resetComposer);
cancelEditButton.addEventListener("click", clearEditState);
addCategoryButton.addEventListener("click", handleAddCategory);
toggleCategoryOptionsButton.addEventListener("click", () => {
  composerPanelState.categoryOptionsOpen = !composerPanelState.categoryOptionsOpen;
  syncComposerPanelState();
});
toggleDependenciesButton.addEventListener("click", () => {
  composerPanelState.dependenciesOpen = !composerPanelState.dependenciesOpen;
  syncComposerPanelState();
});
toggleReminderOptionsButton.addEventListener("click", () => {
  composerPanelState.reminderOptionsOpen = !composerPanelState.reminderOptionsOpen;
  syncComposerPanelState();
});
toggleRecurrenceOptionsButton.addEventListener("click", () => {
  composerPanelState.recurrenceOpen = !composerPanelState.recurrenceOpen;
  syncComposerPanelState();
});
categoryList.addEventListener("input", handleCategoryListInput);
categoryList.addEventListener("click", handleCategoryListClick);
editScope.addEventListener("change", () => {
  editState.scope = editScope.value;
  syncEditPanel();
});
recurrenceType.addEventListener("change", updateRecurrenceVisibility);
recurrenceForeverInput.addEventListener("change", updateRecurrenceVisibility);
addDailyInstanceTimeButton.addEventListener("click", () => {
  appendDailyInstanceTimeRow("");
});
dailyInstanceTimes.addEventListener("click", handleDailyInstanceTimesClick);
weeklyDayPicker.addEventListener("change", syncWeeklyWeekdayHiddenValue);
skipRuleTypeInput.addEventListener("change", updateSkipVisibility);
lateGraceMinutesInput.addEventListener("input", syncTaskReminderInputs);
taskLengthInput.addEventListener("change", syncTaskPointsDefault);
taskPointsInput.addEventListener("input", syncTaskPointsAutoState);
taskImportanceInput.addEventListener("change", handleTaskImportanceChange);
taskRemindersEnabledInput.addEventListener("change", handleTaskReminderInputChange);
taskReminderDueSoonMinutesInput.addEventListener("input", handleTaskReminderInputChange);
taskReminderOverdueMinutesInput.addEventListener("input", handleTaskReminderInputChange);
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
developerMaxPointHistoryEntries.addEventListener("change", updateMaxPointHistoryEntriesSetting);
injectPointsButton.addEventListener("click", injectDeveloperPoints);
addFruitGrowthButton.addEventListener("click", () => adjustDeveloperFruitGrowth(1));
removeFruitGrowthButton.addEventListener("click", () => adjustDeveloperFruitGrowth(-1));
addBankedPointsButton.addEventListener("click", () => adjustDeveloperBankedPoints(1));
removeBankedPointsButton.addEventListener("click", () => adjustDeveloperBankedPoints(-1));
grantTreeSkinButton.addEventListener("click", buySelectedTreeSkin);
removeTreeSkinButton.addEventListener("click", removeSelectedTreeSkin);
resetFruitGrowthButton.addEventListener("click", resetDeveloperFruitGrowth);
copyWidgetDiagnosticsButton.addEventListener("click", copyWidgetDiagnostics);
copyNotificationDiagnosticsButton.addEventListener("click", copyNotificationDiagnostics);
downloadDriveDataButton.addEventListener("click", downloadDriveData);
sendDeveloperNotificationTestButton.addEventListener("click", sendDeveloperNotificationTest);
sendDeveloperDailySummaryButton.addEventListener("click", sendDeveloperDailySummary);
sendDeveloperDailyAgendaButton.addEventListener("click", sendDeveloperDailyAgenda);
importDriveDataButton.addEventListener("click", openDeveloperImportPicker);
developerImportJsonInput.addEventListener("change", handleDeveloperImportJson);
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
settingsDarkModeEnabledInput.addEventListener("change", handleThemeSettingModeChange);
settingsAutoDarkModeEnabledInput.addEventListener("change", handleThemeSettingModeChange);
closeNotificationsButton.addEventListener("click", closeNotifications);
closeNotificationsBackdrop.addEventListener("click", closeNotifications);
cancelNotificationsButton.addEventListener("click", closeNotifications);
notificationsForm.addEventListener("submit", handleNotificationsSubmit);
notificationsForm.addEventListener("input", renderNotificationsIfOpen);
notificationsForm.addEventListener("change", handleNotificationsFormChange);
sendNotificationSummaryButton.addEventListener("click", handleSendNotificationSummary);
sendNotificationReminderButton.addEventListener("click", handleSendNotificationReminder);
closeTreeDetailButton.addEventListener("click", closeTreeDetail);
closeTreeDetailBackdrop.addEventListener("click", closeTreeDetail);
closeTreeStyleButton.addEventListener("click", closeTreeStyle);
closeTreeStyleBackdrop.addEventListener("click", closeTreeStyle);
treeStyleBody.addEventListener("click", handleTreeStyleAction);
closeDeveloperButton.addEventListener("click", closeDeveloper);
closeDeveloperBackdrop.addEventListener("click", closeDeveloper);
closeQuickAddButton.addEventListener("click", closeQuickAdd);
closeQuickAddBackdrop.addEventListener("click", closeQuickAdd);
cancelQuickAddButton.addEventListener("click", closeQuickAdd);

initializeApp();

function initializeApp() {
  setSyncStatus("Using local data while checking Google Drive in the background.", "info");
  renderSyncMeta();
  finalizeStoreState();
  renderAll();
  autosaveController.refreshSchedule();
  void continueStartup();
}

async function continueStartup() {
  const startupResult = await initializeFromDrive({ timeoutMs: 10000 });
  if (
    startupResult.remoteUpdatedAt
    || startupResult.remoteFingerprint
    || startupResult.remoteSavedAt
    || startupResult.remoteUserUpdatedAt
    || startupResult.remoteUserFingerprint
  ) {
    rememberRemoteStoreState({
      updatedAt: startupResult.remoteUpdatedAt,
      fingerprint: startupResult.remoteFingerprint,
      savedAt: startupResult.remoteSavedAt,
      userUpdatedAt: startupResult.remoteUserUpdatedAt,
      userFingerprint: startupResult.remoteUserFingerprint
    });
  }

  if (startupResult.loaded) {
    finalizeStoreState();
    renderAll();
  }
  const currentFingerprint = getCurrentStoreFingerprint();
  const startupRemoteFingerprint = startupResult.remoteFingerprint || "";
  const shouldAutosaveStartupDiff = Boolean(
    authState.authenticated
    && normalizeProfile(store.profile).autosaveEnabled
    && startupRemoteFingerprint
    && startupRemoteFingerprint !== currentFingerprint
  );

  if (shouldAutosaveStartupDiff) {
    const autosaveResult = await autosaveController.attemptAutosave();
    if (autosaveResult?.success) {
      autosaveController.markCurrentAsSaved();
    }
  } else if (startupResult.loaded && startupResult.synced) {
    autosaveController.markCurrentAsSaved();
  }
  autosaveController.refreshSchedule();

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
  renderSyncMeta();
}

async function handleManualLoadFromDrive() {
  const result = await loadFromDrive();
  if (result?.found) {
    rememberRemoteStoreState({
      updatedAt: result.remoteUpdatedAt,
      fingerprint: result.remoteFingerprint,
      savedAt: result.remoteSavedAt,
      userUpdatedAt: result.remoteUserUpdatedAt,
      userFingerprint: result.remoteUserFingerprint
    });
  } else if (result && result.found === false) {
    clearRemoteStoreState();
  }
  autosaveController.refreshSchedule();
  if (result?.applied && result.synced) {
    autosaveController.markCurrentAsSaved();
  }
  renderSyncMeta();
}

async function handleManualSaveToDrive() {
  await saveCurrentStoreToDrive({ quiet: false, force: false, mode: "manual" });
}

async function saveCurrentStoreToDrive({ quiet = false, force = false, mode = "manual" } = {}) {
  if (driveSaveState.inFlight) {
    return { success: false, skipped: true };
  }
  setDriveSaveInFlight(true, mode);
  try {
    const result = await saveToDrive({ quiet, force });
    if (result?.success) {
      rememberRemoteStoreState({
        updatedAt: result.remoteUpdatedAt,
        fingerprint: result.remoteFingerprint,
        savedAt: result.remoteSavedAt,
        userUpdatedAt: result.remoteUserUpdatedAt,
        userFingerprint: result.remoteUserFingerprint
      });
      autosaveController.markCurrentAsSaved();
    }
    return result;
  } finally {
    setDriveSaveInFlight(false);
    renderSyncMeta();
  }
}

function finalizeStoreState() {
  const before = JSON.stringify(store);
  ensureWidgetIntegrity();
  cleanupDetachedWidgetTasks();
  cleanupLegacyWidgetArtifacts();
  reconcileRecurringSeries();
  ensureWidgetTasks();
  cleanupLegacyWidgetArtifacts();
  normalizeTaskHistoriesInStore();
  repairTaskStatusFromHistory();
  if (JSON.stringify(store) !== before) {
    persistStore({ touchUserUpdatedAt: false });
  }
}

function normalizeTaskHistoriesInStore() {
  let changed = false;

  for (const task of store.tasks) {
    const currentHistory = Array.isArray(task.history) ? task.history : [];
    const compactedHistory = compactTaskHistory(currentHistory);
    if (compactedHistory.length !== currentHistory.length) {
      task.history = compactedHistory;
      changed = true;
      continue;
    }
    for (let index = 0; index < compactedHistory.length; index += 1) {
      if (compactedHistory[index]?.id !== currentHistory[index]?.id) {
        task.history = compactedHistory;
        changed = true;
        break;
      }
    }
  }

  return changed;
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (!widgetMenu.classList.contains("hidden")) {
    closeWidgetMenu();
    return;
  }

  if (isNotificationsOpen()) {
    closeNotifications();
    return;
  }

  if (isSettingsOpen()) {
    closeSettings();
    return;
  }

  if (isQuickAddOpen()) {
    closeQuickAdd();
    return;
  }

  if (isCanopyDetailOpen()) {
    closeCanopyDetail();
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

function openQuickAdd() {
  closeCanopyDetail();
  resetQuickAddForm();
  quickAddModal.classList.remove("hidden");
  quickAddModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("quick-add-open");
  window.setTimeout(() => quickTaskNameInput.focus(), 0);
}

function openCanopyDetail(kind, columnKey, groupKey = "") {
  canopyState.detail.kind = kind;
  canopyState.detail.columnKey = columnKey;
  canopyState.detail.groupKey = groupKey;
  canopyDetailModal.classList.remove("hidden");
  canopyDetailModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("canopy-detail-open");
  renderCanopyDetailIfOpen();
}

function closeCanopyDetail() {
  canopyState.detail.kind = "";
  canopyState.detail.columnKey = "";
  canopyState.detail.groupKey = "";
  canopyDetailModal.classList.add("hidden");
  canopyDetailModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("canopy-detail-open");
}

function isCanopyDetailOpen() {
  return !canopyDetailModal.classList.contains("hidden");
}

function openSettings() {
  if (isNotificationsOpen()) {
    closeNotifications();
  }
  const profile = normalizeProfile(store.profile);
  settingsDisplayNameInput.value = profile.displayName;
  settingsAutosaveEnabledInput.checked = profile.autosaveEnabled;
  settingsAutosaveIntervalInput.value = String(profile.autosaveIntervalMinutes);
  settingsDarkModeEnabledInput.checked = profile.darkModeEnabled;
  settingsAutoDarkModeEnabledInput.checked = profile.autoDarkModeEnabled;
  settingsAutoDarkModeStartInput.value = profile.autoDarkModeStart;
  settingsAutoDarkModeEndInput.value = profile.autoDarkModeEnd;
  settingsHelpTextEnabledInput.checked = profile.helpTextEnabled;
  settingsHelpTooltipDelayInput.value = String(profile.helpTooltipDelayMs);
  syncSettingsAutosaveInputs();
  syncSettingsThemeInputs();
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
  window.setTimeout(() => settingsDisplayNameInput.focus(), 0);
}

function openNotifications() {
  if (isSettingsOpen()) {
    closeSettings();
  }
  const notifications = normalizeNotifications(store.notifications);
  const summaries = notifications.email.summaries;
  const reminders = notifications.email.reminders;
  const include = summaries.include;
  notificationsSummaryEnabledInput.checked = summaries.enabled;
  notificationsRecipientEmailInput.value = notifications.email.recipientEmail || authState.user?.email || "";
  notificationsSendTimeInput.value = summaries.sendTime;
  notificationsFrequencyInput.value = summaries.frequency;
  notificationsWeekdayInput.value = String(summaries.weekday);
  notificationsRemindersEnabledInput.checked = reminders.enabled;
  notificationsReminderDueSoonEnabledInput.checked = reminders.dueSoonEnabled;
  notificationsReminderOverdueEnabledInput.checked = reminders.overdueEnabled;
  notificationsReminderDailyAgendaEnabledInput.checked = reminders.dailyAgendaEnabled;
  notificationsReminderDailyAgendaTimeInput.value = reminders.dailyAgendaTime;
  notificationsReminderQuietHoursEnabledInput.checked = reminders.quietHoursEnabled;
  notificationsReminderQuietHoursStartInput.value = reminders.quietHoursStart;
  notificationsReminderQuietHoursEndInput.value = reminders.quietHoursEnd;
  notificationsIncludeOverdueInput.checked = include.overdue;
  notificationsIncludeDueSoonInput.checked = include.dueSoon;
  notificationsIncludeCompletedInput.checked = include.completed;
  notificationsIncludeRecurringProgressInput.checked = include.recurringProgress;
  notificationsIncludeTreePointsInput.checked = include.treePoints;
  notificationsIncludeWidgetHighlightsInput.checked = include.widgetHighlights;
  syncNotificationsInputs();
  notificationsModal.classList.remove("hidden");
  notificationsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("notifications-open");
  renderNotificationsIfOpen();
  window.setTimeout(() => notificationsRecipientEmailInput.focus(), 0);
}

function closeQuickAdd() {
  quickAddModal.classList.add("hidden");
  quickAddModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("quick-add-open");
}

function isQuickAddOpen() {
  return !quickAddModal.classList.contains("hidden");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
}

function isSettingsOpen() {
  return !settingsModal.classList.contains("hidden");
}

function closeNotifications() {
  notificationsModal.classList.add("hidden");
  notificationsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("notifications-open");
}

function isNotificationsOpen() {
  return !notificationsModal.classList.contains("hidden");
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

function applyTaskDeskPaneState() {
  const mobile = mobileTaskDeskQuery.matches;
  for (const pane of taskDeskPanes) {
    const active = pane.dataset.deskPane === activeTaskDeskPane;
    pane.classList.toggle("is-active", !mobile || active);
    pane.setAttribute("aria-hidden", mobile && !active ? "true" : "false");
  }
  for (const button of taskDeskPaneButtons) {
    const active = button.dataset.deskPaneButton === activeTaskDeskPane;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function setActiveTaskDeskPane(pane) {
  if (!taskDeskPanes.some((entry) => entry.dataset.deskPane === pane)) {
    activeTaskDeskPane = "tasks";
  } else {
    activeTaskDeskPane = pane;
  }
  applyTaskDeskPaneState();
}

function handleTaskDeskTabClick(event) {
  const button = event.target.closest("[data-desk-pane-button]");
  if (!button) {
    return;
  }
  setActiveTaskDeskPane(button.getAttribute("data-desk-pane-button") || "tasks");
}

function handleOpenTaskDesk(preferredPane = "tasks") {
  if (isCanopyDetailOpen()) {
    closeCanopyDetail();
  }
  if (isQuickAddOpen()) {
    closeQuickAdd();
  }
  setActiveTaskDeskPane(preferredPane);
  openTaskDesk();
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
  const darkModeEnabled = settingsDarkModeEnabledInput.checked;
  const autoDarkModeEnabled = settingsAutoDarkModeEnabledInput.checked;
  const autoDarkModeStart = normalizeThemeTime(settingsAutoDarkModeStartInput.value, currentProfile.autoDarkModeStart);
  const autoDarkModeEnd = normalizeThemeTime(settingsAutoDarkModeEndInput.value, currentProfile.autoDarkModeEnd);
  const helpTextEnabled = settingsHelpTextEnabledInput.checked;
  const helpTooltipDelayMs = normalizeHelpTooltipDelayMs(settingsHelpTooltipDelayInput.value);
  const unchanged = (
    displayName === currentProfile.displayName
    && autosaveEnabled === currentProfile.autosaveEnabled
    && autosaveIntervalMinutes === currentProfile.autosaveIntervalMinutes
    && darkModeEnabled === currentProfile.darkModeEnabled
    && autoDarkModeEnabled === currentProfile.autoDarkModeEnabled
    && autoDarkModeStart === currentProfile.autoDarkModeStart
    && autoDarkModeEnd === currentProfile.autoDarkModeEnd
    && helpTextEnabled === currentProfile.helpTextEnabled
    && helpTooltipDelayMs === currentProfile.helpTooltipDelayMs
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
    darkModeEnabled,
    autoDarkModeEnabled,
    autoDarkModeStart,
    autoDarkModeEnd,
    helpTextEnabled,
    helpTooltipDelayMs,
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

function syncSettingsThemeInputs() {
  const enabled = settingsAutoDarkModeEnabledInput.checked;
  settingsAutoDarkModeStartInput.disabled = !enabled;
  settingsAutoDarkModeEndInput.disabled = !enabled;
}

function syncNotificationsInputs() {
  const weekly = notificationsFrequencyInput.value === "weekly";
  notificationsWeekdayRow.classList.toggle("hidden", !weekly);
  notificationsWeekdayInput.disabled = !weekly;
  const remindersEnabled = notificationsRemindersEnabledInput.checked;
  notificationsReminderDueSoonEnabledInput.disabled = !remindersEnabled;
  notificationsReminderOverdueEnabledInput.disabled = !remindersEnabled;
  notificationsReminderDailyAgendaEnabledInput.disabled = !remindersEnabled;
  notificationsReminderQuietHoursEnabledInput.disabled = !remindersEnabled;
  notificationsReminderDailyAgendaTimeInput.disabled = !remindersEnabled || !notificationsReminderDailyAgendaEnabledInput.checked;
  notificationsReminderQuietHoursStartInput.disabled = !remindersEnabled || !notificationsReminderQuietHoursEnabledInput.checked;
  notificationsReminderQuietHoursEndInput.disabled = !remindersEnabled || !notificationsReminderQuietHoursEnabledInput.checked;
}

function syncNotificationActionState(draft = null) {
  const nextDraft = draft || readNotificationsDraft();
  const reminderTemplates = buildEmailReminderTemplatesShared({
    store,
    emailConfig: nextDraft,
    now: new Date(),
    fallbackRecipientEmail: authState.user?.email || ""
  });
  const canSendBase = Boolean(authState.authenticated && nextDraft.recipientEmail && !notificationSendState.inFlight);
  sendNotificationSummaryButton.disabled = !canSendBase;
  sendNotificationSummaryButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "summary"
    ? "Sending…"
    : "Send summary now";
  sendNotificationSummaryButton.title = !authState.authenticated
    ? "Connect Google to send summaries from the authenticated Gmail account."
    : !nextDraft.recipientEmail
      ? "Choose a recipient email before sending a summary."
      : "";
  sendNotificationReminderButton.disabled = !canSendBase || reminderTemplates.length === 0;
  sendNotificationReminderButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "reminder"
    ? "Sending…"
    : "Send reminders now";
  sendNotificationReminderButton.title = !authState.authenticated
    ? "Connect Google to send reminders from the authenticated Gmail account."
    : !nextDraft.recipientEmail
      ? "Choose a recipient email before sending reminders."
      : reminderTemplates.length === 0
        ? "No reminder emails are due right now."
        : "";
}

function handleNotificationsFormChange() {
  syncNotificationsInputs();
  renderNotificationsIfOpen();
}

function readNotificationsDraft() {
  const current = normalizeNotifications(store.notifications).email;
  const currentTimezone = normalizeNotificationTimezone(
    current.summaries.timezone,
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
  );
  return {
    recipientEmail: normalizeRecipientEmail(
      notificationsRecipientEmailInput?.value
      || current.recipientEmail
      || authState.user?.email
      || ""
    ),
    summaries: normalizeEmailSummaryConfig({
      enabled: notificationsSummaryEnabledInput.checked,
      frequency: notificationsFrequencyInput.value,
      sendTime: normalizeNotificationTime(notificationsSendTimeInput.value, current.summaries.sendTime),
      weekday: normalizeWeekday(notificationsWeekdayInput.value, current.summaries.weekday),
      timezone: currentTimezone,
      include: {
        overdue: notificationsIncludeOverdueInput.checked,
        dueSoon: notificationsIncludeDueSoonInput.checked,
        completed: notificationsIncludeCompletedInput.checked,
        recurringProgress: notificationsIncludeRecurringProgressInput.checked,
        treePoints: notificationsIncludeTreePointsInput.checked,
        widgetHighlights: notificationsIncludeWidgetHighlightsInput.checked
      },
      updatedAt: current.summaries.updatedAt
    }),
    reminders: normalizeEmailReminderConfig({
      enabled: notificationsRemindersEnabledInput.checked,
      dueSoonEnabled: notificationsReminderDueSoonEnabledInput.checked,
      overdueEnabled: notificationsReminderOverdueEnabledInput.checked,
      dailyAgendaEnabled: notificationsReminderDailyAgendaEnabledInput.checked,
      dailyAgendaTime: normalizeNotificationTime(notificationsReminderDailyAgendaTimeInput.value, current.reminders.dailyAgendaTime),
      quietHoursEnabled: notificationsReminderQuietHoursEnabledInput.checked,
      quietHoursStart: normalizeNotificationTime(notificationsReminderQuietHoursStartInput.value, current.reminders.quietHoursStart),
      quietHoursEnd: normalizeNotificationTime(notificationsReminderQuietHoursEndInput.value, current.reminders.quietHoursEnd),
      updatedAt: current.reminders.updatedAt
    }),
    history: current.history,
    updatedAt: current.updatedAt
  };
}

function persistNotificationsDraft(draft, { history = draft.history, updatedAt = Date.now() } = {}) {
  store.notifications = normalizeNotifications({
    ...store.notifications,
    email: {
      ...normalizeNotifications(store.notifications).email,
      recipientEmail: normalizeRecipientEmail(draft.recipientEmail || authState.user?.email || ""),
      summaries: normalizeEmailSummaryConfig({
        ...draft.summaries,
        updatedAt
      }),
      reminders: normalizeEmailReminderConfig({
        ...draft.reminders,
        updatedAt
      }),
      history,
      updatedAt
    }
  });
  persistStore();
  renderNotificationsIfOpen();
}

function buildSummarySendDraft(baseDraft, { frequencyOverride = "" } = {}) {
  return {
    ...baseDraft,
    summaries: normalizeEmailSummaryConfig({
      ...baseDraft.summaries,
      frequency: frequencyOverride || baseDraft.summaries.frequency,
      updatedAt: baseDraft.summaries.updatedAt
    })
  };
}

async function sendNotificationEmailDraft({
  kind = "summary",
  draft = readNotificationsDraft(),
  buildPreview,
  renderHtml,
  renderText,
  endpoint,
  requireContent = false,
  successMessage = "",
  missingRecipientMessage = "",
  missingAuthMessage = "",
  failurePrefix = "Notification send failed",
  historyEntry = () => ({})
} = {}) {
  const kindLabel = kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}` : "Notification";
  if (!draft.recipientEmail) {
    setSyncStatus(missingRecipientMessage, "error");
    return { success: false };
  }

  if (!authState.authenticated) {
    const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
    if (!authenticated) {
      setSyncStatus(missingAuthMessage, "error");
      renderNotificationsIfOpen();
      return { success: false };
    }
  }

  const now = new Date();
  const preview = buildPreview(now);
  if (!preview.recipientEmail) {
    setSyncStatus(missingRecipientMessage, "error");
    return { success: false };
  }
  if (requireContent && preview.sections.length === 0) {
    setSyncStatus("No matching notification items are due right now.", "info");
    return { success: false };
  }

  const requestBody = {
    recipientEmail: preview.recipientEmail,
    subject: preview.subject,
    html: renderHtml(preview),
    text: renderText(preview)
  };

  setNotificationSendInFlight(true, kind);
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: FETCH_CREDENTIALS,
      body: JSON.stringify(requestBody)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `${kindLabel} send failed`);
    }

    const history = appendNotificationHistoryEntry(
      normalizeNotifications(store.notifications).email.history,
      {
        id: createId(),
        at: typeof payload.sentAt === "number" ? payload.sentAt : Date.now(),
        status: "sent",
        kind,
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        ...historyEntry(preview, now)
      }
    );
    persistNotificationsDraft({ ...draft, history }, {
      history,
      updatedAt: Date.now()
    });
    await saveCurrentStoreToDrive({ quiet: true, force: true, mode: "manual" });
    setSyncStatus(successMessage || `Sent ${kind} email to ${preview.recipientEmail}.`, "success");
    return { success: true, preview, history };
  } catch (error) {
    const message = String(error?.message || `${kindLabel} send failed`);
    const history = appendNotificationHistoryEntry(
      normalizeNotifications(store.notifications).email.history,
      {
        id: createId(),
        at: Date.now(),
        status: "error",
        kind,
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        ...historyEntry(preview, now)
      }
    );
    persistNotificationsDraft({ ...draft, history }, {
      history,
      updatedAt: Date.now()
    });
    if (message.includes("insufficientPermissions")) {
      setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the notification again.", "error");
    } else if (message === "Not authenticated") {
      setSyncStatus(missingAuthMessage, "error");
    } else {
      setSyncStatus(`${failurePrefix}: ${message}`, "error");
    }
    return { success: false, error: message };
  } finally {
    setNotificationSendInFlight(false, "");
  }
}

async function sendNotificationSummaryDraft({
  draft = readNotificationsDraft(),
  frequencyOverride = "",
  successMessage = "",
  failurePrefix = "Summary send failed"
} = {}) {
  const sendDraft = buildSummarySendDraft(draft, { frequencyOverride });
  return sendNotificationEmailDraft({
    kind: "summary",
    draft: sendDraft,
    endpoint: "/api/notifications/send-summary",
    requireContent: false,
    successMessage: successMessage || `Sent summary to ${sendDraft.recipientEmail}.`,
    missingRecipientMessage: "Choose a recipient email before sending a summary.",
    missingAuthMessage: "Connect Google first to send email summaries.",
    failurePrefix,
    buildPreview: (now) => buildEmailSummaryPreviewShared({
      store,
      emailConfig: sendDraft,
      now,
      fallbackRecipientEmail: authState.user?.email || ""
    }),
    renderHtml: renderEmailSummaryBodyHtmlShared,
    renderText: renderEmailSummaryBodyTextShared,
    historyEntry: (_preview, now) => ({
      summaryKey: buildEmailSummaryKeyShared(sendDraft.summaries, now)
    })
  });
}

function handleNotificationsSubmit(event) {
  event.preventDefault();
  const current = normalizeNotifications(store.notifications).email;
  const currentTimezone = normalizeNotificationTimezone(
    current.summaries.timezone,
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
  );
  const nextRecipientEmail = normalizeRecipientEmail(
    notificationsRecipientEmailInput.value
    || current.recipientEmail
    || authState.user?.email
    || ""
  );
  const comparableSummaries = normalizeEmailSummaryConfig({
    enabled: notificationsSummaryEnabledInput.checked,
    frequency: notificationsFrequencyInput.value,
    sendTime: normalizeNotificationTime(notificationsSendTimeInput.value, current.summaries.sendTime),
    weekday: normalizeWeekday(notificationsWeekdayInput.value, current.summaries.weekday),
    timezone: currentTimezone,
    include: {
      overdue: notificationsIncludeOverdueInput.checked,
      dueSoon: notificationsIncludeDueSoonInput.checked,
      completed: notificationsIncludeCompletedInput.checked,
      recurringProgress: notificationsIncludeRecurringProgressInput.checked,
      treePoints: notificationsIncludeTreePointsInput.checked,
      widgetHighlights: notificationsIncludeWidgetHighlightsInput.checked
    },
    updatedAt: current.summaries.updatedAt
  });
  const nextSummaries = normalizeEmailSummaryConfig({
    ...comparableSummaries,
    updatedAt: Date.now()
  });
  const comparableReminders = normalizeEmailReminderConfig({
    enabled: notificationsRemindersEnabledInput.checked,
    dueSoonEnabled: notificationsReminderDueSoonEnabledInput.checked,
    overdueEnabled: notificationsReminderOverdueEnabledInput.checked,
    dailyAgendaEnabled: notificationsReminderDailyAgendaEnabledInput.checked,
    dailyAgendaTime: normalizeNotificationTime(notificationsReminderDailyAgendaTimeInput.value, current.reminders.dailyAgendaTime),
    quietHoursEnabled: notificationsReminderQuietHoursEnabledInput.checked,
    quietHoursStart: normalizeNotificationTime(notificationsReminderQuietHoursStartInput.value, current.reminders.quietHoursStart),
    quietHoursEnd: normalizeNotificationTime(notificationsReminderQuietHoursEndInput.value, current.reminders.quietHoursEnd),
    updatedAt: current.reminders.updatedAt
  });
  const nextReminders = normalizeEmailReminderConfig({
    ...comparableReminders,
    updatedAt: Date.now()
  });

  if ((nextSummaries.enabled || nextReminders.enabled) && !nextRecipientEmail) {
    setSyncStatus("Choose a recipient email before enabling email notifications.", "error");
    return;
  }

  const unchanged = (
    nextRecipientEmail === current.recipientEmail
    && JSON.stringify(comparableSummaries) === JSON.stringify(current.summaries)
    && JSON.stringify(comparableReminders) === JSON.stringify(current.reminders)
  );
  if (unchanged) {
    closeNotifications();
    return;
  }

  persistNotificationsDraft({
    recipientEmail: nextRecipientEmail,
    summaries: nextSummaries,
    reminders: nextReminders,
    history: current.history,
    updatedAt: current.updatedAt
  }, {
    history: current.history,
    updatedAt: Date.now()
  });
  closeNotifications();
  setSyncStatus(nextSummaries.enabled || nextReminders.enabled ? "Saved email notification settings." : "Saved notification settings.", "info");
}

function renderNotificationsIfOpen() {
  if (!isNotificationsOpen()) {
    return;
  }

  const draft = readNotificationsDraft();
  const summaryPreview = buildEmailSummaryPreviewShared({
    store,
    emailConfig: draft,
    now: new Date(),
    fallbackRecipientEmail: authState.user?.email || ""
  });
  const reminderTemplates = buildEmailReminderTemplatesShared({
    store,
    emailConfig: draft,
    now: new Date(),
    fallbackRecipientEmail: authState.user?.email || ""
  });
  notificationsPreview.innerHTML = renderNotificationsPreview(summaryPreview, reminderTemplates);
  notificationsHistory.innerHTML = renderNotificationHistory(draft.history);
  syncNotificationActionState(draft);
}

function setNotificationSendInFlight(inFlight, kind = "") {
  notificationSendState.inFlight = Boolean(inFlight);
  notificationSendState.kind = inFlight ? kind : "";
  syncNotificationActionState();
  if (isDeveloperUser()) {
    renderDeveloperPanel();
  }
}

async function handleSendNotificationSummary() {
  await sendNotificationSummaryDraft({
    draft: readNotificationsDraft(),
    successMessage: "",
    failurePrefix: "Summary send failed"
  });
}

async function sendNotificationReminderDraft({
  draft = readNotificationsDraft(),
  includeKinds = null,
  requireDailyAgendaTime = false,
  successMessage = "",
  failurePrefix = "Reminder send failed"
} = {}) {
  if (!draft.recipientEmail) {
    setSyncStatus("Choose a recipient email before sending reminders.", "error");
    return { success: false };
  }

  if (!authState.authenticated) {
    const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
    if (!authenticated) {
      setSyncStatus("Connect Google first to send email reminders.", "error");
      renderNotificationsIfOpen();
      return { success: false };
    }
  }

  const now = new Date();
  const reminderTemplates = buildEmailReminderTemplatesShared({
    store,
    emailConfig: draft,
    now,
    fallbackRecipientEmail: authState.user?.email || "",
    includeKinds,
    requireDailyAgendaTime
  });
  if (reminderTemplates.length === 0) {
    setSyncStatus("No matching reminder emails are due right now.", "info");
    return { success: false };
  }

  setNotificationSendInFlight(true, "reminder");
  let history = normalizeNotifications(store.notifications).email.history;
  let sentCount = 0;
  try {
    for (const preview of reminderTemplates) {
      const response = await fetch(`${API_BASE}/api/notifications/send-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: FETCH_CREDENTIALS,
        body: JSON.stringify({
          recipientEmail: preview.recipientEmail,
          subject: preview.subject,
          html: renderEmailReminderBodyHtmlShared(preview),
          text: renderEmailReminderBodyTextShared(preview)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Reminder send failed");
      }
      history = appendNotificationHistoryEntry(history, {
        id: createId(),
        at: typeof payload.sentAt === "number" ? payload.sentAt : Date.now(),
        status: "sent",
        kind: "reminder",
        reminderTemplateKind: preview.templateKind || "",
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        reminderKey: preview.reminderKey || "",
        reminderEventKeys: Array.isArray(preview.eventKeys) ? preview.eventKeys : []
      });
      sentCount += 1;
    }

    persistNotificationsDraft({ ...draft, history }, {
      history,
      updatedAt: Date.now()
    });
    await saveCurrentStoreToDrive({ quiet: true, force: true, mode: "manual" });
    setSyncStatus(successMessage || `Sent ${sentCount} reminder email${sentCount === 1 ? "" : "s"} to ${draft.recipientEmail}.`, "success");
    return { success: true, history, count: sentCount };
  } catch (error) {
    const message = String(error?.message || "Reminder send failed");
    if (message.includes("insufficientPermissions")) {
      setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the notification again.", "error");
    } else if (message === "Not authenticated") {
      setSyncStatus("Connect Google first to send email reminders.", "error");
    } else {
      setSyncStatus(`${failurePrefix}: ${message}`, "error");
    }
    return { success: false, error: message };
  } finally {
    setNotificationSendInFlight(false, "");
  }
}

async function handleSendNotificationReminder() {
  await sendNotificationReminderDraft({
    draft: readNotificationsDraft(),
    successMessage: "",
    failurePrefix: "Reminder send failed"
  });
}

function handleThemeSettingModeChange(event) {
  if (event.currentTarget === settingsDarkModeEnabledInput && settingsDarkModeEnabledInput.checked) {
    settingsAutoDarkModeEnabledInput.checked = false;
  }
  if (event.currentTarget === settingsAutoDarkModeEnabledInput && settingsAutoDarkModeEnabledInput.checked) {
    settingsDarkModeEnabledInput.checked = false;
  }
  syncSettingsThemeInputs();
}

function getHelpTooltipDelay() {
  return normalizeHelpTooltipDelayMs(store.profile?.helpTooltipDelayMs);
}

function clearHelpTooltipTimer() {
  if (helpTooltipState.timerId) {
    window.clearTimeout(helpTooltipState.timerId);
    helpTooltipState.timerId = 0;
  }
}

function hideHelpTooltip() {
  clearHelpTooltipTimer();
  helpTooltip.classList.add("hidden");
  helpTooltip.setAttribute("aria-hidden", "true");
  helpTooltip.textContent = "";
  helpTooltipState.target = null;
  helpTooltipState.mode = "";
  helpTooltipState.consumeNextClick = false;
  helpTooltipState.pressPointerId = null;
}

function scheduleHelpTooltip(target, { mode, anchorX = 0, anchorY = 0 }) {
  if (!target?.dataset?.help) {
    return;
  }
  clearHelpTooltipTimer();
  helpTooltipState.target = target;
  helpTooltipState.mode = mode;
  helpTooltipState.anchorX = anchorX;
  helpTooltipState.anchorY = anchorY;
  helpTooltipState.timerId = window.setTimeout(() => {
    showHelpTooltip(target);
  }, getHelpTooltipDelay());
}

function showHelpTooltip(target) {
  if (!target?.dataset?.help) {
    return;
  }

  helpTooltip.textContent = target.dataset.help;
  helpTooltip.classList.remove("hidden");
  helpTooltip.setAttribute("aria-hidden", "false");
  positionHelpTooltip(target);
  helpTooltipState.target = target;
  if (helpTooltipState.mode === "touch") {
    helpTooltipState.consumeNextClick = true;
  }
}

function positionHelpTooltip(target) {
  const tooltipRect = helpTooltip.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const prefersPointerAnchor = helpTooltipState.mode === "touch"
    && Number.isFinite(helpTooltipState.anchorX)
    && Number.isFinite(helpTooltipState.anchorY)
    && helpTooltipState.anchorX > 0
    && helpTooltipState.anchorY > 0;

  let left = prefersPointerAnchor
    ? helpTooltipState.anchorX - (tooltipRect.width / 2)
    : targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
  left = Math.max(12, Math.min(viewportWidth - tooltipRect.width - 12, left));

  let top = targetRect.top - tooltipRect.height - 12;
  if (prefersPointerAnchor) {
    top = helpTooltipState.anchorY - tooltipRect.height - 14;
  }
  if (top < 12) {
    top = Math.min(viewportHeight - tooltipRect.height - 12, targetRect.bottom + 12);
  }

  helpTooltip.style.left = `${left}px`;
  helpTooltip.style.top = `${top}px`;
}

function handleHelpPointerOver(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }
  const target = event.target.closest("[data-help]");
  if (!target) {
    return;
  }
  const related = event.relatedTarget?.closest?.("[data-help]") || null;
  if (related === target) {
    return;
  }
  scheduleHelpTooltip(target, {
    mode: "hover",
    anchorX: event.clientX,
    anchorY: event.clientY
  });
}

function handleHelpPointerOut(event) {
  const target = event.target.closest("[data-help]");
  if (!target) {
    return;
  }
  const related = event.relatedTarget?.closest?.("[data-help]") || null;
  if (related === target) {
    return;
  }
  if (helpTooltipState.target === target) {
    hideHelpTooltip();
    return;
  }
  clearHelpTooltipTimer();
}

function handleHelpPointerDown(event) {
  const target = event.target.closest("[data-help]");
  if (!target) {
    if (helpTooltipState.mode === "touch") {
      hideHelpTooltip();
    }
    return;
  }
  if (event.pointerType === "mouse") {
    return;
  }

  helpTooltipState.pressPointerId = event.pointerId;
  helpTooltipState.pressStartX = event.clientX;
  helpTooltipState.pressStartY = event.clientY;
  helpTooltipState.consumeNextClick = false;
  scheduleHelpTooltip(target, {
    mode: "touch",
    anchorX: event.clientX,
    anchorY: event.clientY
  });
}

function handleHelpPointerUp(event) {
  if (helpTooltipState.pressPointerId !== event.pointerId) {
    return;
  }
  helpTooltipState.pressPointerId = null;
  clearHelpTooltipTimer();
}

function handleHelpPointerCancel(event) {
  if (helpTooltipState.pressPointerId !== event.pointerId) {
    return;
  }
  hideHelpTooltip();
}

function handleHelpPointerMove(event) {
  if (helpTooltipState.pressPointerId !== event.pointerId) {
    return;
  }
  const movedX = Math.abs(event.clientX - helpTooltipState.pressStartX);
  const movedY = Math.abs(event.clientY - helpTooltipState.pressStartY);
  if (movedX > 8 || movedY > 8) {
    hideHelpTooltip();
  }
}

function handleHelpTooltipClick(event) {
  if (!helpTooltipState.consumeNextClick) {
    return;
  }
  helpTooltipState.consumeNextClick = false;
  hideHelpTooltip();
  event.preventDefault();
  event.stopPropagation();
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

  if (action === "cancel-widget-menu") {
    closeWidgetMenu();
    return;
  }

  if (action === "choose-widget-type") {
    addWidgetTypeToSelectedSlot(actionTarget.getAttribute("data-widget-type") || "");
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
      createId,
      applyAutoSkipRules,
      completeNextTaskFromWidget,
      completeWidgetTaskById,
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
    handleOpenTaskDesk("tasks");
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

function handleWidgetSlotSubmit(event) {
  const slot = event.currentTarget;
  const slotIndex = Number(slot.getAttribute("data-slot-index"));
  const formTarget = event.target.closest("form");
  if (!formTarget) {
    return;
  }

  const widget = store.widgets.find((item) => item.slotIndex === slotIndex);
  const definition = getWidgetDefinition(widget?.type);
  if (!widget || !definition?.handleSubmit) {
    return;
  }

  if (definition.handleSubmit({
    form: formTarget,
    widget,
    helpers: {
      getStore: () => store,
      createId,
      applyAutoSkipRules,
      completeNextTaskFromWidget,
      completeWidgetTaskById,
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
    event.preventDefault();
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
      applyAutoSkipRules,
      resolveCategorySnapshot,
      openTaskDesk: handleOpenTaskDesk,
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
      completeWidgetTaskById,
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

  const action = actionTarget.getAttribute("data-canopy-action");
  if (action === "show-column") {
    const columnKey = actionTarget.getAttribute("data-column-key") || "today";
    openCanopyDetail("column", columnKey);
    return;
  }

  if (action === "open-group") {
    const columnKey = actionTarget.getAttribute("data-column-key") || "today";
    const groupKey = actionTarget.getAttribute("data-group-key") || "";
    openCanopyDetail("group", columnKey, groupKey);
    return;
  }

  if (action === "collect-group-bonus") {
    const columnKey = actionTarget.getAttribute("data-column-key") || "today";
    const groupKey = actionTarget.getAttribute("data-group-key") || "";
    const group = findCanopyRecurringGroup(columnKey, groupKey);
    if (!group) {
      return;
    }
    collectRecurringGroupBonus(group);
    return;
  }

  if (action === "undo-group-bonus") {
    const pendingKey = actionTarget.getAttribute("data-pending-key") || "";
    if (pendingKey) {
      undoPendingAction(pendingKey, "Undid the pending recurring bonus collection.");
    }
    return;
  }

  if (action === "undo") {
    const pendingKey = actionTarget.getAttribute("data-pending-key");
    if (pendingKey) {
      undoPendingAction(pendingKey, "Undid the pending canopy action.");
    }
    return;
  }

  const taskId = actionTarget.getAttribute("data-task-id");
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task || task.archived) {
    return;
  }
  const pendingAction = getPendingActionForTask(taskId);

  if (pendingAction) {
    return;
  }

  if (action === "reopen-group-task") {
    if (task.status !== "done" && task.status !== "skipped") {
      return;
    }
    markTaskOpen(task);
    reconcileRecurringSeries();
    persistStore();
    renderAll();
    setSyncStatus(`Marked ${task.name} incomplete for this period.`, "info");
    return;
  }

  if (action === "complete-group-task") {
    if (task.status !== "open") {
      return;
    }
    if (isBlocked(task)) {
      setSyncStatus(describeBlockedTask(task), "error");
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

  if (action === "skip-group-task") {
    if (task.status !== "open") {
      return;
    }
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
        return { message: `Skipped ${nextTask.name} for this period.`, tone: "info" };
      }
    });
    return;
  }

  if (task.status !== "open") {
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

  if (action === "edit") {
    closeCanopyDetail();
    beginEdit(task, "single");
    handleOpenTaskDesk("composer");
    setSyncStatus(`Editing ${task.name} in Task Desk.`, "info");
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

function handleCanopyChange(event) {
  const selection = event.target.closest("[data-canopy-bonus-select]");
  if (!selection) {
    return;
  }

  const columnKey = selection.getAttribute("data-column-key") || "today";
  const groupKey = selection.getAttribute("data-group-key") || "";
  const group = findCanopyRecurringGroup(columnKey, groupKey);
  if (!group?.bonus) {
    return;
  }

  const categoryKey = String(selection.value || "");
  if (!group.bonus.allowedCategories.some((category) => category.key === categoryKey)) {
    return;
  }

  if (setRecurringBonusSelection(group.bonus.key, categoryKey)) {
    persistStore();
    renderAll();
  }
}

function findCanopyRecurringGroup(columnKey, groupKey) {
  return canopyState.columns
    .find((column) => column.key === columnKey)
    ?.recurringGroups.find((group) => group.key === groupKey) || null;
}

function findCanopyRecurringGroupByBonusKey(bonusKey) {
  for (const column of canopyState.columns) {
    const match = column.recurringGroups.find((group) => group.bonus?.key === bonusKey);
    if (match) {
      return match;
    }
  }
  return null;
}

function collectRecurringGroupBonus(group) {
  const bonus = group?.bonus;
  if (!bonus) {
    return;
  }

  if (bonus.pendingAction) {
    return;
  }

  if (bonus.claimed) {
    setSyncStatus(`${group.label} bonus has already been collected for this ${bonus.periodLabel}.`, "info");
    return;
  }

  if (!bonus.collectible) {
    setSyncStatus(`Complete every ${group.label.toLowerCase()} task in this ${bonus.periodLabel} before collecting the bonus.`, "error");
    return;
  }

  const category = bonus.selectedCategory || bonus.allowedCategories[0] || null;
  if (!category) {
    setSyncStatus("No eligible bonus category is available for that recurring group.", "error");
    return;
  }

  stagePendingAction({
    key: `collect-bonus:${bonus.key}`,
    description: `Pending ${group.label.toLowerCase()} bonus collection in ${category.label}. Click undo within 5 seconds to cancel.`,
    commit: () => {
      const currentGroup = findCanopyRecurringGroupByBonusKey(bonus.key);
      const currentBonus = currentGroup?.bonus || null;
      if (!currentGroup || !currentBonus || currentBonus.claimed || !currentBonus.collectible) {
        return false;
      }

      const currentCategory = currentBonus.selectedCategory || currentBonus.allowedCategories[0] || null;
      if (!currentCategory) {
        return false;
      }

      recordPointEntry({
        id: createId(),
        taskId: "",
        taskName: `${currentGroup.label} bonus`,
        at: Date.now(),
        points: currentBonus.points,
        categoryKey: currentCategory.key,
        categoryLabel: currentCategory.label,
        categoryColor: currentCategory.color,
        dueDate: "",
        timeOfDay: "",
        sourceKey: `recurring-bonus:${currentBonus.key}`,
        sourceType: "recurring-bonus",
        sourceLabel: `${currentGroup.label} completion bonus`
      });

      return {
        message: `Collected ${formatPointsLabel(currentBonus.points)} in ${currentCategory.label} from ${currentGroup.label}.`,
        tone: "info"
      };
    }
  });
}

function openWidgetMenu(slotIndex) {
  widgetMenuState.slotIndex = slotIndex;
  widgetMenuState.selectedType = "";
  widgetMenu.classList.add("hidden");
  renderWidgetOrbit();
}

function closeWidgetMenu() {
  widgetMenuState.slotIndex = null;
  widgetMenuState.selectedType = "";
  widgetMenu.classList.add("hidden");
  renderWidgetOrbit();
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
  const targetSlotIndex = widgetMenuState.slotIndex;
  if (targetSlotIndex === null) {
    return;
  }

  const definition = getWidgetDefinition(type);
  if (!definition) {
    setSyncStatus("That widget type is not registered yet.", "error");
    closeWidgetMenu();
    return;
  }

  const existingWidget = store.widgets.find((widget) => widget.type === definition.type);
  if (definition.singleton && existingWidget) {
    if (existingWidget.slotIndex === widgetMenuState.slotIndex) {
      closeWidgetMenu();
      setSyncStatus(`${definition.title} is already in this slot.`, "info");
      return;
    }

    if (widgetMenuState.selectedType !== type) {
      widgetMenuState.selectedType = type;
      renderWidgetOrbit();
      setSyncStatus(`${definition.title} is already deployed. Click again to move it here.`, "info");
      return;
    }

    existingWidget.slotIndex = targetSlotIndex;
    existingWidget.updatedAt = Date.now();
    persistStore();
    closeWidgetMenu();
    renderAll();
    setSyncStatus(`Moved ${definition.title} to slot ${targetSlotIndex + 1}.`, "info");
    return;
  }

  const retired = getRetiredWidgetByType(definition.type);
  const widget = definition.createWidget({
    slotIndex: targetSlotIndex,
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

  const skipRule = buildSkipRule(formData);
  const categorySnapshot = resolveCategorySnapshot(String(formData.get("category") || ""), null);
  const recurrence = buildRecurrence(formData);
  const draft = buildTaskDraftFromForm(formData, {
    skipRule,
    categorySnapshot,
    recurrence
  });
  const slotConfig = buildLinkedSeriesSlotConfig(formData, draft, recurrence);

  if (slotConfig) {
    const templates = buildLinkedSeriesTemplatesFromDraft({
      draft,
      recurrence,
      categorySnapshot,
      slotConfig
    });
    store.tasks.unshift(...templates);
    for (const template of templates) {
      regenerateSeries(template.id, { preserveClosed: false });
    }
  } else {
    const task = buildTaskFromValues(draft, null, categorySnapshot);
    store.tasks.unshift(task);
    if (task.recurrence.type !== "none") {
      regenerateSeries(task.id, { preserveClosed: false });
    }
  }

  reconcileRecurringSeries();
  trimTasks();
  persistStore();
  resetComposer();
  setActiveTaskDeskPane("tasks");
  renderAll();
  setSyncStatus("Saved locally. Use Save to Drive when you want to sync.", "info");
}

function handleQuickAddSubmit(event) {
  event.preventDefault();
  const title = quickTaskNameInput.value.trim();
  if (!title) {
    quickTaskNameInput.focus();
    return;
  }

  const task = buildTaskFromValues({
    name: title,
    details: "",
    startDate: "",
    dueDate: quickTaskDueDateInput.value || "",
    timeOfDay: quickTaskTimeOfDayInput.value || "",
    lateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
    points: defaultPointsForLength(quickTaskLengthInput.value || "medium"),
    length: quickTaskLengthInput.value || "medium",
    category: quickTaskCategoryInput.value || DEFAULT_CATEGORY_KEY,
    importance: quickTaskImportanceInput.value || DEFAULT_IMPORTANCE,
    skipRule: { type: "none" },
    dependencies: [],
    recurrence: { type: "none" }
  });

  store.tasks.unshift(task);
  trimTasks();
  persistStore();
  resetQuickAddForm();
  closeQuickAdd();
  renderAll();
  setSyncStatus("Quick-added locally. Open Task Desk if you want to add more detail.", "info");
}

function buildTaskFromForm(formData, originalTask = null) {
  const skipRule = originalTask?.skipRule?.type === "widget-lockout"
    ? normalizeSkipRule(originalTask.skipRule)
    : buildSkipRule(formData, originalTask?.skipRule);
  const categorySnapshot = resolveCategorySnapshot(String(formData.get("category") || ""), originalTask);
  const recurrence = buildRecurrence(formData, originalTask?.recurrence);
  return buildTaskFromValues(buildTaskDraftFromForm(formData, {
    originalTask,
    skipRule,
    categorySnapshot,
    recurrence
  }), originalTask, categorySnapshot);
}

function buildTaskDraftFromForm(formData, { originalTask = null, skipRule, categorySnapshot, recurrence } = {}) {
  const resolvedSkipRule = skipRule || (originalTask?.skipRule?.type === "widget-lockout"
    ? normalizeSkipRule(originalTask.skipRule)
    : buildSkipRule(formData, originalTask?.skipRule));
  const resolvedCategory = categorySnapshot || resolveCategorySnapshot(String(formData.get("category") || ""), originalTask);
  const resolvedRecurrence = recurrence || buildRecurrence(formData, originalTask?.recurrence);
  const resolvedImportance = String(formData.get("importance") || originalTask?.importance || DEFAULT_IMPORTANCE);
  const resolvedLateGraceMinutes = parsePositiveOrZeroNumber(formData.get("lateGraceMinutes")) ?? originalTask?.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES;
  return {
    name: String(formData.get("name") || "").trim(),
    details: String(formData.get("details") || "").trim(),
    startDate: String(formData.get("startDate") || ""),
    dueDate: String(formData.get("dueDate") || ""),
    timeOfDay: String(formData.get("timeOfDay") || ""),
    lateGraceMinutes: resolvedLateGraceMinutes,
    points: formData.get("points"),
    length: String(formData.get("length") || "medium"),
    category: resolvedCategory.key,
    importance: resolvedImportance,
    reminders: buildTaskReminderDraftFromForm(formData, {
      originalTask,
      importance: resolvedImportance,
      lateGraceMinutes: resolvedLateGraceMinutes,
      widgetTaskMeta: originalTask?.widgetTaskMeta
    }),
    skipRule: resolvedSkipRule,
    dependencies: Array.from(dependenciesSelect.selectedOptions).map((option) => option.value),
    recurrence: resolvedRecurrence
  };
}

function buildTaskFromValues(values, originalTask = null, categorySnapshot = null) {
  const normalizedName = String(values?.name || "").trim();
  const normalizedDetails = String(values?.details || "").trim();
  const rawStartDate = String(values?.startDate || "").trim();
  const startDateWasImplicit = !rawStartDate;
  const normalizedStartDate = rawStartDate || originalTask?.startDate || todayString();
  const normalizedDueDate = String(values?.dueDate || "").trim();
  const rawTimeOfDay = String(values?.timeOfDay || "").trim();
  const normalizedTimeOfDay = rawTimeOfDay || (normalizedDueDate ? "23:59" : "");
  const normalizedLength = LENGTH_ORDER[String(values?.length || "")] ? String(values.length) : "medium";
  const resolvedCategory = categorySnapshot || resolveCategorySnapshot(String(values?.category || ""), originalTask);
  const normalizedRecurrence = normalizeRecurrence(values?.recurrence);
  const normalizedDependencies = Array.isArray(values?.dependencies)
    ? values.dependencies.filter((dependencyId) => typeof dependencyId === "string" && dependencyId)
    : [];
  const lateGraceMinutes = parsePositiveOrZeroNumber(values?.lateGraceMinutes) ?? originalTask?.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES;
  const normalizedImportance = normalizeImportance(String(values?.importance || originalTask?.importance || DEFAULT_IMPORTANCE));
  const normalizedWidgetTaskMeta = normalizeWidgetTaskMeta(values?.widgetTaskMeta || originalTask?.widgetTaskMeta);
  const normalizedReminders = normalizeTaskReminders(values?.reminders, {
    originalReminders: originalTask?.reminders,
    importance: normalizedImportance,
    lateGraceMinutes,
    widgetTaskMeta: normalizedWidgetTaskMeta
  });

  return {
    id: originalTask?.id || createId(),
    templateId: originalTask?.templateId || "",
    occurrenceIndex: originalTask?.occurrenceIndex || 0,
    name: normalizedName,
    details: normalizedDetails,
    startDate: normalizedStartDate,
    dueDate: normalizedDueDate,
    timeOfDay: normalizedTimeOfDay,
    lateGraceMinutes,
    notBeforeAt: deriveTaskNotBeforeAt({
      recurrence: normalizedRecurrence,
      startDate: normalizedStartDate,
      dueDate: normalizedDueDate,
      originalTask,
      startDateWasImplicit
    }),
    pointsValue: normalizeTaskPoints(values?.points, originalTask?.pointsValue, getMaxTaskPoints()),
    pointsEntryId: originalTask?.pointsEntryId || "",
    length: normalizedLength,
    categoryKey: resolvedCategory.key,
    categoryLabel: resolvedCategory.label,
    categoryColor: resolvedCategory.color,
    importance: normalizedImportance,
    status: originalTask?.status || "open",
    createdAt: originalTask?.createdAt || Date.now(),
    ownerWidgetId: originalTask?.ownerWidgetId || "",
    ownerWidgetType: originalTask?.ownerWidgetType || "",
    ownerTaskKey: originalTask?.ownerTaskKey || "",
    widgetTaskKind: typeof values?.widgetTaskKind === "string"
      ? values.widgetTaskKind
      : (typeof originalTask?.widgetTaskKind === "string" ? originalTask.widgetTaskKind : ""),
    widgetTaskMeta: normalizedWidgetTaskMeta,
    reminders: normalizedReminders,
    linkedSeries: normalizeLinkedSeries(values?.linkedSeries || originalTask?.linkedSeries),
    sequenceDependencyId: typeof values?.sequenceDependencyId === "string"
      ? values.sequenceDependencyId
      : (typeof originalTask?.sequenceDependencyId === "string" ? originalTask.sequenceDependencyId : ""),
    widgetCompletion: normalizeWidgetCompletion(originalTask?.widgetCompletion),
    skipRule: normalizeSkipRule(values?.skipRule),
    dependencies: normalizedDependencies,
    recurrence: normalizedRecurrence,
    history: Array.isArray(originalTask?.history) ? originalTask.history : []
  };
}

function renderDailyInstanceTimes(times = []) {
  if (!dailyInstanceTimes) {
    return;
  }
  dailyInstanceTimes.innerHTML = "";
  times.forEach((time) => appendDailyInstanceTimeRow(time));
}

function appendDailyInstanceTimeRow(value = "") {
  if (!dailyInstanceTimes) {
    return;
  }
  const row = document.createElement("div");
  row.className = "recurrence-slot-row";
  row.innerHTML = `
    <input type="time" value="${escapeHtml(value)}" data-daily-instance-time />
    <button type="button" class="ghost-button" data-remove-daily-instance-time>Remove</button>
  `;
  dailyInstanceTimes.appendChild(row);
}

function handleDailyInstanceTimesClick(event) {
  const removeButton = event.target.closest("[data-remove-daily-instance-time]");
  if (!removeButton) {
    return;
  }
  removeButton.closest(".recurrence-slot-row")?.remove();
}

function collectDailyInstanceTimes(primaryTime) {
  const times = [String(primaryTime || "").trim()]
    .concat(Array.from(dailyInstanceTimes.querySelectorAll("[data-daily-instance-time]")).map((input) => String(input.value || "").trim()))
    .filter(Boolean);
  return [...new Set(times)].sort();
}

function setWeeklyDaySelection(days) {
  const selected = new Set((Array.isArray(days) ? days : []).map((value) => Number(value)));
  Array.from(weeklyDayPicker.querySelectorAll('input[name="weeklyDays"]')).forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
  syncWeeklyWeekdayHiddenValue();
}

function getWeeklyDaySelection(defaultWeekday = 0) {
  const selected = Array.from(weeklyDayPicker.querySelectorAll('input[name="weeklyDays"]:checked'))
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
  if (selected.length > 0) {
    return selected;
  }
  return [Number.isInteger(defaultWeekday) ? defaultWeekday : 0];
}

function syncWeeklyWeekdayHiddenValue() {
  const selected = getWeeklyDaySelection(Number(document.getElementById("weeklyWeekday").value || 0));
  document.getElementById("weeklyWeekday").value = String(selected[0] ?? 0);
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

function buildLinkedSeriesSlotConfig(formData, draft, recurrence) {
  if (recurrence.type === "daily") {
    const times = collectDailyInstanceTimes(draft.timeOfDay || "23:59");
    if (times.length > 1) {
      return {
        kind: LINKED_SERIES_KIND_DAILY,
        slots: times.map((time) => ({ timeOfDay: time }))
      };
    }
    return null;
  }

  if (recurrence.type === "weekly") {
    const weekdays = getWeeklyDaySelection(Number(formData.get("weeklyWeekday") || recurrence.weekday || 0));
    if (weekdays.length > 1) {
      return {
        kind: LINKED_SERIES_KIND_WEEKLY,
        slots: weekdays.map((weekday) => ({ weekday }))
      };
    }
  }

  return null;
}

function buildLinkedSeriesTemplatesFromDraft({
  draft,
  recurrence,
  categorySnapshot,
  slotConfig,
  existingTemplates = []
}) {
  if (!slotConfig || !Array.isArray(slotConfig.slots) || slotConfig.slots.length <= 1) {
    return [];
  }

  const groupId = existingTemplates[0]?.linkedSeries?.groupId || createId();
  const assignments = matchLinkedSeriesTemplates(existingTemplates, slotConfig);

  return slotConfig.slots.map((slot, slotIndex) => {
    const existingTask = assignments.get(slotIndex) || null;
    const slotRecurrence = slotConfig.kind === LINKED_SERIES_KIND_WEEKLY
      ? { ...recurrence, weekday: slot.weekday }
      : { ...recurrence };

    const baseStartDate = draft.startDate || draft.dueDate || todayString();
    const baseDueDate = draft.dueDate || draft.startDate || todayString();
    const slotStartDate = slotConfig.kind === LINKED_SERIES_KIND_WEEKLY
      ? alignDateToWeekdayOnOrAfter(baseStartDate, slot.weekday)
      : (draft.startDate || "");
    const slotDueDate = slotConfig.kind === LINKED_SERIES_KIND_WEEKLY
      ? alignDateToWeekdayOnOrAfter(baseDueDate, slot.weekday)
      : draft.dueDate;

    return buildTaskFromValues({
      ...draft,
      startDate: slotStartDate,
      dueDate: slotDueDate,
      timeOfDay: slot.timeOfDay || draft.timeOfDay,
      recurrence: slotRecurrence,
      linkedSeries: {
        groupId,
        kind: slotConfig.kind,
        slotIndex,
        slotCount: slotConfig.slots.length
      },
      sequenceDependencyId: ""
    }, existingTask, categorySnapshot);
  });
}

function matchLinkedSeriesTemplates(existingTemplates, slotConfig) {
  const assignments = new Map();
  const unusedTemplates = [...existingTemplates];

  slotConfig.slots.forEach((slot, slotIndex) => {
    const matchIndex = unusedTemplates.findIndex((template) => {
      if (slotConfig.kind === LINKED_SERIES_KIND_DAILY) {
        return template.timeOfDay === slot.timeOfDay;
      }
      return Number(template.recurrence?.weekday) === Number(slot.weekday);
    });
    if (matchIndex !== -1) {
      assignments.set(slotIndex, unusedTemplates.splice(matchIndex, 1)[0]);
    }
  });

  slotConfig.slots.forEach((_, slotIndex) => {
    if (assignments.has(slotIndex)) {
      return;
    }
    if (unusedTemplates.length > 0) {
      assignments.set(slotIndex, unusedTemplates.shift());
    }
  });

  return assignments;
}

function alignDateToWeekdayOnOrAfter(baseDate, weekday) {
  const date = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return baseDate;
  }
  const normalizedWeekday = Number.isInteger(weekday) ? weekday : 0;
  const diff = (normalizedWeekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

function applyLinkedSeriesTemplateUpdate(nextTemplates, existingTemplates) {
  const nextTemplateIds = new Set(nextTemplates.map((task) => task.id));
  const matchedExistingIds = new Set();

  for (const nextTemplate of nextTemplates) {
    const existing = existingTemplates.find((task) => task.id === nextTemplate.id) || null;
    if (existing) {
      matchedExistingIds.add(existing.id);
      nextTemplate.templateId = "";
      nextTemplate.occurrenceIndex = 0;
      nextTemplate.status = existing.status;
      nextTemplate.history = [...existing.history];
      replaceTask(nextTemplate);
      regenerateSeries(existing.id, { preserveClosed: true });
      continue;
    }

    store.tasks.unshift(nextTemplate);
    regenerateSeries(nextTemplate.id, { preserveClosed: false });
  }

  for (const existingTemplate of existingTemplates) {
    if (matchedExistingIds.has(existingTemplate.id) || nextTemplateIds.has(existingTemplate.id)) {
      continue;
    }
    deleteSeriesTemplate(existingTemplate);
  }
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
    const existingTemplates = getLinkedSeriesTemplates(template);
    const skipRule = template?.skipRule?.type === "widget-lockout"
      ? normalizeSkipRule(template.skipRule)
      : buildSkipRule(formData, template?.skipRule);
    const categorySnapshot = resolveCategorySnapshot(String(formData.get("category") || ""), template);
    const recurrence = buildRecurrence(formData, template?.recurrence);
    const draft = buildTaskDraftFromForm(formData, {
      originalTask: template,
      skipRule,
      categorySnapshot,
      recurrence
    });
    const slotConfig = buildLinkedSeriesSlotConfig(formData, draft, recurrence);

    if (slotConfig) {
      const nextTemplates = buildLinkedSeriesTemplatesFromDraft({
        draft,
        recurrence,
        categorySnapshot,
        slotConfig,
        existingTemplates
      });
      applyLinkedSeriesTemplateUpdate(nextTemplates, existingTemplates);
    } else if (existingTemplates.length > 1) {
      const primaryTemplate = existingTemplates[0];
      const updatedTemplate = buildTaskFromValues({
        ...draft,
        linkedSeries: { groupId: "", kind: "", slotIndex: 0, slotCount: 1 },
        sequenceDependencyId: ""
      }, primaryTemplate, categorySnapshot);
      updatedTemplate.templateId = "";
      updatedTemplate.occurrenceIndex = 0;
      updatedTemplate.status = primaryTemplate.status;
      updatedTemplate.history = [...primaryTemplate.history];
      replaceTask(updatedTemplate);
      regenerateSeries(updatedTemplate.id, { preserveClosed: true });
      for (const sibling of existingTemplates.slice(1)) {
        deleteSeriesTemplate(sibling);
      }
    } else {
      const updatedTemplate = buildTaskFromValues({
        ...draft,
        linkedSeries: normalizeLinkedSeries(template.linkedSeries),
        sequenceDependencyId: template.sequenceDependencyId || ""
      }, template, categorySnapshot);
      updatedTemplate.templateId = "";
      updatedTemplate.occurrenceIndex = 0;
      updatedTemplate.status = template.status;
      updatedTemplate.history = [...template.history];
      replaceTask(updatedTemplate);
      regenerateSeries(template.id, { preserveClosed: true });
    }
  } else {
    const updatedTask = buildTaskFromForm(formData, task);
    updatedTask.recurrence = task.templateId ? { type: "generated" } : updatedTask.recurrence;
    updatedTask.history = [...task.history];
    replaceTask(updatedTask);
  }

  reconcileRecurringSeries();
  trimTasks();
  persistStore();
  clearEditState();
  setActiveTaskDeskPane("tasks");
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
    persistStore({ touchUserUpdatedAt: false });
  }
  if (applyCompletedTaskHistoryOnly()) {
    persistStore({ touchUserUpdatedAt: false });
  }
  if (applyAutoArchiving()) {
    persistStore({ touchUserUpdatedAt: false });
  }
  if (syncRecurringBonusState()) {
    persistStore({ touchUserUpdatedAt: false });
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
  renderCanopyDetailIfOpen();
  renderTreeStyleIfOpen();
  renderTreeDetailIfOpen();
  renderNotificationsIfOpen();
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

function getRecentPointHistory() {
  return [...normalizePointHistory(store.pointHistory, store.devSettings)].sort((left, right) => right.at - left.at);
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

function normalizePointHistory(value, devSettings = store?.devSettings) {
  const normalizedDevSettings = normalizeDevSettings(devSettings || {});
  return normalizePointHistoryBase(value, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot,
    maxEntries: normalizedDevSettings.maxPointHistoryEntries
  });
}

function mergePointLedger(localEntries = [], remoteEntries = []) {
  return mergePointLedgerBase(localEntries, remoteEntries, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot
  });
}

function mergePointHistory(localEntries = [], remoteEntries = [], devSettings = store?.devSettings) {
  const normalizedDevSettings = normalizeDevSettings(devSettings || {});
  return mergePointHistoryBase(localEntries, remoteEntries, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot,
    maxEntries: normalizedDevSettings.maxPointHistoryEntries
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

function recordPointEntry(entry) {
  if (!entry) {
    return;
  }
  store.pointLedger = mergePointLedger(store.pointLedger, [entry]);
  store.pointHistory = mergePointHistory(store.pointHistory, [entry]);
}

function removePointEntryById(entryId) {
  if (!entryId) {
    return false;
  }
  const nextLedger = store.pointLedger.filter((entry) => entry.id !== entryId);
  const nextHistory = store.pointHistory.filter((entry) => entry.id !== entryId);
  const changed = nextLedger.length !== store.pointLedger.length || nextHistory.length !== store.pointHistory.length;
  store.pointLedger = nextLedger;
  store.pointHistory = nextHistory;
  return changed;
}

function renderCanopy() {
  const today = todayString();
  const standardCards = getVisibleCards()
    .filter((card) => shouldSurfaceCanopyStandardCard(card, today))
    .map((card) => ({
      ...card,
      surfacedRecurringGroup: getSurfacedCanopyRecurringGroup(card.task, today),
      deadlineState: getOpenTaskDeadlineState(card.task),
      blocked: isBlocked(card.task),
      blockedNote: describeCompletionGate(card.task)
    }));
  const recurringEntries = buildRecurringCanopyEntries();

  canopyState.columns = enrichCanopyColumnsWithRecurringBonuses(buildCanopyColumnsData({
    standardCards,
    recurringEntries,
    today
  }), today);

  renderCanopyColumns(canopyColumns, {
    columns: canopyState.columns,
    escapeHtml,
    formatDate,
    formatPointsLabel,
    getPendingActionForTask,
    renderPriorityIndicator
  });
}

function shouldSurfaceCanopyStandardCard(card, today = todayString()) {
  if (!card || card.task.ownerWidgetType || card.task.archived || card.status !== "open") {
    return false;
  }
  if (card.task.recurrence.type === "none") {
    return true;
  }
  if (card.kind !== "series") {
    return false;
  }
  return Boolean(getSurfacedCanopyRecurringGroup(card.task, today));
}

function getSurfacedCanopyRecurringGroup(task, today = todayString()) {
  const taskDate = task?.dueDate || task?.startDate || "";
  if (!taskDate) {
    return "";
  }
  const recurringGroup = getCanopyRecurringGroupKey(task);
  const weekStart = startOfWeekString(today);
  const weekEnd = addDaysToDateString(weekStart, 6);

  if (recurringGroup === "weekly") {
    return taskDate >= weekStart && taskDate <= today ? "weekly" : "";
  }
  if (recurringGroup === "monthly") {
    return taskDate.slice(0, 7) === today.slice(0, 7) && taskDate <= weekEnd ? "monthly" : "";
  }
  return "";
}

function getCanopyRecurringGroup(task) {
  return getCanopyRecurringGroupKey(task);
}

function buildRecurringCanopyEntries() {
  return store.tasks
    .filter((task) => !task.archived && !task.historyOnly && task.recurrence.type !== "none" && (task.status === "open" || task.status === "done" || task.status === "skipped"))
    .map((task) => ({
      key: task.id,
      task,
      displayName: formatTaskDisplayName(task),
      deadlineState: getOpenTaskDeadlineState(task),
      blocked: isBlocked(task),
      blockedNote: describeCompletionGate(task)
    }));
}

function enrichCanopyColumnsWithRecurringBonuses(columns, today = todayString()) {
  return columns.map((column) => ({
    ...column,
    recurringGroups: column.recurringGroups.map((group) => ({
      ...group,
      bonus: buildRecurringGroupBonusState(group, today)
    }))
  }));
}

function buildRecurringGroupBonusState(group, today = todayString()) {
  const points = RECURRING_BONUS_POINTS[group?.key] || 0;
  if (!group || !points || !Array.isArray(group.tasks) || group.tasks.length === 0) {
    return null;
  }

  const periodKey = buildRecurringBonusPeriodKey(group.key, today);
  const key = `${group.key}:${periodKey}`;
  const allowedCategories = collectRecurringBonusCategories(group.tasks);
  const selectedCategoryKey = getRecurringBonusSelection(key) || allowedCategories[0]?.key || "";
  const selectedCategory = allowedCategories.find((category) => category.key === selectedCategoryKey) || allowedCategories[0] || null;
  const claimedEntry = store.pointLedger.find((entry) => entry.sourceKey === `recurring-bonus:${key}`) || null;
  const pendingAction = getPendingActionByKey(`collect-bonus:${key}`);
  const completedAll = group.tasks.every((entry) => entry.task.status === "done");

  return {
    key,
    periodKey,
    periodLabel: group.periodLabel,
    points,
    allowedCategories,
    selectedCategoryKey,
    selectedCategory,
    claimed: Boolean(claimedEntry),
    claimedEntryId: claimedEntry?.id || "",
    claimedCategoryLabel: claimedEntry?.categoryLabel || "",
    pendingAction,
    completedAll,
    collectible: completedAll && !claimedEntry && Boolean(selectedCategory)
  };
}

function buildRecurringBonusPeriodKey(groupKey, today = todayString()) {
  if (groupKey === "daily") {
    return today;
  }
  if (groupKey === "weekly") {
    const start = startOfWeekString(today);
    return `${start}:${addDaysToDateString(start, 6)}`;
  }
  if (groupKey === "monthly") {
    return today.slice(0, 7);
  }
  return today;
}

function collectRecurringBonusCategories(entries = []) {
  const categories = new Map();
  for (const entry of entries) {
    const category = resolveCategorySnapshot(entry.task.categoryKey || DEFAULT_CATEGORY_KEY, entry.task);
    if (!categories.has(category.key)) {
      categories.set(category.key, category);
    }
  }
  return Array.from(categories.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function getRecurringBonusSelection(key) {
  return store.recurringBonusSelections.find((entry) => entry.key === key)?.selectedCategoryKey || "";
}

function setRecurringBonusSelection(key, categoryKey) {
  const nextKey = slugifyCategoryKey(categoryKey || "");
  const current = store.recurringBonusSelections.find((entry) => entry.key === key) || null;
  if (!nextKey) {
    if (!current) {
      return false;
    }
    store.recurringBonusSelections = store.recurringBonusSelections.filter((entry) => entry.key !== key);
    return true;
  }
  if (current?.selectedCategoryKey === nextKey) {
    return false;
  }
  const nextRecord = {
    key,
    selectedCategoryKey: nextKey,
    updatedAt: Date.now()
  };
  store.recurringBonusSelections = [
    ...store.recurringBonusSelections.filter((entry) => entry.key !== key),
    nextRecord
  ].sort((left, right) => left.key.localeCompare(right.key));
  return true;
}

function pruneRecurringBonusSelections(activeKeys = new Set()) {
  const nextSelections = store.recurringBonusSelections.filter((entry) => activeKeys.has(entry.key));
  if (nextSelections.length === store.recurringBonusSelections.length) {
    return false;
  }
  store.recurringBonusSelections = nextSelections;
  return true;
}

function syncRecurringBonusState(today = todayString()) {
  const recurringEntries = buildRecurringCanopyEntries();
  const columns = enrichCanopyColumnsWithRecurringBonuses(buildCanopyColumnsData({
    standardCards: [],
    recurringEntries,
    today
  }), today);

  const activeKeys = new Set();
  let changed = false;

  for (const column of columns) {
    for (const group of column.recurringGroups) {
      const bonus = group.bonus;
      if (!bonus) {
        continue;
      }
      activeKeys.add(bonus.key);
      if (bonus.claimedEntryId && (!bonus.completedAll || !bonus.allowedCategories.some((category) => category.key === (store.pointLedger.find((entry) => entry.id === bonus.claimedEntryId)?.categoryKey || "")))) {
        changed = removePointEntryById(bonus.claimedEntryId) || changed;
      }
    }
  }

  if (pruneRecurringBonusSelections(activeKeys)) {
    changed = true;
  }

  return changed;
}

function startOfWeekString(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() - date.getDay());
  return toDateString(date);
}

function addDaysToDateString(value, days) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function renderCanopyDetailIfOpen() {
  if (!isCanopyDetailOpen()) {
    return;
  }

  const detail = renderCanopyDetailContent(canopyDetailBody, {
    detail: canopyState.detail,
    columns: canopyState.columns,
    escapeHtml,
    formatDate,
    formatPointsLabel,
    showHelpText: normalizeProfile(store.profile).helpTextEnabled,
    getPendingActionForTask,
    renderPriorityIndicator
  });
  canopyDetailTitle.textContent = detail.title;
  canopyDetailSubtitle.textContent = detail.subtitle;
  canopyDetailFooter.textContent = detail.footerNote;
  canopyDetailFooter.classList.toggle("hidden", !detail.footerNote);
}

function renderTemporalUi(now = new Date()) {
  applyTheme(now);
  renderHeroStatus(now);
  renderTreeSky(now);
  renderSyncMeta(now);
}

function applyTheme(now = new Date()) {
  document.body.dataset.theme = isDarkModeActive(store.profile, now) ? "dark" : "light";
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

function renderSyncMeta(now = new Date()) {
  const localUpdatedAt = store.userUpdatedAt || 0;
  const remoteSavedAt = syncState.remoteSavedAt || 0;
  const remoteUpdatedAt = syncState.remoteUserUpdatedAt || 0;
  const remoteFingerprint = syncState.remoteUserFingerprint || "";
  const localFingerprint = remoteFingerprint ? getCurrentUserFingerprint() : "";
  const profile = normalizeProfile(store.profile);
  const autosaveStatus = autosaveController.getStatus();

  let localState = "neutral";
  let driveState = "neutral";

  if (remoteUpdatedAt > 0 || remoteFingerprint) {
    if (remoteFingerprint && localFingerprint && remoteFingerprint === localFingerprint) {
      localState = "success";
      driveState = "success";
    } else if (localUpdatedAt > remoteUpdatedAt) {
      localState = "success";
      driveState = "error";
    } else if (remoteUpdatedAt > localUpdatedAt) {
      localState = "error";
      driveState = "success";
    } else {
      localState = "error";
      driveState = "error";
    }
  }

  syncLocalCard.dataset.state = localState;
  syncDriveCard.dataset.state = driveState;
  syncLocalValue.textContent = localUpdatedAt ? formatDateTime(localUpdatedAt) : "No local edits yet";
  syncDriveValue.textContent = remoteSavedAt
    ? formatDateTime(remoteSavedAt)
    : remoteUpdatedAt
      ? formatDateTime(remoteUpdatedAt)
      : "No Drive save yet";

  let autosaveState = "neutral";
  let autosaveText = "Autosave off";
  if (driveSaveState.inFlight) {
    autosaveState = "info";
    autosaveText = driveSaveState.mode === "autosave" ? "Autosaving now…" : "Saving now…";
  } else if (!authState.authenticated) {
    autosaveText = profile.autosaveEnabled ? "Connect Google" : "Autosave off";
  } else if (!profile.autosaveEnabled) {
    autosaveText = "Autosave off";
  } else if (autosaveStatus.inFlight) {
    autosaveState = "info";
    autosaveText = "Saving now…";
  } else if (autosaveStatus.nextRunAt > 0) {
    autosaveState = "info";
    autosaveText = formatAutosaveCountdown(Math.max(0, autosaveStatus.nextRunAt - now.getTime()));
  } else {
    autosaveText = `Every ${profile.autosaveIntervalMinutes} min`;
  }

  syncAutosaveCard.dataset.state = autosaveState;
  syncAutosaveValue.textContent = autosaveText;
}

function buildEmailSummaryPreview(emailConfig, now = new Date()) {
  const nowTimestamp = now.getTime();
  const summaryWindowMs = emailConfig.summaries.frequency === "weekly"
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const subject = `${normalizeProfile(store.profile).displayName || "Lifetree"} ${emailConfig.summaries.frequency === "weekly" ? "weekly" : "daily"} summary · ${formatDate(now)}`;
  const recipientEmail = emailConfig.recipientEmail || authState.user?.email || "";
  const openTasks = store.tasks
    .filter((task) => task.status === "open" && !task.archived && !task.historyOnly)
    .map((task) => ({ task, dueAt: getNotificationTaskTimestamp(task) }));
  const overdueTasks = openTasks
    .filter((entry) => entry.dueAt > 0 && entry.dueAt < nowTimestamp)
    .sort((left, right) => left.dueAt - right.dueAt)
    .slice(0, 5)
    .map((entry) => formatNotificationTaskLine(entry.task, entry.dueAt));
  const dueSoonTasks = openTasks
    .filter((entry) => entry.dueAt > 0 && entry.dueAt >= nowTimestamp && entry.dueAt <= nowTimestamp + summaryWindowMs)
    .sort((left, right) => left.dueAt - right.dueAt)
    .slice(0, 5)
    .map((entry) => formatNotificationTaskLine(entry.task, entry.dueAt));
  const recentCompleted = buildHistoryFeed(store.tasks)
    .filter((entry) => entry.type === "completed" && (entry.at || 0) >= nowTimestamp - summaryWindowMs)
    .slice(0, 5)
    .map((entry) => `${entry.taskName} · ${formatDateTime(entry.at)}`);
  const recurringProgress = canopyState.columns
    .flatMap((column) => column.recurringGroups || [])
    .flatMap((group) => (group.seriesCards || []).map((card) => `${group.label}: ${card.label} · ${card.completedCount}/${card.totalCount}`))
    .slice(0, 6);
  const treeDisplayState = getTreeDisplayState();
  const pointSummary = getPointLedgerSummary();
  const treeSummary = [
    `${formatPointsLabel(pointSummary.total || 0)} banked reward points`,
    `${formatPointsLabel(treeDisplayState.totalVisibleFruitPoints || 0)} growing on the tree`,
    `${treeDisplayState.ripeFruitCount || 0} ripe fruit ready now`
  ];
  const widgetHighlights = buildNotificationWidgetHighlights();

  const sections = [];
  if (emailConfig.summaries.include.overdue) {
    sections.push({ title: "Overdue tasks", items: overdueTasks });
  }
  if (emailConfig.summaries.include.dueSoon) {
    sections.push({ title: emailConfig.summaries.frequency === "weekly" ? "Due in the next 7 days" : "Due in the next 24 hours", items: dueSoonTasks });
  }
  if (emailConfig.summaries.include.completed) {
    sections.push({ title: "Recently completed", items: recentCompleted });
  }
  if (emailConfig.summaries.include.recurringProgress) {
    sections.push({ title: "Recurring progress", items: recurringProgress });
  }
  if (emailConfig.summaries.include.treePoints) {
    sections.push({ title: "Tree and points", items: treeSummary });
  }
  if (emailConfig.summaries.include.widgetHighlights) {
    sections.push({ title: "Widget highlights", items: widgetHighlights });
  }

  return {
    subject,
    recipientEmail,
    enabled: emailConfig.summaries.enabled,
    scheduleLabel: buildNotificationScheduleLabel(emailConfig.summaries),
    sections: sections.filter((section) => section.items.length > 0)
  };
}

function renderNotificationsPreview(summaryPreview, reminderTemplates) {
  return `
    ${renderEmailSummaryPreview(summaryPreview)}
    ${renderReminderTemplatesPreview(reminderTemplates)}
  `;
}

function renderEmailSummaryPreview(preview) {
  const recipientCopy = preview.recipientEmail || "No recipient selected yet";
  return `
    <article class="notifications-preview-card">
      <p class="eyebrow">Subject</p>
      <h4>${escapeHtml(preview.subject)}</h4>
      <div class="notifications-preview-header">
        <div class="notifications-preview-meta">
          <span class="sync-status">Recipient</span>
          <strong>${escapeHtml(recipientCopy)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Schedule</span>
          <strong>${escapeHtml(preview.scheduleLabel)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Status</span>
          <strong>${preview.enabled ? "Enabled" : "Saved only"}</strong>
        </div>
      </div>
      ${preview.sections.length > 0 ? preview.sections.map((section) => `
        <section class="notifications-preview-section">
          <strong>${escapeHtml(section.title)}</strong>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      `).join("") : `<p class="sync-status">No matching content yet. As tasks, widgets, and tree progress change, this preview will fill in automatically.</p>`}
    </article>
  `;
}

function renderReminderTemplatesPreview(reminderTemplates) {
  if (!Array.isArray(reminderTemplates) || reminderTemplates.length === 0) {
    return `
      <article class="notifications-preview-card">
        <p class="eyebrow">Reminder preview</p>
        <h4>No reminder emails are due right now</h4>
        <p class="sync-status">Agenda, due-soon, and overdue emails will appear here as separate templates when they have content.</p>
      </article>
    `;
  }
  return reminderTemplates.map((preview) => renderEmailReminderPreview(preview)).join("");
}

function renderEmailReminderPreview(preview) {
  const recipientCopy = preview.recipientEmail || "No recipient selected yet";
  return `
    <article class="notifications-preview-card">
      <p class="eyebrow">${escapeHtml(preview.eyebrow || "Reminder preview")}</p>
      <h4>${escapeHtml(preview.subject)}</h4>
      <div class="notifications-preview-header">
        <div class="notifications-preview-meta">
          <span class="sync-status">Recipient</span>
          <strong>${escapeHtml(recipientCopy)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Schedule</span>
          <strong>${escapeHtml(preview.scheduleLabel)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Items</span>
          <strong>${preview.eventCount || 0}</strong>
        </div>
      </div>
      ${preview.quietHoursActive ? `<p class="sync-status">Quiet hours are active right now. Manual sends still work, but automatic reminder delivery will pause during that window.</p>` : ""}
      <p class="sync-status">${escapeHtml(buildReminderPreviewIntro(preview))}</p>
      <section class="notifications-preview-section">
        <ul>
          ${preview.items.map((item) => renderReminderPreviewListItem(item)).join("")}
        </ul>
      </section>
    </article>
  `;
}

function buildReminderPreviewIntro(preview) {
  if (preview.templateKind === "agenda") {
    return "This agenda includes everything due today. Completed and skipped tasks stay visible for context.";
  }
  if (preview.templateKind === "overdue") {
    return "This email is for tasks that have already crossed their overdue threshold.";
  }
  return "This email is for tasks that are nearing their due time.";
}

function renderReminderPreviewListItem(item) {
  const normalized = normalizeReminderPreviewItem(item);
  const closed = normalized.status === "completed" || normalized.status === "skipped";
  const statusCopy = normalized.status === "completed"
    ? "Completed"
    : normalized.status === "skipped"
      ? "Skipped"
      : "";
  return `
    <li class="${closed ? "notifications-preview-item-closed" : ""}">
      <span>${escapeHtml(normalized.label)}</span>
      ${statusCopy ? `<span class="notifications-preview-item-status ${normalized.status}">${escapeHtml(statusCopy)}</span>` : ""}
    </li>
  `;
}

function normalizeReminderPreviewItem(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      label: String(item.label || ""),
      status: item.status === "completed" || item.status === "skipped" ? item.status : "open"
    };
  }
  return {
    label: String(item || ""),
    status: "open"
  };
}

function renderEmailSummaryBodyHtml(preview) {
  const sectionsHtml = preview.sections.length > 0
    ? preview.sections.map((section) => `
      <section style="margin: 0 0 20px;">
        <h2 style="margin: 0 0 10px; font-size: 18px; color: #253243;">${escapeHtml(section.title)}</h2>
        <ul style="margin: 0; padding-left: 20px; color: #4f637a; line-height: 1.55;">
          ${section.items.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    `).join("")
    : `<p style="margin: 0; color: #4f637a;">No matching content yet. As tasks, widgets, and tree progress change, this preview will fill in automatically.</p>`;

  return `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f5efe4; color: #253243; font-family: Georgia, 'Times New Roman', serif;">
    <main style="max-width: 720px; margin: 0 auto; background: #fffaf3; border: 1px solid rgba(37, 50, 67, 0.1); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(37, 50, 67, 0.12);">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: #e57b4b;">Lifetree summary</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #253243;">${escapeHtml(preview.subject)}</h1>
      <p style="margin: 0 0 24px; color: #4f637a;">${escapeHtml(preview.scheduleLabel)}${preview.recipientEmail ? ` · Sent to ${escapeHtml(preview.recipientEmail)}` : ""}</p>
      ${sectionsHtml}
    </main>
  </body>
</html>`;
}

function renderEmailSummaryBodyText(preview) {
  const lines = [
    preview.subject,
    preview.scheduleLabel
  ];
  if (preview.recipientEmail) {
    lines.push(`Sent to ${preview.recipientEmail}`);
  }
  lines.push("");
  if (preview.sections.length === 0) {
    lines.push("No matching content yet. As tasks, widgets, and tree progress change, this preview will fill in automatically.");
  } else {
    for (const section of preview.sections) {
      lines.push(section.title);
      lines.push(...section.items.map((item) => `- ${item}`));
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

function renderNotificationHistory(historyEntries) {
  const entries = Array.isArray(historyEntries) ? historyEntries : [];
  if (entries.length === 0) {
    return `<p class="sync-status">No notification emails have been sent yet. Send a summary or reminder now to start building history.</p>`;
  }
  return `
    <div class="notifications-history-list">
      ${entries.map((entry) => `
        <article class="notifications-history-item">
          <div>
            <strong>${escapeHtml(entry.subject || "Notification email")}</strong>
            <p class="sync-status">${escapeHtml(entry.recipientEmail || "No recipient")} · ${escapeHtml(formatDateTime(entry.at))}</p>
          </div>
          <span class="widget-badge">${entry.status === "error" ? "Error" : formatNotificationHistoryBadge(entry)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function formatNotificationHistoryBadge(entry) {
  if (entry?.kind !== "reminder") {
    return "Summary";
  }
  if (entry?.reminderTemplateKind === "agenda") {
    return "Agenda";
  }
  if (entry?.reminderTemplateKind === "overdue") {
    return "Overdue";
  }
  if (entry?.reminderTemplateKind === "due-soon") {
    return "Due soon";
  }
  return "Reminder";
}

function buildNotificationScheduleLabel(summaryConfig) {
  if (summaryConfig.frequency === "weekly") {
    return `Weekly · ${WEEKDAY_LABELS[summaryConfig.weekday]} at ${formatNotificationTime(summaryConfig.sendTime)}`;
  }
  return `Daily · ${formatNotificationTime(summaryConfig.sendTime)}`;
}

function buildEmailSummaryKey(summaryConfig, now = new Date()) {
  if (summaryConfig.frequency === "weekly") {
    const weekStart = new Date(now.getTime());
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return `weekly:${toDateString(weekStart)}`;
  }
  return `daily:${toDateString(now)}`;
}

function formatNotificationTime(value) {
  const normalized = normalizeNotificationTime(value);
  const [hours, minutes] = normalized.split(":").map((part) => Number(part));
  return new Date(2000, 0, 1, hours, minutes, 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getNotificationTaskTimestamp(task) {
  const scheduledDate = task?.dueDate || task?.startDate || "";
  if (!scheduledDate) {
    return 0;
  }
  const scheduledTime = task?.timeOfDay || "23:59";
  const timestamp = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatNotificationTaskLine(task, dueAt) {
  const recurringGroup = getCanopyRecurringGroup(task);
  const recurringLabel = recurringGroup ? ` · ${capitalizeWord(recurringGroup)}` : "";
  return `${task.name}${recurringLabel} · ${formatDateTime(dueAt)}`;
}

function buildNotificationWidgetHighlights() {
  return store.widgets
    .map((widget) => {
      if (widget.type === "energy") {
        const latest = widget.data?.entries?.[widget.data.entries.length - 1];
        return latest ? `Energy: ${latest.level}/5 at ${formatDateTime(latest.at)}` : "Energy: no recent votes";
      }
      if (widget.type === "workout") {
        const latestWorkout = widget.data?.workoutEntries?.[widget.data.workoutEntries.length - 1];
        const calorieCopy = `${sumWorkoutCaloriesForCurrentWeek(widget.data?.workoutEntries || [])} cal this week`;
        return latestWorkout
          ? `Workout Coach: ${latestWorkout.workoutType || "Workout"} at ${formatDateTime(latestWorkout.at)} · ${calorieCopy}`
          : `Workout Coach: ${calorieCopy}`;
      }
      const definition = getWidgetDefinition(widget.type);
      return `${definition?.title || "Widget"} is active`;
    })
    .slice(0, 4);
}

function capitalizeWord(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getCurrentStoreFingerprint() {
  if (localFingerprintCache.storeRef !== store || localFingerprintCache.updatedAt !== (store.updatedAt || 0)) {
    localFingerprintCache.storeRef = store;
    localFingerprintCache.updatedAt = store.updatedAt || 0;
    localFingerprintCache.fingerprint = computeStoreFingerprint(store);
  }
  return localFingerprintCache.fingerprint;
}

function getCurrentUserFingerprint() {
  return typeof store.userFingerprint === "string" && store.userFingerprint
    ? store.userFingerprint
    : computeUserContentFingerprint(store);
}

function rememberRemoteStoreState({
  updatedAt = 0,
  fingerprint = "",
  savedAt = 0,
  userUpdatedAt = 0,
  userFingerprint = ""
} = {}) {
  syncState.remoteUpdatedAt = updatedAt || 0;
  syncState.remoteFingerprint = fingerprint || "";
  syncState.remoteSavedAt = savedAt || 0;
  syncState.remoteUserUpdatedAt = userUpdatedAt || 0;
  syncState.remoteUserFingerprint = userFingerprint || "";
}

function clearRemoteStoreState() {
  syncState.remoteUpdatedAt = 0;
  syncState.remoteFingerprint = "";
  syncState.remoteSavedAt = 0;
  syncState.remoteUserUpdatedAt = 0;
  syncState.remoteUserFingerprint = "";
}

function setDriveSaveInFlight(inFlight, mode = "") {
  driveSaveState.inFlight = Boolean(inFlight);
  driveSaveState.mode = driveSaveState.inFlight ? mode : "";
  updateGoogleButtons();
}

function formatAutosaveCountdown(ms) {
  if (ms <= 15_000) {
    return "Due shortly";
  }
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function renderTreeCore() {
  const treeState = getTreeDisplayState();
  const profile = normalizeProfile(store.profile);
  treeCoreTitle.textContent = formatLifetreeTitle(profile.displayName);
  treeCoreTitle.dataset.help = "Fruit quantity, size, and color reflect how your points are accumulating on the tree.";
  treeHarvestButton.classList.toggle("ripe-ready", treeState.ripeFruitCount > 0);
  treeHarvestButton.dataset.help = treeState.ripeFruitCount > 0
    ? `Click to harvest ${treeState.ripeFruitCount} ripe ${treeState.ripeFruitCount === 1 ? "fruit" : "fruits"} for ${formatPointsLabel(treeState.ripePoints)}.`
    : "Click the tree to harvest ripe fruit once any are ready.";
  treeHarvestHint.textContent = profile.helpTextEnabled
    ? "Hover or long-press the tree for harvest help."
    : "";
  treeHarvestHint.classList.toggle("hidden", !profile.helpTextEnabled);

  treeFruitLayer.innerHTML = treeState.fruitDescriptors.map((fruit) => `
    <span
      class="tree-fruit-anchor"
      style="
        left: ${fruit.left}%;
        top: ${fruit.top}%;
      "
    >
      ${renderTreeFruitMarkup({
        color: fruit.color,
        stage: fruit.stage,
        size: fruit.size,
        ripe: fruit.ripe,
        title: `${fruit.categoryLabel}: ${fruit.points}/25 growth points`
      })}
    </span>
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

function formatLifetreeTitle(displayName) {
  const safeName = String(displayName || "").trim();
  if (!safeName) {
    return "Your Lifetree";
  }
  const suffix = /s$/i.test(safeName) ? "'" : "'s";
  return `${safeName}${suffix} Lifetree`;
}

function renderTreeDetailIfOpen() {
  if (!isTreeDetailOpen()) {
    return;
  }

  const treeState = getTreeDisplayState();
  const pointHistory = getRecentPointHistory();
  const devSettings = normalizeDevSettings(store.devSettings);
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
                ${category.fruits.length > 0 ? category.fruits.map((fruit) => renderTreeFruitMarkup({
                  color: category.color,
                  stage: fruit.stage,
                  size: 11 + (fruit.stage * 4),
                  ripe: fruit.ripe,
                  detail: true
                })).join("") : '<span class="tree-point-empty">No visible fruit</span>'}
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
            <h3>Recent point history</h3>
            <p class="sync-status">Showing the last 7 days of point awards, up to ${escapeHtml(String(devSettings.maxPointHistoryEntries))} entries.</p>
          </div>
        </div>
        <div class="tree-detail-sources">
          ${pointHistory.length > 0 ? pointHistory.map((entry) => `
            <article class="tree-detail-source-item">
              <div class="tree-detail-source-heading">
                <strong>${escapeHtml(entry.sourceLabel || entry.taskName || "Point award")}</strong>
                <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(entry.categoryColor)}">${escapeHtml(formatPointsLabel(entry.points))}</span>
              </div>
              <div class="tree-detail-source-meta">
                <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(entry.categoryColor)}">${escapeHtml(entry.categoryLabel)}</span>
                <span>${escapeHtml(`Awarded ${formatDateTime(entry.at)}`)}</span>
                ${formatPointHistoryDueLabel(entry) ? `<span>${escapeHtml(`Due ${formatPointHistoryDueLabel(entry)}`)}</span>` : ""}
              </div>
            </article>
          `).join("") : '<p class="tree-point-empty">No recent point awards are recorded yet.</p>'}
        </div>
      </section>
    </section>
  `;

  treeDetailBody.querySelector("[data-tree-detail-action='harvest']")?.addEventListener("click", () => {
    harvestRipeFruit();
  });
}

function formatPointHistoryDueLabel(entry) {
  if (!entry?.dueDate) {
    return "";
  }
  const time = entry.timeOfDay || "23:59";
  return formatDateTime(`${entry.dueDate}T${time}:00`);
}

function renderTreeFruitMarkup({ color, stage, size, ripe, title = "", detail = false }) {
  return `
    <span
      class="tree-fruit${detail ? " detail" : ""} stage-${stage}${ripe ? " ripe" : ""}"
      style="--fruit-color: ${escapeHtml(color)}; --fruit-size: ${size}px;"
      ${title ? `title="${escapeHtml(title)}"` : ""}
    >
      ${ripe ? `
        <span class="tree-fruit-sparkle sparkle-a" aria-hidden="true"></span>
        <span class="tree-fruit-sparkle sparkle-b" aria-hidden="true"></span>
        <span class="tree-fruit-sparkle sparkle-c" aria-hidden="true"></span>
      ` : ""}
    </span>
  `;
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
  const categories = getSelectableCategories();
  syncCategorySelect(taskCategoryInput, categories, {
    currentValue: taskCategoryInput.value || "",
    allowInactiveTaskCategory: editState.taskId
      ? store.tasks.find((task) => task.id === editState.taskId)
      : null,
    fallbackValue: categories[0]?.key || ""
  });
  syncCategorySelect(quickTaskCategoryInput, categories, {
    currentValue: quickTaskCategoryInput.value || "",
    fallbackValue: DEFAULT_CATEGORY_KEY
  });
}

function syncCategorySelect(select, categories, { currentValue = "", allowInactiveTaskCategory = null, fallbackValue = "" } = {}) {
  if (!select) {
    return;
  }

  select.innerHTML = categories.map((category) => `
    <option value="${category.key}">${escapeHtml(category.label)}</option>
  `).join("");

  if (allowInactiveTaskCategory?.categoryKey && !categories.some((category) => category.key === allowInactiveTaskCategory.categoryKey)) {
    const option = document.createElement("option");
    option.value = allowInactiveTaskCategory.categoryKey;
    option.textContent = `${allowInactiveTaskCategory.categoryLabel} (inactive)`;
    select.appendChild(option);
  }

  const preferredValue = currentValue || fallbackValue;
  const hasPreferred = Array.from(select.options).some((option) => option.value === preferredValue);
  select.value = hasPreferred ? preferredValue : (categories[0]?.key || "");
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
    slot.classList.remove("empty", "filled", "widget-slot-chooser");

    if (!widget) {
      const chooserOpen = widgetMenuState.slotIndex === slotIndex;
      slot.classList.add("empty");
      if (!chooserOpen) {
        slot.innerHTML = `
          <div class="plus">+</div>
          <strong>Empty slot</strong>
          <p>Add a Lifetree widget here.</p>
          <button type="button" class="ghost-button" data-widget-action="add-widget">Choose widget</button>
        `;
        continue;
      }

      slot.classList.add("widget-slot-chooser");
      slot.innerHTML = `
        <div class="widget-slot-header">
          <div>
            <h3>Choose widget</h3>
            <p>Pick an available widget, or move an existing one here.</p>
          </div>
          <span class="widget-badge">Slot ${slotIndex + 1}</span>
        </div>
        <div class="widget-slot-picker">
          ${listWidgetDefinitions().map((definition) => {
            const deployedWidget = store.widgets.find((item) => item.type === definition.type);
            const deployed = Boolean(definition.singleton && deployedWidget);
            const moveConfirm = deployed && widgetMenuState.selectedType === definition.type;
            return `
              <button
                type="button"
                class="widget-slot-choice ${deployed ? "deployed" : "available"} ${moveConfirm ? "confirm" : ""}"
                data-widget-action="choose-widget-type"
                data-widget-type="${definition.type}"
                data-deployed="${deployed ? "true" : "false"}"
              >
                <strong>${escapeHtml(moveConfirm ? "Move here?" : definition.title)}</strong>
                <span>${escapeHtml(
                  moveConfirm
                    ? "Tap again to move the deployed widget into this slot."
                    : (deployed ? "Already deployed elsewhere." : (definition.menuDescription || "Add this widget to Lifetree."))
                )}</span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="widget-actions">
          <button type="button" class="ghost-button" data-widget-action="cancel-widget-menu">Cancel</button>
        </div>
      `;
      continue;
    }

    const definition = getWidgetDefinition(widget.type);
    if (definition?.render) {
      slot.classList.add("filled");
      slot.innerHTML = `
        <button
          type="button"
          class="widget-shell-remove"
          data-widget-action="remove-widget"
          aria-label="Remove widget"
          data-help="Remove this widget from the shell. Its owned tasks and history will retire."
        >
          <span aria-hidden="true">×</span>
        </button>
        ${definition.render({
        widget,
        tasks: store.tasks,
        escapeHtml,
        formatDateTime,
        getPendingActionForWidget
      })}
      `;
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

function completeWidgetTaskById(taskId, at = Date.now()) {
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task || task.archived || task.status !== "open" || isBlocked(task)) {
    return null;
  }
  markTaskCompleted(task, at);
  return task;
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

function getPendingActionByKey(key) {
  return pendingActions.get(key) || null;
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
  let result = null;
  try {
    result = pending.commit?.();
  } catch (error) {
    console.error("Pending action failed", error);
    renderAll();
    setSyncStatus("That pending action failed before it could finish.", "error");
    return;
  }
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
  if (!task || task.status !== "open" || task.archived) {
    return false;
  }

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
    option.textContent = formatTaskDisplayName(task);
    option.selected = currentSelection.has(task.id);
    dependenciesSelect.appendChild(option);
  }
}

function getDependencyCandidates() {
  return store.tasks.filter((task) => !task.templateId && !task.archived && task.status === "open");
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
    const deadlineState = getOpenTaskDeadlineState(cardData.task);
    const article = document.createElement("article");
    article.className = `task-card${cardData.status === "done" ? " done" : ""}${cardData.status === "skipped" ? " skipped" : ""}${cardData.task.archived ? " archived" : ""}${blocked ? " blocked" : ""}${deadlineState ? ` deadline-${deadlineState}` : ""}`;
    article.style.setProperty("--task-category-color", cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR);
    article.innerHTML = `
      <h3>${escapeHtml(cardData.displayName)}</h3>
      <div class="chip-row">
        <span class="task-chip length-${cardData.task.length}">${humanizeLength(cardData.task.length)}</span>
        <span class="task-chip">${escapeHtml(statusLabel(cardData.task.archived ? "archived" : cardData.status))}</span>
        <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR)}">${escapeHtml(cardData.task.categoryLabel || "Uncategorized")}</span>
        <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || DEFAULT_CATEGORY_COLOR)}">${escapeHtml(formatPointsLabel(cardData.task.pointsValue))}</span>
        ${renderPriorityIndicator(cardData.task.importance || DEFAULT_IMPORTANCE, "task")}
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

function renderPriorityIndicator(importance, variant = "task") {
  const normalized = normalizeImportance(importance || DEFAULT_IMPORTANCE);
  const definition = IMPORTANCE_DEFINITIONS[normalized];
  if (!definition?.icon) {
    return "";
  }
  const className = variant === "canopy"
    ? `canopy-priority-indicator priority-${normalized}`
    : `task-chip task-priority-indicator priority-${normalized}`;
  return `<span class="${className}" title="${escapeHtml(definition.label)}" aria-label="${escapeHtml(definition.label)}">${escapeHtml(definition.icon)}</span>`;
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
    const task = store.tasks.find((candidate) => candidate.id === item.taskId) || null;
    const canRestore = item.type === "skipped" && canRestoreHistoryTask(task, item.historyId);
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
        ${canRestore ? `<button type="button" class="ghost-button" data-history-action="restore" data-task-id="${item.taskId}" data-history-id="${item.historyId}">Restore</button>` : ""}
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
  if ((action === "reuse" || action === "restore") && !task) {
    return;
  }

  if (action === "reuse") {
    populateComposerFromHistory(task);
    setSyncStatus(`Loaded ${task.name} into the new task form.`, "info");
    return;
  }

  if (action === "restore") {
    const historyId = event.currentTarget.getAttribute("data-history-id") || "";
    if (!canRestoreHistoryTask(task, historyId)) {
      setSyncStatus("That skipped task can no longer be restored from history.", "error");
      return;
    }
    markTaskOpen(task);
    reconcileRecurringSeries();
    persistStore();
    renderAll();
    setSyncStatus(`Restored ${task.name}.`, "info");
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

function canRestoreHistoryTask(task, historyId, now = new Date()) {
  if (!task || task.archived || task.status !== "skipped" || !historyId) {
    return false;
  }

  const latestLifecycle = getLatestLifecycleEntry(task);
  if (!latestLifecycle || latestLifecycle.type !== "skipped" || latestLifecycle.id !== historyId) {
    return false;
  }

  return !shouldSkipTask({
    ...task,
    archived: false,
    status: "open"
  }, now);
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
        displayName: formatTaskDisplayName(task)
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
      displayName: formatTaskDisplayName(active)
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
  editState.linkedGroupId = "";
  setActiveTaskDeskPane("composer");
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
  setTaskReminderFormValues(task.reminders, {
    importance: task.importance || DEFAULT_IMPORTANCE,
    lateGraceMinutes: task.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES,
    treatAsUserTouched: true
  });
  skipRuleTypeInput.value = "none";
  skipGraceMinutesInput.value = 15;
  recurrenceType.value = "none";
  recurrenceForeverInput.checked = false;
  renderDailyInstanceTimes([]);
  setWeeklyDaySelection([0]);
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = false;
  });
  updateSkipVisibility();
  syncTaskReminderInputs();
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
    const templates = getLinkedSeriesTemplates(template);
    for (const linkedTemplate of templates) {
      deleteSeriesTemplate(linkedTemplate);
    }
    return;
  }

  rememberDeletedTask(task);
  store.tasks = store.tasks.filter((item) => item.id !== task.id);
  for (const item of store.tasks) {
    item.dependencies = item.dependencies.filter((dependencyId) => dependencyId !== task.id);
  }
}

function deleteSeriesTemplate(template) {
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
    if (removedIds.has(item.sequenceDependencyId)) {
      item.sequenceDependencyId = "";
    }
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
  const linkedTemplates = scope === "series" ? getLinkedSeriesTemplates(target) : [target];
  const primaryTemplate = linkedTemplates[0] || target;

  setActiveTaskDeskPane("composer");
  editState.taskId = task.id;
  editState.scope = scope;
  editState.linkedGroupId = scope === "series" && hasLinkedSeriesGroup(target) ? target.linkedSeries.groupId : "";
  editScope.value = scope;
  taskNameInput.value = primaryTemplate.name;
  taskDetailsInput.value = primaryTemplate.details;
  startDateInput.value = primaryTemplate.startDate;
  dueDateInput.value = primaryTemplate.dueDate;
  timeOfDayInput.value = primaryTemplate.timeOfDay || "";
  lateGraceMinutesInput.value = String(primaryTemplate.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES);
  setTaskPointsInput(primaryTemplate.pointsValue ?? defaultPointsForLength(primaryTemplate.length));
  taskLengthInput.value = primaryTemplate.length;
  renderCategoryOptions();
  taskCategoryInput.value = primaryTemplate.categoryKey || DEFAULT_CATEGORY_KEY;
  taskImportanceInput.value = normalizeImportance(primaryTemplate.importance || DEFAULT_IMPORTANCE);
  setTaskReminderFormValues(primaryTemplate.reminders, {
    importance: primaryTemplate.importance || DEFAULT_IMPORTANCE,
    lateGraceMinutes: primaryTemplate.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES,
    treatAsUserTouched: true
  });
  const dependencySet = new Set(primaryTemplate.dependencies || []);
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = dependencySet.has(option.value);
  });
  applySkipRuleToForm(primaryTemplate.skipRule);
  applyRecurrenceToForm(scope === "series" ? primaryTemplate.recurrence : { type: "none" });
  if (scope === "series" && hasLinkedSeriesGroup(primaryTemplate)) {
    if (primaryTemplate.linkedSeries.kind === LINKED_SERIES_KIND_DAILY) {
      const sortedTemplates = [...linkedTemplates].sort((left, right) => (left.linkedSeries?.slotIndex || 0) - (right.linkedSeries?.slotIndex || 0));
      timeOfDayInput.value = sortedTemplates[0]?.timeOfDay || "";
      renderDailyInstanceTimes(sortedTemplates.slice(1).map((item) => item.timeOfDay || ""));
    } else if (primaryTemplate.linkedSeries.kind === LINKED_SERIES_KIND_WEEKLY) {
      setWeeklyDaySelection(linkedTemplates.map((item) => item.recurrence?.weekday));
    }
  }
  updateSkipVisibility();
  syncTaskReminderInputs();
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
  setWeeklyDaySelection([recurrence?.weekday ?? 0]);
  document.getElementById("monthlyDay").value = recurrence?.day || 1;
  document.getElementById("monthlyInterval").value = recurrence?.interval || 1;
  document.getElementById("monthlyOrdinal").value = recurrence?.ordinal || "first";
  document.getElementById("monthlyWeekday").value = String(recurrence?.weekday ?? 0);
  document.getElementById("recurrenceEndDate").value = recurrence?.endDate || "";
  document.getElementById("recurrenceCount").value = recurrence?.count || "";
  recurrenceForeverInput.checked = Boolean(recurrence?.forever);
  renderDailyInstanceTimes([]);
  composerPanelState.recurrenceOpen = recurrenceType.value !== "none";
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
  editState.linkedGroupId = "";
  resetComposer();
  renderAll();
}

function resetComposer() {
  form.reset();
  composerPanelState.recurrenceOpen = false;
  composerPanelState.reminderOptionsOpen = false;
  recurrenceForeverInput.checked = false;
  lateGraceMinutesInput.value = String(DEFAULT_LATE_GRACE_MINUTES);
  setTaskPointsInput(defaultPointsForLength(taskLengthInput.value || "medium"));
  taskCategoryInput.value = DEFAULT_CATEGORY_KEY;
  taskImportanceInput.value = DEFAULT_IMPORTANCE;
  composerReminderState.userTouched = false;
  taskRemindersEnabledInput.checked = false;
  taskReminderDueSoonMinutesInput.value = "";
  taskReminderOverdueMinutesInput.value = "";
  newCategoryColorInput.value = DEFAULT_CATEGORY_COLOR;
  renderDailyInstanceTimes([]);
  setWeeklyDaySelection([0]);
  updateRecurrenceVisibility();
  updateSkipVisibility();
  syncTaskReminderInputs();
  Array.from(dependenciesSelect.options).forEach((option) => {
    option.selected = false;
  });
  editPanel.classList.add("hidden");
  cancelEditButton.classList.add("hidden");
  submitButton.textContent = "Add task";
}

function resetQuickAddForm() {
  if (!quickAddForm) {
    return;
  }
  quickAddForm.reset();
  quickTaskCategoryInput.value = DEFAULT_CATEGORY_KEY;
  quickTaskLengthInput.value = "medium";
  quickTaskImportanceInput.value = DEFAULT_IMPORTANCE;
}

function getSeriesTemplate(task) {
  if (!task) {
    return null;
  }
  return task.templateId ? store.tasks.find((item) => item.id === task.templateId) : task;
}

function getLinkedSeriesTemplates(task) {
  const template = getSeriesTemplate(task);
  if (!template) {
    return [];
  }
  if (!hasLinkedSeriesGroup(template)) {
    return [template];
  }
  return store.tasks
    .filter((item) => !item.templateId && item.linkedSeries?.groupId === template.linkedSeries.groupId)
    .sort((left, right) => (left.linkedSeries?.slotIndex || 0) - (right.linkedSeries?.slotIndex || 0));
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
  const dependencyIds = getTaskDependencyIds(task);
  if (dependencyIds.length === 0) {
    return false;
  }
  return dependencyIds.some((dependencyId) => {
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
  const dependencyIds = getTaskDependencyIds(task);
  if (dependencyIds.length === 0 && !availabilityLabel) {
    return "No prerequisite tasks.";
  }
  if (dependencyIds.length === 0 && availabilityLabel) {
    return `Not before ${availabilityLabel}.`;
  }
  const names = dependencyIds.map((dependencyId) => {
    const dependency = store.tasks.find((item) => item.id === dependencyId);
    return dependency ? formatTaskDisplayName(dependency) : "missing task";
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
  if (getTaskDependencyIds(task).length === 0) {
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

function getTaskDependencyIds(task) {
  const ids = Array.isArray(task?.dependencies) ? [...task.dependencies] : [];
  if (typeof task?.sequenceDependencyId === "string" && task.sequenceDependencyId) {
    ids.push(task.sequenceDependencyId);
  }
  return [...new Set(ids)];
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

  composerPanelState.recurrenceOpen = value !== "none";
  syncComposerPanelState();

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
  const categories = normalizeCategoryDefinitions(input.categories);
  const widgets = normalizeWidgets(input.widgets);
  const retiredWidgets = normalizeWidgets(input.retiredWidgets);
  const resolveStoredCategorySnapshot = createCategorySnapshotResolver(categories, widgets);
  const devSettings = normalizeDevSettings(input.devSettings);
  const normalizedPointLedger = normalizePointLedgerBase(input.pointLedger, {
    defaultCategoryKey: DEFAULT_CATEGORY_KEY,
    normalizeCategoryColor,
    resolveCategorySnapshot: resolveStoredCategorySnapshot
  });
  const pointHistorySource = Array.isArray(input.pointHistory) ? input.pointHistory : normalizedPointLedger;
  const normalized = {
    version: 18,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
    driveFileId: typeof input.driveFileId === "string" ? input.driveFileId : "",
    profile: normalizeProfile(input.profile),
    notifications: normalizeNotifications(input.notifications),
    tasks,
    pointLedger: normalizedPointLedger,
    pointHistory: normalizePointHistoryBase(pointHistorySource, {
      defaultCategoryKey: DEFAULT_CATEGORY_KEY,
      normalizeCategoryColor,
      resolveCategorySnapshot: resolveStoredCategorySnapshot,
      maxEntries: devSettings.maxPointHistoryEntries
    }),
    treeState: normalizeTreeState(input.treeState),
    devSettings,
    categories,
    widgets,
    retiredWidgets,
    recurringBonusSelections: normalizeRecurringBonusSelections(input.recurringBonusSelections),
    deletionMarkers: normalizeDeletionMarkers(input.deletionMarkers)
  };
  normalized.userUpdatedAt = typeof input.userUpdatedAt === "number"
    ? input.userUpdatedAt
    : normalized.updatedAt;
  normalized.userFingerprint = computeUserContentFingerprintFromNormalized(normalized);
  return normalized;
}

function normalizeTask(task) {
  const fallbackCategory = BASE_CATEGORIES.find((category) => category.key === (typeof task.categoryKey === "string" ? task.categoryKey : DEFAULT_CATEGORY_KEY))
    || BASE_CATEGORIES.find((category) => category.key === DEFAULT_CATEGORY_KEY)
    || BASE_CATEGORIES[0];
  const normalizedImportance = normalizeImportance(task.importance);
  const normalizedWidgetTaskMeta = normalizeWidgetTaskMeta(task.widgetTaskMeta);
  const normalizedLateGraceMinutes = parsePositiveOrZeroNumber(task.lateGraceMinutes) ?? DEFAULT_LATE_GRACE_MINUTES;
  return {
    id: typeof task.id === "string" ? task.id : createId(),
    templateId: typeof task.templateId === "string" ? task.templateId : "",
    occurrenceIndex: typeof task.occurrenceIndex === "number" ? task.occurrenceIndex : 0,
    name: typeof task.name === "string" ? task.name : "Untitled task",
    details: typeof task.details === "string" ? task.details : "",
    startDate: typeof task.startDate === "string" ? task.startDate : "",
    dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
    timeOfDay: typeof task.timeOfDay === "string" ? task.timeOfDay : "",
    lateGraceMinutes: normalizedLateGraceMinutes,
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
    importance: normalizedImportance,
    status: normalizeStatus(task),
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    ownerWidgetId: typeof task.ownerWidgetId === "string" ? task.ownerWidgetId : "",
    ownerWidgetType: typeof task.ownerWidgetType === "string" ? task.ownerWidgetType : "",
    ownerTaskKey: typeof task.ownerTaskKey === "string" ? task.ownerTaskKey : "",
    widgetTaskKind: typeof task.widgetTaskKind === "string" ? task.widgetTaskKind : "",
    widgetTaskMeta: normalizedWidgetTaskMeta,
    reminders: normalizeTaskReminders(task.reminders, {
      importance: normalizedImportance,
      lateGraceMinutes: normalizedLateGraceMinutes,
      widgetTaskMeta: normalizedWidgetTaskMeta
    }),
    linkedSeries: normalizeLinkedSeries(task.linkedSeries),
    sequenceDependencyId: typeof task.sequenceDependencyId === "string" ? task.sequenceDependencyId : "",
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

function normalizeLinkedSeries(linkedSeries) {
  if (!linkedSeries || typeof linkedSeries !== "object") {
    return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
  }
  const groupId = typeof linkedSeries.groupId === "string" ? linkedSeries.groupId : "";
  const kind = linkedSeries.kind === LINKED_SERIES_KIND_DAILY || linkedSeries.kind === LINKED_SERIES_KIND_WEEKLY
    ? linkedSeries.kind
    : "";
  const slotIndex = Number.isInteger(linkedSeries.slotIndex) ? linkedSeries.slotIndex : 0;
  const slotCount = Number.isInteger(linkedSeries.slotCount) ? linkedSeries.slotCount : 1;
  if (!groupId || !kind || slotCount <= 1 || slotIndex < 0 || slotIndex >= slotCount) {
    return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
  }
  return {
    groupId,
    kind,
    slotIndex,
    slotCount
  };
}

function hasLinkedSeriesGroup(task) {
  return Boolean(task?.linkedSeries?.groupId && task.linkedSeries.slotCount > 1);
}

function normalizeDeletionMarkers(value, now = Date.now()) {
  if (!Array.isArray(value)) {
    return [];
  }

  const cutoff = now - DELETION_MARKER_RETENTION_MS;
  const mergedByKey = new Map();
  for (const entry of value) {
    const type = entry?.type === "task-id" || entry?.type === "task-key" || entry?.type === "series-id"
      ? entry.type
      : "";
    const markerValue = typeof entry?.value === "string" ? entry.value.slice(0, 240) : "";
    const deletedAt = typeof entry?.deletedAt === "number" ? entry.deletedAt : 0;
    if (!type || !markerValue || deletedAt <= 0 || deletedAt < cutoff) {
      continue;
    }
    const key = `${type}:${markerValue}`;
    const existing = mergedByKey.get(key);
    if (!existing || deletedAt >= existing.deletedAt) {
      mergedByKey.set(key, {
        type,
        value: markerValue,
        deletedAt
      });
    }
  }

  return Array.from(mergedByKey.values())
    .sort((left, right) => right.deletedAt - left.deletedAt || left.type.localeCompare(right.type) || left.value.localeCompare(right.value))
    .slice(0, MAX_DELETION_MARKERS);
}

function mergeDeletionMarkers(localMarkers = [], remoteMarkers = [], now = Date.now()) {
  return normalizeDeletionMarkers([
    ...normalizeDeletionMarkers(localMarkers, now),
    ...normalizeDeletionMarkers(remoteMarkers, now)
  ], now);
}

function buildDeletionMarkerMaps(markers = []) {
  const taskIds = new Map();
  const taskKeys = new Map();
  const seriesIds = new Map();
  for (const marker of normalizeDeletionMarkers(markers)) {
    const target = marker.type === "task-id"
      ? taskIds
      : marker.type === "task-key"
        ? taskKeys
        : seriesIds;
    const existing = target.get(marker.value) || 0;
    if (marker.deletedAt >= existing) {
      target.set(marker.value, marker.deletedAt);
    }
  }
  return { taskIds, taskKeys, seriesIds };
}

function deletionMarkerSuppressesTask(task, deletionMarkerMaps) {
  if (!task || !deletionMarkerMaps) {
    return false;
  }

  const latestTaskAt = latestTaskTimestampForMerge(task);
  const taskIdDeletedAt = deletionMarkerMaps.taskIds.get(task.id) || 0;
  if (taskIdDeletedAt >= latestTaskAt) {
    return true;
  }

  const logicalKey = buildLogicalWidgetTaskKey(task);
  const taskKeyDeletedAt = logicalKey ? (deletionMarkerMaps.taskKeys.get(logicalKey) || 0) : 0;
  if (taskKeyDeletedAt >= latestTaskAt) {
    return true;
  }

  const seriesDeletedAt = Math.max(
    deletionMarkerMaps.seriesIds.get(task.id) || 0,
    task.templateId ? (deletionMarkerMaps.seriesIds.get(task.templateId) || 0) : 0
  );
  return seriesDeletedAt >= latestTaskAt;
}

function addDeletionMarker(type, value, deletedAt = Date.now()) {
  const markerType = type === "task-id" || type === "task-key" || type === "series-id" ? type : "";
  const markerValue = typeof value === "string" ? value.trim().slice(0, 240) : "";
  if (!markerType || !markerValue) {
    return;
  }
  store.deletionMarkers = normalizeDeletionMarkers([
    {
      type: markerType,
      value: markerValue,
      deletedAt
    },
    ...(Array.isArray(store.deletionMarkers) ? store.deletionMarkers : [])
  ], deletedAt);
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

function createCategorySnapshotResolver(categories = [], widgets = []) {
  const mergedByKey = new Map();

  for (const category of normalizeCategoryDefinitions(categories)) {
    mergedByKey.set(category.key, category);
  }
  for (const category of listWidgetCategories(widgets)) {
    const normalized = createCategoryDefinition(category);
    if (normalized && !mergedByKey.has(normalized.key)) {
      mergedByKey.set(normalized.key, normalized);
    }
  }

  return (categoryKey, originalTask = null) => {
    const selectedKey = slugifyCategoryKey(categoryKey || originalTask?.categoryKey || DEFAULT_CATEGORY_KEY);
    const currentCategory = mergedByKey.get(selectedKey);
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

function normalizeRecurringBonusSelections(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => typeof entry?.key === "string" && entry.key)
    .map((entry) => ({
      key: entry.key,
      selectedCategoryKey: slugifyCategoryKey(entry.selectedCategoryKey || ""),
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0
    }))
    .filter((entry) => entry.selectedCategoryKey)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function mergeRecurringBonusSelections(localSelections = [], remoteSelections = []) {
  const mergedByKey = new Map();

  for (const entry of normalizeRecurringBonusSelections(remoteSelections)) {
    mergedByKey.set(entry.key, entry);
  }
  for (const entry of normalizeRecurringBonusSelections(localSelections)) {
    const existing = mergedByKey.get(entry.key);
    if (!existing || (entry.updatedAt || 0) >= (existing.updatedAt || 0)) {
      mergedByKey.set(entry.key, entry);
    }
  }

  return Array.from(mergedByKey.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function persistStore({ touchUpdatedAt = true, touchUserUpdatedAt = touchUpdatedAt } = {}) {
  const now = Date.now();
  store.pointHistory = normalizePointHistory(store.pointHistory, store.devSettings);
  store.deletionMarkers = normalizeDeletionMarkers(store.deletionMarkers, now);
  if (touchUpdatedAt) {
    store.updatedAt = now;
  }
  if (touchUserUpdatedAt) {
    store.userUpdatedAt = now;
    store.userFingerprint = computeUserContentFingerprint(store);
  }
  persistLocalStore(store);
}

function persistLocalStore(nextStore) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(nextStore));
}

function createEmptyStore() {
  const now = Date.now();
  const emptyStore = {
    version: 18,
    updatedAt: now,
    userUpdatedAt: now,
    driveFileId: "",
    profile: normalizeProfile({}),
    notifications: normalizeNotifications({}),
    tasks: [],
    pointLedger: [],
    pointHistory: [],
    treeState: normalizeTreeState({}),
    devSettings: normalizeDevSettings({}),
    categories: normalizeCategoryDefinitions([]),
    widgets: [],
    retiredWidgets: [],
    recurringBonusSelections: [],
    deletionMarkers: []
  };
  emptyStore.userFingerprint = computeUserContentFingerprintFromNormalized(emptyStore);
  return emptyStore;
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
  const mergedCategories = mergeCategoryDefinitions(localStore.categories, remoteStore.categories);
  const mergedWidgets = mergeWidgetLists(localStore.widgets, remoteStore.widgets, widgetRegistryHelpers(), MAX_WIDGETS);
  const preferredUserState = choosePreferredUserSyncState(localStore, remoteStore);
  const mergedDeletionMarkers = mergeDeletionMarkers(localStore.deletionMarkers, remoteStore.deletionMarkers);
  const deletionMarkerMaps = buildDeletionMarkerMaps(mergedDeletionMarkers);
  const mergedDevSettings = (localStore.updatedAt || 0) >= (remoteStore.updatedAt || 0)
    ? normalizeDevSettings(localStore.devSettings)
    : normalizeDevSettings(remoteStore.devSettings);
  const mergedById = new Map();
  const localById = new Map(localStore.tasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteStore.tasks.map((task) => [task.id, task]));
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  for (const taskId of allIds) {
    const localTask = localById.get(taskId) || null;
    const remoteTask = remoteById.get(taskId) || null;
    if (localTask && remoteTask) {
      mergedById.set(taskId, choosePreferredTask(localTask, remoteTask, localStore.updatedAt, remoteStore.updatedAt));
      continue;
    }
    if (localTask && !deletionMarkerSuppressesTask(localTask, deletionMarkerMaps) && shouldKeepUnpairedTask(localTask, remoteStore.updatedAt || 0)) {
      mergedById.set(taskId, localTask);
      continue;
    }
    if (remoteTask && !deletionMarkerSuppressesTask(remoteTask, deletionMarkerMaps) && shouldKeepUnpairedTask(remoteTask, localStore.updatedAt || 0)) {
      mergedById.set(taskId, remoteTask);
    }
  }

  return {
    version: 18,
    updatedAt: Math.max(localStore.updatedAt || 0, remoteStore.updatedAt || 0),
    userUpdatedAt: preferredUserState.userUpdatedAt,
    userFingerprint: preferredUserState.userFingerprint,
    driveFileId: remoteStore.driveFileId || localStore.driveFileId || "",
    profile: choosePreferredProfile(localStore.profile, remoteStore.profile),
    notifications: choosePreferredNotifications(localStore.notifications, remoteStore.notifications),
    tasks: Array.from(mergedById.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TASKS),
    pointLedger: mergePointLedger(localStore.pointLedger, remoteStore.pointLedger),
    pointHistory: mergePointHistory(
      Array.isArray(localStore.pointHistory) ? localStore.pointHistory : localStore.pointLedger,
      Array.isArray(remoteStore.pointHistory) ? remoteStore.pointHistory : remoteStore.pointLedger,
      mergedDevSettings
    ),
    treeState: choosePreferredTreeState(localStore.treeState, remoteStore.treeState),
    devSettings: mergedDevSettings,
    categories: mergedCategories,
    widgets: mergedWidgets,
    retiredWidgets: mergeRetiredWidgets(localStore.retiredWidgets, remoteStore.retiredWidgets, mergedWidgets),
    recurringBonusSelections: mergeRecurringBonusSelections(localStore.recurringBonusSelections, remoteStore.recurringBonusSelections),
    deletionMarkers: mergedDeletionMarkers
  };
}

function computeStoreFingerprint(sourceStore) {
  const normalized = normalizeStore(sourceStore || createEmptyStore());
  return hashComparableStore(buildComparableStore(normalized));
}

function computeUserContentFingerprint(sourceStore) {
  const normalized = normalizeStore(sourceStore || createEmptyStore());
  return computeUserContentFingerprintFromNormalized(normalized);
}

function computeUserContentFingerprintFromNormalized(normalized) {
  return hashComparableStore(buildComparableStore(normalized));
}

function hashComparableStore(comparableStore) {
  return `fnv1a64:${hashStringFNV1a64(JSON.stringify(sortObjectKeys(comparableStore)))}`;
}

function hashStringFNV1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function buildComparableStore(normalized) {
  const normalizedProfile = normalizeProfile(normalized.profile);
  const normalizedNotifications = normalizeNotifications(normalized.notifications);
  const comparable = {
    profile: {
      displayName: normalizedProfile.displayName,
      autosaveEnabled: normalizedProfile.autosaveEnabled,
      autosaveIntervalMinutes: normalizedProfile.autosaveIntervalMinutes,
      darkModeEnabled: normalizedProfile.darkModeEnabled,
      autoDarkModeEnabled: normalizedProfile.autoDarkModeEnabled,
      autoDarkModeStart: normalizedProfile.autoDarkModeStart,
      autoDarkModeEnd: normalizedProfile.autoDarkModeEnd,
      helpTextEnabled: normalizedProfile.helpTextEnabled,
      helpTooltipDelayMs: normalizedProfile.helpTooltipDelayMs
    },
    notifications: {
      email: {
        recipientEmail: normalizedNotifications.email.recipientEmail,
        summaries: sortObjectKeys(normalizedNotifications.email.summaries),
        reminders: sortObjectKeys(normalizedNotifications.email.reminders)
      }
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
        reminders: normalizeTaskReminders(task.reminders, {
          importance: task.importance,
          lateGraceMinutes: task.lateGraceMinutes,
          widgetTaskMeta: task.widgetTaskMeta
        }),
        status: task.status,
        createdAt: task.createdAt,
        ownerWidgetId: task.ownerWidgetId,
        ownerWidgetType: task.ownerWidgetType,
        ownerTaskKey: task.ownerTaskKey,
        widgetTaskKind: task.widgetTaskKind || "",
        widgetTaskMeta: normalizeWidgetTaskMeta(task.widgetTaskMeta),
        linkedSeries: normalizeLinkedSeries(task.linkedSeries),
        sequenceDependencyId: task.sequenceDependencyId || "",
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
    pointLedger: (Array.isArray(normalized.pointLedger) ? normalized.pointLedger : [])
      .map((entry) => sortObjectKeys(entry))
      .sort((left, right) => left.id.localeCompare(right.id)),
    treeState: sortObjectKeys(normalized.treeState || {}),
    devSettings: sortObjectKeys(normalizeDevSettings(normalized.devSettings)),
    categories: (Array.isArray(normalized.categories) ? normalized.categories : [])
      .map((category) => ({
        active: category.active !== false,
        builtin: category.builtin === true,
        color: category.color,
        key: category.key,
        label: category.label
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    widgets: (Array.isArray(normalized.widgets) ? normalized.widgets : [])
      .map((widget) => sortObjectKeys(widget))
      .sort(compareWidgetFingerprints),
    retiredWidgets: (Array.isArray(normalized.retiredWidgets) ? normalized.retiredWidgets : [])
      .map((widget) => sortObjectKeys(widget))
      .sort(compareWidgetFingerprints),
    recurringBonusSelections: normalizeRecurringBonusSelections(normalized.recurringBonusSelections)
      .map((entry) => sortObjectKeys(entry))
      .sort((left, right) => left.key.localeCompare(right.key)),
    deletionMarkers: normalizeDeletionMarkers(normalized.deletionMarkers)
      .map((entry) => sortObjectKeys(entry))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type.localeCompare(right.type);
        }
        return left.value.localeCompare(right.value);
      })
  };
  return comparable;
}

function choosePreferredUserSyncState(localStore, remoteStore) {
  const localUserUpdatedAt = localStore.userUpdatedAt || localStore.updatedAt || 0;
  const remoteUserUpdatedAt = remoteStore.userUpdatedAt || remoteStore.updatedAt || 0;
  const localUserFingerprint = localStore.userFingerprint || computeUserContentFingerprint(localStore);
  const remoteUserFingerprint = remoteStore.userFingerprint || computeUserContentFingerprint(remoteStore);

  if (localUserUpdatedAt > remoteUserUpdatedAt) {
    return {
      userUpdatedAt: localUserUpdatedAt,
      userFingerprint: localUserFingerprint
    };
  }
  if (remoteUserUpdatedAt > localUserUpdatedAt) {
    return {
      userUpdatedAt: remoteUserUpdatedAt,
      userFingerprint: remoteUserFingerprint
    };
  }
  return (localStore.updatedAt || 0) >= (remoteStore.updatedAt || 0)
    ? {
        userUpdatedAt: localUserUpdatedAt,
        userFingerprint: localUserFingerprint
      }
    : {
        userUpdatedAt: remoteUserUpdatedAt,
        userFingerprint: remoteUserFingerprint
      };
}

function shouldKeepUnpairedTask(task, otherStoreUpdatedAt = 0) {
  if (!task) {
    return false;
  }
  if (shouldAlwaysKeepUnpairedTask(task)) {
    return true;
  }
  if (!otherStoreUpdatedAt) {
    return true;
  }
  return latestTaskTimestampForMerge(task) >= otherStoreUpdatedAt;
}

function shouldAlwaysKeepUnpairedTask(task) {
  return !task.ownerWidgetType
    || task.status !== "open"
    || Boolean(task.pointsEntryId)
    || task.archived === true
    || task.historyOnly === true
    || (Array.isArray(task.history) && task.history.length > 0);
}

function latestTaskTimestampForMerge(task) {
  let latest = Math.max(0, task?.createdAt || 0, task?.hideAfterAt || 0);
  if (Array.isArray(task?.history)) {
    for (const item of task.history) {
      latest = Math.max(latest, item?.at || 0);
    }
  }
  return latest;
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
    (localTask.dueDate || "") !== (remoteTask.dueDate || "") ||
    JSON.stringify(normalizeTaskReminders(localTask.reminders, {
      importance: localTask.importance,
      lateGraceMinutes: localTask.lateGraceMinutes,
      widgetTaskMeta: localTask.widgetTaskMeta
    })) !== JSON.stringify(normalizeTaskReminders(remoteTask.reminders, {
      importance: remoteTask.importance,
      lateGraceMinutes: remoteTask.lateGraceMinutes,
      widgetTaskMeta: remoteTask.widgetTaskMeta
    })) ||
    (localTask.widgetTaskKind || "") !== (remoteTask.widgetTaskKind || "") ||
    JSON.stringify(normalizeWidgetTaskMeta(localTask.widgetTaskMeta)) !== JSON.stringify(normalizeWidgetTaskMeta(remoteTask.widgetTaskMeta))
  ) {
    return localUpdatedAt >= remoteUpdatedAt ? localTask : remoteTask;
  }
  return localTask.createdAt >= remoteTask.createdAt ? localTask : remoteTask;
}

function describeMergeResult(localStore, remoteStore) {
  if ((remoteStore.userUpdatedAt || remoteStore.updatedAt || 0) > (localStore.userUpdatedAt || localStore.updatedAt || 0)) {
    return "Loaded and merged newer changes from Google Drive into the local Lifetree data.";
  }
  if ((remoteStore.userUpdatedAt || remoteStore.updatedAt || 0) < (localStore.userUpdatedAt || localStore.updatedAt || 0)) {
    return "Loaded Google Drive data and preserved newer local changes during merge.";
  }
  return "Loaded and merged Google Drive data.";
}

function updateGoogleButtons() {
  const saveInFlight = driveSaveState.inFlight;
  googleSignInButton.disabled = authState.authenticated || saveInFlight;
  googleSignOutButton.disabled = !authState.authenticated || saveInFlight;
  loadDriveButton.disabled = !authState.authenticated || saveInFlight;
  saveDriveButton.disabled = !authState.authenticated || saveInFlight;
  saveDriveButton.dataset.state = saveInFlight ? driveSaveState.mode || "saving" : "idle";
  saveDriveButton.textContent = saveInFlight
    ? (driveSaveState.mode === "autosave" ? "Autosaving…" : "Saving…")
    : "Save to Drive";
  clearDriveDataButton.disabled = !isDeveloperUser();
  clearWidgetDriveDataButton.disabled = !isDeveloperUser();
  downloadDriveDataButton.disabled = !isDeveloperUser();
  sendDeveloperDailySummaryButton.disabled = !authState.authenticated || notificationSendState.inFlight;
  sendDeveloperDailyAgendaButton.disabled = !authState.authenticated || notificationSendState.inFlight;
  renderDeveloperPanel();
  renderSyncMeta();
  renderNotificationsIfOpen();
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
  importDriveDataButton.disabled = !visible;
  const notificationsBusy = !authState.authenticated || notificationSendState.inFlight;
  copyNotificationDiagnosticsButton.disabled = !authState.authenticated;
  sendDeveloperNotificationTestButton.disabled = notificationsBusy;
  sendDeveloperDailySummaryButton.disabled = notificationsBusy;
  sendDeveloperDailyAgendaButton.disabled = notificationsBusy;
  sendDeveloperNotificationTestButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "test"
    ? "Sending…"
    : "Send test notification email";
  sendDeveloperDailySummaryButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "summary"
    ? "Sending…"
    : "Send daily summary email";
  sendDeveloperDailyAgendaButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "reminder"
    ? "Sending…"
    : "Send daily agenda email";

  const devSettings = normalizeDevSettings(store.devSettings);
  developerMaxTaskPoints.value = String(devSettings.maxTaskPoints);
  developerMaxPointHistoryEntries.value = String(devSettings.maxPointHistoryEntries);
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

function updateMaxPointHistoryEntriesSetting() {
  const nextValue = Math.max(1, Math.min(DEFAULT_MAX_POINT_HISTORY_ENTRIES, parsePositiveNumber(developerMaxPointHistoryEntries.value) || DEFAULT_MAX_POINT_HISTORY_ENTRIES));
  store.devSettings = normalizeDevSettings({
    ...store.devSettings,
    maxPointHistoryEntries: nextValue
  });
  store.pointHistory = normalizePointHistory(store.pointHistory, store.devSettings);
  developerMaxPointHistoryEntries.value = String(nextValue);
  persistStore();
  renderDeveloperPanel();
  renderTreeDetailIfOpen();
  setSyncStatus(`Recent point history is now capped at ${nextValue} entries over the last 7 days.`, "info");
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

  recordPointEntry({
    id: createId(),
    taskId: "",
    taskName: "",
    at: Date.now(),
    points,
    categoryKey: category.key,
    categoryLabel: category.label,
    categoryColor: category.color,
    dueDate: "",
    timeOfDay: "",
    sourceKey: `developer:${slugifyCategoryKey(source) || "injection"}`,
    sourceType: "developer",
    sourceLabel: source
  });

  persistStore();
  renderDeveloperPanel();
  renderTreeDetailIfOpen();
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

async function sendDeveloperDailySummary() {
  if (!isDeveloperUser()) {
    return;
  }
  const savedDraft = normalizeNotifications(store.notifications).email;
  const recipientEmail = savedDraft.recipientEmail || authState.user?.email || "";
  await sendNotificationSummaryDraft({
    draft: {
      ...savedDraft,
      recipientEmail
    },
    frequencyOverride: "daily",
    successMessage: `Sent daily summary to ${recipientEmail || "the configured recipient"}.`,
    failurePrefix: "Daily summary send failed"
  });
}

async function sendDeveloperNotificationTest() {
  if (!isDeveloperUser()) {
    return;
  }
  if (!authState.authenticated) {
    const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
    if (!authenticated) {
      setSyncStatus("Connect Google first to send a test notification email.", "error");
      return;
    }
  }

  const recipientEmail = normalizeNotifications(store.notifications).email.recipientEmail || authState.user?.email || "";
  if (!recipientEmail) {
    setSyncStatus("Choose a recipient email before sending a test notification email.", "error");
    return;
  }

  setNotificationSendInFlight(true, "test");
  try {
    const response = await fetch(`${API_BASE}/api/notifications/dev-send-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: FETCH_CREDENTIALS,
      body: JSON.stringify({ recipientEmail })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Test notification send failed");
    }
    setSyncStatus(`Sent a test notification email to ${recipientEmail}.`, "success");
  } catch (error) {
    const message = String(error?.message || "Test notification send failed");
    if (message.includes("insufficientPermissions")) {
      setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the test notification again.", "error");
    } else if (message === "Not authenticated") {
      setSyncStatus("Connect Google first to send a test notification email.", "error");
    } else {
      setSyncStatus(`Test notification send failed: ${message}`, "error");
    }
  } finally {
    setNotificationSendInFlight(false, "");
  }
}

async function sendDeveloperDailyAgenda() {
  if (!isDeveloperUser()) {
    return;
  }
  const savedDraft = normalizeNotifications(store.notifications).email;
  const recipientEmail = savedDraft.recipientEmail || authState.user?.email || "";
  await sendNotificationReminderDraft({
    draft: {
      ...savedDraft,
      recipientEmail,
      reminders: normalizeEmailReminderConfig({
        ...savedDraft.reminders,
        enabled: true,
        dailyAgendaEnabled: true,
        updatedAt: savedDraft.reminders?.updatedAt || 0
      })
    },
    includeKinds: {
      dueSoon: false,
      overdue: false,
      dailyAgenda: true
    },
    requireDailyAgendaTime: false,
    successMessage: `Sent daily agenda to ${recipientEmail || "the configured recipient"}.`,
    failurePrefix: "Daily agenda send failed"
  });
}

function getReturnToTarget() {
  if (!API_BASE || API_BASE === window.location.origin) {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  try {
    const apiUrl = new URL(API_BASE);
    if (apiUrl.protocol === "http:" && (apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1")) {
      return `${apiUrl.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    }
  } catch {}

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

function handleTaskImportanceChange() {
  if (editState.taskId || composerReminderState.userTouched) {
    return;
  }
  taskRemindersEnabledInput.checked = normalizeImportance(taskImportanceInput.value) === "high";
  syncTaskReminderInputs();
}

function handleTaskReminderInputChange() {
  composerReminderState.userTouched = true;
  syncTaskReminderInputs();
}

function syncTaskReminderInputs() {
  const remindersEnabled = taskRemindersEnabledInput.checked;
  taskReminderDueSoonMinutesInput.disabled = !remindersEnabled;
  taskReminderOverdueMinutesInput.disabled = !remindersEnabled;
  taskReminderDueSoonMinutesInput.placeholder = String(DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES);
  taskReminderOverdueMinutesInput.placeholder = String(parsePositiveOrZeroNumber(lateGraceMinutesInput.value) ?? DEFAULT_LATE_GRACE_MINUTES);
  taskReminderDefaultsCopy.textContent = `Leave either field blank to use the default: ${DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES} minutes before due, and ${taskReminderOverdueMinutesInput.placeholder} minute${taskReminderOverdueMinutesInput.placeholder === "1" ? "" : "s"} after due.`;
}

function setTaskReminderFormValues(reminders, { importance = DEFAULT_IMPORTANCE, lateGraceMinutes = DEFAULT_LATE_GRACE_MINUTES, treatAsUserTouched = false } = {}) {
  const normalized = normalizeTaskReminders(reminders, { importance, lateGraceMinutes });
  taskRemindersEnabledInput.checked = normalized.enabled;
  taskReminderDueSoonMinutesInput.value = normalized.dueSoonMinutes == null ? "" : String(normalized.dueSoonMinutes);
  taskReminderOverdueMinutesInput.value = normalized.overdueMinutes == null ? "" : String(normalized.overdueMinutes);
  composerReminderState.userTouched = treatAsUserTouched;
}

function syncComposerPanelState() {
  syncComposerPanel(toggleCategoryOptionsButton, categoryPanelBody, composerPanelState.categoryOptionsOpen, {
    collapsedLabel: "Category options",
    expandedLabel: "Hide category options"
  });
  syncComposerPanel(toggleDependenciesButton, dependenciesPanelBody, composerPanelState.dependenciesOpen, {
    collapsedLabel: "Depends on",
    expandedLabel: "Hide dependencies"
  });
  syncComposerPanel(toggleReminderOptionsButton, reminderPanelBody, composerPanelState.reminderOptionsOpen, {
    collapsedLabel: "Reminder options",
    expandedLabel: "Hide reminder options"
  });
  syncComposerPanel(toggleRecurrenceOptionsButton, recurrencePanelBody, composerPanelState.recurrenceOpen, {
    collapsedLabel: "Repeat options",
    expandedLabel: "Hide repeat options"
  });
}

function syncComposerPanel(button, body, open, labels) {
  if (!button || !body) {
    return;
  }
  button.textContent = open ? labels.expandedLabel : labels.collapsedLabel;
  button.setAttribute("aria-expanded", open ? "true" : "false");
  button.classList.toggle("is-open", open);
  body.classList.toggle("hidden", !open);
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
  recordPointEntry(entry);
  return entry;
}

function revokePointsForTask(task) {
  if (!task.pointsEntryId) {
    return false;
  }

  const changed = removePointEntryById(task.pointsEntryId);
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
  store.pointHistory = mergePointHistory(
    store.pointHistory.filter((entry) => entry.id !== nextEntry.id),
    [nextEntry]
  );
}

function deriveTaskNotBeforeAt({ recurrence, startDate, dueDate, originalTask = null, startDateWasImplicit = false }) {
  const recurrenceType = recurrence?.type === "generated"
    ? recurrence?.sourceType || ""
    : recurrence?.type || "";
  if (!recurrenceType || recurrenceType === "none" || recurrenceType === "archived-series") {
    if (!startDate) {
      return startDateWasImplicit ? Date.now() : 0;
    }

    const startOfStartDate = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(startOfStartDate.getTime())) {
      return startDateWasImplicit ? Date.now() : 0;
    }

    return startDateWasImplicit
      ? Math.max(startOfStartDate.getTime(), Date.now())
      : startOfStartDate.getTime();
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

function normalizeWidgetTaskMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const nextValue = normalizeWidgetTaskMetaValue(item);
    if (typeof nextValue !== "undefined") {
      normalized[key] = nextValue;
    }
  }
  return normalized;
}

function normalizeWidgetTaskMetaValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeWidgetTaskMetaValue(item))
      .filter((item) => typeof item !== "undefined");
  }
  if (value && typeof value === "object") {
    return normalizeWidgetTaskMeta(value);
  }
  return undefined;
}

function normalizeTaskReminders(value, {
  originalReminders = null,
  importance = DEFAULT_IMPORTANCE,
  lateGraceMinutes = DEFAULT_LATE_GRACE_MINUTES,
  widgetTaskMeta = null
} = {}) {
  const widgetDefaults = normalizeWidgetReminderDefaults(widgetTaskMeta?.reminderDefaults);
  const explicitEnabled = typeof value?.enabled === "boolean"
    ? value.enabled
    : (typeof originalReminders?.enabled === "boolean" ? originalReminders.enabled : undefined);
  const enabled = typeof explicitEnabled === "boolean"
    ? explicitEnabled
    : (typeof widgetDefaults?.enabled === "boolean"
      ? widgetDefaults.enabled
      : normalizeImportance(importance) === "high");
  const dueSoonMinutes = value && Object.prototype.hasOwnProperty.call(value, "dueSoonMinutes")
    ? normalizeReminderMinutes(value.dueSoonMinutes, null)
    : (originalReminders && Object.prototype.hasOwnProperty.call(originalReminders, "dueSoonMinutes")
      ? normalizeReminderMinutes(originalReminders.dueSoonMinutes, null)
      : normalizeReminderMinutes(widgetDefaults?.dueSoonMinutes, null));
  const overdueMinutes = value && Object.prototype.hasOwnProperty.call(value, "overdueMinutes")
    ? normalizeReminderMinutes(value.overdueMinutes, null)
    : (originalReminders && Object.prototype.hasOwnProperty.call(originalReminders, "overdueMinutes")
      ? normalizeReminderMinutes(originalReminders.overdueMinutes, null)
      : normalizeReminderMinutes(widgetDefaults?.overdueMinutes, null));

  return {
    enabled,
    dueSoonMinutes,
    overdueMinutes
  };
}

function normalizeWidgetReminderDefaults(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
  const dueSoonMinutes = normalizeReminderMinutes(value.dueSoonMinutes, null);
  const overdueMinutes = normalizeReminderMinutes(value.overdueMinutes, null);
  return { enabled, dueSoonMinutes, overdueMinutes };
}

function buildTaskReminderDraftFromForm(formData, {
  originalTask = null,
  importance = DEFAULT_IMPORTANCE,
  lateGraceMinutes = DEFAULT_LATE_GRACE_MINUTES,
  widgetTaskMeta = null
} = {}) {
  return normalizeTaskReminders({
    enabled: formData.get("taskRemindersEnabled") === "on",
    dueSoonMinutes: normalizeReminderMinutes(formData.get("taskReminderDueSoonMinutes"), null),
    overdueMinutes: normalizeReminderMinutes(formData.get("taskReminderOverdueMinutes"), null)
  }, {
    originalReminders: originalTask?.reminders,
    importance,
    lateGraceMinutes,
    widgetTaskMeta
  });
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

function rememberDeletedTask(taskOrId, taskRecord = null) {
  const task = typeof taskOrId === "object" && taskOrId
    ? taskOrId
    : (taskRecord && typeof taskRecord === "object" ? taskRecord : null);
  const taskId = typeof taskOrId === "string" ? taskOrId : (task?.id || "");
  if (!taskId) {
    return;
  }
  addDeletionMarker("task-id", taskId);
}

function rememberDeletedTaskKey(task) {
  const taskKey = buildLogicalWidgetTaskKey(task);
  if (!taskKey) {
    return;
  }
  addDeletionMarker("task-key", taskKey);
}

function rememberDeletedSeries(templateId) {
  if (!templateId) {
    return;
  }
  addDeletionMarker("series-id", templateId);
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
    const definition = getWidgetDefinition(task.ownerWidgetType);
    if (activeWidget && task.ownerWidgetId === activeWidget.id) {
      continue;
    }

    if (activeWidget && task.ownerWidgetId !== activeWidget.id) {
      if (definition?.singleton) {
        removedIds.add(task.id);
        continue;
      }
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
    resolveCategorySnapshot,
    retireWidgetOwnedSeries
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
    widgetTaskKind: existingTask?.widgetTaskKind || template.widgetTaskKind || "",
    widgetTaskMeta: normalizeWidgetTaskMeta(existingTask?.widgetTaskMeta || template.widgetTaskMeta),
    linkedSeries: normalizeLinkedSeries(existingTask?.linkedSeries || template.linkedSeries),
    sequenceDependencyId: existingTask?.sequenceDependencyId || "",
    widgetCompletion: normalizeWidgetCompletion(existingTask?.widgetCompletion || template.widgetCompletion),
    skipRule: normalizeSkipRule(existingTask?.skipRule || template.skipRule),
    dependencies: [],
    recurrence: { type: "generated", sourceType: template.recurrence.type },
    history: Array.isArray(existingTask?.history) ? existingTask.history : []
  };
}

function reconcileRecurringSeries() {
  for (const task of [...store.tasks]) {
    if (!task.templateId && task.recurrence.type !== "none") {
      regenerateSeries(task.id, { preserveClosed: true });
    }
  }
  syncWidgetOwnedTasks();
  syncLinkedSeriesGroups();
  trimTasks();
}

function isDeveloperUser() {
  return authState.authenticated && authState.user?.email === DEV_EMAIL;
}

function syncLinkedSeriesGroups() {
  const groupIds = new Set();

  for (const task of store.tasks) {
    if (hasLinkedSeriesGroup(task) && !task.archived) {
      groupIds.add(task.linkedSeries.groupId);
      continue;
    }
    if (task.sequenceDependencyId) {
      task.sequenceDependencyId = "";
    }
  }

  for (const groupId of groupIds) {
    syncLinkedSeriesGroup(groupId);
  }
}

function syncLinkedSeriesGroup(groupId) {
  const groupedTasks = store.tasks
    .filter((task) => !task.archived && task.linkedSeries?.groupId === groupId)
    .sort((left, right) => {
      const scheduleComparison = compareTaskSchedule(left, right);
      if (scheduleComparison !== 0) {
        return scheduleComparison;
      }
      const leftSlot = left.linkedSeries?.slotIndex ?? 0;
      const rightSlot = right.linkedSeries?.slotIndex ?? 0;
      if (leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }
      return (left.occurrenceIndex || 0) - (right.occurrenceIndex || 0);
    });

  if (groupedTasks.length === 0) {
    return;
  }

  const isWeeklyWindow = groupedTasks[0]?.linkedSeries?.kind === LINKED_SERIES_KIND_WEEKLY;
  const slotCount = groupedTasks.reduce((max, task) => Math.max(max, task.linkedSeries?.slotCount || 1), 1);
  let previous = null;
  for (const task of groupedTasks) {
    task.linkedSeries = {
      ...task.linkedSeries,
      slotCount
    };
    if (isWeeklyWindow && task.skipRule?.type !== "widget-lockout") {
      task.skipRule = { type: "end-of-day" };
    }
    task.sequenceDependencyId = previous ? previous.id : "";
    previous = task;
  }
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
    clearRemoteStoreState();
    autosaveController.clearSavedBaseline();
    renderSyncMeta();
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

async function copyNotificationDiagnostics() {
  if (!isDeveloperUser()) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/notifications/dev-diagnostics`, {
      credentials: FETCH_CREDENTIALS
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Notification diagnostics failed");
    }
    const diagnostics = `${JSON.stringify(payload, null, 2)}\n`;
    try {
      await navigator.clipboard.writeText(diagnostics);
      setSyncStatus("Copied notification diagnostics from the Drive-backed store. Paste that output here and I can tell you exactly what the worker is seeing.", "info");
    } catch {
      setSyncStatus("Clipboard access failed. Open DevTools and copy the notification diagnostics from the console instead.", "error");
      console.log(diagnostics);
    }
  } catch (error) {
    setSyncStatus(`Notification diagnostics failed: ${error.message}`, "error");
  }
}

async function downloadDriveData() {
  if (!isDeveloperUser()) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/lifetree/load`, {
      credentials: FETCH_CREDENTIALS
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Drive load failed");
    }
    if (!payload.found) {
      setSyncStatus("No Google Drive Lifetree data exists yet for this account.", "info");
      return;
    }

    const blob = new Blob([`${JSON.stringify(payload.payload, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const timestamp = toDateString(new Date()).replace(/-/g, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifetree-drive-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSyncStatus("Downloaded the raw Google Drive Lifetree JSON.", "success");
  } catch (error) {
    setSyncStatus(`Drive download failed: ${error.message}`, "error");
  }
}

function openDeveloperImportPicker() {
  if (!isDeveloperUser()) {
    return;
  }
  developerImportJsonInput.value = "";
  developerImportJsonInput.click();
}

async function handleDeveloperImportJson(event) {
  if (!isDeveloperUser()) {
    event.target.value = "";
    return;
  }

  const file = event.target.files?.[0] || null;
  event.target.value = "";
  if (!file) {
    return;
  }

  if (!window.confirm("Replace the local Lifetree data on this browser with the selected JSON backup? Google Drive will not change until you save manually.")) {
    return;
  }

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const payload = parsed && typeof parsed === "object" && parsed.payload && typeof parsed.payload === "object"
      ? parsed.payload
      : parsed;
    store = normalizeStore(payload);
    finalizeStoreState();
    persistStore({ touchUpdatedAt: false, touchUserUpdatedAt: false });
    clearRemoteStoreState();
    autosaveController.clearSavedBaseline();
    autosaveController.refreshSchedule();
    renderAll();
    renderSyncMeta();
    setSyncStatus(`Imported ${file.name} into local Lifetree data. Review it, then save to Google Drive if you want to replace the remote copy.`, "success");
  } catch (error) {
    setSyncStatus(`JSON import failed: ${error.message}`, "error");
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
  const taskSlotKey = (task) => [
    task.dueDate || task.startDate || "",
    task.timeOfDay || "",
    task.ownerTaskKey || "",
    task.templateId ? "generated" : (task.recurrence?.type !== "none" ? "template" : "single")
  ].join("|");
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
    openTasks: widgetTasks
      .filter((task) => task.status === "open")
      .sort((left, right) => {
        const leftKey = `${left.dueDate || left.startDate || ""}|${left.timeOfDay || ""}|${left.ownerTaskKey || ""}`;
        const rightKey = `${right.dueDate || right.startDate || ""}|${right.timeOfDay || ""}|${right.ownerTaskKey || ""}`;
        return leftKey.localeCompare(rightKey);
      })
      .map((task) => ({
        id: task.id,
        name: task.name,
        kind: task.templateId ? "generated" : (task.recurrence?.type !== "none" ? "template" : "single"),
        signature: buildWidgetTaskSignature(task),
        slotKey: taskSlotKey(task),
        templateId: task.templateId || "",
        occurrenceIndex: Number.isFinite(task.occurrenceIndex) ? task.occurrenceIndex : 0,
        ownerTaskKey: task.ownerTaskKey || "",
        dueDate: task.dueDate || "",
        timeOfDay: task.timeOfDay || "",
        dependencies: Array.isArray(task.dependencies) ? [...task.dependencies] : [],
        archived: task.archived === true
      })),
    slotCounts: Array.from(
      widgetTasks.reduce((accumulator, task) => {
        const key = [
          task.dueDate || task.startDate || "",
          task.timeOfDay || "",
          task.ownerTaskKey || "",
          task.status
        ].join("|");
        accumulator.set(key, (accumulator.get(key) || 0) + 1);
        return accumulator;
      }, new Map()).entries()
    )
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count })),
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
  if (task?.ownerWidgetType === "energy") {
    const scheduledDate = task?.dueDate || task?.startDate || "";
    const scheduledTime = task?.timeOfDay || "";
    if (scheduledDate || scheduledTime) {
      return [
        "energy-slot",
        scheduledDate,
        scheduledTime,
        Number(task?.archived === true)
      ].join("|");
    }
  }
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
    const resolutionPreference = compareTaskResolutionPreference(right, left);
    if (resolutionPreference !== 0) {
      return resolutionPreference;
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
