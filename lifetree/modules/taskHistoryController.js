import {
  renderHistoryPanel as renderHistoryPanelShared,
  renderHistorySourceOptions as renderHistorySourceOptionsShared,
  renderTaskActions as renderTaskActionsShared,
  renderTaskDependencies as renderTaskDependenciesShared,
  renderTaskGrid as renderTaskGridShared,
  renderTaskHistorySummary as renderTaskHistorySummaryShared
} from "./taskHistoryUi.js";

export function createTaskHistoryController(config = {}) {
  const {
    refs = {},
    getStore,
    editState,
    composerReminderState,
    defaultCategoryKey = "productivity",
    defaultCategoryColor = "#7dbf74",
    defaultImportance = "medium",
    defaultLateGraceMinutes = 15,
    completedOneOffDismissMs = 5000,
    importanceDefinitions = {},
    lengthOrder = {},
    buildHistoryFeed = () => [],
    getLatestLifecycleEntry = () => null,
    formatTaskDisplayName = (task) => String(task?.name || ""),
    formatDate = (value) => String(value ?? ""),
    formatDateTime = (value) => String(value ?? ""),
    formatPointsLabel = (value) => String(value ?? ""),
    humanizeLength = (value) => String(value ?? ""),
    ownerWidgetLabel = () => "",
    describeRecurrence = () => "",
    cardSummary = () => "",
    normalizeImportance = (value) => value || defaultImportance,
    getOpenTaskDeadlineState = () => "",
    isBlocked = () => false,
    describeBlockedTask = () => "",
    formatTaskAvailability = () => "",
    getTaskDependencyIds = () => [],
    getPendingActionForTask = () => null,
    stagePendingAction = () => {},
    shouldSkipTask = () => false,
    compareDateish = (left, right) => String(left || "").localeCompare(String(right || "")),
    computeOccurrenceDate = (value) => value,
    deriveRecurringInstanceNotBeforeAt = () => 0,
    awardPointsForTask = () => {},
    revokePointsForTask = () => {},
    pushHistory = () => {},
    touchTask = () => {},
    rememberDeletedTaskKey = () => {},
    rememberDeletedTask = () => {},
    rememberDeletedSeries = () => {},
    reconcileRecurringSeries = () => {},
    persistStore = () => {},
    renderAll = () => {},
    setSyncStatus = () => {},
    setActiveTaskDeskPane = () => {},
    setTaskPointsInput = () => {},
    setTaskReminderFormValues = () => {},
    renderDailyInstanceTimes = () => {},
    setWeeklyDaySelection = () => {},
    syncTaskReminderInputs = () => {},
    updateSkipVisibility = () => {},
    updateRecurrenceVisibility = () => {},
    syncEditPanel = () => {},
    deleteTask = () => {},
    beginEdit = () => {},
    escapeHtml = (value) => String(value ?? ""),
    defaultPointsForLength = () => 0
  } = config;

  const {
    taskGrid = null,
    emptyState = null,
    openCount = null,
    doneCount = null,
    recurringCount = null,
    historyList = null,
    historyEmpty = null,
    historyWidgetFilter = null,
    statusFilter = null,
    lengthFilter = null,
    sortBy = null,
    searchQuery = null,
    historySort = null,
    historyFilter = null,
    form = null,
    taskNameInput = null,
    taskDetailsInput = null,
    startDateInput = null,
    dueDateInput = null,
    timeOfDayInput = null,
    lateGraceMinutesInput = null,
    taskPointsInput = null,
    taskLengthInput = null,
    taskCategoryInput = null,
    taskImportanceInput = null,
    skipRuleTypeInput = null,
    skipGraceMinutesInput = null,
    recurrenceTypeInput = null,
    recurrenceForeverInput = null,
    dependenciesSelect = null
  } = refs;

  const pendingDeleteState = {
    taskId: "",
    scope: "single"
  };

  function renderSummary() {
    const visible = getVisibleCards().filter((card) => !card.task.archived);
    if (openCount) {
      openCount.textContent = String(visible.filter((card) => card.status === "open").length);
    }
    if (doneCount) {
      doneCount.textContent = String(visible.filter((card) => card.status === "done").length);
    }
    if (recurringCount) {
      recurringCount.textContent = String(visible.filter((card) => card.kind === "series").length);
    }
  }

  function renderTaskGrid() {
    if (!taskGrid || !emptyState) {
      return;
    }
    const store = getStore();
    const cards = sortCards(filterCards(getVisibleCards()));
    const tasksById = new Map(store.tasks.map((task) => [task.id, task]));
    renderTaskGridShared(taskGrid, cards, {
      emptyState,
      escapeHtml,
      defaultCategoryColor,
      defaultImportance,
      formatDate,
      formatPointsLabel,
      humanizeLength,
      ownerWidgetLabel,
      describeRecurrence,
      cardSummary,
      normalizeImportance,
      importanceDefinitions,
      getOpenTaskDeadlineState,
      isBlocked,
      renderTaskDependencies: (task) => renderTaskDependenciesShared(task, {
        tasksById,
        formatTaskAvailability,
        getTaskDependencyIds,
        formatTaskDisplayName,
        escapeHtml
      }),
      renderTaskHistorySummary: (task) => renderTaskHistorySummaryShared(task, { formatDate }),
      renderTaskActions: (cardData) => renderTaskActionsShared(cardData, {
        escapeHtml,
        getPendingActionForTask,
        isWidgetProtectedTask,
        isDeletePending
      })
    });
  }

  function renderHistoryPanel() {
    if (!historyList || !historyEmpty) {
      return;
    }
    const store = getStore();
    const feed = getVisibleHistoryFeed();
    const tasksById = new Map(store.tasks.map((task) => [task.id, task]));
    renderHistoryPanelShared(historyList, feed, {
      historyEmpty,
      tasksById,
      canRestoreHistoryTask,
      escapeHtml,
      formatDateTime,
      ownerWidgetLabel
    });
  }

  function getVisibleHistoryFeed() {
    const source = historyWidgetFilter?.value || "all";
    return buildHistoryFeed(getStore().tasks, historySort?.value || "newest", historyFilter?.value || "all").filter((item) => {
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
    if (!historyWidgetFilter) {
      return;
    }
    const currentValue = historyWidgetFilter.value || "all";
    const widgetTypes = Array.from(new Set(getStore().tasks.map((task) => task.ownerWidgetType).filter(Boolean))).sort();
    renderHistorySourceOptionsShared(historyWidgetFilter, widgetTypes, {
      currentValue,
      escapeHtml,
      ownerWidgetLabel
    });
  }

  function handleTaskGridClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !taskGrid?.contains(button)) {
      return;
    }
    handleTaskAction({ currentTarget: button });
  }

  function handleHistoryListClick(event) {
    const button = event.target.closest("[data-history-action]");
    if (!button || !historyList?.contains(button)) {
      return;
    }
    handleHistoryAction({ currentTarget: button });
  }

  function handleHistoryAction(event) {
    const taskId = event.currentTarget.getAttribute("data-task-id");
    const action = event.currentTarget.getAttribute("data-history-action");
    const task = getStore().tasks.find((item) => item.id === taskId);
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
    const source = historyWidgetFilter?.value || "all";
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

    for (const task of getStore().tasks) {
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

    const store = getStore();
    let changed = false;
    const recurringTemplatesToAdvance = new Set();
    const removedTaskIds = new Set();

    for (const task of store.tasks) {
      const currentHistory = Array.isArray(task.history) ? task.history : [];
      const nextHistory = currentHistory.filter((item) => !historyIds.has(item.id));
      if (nextHistory.length !== currentHistory.length) {
        const wasClosed = task.status !== "open";
        task.history = nextHistory;
        touchTask(task);
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

    for (const task of getStore().tasks) {
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
        touchTask(task);
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
      touchTask(task);
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
    const store = getStore();
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
    touchTask(task);
    reconcileRecurringSeries();
    return true;
  }

  function getVisibleCards() {
    const cards = [];
    for (const task of getStore().tasks) {
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
    return [template, ...getStore().tasks.filter((task) => task.templateId === template.id)].sort((left, right) => {
      if (left.occurrenceIndex !== right.occurrenceIndex) {
        return left.occurrenceIndex - right.occurrenceIndex;
      }
      return compareDateish(left.dueDate, right.dueDate);
    });
  }

  function filterCards(cards) {
    const status = statusFilter?.value || "all";
    const length = lengthFilter?.value || "all";
    const query = searchQuery?.value.trim().toLowerCase() || "";

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
    const mode = sortBy?.value || "due-date";
    const sorted = [...cards];
    sorted.sort((left, right) => {
      if (mode === "name") {
        return left.displayName.localeCompare(right.displayName);
      }
      if (mode === "length") {
        return (lengthOrder[left.task.length] || 0) - (lengthOrder[right.task.length] || 0);
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
    const store = getStore();
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
        config.undoPendingAction?.(pendingKey, "Undid the pending task action.");
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
          description: `Pending completion for ${task.name}. Click undo within 3 seconds to cancel.`,
          commit: () => {
            const nextTask = getStore().tasks.find((item) => item.id === task.id);
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
        description: `Pending skip for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
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
        description: `Pending delete for ${task.name}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          const nextTask = getStore().tasks.find((item) => item.id === task.id);
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
      touchTask(task);
    }

    if (action === "restore") {
      task.archived = false;
      touchTask(task);
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
    return getStore().widgets.some((widget) => widget.id === task.ownerWidgetId && widget.type === task.ownerWidgetType);
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
    task.hideAfterAt = isAutoDismissTask(task) ? at + completedOneOffDismissMs : 0;
    awardPointsForTask(task, at);
    pushHistory(task, "completed", at);
    touchTask(task, at);
  }

  function markTaskSkipped(task, at = Date.now(), metadata = null) {
    task.status = "skipped";
    task.historyOnly = false;
    task.hideAfterAt = 0;
    pushHistory(task, "skipped", at, metadata);
    touchTask(task, at);
  }

  function markTaskOpen(task, at = Date.now()) {
    task.status = "open";
    task.historyOnly = false;
    task.hideAfterAt = 0;
    revokePointsForTask(task);
    pushHistory(task, "reopened", at);
    touchTask(task, at);
  }

  function isAutoDismissTask(task) {
    return !task.templateId && task.recurrence.type === "none" && !task.ownerWidgetType;
  }

  function applyCompletedTaskHistoryOnly(now = Date.now()) {
    let changed = false;
    for (const task of getStore().tasks) {
      if (!task.historyOnly && task.status === "done" && isAutoDismissTask(task) && task.hideAfterAt && task.hideAfterAt <= now) {
        task.historyOnly = true;
        task.hideAfterAt = 0;
        touchTask(task, now);
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
    form?.reset();
    if (taskNameInput) {
      taskNameInput.value = task.name;
    }
    if (taskDetailsInput) {
      taskDetailsInput.value = task.details || "";
    }
    if (startDateInput) {
      startDateInput.value = "";
    }
    if (dueDateInput) {
      dueDateInput.value = "";
    }
    if (timeOfDayInput) {
      timeOfDayInput.value = "";
    }
    if (lateGraceMinutesInput) {
      lateGraceMinutesInput.value = String(task.lateGraceMinutes ?? defaultLateGraceMinutes);
    }
    setTaskPointsInput(task.pointsValue ?? defaultPointsForLength(task.length));
    if (taskLengthInput) {
      taskLengthInput.value = task.length;
    }
    if (taskCategoryInput) {
      taskCategoryInput.value = task.categoryKey || defaultCategoryKey;
    }
    if (taskImportanceInput) {
      taskImportanceInput.value = normalizeImportance(task.importance || defaultImportance);
    }
    setTaskReminderFormValues(task.reminders, {
      importance: task.importance || defaultImportance,
      lateGraceMinutes: task.lateGraceMinutes ?? defaultLateGraceMinutes,
      treatAsUserTouched: true
    });
    if (skipRuleTypeInput) {
      skipRuleTypeInput.value = "none";
    }
    if (skipGraceMinutesInput) {
      skipGraceMinutesInput.value = 15;
    }
    if (recurrenceTypeInput) {
      recurrenceTypeInput.value = "none";
    }
    if (recurrenceForeverInput) {
      recurrenceForeverInput.checked = false;
    }
    renderDailyInstanceTimes([]);
    setWeeklyDaySelection([0]);
    Array.from(dependenciesSelect?.options || []).forEach((option) => {
      option.selected = false;
    });
    composerReminderState.userTouched = true;
    updateSkipVisibility();
    syncTaskReminderInputs();
    updateRecurrenceVisibility();
    syncEditPanel();
    taskNameInput?.focus();
  }

  function pruneHistoryOnlyTasksWithoutHistory() {
    const store = getStore();
    store.tasks = store.tasks.filter((task) => !task.historyOnly || (Array.isArray(task.history) && task.history.length > 0));
  }

  function syncTaskPointAward(task) {
    const isDone = task.status === "done";
    const hasAward = Boolean(task.pointsEntryId);
    if (isDone && !hasAward) {
      awardPointsForTask(task);
      return;
    }
    if (!isDone && hasAward) {
      revokePointsForTask(task);
    }
  }

  return {
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
  };
}
