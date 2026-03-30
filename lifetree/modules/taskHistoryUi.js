export function renderPriorityIndicator(
  importance,
  variant = "task",
  {
    defaultImportance,
    normalizeImportance,
    importanceDefinitions,
    escapeHtml
  }
) {
  const normalized = normalizeImportance(importance || defaultImportance);
  const definition = importanceDefinitions[normalized];
  if (!definition?.icon) {
    return "";
  }
  const className = variant === "canopy"
    ? `canopy-priority-indicator priority-${normalized}`
    : `task-chip task-priority-indicator priority-${normalized}`;
  return `<span class="${className}" title="${escapeHtml(definition.label)}" aria-label="${escapeHtml(definition.label)}">${escapeHtml(definition.icon)}</span>`;
}

export function renderTaskGrid(
  taskGrid,
  cards,
  {
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
    renderTaskDependencies,
    renderTaskHistorySummary,
    renderTaskActions
  }
) {
  taskGrid.innerHTML = "";

  if (cards.length === 0) {
    emptyState.classList.add("visible");
    return;
  }
  emptyState.classList.remove("visible");

  taskGrid.innerHTML = cards.map((cardData) => {
    const blocked = isBlocked(cardData.task);
    const deadlineState = getOpenTaskDeadlineState(cardData.task);
    return `
      <article
        class="task-card${cardData.status === "done" ? " done" : ""}${cardData.status === "skipped" ? " skipped" : ""}${cardData.task.archived ? " archived" : ""}${blocked ? " blocked" : ""}${deadlineState ? ` deadline-${deadlineState}` : ""}"
        style="--task-category-color: ${escapeHtml(cardData.task.categoryColor || defaultCategoryColor)}"
      >
        <h3>${escapeHtml(cardData.displayName)}</h3>
        <div class="chip-row">
          <span class="task-chip length-${cardData.task.length}">${humanizeLength(cardData.task.length)}</span>
          <span class="task-chip">${escapeHtml(statusLabel(cardData.task.archived ? "archived" : cardData.status))}</span>
          <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || defaultCategoryColor)}">${escapeHtml(cardData.task.categoryLabel || "Uncategorized")}</span>
          <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(cardData.task.categoryColor || defaultCategoryColor)}">${escapeHtml(formatPointsLabel(cardData.task.pointsValue))}</span>
          ${renderPriorityIndicator(cardData.task.importance || defaultImportance, "task", {
            defaultImportance,
            normalizeImportance,
            importanceDefinitions,
            escapeHtml
          })}
          ${cardData.task.ownerWidgetType ? `<span class="task-chip">${escapeHtml(ownerWidgetLabel(cardData.task))}</span>` : ""}
          ${cardData.kind === "series" ? `<span class="task-chip">${escapeHtml(describeRecurrence(cardData.template.recurrence))}</span>` : ""}
        </div>
        <div class="task-meta">
          <span>Start: ${cardData.task.startDate || "unset"}${cardData.task.timeOfDay ? ` at ${cardData.task.timeOfDay}` : ""}</span>
          <span>Due: ${cardData.task.dueDate || "unset"}${cardData.task.timeOfDay ? ` at ${cardData.task.timeOfDay}` : ""}</span>
          <span>Created: ${formatDate(cardData.task.createdAt)}</span>
        </div>
        <p class="task-details">${escapeHtml(cardData.task.details || "No details yet.")}</p>
        <div class="dependency-list">${renderTaskDependencies(cardData.task)}</div>
        <div class="recurrence-copy">${escapeHtml(cardSummary(cardData))}</div>
        <div class="history-copy">${escapeHtml(renderTaskHistorySummary(cardData.task))}</div>
        <div class="task-actions">${renderTaskActions(cardData)}</div>
      </article>
    `;
  }).join("");
}

export function renderHistoryPanel(
  historyList,
  feed,
  {
    historyEmpty,
    tasksById,
    canRestoreHistoryTask,
    escapeHtml,
    formatDateTime,
    ownerWidgetLabel
  }
) {
  historyList.innerHTML = "";

  if (feed.length === 0) {
    historyEmpty.classList.add("visible");
    return;
  }

  historyEmpty.classList.remove("visible");
  historyList.innerHTML = feed.map((item) => {
    const task = tasksById.get(item.taskId) || null;
    const canRestore = item.type === "skipped" && canRestoreHistoryTask(task, item.historyId);
    return `
      <article class="history-entry">
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
      </article>
    `;
  }).join("");
}

export function renderHistorySourceOptions(
  historyWidgetFilter,
  widgetTypes,
  {
    currentValue,
    escapeHtml,
    ownerWidgetLabel
  }
) {
  historyWidgetFilter.innerHTML = `
    <option value="all">All sources</option>
    <option value="manual">Manual tasks</option>
    ${widgetTypes.map((type) => `<option value="${type}">${escapeHtml(ownerWidgetLabel({ ownerWidgetType: type }))}</option>`).join("")}
  `;
  historyWidgetFilter.value = widgetTypes.includes(currentValue) || currentValue === "all" || currentValue === "manual"
    ? currentValue
    : "all";
}

export function renderTaskHistorySummary(task, { formatDate }) {
  if (!task.history || task.history.length === 0) {
    return task.timeOfDay ? `Time: ${task.timeOfDay}` : "No history yet.";
  }
  const latest = task.history[task.history.length - 1];
  return `Latest activity: ${latest.type} on ${formatDate(latest.at)}${task.timeOfDay ? ` at ${task.timeOfDay}` : ""}`;
}

export function renderTaskActions(
  cardData,
  {
    escapeHtml,
    getPendingActionForTask,
    isWidgetProtectedTask,
    isDeletePending
  }
) {
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
  } else if (!protectedTask) {
    buttons.push(`<button type="button" class="task-action" data-action="delete" data-id="${task.id}">${deletePending ? "Confirm delete" : "Delete"}</button>`);
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

export function renderTaskDependencies(
  task,
  {
    tasksById,
    formatTaskAvailability,
    getTaskDependencyIds,
    formatTaskDisplayName,
    escapeHtml
  }
) {
  const availabilityLabel = formatTaskAvailability(task);
  const dependencyIds = getTaskDependencyIds(task);
  if (dependencyIds.length === 0 && !availabilityLabel) {
    return "No prerequisite tasks.";
  }
  if (dependencyIds.length === 0 && availabilityLabel) {
    return `Not before ${availabilityLabel}.`;
  }
  const names = dependencyIds.map((dependencyId) => {
    const dependency = tasksById.get(dependencyId);
    return dependency ? formatTaskDisplayName(dependency) : "missing task";
  });
  return availabilityLabel
    ? `Depends on: ${escapeHtml(names.join(", "))}. Not before ${availabilityLabel}.`
    : `Depends on: ${escapeHtml(names.join(", "))}`;
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
