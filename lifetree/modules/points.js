export const DEFAULT_MAX_TASK_POINTS = 10;
export const DEFAULT_MAX_POINT_HISTORY_ENTRIES = 50;
export const MAX_POINT_HISTORY_ENTRIES = 50;
export const POINT_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const LENGTH_POINT_DEFAULTS = {
  "very-short": 1,
  short: 2,
  medium: 3,
  long: 4,
  "very-long": 5
};

export function defaultPointsForLength(length = "medium") {
  return LENGTH_POINT_DEFAULTS[length] || LENGTH_POINT_DEFAULTS.medium;
}

export function normalizeTaskPoints(value, fallback = defaultPointsForLength("medium"), max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.max(0, Math.min(Math.max(0, max), safe));
}

export function formatPointsLabel(value) {
  const points = normalizeTaskPoints(value, 0, 1000);
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

export function formatSignedPointsLabel(value) {
  const numeric = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  const absolute = Math.abs(numeric);
  return `${numeric < 0 ? "-" : numeric > 0 ? "+" : ""}${absolute} ${absolute === 1 ? "pt" : "pts"}`;
}

export function normalizeDevSettings(value) {
  const numeric = Number(value?.maxTaskPoints);
  const maxTaskPoints = Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric)
    : DEFAULT_MAX_TASK_POINTS;
  const pointHistoryNumeric = Number(value?.maxPointHistoryEntries);
  const maxPointHistoryEntries = Number.isFinite(pointHistoryNumeric) && pointHistoryNumeric > 0
    ? Math.round(pointHistoryNumeric)
    : DEFAULT_MAX_POINT_HISTORY_ENTRIES;
  return {
    maxTaskPoints: Math.max(1, Math.min(50, maxTaskPoints)),
    maxPointHistoryEntries: Math.max(1, Math.min(MAX_POINT_HISTORY_ENTRIES, maxPointHistoryEntries))
  };
}

export function normalizePointLedger(
  value,
  { defaultCategoryKey, normalizeCategoryColor, resolveCategorySnapshot }
) {
  return normalizePointEntries(value, { defaultCategoryKey, normalizeCategoryColor, resolveCategorySnapshot });
}

export function normalizePointHistory(
  value,
  {
    defaultCategoryKey,
    normalizeCategoryColor,
    resolveCategorySnapshot,
    maxEntries = DEFAULT_MAX_POINT_HISTORY_ENTRIES,
    now = Date.now()
  }
) {
  return trimPointHistoryEntries(
    normalizePointEntries(value, { defaultCategoryKey, normalizeCategoryColor, resolveCategorySnapshot }),
    { maxEntries, now }
  );
}

export function mergePointHistory(localEntries = [], remoteEntries = [], options) {
  const mergedById = new Map();
  for (const entry of normalizePointEntries(remoteEntries, options)) {
    mergedById.set(entry.id, entry);
  }
  for (const entry of normalizePointEntries(localEntries, options)) {
    if (!mergedById.has(entry.id)) {
      mergedById.set(entry.id, entry);
    }
  }
  return trimPointHistoryEntries(Array.from(mergedById.values()), options);
}

function normalizePointEntries(
  value,
  { defaultCategoryKey, normalizeCategoryColor, resolveCategorySnapshot }
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const fallbackCategory = resolveCategorySnapshot(defaultCategoryKey);
  return value
    .filter((entry) => typeof entry?.id === "string" && typeof entry?.at === "number")
    .map((entry) => {
      const categoryKey = typeof entry.categoryKey === "string" ? entry.categoryKey : defaultCategoryKey;
      const categorySnapshot = resolveCategorySnapshot(categoryKey);
      return {
        id: entry.id,
        taskId: typeof entry.taskId === "string" ? entry.taskId : "",
        taskName: typeof entry.taskName === "string" ? entry.taskName : "",
        at: entry.at,
        points: normalizeTaskPoints(entry.points, 0, 1000),
        categoryKey,
        categoryLabel: typeof entry.categoryLabel === "string"
          ? entry.categoryLabel
          : (categorySnapshot.label || fallbackCategory.label),
        categoryColor: normalizeCategoryColor(
          entry.categoryColor || categorySnapshot.color || fallbackCategory.color
        ),
        dueDate: typeof entry.dueDate === "string" ? entry.dueDate : "",
        timeOfDay: typeof entry.timeOfDay === "string" ? entry.timeOfDay : "",
        sourceKey: typeof entry.sourceKey === "string" ? entry.sourceKey : "",
        sourceType: typeof entry.sourceType === "string" ? entry.sourceType : "manual",
        sourceLabel: typeof entry.sourceLabel === "string" ? entry.sourceLabel : "Manual task"
      };
    })
    .sort((left, right) => left.at - right.at);
}

export function mergePointLedger(localEntries = [], remoteEntries = [], options) {
  const mergedById = new Map();
  for (const entry of normalizePointEntries(remoteEntries, options)) {
    mergedById.set(entry.id, entry);
  }
  for (const entry of normalizePointEntries(localEntries, options)) {
    if (!mergedById.has(entry.id)) {
      mergedById.set(entry.id, entry);
    }
  }
  return Array.from(mergedById.values()).sort((left, right) => left.at - right.at);
}

export function normalizeTreeState(value, { normalizeTreeStyleState, slugifyCategoryKey }) {
  return {
    harvestedByCategory: normalizeTreePointMap(value?.harvestedByCategory, { slugifyCategoryKey }),
    devFruitPoints: normalizeTreePointMap(value?.devFruitPoints, { allowNegative: true, slugifyCategoryKey }),
    styleState: normalizeTreeStyleState(value?.styleState),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  };
}

export function choosePreferredTreeState(localTreeState, remoteTreeState, options) {
  const local = normalizeTreeState(localTreeState, options);
  const remote = normalizeTreeState(remoteTreeState, options);
  return (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
}

export function buildTaskPointEntry(
  task,
  {
    at = Date.now(),
    id = "",
    createId,
    normalizeCategoryColor,
    defaultCategoryKey,
    resolveCategorySnapshot,
    ownerWidgetLabel
  }
) {
  const points = normalizeTaskPoints(task.pointsValue, 0, 1000);
  if (points <= 0) {
    return null;
  }

  const category = resolveCategorySnapshot(task.categoryKey || defaultCategoryKey, task);
  return {
    id: id || createId(),
    taskId: task.id,
    taskName: task.name,
    at,
    points,
    categoryKey: category.key,
    categoryLabel: task.categoryLabel || category.label,
    categoryColor: normalizeCategoryColor(task.categoryColor || category.color),
    dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
    timeOfDay: typeof task.timeOfDay === "string" ? task.timeOfDay : "",
    sourceKey: task.ownerWidgetType
      ? `${task.ownerWidgetType}:${task.ownerTaskKey || task.name}`
      : `task:${task.id}`,
    sourceType: task.ownerWidgetType || "task",
    sourceLabel: task.ownerWidgetType
      ? `${ownerWidgetLabel(task)} · ${task.name}`
      : task.name
  };
}

export function renderDeveloperPointsSummary(summary, { escapeHtml }) {
  return `
    <div class="developer-points-total">
      <strong>${summary.totalPoints}</strong>
      <span>Total points tracked</span>
    </div>
    <div class="developer-points-grid">
      <section class="developer-points-section">
        <h3>By category</h3>
        <div class="developer-point-list">
          ${summary.byCategory.length > 0 ? summary.byCategory.map((entry) => `
            <div class="developer-point-item">
              <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(entry.color)}">${escapeHtml(entry.label)}</span>
              <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(entry.color)}">${escapeHtml(formatPointsLabel(entry.points))}</span>
            </div>
          `).join("") : '<p class="task-action-note">No points recorded yet.</p>'}
        </div>
      </section>
      <section class="developer-points-section">
        <h3>By source</h3>
        <div class="developer-point-list">
          ${summary.bySource.length > 0 ? summary.bySource.map((entry) => `
            <div class="developer-point-item source">
              <span>${escapeHtml(entry.label)}</span>
              <strong>${escapeHtml(formatPointsLabel(entry.points))}</strong>
            </div>
          `).join("") : '<p class="task-action-note">No point sources yet.</p>'}
        </div>
      </section>
    </div>
  `;
}

export function renderDeveloperFruitSummary(treeState, { escapeHtml }) {
  const adjustedCategories = treeState.categories.filter((category) => category.adjustmentPoints !== 0);
  const bankedCategories = treeState.categories.filter((category) => category.bankedPoints > 0);
  return `
    <div class="developer-fruit-total">
      <strong>${escapeHtml(formatPointsLabel(treeState.ripePoints))}</strong>
      <span>ready to harvest right now</span>
    </div>
    <div class="developer-fruit-list">
      ${bankedCategories.length > 0 ? bankedCategories.map((category) => `
        <div class="developer-point-item source">
          <span>${escapeHtml(category.label)} banked</span>
          <strong>${escapeHtml(formatPointsLabel(category.bankedPoints))}</strong>
        </div>
      `).join("") : '<p class="task-action-note">No banked fruit points yet.</p>'}
    </div>
    <div class="developer-fruit-list">
      ${adjustedCategories.length > 0 ? adjustedCategories.map((category) => `
        <div class="developer-point-item source">
          <span>${escapeHtml(category.label)} adjustment</span>
          <strong>${escapeHtml(formatSignedPointsLabel(category.adjustmentPoints))}</strong>
        </div>
      `).join("") : '<p class="task-action-note">No fruit testing adjustments are active.</p>'}
    </div>
  `;
}

function normalizeTreePointMap(value, { allowNegative = false, slugifyCategoryKey }) {
  const result = {};
  if (!value || typeof value !== "object") {
    return result;
  }

  for (const [key, raw] of Object.entries(value)) {
    const categoryKey = slugifyCategoryKey(key);
    if (!categoryKey) {
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const rounded = Math.round(numeric);
    const safe = allowNegative ? rounded : Math.max(0, rounded);
    if (safe !== 0) {
      result[categoryKey] = safe;
    }
  }

  return result;
}

function trimPointHistoryEntries(
  entries,
  {
    maxEntries = DEFAULT_MAX_POINT_HISTORY_ENTRIES,
    now = Date.now(),
    maxAgeMs = POINT_HISTORY_WINDOW_MS
  } = {}
) {
  const latestAllowedAt = Math.max(0, now - maxAgeMs);
  const normalizedMaxEntries = Math.max(1, Math.min(MAX_POINT_HISTORY_ENTRIES, Math.round(Number(maxEntries) || DEFAULT_MAX_POINT_HISTORY_ENTRIES)));
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => typeof entry?.at === "number" && entry.at >= latestAllowedAt)
    .sort((left, right) => left.at - right.at)
    .slice(-normalizedMaxEntries);
}
