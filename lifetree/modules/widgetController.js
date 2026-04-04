export function createWidgetController(config = {}) {
  const {
    refs = {},
    apiBase = "",
    fetchCredentials = "same-origin",
    getStore,
    getWidgetDefinition,
    listWidgetDefinitions,
    ownerWidgetLabel = () => "",
    findNextWidgetCompletionTask = () => null,
    toDateString = (value) => String(value ?? ""),
    createId = () => String(Date.now()),
    applyAutoSkipOwnedTask = () => false,
    isBlocked = () => false,
    markTaskCompleted = () => null,
    markTaskOpen = () => null,
    markTaskSkipped = () => null,
    pushHistory = () => {},
    setSyncStatus = () => {},
    renderAll = () => {},
    persistStore = () => {},
    reconcileRecurringSeries = () => {},
    ensureWidgetIntegrity = () => {},
    ensureWidgetTasks = () => {},
    getRetiredWidgetByType = () => null,
    removeRetiredWidgetByType = () => {},
    rememberRetiredWidget = () => {},
    rememberDeletedTask = () => {},
    rememberDeletedSeries = () => {},
    upsertArchivedSeriesRecord = () => {},
    openTaskDesk = () => {},
    openWidgetDetail = () => {},
    resolveCategorySnapshot = () => ({ key: "", label: "", color: "" }),
    regenerateSeries = () => {},
    retireWidgetOwnedSeries = () => {},
    isDeveloperUser = () => false,
    escapeHtml = (value) => String(value ?? ""),
    formatDate = (value) => String(value ?? ""),
    formatDateTime = (value) => String(value ?? ""),
    todayString = () => ""
  } = config;

  const {
    widgetSlots = [],
    widgetMenu = null,
    widgetDetailBody = null,
    widgetDetailTitle = null,
    widgetDetailSubtitle = null
  } = refs;

  const widgetMenuState = {
    slotIndex: null,
    selectedType: ""
  };
  const pendingActions = new Map();

  function handleWidgetSlotClick(event) {
    const store = getStore();
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
      helpers: buildWidgetShellHelpers()
    })) {
      return;
    }

    if (action === "open-task-desk") {
      openTaskDesk("tasks");
      return;
    }

    if (action === "open-widget-detail") {
      if (widget) {
        openWidgetDetail(widget);
      }
      return;
    }

    if (action === "remove-widget") {
      if (!widget) {
        return;
      }
      removeWidget(widget);
    }
  }

  function handleWidgetSlotSubmit(event) {
    const store = getStore();
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
      helpers: buildWidgetShellHelpers()
    })) {
      event.preventDefault();
    }
  }

  function buildWidgetShellHelpers() {
    return {
      getStore,
      createId,
      applyAutoSkipRules,
      completeNextTaskFromWidget,
      completeWidgetTaskById,
      reopenWidgetTaskById,
      skipWidgetTaskById,
      openWidgetDetail,
      stageWidgetAction,
      getPendingActionForWidget,
      undoPendingAction,
      reconcileRecurringSeries,
      persistStore,
      renderAll,
      setSyncStatus,
      todayString,
      resolveCategorySnapshot,
      openTaskDesk,
      regenerateSeries,
      retireWidgetOwnedSeries
    };
  }

  function openWidgetMenu(slotIndex) {
    widgetMenuState.slotIndex = slotIndex;
    widgetMenuState.selectedType = "";
    widgetMenu?.classList.add("hidden");
    renderWidgetOrbit();
  }

  function closeWidgetMenu() {
    widgetMenuState.slotIndex = null;
    widgetMenuState.selectedType = "";
    widgetMenu?.classList.add("hidden");
    renderWidgetOrbit();
  }

  function addWidgetTypeToSelectedSlot(type) {
    const store = getStore();
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
    getStore().widgets = getStore().widgets.filter((item) => item.id !== widget.id);

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
    const store = getStore();
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
      if (removedIds.has(task.templateId)) {
        rememberDeletedTask(task);
        return false;
      }
      return true;
    });
  }

  function renderWidgetOrbit() {
    const store = getStore();
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
        try {
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
          if (definition.hydrateShell) {
            Promise.resolve(definition.hydrateShell({
              widget,
              tasks: store.tasks,
              root: slot,
              apiBase,
              fetchCredentials,
              persistStore,
              setSyncStatus
            })).catch((error) => {
              console.error(`Widget shell hydration failed for ${widget.type}:`, error);
            });
          }
        } catch (error) {
          console.error(`Widget shell render failed for ${widget.type}:`, error);
          slot.innerHTML = `
            <button
              type="button"
              class="widget-shell-remove"
              data-widget-action="remove-widget"
              aria-label="Remove widget"
            >
              <span aria-hidden="true">×</span>
            </button>
            <div class="widget-slot-header">
              <h3>${escapeHtml(definition.title || "Widget")}</h3>
              <span class="widget-badge">Error</span>
            </div>
            <p>This widget shell could not render from the current saved data.</p>
          `;
        }
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
    const store = getStore();
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
    const task = getStore().tasks.find((item) => item.id === taskId);
    if (!task || task.archived || task.status !== "open" || isBlocked(task)) {
      return null;
    }
    markTaskCompleted(task, at);
    return task;
  }

  function reopenWidgetTaskById(taskId, at = Date.now()) {
    const task = getStore().tasks.find((item) => item.id === taskId);
    if (!task || task.archived || task.status === "open") {
      return null;
    }
    markTaskOpen(task, at);
    return task;
  }

  function skipWidgetTaskById(taskId, at = Date.now()) {
    const task = getStore().tasks.find((item) => item.id === taskId);
    if (!task || task.archived || task.status !== "open") {
      return null;
    }
    markTaskSkipped(task, at);
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
    }, 3000);
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
    for (const task of getStore().tasks) {
      if (shouldSkipTask(task, now)) {
        markTaskSkipped(task, now.getTime(), { reason: "auto-skip" });
        changed = true;
      }
    }
    return changed;
  }

  function shouldSkipTask(task, now = new Date()) {
    if (!task || task.status !== "open" || task.archived) {
      return false;
    }

    if (applyAutoSkipOwnedTask(task, now)) {
      return true;
    }

    if (task.skipRule?.type === "widget-lockout") {
      return shouldSkipWidgetLockoutTask(task, now);
    }

    return false;
  }

  function shouldSkipWidgetLockoutTask(task, now = new Date()) {
    const definition = getWidgetDefinition(task.ownerWidgetType);
    return definition?.shouldAutoSkipOwnedTask?.({ task, now, store: getStore() }) || false;
  }

  return {
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
    removeWidget,
    renderWidgetOrbit,
    reopenWidgetTaskById,
    shouldSkipTask,
    skipWidgetTaskById,
    stagePendingAction,
    stageWidgetAction,
    undoPendingAction
  };
}
