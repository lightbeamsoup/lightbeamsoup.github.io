export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function moveToWeekday(date, weekday) {
  const diff = weekday - date.getDay();
  date.setDate(date.getDate() + diff);
}

export function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  if (ordinal === "last") {
    const date = new Date(year, month + 1, 0, 12, 0, 0);
    while (date.getDay() !== weekday) {
      date.setDate(date.getDate() - 1);
    }
    return toDateString(date);
  }

  const positions = { first: 1, second: 2, third: 3, fourth: 4 };
  const occurrence = positions[ordinal] || 1;
  const date = new Date(year, month, 1, 12, 0, 0);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() + 1);
  }
  date.setDate(date.getDate() + (occurrence - 1) * 7);
  return toDateString(date);
}

export function computeOccurrenceDate(baseDate, recurrence, offset) {
  const date = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (recurrence.type === "daily") {
    date.setDate(date.getDate() + offset);
    return toDateString(date);
  }
  if (recurrence.type === "weekly") {
    date.setDate(date.getDate() + offset * 7 * recurrence.interval);
    moveToWeekday(date, recurrence.weekday);
    return toDateString(date);
  }
  if (recurrence.type === "monthly-date") {
    date.setMonth(date.getMonth() + offset * recurrence.interval, recurrence.day);
    return toDateString(date);
  }
  if (recurrence.type === "monthly-weekday") {
    const target = new Date(date.getFullYear(), date.getMonth() + offset * (recurrence.interval || 1), 1, 12, 0, 0);
    return nthWeekdayOfMonth(target.getFullYear(), target.getMonth(), recurrence.weekday, recurrence.ordinal);
  }

  return "";
}

export function describeTaskInstanceLabel(task) {
  const slotIndex = Number.isInteger(task?.linkedSeries?.slotIndex) ? task.linkedSeries.slotIndex : -1;
  const slotCount = Number.isInteger(task?.linkedSeries?.slotCount) ? task.linkedSeries.slotCount : 0;
  if (slotIndex < 0 || slotCount <= 1) {
    return "";
  }
  return `${slotIndex + 1}/${slotCount}`;
}

export function formatTaskDisplayName(task) {
  const name = String(task?.name || "Untitled task");
  const instanceLabel = describeTaskInstanceLabel(task);
  return instanceLabel ? `${name} · ${instanceLabel}` : name;
}

export function buildHistoryFeed(tasks, sortMode = "newest", filterType = "all") {
  const entries = [];

  for (const task of tasks) {
    const history = Array.isArray(task.history) ? task.history : [];
    for (const item of history) {
      if (item.type === "edited") {
        continue;
      }
      if (filterType !== "all" && item.type !== filterType) {
        continue;
      }
      const dueAt = getTaskDueTimestamp(task);
      const timing = describeHistoryTiming(item, dueAt, task.lateGraceMinutes);
      entries.push({
        taskId: task.id,
        historyId: item.id || "",
        taskName: formatTaskDisplayName(task),
        at: item.at,
        type: item.type,
        status: task.status,
        archived: task.archived === true,
        ownerWidgetId: task.ownerWidgetId || "",
        ownerWidgetType: task.ownerWidgetType || "",
        dueDate: task.dueDate || task.startDate || "",
        timeOfDay: task.timeOfDay || "",
        scheduledLabel: describeScheduledLabel(task),
        timingStatus: timing.status,
        timingLabel: timing.label,
        summary: `${task.name} was ${item.type}`
      });
    }
  }

  entries.sort((left, right) => {
    if (sortMode === "oldest") {
      return left.at - right.at;
    }
    if (sortMode === "task-name") {
      return left.taskName.localeCompare(right.taskName) || right.at - left.at;
    }
    return right.at - left.at;
  });

  return entries;
}

export function getLatestLifecycleEntry(task) {
  const history = Array.isArray(task?.history) ? task.history : [];
  let latest = null;
  for (const item of history) {
    if (!item || (item.type !== "completed" && item.type !== "skipped" && item.type !== "reopened")) {
      continue;
    }
    if (!latest || (item.at || 0) > (latest.at || 0)) {
      latest = item;
    }
  }
  return latest;
}

export function compareTaskResolutionPreference(leftTask, rightTask) {
  const leftLatest = getLatestLifecycleEntry(leftTask);
  const rightLatest = getLatestLifecycleEntry(rightTask);
  const leftType = effectiveLifecycleType(leftTask, leftLatest);
  const rightType = effectiveLifecycleType(rightTask, rightLatest);

  if (leftType !== rightType) {
    if (leftType === "completed" && rightType === "skipped") {
      return 1;
    }
    if (leftType === "skipped" && rightType === "completed") {
      return -1;
    }
  }

  if (leftLatest && rightLatest && (leftLatest.at || 0) !== (rightLatest.at || 0)) {
    return (leftLatest.at || 0) - (rightLatest.at || 0);
  }
  if (leftLatest && !rightLatest) {
    return 1;
  }
  if (!leftLatest && rightLatest) {
    return -1;
  }

  const leftRank = resolutionRank(leftTask?.status, leftLatest?.type);
  const rightRank = resolutionRank(rightTask?.status, rightLatest?.type);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftHistoryCount = Array.isArray(leftTask?.history) ? leftTask.history.length : 0;
  const rightHistoryCount = Array.isArray(rightTask?.history) ? rightTask.history.length : 0;
  if (leftHistoryCount !== rightHistoryCount) {
    return leftHistoryCount - rightHistoryCount;
  }

  return (leftTask?.createdAt || 0) - (rightTask?.createdAt || 0);
}

export function buildLogicalWidgetTaskKey(task) {
  const identityKey = task?.ownerWidgetType === "energy" && (task?.dueDate || task?.startDate || task?.timeOfDay)
    ? ""
    : (task?.ownerTaskKey || task?.name || "");
  return [
    task?.ownerWidgetType || "manual",
    task?.templateId ? "generated" : (task?.recurrence?.type !== "none" ? "template" : "single"),
    identityKey,
    task?.templateId || "",
    Number.isFinite(task?.occurrenceIndex) ? task.occurrenceIndex : 0,
    task?.startDate || "",
    task?.dueDate || "",
    task?.timeOfDay || ""
  ].join("|");
}

export function compactTaskHistory(history = []) {
  const compacted = [];
  let lifecycleState = "open";
  for (const item of Array.isArray(history) ? history : []) {
    if (!item?.id) {
      continue;
    }
    const previous = compacted[compacted.length - 1] || null;
    if (previous && previous.type === item.type) {
      compacted[compacted.length - 1] = item;
      continue;
    }

    if (item.type === "completed" || item.type === "skipped") {
      if (lifecycleState !== "open") {
        continue;
      }
      compacted.push(item);
      lifecycleState = item.type === "completed" ? "done" : "skipped";
      continue;
    }

    if (item.type === "reopened") {
      if (lifecycleState === "open") {
        continue;
      }
      compacted.push(item);
      lifecycleState = "open";
      continue;
    }

    compacted.push(item);
  }
  return compacted;
}

function resolutionRank(status = "open", latestType = "") {
  if (latestType === "reopened") {
    return 1;
  }
  if (latestType === "completed" || status === "done") {
    return 3;
  }
  if (latestType === "skipped" || status === "skipped") {
    return 2;
  }
  return 1;
}

function effectiveLifecycleType(task, latestEntry) {
  if (latestEntry?.type === "completed" || latestEntry?.type === "skipped" || latestEntry?.type === "reopened") {
    return latestEntry.type;
  }
  if (task?.status === "done") {
    return "completed";
  }
  if (task?.status === "skipped") {
    return "skipped";
  }
  return "reopened";
}

function getTaskDueTimestamp(task) {
  const dueDate = task.dueDate || task.startDate || "";
  if (!dueDate) {
    return null;
  }
  const timeOfDay = task.timeOfDay || "23:59";
  const timestamp = new Date(`${dueDate}T${timeOfDay}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function describeScheduledLabel(task) {
  const date = task.dueDate || task.startDate || "";
  if (!date && !task.timeOfDay) {
    return "";
  }
  if (date && task.timeOfDay) {
    return `Due ${formatHistoryDate(date)} at ${formatHistoryTime(task.timeOfDay)}`;
  }
  if (date) {
    return `Due ${formatHistoryDate(date)}`;
  }
  return `Due at ${formatHistoryTime(task.timeOfDay)}`;
}

function describeHistoryTiming(item, dueAt, lateGraceMinutes = 15) {
  if (!dueAt) {
    return { status: "", label: "" };
  }
  const graceCutoff = dueAt + Math.max(Number(lateGraceMinutes) || 0, 0) * 60_000;
  if (item.type === "completed") {
    return item.at <= graceCutoff
      ? { status: "on-time", label: "On time" }
      : { status: "late", label: "Completed late" };
  }
  if (item.type === "skipped") {
    if (item.at <= dueAt) {
      return { status: "neutral", label: "Skipped before due time" };
    }
    return item.at <= graceCutoff
      ? { status: "neutral", label: "Skipped within grace period" }
      : { status: "missed", label: "Missed due time" };
  }
  return { status: "", label: "" };
}

function formatHistoryDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function formatHistoryTime(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return value;
  }
  return new Date(2000, 0, 1, hour, minute, 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function createArchivedSeriesRecord(template) {
  const originId = String(template.seriesOriginId || template.id || "").replace(/(::archived)+$/, "");
  return {
    ...template,
    id: `${originId}::archived`,
    templateId: "",
    occurrenceIndex: 0,
    archived: true,
    seriesOriginId: originId,
    recurrence: { type: "archived-series" }
  };
}

export function taskScheduleKey(task) {
  return task.dueDate || task.startDate || "";
}

export function compareTaskSchedule(left, right) {
  const leftDate = taskScheduleKey(left);
  const rightDate = taskScheduleKey(right);

  if (leftDate !== rightDate) {
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return leftDate.localeCompare(rightDate);
  }

  const leftTime = left.timeOfDay || "";
  const rightTime = right.timeOfDay || "";
  if (leftTime !== rightTime) {
    if (!leftTime) return 1;
    if (!rightTime) return -1;
    return leftTime.localeCompare(rightTime);
  }

  const leftIndex = Number.isFinite(left.occurrenceIndex) ? left.occurrenceIndex : 0;
  const rightIndex = Number.isFinite(right.occurrenceIndex) ? right.occurrenceIndex : 0;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return (left.createdAt || 0) - (right.createdAt || 0);
}

export function computeRecurringNotBeforeAt(recurrenceType, scheduledDate) {
  if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return 0;
  }

  const base = new Date(`${scheduledDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return 0;
  }

  if (recurrenceType === "weekly") {
    base.setDate(base.getDate() - base.getDay());
    return base.getTime();
  }

  if (recurrenceType === "monthly-date" || recurrenceType === "monthly-weekday") {
    base.setDate(1);
    return base.getTime();
  }

  if (recurrenceType === "daily") {
    return base.getTime();
  }

  return 0;
}

export function isTaskEligibleForWidgetCompletion(task, today = toDateString(new Date())) {
  if (!task || task.status !== "open" || task.archived) {
    return false;
  }

  const mechanism = task.widgetCompletion?.mechanism || "";
  if (!mechanism) {
    return false;
  }

  const lockout = task.widgetCompletion?.lockout || "none";
  if (lockout === "current-day") {
    const scheduledDate = taskScheduleKey(task);
    return !scheduledDate || scheduledDate <= today;
  }

  return true;
}

export function findNextWidgetCompletionTask(tasks, widgetId, mechanism, today = toDateString(new Date())) {
  return [...tasks]
    .filter((task) => task.ownerWidgetId === widgetId && task.widgetCompletion?.mechanism === mechanism)
    .filter((task) => isTaskEligibleForWidgetCompletion(task, today))
    .sort(compareTaskSchedule)[0] || null;
}

function buildTaskDateTime(task, fallbackTime = "23:59") {
  const date = taskScheduleKey(task);
  if (!date) {
    return null;
  }
  const time = task.timeOfDay || fallbackTime;
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number.isFinite(hours) ? hours : 23,
    Number.isFinite(minutes) ? minutes : 59,
    0,
    0
  );
}

function buildTaskDayEndDateTime(task) {
  const date = taskScheduleKey(task);
  if (!date) {
    return null;
  }
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    23,
    59,
    59,
    999
  );
}

export function shouldAutoSkipTask(task, now = new Date()) {
  if (!task || task.status !== "open" || task.archived) {
    return false;
  }

  const skipType = task.skipRule?.type || "none";
  if (skipType === "none" || skipType === "widget-lockout") {
    return false;
  }

  if (skipType === "end-of-day") {
    const cutoff = buildTaskDayEndDateTime(task);
    return Boolean(cutoff && now > cutoff);
  }

  if (skipType === "after-due-minutes") {
    const dueAt = buildTaskDateTime(task, "23:59");
    const graceMinutes = Number(task.skipRule?.graceMinutes || 0);
    return Boolean(dueAt && now.getTime() >= dueAt.getTime() + Math.max(graceMinutes, 0) * 60_000);
  }

  return false;
}
