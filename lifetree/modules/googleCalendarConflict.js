import { createArchivedSeriesRecord } from "../logic.js";
import { normalizeGoogleCalendarTaskLink } from "./googleCalendarTasks.js";

function hasTaskHistory(task) {
  return Array.isArray(task?.history) && task.history.length > 0;
}

function touchTask(task, now) {
  task.updatedAt = Math.max(Number(now) || 0, task.updatedAt || 0, task.createdAt || 0);
}

function clearGoogleCalendarLink(task, now) {
  task.googleCalendar = normalizeGoogleCalendarTaskLink({}, {
    calendarId: task?.googleCalendar?.calendarId || ""
  });
  touchTask(task, now);
}

function mergeHistoryEntries(leftValue, rightValue) {
  const merged = new Map();
  for (const item of [...(Array.isArray(leftValue) ? leftValue : []), ...(Array.isArray(rightValue) ? rightValue : [])]) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const key = typeof item.id === "string" && item.id
      ? item.id
      : `${item.type || ""}:${item.at || 0}:${item.reason || ""}`;
    const existing = merged.get(key);
    if (!existing || (item.at || 0) >= (existing.at || 0)) {
      merged.set(key, item);
    }
  }
  return Array.from(merged.values()).sort((left, right) => (left.at || 0) - (right.at || 0));
}

function upsertArchivedSeriesClone(tasks, template, now) {
  const archivedRecord = createArchivedSeriesRecord({
    ...template,
    archived: true,
    googleCalendar: normalizeGoogleCalendarTaskLink({}, {
      calendarId: template?.googleCalendar?.calendarId || ""
    }),
    updatedAt: Math.max(Number(now) || 0, template?.updatedAt || 0, template?.createdAt || 0)
  });
  const existingIndex = tasks.findIndex((task) => task?.id === archivedRecord.id);
  if (existingIndex === -1) {
    tasks.push(archivedRecord);
    return 1;
  }
  const existing = tasks[existingIndex];
  tasks[existingIndex] = {
    ...existing,
    ...archivedRecord,
    history: mergeHistoryEntries(existing?.history, archivedRecord.history)
  };
  return 0;
}

export function shouldTreatMissingLinkedGoogleCalendarEventAsRemoteDeletion(task, {
  linkedEventMissing = false,
  canonicalEvent = null
} = {}) {
  const recurrenceType = String(task?.recurrence?.type || "none");
  const linkedEventId = typeof task?.googleCalendar?.eventId === "string"
    ? task.googleCalendar.eventId
    : "";
  const isRecurringMaster = Boolean(
    !task?.templateId
    && recurrenceType !== "none"
    && recurrenceType !== "generated"
    && recurrenceType !== "archived-series"
  );
  const shouldRecreateLocally = task?.archived !== true
    && task?.historyOnly !== true
    && (task?.status === "open" || isRecurringMaster);
  return Boolean(
    linkedEventMissing
    && linkedEventId
    && !canonicalEvent
    && task?.needsPush !== true
    && task?.needsStatusPush !== true
    && !shouldRecreateLocally
  );
}

export function applyRemoteDeletedGoogleCalendarTask(store, taskId, {
  now = Date.now(),
  addDeletionMarker = null
} = {}) {
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const target = tasks.find((task) => task?.id === taskId) || null;
  if (!target) {
    return { changed: false, removedCount: 0, archivedCount: 0, recurring: false };
  }

  const removedIds = new Set();
  let archivedCount = 0;
  const recurrenceType = String(target?.recurrence?.type || "none");
  const isRecurringTemplate = !target.templateId
    && recurrenceType !== "none"
    && recurrenceType !== "generated"
    && recurrenceType !== "archived-series";

  if (isRecurringTemplate) {
    if (typeof addDeletionMarker === "function") {
      addDeletionMarker("series-id", target.id, now);
    }
    if (target.status !== "open" || hasTaskHistory(target)) {
      archivedCount += upsertArchivedSeriesClone(tasks, target, now);
    }
    removedIds.add(target.id);

    for (const task of tasks) {
      if (!task || task.id === target.id || task.templateId !== target.id) {
        continue;
      }
      clearGoogleCalendarLink(task, now);
      if (task.status === "open" && !hasTaskHistory(task)) {
        removedIds.add(task.id);
      } else {
        task.archived = true;
        archivedCount += 1;
      }
    }
  } else {
    if (target.status === "open" && !hasTaskHistory(target)) {
      if (typeof addDeletionMarker === "function") {
        addDeletionMarker("task-id", target.id, now);
      }
      removedIds.add(target.id);
    } else {
      clearGoogleCalendarLink(target, now);
      target.archived = true;
      touchTask(target, now);
      archivedCount += 1;
    }
  }

  if (removedIds.size > 0) {
    store.tasks = tasks.filter((task) => !removedIds.has(task.id));
    for (const task of store.tasks) {
      task.dependencies = Array.isArray(task.dependencies)
        ? task.dependencies.filter((dependencyId) => !removedIds.has(dependencyId))
        : [];
      if (removedIds.has(task.sequenceDependencyId)) {
        task.sequenceDependencyId = "";
      }
    }
  }

  return {
    changed: removedIds.size > 0 || archivedCount > 0,
    removedCount: removedIds.size,
    archivedCount,
    recurring: isRecurringTemplate,
    removedTaskIds: Array.from(removedIds)
  };
}
