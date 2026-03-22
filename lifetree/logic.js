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
