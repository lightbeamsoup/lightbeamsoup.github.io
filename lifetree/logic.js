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

export function buildHistoryFeed(tasks, sortMode = "newest", filterType = "all") {
  const entries = [];

  for (const task of tasks) {
    const history = Array.isArray(task.history) ? task.history : [];
    for (const item of history) {
      if (filterType !== "all" && item.type !== filterType) {
        continue;
      }
      entries.push({
        taskId: task.id,
        taskName: task.name,
        at: item.at,
        type: item.type,
        status: task.status,
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

export function createArchivedSeriesRecord(template) {
  return {
    ...template,
    id: `${template.id}::archived`,
    templateId: "",
    occurrenceIndex: 0,
    archived: true,
    seriesOriginId: template.id,
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

export function shouldAutoSkipTask(task, now = new Date()) {
  if (!task || task.status !== "open" || task.archived) {
    return false;
  }

  const skipType = task.skipRule?.type || "none";
  if (skipType === "none" || skipType === "widget-lockout") {
    return false;
  }

  if (skipType === "end-of-day") {
    const cutoff = buildTaskDateTime(task, "23:59");
    return Boolean(cutoff && now > cutoff);
  }

  if (skipType === "after-due-minutes") {
    const dueAt = buildTaskDateTime(task, "23:59");
    const graceMinutes = Number(task.skipRule?.graceMinutes || 0);
    return Boolean(dueAt && now.getTime() >= dueAt.getTime() + Math.max(graceMinutes, 0) * 60_000);
  }

  return false;
}
