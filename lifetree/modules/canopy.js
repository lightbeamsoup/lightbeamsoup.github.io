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
  const thisWeekCutoff = addDays(today, 6);

  for (const card of [...standardCards].sort(compareCanopyCards)) {
    findColumn(columns, getTaskColumnKey(card.task, today, thisWeekCutoff)).standardItems.push(card);
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
      tasks: []
    };
    existing.tasks.push(entry);
    column.recurringGroups.set(groupKey, existing);
  }

  return columns.map((column) => {
    const recurringGroups = [...column.recurringGroups.values()]
      .map((group) => ({
        ...group,
        tasks: group.tasks.sort(compareRecurringEntries),
        completedCount: group.tasks.filter((entry) => entry.task.status === "done").length
      }))
      .sort((left, right) => RECURRING_GROUP_ORDER.indexOf(left.key) - RECURRING_GROUP_ORDER.indexOf(right.key));
    const visibleStandardItems = column.standardItems.slice(0, 2);
    const hiddenStandardItems = column.standardItems.slice(2);
    return {
      ...column,
      totalCount: column.standardItems.length + recurringGroups.reduce((sum, group) => sum + group.tasks.length, 0),
      visibleStandardItems,
      hiddenStandardItems,
      recurringGroups
    };
  });
}

export function renderCanopyColumns(container, {
  columns,
  escapeHtml,
  formatDate,
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
        ${renderRecurringGroupRow(column, escapeHtml)}
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
      <div class="canopy-detail-list recurring">
        ${group.tasks.map((entry) => renderRecurringDetailTask(entry, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)).join("")}
      </div>
    `;
    return {
      title: `${column.label} · ${group.label}`,
      subtitle: `Current ${group.periodLabel}. Completed items stay here until the ${group.periodLabel} ends.`,
      footerNote: "Click a highlighted check or x again to mark a task incomplete."
    };
  }

  container.innerHTML = `
    <div class="canopy-detail-list">
      ${column.standardItems.length > 0
        ? column.standardItems.map((item) => renderCanopyTask(item, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)).join("")
        : '<p class="canopy-empty">No one-off tasks are queued here.</p>'}
    </div>
  `;
  return {
    title: `${column.label} tasks`,
    subtitle: "These one-off tasks leave the canopy as soon as they are completed or skipped.",
    footerNote: ""
  };
}

function renderRecurringGroupRow(column, escapeHtml) {
  if (column.recurringGroups.length === 0) {
    return "";
  }

  return `
    <div class="canopy-recurring-row">
      ${column.recurringGroups.map((group) => `
        <button
          type="button"
          class="canopy-group-card"
          data-canopy-action="open-group"
          data-column-key="${column.key}"
          data-group-key="${group.key}"
        >
          <strong>${escapeHtml(group.label)}</strong>
          <span>${group.completedCount}/${group.tasks.length} complete</span>
        </button>
      `).join("")}
    </div>
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
          ${renderCanopyMeta(item.task, escapeHtml, renderPriorityIndicator)}
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
    <article class="canopy-task${item.blocked ? " blocked" : ""}" style="--canopy-category-color: ${taskColor}">
      <div class="canopy-task-main">
        <strong>${escapeHtml(item.displayName)}</strong>
        <span>${escapeHtml(describeTaskDate(item.task, formatDate))}</span>
        ${item.blocked ? `<span class="canopy-task-status">${escapeHtml(item.blockedNote || "Blocked")}</span>` : ""}
        <div class="canopy-task-bottom">
          ${renderCanopyMeta(item.task, escapeHtml, renderPriorityIndicator)}
          <div class="canopy-task-actions">
          <button
            type="button"
            class="canopy-task-icon complete"
            data-canopy-action="complete"
            data-task-id="${item.task.id}"
            aria-label="Complete ${escapeHtml(item.displayName)}"
            title="Complete"
            ${item.blocked ? "disabled" : ""}
          >✓</button>
          <button
            type="button"
            class="canopy-task-icon skip"
            data-canopy-action="skip"
            data-task-id="${item.task.id}"
            aria-label="Skip ${escapeHtml(item.displayName)}"
            title="Skip"
          >×</button>
          <button
            type="button"
            class="canopy-task-icon edit"
            data-canopy-action="edit"
            data-task-id="${item.task.id}"
            aria-label="Edit ${escapeHtml(item.displayName)}"
            title="Edit"
          >…</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderRecurringDetailTask(entry, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator) {
  const { task } = entry;
  const taskColor = escapeHtml(task.categoryColor || "#7dbf74");
  const pendingAction = getPendingActionForTask(task.id);
  const isDone = task.status === "done";
  const isSkipped = task.status === "skipped";
  const blocked = !isDone && entry.blocked;

  if (pendingAction) {
    return `
      <article class="canopy-group-task pending" style="--canopy-category-color: ${taskColor}">
        <div class="canopy-group-main">
          <strong>${escapeHtml(task.name)}</strong>
          <span>${escapeHtml(describeTaskDate(task, formatDate))}</span>
          ${renderCanopyMeta(task, escapeHtml, renderPriorityIndicator)}
        </div>
        <div class="canopy-task-footer">
          <span class="canopy-task-status">${escapeHtml(pendingAction.description || "Pending action")}</span>
          <button type="button" class="canopy-task-undo" data-canopy-action="undo" data-task-id="${task.id}" data-pending-key="${pendingAction.key}">
            Undo
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="canopy-group-task${isDone ? " done" : ""}${isSkipped ? " skipped" : ""}${blocked ? " blocked" : ""}" style="--canopy-category-color: ${taskColor}">
      <div class="canopy-group-main">
        <strong>${escapeHtml(task.name)}</strong>
        <span>${escapeHtml(describeTaskDate(task, formatDate))}</span>
        ${renderCanopyMeta(task, escapeHtml, renderPriorityIndicator)}
        ${blocked ? `<span class="canopy-note">${escapeHtml(entry.blockedNote || "Blocked")}</span>` : ""}
      </div>
      <div class="canopy-task-footer">
        <span class="canopy-task-status">${escapeHtml(describeRecurringTaskStatus(task, blocked, entry.blockedNote || ""))}</span>
        <div class="canopy-task-actions">
          <button
            type="button"
            class="canopy-task-icon complete${isDone ? " is-active" : ""}"
            data-canopy-action="${isDone ? "reopen-group-task" : "complete-group-task"}"
            data-task-id="${task.id}"
            aria-label="${escapeHtml(isDone ? `Mark ${task.name} incomplete` : `Complete ${task.name}`)}"
            title="${escapeHtml(isDone ? "Mark incomplete" : "Complete")}"
            ${blocked || isSkipped ? "disabled" : ""}
          >✓</button>
          <button
            type="button"
            class="canopy-task-icon skip${isSkipped ? " is-active" : ""}"
            data-canopy-action="${isSkipped ? "reopen-group-task" : "skip-group-task"}"
            data-task-id="${task.id}"
            aria-label="${escapeHtml(isSkipped ? `Mark ${task.name} incomplete` : `Skip ${task.name}`)}"
            title="${escapeHtml(isSkipped ? "Mark incomplete" : "Skip")}"
            ${isDone ? "disabled" : ""}
          >×</button>
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

function getTaskColumnKey(task, today, thisWeekCutoff) {
  const taskDate = task.dueDate || task.startDate || "";
  if (taskDate && taskDate <= today) {
    return "today";
  }
  if (taskDate && taskDate <= thisWeekCutoff) {
    return "week";
  }
  return "later";
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

function renderCanopyMeta(task, escapeHtml, renderPriorityIndicator) {
  const categoryColor = escapeHtml(task.categoryColor || "#7dbf74");
  const category = task.categoryLabel || "Uncategorized";
  const points = formatPointsLabel(task.pointsValue);
  const lengthKey = normalizeLengthKey(task.length);
  const lengthLabel = LENGTH_ABBREVIATIONS[lengthKey];

  return `
    <div class="canopy-task-tags">
      <span class="canopy-chip length ${lengthKey}">${escapeHtml(lengthLabel)}</span>
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
