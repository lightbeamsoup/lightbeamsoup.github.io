import { compareTaskSchedule, toDateString } from "../logic.js";

export const ENERGY_WIDGET_TYPE = "energy";

const DEFAULT_ENERGY_REMINDER_TIMES = ["07:00", "12:00", "19:00"];
const DEFAULT_MAX_CHECKINS = 12;
const DEFAULT_HISTORY_RANGE = "7d";
const ENERGY_LATE_GRACE_MINUTES = 60;
const ENERGY_LEVELS = [
  { level: 1, label: "Very low", icon: "../energy/images/energy-1.svg", accent: "#5c6ac4" },
  { level: 2, label: "Low", icon: "../energy/images/energy-2.svg", accent: "#4ea8de" },
  { level: 3, label: "Steady", icon: "../energy/images/energy-3.svg", accent: "#f4c95d" },
  { level: 4, label: "High", icon: "../energy/images/energy-4.svg", accent: "#ff8c42" },
  { level: 5, label: "Very high", icon: "../energy/images/energy-5.svg", accent: "#ff5d73" }
];
const REMINDER_LABELS = ["Morning", "Midday", "Evening"];
const HISTORY_RANGE_OPTIONS = [
  { value: "1d", label: "Last day" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last week" },
  { value: "30d", label: "Last month" },
  { value: "all", label: "All time" }
];

export const energyWidgetDefinition = {
  type: ENERGY_WIDGET_TYPE,
  title: "Energy",
  detailTitle: "Energy history and schedule",
  detailSubtitle: "Track check-ins, see the trend over time, and tune how many reminders the widget owns.",
  ownerLabel: "Energy widget",
  menuLabel: "Add Energy Widget",
  menuDescription: "Track your current energy and feed the task system from the widget layer.",
  singleton: true,

  createWidget({ slotIndex, retiredWidget, createId, now }) {
    if (retiredWidget) {
      return {
        ...retiredWidget,
        slotIndex,
        updatedAt: retiredWidget.updatedAt || now
      };
    }

    return {
      id: createId(),
      type: ENERGY_WIDGET_TYPE,
      slotIndex,
      settings: {
        reminderTimes: [...DEFAULT_ENERGY_REMINDER_TIMES],
        maxCheckins: DEFAULT_MAX_CHECKINS
      },
      data: {
        entries: [],
        historyRange: DEFAULT_HISTORY_RANGE
      },
      createdAt: now,
      updatedAt: now
    };
  },

  normalizeWidget(widget, { createId, now, maxWidgets }) {
    if (!widget || typeof widget !== "object") {
      return null;
    }

    const maxCheckins = normalizeMaxCheckins(widget.settings?.maxCheckins);
    return {
      id: typeof widget.id === "string" ? widget.id : createId(),
      type: ENERGY_WIDGET_TYPE,
      slotIndex: normalizeSlotIndex(widget.slotIndex, maxWidgets || 5),
      settings: {
        reminderTimes: normalizeReminderTimes(widget.settings?.reminderTimes, maxCheckins),
        maxCheckins
      },
      data: {
        entries: normalizeEnergyEntries(widget.data?.entries),
        historyRange: normalizeHistoryRange(widget.data?.historyRange)
      },
      createdAt: typeof widget.createdAt === "number" ? widget.createdAt : now,
      updatedAt: typeof widget.updatedAt === "number" ? widget.updatedAt : now
    };
  },

  getUpdatedAt(widget) {
    const latestEntry = widget.data.entries[widget.data.entries.length - 1];
    return Math.max(latestEntry?.at || 0, widget.updatedAt || 0, widget.createdAt || 0);
  },

  findCompletionTask({ tasks, widget, mechanism, at }) {
    return findActiveEnergyCompletionTask(tasks, widget.id, mechanism, at);
  },

  render({ widget, tasks, escapeHtml, formatDateTime, getPendingActionForWidget }) {
    const latest = widget.data.entries[widget.data.entries.length - 1] || null;
    const reminderSummary = widget.settings.reminderTimes.map(formatReminderTime).join(", ");
    const pendingVote = getPendingActionForWidget(widget.id, "energy-vote");
    const shellSummary = describeEnergyShellSummary(tasks, widget.id, formatDateTime);
    const trendEntries = filterEntriesByRange(widget.data.entries, "3d");

    return `
      <div class="widget-slot-header">
        <div>
          <h3>Energy</h3>
          <p>Track your current energy and feed the task system from the widget layer.</p>
        </div>
        <span class="widget-badge">Live</span>
      </div>
      <div class="energy-widget-levels">
        ${renderEnergyVoteButtons({
          pendingAction: pendingVote,
          actionBase: "energy-vote",
          extraClassName: ""
        })}
      </div>
      <div class="energy-widget-summary">
        <p class="energy-widget-current">${pendingVote ? `Pending vote: ${pendingVote.level}/5` : `Latest vote: ${latest ? `${latest.level}/5 at ${formatDateTime(latest.at)}` : "No votes yet"}`}</p>
        <p class="energy-widget-next"><strong>${escapeHtml(shellSummary.primary)}</strong></p>
        <p class="energy-widget-note">${escapeHtml(shellSummary.secondary)}</p>
      </div>
      <section class="energy-widget-trend" aria-label="Energy trend for the last 3 days">
        <div class="energy-widget-trend-header">
          <span>Last 3 days</span>
          <span>${trendEntries.length > 0 ? `${trendEntries.length} vote${trendEntries.length === 1 ? "" : "s"}` : "No votes yet"}</span>
        </div>
        ${renderEnergyShellTrend(trendEntries, escapeHtml, formatDateTime)}
      </section>
      <p class="energy-widget-schedule">Check-ins: ${escapeHtml(reminderSummary)}</p>
      <div class="widget-actions">
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
      </div>
    `;
  },

  renderDetail({ widget, tasks, escapeHtml, formatDateTime, isDeveloperUser, getPendingActionForWidget }) {
    const latest = widget.data.entries[widget.data.entries.length - 1] || null;
    const taskVotePending = getPendingActionForWidget(widget.id, "energy-vote");
    const maxCheckins = normalizeMaxCheckins(widget.settings.maxCheckins);
    const reminderTimes = normalizeReminderTimes(widget.settings.reminderTimes, maxCheckins);
    const reminderState = describeReminderState(tasks, widget.id, formatDateTime);
    const voteIntent = describeVoteIntent(tasks, widget.id, formatDateTime);

    return `
      <section class="energy-detail">
        <div class="energy-detail-grid">
          <section class="energy-detail-card energy-chart-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">History</p>
                <h3>Energy trend</h3>
                <p class="sync-status">All task-related check-ins and extra readings are stored together in the same timeline.</p>
              </div>
              <label class="energy-range-label">
                <span>Range</span>
                <select data-energy-history-range>
                  ${HISTORY_RANGE_OPTIONS.map((option) => `
                    <option value="${option.value}" ${widget.data.historyRange === option.value ? "selected" : ""}>${option.label}</option>
                  `).join("")}
                </select>
              </label>
            </div>
            <canvas class="energy-detail-chart" data-energy-chart></canvas>
            <p class="empty-state hidden" data-energy-empty>No energy entries in this range yet.</p>
          </section>

          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Vote</p>
                <h3>Log your current energy</h3>
                <p class="sync-status">${taskVotePending ? `Pending energy vote: ${taskVotePending.level}/5` : voteIntent}</p>
              </div>
            </div>
            <div class="energy-detail-votes">
              ${renderEnergyVoteButtons({
                pendingAction: taskVotePending,
                actionBase: "energy-vote-task",
                extraClassName: "detail"
              })}
            </div>
            <p class="sync-status">${escapeHtml(reminderState)}</p>
          </section>

          <section class="energy-detail-card energy-settings-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Schedule</p>
                <h3>Reminder times</h3>
                <p class="sync-status">Change how many Energy check-ins happen each day. Completed reminders and vote history stay intact.</p>
              </div>
            </div>
            <div class="energy-reminder-editor" data-energy-reminder-editor data-max-checkins="${maxCheckins}">
              ${renderReminderInputs(reminderTimes, escapeHtml)}
            </div>
            <div class="widget-actions">
              <button type="button" class="ghost-button" data-energy-add-time>Add check-in</button>
              <button type="button" class="primary-button" data-energy-save-settings>Save schedule</button>
              <button type="button" class="ghost-button" data-widget-open-task-desk>Open Task Desk</button>
            </div>
            <p class="sync-status">Up to ${maxCheckins} check-ins per day.</p>
          </section>

          ${isDeveloperUser ? `
            <section class="energy-detail-card energy-dev-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">Developer</p>
                  <h3>Widget developer panel</h3>
                  <p class="sync-status">These controls are private to the owner account.</p>
                </div>
              </div>
              <label>
                <span>Max check-ins per day</span>
                <input type="number" min="1" max="24" step="1" value="${maxCheckins}" data-energy-max-checkins />
              </label>
            </section>
          ` : ""}
        </div>
      </section>
    `;
  },

  mountDetail({ widget, container, isDeveloperUser, helpers }) {
    const chartCanvas = container.querySelector("[data-energy-chart]");
    const emptyState = container.querySelector("[data-energy-empty]");
    const historyRange = container.querySelector("[data-energy-history-range]");
    const reminderEditor = container.querySelector("[data-energy-reminder-editor]");
    const maxCheckinsInput = container.querySelector("[data-energy-max-checkins]");

    const refreshChart = () => {
      widget.data.historyRange = normalizeHistoryRange(historyRange?.value || widget.data.historyRange);
      const entries = filterEntriesByRange(widget.data.entries, widget.data.historyRange);
      if (!chartCanvas || !emptyState) {
        return;
      }
      drawEnergyChart(chartCanvas, emptyState, entries);
    };

    const handleResize = () => {
      refreshChart();
    };

    const clickHandler = (event) => {
      const taskVoteButton = event.target.closest("[data-energy-vote-task]");
      if (taskVoteButton) {
        const pendingKey = taskVoteButton.getAttribute("data-pending-key");
        if (pendingKey) {
          helpers.undoPendingAction(pendingKey, "Undid the pending energy vote.");
          return;
        }
        const level = Number(taskVoteButton.getAttribute("data-level"));
        const tasks = typeof helpers.getStore === "function" ? helpers.getStore().tasks : [];
        const voteMode = hasActiveReminderTask(tasks, widget.id, Date.now()) ? "auto" : "extra";
        stageEnergyVote(widget, level, voteMode, helpers);
        return;
      }

      const addTimeButton = event.target.closest("[data-energy-add-time]");
      if (addTimeButton) {
        const maxCheckins = readMaxCheckins(maxCheckinsInput, widget);
        const timeInputs = reminderEditor ? Array.from(reminderEditor.querySelectorAll("[data-energy-time-input]")) : [];
        if (timeInputs.length >= maxCheckins) {
          helpers.setSyncStatus(`Energy is capped at ${maxCheckins} check-ins per day right now.`, "error");
          return;
        }
        const row = document.createElement("div");
        row.className = "energy-time-row";
        row.innerHTML = renderReminderInputRow("12:00", timeInputs.length);
        reminderEditor?.appendChild(row);
        return;
      }

      const removeTimeButton = event.target.closest("[data-energy-remove-time]");
      if (removeTimeButton) {
        const row = removeTimeButton.closest(".energy-time-row");
        row?.remove();
        syncReminderLabels(reminderEditor);
        return;
      }

      const openTaskDeskButton = event.target.closest("[data-widget-open-task-desk]");
      if (openTaskDeskButton) {
        helpers.openTaskDesk();
        return;
      }

      const saveSettingsButton = event.target.closest("[data-energy-save-settings]");
      if (saveSettingsButton) {
        const nextMaxCheckins = readMaxCheckins(maxCheckinsInput, widget);
        const nextTimes = collectReminderTimes(reminderEditor, nextMaxCheckins);
        if (!nextTimes) {
          helpers.setSyncStatus("Energy reminder times must be unique and use valid times.", "error");
          return;
        }
        widget.settings.maxCheckins = nextMaxCheckins;
        applyReminderSettings(widget, nextTimes, helpers);
      }
    };

    container.addEventListener("click", clickHandler);
    historyRange?.addEventListener("change", refreshChart);
    window.addEventListener("resize", handleResize);
    refreshChart();

    return () => {
      window.removeEventListener("resize", handleResize);
      historyRange?.removeEventListener("change", refreshChart);
      container.removeEventListener("click", clickHandler);
    };
  },

  handleAction({ action, actionTarget, widget, helpers }) {
    if (action === "undo-widget-action") {
      const pendingKey = actionTarget.getAttribute("data-pending-key");
      if (pendingKey) {
        helpers.undoPendingAction(pendingKey, "Undid the pending energy vote.");
      }
      return true;
    }

    if (action === "pending-widget-action") {
      return true;
    }

    if (action !== "energy-vote") {
      return false;
    }

    const level = Number(actionTarget.getAttribute("data-level"));
    stageEnergyVote(widget, level, "auto", helpers);
    return true;
  },

  ensureTasks({ widget, store, helpers }) {
    const reminderTimes = reconcileEnergyReminderSettings(widget, store.tasks);
    ensureEnergyReminderTemplates(widget, store, helpers, reminderTimes, { preserveClosed: false });
  },

  syncOwnedTasks({ widget, store, helpers }) {
    const reminderTimes = reconcileEnergyReminderSettings(widget, store.tasks);
    ensureEnergyReminderTemplates(widget, store, helpers, reminderTimes, { preserveClosed: true });
    repairEnergyReminderTemplates(store.tasks, widget.id, {
      reminderTimes,
      today: typeof helpers?.todayString === "function" ? helpers.todayString() : toDateString(new Date()),
      now: new Date(),
      regenerateSeries: (templateId) => helpers?.regenerateSeries?.(templateId, { preserveClosed: true })
    });
    syncEnergyTaskChain(store.tasks, widget.id);
  },

  isDependencySatisfied({ dependency }) {
    return dependency?.status === "done" || dependency?.status === "skipped";
  },

  shouldAutoSkipOwnedTask({ task, now, store }) {
    if (task.skipRule?.policy !== "energy-next-window") {
      return false;
    }
    const sequence = listEnergyScheduledTasks(store.tasks, task.ownerWidgetId, { openOnly: false });
    const currentIndex = sequence.findIndex((item) => item.id === task.id);
    if (currentIndex === -1) {
      return false;
    }
    const nextTask = sequence[currentIndex + 1] || null;
    const cutoff = nextTask ? taskDueTimestamp(nextTask) : null;
    return cutoff ? now.getTime() >= cutoff : false;
  }
};

function normalizeSlotIndex(value, maxWidgets) {
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number < maxWidgets) {
    return number;
  }
  return 0;
}

function normalizeMaxCheckins(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_CHECKINS;
  }
  return Math.max(1, Math.min(24, Math.round(parsed)));
}

function normalizeReminderTimes(value, maxCheckins = DEFAULT_MAX_CHECKINS) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ENERGY_REMINDER_TIMES];
  }
  const normalized = [...new Set(
    value
      .filter((item) => typeof item === "string" && /^\d{2}:\d{2}$/.test(item))
      .map((item) => item.trim())
  )]
    .sort()
    .slice(0, maxCheckins);
  return normalized.length > 0 ? normalized : [...DEFAULT_ENERGY_REMINDER_TIMES];
}

export function reconcileEnergyReminderSettings(widget, tasks) {
  const maxCheckins = normalizeMaxCheckins(widget?.settings?.maxCheckins);
  const configuredReminderTimes = normalizeReminderTimes(widget?.settings?.reminderTimes, maxCheckins);
  const recoveredReminderTimes = collectEnergyReminderTimesFromTasks(tasks, widget?.id);
  const recoveredRecentReminderTimes = recoveredReminderTimes.length > configuredReminderTimes.length
    ? recoveredReminderTimes
    : collectEnergyReminderTimesFromTasks(tasks, widget?.id, {
      includeRecentClosed: true
    });

  if (recoveredRecentReminderTimes.length <= configuredReminderTimes.length) {
    return configuredReminderTimes;
  }

  const nextMaxCheckins = Math.max(maxCheckins, recoveredRecentReminderTimes.length);
  const nextReminderTimes = normalizeReminderTimes(recoveredRecentReminderTimes, nextMaxCheckins);
  if (widget?.settings && nextReminderTimes.length > configuredReminderTimes.length) {
    widget.settings.maxCheckins = nextMaxCheckins;
    widget.settings.reminderTimes = [...nextReminderTimes];
  }
  return nextReminderTimes;
}

function collectEnergyReminderTimesFromTasks(tasks, widgetId, { includeRecentClosed = false, now = Date.now() } = {}) {
  if (!widgetId) {
    return [];
  }
  const bySlotIndex = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (
      !task
      || !isEnergyReminderRecoveryCandidate(task, widgetId, {
        includeRecentClosed,
        now
      })
    ) {
      continue;
    }
    const slotIndex = parseReminderIndex(task.ownerTaskKey);
    const timeOfDay = typeof task.timeOfDay === "string" ? task.timeOfDay.trim() : "";
    if (slotIndex < 0 || !/^\d{2}:\d{2}$/.test(timeOfDay)) {
      continue;
    }
    const existing = bySlotIndex.get(slotIndex) || null;
    if (!existing || task.templateId === "" || task.templateId == null) {
      bySlotIndex.set(slotIndex, timeOfDay);
    }
  }
  return Array.from(bySlotIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, timeOfDay]) => timeOfDay);
}

function isEnergyReminderRecoveryCandidate(task, widgetId, { includeRecentClosed = false, now = Date.now() } = {}) {
  if (!task || task.ownerWidgetType !== ENERGY_WIDGET_TYPE) {
    return false;
  }
  if (!String(task.ownerTaskKey || "").startsWith("energy-reminder-")) {
    return false;
  }
  if (task.ownerWidgetId === widgetId) {
    return shouldUseEnergyTaskForReminderRecovery(task, {
      includeRecentClosed,
      now
    });
  }
  if (!includeRecentClosed) {
    return false;
  }
  return isRecentEnergyReminderEvidence(task, now);
}

function shouldUseEnergyTaskForReminderRecovery(task, { includeRecentClosed = false, now = Date.now() } = {}) {
  if (!task) {
    return false;
  }
  if (task.archived !== true && task.status === "open") {
    return true;
  }
  if (!includeRecentClosed) {
    return false;
  }
  if (task.recurrence?.type === "archived-series") {
    return isRecentEnergyReminderEvidence(task, now);
  }
  return task.archived !== true && isRecentEnergyReminderEvidence(task, now);
}

function isRecentEnergyReminderEvidence(task, now = Date.now()) {
  const recentWindowMs = 1000 * 60 * 60 * 24 * 14;
  const cutoff = now - recentWindowMs;
  const taskHistory = Array.isArray(task?.history) ? task.history : [];
  const latestHistoryAt = taskHistory.reduce((latest, item) => Math.max(latest, item?.at || 0), 0);
  if (latestHistoryAt >= cutoff) {
    return true;
  }
  const scheduledDate = String(task?.dueDate || task?.startDate || "");
  if (!scheduledDate) {
    return false;
  }
  const scheduledTime = String(task?.timeOfDay || "12:00");
  const scheduledAt = Date.parse(`${scheduledDate}T${scheduledTime}:00`);
  return Number.isFinite(scheduledAt) && scheduledAt >= cutoff;
}

function normalizeEnergyEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => Number.isInteger(item?.level) && typeof item?.at === "number")
    .map((item) => ({
      level: item.level,
      at: item.at,
      source: item?.source === "extra" ? "extra" : "task"
    }))
    .sort((left, right) => left.at - right.at);
}

function normalizeHistoryRange(value) {
  return HISTORY_RANGE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_HISTORY_RANGE;
}

function buildReminderTemplate({ widget, helpers, store, reminderTimes, index, time }) {
  const ownerTaskKey = `energy-reminder-${index}`;
  const seedDate = nextWidgetTaskDate(
    store.tasks,
    widget.id,
    ownerTaskKey,
    helpers.todayString(),
    reminderTimes,
    index,
    new Date()
  );
  const healthCategory = helpers.resolveCategorySnapshot("health");
  return {
    id: helpers.createId(),
    templateId: "",
    occurrenceIndex: 0,
    name: "Energy check-in",
    details: "Created by the Energy widget. Other widgets should not edit this task.",
    startDate: seedDate,
    dueDate: seedDate,
    timeOfDay: time,
    lateGraceMinutes: ENERGY_LATE_GRACE_MINUTES,
    notBeforeAt: startOfDayTimestamp(seedDate),
    pointsValue: 1,
    pointsEntryId: "",
    length: "very-short",
    categoryKey: healthCategory.key,
    categoryLabel: healthCategory.label,
    categoryColor: healthCategory.color,
    importance: "medium",
    status: "open",
    createdAt: Date.now() + index,
    ownerWidgetId: widget.id,
    ownerWidgetType: widget.type,
    ownerTaskKey,
    widgetTaskKind: "energy-checkin",
    widgetTaskMeta: buildEnergyTaskMeta({
      ownerTaskKey,
      reminderIndex: index,
      timeOfDay: time,
      slotCount: reminderTimes.length
    }),
    linkedSeries: {
      groupId: `${widget.id}:energy-checkins`,
      kind: "daily-window",
      slotIndex: index,
      slotCount: reminderTimes.length
    },
    sequenceDependencyId: "",
    widgetCompletion: {
      mechanism: "energy-vote",
      lockout: "scheduled-window"
    },
    skipRule: {
      type: "widget-lockout",
      policy: "energy-next-window"
    },
    dependencies: [],
    recurrence: {
      type: "daily",
      interval: 1,
      weekday: 0,
      day: 1,
      ordinal: "first",
      endDate: "",
      count: null,
      forever: true
    },
    history: []
  };
}

function ensureEnergyReminderTemplates(widget, store, helpers, reminderTimes, { preserveClosed = true } = {}) {
  const staleTemplateIds = new Set();

  reminderTimes.forEach((time, index) => {
    const ownerTaskKey = `energy-reminder-${index}`;
    const templates = listEnergyReminderTemplates(store.tasks, widget.id, ownerTaskKey);
    const carriedGoogleLink = selectEnergyReminderGoogleLinkCarrier(templates);
    let activeTemplate = templates.find((task) => task.archived !== true && task.status === "open") || null;
    let createdTemplate = false;
    let needsRegenerate = false;

    for (const template of templates) {
      if (template === activeTemplate) {
        continue;
      }
      staleTemplateIds.add(template.id);
      demoteStaleEnergyReminderTemplate(template);
    }

    if (!activeTemplate) {
      activeTemplate = buildReminderTemplate({
        widget,
        helpers,
        store,
        reminderTimes,
        index,
        time
      });
      if (carriedGoogleLink) {
        activeTemplate.googleCalendar = {
          ...carriedGoogleLink,
          scheduleFingerprint: "",
          statusMirroredAt: 0
        };
      }
      createdTemplate = true;
      store.tasks.unshift(activeTemplate);
      needsRegenerate = true;
    } else {
      if (activeTemplate.timeOfDay !== time) {
        activeTemplate.timeOfDay = time;
        needsRegenerate = true;
      }
      if (carriedGoogleLink && (!activeTemplate.googleCalendar || !activeTemplate.googleCalendar.eventId)) {
        activeTemplate.googleCalendar = {
          ...carriedGoogleLink,
          scheduleFingerprint: "",
          statusMirroredAt: 0
        };
      }
      if (templates.length > 1) {
        needsRegenerate = true;
      }
    }

    if (needsRegenerate) {
      helpers.regenerateSeries(activeTemplate.id, {
        preserveClosed: createdTemplate ? preserveClosed : true
      });
    }
  });

  if (staleTemplateIds.size > 0) {
    store.tasks = store.tasks.filter((task) => !(
      task.ownerWidgetId === widget.id
      && task.ownerWidgetType === ENERGY_WIDGET_TYPE
      && task.templateId
      && staleTemplateIds.has(task.templateId)
      && task.status === "open"
    ));
  }
}

function stageEnergyVote(widget, level, mode, helpers) {
  if (!ENERGY_LEVELS.some((item) => item.level === level)) {
    return;
  }

  const entryTime = Date.now();
  const store = typeof helpers.getStore === "function" ? helpers.getStore() : { tasks: [] };
  const actionType = "energy-vote";
  const preflightHasReminder = mode !== "extra" && hasActiveReminderTask(store.tasks, widget.id, entryTime);
  helpers.stageWidgetAction(widget, actionType, {
    level,
    description: mode === "extra"
      ? `Pending extra energy vote of ${level}/5. Click undo within 3 seconds to cancel.`
      : preflightHasReminder
        ? `Pending energy vote of ${level}/5. Click undo within 3 seconds to cancel.`
        : `Pending energy vote of ${level}/5. This will be logged unless a reminder is due by the time it commits.`,
    commit: () => {
      let completedTask = null;
      let entrySource = "extra";

      if (mode !== "extra") {
        helpers.applyAutoSkipRules(new Date(entryTime));
        completedTask = helpers.completeNextTaskFromWidget(widget, "energy-vote", entryTime);
        entrySource = completedTask ? "task" : "extra";
      }

      widget.data.entries.push({ level, at: entryTime, source: entrySource });
      widget.data.entries.sort((left, right) => left.at - right.at);
      widget.updatedAt = entryTime;

      return completedTask
        ? {
          message: `Logged an energy vote of ${level}/5 and completed ${completedTask.name}.`,
          tone: "info"
        }
        : mode === "extra"
          ? {
            message: `Logged an extra energy vote of ${level}/5.`,
            tone: "info"
          }
          : {
            message: `Logged an energy vote of ${level}/5. No eligible Energy reminder task was active right now.`,
            tone: "info"
          };
    }
  });
}

function renderEnergyVoteButtons({ pendingAction, actionBase, extraClassName }) {
  return ENERGY_LEVELS.map((item) => {
    const isPendingLevel = pendingAction && pendingAction.level === item.level;
    const pendingKey = isPendingLevel ? `data-pending-key="${pendingAction.key}"` : "";
    const disabled = pendingAction && !isPendingLevel ? "disabled" : "";
    const actionAttribute = actionBase === "energy-vote"
      ? `data-widget-action="${pendingAction ? (isPendingLevel ? "undo-widget-action" : "pending-widget-action") : "energy-vote"}"`
      : `data-${actionBase}="${isPendingLevel ? "undo" : "vote"}"`;

    return `
      <button
        type="button"
        class="energy-widget-level ${extraClassName}"
        ${actionAttribute}
        ${pendingKey}
        data-level="${item.level}"
        ${disabled}
        style="--energy-accent: ${item.accent}"
      >
        <img src="${item.icon}" alt="${item.label}" />
        <span>${isPendingLevel ? "Undo" : item.level}</span>
      </button>
    `;
  }).join("");
}

function renderReminderInputs(reminderTimes, escapeHtml) {
  return reminderTimes.map((time, index) => renderReminderInputRow(time, index, escapeHtml)).join("");
}

function renderReminderInputRow(time, index, escapeHtml = (value) => value) {
  return `
    <div class="energy-time-row">
      <label>
        <span>${escapeHtml(reminderLabelForIndex(index))}</span>
        <input type="time" value="${escapeHtml(time)}" data-energy-time-input />
      </label>
      <button type="button" class="ghost-button" data-energy-remove-time>Remove</button>
    </div>
  `;
}

function reminderLabelForIndex(index) {
  return REMINDER_LABELS[index] || `Check-in ${index + 1}`;
}

function readMaxCheckins(input, widget) {
  if (!input) {
    return normalizeMaxCheckins(widget.settings.maxCheckins);
  }
  return normalizeMaxCheckins(input.value || widget.settings.maxCheckins);
}

function collectReminderTimes(editor, maxCheckins) {
  if (!editor) {
    return normalizeReminderTimes([], maxCheckins);
  }
  const values = Array.from(editor.querySelectorAll("[data-energy-time-input]"))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
  const normalized = normalizeReminderTimes(values, maxCheckins);
  if (normalized.length !== values.length) {
    return null;
  }
  return normalized;
}

function syncReminderLabels(editor) {
  if (!editor) {
    return;
  }
  Array.from(editor.querySelectorAll(".energy-time-row")).forEach((row, index) => {
    const label = row.querySelector("label span");
    if (label) {
      label.textContent = reminderLabelForIndex(index);
    }
  });
}

function applyReminderSettings(widget, nextReminderTimes, helpers) {
  const store = helpers.getStore();
  const maxCheckins = normalizeMaxCheckins(widget.settings.maxCheckins);
  const reminderTimes = normalizeReminderTimes(nextReminderTimes, maxCheckins);
  const existingTemplates = store.tasks
    .filter((task) => isOpenEnergyReminderTemplate(task, widget.id))
    .sort((left, right) => parseReminderIndex(left.ownerTaskKey) - parseReminderIndex(right.ownerTaskKey));
  const templateAssignments = matchReminderTemplates(existingTemplates, reminderTimes);
  const assignedTemplates = new Set(templateAssignments.values());

  for (const template of existingTemplates) {
    if (!assignedTemplates.has(template)) {
      helpers.retireWidgetOwnedSeries(template);
    }
  }

  for (let index = 0; index < reminderTimes.length; index += 1) {
    const time = reminderTimes[index];
    const template = templateAssignments.get(index) || null;
    if (template) {
      template.name = "Energy check-in";
      template.timeOfDay = time;
      template.lateGraceMinutes = ENERGY_LATE_GRACE_MINUTES;
      template.notBeforeAt = startOfDayTimestamp(template.dueDate || template.startDate || helpers.todayString());
      template.ownerTaskKey = `energy-reminder-${index}`;
      template.widgetTaskKind = "energy-checkin";
      template.widgetTaskMeta = buildEnergyTaskMeta({
        ownerTaskKey: template.ownerTaskKey,
        reminderIndex: index,
        timeOfDay: time,
        slotCount: reminderTimes.length
      });
      template.linkedSeries = {
        groupId: `${widget.id}:energy-checkins`,
        kind: "daily-window",
        slotIndex: index,
        slotCount: reminderTimes.length
      };
      template.sequenceDependencyId = "";
      template.widgetCompletion = {
        mechanism: "energy-vote",
        lockout: "scheduled-window"
      };
      template.skipRule = {
        type: "widget-lockout",
        policy: "energy-next-window"
      };
      template.recurrence = {
        type: "daily",
        interval: 1,
        weekday: 0,
        day: 1,
        ordinal: "first",
        endDate: "",
        count: null,
        forever: true
      };
      helpers.regenerateSeries(template.id, { preserveClosed: true });
      continue;
    }

    const nextTemplate = buildReminderTemplate({
      widget,
      helpers,
      store,
      reminderTimes,
      index,
      time
    });
    store.tasks.unshift(nextTemplate);
    helpers.regenerateSeries(nextTemplate.id, { preserveClosed: false });
  }

  widget.settings.reminderTimes = reminderTimes;
  widget.updatedAt = Date.now();
  syncEnergyTaskChain(store.tasks, widget.id);
  helpers.reconcileRecurringSeries();
  helpers.persistStore();
  helpers.renderAll();
  helpers.setSyncStatus(`Updated Energy to ${reminderTimes.length} daily check-in${reminderTimes.length === 1 ? "" : "s"}.`, "success");
}

function matchReminderTemplates(existingTemplates, reminderTimes) {
  const assignments = new Map();
  const unusedTemplates = [...existingTemplates];

  reminderTimes.forEach((time, index) => {
    const exactMatchIndex = unusedTemplates.findIndex((template) => template.timeOfDay === time);
    if (exactMatchIndex !== -1) {
      assignments.set(index, unusedTemplates.splice(exactMatchIndex, 1)[0]);
    }
  });

  reminderTimes.forEach((_, index) => {
    if (assignments.has(index)) {
      return;
    }
    if (unusedTemplates.length > 0) {
      assignments.set(index, unusedTemplates.shift());
    }
  });

  return assignments;
}

export function syncEnergyTaskChain(tasks, widgetId) {
  const sequence = listEnergyScheduledTasks(tasks, widgetId, { openOnly: false });
  const slotCount = new Set(
    tasks
      .filter((task) => task.ownerWidgetId === widgetId && task.ownerTaskKey?.startsWith("energy-reminder-"))
      .map((task) => parseReminderIndex(task.ownerTaskKey))
      .filter((index) => index >= 0)
  ).size || 1;

  for (const task of tasks) {
    if (
      task.ownerWidgetId === widgetId
      && task.ownerWidgetType === ENERGY_WIDGET_TYPE
      && (task.ownerTaskKey?.startsWith("energy-reminder-") || task.widgetCompletion?.mechanism === "energy-vote")
    ) {
      const slotIndex = Math.max(parseReminderIndex(task.ownerTaskKey), 0);
      task.lateGraceMinutes = ENERGY_LATE_GRACE_MINUTES;
      task.notBeforeAt = startOfDayTimestamp(task.dueDate || task.startDate || toDateString(new Date()));
      task.name = "Energy check-in";
      task.widgetTaskKind = "energy-checkin";
      task.widgetTaskMeta = buildEnergyTaskMeta({
        ownerTaskKey: task.ownerTaskKey || `energy-reminder-${slotIndex}`,
        reminderIndex: slotIndex,
        timeOfDay: task.timeOfDay || "",
        slotCount
      });
      task.linkedSeries = {
        groupId: `${widgetId}:energy-checkins`,
        kind: "daily-window",
        slotIndex,
        slotCount
      };
      task.sequenceDependencyId = "";
      task.dependencies = [];
      task.widgetCompletion = {
        mechanism: "energy-vote",
        lockout: "scheduled-window"
      };
      task.skipRule = {
        type: "widget-lockout",
        policy: "energy-next-window"
      };
    }
  }

  let previous = null;
  for (const task of sequence) {
    task.sequenceDependencyId = previous ? previous.id : "";
    previous = task;
  }
}

export function repairEnergyReminderTemplates(tasks, widgetId, {
  reminderTimes = DEFAULT_ENERGY_REMINDER_TIMES,
  today = toDateString(new Date()),
  now = new Date(),
  regenerateSeries = null
} = {}) {
  const normalizedReminderTimes = normalizeReminderTimes(reminderTimes);
  const changedTemplateIds = [];

  normalizedReminderTimes.forEach((time, index) => {
    const ownerTaskKey = `energy-reminder-${index}`;
    const template = findActiveEnergyReminderTemplate(tasks, widgetId, ownerTaskKey);

    if (!template || template.status !== "open") {
      return;
    }

    const expectedDate = computeInitialReminderDate(today, normalizedReminderTimes, index, now);
    const currentDate = template.dueDate || template.startDate || "";
    if (!currentDate || currentDate <= expectedDate) {
      return;
    }

    let changed = false;
    if (template.startDate !== expectedDate) {
      template.startDate = expectedDate;
      changed = true;
    }
    if (template.dueDate !== expectedDate) {
      template.dueDate = expectedDate;
      changed = true;
    }
    if (template.timeOfDay !== time) {
      template.timeOfDay = time;
      changed = true;
    }
    const nextNotBeforeAt = startOfDayTimestamp(expectedDate);
    if (template.notBeforeAt !== nextNotBeforeAt) {
      template.notBeforeAt = nextNotBeforeAt;
      changed = true;
    }

    if (changed) {
      changedTemplateIds.push(template.id);
    }
  });

  if (typeof regenerateSeries === "function") {
    for (const templateId of changedTemplateIds) {
      regenerateSeries(templateId);
    }
  }

  return changedTemplateIds;
}

function findActiveEnergyReminderTemplate(tasks, widgetId, ownerTaskKey) {
  return listEnergyReminderTemplates(tasks, widgetId, ownerTaskKey)
    .find((task) => task.archived !== true && task.status === "open") || null;
}

function listEnergyReminderTemplates(tasks, widgetId, ownerTaskKey) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => isEnergyReminderTemplate(task, widgetId, ownerTaskKey));
}

function isEnergyReminderTemplate(task, widgetId, ownerTaskKey = "") {
  if (!task || task.ownerWidgetId !== widgetId || task.ownerWidgetType !== ENERGY_WIDGET_TYPE) {
    return false;
  }
  if (ownerTaskKey && task.ownerTaskKey !== ownerTaskKey) {
    return false;
  }
  if (task.templateId) {
    return false;
  }
  const recurrenceType = String(task?.recurrence?.type || "none");
  return recurrenceType !== "none" && recurrenceType !== "generated" && recurrenceType !== "archived-series";
}

function isOpenEnergyReminderTemplate(task, widgetId) {
  return isEnergyReminderTemplate(task, widgetId)
    && task.archived !== true
    && task.status === "open";
}

function selectEnergyReminderGoogleLinkCarrier(templates) {
  const linkedTemplate = (Array.isArray(templates) ? templates : []).find((task) => {
    const eventId = typeof task?.googleCalendar?.eventId === "string" ? task.googleCalendar.eventId.trim() : "";
    return Boolean(eventId);
  });
  if (!linkedTemplate) {
    return null;
  }
  return {
    ...(linkedTemplate.googleCalendar && typeof linkedTemplate.googleCalendar === "object" ? linkedTemplate.googleCalendar : {})
  };
}

function demoteStaleEnergyReminderTemplate(task) {
  task.recurrence = {
    type: "none",
    interval: 1,
    weekday: 0,
    day: 1,
    ordinal: "first",
    endDate: "",
    count: null,
    forever: false
  };
  task.googleCalendar = {
    ...(task.googleCalendar && typeof task.googleCalendar === "object" ? task.googleCalendar : {}),
    eventId: "",
    recurringEventId: "",
    linkedAt: 0,
    lastSeenGoogleUpdatedAt: "",
    scheduleFingerprint: "",
    statusMirroredAt: 0
  };
  task.sequenceDependencyId = "";
}

export function findActiveEnergyCompletionTask(tasks, widgetId, mechanism = "energy-vote", at = Date.now()) {
  const now = at instanceof Date ? at : new Date(at);
  const sequence = listEnergyScheduledTasks(tasks, widgetId, { openOnly: false }).filter((task) => task.widgetCompletion?.mechanism === mechanism);

  for (let index = 0; index < sequence.length; index += 1) {
    const task = sequence[index];
    if (task.status !== "open") {
      continue;
    }
    const previousTask = sequence[index - 1] || null;
    const nextTask = sequence[index + 1] || null;
    if (previousTask && previousTask.status === "open") {
      continue;
    }
    if (isEnergyTaskActiveWindow(task, nextTask, now)) {
      return task;
    }
  }

  return null;
}

function nextWidgetTaskDate(tasks, widgetId, ownerTaskKey, today, reminderTimes = DEFAULT_ENERGY_REMINDER_TIMES, reminderIndex = 0, now = new Date()) {
  const earliestOpenScheduled = tasks
    .filter((task) => (
      task.ownerWidgetId === widgetId
      && task.ownerTaskKey === ownerTaskKey
      && !task.archived
      && task.status === "open"
    ))
    .map((task) => task.dueDate || task.startDate || "")
    .filter(Boolean)
    .sort()
    [0];

  if (earliestOpenScheduled) {
    return earliestOpenScheduled < today ? today : earliestOpenScheduled;
  }

  return computeInitialReminderDate(today, reminderTimes, reminderIndex, now);
}

export function computeInitialReminderDate(today, reminderTimes, reminderIndex, now = new Date()) {
  const reminderTime = Array.isArray(reminderTimes) ? String(reminderTimes[reminderIndex] || "") : "";
  if (!/^\d{2}:\d{2}$/.test(reminderTime)) {
    return today;
  }
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return currentTime > reminderTime ? addDaysToDateString(today, 1) : today;
}

function addDaysToDateString(value, days) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function hasActiveReminderTask(tasks, widgetId, at = Date.now()) {
  return Boolean(findActiveEnergyCompletionTask(tasks, widgetId, "energy-vote", at));
}

function describeReminderState(tasks, widgetId, formatDateTime) {
  const sequence = listEnergyScheduledTasks(Array.isArray(tasks) ? tasks : [], widgetId, { openOnly: false });
  const activeTask = findActiveEnergyCompletionTask(sequence, widgetId, "energy-vote", Date.now());
  if (activeTask) {
    return `Due now: ${activeTask.name} at ${formatDateTime(taskDueTimestamp(activeTask))}`;
  }

  const nextOpenTask = sequence.find((task) => task.status === "open");
  if (nextOpenTask) {
    return `Next due: ${nextOpenTask.name} at ${formatDateTime(taskDueTimestamp(nextOpenTask))}`;
  }

  return "No Energy reminder task is currently queued.";
}

function describeVoteIntent(tasks, widgetId, formatDateTime) {
  const sequence = listEnergyScheduledTasks(Array.isArray(tasks) ? tasks : [], widgetId, { openOnly: false });
  const activeTask = findActiveEnergyCompletionTask(sequence, widgetId, "energy-vote", Date.now());
  if (activeTask) {
    return `This vote will complete ${activeTask.name}, due at ${formatDateTime(taskDueTimestamp(activeTask))}.`;
  }
  return "No reminder is due right now. This vote will be stored independently of the reminder chain.";
}

function describeEnergyShellSummary(tasks, widgetId, formatDateTime) {
  const sequence = listEnergyScheduledTasks(Array.isArray(tasks) ? tasks : [], widgetId, { openOnly: false });
  const activeTask = findActiveEnergyCompletionTask(sequence, widgetId, "energy-vote", Date.now());
  if (activeTask) {
    return {
      primary: `Due now: ${formatEnergyReminderLabel(activeTask)} · ${formatDateTime(taskDueTimestamp(activeTask))}`,
      secondary: "Vote now to complete this check-in."
    };
  }

  const nextOpenTask = sequence.find((task) => task.status === "open");
  if (nextOpenTask) {
    return {
      primary: `Next due: ${formatEnergyReminderLabel(nextOpenTask)} · ${formatDateTime(taskDueTimestamp(nextOpenTask))}`,
      secondary: "Votes right now will be stored as extra readings."
    };
  }

  return {
    primary: "No future check-ins queued",
    secondary: "Votes right now will be stored as extra readings."
  };
}

function formatEnergyReminderLabel(task) {
  const label = task?.widgetTaskMeta?.reminderLabel;
  if (typeof label === "string" && label.trim()) {
    return `${label} check-in`;
  }
  return task?.name || "Energy check-in";
}

function formatReminderTime(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return value;
  }
  return new Date(2000, 0, 1, hour, minute, 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function listEnergyScheduledTasks(tasks, widgetId, { openOnly = true } = {}) {
  return tasks
    .filter((task) =>
      task.ownerWidgetId === widgetId
      && task.ownerWidgetType === ENERGY_WIDGET_TYPE
      && !task.archived
      && (!openOnly || task.status === "open")
      && (task.ownerTaskKey?.startsWith("energy-reminder-") || task.widgetCompletion?.mechanism === "energy-vote")
    )
    .sort(compareTaskSchedule);
}

function isEnergyTaskActiveWindow(task, nextTask, now) {
  const start = taskDueTimestamp(task);
  if (!start || now.getTime() < start) {
    return false;
  }

  const end = nextTask ? taskDueTimestamp(nextTask) : null;
  return end ? now.getTime() < end : true;
}

function taskDueTimestamp(task) {
  const date = task.dueDate || task.startDate || "";
  const time = task.timeOfDay || "";
  if (!date || !time) {
    return 0;
  }
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function parseReminderIndex(ownerTaskKey) {
  const match = String(ownerTaskKey || "").match(/energy-reminder-(\d+)/);
  return match ? Number(match[1]) : -1;
}

function buildEnergyTaskMeta({ ownerTaskKey, reminderIndex, timeOfDay, slotCount }) {
  const normalizedIndex = Number.isInteger(reminderIndex) && reminderIndex >= 0 ? reminderIndex : 0;
  const reminderLabel = reminderLabelForIndex(normalizedIndex);
  return {
    reminderIndex: normalizedIndex,
    reminderLabel,
    timeOfDay: typeof timeOfDay === "string" ? timeOfDay : "",
    slotCount: Number.isInteger(slotCount) && slotCount > 0 ? slotCount : 1,
    recurrenceType: "daily",
    slotKey: typeof ownerTaskKey === "string" ? ownerTaskKey : `energy-reminder-${normalizedIndex}`
  };
}

function startOfDayTimestamp(dateString) {
  const timestamp = new Date(`${dateString}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function filterEntriesByRange(entries, range) {
  if (range === "all") {
    return [...entries];
  }
  const rangeMs = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000
  };
  const cutoff = Date.now() - (rangeMs[range] || rangeMs["7d"]);
  return entries.filter((entry) => entry.at >= cutoff);
}

function renderEnergyShellTrend(entries, escapeHtml, formatDateTime) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return `
      <div class="energy-widget-trend-empty">
        Log a few votes to see your recent energy trend here.
      </div>
    `;
  }

  const width = 240;
  const height = 92;
  const padding = { top: 10, right: 10, bottom: 14, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minTime = entries[0].at;
  const maxTime = entries[entries.length - 1].at;
  const timeSpan = Math.max(maxTime - minTime, 1);

  const points = entries.map((entry) => {
    const x = padding.left + ((entry.at - minTime) / timeSpan) * chartWidth;
    const y = padding.top + chartHeight - ((entry.level - 1) / 4) * chartHeight;
    return { entry, x, y };
  });
  const pathPoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const latest = entries[entries.length - 1];

  return `
    <div class="energy-widget-trend-graphic">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`Energy levels over the last 3 days, latest ${latest.level} at ${formatDateTime(latest.at)}.`)}">
        <defs>
          <linearGradient id="energy-shell-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255, 140, 66, 0.24)" />
            <stop offset="100%" stop-color="rgba(255, 140, 66, 0.02)" />
          </linearGradient>
        </defs>
        <path d="M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L ")} L ${points[points.length - 1].x.toFixed(1)} ${(height - padding.bottom).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height - padding.bottom).toFixed(1)} Z" fill="url(#energy-shell-fill)" />
        <polyline fill="none" stroke="#ff8c42" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${pathPoints}" />
        ${points.map(({ entry, x, y }) => {
          const option = ENERGY_LEVELS.find((item) => item.level === entry.level);
          return `
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${entry.source === "extra" ? "4" : "5.5"}" fill="${option?.accent || "#ff8c42"}" stroke="${entry.source === "extra" ? "#20344a" : "rgba(255,255,255,0.86)"}" stroke-width="${entry.source === "extra" ? "1.5" : "2"}">
              <title>${escapeHtml(`${entry.level}/5 at ${formatDateTime(entry.at)}${entry.source === "extra" ? " • extra log" : ""}`)}</title>
            </circle>
          `;
        }).join("")}
      </svg>
      <div class="energy-widget-trend-footer">
        <span>${escapeHtml(formatCompactEnergyDate(entries[0].at))}</span>
        <span>${escapeHtml(formatCompactEnergyDate(latest.at))}</span>
      </div>
    </div>
  `;
}

function formatCompactEnergyDate(timestamp) {
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function drawEnergyChart(canvas, emptyState, entries) {
  const ctx = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(bounds.width));
  const height = Math.max(260, Math.floor(bounds.height));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (entries.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  const padding = { top: 18, right: 20, bottom: 56, left: 46 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minTime = entries[0].at;
  const maxTime = entries[entries.length - 1].at;
  const timeSpan = Math.max(maxTime - minTime, 1);

  ctx.fillStyle = "#f6efe4";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(56, 72, 93, 0.18)";
  ctx.lineWidth = 1;

  for (let level = 1; level <= 5; level += 1) {
    const y = padding.top + chartHeight - ((level - 1) / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#546070";
    ctx.font = "12px monospace";
    ctx.fillText(String(level), 18, y + 4);
  }

  ctx.strokeStyle = "#20344a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.strokeStyle = "#ff7f50";
  ctx.lineWidth = 3;
  ctx.beginPath();
  entries.forEach((entry, index) => {
    const x = padding.left + ((entry.at - minTime) / timeSpan) * chartWidth;
    const y = padding.top + chartHeight - ((entry.level - 1) / 4) * chartHeight;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  entries.forEach((entry) => {
    const x = padding.left + ((entry.at - minTime) / timeSpan) * chartWidth;
    const y = padding.top + chartHeight - ((entry.level - 1) / 4) * chartHeight;
    const option = ENERGY_LEVELS.find((item) => item.level === entry.level);
    ctx.fillStyle = option?.accent || "#ff7f50";
    ctx.beginPath();
    ctx.arc(x, y, entry.source === "extra" ? 4 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (entry.source === "extra") {
      ctx.strokeStyle = "#20344a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  drawAxisLabels(ctx, entries, padding, chartWidth, width, height);
}

function drawAxisLabels(ctx, entries, padding, chartWidth, width, height) {
  const candidateCount = Math.min(5, entries.length);
  const candidateIndexes = [];
  const used = new Set();
  const minTime = entries[0].at;
  const maxTime = entries[entries.length - 1].at;
  const timeSpan = Math.max(maxTime - minTime, 1);

  for (let index = 0; index < candidateCount; index += 1) {
    const entryIndex = Math.round((index / Math.max(candidateCount - 1, 1)) * (entries.length - 1));
    if (used.has(entryIndex)) {
      continue;
    }
    used.add(entryIndex);
    candidateIndexes.push(entryIndex);
  }

  const labels = candidateIndexes.map((entryIndex, position) => {
    const entry = entries[entryIndex];
    const text = formatAxisTime(entry.at);
    const rawX = padding.left + ((entry.at - minTime) / timeSpan) * chartWidth;
    const textWidth = ctx.measureText(text).width;
    const align = position === 0 ? "left" : (position === candidateIndexes.length - 1 ? "right" : "center");
    let drawX = rawX;
    if (align === "left") {
      drawX = Math.max(padding.left, Math.min(rawX, width - padding.right - textWidth));
    } else if (align === "right") {
      drawX = Math.min(width - padding.right, Math.max(rawX, padding.left + textWidth));
    } else {
      drawX = Math.max(padding.left + textWidth / 2, Math.min(rawX, width - padding.right - textWidth / 2));
    }
    const left = align === "left" ? drawX : (align === "right" ? drawX - textWidth : drawX - textWidth / 2);
    const right = left + textWidth;
    return { text, drawX, left, right, align };
  });

  const accepted = [];
  ctx.fillStyle = "#546070";
  ctx.font = "12px monospace";

  for (const label of labels) {
    const overlaps = accepted.some((item) => !(label.right + 10 < item.left || label.left - 10 > item.right));
    if (overlaps) {
      continue;
    }
    accepted.push(label);
  }

  for (const label of accepted) {
    ctx.textAlign = label.align;
    ctx.fillText(label.text, label.drawX, height - 14);
  }

  ctx.textAlign = "start";
}

function formatAxisTime(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric"
  });
}
