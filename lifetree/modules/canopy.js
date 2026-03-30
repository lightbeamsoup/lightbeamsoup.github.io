const COLUMN_CONFIG = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Longer term" }
];

const RECURRING_GROUP_ORDER = ["daily", "weekly", "monthly"];
const RECURRING_GROUP_LABELS = {
  daily: "Dailies",
  weekly: "Weeklies",
  monthly: "Monthlies"
};
const RECURRING_SERIES_BADGE_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly"
};
const RECURRING_PERIOD_LABELS = {
  daily: "day",
  weekly: "week",
  monthly: "month"
};
const LENGTH_ABBREVIATIONS = {
  "very-short": "VS",
  short: "S",
  medium: "M",
  long: "L",
  "very-long": "VL"
};

export function buildCanopyColumnsData({ standardCards, recurringEntries, today }) {
  const columns = COLUMN_CONFIG.map((column) => ({
    ...column,
    standardItems: [],
    recurringGroups: new Map()
  }));
  const thisWeekCutoff = endOfWeek(today);
  const thisMonthCutoff = addDays(today, 30);

  for (const card of [...standardCards].sort(compareCanopyCards)) {
    const columnKey = getTaskColumnKey(card.task, today, thisWeekCutoff, thisMonthCutoff);
    if (!columnKey) {
      continue;
    }
    findColumn(columns, columnKey).standardItems.push(card);
  }

  for (const entry of dedupeRecurringEntries(recurringEntries)) {
    const groupKey = getRecurringGroupKey(entry.task);
    if (!groupKey || !isCurrentRecurringPeriod(entry.task, today)) {
      continue;
    }

    const column = findColumn(columns, getRecurringColumnKey(groupKey, entry.task, today, thisWeekCutoff));
    const existing = column.recurringGroups.get(groupKey) || {
      key: groupKey,
      label: RECURRING_GROUP_LABELS[groupKey],
      periodLabel: RECURRING_PERIOD_LABELS[groupKey],
      tasks: [],
      seriesByKey: new Map()
    };
    existing.tasks.push(entry);
    const seriesKey = buildRecurringSeriesKey(entry.task, groupKey);
    const existingSeries = existing.seriesByKey.get(seriesKey) || {
      key: seriesKey,
      tasks: []
    };
    existingSeries.tasks.push(entry);
    existing.seriesByKey.set(seriesKey, existingSeries);
    column.recurringGroups.set(groupKey, existing);
  }

  return columns.map((column) => {
    const recurringGroups = [...column.recurringGroups.values()]
      .map((group) => {
        const seriesCards = [...group.seriesByKey.values()]
          .map((series) => finalizeRecurringSeriesCard(series.tasks.sort(compareRecurringEntries)))
          .sort(compareRecurringSeriesCards);

        return {
          ...group,
          tasks: group.tasks.sort(compareRecurringEntries),
          seriesCards,
          completedCount: group.tasks.filter((entry) => entry.task.status === "done").length,
          totalCount: group.tasks.length,
          resolvedSeriesCount: seriesCards.filter((series) => !series.nextOpenTaskId).length,
          completedSeriesCount: seriesCards.filter((series) => series.completedCount === series.totalCount).length,
          skippedSeriesCount: seriesCards.filter((series) => !series.nextOpenTaskId && series.skippedCount > 0 && series.completedCount < series.totalCount).length
        };
      })
      .sort((left, right) => RECURRING_GROUP_ORDER.indexOf(left.key) - RECURRING_GROUP_ORDER.indexOf(right.key));
    const visibleStandardItems = column.standardItems.slice(0, 2);
    const hiddenStandardItems = column.standardItems.slice(2);
    return {
      ...column,
      totalCount: column.standardItems.length + recurringGroups.reduce((sum, group) => sum + group.seriesCards.length, 0),
      visibleStandardItems,
      hiddenStandardItems,
      recurringGroups
    };
  });
}

export function getCanopyRecurringGroupKey(task) {
  const baseGroupKey = getBaseRecurringGroupKey(task);
  if (!baseGroupKey) {
    return "";
  }
  if (baseGroupKey === "monthly") {
    return "monthly";
  }

  const occurrencesPerWeek = estimateOccurrencesPerWeek(task, baseGroupKey);
  if (occurrencesPerWeek < 1) {
    return "monthly";
  }
  if (baseGroupKey === "daily" && occurrencesPerWeek <= 1) {
    return "weekly";
  }
  return baseGroupKey;
}

export function renderCanopyColumns(container, {
  columns,
  escapeHtml,
  formatDate,
  formatPointsLabel,
  getPendingActionForTask,
  renderPriorityIndicator
}) {
  container.innerHTML = columns.map((column) => `
    <section class="canopy-column">
      <div class="canopy-column-header">
        <div class="canopy-column-heading">
          <strong>${escapeHtml(column.label)}</strong>
          <span>${column.totalCount}</span>
        </div>
        ${column.hiddenStandardItems.length > 0 ? `
          <button
            type="button"
            class="ghost-button canopy-column-expand"
            data-canopy-action="show-column"
            data-column-key="${column.key}"
          >
            Show all
          </button>
        ` : ""}
      </div>
      <div class="canopy-list">
        ${column.visibleStandardItems.length > 0
          ? column.visibleStandardItems.map((item) => renderCanopyTask(item, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)).join("")
          : ""}
        ${renderRecurringGroupRow(column, escapeHtml, formatPointsLabel)}
        ${column.visibleStandardItems.length === 0 && column.recurringGroups.length === 0 ? '<p class="canopy-empty">No tasks queued.</p>' : ""}
      </div>
    </section>
  `).join("");
}

export function renderCanopyDetailContent(container, {
  detail,
  columns,
  escapeHtml,
  formatDate,
  formatPointsLabel,
  showHelpText,
  getPendingActionForTask,
  renderPriorityIndicator
}) {
  const column = columns.find((entry) => entry.key === detail.columnKey) || null;
  if (!column) {
    container.innerHTML = '<p class="canopy-empty">Nothing is queued here right now.</p>';
    return {
      title: "Canopy",
      subtitle: "There is nothing to show in this canopy view right now.",
      footerNote: ""
    };
  }

  if (detail.kind === "group") {
    const group = column.recurringGroups.find((entry) => entry.key === detail.groupKey) || null;
    if (!group) {
      container.innerHTML = '<p class="canopy-empty">This recurring group is empty for the current period.</p>';
      return {
        title: "Canopy",
        subtitle: "There is nothing to show in this recurring group right now.",
        footerNote: ""
      };
    }

    container.innerHTML = `
      ${renderRecurringBonusPanel(group, detail.columnKey, escapeHtml, formatPointsLabel)}
      <div class="canopy-detail-list recurring">
        ${group.seriesCards.map((series) => renderRecurringDetailSeriesCard(series, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)).join("")}
      </div>
    `;
    return {
      title: `${column.label} · ${group.label}`,
      subtitle: `Current ${group.periodLabel}. Progress stays visible until the ${group.periodLabel} ends.`,
      footerNote: showHelpText ? "Hover or long-press recurring actions for help." : ""
    };
  }

  container.innerHTML = `
    <div class="canopy-detail-list">
      ${column.standardItems.length > 0
        ? column.standardItems.map((item) => renderCanopyTask(item, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)).join("")
        : '<p class="canopy-empty">No one-off tasks are queued here.</p>'}
    </div>
  `;
  const hasSurfacedRecurring = column.standardItems.some((item) => Boolean(item.surfacedRecurringGroup));
  return {
    title: `${column.label} tasks`,
    subtitle: hasSurfacedRecurring
      ? "One-off tasks leave the canopy when resolved. Surfaced weekly and monthly tasks still remain tracked in their period groups."
      : "These one-off tasks leave the canopy as soon as they are completed or skipped.",
    footerNote: showHelpText ? "Hover or long-press task actions for help." : ""
  };
}

function renderRecurringGroupRow(column, escapeHtml, formatPointsLabel) {
  if (column.recurringGroups.length === 0) {
    return "";
  }

  return `
    <div class="canopy-recurring-row">
      ${column.recurringGroups.map((group) => `
        <div class="canopy-group-entry">
          <button
            type="button"
            class="canopy-group-card${group.bonus?.collectible ? " ready" : ""}${group.bonus?.claimed ? " claimed" : ""}"
            data-canopy-action="open-group"
            data-column-key="${column.key}"
            data-group-key="${group.key}"
            ${group.bonus ? `style="--canopy-bonus-color: ${escapeHtml(group.bonus.selectedCategory?.color || "#f4c95d")}"` : ""}
          >
            <strong>${escapeHtml(group.label)}</strong>
            <span>${escapeHtml(buildRecurringGroupSummaryLabel(group))}</span>
            ${group.bonus?.claimed ? `
              <span class="canopy-group-bonus-state claimed">Bonus claimed in ${escapeHtml(group.bonus.claimedCategoryLabel || group.bonus.selectedCategory?.label || "selected type")}</span>
            ` : group.bonus?.collectible ? `
              <span class="canopy-group-bonus-state ready">Bonus ready: collect ${escapeHtml(formatPointsLabel(group.bonus.points))}</span>
            ` : ""}
            ${renderRecurringGroupPreview(group, escapeHtml)}
          </button>
          ${group.bonus?.pendingAction ? `
            <button
              type="button"
              class="canopy-group-star pending"
              data-canopy-action="undo-group-bonus"
              data-column-key="${column.key}"
              data-group-key="${group.key}"
              data-pending-key="${group.bonus.pendingAction.key}"
              data-help="${escapeHtml("Undo this pending recurring bonus collection.")}"
              style="--canopy-bonus-color: ${escapeHtml(group.bonus.selectedCategory?.color || "#f4c95d")}"
              title="${escapeHtml("Undo pending bonus collection")}"
              aria-label="${escapeHtml(`Undo ${group.label} bonus collection`)}"
            >Undo</button>
          ` : group.bonus?.collectible ? `
            <button
              type="button"
              class="canopy-group-star"
              data-canopy-action="collect-group-bonus"
              data-column-key="${column.key}"
              data-group-key="${group.key}"
              data-pending-key=""
              data-help="${escapeHtml(`Collect the ${group.label.toLowerCase()} bonus in ${group.bonus.selectedCategory?.label || "the selected category"}.`)}"
              style="--canopy-bonus-color: ${escapeHtml(group.bonus.selectedCategory?.color || "#f4c95d")}"
              title="${escapeHtml(`Collect ${formatPointsLabel(group.bonus.points)} in ${group.bonus.selectedCategory?.label || "the selected category"}`)}"
              aria-label="${escapeHtml(`Collect ${group.label} bonus`)}"
            >★</button>
          ` : group.bonus?.claimed ? `
            <span
              class="canopy-group-star claimed"
              style="--canopy-bonus-color: ${escapeHtml(group.bonus.selectedCategory?.color || "#f4c95d")}"
              title="${escapeHtml(`Bonus already claimed in ${group.bonus.claimedCategoryLabel || group.bonus.selectedCategory?.label || "selected type"}`)}"
              aria-label="${escapeHtml(`${group.label} bonus already claimed`)}"
            >✓</span>
          ` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderRecurringGroupPreview(group, escapeHtml) {
  const previewItems = (group.seriesCards || [])
    .filter((series) => Boolean(series.nextOpenTaskId))
    .slice(0, 3);
  if (previewItems.length === 0) {
    return "";
  }

  return `
    <div class="canopy-group-preview">
      ${previewItems.map((series) => `
        <div class="canopy-group-preview-item">
          <strong>${escapeHtml(series.displayName)}</strong>
          <span>${escapeHtml(buildRecurringPreviewMeta(series, group.key))}</span>
        </div>
      `).join("")}
      ${(group.seriesCards || []).filter((series) => Boolean(series.nextOpenTaskId)).length > previewItems.length ? `
        <span class="canopy-group-preview-more">+${(group.seriesCards || []).filter((series) => Boolean(series.nextOpenTaskId)).length - previewItems.length} more</span>
      ` : ""}
    </div>
  `;
}

function buildRecurringGroupSummaryLabel(group) {
  const total = Array.isArray(group?.seriesCards) ? group.seriesCards.length : 0;
  if (!total) {
    return "0/0 complete";
  }
  const completed = Number(group?.completedSeriesCount) || 0;
  const skipped = Number(group?.skippedSeriesCount) || 0;
  return skipped > 0 ? `${completed}/${total} complete · ${skipped} skipped` : `${completed}/${total} complete`;
}

function buildRecurringPreviewMeta(series, groupKey = "") {
  const dueCopy = formatRecurringPreviewDue(series, groupKey);
  if (series.totalCount > 1) {
    return `${series.completedCount}/${series.totalCount} complete · ${dueCopy}`;
  }
  return dueCopy;
}

function formatRecurringPreviewDue(series, groupKey = "") {
  const rawDueCopy = series.nextActionDueLabel || series.nextDueLabel || series.blockedNote || "Still due this period";
  if (groupKey === "daily") {
    const timeMatch = rawDueCopy.match(/at\s+(.+)$/);
    if (timeMatch?.[1]) {
      return `Next ${timeMatch[1]}`;
    }
    return rawDueCopy.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
  }
  return rawDueCopy;
}

function renderRecurringBonusPanel(group, columnKey, escapeHtml, formatPointsLabel) {
  const bonus = group.bonus;
  if (!bonus || bonus.allowedCategories.length === 0) {
    return "";
  }

  return `
    <section class="canopy-bonus-panel${bonus.collectible ? " ready" : ""}${bonus.claimed ? " claimed" : ""}" style="--canopy-bonus-color: ${escapeHtml(bonus.selectedCategory?.color || "#f4c95d")}">
      <div class="canopy-bonus-copy">
        <strong>${escapeHtml(group.label)} bonus</strong>
        <span>${escapeHtml(
          bonus.claimed
            ? `Collected ${formatPointsLabel(bonus.points)} in ${bonus.claimedCategoryLabel || bonus.selectedCategory?.label || "the selected category"} for this ${bonus.periodLabel}.`
            : bonus.collectible
              ? `All tasks for this ${bonus.periodLabel} are complete. Collect ${formatPointsLabel(bonus.points)} in an eligible category.`
              : `Complete every ${group.label.toLowerCase()} task in this ${bonus.periodLabel} to unlock ${formatPointsLabel(bonus.points)}.`
        )}</span>
      </div>
      <div class="canopy-bonus-controls">
        <label class="canopy-bonus-field">
          <span>Bonus type</span>
          <select
            data-canopy-bonus-select="true"
            data-column-key="${columnKey}"
            data-group-key="${group.key}"
            data-help="${escapeHtml(`Choose which allowed category receives the ${formatPointsLabel(bonus.points)} bonus.`)}"
            ${bonus.claimed || bonus.pendingAction ? "disabled" : ""}
          >
            ${bonus.allowedCategories.map((category) => `
              <option value="${escapeHtml(category.key)}"${category.key === bonus.selectedCategoryKey ? " selected" : ""}>${escapeHtml(category.label)}</option>
            `).join("")}
          </select>
        </label>
        <button
          type="button"
          class="ghost-button canopy-bonus-collect${bonus.claimed ? " claimed" : ""}"
          data-canopy-action="${bonus.pendingAction ? "undo-group-bonus" : "collect-group-bonus"}"
          data-column-key="${columnKey}"
          data-group-key="${group.key}"
          data-pending-key="${bonus.pendingAction?.key || ""}"
          data-help="${escapeHtml(bonus.pendingAction ? "Undo this pending recurring bonus collection." : `Collect ${formatPointsLabel(bonus.points)} once every ${group.label.toLowerCase()} task in this ${bonus.periodLabel} is complete.`)}"
          ${!bonus.pendingAction && !bonus.collectible ? "disabled" : ""}
        >${bonus.claimed ? `✓ Collected` : bonus.pendingAction ? "Undo" : `Collect ${formatPointsLabel(bonus.points)}`}</button>
      </div>
    </section>
  `;
}

function renderCanopyTask(item, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator) {
  const taskColor = escapeHtml(item.task.categoryColor || "#7dbf74");
  const pendingAction = getPendingActionForTask(item.task.id);

  if (pendingAction) {
    return `
      <article class="canopy-task pending" style="--canopy-category-color: ${taskColor}">
        <div class="canopy-task-main">
          <strong>${escapeHtml(item.displayName)}</strong>
          <span>${escapeHtml(describeTaskDate(item.task, formatDate))}</span>
          ${renderCanopyMeta(item.task, escapeHtml, renderPriorityIndicator, item.surfacedRecurringGroup || "")}
        </div>
        <div class="canopy-task-footer">
          <span class="canopy-task-status">${escapeHtml(pendingAction.description || "Pending action")}</span>
          <button type="button" class="canopy-task-undo" data-canopy-action="undo" data-task-id="${item.task.id}" data-pending-key="${pendingAction.key}">
            Undo
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="canopy-task${item.blocked ? " blocked" : ""}${item.deadlineState ? ` deadline-${item.deadlineState}` : ""}" style="--canopy-category-color: ${taskColor}">
      <div class="canopy-task-main">
        <strong>${escapeHtml(item.displayName)}</strong>
        <span>${escapeHtml(describeTaskDate(item.task, formatDate))}</span>
        ${item.blocked ? `<span class="canopy-task-status">${escapeHtml(item.blockedNote || "Blocked")}</span>` : ""}
        <div class="canopy-task-bottom">
          ${renderCanopyMeta(item.task, escapeHtml, renderPriorityIndicator, item.surfacedRecurringGroup || "")}
          <div class="canopy-task-actions">
          <button
            type="button"
            class="canopy-task-icon complete"
            data-canopy-action="complete"
            data-task-id="${item.task.id}"
            data-help="${escapeHtml(item.blocked ? "This task is blocked by another unfinished task." : `Complete ${item.displayName}.`)}"
            aria-label="Complete ${escapeHtml(item.displayName)}"
            title="Complete"
            ${item.blocked ? "disabled" : ""}
          >✓</button>
          <button
            type="button"
            class="canopy-task-icon skip"
            data-canopy-action="skip"
            data-task-id="${item.task.id}"
            data-help="${escapeHtml(`Skip ${item.displayName}.`)}"
            aria-label="Skip ${escapeHtml(item.displayName)}"
            title="Skip"
          >×</button>
          <button
            type="button"
            class="canopy-task-icon edit"
            data-canopy-action="edit"
            data-task-id="${item.task.id}"
            data-help="${escapeHtml(`Edit ${item.displayName} in Task Desk.`)}"
            aria-label="Edit ${escapeHtml(item.displayName)}"
            title="Edit"
          >…</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderRecurringDetailSeriesCard(series, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator) {
  const { representativeTask: task } = series;
  const taskColor = escapeHtml(task.categoryColor || "#7dbf74");
  const pendingEntry = series.tasks.find((entry) => getPendingActionForTask(entry.task.id)) || null;
  const pendingAction = pendingEntry ? getPendingActionForTask(pendingEntry.task.id) : null;
  const blocked = Boolean(series.blocked);

  if (pendingAction) {
    return `
      <article class="canopy-group-task pending" style="--canopy-category-color: ${taskColor}">
        <div class="canopy-group-main">
          <strong>${escapeHtml(series.displayName)}</strong>
          <span>${escapeHtml(series.progressLabel)}</span>
          ${renderCanopyMeta(task, escapeHtml, renderPriorityIndicator)}
          <span class="canopy-task-status">${escapeHtml(series.statusLabel)}</span>
        </div>
        <div class="canopy-task-footer">
          <span class="canopy-task-status">${escapeHtml(pendingAction.description || "Pending action")}</span>
          <button type="button" class="canopy-task-undo" data-canopy-action="undo" data-task-id="${pendingEntry.task.id}" data-pending-key="${pendingAction.key}">
            Undo
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="canopy-group-task${series.completedCount === series.totalCount ? " done" : ""}${series.skippedCount === series.totalCount ? " skipped" : ""}${blocked ? " blocked" : ""}${series.deadlineState ? ` deadline-${series.deadlineState}` : ""}" style="--canopy-category-color: ${taskColor}">
      <div class="canopy-group-main">
        <strong>${escapeHtml(series.displayName)}</strong>
        <span>${escapeHtml(series.progressLabel)}</span>
        ${renderCanopyMeta(task, escapeHtml, renderPriorityIndicator)}
        <span class="canopy-task-status">${escapeHtml(series.statusLabel)}</span>
        ${series.isWidgetManaged
          ? `<span class="canopy-note">${escapeHtml(series.lockedNote)}</span>`
          : (blocked ? `<span class="canopy-note">${escapeHtml(series.blockedNote || "Blocked")}</span>` : "")}
      </div>
      <div class="canopy-task-footer${series.isWidgetManaged ? " locked" : ""}">
        <span class="canopy-task-status">${escapeHtml(series.footerLabel)}</span>
        <div class="canopy-task-actions">
          <button
            ${renderRecurringSeriesActions(series, escapeHtml)}
        </div>
      </div>
    </article>
  `;
}

function dedupeRecurringEntries(entries) {
  const bySignature = new Map();

  for (const entry of entries) {
    const signature = buildRecurringSignature(entry.task);
    const existing = bySignature.get(signature);
    if (!existing || compareRecurringEntryPreference(entry, existing) < 0) {
      bySignature.set(signature, entry);
    }
  }

  return [...bySignature.values()];
}

function buildRecurringSignature(task) {
  return [
    getRecurringGroupKey(task),
    task.dueDate || task.startDate || "",
    task.timeOfDay || "",
    task.ownerTaskKey || task.name || ""
  ].join("|");
}

function compareRecurringEntryPreference(left, right) {
  const statusRank = (value) => {
    if (value === "done") return 0;
    if (value === "open") return 1;
    if (value === "skipped") return 2;
    return 3;
  };

  const leftRank = statusRank(left.task.status);
  const rightRank = statusRank(right.task.status);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (Boolean(left.task.archived) !== Boolean(right.task.archived)) {
    return left.task.archived ? 1 : -1;
  }
  return (right.task.updatedAt || right.task.createdAt || 0) - (left.task.updatedAt || left.task.createdAt || 0);
}

function compareRecurringEntries(left, right) {
  const leftDate = left.task.dueDate || left.task.startDate || "9999-12-31";
  const rightDate = right.task.dueDate || right.task.startDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  const leftTime = left.task.timeOfDay || "99:99";
  const rightTime = right.task.timeOfDay || "99:99";
  if (leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }
  return (left.task.name || "").localeCompare(right.task.name || "");
}

function buildRecurringSeriesKey(task, groupKey) {
  const baseGroupKey = getBaseRecurringGroupKey(task);
  if (baseGroupKey === "daily" || baseGroupKey === "weekly") {
    if (task?.linkedSeries?.groupId) {
      return `linked:${task.linkedSeries.groupId}`;
    }
    if (task?.templateId) {
      return `template:${task.templateId}`;
    }
    return `template:${task?.id || task?.ownerTaskKey || task?.name || "task"}`;
  }

  return [
    "period",
    task?.templateId || task?.id || task?.ownerTaskKey || task?.name || "task"
  ].join(":");
}

function finalizeRecurringSeriesCard(entries) {
  const tasks = [...entries].sort(compareRecurringEntries);
  const representativeTask = tasks[0]?.task || null;
  const nextOpen = tasks.find((entry) => entry.task.status === "open") || null;
  const nextActionable = tasks.find((entry) => entry.task.status === "open" && !entry.blocked) || null;
  const completedEntries = tasks.filter((entry) => entry.task.status === "done");
  const skippedEntries = tasks.filter((entry) => entry.task.status === "skipped");
  const latestCompleted = completedEntries[completedEntries.length - 1] || null;
  const latestSkipped = skippedEntries[skippedEntries.length - 1] || null;
  const latestSkippedLifecycle = latestSkipped ? getLatestRecurringLifecycleEntry(latestSkipped.task, "skipped") : null;
  const completedCount = completedEntries.length;
  const skippedCount = skippedEntries.length;
  const totalCount = tasks.length;
  const isWidgetManaged = Boolean(representativeTask?.ownerWidgetType);
  const autoSkipped = latestSkippedLifecycle?.reason === "auto-skip"
    || isLikelyLegacyWorkoutAutoSkip(latestSkipped?.task || null);
  const autoSkipLabel = autoSkipped ? buildRecurringAutoSkipLabel(latestSkipped?.task || representativeTask) : "";
  const statusLabel = buildRecurringSeriesStatusLabel({
    representativeTask,
    nextOpen,
    nextActionable,
    completedCount,
    skippedCount,
    totalCount,
    isWidgetManaged,
    autoSkipped
  });

  return {
    key: entries[0]?.key || buildRecurringSeriesKey(representativeTask, getRecurringGroupKey(representativeTask)),
    tasks,
    representativeTask,
    displayName: representativeTask?.name || "Recurring task",
    completedCount,
    skippedCount,
    totalCount,
    progressLabel: `Completions: ${completedCount}/${totalCount}`,
    statusLabel,
    footerLabel: nextOpen
      ? (nextActionable ? `Next due ${describeTaskDate(nextOpen.task, (value) => value)}` : (nextOpen.blockedNote || "Waiting for this period to unlock."))
      : (autoSkipLabel || "This period is fully resolved."),
    nextDueLabel: nextOpen ? describeTaskDate(nextOpen.task, (value) => value) : "",
    nextActionDueLabel: nextActionable ? describeTaskDate(nextActionable.task, (value) => value) : "",
    blocked: Boolean(nextOpen && !nextActionable),
    blockedNote: nextOpen && !nextActionable ? (nextOpen.blockedNote || "Blocked") : "",
    deadlineState: nextActionable?.deadlineState || nextOpen?.deadlineState || "",
    isWidgetManaged,
    lockedNote: representativeTask?.ownerWidgetType
      ? `Managed in the ${representativeTask.ownerWidgetType} widget.`
      : "",
    autoSkipped,
    autoSkipLabel,
    nextOpenTaskId: nextOpen?.task.id || "",
    nextActionTaskId: nextActionable?.task.id || "",
    latestCompletedTaskId: latestCompleted?.task.id || "",
    latestSkippedTaskId: latestSkipped?.task.id || ""
  };
}

function compareRecurringSeriesCards(left, right) {
  const leftTask = left.representativeTask || {};
  const rightTask = right.representativeTask || {};
  const leftDate = leftTask.dueDate || leftTask.startDate || "9999-12-31";
  const rightDate = rightTask.dueDate || rightTask.startDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  const leftTime = leftTask.timeOfDay || "99:99";
  const rightTime = rightTask.timeOfDay || "99:99";
  if (leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }
  return left.displayName.localeCompare(right.displayName);
}

function buildRecurringSeriesStatusLabel({
  representativeTask,
  nextOpen,
  nextActionable,
  completedCount,
  skippedCount,
  totalCount,
  isWidgetManaged,
  autoSkipped
}) {
  if (isWidgetManaged) {
    return completedCount >= totalCount
      ? "Completed from the widget for this period."
      : `Track progress from the ${representativeTask.ownerWidgetType} widget.`;
  }
  if (!nextOpen) {
    if (completedCount === totalCount) {
      return "Completed for this period.";
    }
    if (autoSkipped) {
      return "Auto-skipped for this period.";
    }
    if (skippedCount === totalCount) {
      return "Skipped for this period.";
    }
    return "This period is fully resolved.";
  }
  if (!nextActionable) {
    return nextOpen.blockedNote || "Blocked";
  }
  return "Ready for the next completion in this period.";
}

function renderRecurringSeriesActions(series, escapeHtml) {
  if (series.isWidgetManaged) {
    return `
      <button type="button" class="canopy-task-icon complete" title="Managed by widget" aria-label="Managed by widget" data-help="${escapeHtml(`Complete ${series.displayName} from its widget.`)}" disabled>✓</button>
      <button type="button" class="canopy-task-icon skip" title="Managed by widget" aria-label="Managed by widget" data-help="${escapeHtml(`Skip ${series.displayName} from its widget.`)}" disabled>×</button>
    `;
  }

  const completeAction = series.nextOpenTaskId
    ? {
        action: "complete-group-task",
        taskId: series.nextOpenTaskId,
        active: false,
        disabled: !series.nextActionTaskId
      }
    : (series.latestCompletedTaskId
        ? {
            action: "reopen-group-task",
            taskId: series.latestCompletedTaskId,
            active: true,
            disabled: false
          }
        : null);

  const skipAction = series.nextOpenTaskId
    ? {
        action: "skip-group-task",
        taskId: series.nextOpenTaskId,
        active: false,
        disabled: !series.nextActionTaskId
      }
    : (series.latestSkippedTaskId
        ? {
            action: "reopen-group-task",
            taskId: series.latestSkippedTaskId,
            active: true,
            disabled: false
          }
        : null);

  return `
    <button
      type="button"
      class="canopy-task-icon complete${completeAction?.active ? " is-active" : ""}"
      data-canopy-action="${completeAction?.action || "complete-group-task"}"
      data-task-id="${escapeHtml(completeAction?.taskId || "")}"
      data-help="${escapeHtml(completeAction?.active ? `Mark ${series.displayName} incomplete for this period.` : `Complete the next ${series.displayName} instance.`)}"
      aria-label="${escapeHtml(completeAction?.active ? `Mark ${series.displayName} incomplete` : `Complete ${series.displayName}`)}"
      title="${escapeHtml(completeAction?.active ? "Mark incomplete" : "Complete")}"
      ${!completeAction || completeAction.disabled ? "disabled" : ""}
    >✓</button>
    <button
      type="button"
      class="canopy-task-icon skip${skipAction?.active ? " is-active" : ""}"
      data-canopy-action="${skipAction?.action || "skip-group-task"}"
      data-task-id="${escapeHtml(skipAction?.taskId || "")}"
      data-help="${escapeHtml(skipAction?.active ? `Mark the latest ${series.displayName} skip incomplete.` : `Skip the next ${series.displayName} instance.`)}"
      aria-label="${escapeHtml(skipAction?.active ? `Mark ${series.displayName} incomplete` : `Skip ${series.displayName}`)}"
      title="${escapeHtml(skipAction?.active ? "Mark incomplete" : "Skip")}"
      ${!skipAction || skipAction.disabled ? "disabled" : ""}
    >×</button>
  `;
}

function getTaskColumnKey(task, today, thisWeekCutoff, thisMonthCutoff = addDays(today, 30)) {
  const taskDate = task.dueDate || task.startDate || "";
  if (taskDate && taskDate <= today) {
    return "today";
  }
  if (taskDate && taskDate <= thisWeekCutoff) {
    return "week";
  }
  if (taskDate && taskDate <= thisMonthCutoff) {
    return "later";
  }
  return "";
}

function getLatestRecurringLifecycleEntry(task, type = "") {
  const history = Array.isArray(task?.history) ? task.history : [];
  let latest = null;
  for (const item of history) {
    if (!item || (type && item.type !== type)) {
      continue;
    }
    if (!latest || (item.at || 0) > (latest.at || 0)) {
      latest = item;
    }
  }
  return latest;
}

function buildRecurringAutoSkipLabel(task) {
  if (isLikelyLegacyWorkoutAutoSkip(task)) {
    return "Auto-skipped before day end. Restore it to complete it today.";
  }
  if (task?.widgetTaskKind === "workout-session") {
    return "Auto-skipped when this workout window closed.";
  }
  if (task?.skipRule?.type === "end-of-day") {
    return "Auto-skipped after the day ended.";
  }
  if (task?.skipRule?.type === "after-due-minutes") {
    return "Auto-skipped after its due window closed.";
  }
  return "Auto-skipped by schedule.";
}

function isLikelyLegacyWorkoutAutoSkip(task) {
  if (task?.widgetTaskKind !== "workout-session" || task?.skipRule?.policy !== "workout-next-window") {
    return false;
  }
  const date = task?.dueDate || task?.startDate || "";
  if (!date) {
    return false;
  }
  const cutoff = new Date(`${date}T23:59:59.999`).getTime();
  return Number.isFinite(cutoff) && Date.now() < cutoff && task.status === "skipped";
}

function getRecurringColumnKey(groupKey, task, today, thisWeekCutoff) {
  if (groupKey === "daily") {
    return "today";
  }
  if (groupKey === "weekly") {
    return "week";
  }
  if (groupKey === "monthly") {
    return "later";
  }
  return getTaskColumnKey(task, today, thisWeekCutoff);
}

function findColumn(columns, key) {
  return columns.find((column) => column.key === key) || columns[0];
}

function getRecurringGroupKey(task) {
  return getCanopyRecurringGroupKey(task);
}

function getBaseRecurringGroupKey(task) {
  if (!task?.recurrence || task.recurrence.type === "none") {
    return "";
  }
  if (task.recurrence.type === "daily" || task.recurrence.sourceType === "daily") {
    return "daily";
  }
  if (task.recurrence.type === "weekly" || task.recurrence.sourceType === "weekly") {
    return "weekly";
  }
  if (
    task.recurrence.type === "monthly-date"
    || task.recurrence.type === "monthly-weekday"
    || task.recurrence.sourceType === "monthly-date"
    || task.recurrence.sourceType === "monthly-weekday"
  ) {
    return "monthly";
  }
  return "";
}

function estimateOccurrencesPerWeek(task, baseGroupKey) {
  const interval = Math.max(1, Number(task?.recurrence?.interval || 1));
  const slotCount = Math.max(1, Number(task?.linkedSeries?.slotCount || 1));
  if (baseGroupKey === "daily") {
    return (7 * slotCount) / interval;
  }
  if (baseGroupKey === "weekly") {
    return slotCount / interval;
  }
  if (baseGroupKey === "monthly") {
    return 1 / Math.max(1, interval);
  }
  return 0;
}

function isCurrentRecurringPeriod(task, today) {
  const taskDate = task.dueDate || task.startDate || "";
  if (!taskDate) {
    return false;
  }

  const groupKey = getRecurringGroupKey(task);
  if (groupKey === "daily") {
    return taskDate === today;
  }
  if (groupKey === "weekly") {
    return taskDate >= startOfWeek(today) && taskDate <= endOfWeek(today);
  }
  if (groupKey === "monthly") {
    return taskDate.slice(0, 7) === today.slice(0, 7);
  }
  return false;
}

function startOfWeek(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() - date.getDay());
  return toDateString(date);
}

function endOfWeek(value) {
  return addDays(startOfWeek(value), 6);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareCanopyCards(left, right) {
  const leftDate = left.task.dueDate || left.task.startDate || "9999-12-31";
  const rightDate = right.task.dueDate || right.task.startDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const leftTime = left.task.timeOfDay || "99:99";
  const rightTime = right.task.timeOfDay || "99:99";
  if (leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }

  return left.displayName.localeCompare(right.displayName);
}

function describeTaskDate(task, formatDate) {
  const date = task.dueDate || task.startDate || "";
  if (date && task.timeOfDay) {
    return `${formatDate(date)} at ${task.timeOfDay}`;
  }
  if (date) {
    return formatDate(date);
  }
  return "No due date";
}

function renderCanopyMeta(task, escapeHtml, renderPriorityIndicator, surfacedRecurringGroup = "") {
  const categoryColor = escapeHtml(task.categoryColor || "#7dbf74");
  const category = task.categoryLabel || "Uncategorized";
  const points = formatPointsLabel(task.pointsValue);
  const lengthKey = normalizeLengthKey(task.length);
  const lengthLabel = LENGTH_ABBREVIATIONS[lengthKey];

  return `
    <div class="canopy-task-tags">
      <span class="canopy-chip length ${lengthKey}">${escapeHtml(lengthLabel)}</span>
      ${surfacedRecurringGroup ? `<span class="canopy-chip recurring ${surfacedRecurringGroup}">${escapeHtml(RECURRING_SERIES_BADGE_LABELS[surfacedRecurringGroup] || "Series")}</span>` : ""}
      <span class="canopy-chip category" style="--canopy-chip-color: ${categoryColor}">${escapeHtml(category)}</span>
      <span class="canopy-chip points" style="--canopy-chip-color: ${categoryColor}">${escapeHtml(points)}</span>
      ${renderPriorityIndicator(task.importance || "medium", "canopy")}
    </div>
  `;
}

function describeRecurringTaskStatus(task, blocked, blockedNote) {
  if (task.status === "done") {
    return "Completed for this period.";
  }
  if (task.status === "skipped") {
    return "Skipped for this period.";
  }
  if (blocked) {
    return blockedNote || "Blocked";
  }
  return "";
}

function formatPointsLabel(value) {
  const points = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

function normalizeLengthKey(value) {
  return LENGTH_ABBREVIATIONS[value] ? value : "medium";
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + days);
  return toDateString(date);
}
