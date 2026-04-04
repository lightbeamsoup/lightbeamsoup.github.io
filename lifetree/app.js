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
import { createCanopyController } from "./modules/canopyController.js";
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
  renderNotificationHistory as renderNotificationHistoryShared,
  renderNotificationsPreview as renderNotificationsPreviewShared
} from "./modules/notificationUi.js";
import { createNotificationSyncController } from "./modules/notificationSyncController.js";
import {
  DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES,
  appendNotificationHistoryEntry,
  choosePreferredNotifications,
  normalizeEmailReminderConfig,
  normalizeEmailSummaryConfig,
  normalizeNotifications,
  normalizeNotificationTimezone,
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
import {
  renderPriorityIndicator as renderPriorityIndicatorShared,
} from "./modules/taskHistoryUi.js";
import { createTaskHistoryController } from "./modules/taskHistoryController.js";
import { createTaskComposerBindings } from "./modules/taskComposer.js";
import { createDeveloperController } from "./modules/developerController.js";
import { createWidgetController } from "./modules/widgetController.js";
import { buildPointSummary, buildFruitDisplayState } from "./modules/treeState.js";
import {
  buildAppliedTreeAppearance,
  buildTreeStyleCatalog,
  exchangeTreeBankedPoints,
  getTreeBankedPointsByCategory,
  getTreeSkin,
  getTreeStylePartLabel,
  listPurchasableTreeSkins,
  normalizeTreeStyleState,
  purchaseTreeSkin,
  TREE_POINT_EXCHANGE_RATIO,
  removeOwnedTreeSkin,
  equipTreeSkin
} from "./modules/treeStyles.js";
import { buildTemporalState, formatDate, formatDateTime } from "./modules/time.js";
import {
  renderTreeDetailContent as renderTreeDetailContentShared,
  renderTreeFruitMarkup as renderTreeFruitMarkupShared,
  renderTreeStyleContent as renderTreeStyleContentShared
} from "./modules/treeUi.js";
import { createTreeController } from "./modules/treeController.js";
import { createStoreDataBindings } from "./modules/storeData.js";
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
const driveConflictModal = document.getElementById("driveConflictModal");
const closeDriveConflictButton = document.getElementById("closeDriveConflict");
const closeDriveConflictBackdrop = document.getElementById("closeDriveConflictBackdrop");
const driveConflictTitle = document.getElementById("driveConflictTitle");
const driveConflictSubtitle = document.getElementById("driveConflictSubtitle");
const driveConflictCopy = document.getElementById("driveConflictCopy");
const driveConflictAutoMergeButton = document.getElementById("driveConflictAutoMerge");
const driveConflictKeepLocalButton = document.getElementById("driveConflictKeepLocal");
const driveConflictKeepDriveButton = document.getElementById("driveConflictKeepDrive");
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
const downloadLocalDataButton = document.getElementById("downloadLocalData");
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

const widgetDetailState = {
  widgetId: "",
  cleanup: null
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

const taskComposerRefs = {
  lateGraceMinutesInput,
  skipRuleTypeInput,
  skipGraceMinutesInput,
  taskRemindersEnabledInput,
  taskReminderDueSoonMinutesInput,
  taskReminderOverdueMinutesInput,
  taskReminderDefaultsCopy,
  recurrenceTypeInput: recurrenceType,
  recurrenceForeverInput,
  weeklyDayPicker,
  weeklyIntervalInput: document.getElementById("weeklyInterval"),
  weeklyWeekdayInput: document.getElementById("weeklyWeekday"),
  monthlyDayInput: document.getElementById("monthlyDay"),
  monthlyIntervalInput: document.getElementById("monthlyInterval"),
  monthlyOrdinalInput: document.getElementById("monthlyOrdinal"),
  monthlyWeekdayInput: document.getElementById("monthlyWeekday"),
  recurrenceEndDateInput: document.getElementById("recurrenceEndDate"),
  recurrenceCountInput: document.getElementById("recurrenceCount"),
  dailyInstanceTimes
};

function normalizeImportanceInput(value) {
  return value === "low" || value === "high" ? value : DEFAULT_IMPORTANCE;
}

function normalizeLinkedSeriesInput(linkedSeries) {
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

const {
  appendDailyInstanceTimeRow,
  applyRecurrenceToForm,
  applySkipRuleToForm,
  buildLinkedSeriesSlotConfig,
  buildLinkedSeriesTemplatesFromDraft,
  buildRecurrence,
  buildSkipRule,
  buildTaskDraftFromForm,
  buildTaskFromForm,
  buildTaskFromValues,
  getWeeklyDaySelection,
  handleDailyInstanceTimesClick,
  normalizeRecurrence,
  normalizeSkipRule,
  normalizeTaskReminders,
  parsePositiveNumber,
  parsePositiveOrZeroNumber,
  renderDailyInstanceTimes,
  setTaskReminderFormValues,
  setWeeklyDaySelection,
  syncTaskReminderInputs,
  syncWeeklyWeekdayHiddenValue
} = createTaskComposerBindings({
  createId,
  getMaxTaskPoints,
  resolveCategorySnapshot,
  normalizeImportance: normalizeImportanceInput,
  normalizeTaskPoints,
  normalizeWidgetTaskMeta,
  normalizeWidgetCompletion,
  normalizeLinkedSeries: normalizeLinkedSeriesInput,
  deriveTaskNotBeforeAt,
  defaultImportance: DEFAULT_IMPORTANCE,
  defaultLateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
  defaultLength: "medium",
  lengthOrder: LENGTH_ORDER,
  dependenciesSelect,
  todayString,
  linkedSeriesKindDaily: LINKED_SERIES_KIND_DAILY,
  linkedSeriesKindWeekly: LINKED_SERIES_KIND_WEEKLY,
  refs: taskComposerRefs,
  composerPanelState,
  composerReminderState,
  escapeHtml,
  defaultTaskDueSoonReminderMinutes: DEFAULT_TASK_DUE_SOON_REMINDER_MINUTES
});

const {
  buySelectedTreeSkin,
  closeTreeDetail,
  closeTreeStyle,
  handleTreeStyleAction,
  harvestRipeFruit,
  isTreeDetailOpen,
  isTreeStyleOpen,
  openTreeDetail,
  openTreeStyle,
  removeSelectedTreeSkin,
  renderTreeDetailIfOpen,
  renderTreeStyleIfOpen
} = createTreeController({
  refs: {
    treeStyleModal,
    treeStyleBody,
    treeDetailModal,
    treeDetailBody,
    developerTreeSkin
  },
  getStore: () => store,
  getTreeDisplayState,
  getRecentPointHistory,
  getVisibleCategoryDefinitions,
  normalizeTreeState,
  normalizeDevSettings,
  resolveCategorySnapshot,
  renderTreeDetailContent: renderTreeDetailContentShared,
  renderTreeStyleContent: renderTreeStyleContentShared,
  buildTreeStyleCatalog,
  getTreeBankedPointsByCategory,
  getTreeStylePartLabel,
  getTreeSkin,
  exchangeTreeBankedPoints,
  purchaseTreeSkin,
  equipTreeSkin,
  removeOwnedTreeSkin,
  treePointExchangeRatio: TREE_POINT_EXCHANGE_RATIO,
  defaultCategoryColor: DEFAULT_CATEGORY_COLOR,
  escapeHtml,
  formatPointsLabel,
  formatDateTime,
  persistStore,
  renderAll,
  setSyncStatus,
  isDeveloperUser
});

const {
  buildComparableStore,
  buildComparableValueSignature,
  buildDeletionMarkerMaps,
  canAutoMergeDriveConflict,
  choosePreferredCategoryDefinition,
  choosePreferredTask,
  choosePreferredUserSyncState,
  computeStoreFingerprint,
  computeUserContentFingerprint,
  computeUserContentFingerprintFromNormalized,
  createCategoryDefinition,
  createCategorySnapshotResolver,
  createEmptyStore,
  deletionMarkerSuppressesTask,
  getTaskMergeUpdatedAt,
  hasAmbiguousDriveMergeConflict,
  hasLinkedSeriesGroup,
  latestTaskTimestampForMerge,
  mergeCategoryDefinitions,
  mergeDeletionMarkers,
  mergeRecurringBonusSelections,
  mergeStores,
  normalizeCategoryColor,
  normalizeCategoryDefinitions,
  normalizeDeletionMarkers,
  normalizeImportance,
  normalizeLinkedSeries,
  normalizeRecurringBonusSelections,
  normalizeStatus,
  normalizeStore,
  normalizeTask,
  shouldKeepUnpairedTask,
  slugifyCategoryKey,
  sortObjectKeys,
  buildTaskMergeSignature
} = createStoreDataBindings({
  baseCategories: BASE_CATEGORIES,
  defaultCategoryKey: DEFAULT_CATEGORY_KEY,
  defaultCategoryColor: DEFAULT_CATEGORY_COLOR,
  defaultImportance: DEFAULT_IMPORTANCE,
  defaultLateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
  lengthOrder: LENGTH_ORDER,
  maxTasks: MAX_TASKS,
  maxWidgets: MAX_WIDGETS,
  maxDeletionMarkers: MAX_DELETION_MARKERS,
  deletionMarkerRetentionMs: DELETION_MARKER_RETENTION_MS,
  linkedSeriesKindDaily: LINKED_SERIES_KIND_DAILY,
  linkedSeriesKindWeekly: LINKED_SERIES_KIND_WEEKLY,
  treePointExchangeRatio: TREE_POINT_EXCHANGE_RATIO,
  createId,
  defaultPointsForLength,
  normalizeTaskPoints,
  compactTaskHistory,
  buildLogicalWidgetTaskKey,
  compareTaskResolutionPreference,
  normalizeWidgets,
  listWidgetCategories,
  mergeWidgetLists: (localWidgets, remoteWidgets) => mergeWidgetLists(localWidgets, remoteWidgets, widgetRegistryHelpers(), MAX_WIDGETS),
  mergeRetiredWidgets,
  normalizeProfile,
  choosePreferredProfile,
  normalizeNotifications,
  choosePreferredNotifications,
  normalizeDevSettings,
  normalizeTreeState,
  choosePreferredTreeState,
  normalizePointLedgerBase,
  normalizePointHistoryBase,
  mergePointLedger,
  mergePointHistory,
  normalizeTaskReminders,
  normalizeWidgetTaskMeta,
  normalizeWidgetCompletion,
  normalizeSkipRule,
  normalizeRecurrence,
  deriveTaskNotBeforeAt,
  parsePositiveOrZeroNumber,
  getWidgetUpdatedAt,
  compareWidgetFingerprints
});

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
const remoteDriftState = {
  baseRemoteUserUpdatedAt: 0,
  baseRemoteUserFingerprint: "",
  remoteChangedSinceBase: false,
  checkInFlight: false,
  lastCheckedAt: 0
};
const syncChannelState = {
  channel: null,
  tabId: createId()
};
const driveConflictState = {
  resolver: null
};
let taskHistoryController = null;
let widgetController = null;
let developerController = null;

const canopyController = createCanopyController({
  refs: {
    canopyModal: canopyDetailModal,
    canopyColumns,
    canopyDetailBody,
    canopyDetailTitle,
    canopyDetailSubtitle,
    canopyDetailFooter
  },
  getStore: () => store,
  getVisibleCards: (...args) => taskHistoryController?.getVisibleCards(...args) || [],
  todayString,
  getOpenTaskDeadlineState,
  isBlocked,
  describeCompletionGate,
  formatTaskDisplayName,
  normalizeProfile,
  buildCanopyColumnsData,
  renderCanopyColumns,
  renderCanopyDetailContent,
  formatDate,
  formatPointsLabel,
  escapeHtml,
  renderPriorityIndicator,
  getPendingActionForTask: (...args) => widgetController?.getPendingActionForTask(...args) || null,
  getPendingActionByKey: (...args) => widgetController?.getPendingActionByKey(...args) || null,
  markTaskOpen: (...args) => taskHistoryController?.markTaskOpen(...args),
  markTaskCompleted: (...args) => taskHistoryController?.markTaskCompleted(...args),
  markTaskSkipped: (...args) => taskHistoryController?.markTaskSkipped(...args),
  stagePendingAction: (...args) => widgetController?.stagePendingAction(...args),
  undoPendingAction: (...args) => widgetController?.undoPendingAction(...args),
  isBlockedTask: isBlocked,
  describeBlockedTask,
  clearPendingDelete: (...args) => taskHistoryController?.clearPendingDelete(...args),
  beginEdit,
  openTaskDesk: handleOpenTaskDesk,
  persistStore,
  renderAll,
  reconcileRecurringSeries,
  setSyncStatus,
  resolveCategorySnapshot,
  slugifyCategoryKey,
  recordPointEntry,
  removePointEntryById,
  createId,
  recurringBonusPoints: RECURRING_BONUS_POINTS,
  defaultCategoryKey: DEFAULT_CATEGORY_KEY
});
const {
  closeCanopyDetail,
  handleCanopyAction,
  handleCanopyChange,
  isCanopyDetailOpen,
  openCanopyDetail,
  renderCanopy,
  renderCanopyDetailIfOpen,
  syncRecurringBonusState
} = canopyController;
widgetController = createWidgetController({
  refs: {
    widgetSlots,
    widgetMenu,
    widgetDetailBody,
    widgetDetailTitle,
    widgetDetailSubtitle
  },
  apiBase: API_BASE,
  fetchCredentials: FETCH_CREDENTIALS,
  getStore: () => store,
  getWidgetDefinition,
  listWidgetDefinitions,
  ownerWidgetLabel,
  findNextWidgetCompletionTask,
  toDateString,
  createId,
  applyAutoSkipOwnedTask: shouldAutoSkipTask,
  isBlocked,
  markTaskCompleted: (...args) => taskHistoryController?.markTaskCompleted(...args),
  markTaskOpen: (...args) => taskHistoryController?.markTaskOpen(...args),
  markTaskSkipped: (...args) => taskHistoryController?.markTaskSkipped(...args),
  pushHistory,
  setSyncStatus,
  renderAll,
  persistStore,
  reconcileRecurringSeries,
  ensureWidgetIntegrity,
  ensureWidgetTasks,
  getRetiredWidgetByType,
  removeRetiredWidgetByType,
  rememberRetiredWidget,
  rememberDeletedTask,
  rememberDeletedSeries,
  upsertArchivedSeriesRecord,
  openTaskDesk: handleOpenTaskDesk,
  openWidgetDetail,
  resolveCategorySnapshot,
  regenerateSeries,
  retireWidgetOwnedSeries,
  isDeveloperUser,
  escapeHtml,
  formatDate,
  formatDateTime,
  todayString
});
const {
  applyAutoSkipRules,
  clearPendingAction,
  closeWidgetMenu,
  commitPendingAction,
  completeNextTaskFromWidget,
  completeWidgetTaskById,
  getPendingActionByKey,
  getPendingActionForTask,
  getPendingActionForWidget,
  handleWidgetSlotClick,
  handleWidgetSlotSubmit,
  openWidgetMenu,
  renderWidgetOrbit,
  reopenWidgetTaskById,
  shouldSkipTask,
  skipWidgetTaskById,
  stagePendingAction,
  stageWidgetAction,
  undoPendingAction
} = widgetController;

taskHistoryController = createTaskHistoryController({
  refs: {
    taskGrid,
    emptyState,
    openCount,
    doneCount,
    recurringCount,
    historyList,
    historyEmpty,
    historyWidgetFilter,
    statusFilter,
    lengthFilter,
    sortBy,
    searchQuery,
    historySort,
    historyFilter,
    form,
    taskNameInput,
    taskDetailsInput,
    startDateInput,
    dueDateInput,
    timeOfDayInput,
    lateGraceMinutesInput,
    taskPointsInput,
    taskLengthInput,
    taskCategoryInput,
    taskImportanceInput,
    skipRuleTypeInput,
    skipGraceMinutesInput,
    recurrenceTypeInput: recurrenceType,
    recurrenceForeverInput,
    dependenciesSelect
  },
  getStore: () => store,
  editState,
  composerReminderState,
  defaultCategoryKey: DEFAULT_CATEGORY_KEY,
  defaultCategoryColor: DEFAULT_CATEGORY_COLOR,
  defaultImportance: DEFAULT_IMPORTANCE,
  defaultLateGraceMinutes: DEFAULT_LATE_GRACE_MINUTES,
  completedOneOffDismissMs: COMPLETED_ONE_OFF_DISMISS_MS,
  importanceDefinitions: IMPORTANCE_DEFINITIONS,
  lengthOrder: LENGTH_ORDER,
  buildHistoryFeed,
  getLatestLifecycleEntry,
  formatTaskDisplayName,
  formatDate,
  formatDateTime,
  formatPointsLabel,
  humanizeLength,
  ownerWidgetLabel,
  describeRecurrence,
  cardSummary,
  normalizeImportance,
  getOpenTaskDeadlineState,
  isBlocked,
  describeBlockedTask,
  formatTaskAvailability,
  getTaskDependencyIds,
  getPendingActionForTask,
  stagePendingAction,
  shouldSkipTask,
  compareDateish,
  computeOccurrenceDate,
  deriveRecurringInstanceNotBeforeAt,
  awardPointsForTask,
  revokePointsForTask,
  pushHistory,
  touchTask,
  rememberDeletedTaskKey,
  rememberDeletedTask,
  rememberDeletedSeries,
  reconcileRecurringSeries,
  persistStore,
  renderAll,
  setSyncStatus,
  setActiveTaskDeskPane,
  setTaskPointsInput,
  setTaskReminderFormValues,
  renderDailyInstanceTimes,
  setWeeklyDaySelection,
  syncTaskReminderInputs,
  updateSkipVisibility,
  updateRecurrenceVisibility,
  syncEditPanel,
  deleteTask,
  beginEdit,
  escapeHtml,
  defaultPointsForLength,
  undoPendingAction
});
const {
  applyCompletedTaskHistoryOnly,
  clearAllHistory,
  clearPendingDelete,
  clearSelectedHistorySource,
  getSeriesInstances,
  getVisibleCards,
  handleHistoryListClick,
  handleTaskGridClick,
  markTaskCompleted,
  markTaskOpen,
  markTaskSkipped,
  populateComposerFromHistory,
  pruneHistoryOnlyTasksWithoutHistory,
  renderHistoryPanel,
  renderHistorySourceOptions,
  renderSummary,
  renderTaskGrid,
  repairTaskStatusFromHistory
} = taskHistoryController;

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

let notificationSyncController = null;
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
  updateGoogleButtons: () => notificationSyncController?.updateGoogleButtons(),
  promptDriveConflictChoice,
  canAutoMergeDriveConflict,
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
  peekRemoteStore,
  saveToDrive,
  initializeFromDrive,
  saveToDriveOnExit
} = driveSyncController;

let autosaveController = null;
notificationSyncController = createNotificationSyncController({
  apiBase: API_BASE,
  fetchCredentials: FETCH_CREDENTIALS,
  refs: {
    notificationsModal,
    notificationsSummaryEnabledInput,
    notificationsRecipientEmailInput,
    notificationsSendTimeInput,
    notificationsFrequencyInput,
    notificationsWeekdayInput,
    notificationsWeekdayRow,
    notificationsRemindersEnabledInput,
    notificationsReminderDueSoonEnabledInput,
    notificationsReminderOverdueEnabledInput,
    notificationsReminderDailyAgendaEnabledInput,
    notificationsReminderDailyAgendaTimeInput,
    notificationsReminderQuietHoursEnabledInput,
    notificationsReminderQuietHoursStartInput,
    notificationsReminderQuietHoursEndInput,
    notificationsIncludeOverdueInput,
    notificationsIncludeDueSoonInput,
    notificationsIncludeCompletedInput,
    notificationsIncludeRecurringProgressInput,
    notificationsIncludeTreePointsInput,
    notificationsIncludeWidgetHighlightsInput,
    notificationsPreview,
    notificationsHistory,
    sendNotificationSummaryButton,
    sendNotificationReminderButton,
    syncLocalCard,
    syncDriveCard,
    syncAutosaveCard,
    syncLocalValue,
    syncDriveValue,
    syncAutosaveValue,
    googleSignInButton,
    googleSignOutButton,
    loadDriveButton,
    saveDriveButton,
    clearDriveDataButton,
    clearWidgetDriveDataButton,
    downloadDriveDataButton,
    sendDeveloperDailySummaryButton,
    sendDeveloperDailyAgendaButton
  },
  authState,
  syncState,
  driveSaveState,
  notificationSendState,
  remoteDriftState,
  syncChannelState,
  getStore: () => store,
  persistStore,
  formatDateTime,
  normalizeProfile,
  normalizeNotifications,
  normalizeNotificationTimezone,
  normalizeRecipientEmail,
  normalizeNotificationTime,
  normalizeWeekday,
  normalizeEmailSummaryConfig,
  normalizeEmailReminderConfig,
  appendNotificationHistoryEntry,
  buildEmailSummaryKey: buildEmailSummaryKeyShared,
  buildEmailSummaryPreview: buildEmailSummaryPreviewShared,
  renderEmailSummaryBodyHtml: renderEmailSummaryBodyHtmlShared,
  renderEmailSummaryBodyText: renderEmailSummaryBodyTextShared,
  buildEmailReminderTemplates: buildEmailReminderTemplatesShared,
  renderEmailReminderBodyHtml: renderEmailReminderBodyHtmlShared,
  renderEmailReminderBodyText: renderEmailReminderBodyTextShared,
  renderNotificationsPreview: renderNotificationsPreviewShared,
  renderNotificationHistory: renderNotificationHistoryShared,
  computeStoreFingerprint,
  computeUserContentFingerprint,
  createId,
  escapeHtml,
  setSyncStatus,
  renderDeveloperPanel: () => developerController?.renderDeveloperPanel(),
  isDeveloperUser,
  isSettingsOpen,
  closeSettings,
  refreshAuthStatus,
  disconnectGoogle,
  loadFromDrive,
  saveToDrive,
  peekRemoteStore,
  autosave: {
    getStatus: () => autosaveController?.getStatus() || {
      blockedReason: "",
      inFlight: false,
      nextRunAt: 0
    },
    markCurrentAsSaved: () => autosaveController?.markCurrentAsSaved(),
    clearSavedBaseline: () => autosaveController?.clearSavedBaseline(),
    refreshSchedule: () => autosaveController?.refreshSchedule()
  }
});
const {
  broadcastSyncEvent,
  checkForRemoteDrift,
  clearRemoteStoreState,
  closeNotifications,
  copyNotificationDiagnostics,
  getAutosavePermission,
  getCurrentStoreFingerprint,
  getCurrentUserFingerprint,
  handleGoogleDisconnect,
  handleManualLoadFromDrive,
  handleManualSaveToDrive,
  handleNotificationsFormChange,
  handleNotificationsSubmit,
  handleSendNotificationReminder,
  handleSendNotificationSummary,
  hasUnresolvedRemoteConflict,
  initializeSyncChannel,
  isNotificationsOpen,
  observeRemoteStoreState,
  openNotifications,
  renderNotificationsIfOpen,
  renderSyncMeta,
  saveCurrentStoreToDrive,
  sendDeveloperDailyAgenda,
  sendDeveloperDailySummary,
  sendDeveloperNotificationTest,
  setRemoteComparisonBase,
  announceRemoteStoreState,
  updateGoogleButtons
} = notificationSyncController;

autosaveController = createAutosaveController({
  getProfile: () => normalizeProfile(store.profile),
  getStore: () => store,
  isAuthenticated: () => authState.authenticated,
  computeStoreFingerprint,
  canAutosave: () => getAutosavePermission(),
  saveToDrive: (options) => saveCurrentStoreToDrive({ ...options, mode: "autosave" })
});

developerController = createDeveloperController({
  refs: {
    openDeveloperButton,
    developerModal,
    developerPanel,
    developerEmail,
    developerWidgetType,
    developerMaxTaskPoints,
    developerMaxPointHistoryEntries,
    developerInjectCategory,
    developerInjectPoints,
    developerInjectSource,
    developerFruitCategory,
    developerFruitDelta,
    developerBankedCategory,
    developerBankedDelta,
    developerTreeSkin,
    grantTreeSkinButton,
    removeTreeSkinButton,
    copyNotificationDiagnosticsButton,
    downloadLocalDataButton,
    importDriveDataButton,
    sendDeveloperNotificationTestButton,
    sendDeveloperDailySummaryButton,
    sendDeveloperDailyAgendaButton,
    developerFruitSummary,
    developerPointsSummary,
    taskPointsInput
  },
  authState,
  notificationSendState,
  getStore: () => store,
  isDeveloperUser,
  listWidgetDefinitions,
  getSelectableCategories,
  defaultCategoryKey: DEFAULT_CATEGORY_KEY,
  listPurchasableTreeSkins,
  getTreeStylePartLabel,
  normalizeTreeStyleState,
  normalizeDevSettings,
  normalizePointHistory,
  normalizeTreeState,
  normalizeTaskPoints,
  parsePositiveNumber,
  defaultMaxTaskPoints: DEFAULT_MAX_TASK_POINTS,
  defaultMaxPointHistoryEntries: DEFAULT_MAX_POINT_HISTORY_ENTRIES,
  formatPointsLabel,
  renderDeveloperFruitSummary,
  renderDeveloperPointsSummary,
  getTreeDisplayState,
  getPointLedgerSummary,
  resolveCategorySnapshot,
  slugifyCategoryKey,
  escapeHtml,
  recordPointEntry,
  createId,
  persistStore,
  renderAll,
  renderTreeDetailIfOpen,
  setSyncStatus,
  syncTaskPointsDefault
});
const {
  adjustDeveloperBankedPoints,
  adjustDeveloperFruitGrowth,
  closeDeveloper,
  injectDeveloperPoints,
  isDeveloperOpen,
  openDeveloper,
  renderDeveloperPanel,
  resetDeveloperFruitGrowth,
  updateMaxPointHistoryEntriesSetting,
  updateMaxTaskPointsSetting
} = developerController;

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
closeDriveConflictButton.addEventListener("click", () => resolveDriveConflictChoice(null));
closeDriveConflictBackdrop.addEventListener("click", () => resolveDriveConflictChoice(null));
driveConflictAutoMergeButton.addEventListener("click", () => resolveDriveConflictChoice("auto-merge"));
driveConflictKeepLocalButton.addEventListener("click", () => resolveDriveConflictChoice("keep-local"));
driveConflictKeepDriveButton.addEventListener("click", () => resolveDriveConflictChoice("keep-drive"));
closeTaskDeskButton.addEventListener("click", closeTaskDesk);
closeTaskDeskBackdrop.addEventListener("click", closeTaskDesk);
taskDeskTabs.addEventListener("click", handleTaskDeskTabClick);
closeWidgetMenuButton.addEventListener("click", closeWidgetMenu);
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
taskGrid.addEventListener("click", handleTaskGridClick);
historyList.addEventListener("click", handleHistoryListClick);
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
downloadLocalDataButton.addEventListener("click", downloadLocalBackup);
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
window.addEventListener("focus", () => {
  void checkForRemoteDrift({ reason: "focus" });
});
window.addEventListener("online", () => {
  void checkForRemoteDrift({ reason: "online", force: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void checkForRemoteDrift({ reason: "visible" });
  }
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
  initializeSyncChannel();
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
    observeRemoteStoreState({
      updatedAt: startupResult.remoteUpdatedAt,
      fingerprint: startupResult.remoteFingerprint,
      savedAt: startupResult.remoteSavedAt,
      userUpdatedAt: startupResult.remoteUserUpdatedAt,
      userFingerprint: startupResult.remoteUserFingerprint
    });
    setRemoteComparisonBase({
      userUpdatedAt: startupResult.remoteUserUpdatedAt,
      userFingerprint: startupResult.remoteUserFingerprint
    });
    announceRemoteStoreState();
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

  if (isDriveConflictOpen()) {
    resolveDriveConflictChoice(null);
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

function openQuickAdd() {
  closeCanopyDetail();
  resetQuickAddForm();
  quickAddModal.classList.remove("hidden");
  quickAddModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("quick-add-open");
  window.setTimeout(() => quickTaskNameInput.focus(), 0);
}

function buildDriveConflictCopy({ operation, localUserUpdatedAt, remoteUserUpdatedAt }) {
  const localLabel = localUserUpdatedAt ? formatDateTime(localUserUpdatedAt) : "No local edits recorded";
  const remoteLabel = remoteUserUpdatedAt ? formatDateTime(remoteUserUpdatedAt) : "No Drive edits recorded";
  const newerSide = localUserUpdatedAt > remoteUserUpdatedAt
    ? "This browser has the newer version."
    : remoteUserUpdatedAt > localUserUpdatedAt
      ? "Google Drive has the newer version."
      : "Both copies were updated at about the same time.";
  const operationNote = operation === "save"
    ? "Choose only if you do not want the recommended merge."
    : "Auto Merge is recommended unless you want one side to fully replace the other.";
  return `${newerSide} Local: ${localLabel}. Drive: ${remoteLabel}. ${operationNote}`;
}

function openDriveConflictPrompt({ operation = "load", localUserUpdatedAt = 0, remoteUserUpdatedAt = 0 } = {}) {
  driveConflictTitle.textContent = operation === "save"
    ? "Resolve Drive conflict before saving"
    : "Resolve Drive conflict before loading";
  driveConflictSubtitle.textContent = operation === "save"
    ? "Auto Merge is available, but this save needs a choice first."
    : "Choose how this tab should use the Drive copy.";
  driveConflictCopy.textContent = buildDriveConflictCopy({ operation, localUserUpdatedAt, remoteUserUpdatedAt });
  driveConflictAutoMergeButton.querySelector("span").textContent = operation === "save"
    ? "Recommended. Save a merged copy that keeps the newer conflicting items."
    : "Recommended. Combine both copies and keep the newer conflicting items.";
  driveConflictKeepLocalButton.querySelector("span").textContent = operation === "save"
    ? "Overwrite Drive with exactly what is in this browser."
    : "Keep this browser version and do not load Drive.";
  driveConflictKeepDriveButton.querySelector("span").textContent = operation === "save"
    ? "Discard this browser version and restore the current Drive copy."
    : "Replace this browser with the current Drive version.";
  driveConflictModal.classList.remove("hidden");
  driveConflictModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("drive-conflict-open");
  window.setTimeout(() => driveConflictAutoMergeButton.focus(), 0);
}

function closeDriveConflictPrompt() {
  driveConflictModal.classList.add("hidden");
  driveConflictModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drive-conflict-open");
}

function isDriveConflictOpen() {
  return !driveConflictModal.classList.contains("hidden");
}

function resolveDriveConflictChoice(choice) {
  const resolver = driveConflictState.resolver;
  driveConflictState.resolver = null;
  closeDriveConflictPrompt();
  if (resolver) {
    resolver(choice);
  }
}

function promptDriveConflictChoice(context) {
  if (driveConflictState.resolver) {
    resolveDriveConflictChoice(null);
  }
  openDriveConflictPrompt(context);
  return new Promise((resolve) => {
    driveConflictState.resolver = resolve;
  });
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
  try {
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
        reopenWidgetTaskById,
        skipWidgetTaskById,
        undoPendingAction,
        retireWidgetOwnedSeries
      }
    }) || null;
  } catch (error) {
    console.error(`Widget detail render failed for ${widget.type}:`, error);
    widgetDetailBody.innerHTML = `
      <article class="widget-detail-error">
        <h3>${escapeHtml(definition.title || "Widget")}</h3>
        <p>This widget detail failed to render from the current saved data.</p>
        <p class="sync-status">Open DevTools for the exact error, then save or repair the widget data before trying again.</p>
      </article>
    `;
    widgetDetailState.cleanup = null;
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
  touchTask(nextTask);
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
    slugifyCategoryKey,
    listPurchasableTreeSkins
  });
}

function choosePreferredTreeState(localTreeState, remoteTreeState) {
  return choosePreferredTreeStateBase(localTreeState, remoteTreeState, {
    normalizeTreeStyleState,
    slugifyCategoryKey,
    listPurchasableTreeSkins
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
  if (appearance.canopyDecoration) {
    treeHarvestButton.dataset.canopyDecoration = appearance.canopyDecoration;
  } else {
    delete treeHarvestButton.dataset.canopyDecoration;
  }
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
      ${renderTreeFruitMarkupShared(
        {
          color: fruit.color,
          stage: fruit.stage,
          size: fruit.size,
          ripe: fruit.ripe,
          title: `${fruit.categoryLabel}: ${fruit.points}/25 growth points`
        },
        { escapeHtml }
      )}
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

function renderPriorityIndicator(importance, variant = "task") {
  return renderPriorityIndicatorShared(importance, variant, {
    defaultImportance: DEFAULT_IMPORTANCE,
    normalizeImportance,
    importanceDefinitions: IMPORTANCE_DEFINITIONS,
    escapeHtml
  });
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

function pushHistory(task, type, at = Date.now(), metadata = null) {
  if (!Array.isArray(task.history)) {
    task.history = [];
  }
  const normalizedMetadata = normalizeTaskHistoryMetadata(metadata);
  const latest = task.history[task.history.length - 1] || null;
  if (latest?.type === type) {
    task.history[task.history.length - 1] = {
      ...latest,
      ...normalizedMetadata,
      at
    };
    return;
  }
  task.history.push({ id: createId(), type, at, ...normalizedMetadata });
}

function normalizeTaskHistoryMetadata(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return {
    reason: typeof value.reason === "string" ? value.reason : ""
  };
}

function touchTask(task, at = Date.now()) {
  if (!task) {
    return;
  }
  task.updatedAt = Math.max(at, task.updatedAt || 0, task.createdAt || 0);
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
    broadcastSyncEvent("local-edit", {
      userUpdatedAt: store.userUpdatedAt || 0,
      userFingerprint: store.userFingerprint || ""
    });
  }
  if (hasUnresolvedRemoteConflict()) {
    setSyncStatus(
      "Google Drive changed in another session while this tab also has local edits. Use Load from Drive or Save to Drive to resolve it before autosave runs again.",
      "error"
    );
  }
  persistLocalStore(store);
}

function persistLocalStore(nextStore) {
  window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(nextStore));
}

function trimTasks() {
  if (store.tasks.length > MAX_TASKS) {
    store.tasks = store.tasks.slice(0, MAX_TASKS);
  }
}

function clearLegacyCookie() {
  document.cookie = `${LEGACY_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
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

function setSyncStatus(message, tone) {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
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
    applyAutoSkipRules,
    completeWidgetTaskById,
    reopenWidgetTaskById,
    skipWidgetTaskById,
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

function resolveGeneratedLinkedSeries(existingLinkedSeries, templateLinkedSeries) {
  const normalizedExisting = normalizeLinkedSeries(existingLinkedSeries);
  if (normalizedExisting.groupId) {
    return normalizedExisting;
  }
  return normalizeLinkedSeries(templateLinkedSeries);
}

function resolveGeneratedSkipRule(existingSkipRule, templateSkipRule) {
  const normalizedTemplate = normalizeSkipRule(templateSkipRule);
  if (normalizedTemplate?.type === "widget-lockout") {
    return normalizedTemplate;
  }
  const normalizedExisting = normalizeSkipRule(existingSkipRule);
  if (normalizedExisting?.type === "recurring-window") {
    return normalizedTemplate;
  }
  return normalizeSkipRule(existingSkipRule || templateSkipRule);
}

function endOfWeekDateString(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + (6 - date.getDay()));
  return toDateString(date);
}

function endOfMonthDateString(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setMonth(date.getMonth() + 1, 0);
  return toDateString(date);
}

function buildRecurringWindowSkipRule(task, template, nextTask = null) {
  const groupKey = getCanopyRecurringGroupKey(template || task);
  if (groupKey !== "weekly" && groupKey !== "monthly") {
    return normalizeSkipRule(template?.skipRule || task?.skipRule);
  }

  const scheduledDate = task.dueDate || task.startDate || "";
  if (!scheduledDate) {
    return normalizeSkipRule(template?.skipRule || task?.skipRule);
  }

  const periodEndDate = groupKey === "weekly"
    ? endOfWeekDateString(scheduledDate)
    : endOfMonthDateString(scheduledDate);
  const nextDate = nextTask?.dueDate || nextTask?.startDate || "";
  const nextTime = nextTask?.timeOfDay || "00:00";
  const useNextInstanceCutoff = nextDate && (
    nextDate < periodEndDate
    || (nextDate === periodEndDate && nextTime < "23:59")
  );

  if (useNextInstanceCutoff) {
    return {
      type: "recurring-window",
      period: groupKey,
      cutoffDate: nextDate,
      cutoffTime: nextTime,
      cutoffReason: "next-instance"
    };
  }

  return {
    type: "recurring-window",
    period: groupKey,
    cutoffDate: periodEndDate,
    cutoffTime: "",
    cutoffReason: "period-end"
  };
}

function findNextRecurringSeriesTask(task, tasks) {
  const seriesTasks = task.linkedSeries?.groupId
    ? tasks.filter((candidate) => (
      !candidate.archived
      && candidate.id !== task.id
      && candidate.linkedSeries?.groupId === task.linkedSeries.groupId
    ))
    : tasks.filter((candidate) => (
      !candidate.archived
      && candidate.id !== task.id
      && candidate.templateId
      && candidate.templateId === task.templateId
    ));

  return seriesTasks
    .filter((candidate) => compareTaskSchedule(candidate, task) > 0)
    .sort(compareTaskSchedule)[0] || null;
}

function syncRecurringWindowSkipRules() {
  const tasksById = new Map(store.tasks.map((task) => [task.id, task]));

  for (const task of store.tasks) {
    if (task.archived || !task.templateId) {
      continue;
    }

    const template = tasksById.get(task.templateId);
    const templateSkipRule = normalizeSkipRule(template?.skipRule);
    if (templateSkipRule?.type === "widget-lockout") {
      task.skipRule = templateSkipRule;
      continue;
    }

    const nextTask = findNextRecurringSeriesTask(task, store.tasks);
    task.skipRule = buildRecurringWindowSkipRule(task, template, nextTask);
  }
}

function buildGeneratedInstance(template, occurrenceIndex, startDate, dueDate, existingTask = null) {
  const existingWidgetTaskMeta = normalizeWidgetTaskMeta(existingTask?.widgetTaskMeta);
  const templateWidgetTaskMeta = normalizeWidgetTaskMeta(template.widgetTaskMeta);
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
    updatedAt: existingTask?.updatedAt || template.updatedAt || template.createdAt || Date.now(),
    ownerWidgetId: existingTask?.ownerWidgetId || template.ownerWidgetId || "",
    ownerWidgetType: existingTask?.ownerWidgetType || template.ownerWidgetType || "",
    ownerTaskKey: existingTask?.ownerTaskKey || template.ownerTaskKey || "",
    widgetTaskKind: existingTask?.widgetTaskKind || template.widgetTaskKind || "",
    widgetTaskMeta: normalizeWidgetTaskMeta({
      ...existingWidgetTaskMeta,
      ...templateWidgetTaskMeta
    }),
    linkedSeries: resolveGeneratedLinkedSeries(existingTask?.linkedSeries, template.linkedSeries),
    sequenceDependencyId: existingTask?.sequenceDependencyId || "",
    widgetCompletion: normalizeWidgetCompletion(existingTask?.widgetCompletion || template.widgetCompletion),
    skipRule: resolveGeneratedSkipRule(existingTask?.skipRule, template.skipRule),
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
  syncRecurringWindowSkipRules();
  trimTasks();
}

function isDeveloperUser() {
  return authState.authenticated && authState.user?.email === DEV_EMAIL;
}

function syncLinkedSeriesGroups() {
  repairOrphanedLinkedSeriesGroups();
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

function repairOrphanedLinkedSeriesGroups() {
  const templateGroups = new Map();

  for (const task of store.tasks) {
    if (!isOrphanedLinkedSeriesTemplate(task)) {
      continue;
    }
    const repairKey = buildOrphanedLinkedSeriesTemplateKey(task);
    if (!repairKey) {
      continue;
    }
    const group = templateGroups.get(repairKey) || [];
    group.push(task);
    templateGroups.set(repairKey, group);
  }

  for (const templates of templateGroups.values()) {
    if (templates.length <= 1 || !shouldRepairLinkedSeriesTemplateGroup(templates)) {
      continue;
    }
    applyLinkedSeriesRepairToTemplateGroup(templates);
  }
}

function isOrphanedLinkedSeriesTemplate(task) {
  if (!task || task.archived || task.templateId) {
    return false;
  }
  if (hasLinkedSeriesGroup(task)) {
    return false;
  }
  const recurrenceType = getLinkedSeriesRepairRecurrenceType(task);
  return recurrenceType === "daily" || recurrenceType === "weekly";
}

function getLinkedSeriesRepairRecurrenceType(task) {
  if (task?.recurrence?.type === "generated") {
    return task?.recurrence?.sourceType || "";
  }
  return task?.recurrence?.type || "";
}

function buildOrphanedLinkedSeriesTemplateKey(task) {
  const recurrenceType = getLinkedSeriesRepairRecurrenceType(task);
  if (recurrenceType !== "daily" && recurrenceType !== "weekly") {
    return "";
  }
  const recurrence = normalizeRecurrence(task.recurrence);
  const widgetPlanKey = task.widgetTaskMeta?.planId
    ? `${task.ownerWidgetId || ""}:${task.widgetTaskKind || ""}:${task.widgetTaskMeta.planId}`
    : "";
  return JSON.stringify({
    recurrenceType,
    interval: recurrence.interval || 1,
    endDate: recurrence.endDate || "",
    count: recurrence.count || 0,
    forever: recurrence.forever === true,
    ownerWidgetId: task.ownerWidgetId || "",
    ownerWidgetType: task.ownerWidgetType || "",
    ownerTaskKey: widgetPlanKey || "",
    widgetTaskKind: task.widgetTaskKind || "",
    name: task.name || "",
    details: task.details || "",
    categoryKey: task.categoryKey || "",
    pointsValue: task.pointsValue || 0,
    length: task.length || "",
    importance: task.importance || "",
    timeOfDay: recurrenceType === "weekly" ? (task.timeOfDay || "") : "",
    skipRule: normalizeSkipRule(task.skipRule),
    widgetCompletion: normalizeWidgetCompletion(task.widgetCompletion)
  });
}

function shouldRepairLinkedSeriesTemplateGroup(tasks) {
  const createdAtValues = tasks
    .map((task) => Number(task.createdAt || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (createdAtValues.length <= 1) {
    return true;
  }
  return (createdAtValues[createdAtValues.length - 1] - createdAtValues[0]) <= (5 * 60 * 1000);
}

function applyLinkedSeriesRepairToTemplateGroup(tasks) {
  const recurrenceType = getLinkedSeriesRepairRecurrenceType(tasks[0]);
  const kind = recurrenceType === "weekly" ? LINKED_SERIES_KIND_WEEKLY : LINKED_SERIES_KIND_DAILY;
  const orderedTemplates = [...tasks].sort((left, right) => {
    if (kind === LINKED_SERIES_KIND_WEEKLY) {
      const leftWeekday = Number(left.recurrence?.weekday ?? 0);
      const rightWeekday = Number(right.recurrence?.weekday ?? 0);
      if (leftWeekday !== rightWeekday) {
        return leftWeekday - rightWeekday;
      }
    }
    const leftTime = left.timeOfDay || "99:99";
    const rightTime = right.timeOfDay || "99:99";
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }
    return (left.createdAt || 0) - (right.createdAt || 0);
  });
  const anchor = orderedTemplates[0];
  const groupId = `repair:${anchor.seriesOriginId || anchor.id}`;
  const slotCount = orderedTemplates.length;

  for (const [slotIndex, template] of orderedTemplates.entries()) {
    template.linkedSeries = {
      groupId,
      kind,
      slotIndex,
      slotCount
    };
    repairGeneratedLinkedSeriesFromTemplate(template);
  }
}

function repairGeneratedLinkedSeriesFromTemplate(template) {
  const linkedSeries = normalizeLinkedSeries(template.linkedSeries);
  if (!linkedSeries.groupId) {
    return;
  }
  for (const task of store.tasks) {
    if (task.templateId !== template.id) {
      continue;
    }
    if (hasLinkedSeriesGroup(task)) {
      continue;
    }
    task.linkedSeries = { ...linkedSeries };
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

  const slotCount = groupedTasks.reduce((max, task) => Math.max(max, task.linkedSeries?.slotCount || 1), 1);
  let previous = null;
  for (const task of groupedTasks) {
    task.linkedSeries = {
      ...task.linkedSeries,
      slotCount
    };
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

function downloadLocalBackup() {
  if (!isDeveloperUser()) {
    return;
  }

  try {
    const normalized = normalizeStore(store);
    const backup = {
      kind: "lifetree-local-backup",
      exportedAt: Date.now(),
      exportedFrom: window.location.origin,
      payload: normalized
    };
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const timestamp = toDateString(new Date()).replace(/-/g, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifetree-local-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSyncStatus("Downloaded the current local Lifetree backup from this browser.", "success");
  } catch (error) {
    setSyncStatus(`Local backup download failed: ${error.message}`, "error");
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

  if (!window.confirm("Replace the local Lifetree data on this browser with the selected JSON backup or raw Drive export? Google Drive will not change until you save manually.")) {
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
