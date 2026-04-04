export function buildCompositeNotificationTaskItems(
  entries,
  {
    timeZone = "America/Los_Angeles",
    now = new Date(),
    mode = "summary"
  } = {}
) {
  const normalizedEntries = normalizeDigestTaskEntries(entries, timeZone, now);
  const groups = new Map();
  const groupOrder = [];

  for (const entry of normalizedEntries) {
    const compositeSeriesKey = getCompositeTaskSeriesKey(entry.task);
    const groupKey = compositeSeriesKey && entry.dueDate
      ? `${entry.dueDate}:${compositeSeriesKey}`
      : `single:${entry.task?.id || entry.baseLabel}:${entry.dueDate}:${entry.timeOfDay}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    groups.get(groupKey).push(entry);
  }

  return groupOrder
    .map((groupKey) => buildCompositeNotificationPreviewItem(groups.get(groupKey) || [], {
      timeZone,
      now,
      mode
    }))
    .filter(Boolean);
}

export function buildGroupedHistoryLines(entries, { timeZone = "America/Los_Angeles", eventLabel = "completed" } = {}) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object" && Number.isFinite(entry.at) && entry.at > 0)
    .map((entry) => ({
      ...entry,
      taskName: String(entry.taskName || "Task"),
      dateKey: getZonedDateString(new Date(entry.at), timeZone),
      timeLabel: formatTimeInTimeZone(entry.at, timeZone),
      dateTimeLabel: formatDateTimeInTimeZone(entry.at, timeZone)
    }))
    .sort((left, right) => right.at - left.at);

  const groups = new Map();
  for (const entry of normalizedEntries) {
    const key = `${entry.type || eventLabel}:${entry.dateKey}:${entry.taskName}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }

  return Array.from(groups.values())
    .sort((left, right) => (right[0]?.at || 0) - (left[0]?.at || 0))
    .map((group) => {
      if (group.length === 1) {
        return `${group[0].taskName} · ${group[0].dateTimeLabel}`;
      }
      const label = group[0].taskName;
      const times = group
        .slice()
        .sort((left, right) => left.at - right.at)
        .map((entry) => entry.timeLabel)
        .join(", ");
      return `${label} (${group.length}): ${eventLabel} at ${times}`;
    });
}

export function buildTravelNotificationHighlights(
  widgets,
  {
    now = new Date(),
    timeZone = "America/Los_Angeles",
    maxForecastDays = 3,
    maxItems = 2
  } = {}
) {
  const travelWidgets = (Array.isArray(widgets) ? widgets : []).filter((widget) => widget?.type === "travel");
  const lines = [];

  for (const widget of travelWidgets) {
    const trip = chooseTravelHighlightTrip(widget?.data?.trips, now);
    if (!trip) {
      continue;
    }
    const snapshot = widget?.data?.liveSnapshots?.[trip.id];
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }

    const flight = snapshot.flight && typeof snapshot.flight === "object" ? snapshot.flight : null;
    const weather = snapshot.weather && typeof snapshot.weather === "object" ? snapshot.weather : null;
    const tripLabel = buildTravelHighlightTripLabel(trip);

    if (flight?.status === "ok") {
      const routeLabel = [flight.departureCode, flight.arrivalCode].filter(Boolean).join(" -> ");
      const detailBits = [
        flight.statusLabel || "",
        flight.departureTimeLabel ? `Dep ${flight.departureTimeLabel}` : "",
        flight.gate ? `Gate ${flight.gate}` : "",
        flight.terminal ? `T${flight.terminal}` : ""
      ].filter(Boolean);
      lines.push([
        `${tripLabel}: Flight ${flight.flightLabel || "status"}`,
        routeLabel,
        detailBits.join(" · ")
      ].filter(Boolean).join(" · "));
    } else if (snapshot.flightNotice) {
      lines.push(`${tripLabel}: ${snapshot.flightNotice}`);
    }

    if (weather?.status === "ok" && Array.isArray(weather.days) && weather.days.length > 0) {
      const forecastDays = weather.days
        .slice(0, Math.max(1, maxForecastDays))
        .map((day) => {
          const shortLabel = day?.shortLabel || day?.dateLabel || day?.date || "";
          const temperatureLabel = String(day?.temperatureLabel || "").trim();
          const conditionLabel = String(day?.conditionLabel || "").trim();
          return [shortLabel, temperatureLabel, conditionLabel].filter(Boolean).join(" ");
        })
        .filter(Boolean)
        .join(", ");
      if (forecastDays) {
        lines.push(`${tripLabel}: Forecast${weather.locationLabel ? ` for ${weather.locationLabel}` : ""} · ${forecastDays}`);
      }
    } else if (!flight && snapshot.weatherNotice) {
      lines.push(`${tripLabel}: ${snapshot.weatherNotice}`);
    }

    if (lines.length >= maxItems) {
      break;
    }
  }

  return lines.slice(0, Math.max(0, maxItems));
}

function normalizeDigestTaskEntries(entries, timeZone, now) {
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.now();
  const todayKey = getZonedDateString(now instanceof Date ? now : new Date(nowTimestamp), timeZone);
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeDigestTaskEntry(entry, timeZone, nowTimestamp, todayKey))
    .filter(Boolean)
    .sort((left, right) => left.sortKey - right.sortKey || left.baseLabel.localeCompare(right.baseLabel));
}

function normalizeDigestTaskEntry(entry, timeZone, nowTimestamp, todayKey) {
  const task = entry?.task && typeof entry.task === "object" ? entry.task : entry;
  if (!task || typeof task !== "object") {
    return null;
  }
  const dueDate = String(task?.dueDate || task?.startDate || "");
  const timeOfDay = String(task?.timeOfDay || "23:59");
  const taskTimeZone = getTaskTimeZone(task, timeZone);
  const dueTimestamp = Number.isFinite(entry?.dueTimestamp)
    ? entry.dueTimestamp
    : getTaskDueTimestamp(task, taskTimeZone);
  const dueDateKey = dueDate || (Number.isFinite(dueTimestamp) ? getZonedDateString(new Date(dueTimestamp), taskTimeZone) : "");
  const status = task?.status === "done" ? "completed" : task?.status === "skipped" ? "skipped" : "open";
  return {
    task,
    dueDate: dueDateKey,
    timeOfDay,
    taskTimeZone,
    dueTimestamp,
    baseLabel: String(task?.name || "Task"),
    status,
    slotTimeLabel: Number.isFinite(dueTimestamp)
      ? formatTimeInTimeZone(dueTimestamp, taskTimeZone)
      : timeOfDay,
    fullDueLabel: Number.isFinite(dueTimestamp)
      ? formatDateTimeInTimeZone(dueTimestamp, taskTimeZone)
      : `${dueDateKey} ${timeOfDay}`.trim(),
    isOverdueOpen: status === "open" && Number.isFinite(dueTimestamp) && dueTimestamp < nowTimestamp,
    isToday: dueDateKey === todayKey,
    sortKey: Number.isFinite(dueTimestamp) ? dueTimestamp : Number.MAX_SAFE_INTEGER
  };
}

function buildCompositeNotificationPreviewItem(entries, { timeZone, now, mode }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const sortedEntries = [...entries].sort((left, right) => left.sortKey - right.sortKey);
  if (sortedEntries.length === 1) {
    return buildSingleNotificationPreviewItem(sortedEntries[0], timeZone, mode);
  }

  const first = sortedEntries[0];
  const todayKey = getZonedDateString(now, timeZone);
  const needsDatePrefix = first.dueDate && first.dueDate !== todayKey;
  const groupStatus = getUniformClosedStatus(sortedEntries);
  const timeZoneSuffix = first.taskTimeZone !== timeZone ? ` (${first.taskTimeZone})` : "";
  const timeCopy = sortedEntries
    .map((entry) => {
      let label = entry.slotTimeLabel;
      if (mode === "agenda") {
        if (entry.status === "completed") {
          label += " completed";
        } else if (entry.status === "skipped") {
          label += " skipped";
        } else if (entry.isOverdueOpen) {
          label += " overdue";
        }
      }
      return label;
    })
    .join(", ");
  const prefix = mode === "agenda" && needsDatePrefix
    ? `overdue from ${formatDateInTimeZone(first.dueTimestamp, first.taskTimeZone)} at `
    : needsDatePrefix
      ? `due ${formatDateInTimeZone(first.dueTimestamp, first.taskTimeZone)} at `
      : "due at ";

  return {
    label: `${first.baseLabel} (${sortedEntries.length}): ${prefix}${timeCopy}${timeZoneSuffix}`,
    status: groupStatus || "open"
  };
}

function buildSingleNotificationPreviewItem(entry, timeZone, mode) {
  const timeZoneSuffix = entry.taskTimeZone !== timeZone ? ` (${entry.taskTimeZone})` : "";
  let label = `${entry.baseLabel} · Due ${entry.fullDueLabel}${timeZoneSuffix}`;
  if (mode === "agenda" && entry.status === "open" && entry.isOverdueOpen) {
    label += " · Overdue";
  }
  return {
    label,
    status: entry.status
  };
}

function getUniformClosedStatus(entries) {
  const statuses = new Set(entries.map((entry) => entry.status));
  if (statuses.size !== 1) {
    return "";
  }
  const status = entries[0]?.status || "";
  return status === "completed" || status === "skipped" ? status : "";
}

function getCompositeTaskSeriesKey(task) {
  const linkedGroupId = String(task?.linkedSeries?.groupId || "").trim();
  if (linkedGroupId) {
    return linkedGroupId;
  }
  const templateId = String(task?.templateId || "").trim();
  if (templateId) {
    return templateId;
  }
  if (task?.ownerWidgetType && task?.widgetTaskKind && task?.name) {
    return `${task.ownerWidgetType}:${task.widgetTaskKind}:${task.name}`;
  }
  return "";
}

function getTaskDueTimestamp(task, timeZone) {
  const dueDate = String(task?.dueDate || task?.startDate || "");
  if (!dueDate) {
    return Number.NaN;
  }
  return zonedDateTimeToTimestamp(dueDate, String(task?.timeOfDay || "23:59"), timeZone);
}

function getTaskTimeZone(task, fallbackTimeZone) {
  const candidate = typeof task?.widgetTaskMeta?.timeZone === "string"
    ? task.widgetTaskMeta.timeZone.trim()
    : "";
  if (!candidate) {
    return fallbackTimeZone;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallbackTimeZone;
  }
}

function chooseTravelHighlightTrip(trips, now) {
  const safeTrips = Array.isArray(trips) ? trips.filter((trip) => trip && typeof trip === "object") : [];
  const activeTrips = safeTrips
    .filter((trip) => trip.status === "active")
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  if (activeTrips.length > 0) {
    return activeTrips[0];
  }
  return safeTrips
    .filter((trip) => trip.status !== "complete")
    .sort((left, right) => getTripSortTimestamp(left, now) - getTripSortTimestamp(right, now))[0] || null;
}

function getTripSortTimestamp(trip, now) {
  const itinerary = trip?.itinerary || {};
  const outboundDate = String(itinerary.outboundDate || trip?.startDate || "");
  const outboundTime = String(itinerary.outboundTime || "12:00");
  const parsed = Date.parse(`${outboundDate}T${outboundTime}`);
  if (Number.isFinite(parsed) && parsed >= now.getTime()) {
    return parsed;
  }
  if (Number.isFinite(parsed)) {
    return parsed + 365 * 24 * 60 * 60 * 1000;
  }
  return Number.MAX_SAFE_INTEGER;
}

function buildTravelHighlightTripLabel(trip) {
  const tripName = String(trip?.name || "").trim() || "Travel Buddy";
  const destination = String(trip?.destination || "").trim();
  return destination ? `${tripName} to ${destination}` : tripName;
}

function zonedDateTimeToTimestamp(dateString, timeString, timeZone) {
  const parts = String(dateString || "").split("-").map((part) => Number(part));
  const timeParts = String(timeString || "23:59").split(":").map((part) => Number(part));
  const [year, month, day] = parts;
  const [hours, minutes] = timeParts;
  if (!year || !month || !day) {
    return Number.NaN;
  }
  let guess = Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedParts(new Date(guess), timeZone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hours, actual.minutes, 0);
    const desiredUtc = Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0);
    const diff = desiredUtc - actualUtc;
    if (diff === 0) {
      break;
    }
    guess += diff;
  }
  return guess;
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date).reduce((result, item) => {
    if (item.type !== "literal") {
      result[item.type] = Number(item.value);
    }
    return result;
  }, {});
  return {
    year: parts.year || 0,
    month: parts.month || 1,
    day: parts.day || 1,
    hours: parts.hour || 0,
    minutes: parts.minute || 0
  };
}

function getZonedDateString(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatTimeInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTimeInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
