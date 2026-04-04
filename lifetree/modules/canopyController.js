import { getCanopyRecurringGroupKey } from "./canopy.js";

export function createCanopyController(config = {}) {
  const {
    refs = {},
    getStore,
    getVisibleCards,
    todayString = () => "",
    getOpenTaskDeadlineState = () => "",
    isBlocked = () => false,
    describeCompletionGate = () => "",
    formatTaskDisplayName = (task) => String(task?.name || ""),
    normalizeProfile = (value) => value || {},
    buildCanopyColumnsData = () => [],
    renderCanopyColumns = () => {},
    renderCanopyDetailContent = () => ({ title: "", subtitle: "", footerNote: "" }),
    formatDate = (value) => String(value ?? ""),
    formatPointsLabel = (value) => String(value ?? ""),
    escapeHtml = (value) => String(value ?? ""),
    renderPriorityIndicator = () => "",
    getPendingActionForTask = () => null,
    getPendingActionByKey = () => null,
    markTaskOpen = () => {},
    markTaskCompleted = () => {},
    markTaskSkipped = () => {},
    stagePendingAction = () => {},
    undoPendingAction = () => {},
    isBlockedTask = () => false,
    describeBlockedTask = () => "",
    clearPendingDelete = () => {},
    beginEdit = () => {},
    openTaskDesk = () => {},
    persistStore = () => {},
    renderAll = () => {},
    reconcileRecurringSeries = () => {},
    setSyncStatus = () => {},
    resolveCategorySnapshot = () => ({ key: "", label: "", color: "" }),
    slugifyCategoryKey = (value) => String(value ?? ""),
    recordPointEntry = () => {},
    removePointEntryById = () => false,
    createId = () => String(Date.now()),
    recurringBonusPoints = {},
    defaultCategoryKey = "productivity"
  } = config;

  const {
    canopyModal = null,
    canopyColumns = null,
    canopyDetailBody = null,
    canopyDetailTitle = null,
    canopyDetailSubtitle = null,
    canopyDetailFooter = null
  } = refs;

  const canopyState = {
    columns: [],
    detail: {
      kind: "",
      columnKey: "",
      groupKey: ""
    }
  };

  function openCanopyDetail(kind, columnKey, groupKey = "") {
    canopyState.detail.kind = kind;
    canopyState.detail.columnKey = columnKey;
    canopyState.detail.groupKey = groupKey;
    canopyModal?.classList.remove("hidden");
    canopyModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("canopy-detail-open");
    renderCanopyDetailIfOpen();
  }

  function closeCanopyDetail() {
    canopyState.detail.kind = "";
    canopyState.detail.columnKey = "";
    canopyState.detail.groupKey = "";
    canopyModal?.classList.add("hidden");
    canopyModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("canopy-detail-open");
  }

  function isCanopyDetailOpen() {
    return !canopyModal?.classList.contains("hidden");
  }

  function handleCanopyAction(event) {
    const store = getStore();
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
      if (isBlockedTask(task)) {
        setSyncStatus(describeBlockedTask(task), "error");
        return;
      }
      stagePendingAction({
        key: `complete:${task.id}`,
        taskId: task.id,
        description: `Pending completion for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
          if (!nextTask || nextTask.archived || nextTask.status !== "open" || isBlockedTask(nextTask)) {
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
        description: `Pending skip for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
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
      if (isBlockedTask(task)) {
        setSyncStatus("That task is blocked by unfinished prerequisites.", "error");
        return;
      }
      stagePendingAction({
        key: `complete:${task.id}`,
        taskId: task.id,
        description: `Pending completion for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
          if (!nextTask || nextTask.archived || nextTask.status !== "open" || isBlockedTask(nextTask)) {
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
      openTaskDesk("composer");
      setSyncStatus(`Editing ${task.name} in Task Desk.`, "info");
      return;
    }

    if (action === "skip") {
      stagePendingAction({
        key: `skip:${task.id}`,
        taskId: task.id,
        description: `Pending skip for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
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
      description: `Pending ${group.label.toLowerCase()} bonus collection in ${category.label}. Click undo within 3 seconds to cancel.`,
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

  function renderCanopy() {
    const store = getStore();
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
    const recurringEntries = buildRecurringCanopyEntries(store);

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
    if (!card || card.task.archived || card.status !== "open") {
      return false;
    }
    if (card.task.recurrence.type === "none") {
      return true;
    }
    if (card.task.ownerWidgetType) {
      return false;
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

  function buildRecurringCanopyEntries(store) {
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
    const store = getStore();
    const points = recurringBonusPoints[group?.key] || 0;
    if (!group || !points || !Array.isArray(group.tasks) || group.tasks.length === 0) {
      return null;
    }

    const periodKey = buildRecurringBonusPeriodKey(group.key, today);
    const key = `${group.key}:${periodKey}`;
    const allowedCategories = collectRecurringBonusCategories(group.tasks);
    const selectedCategoryKey = getRecurringBonusSelection(key, store) || allowedCategories[0]?.key || "";
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
      const category = resolveCategorySnapshot(entry.task.categoryKey || defaultCategoryKey, entry.task);
      if (!categories.has(category.key)) {
        categories.set(category.key, category);
      }
    }
    return Array.from(categories.values()).sort((left, right) => left.label.localeCompare(right.label));
  }

  function getRecurringBonusSelection(key, store = getStore()) {
    return store.recurringBonusSelections.find((entry) => entry.key === key)?.selectedCategoryKey || "";
  }

  function setRecurringBonusSelection(key, categoryKey) {
    const store = getStore();
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
    const store = getStore();
    const nextSelections = store.recurringBonusSelections.filter((entry) => activeKeys.has(entry.key));
    if (nextSelections.length === store.recurringBonusSelections.length) {
      return false;
    }
    store.recurringBonusSelections = nextSelections;
    return true;
  }

  function syncRecurringBonusState(today = todayString()) {
    const store = getStore();
    const recurringEntries = buildRecurringCanopyEntries(store);
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
        if (
          bonus.claimedEntryId
          && (!bonus.completedAll || !bonus.allowedCategories.some((category) => category.key === (store.pointLedger.find((entry) => entry.id === bonus.claimedEntryId)?.categoryKey || "")))
        ) {
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
    return valueFromDate(date);
  }

  function addDaysToDateString(value, days) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    date.setDate(date.getDate() + days);
    return valueFromDate(date);
  }

  function valueFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
      showHelpText: normalizeProfile(getStore().profile).helpTextEnabled,
      getPendingActionForTask,
      renderPriorityIndicator
    });
    if (canopyDetailTitle) {
      canopyDetailTitle.textContent = detail.title;
    }
    if (canopyDetailSubtitle) {
      canopyDetailSubtitle.textContent = detail.subtitle;
    }
    if (canopyDetailFooter) {
      canopyDetailFooter.textContent = detail.footerNote;
      canopyDetailFooter.classList.toggle("hidden", !detail.footerNote);
    }
  }

  return {
    closeCanopyDetail,
    handleCanopyAction,
    handleCanopyChange,
    isCanopyDetailOpen,
    openCanopyDetail,
    renderCanopy,
    renderCanopyDetailIfOpen,
    syncRecurringBonusState
  };
}
