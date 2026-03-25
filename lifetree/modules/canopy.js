export function renderCanopyColumns(container, {
  cards,
  today,
  escapeHtml,
  formatDate,
  getPendingActionForTask,
  renderPriorityIndicator
}) {
  const groups = groupCanopyCards(cards, today);

  container.innerHTML = groups.map((group) => `
    <section class="canopy-column">
      <div class="canopy-column-header">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.items.length}</span>
      </div>
      <div class="canopy-list">
        ${group.items.length > 0 ? group.items.map((item) => `
          ${renderCanopyTask(item, formatDate, escapeHtml, getPendingActionForTask, renderPriorityIndicator)}
        `).join("") : '<p class="canopy-empty">No tasks queued.</p>'}
        ${group.moreCount > 0 ? `<p class="canopy-more">+${group.moreCount} more in Task Desk</p>` : ""}
      </div>
    </section>
  `).join("");
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
          <span class="canopy-complete-hint">${escapeHtml(pendingAction.description || "Pending action")}</span>
        </div>
        <button type="button" class="canopy-task-skip" data-canopy-action="undo" data-task-id="${item.task.id}" data-pending-key="${pendingAction.key}">
          Undo
        </button>
      </article>
    `;
  }

  return `
    <article class="canopy-task${item.blocked ? " blocked" : ""}" style="--canopy-category-color: ${taskColor}">
      <button type="button" class="canopy-task-main" data-canopy-action="complete" data-task-id="${item.task.id}" ${item.blocked ? "disabled" : ""}>
        <strong>${escapeHtml(item.displayName)}</strong>
        <span>${escapeHtml(describeTaskDate(item.task, formatDate))}</span>
        ${renderCanopyMeta(item.task, escapeHtml, renderPriorityIndicator)}
        ${!item.blocked ? '<span class="canopy-complete-hint">Click to mark complete</span>' : ""}
      </button>
      <div class="canopy-task-actions">
        <button type="button" class="canopy-task-skip" data-canopy-action="skip" data-task-id="${item.task.id}">
          Skip
        </button>
        <button type="button" class="canopy-task-edit" data-canopy-action="edit" data-task-id="${item.task.id}">
          Edit
        </button>
      </div>
      ${item.blocked ? `<span class="canopy-note">${escapeHtml(item.blockedNote || "Blocked")}</span>` : ""}
    </article>
  `;
}

function groupCanopyCards(cards, today) {
  const columns = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Longer term", items: [] }
  ];

  const thisWeekCutoff = addDays(today, 6);
  const sorted = [...cards].sort(compareCanopyCards);

  for (const card of sorted) {
    const taskDate = card.task.dueDate || card.task.startDate || "";
    if (taskDate && taskDate <= today) {
      columns[0].items.push(card);
      continue;
    }
    if (taskDate && taskDate <= thisWeekCutoff) {
      columns[1].items.push(card);
      continue;
    }
    columns[2].items.push(card);
  }

  return columns.map((column) => ({
    ...column,
    moreCount: Math.max(column.items.length - 4, 0),
    items: column.items.slice(0, 4)
  }));
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

  return `
    <div class="canopy-task-tags">
      <span class="canopy-chip" style="--canopy-chip-color: ${categoryColor}">${escapeHtml(category)}</span>
      <span class="canopy-chip points" style="--canopy-chip-color: ${categoryColor}">${escapeHtml(points)}</span>
      ${renderPriorityIndicator(task.importance || "medium", "canopy")}
    </div>
  `;
}

function formatPointsLabel(value) {
  const points = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
