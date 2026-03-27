export const WORKOUT_WIDGET_TYPE = "workout";

const DEFAULT_WEIGHT_UNIT = "lb";
const DEFAULT_WORKOUT_INTENSITY = "moderate";
const DEFAULT_WORKOUT_TIME = "07:00";
const WORKOUT_COMPLETION_MECHANISM = "workout-log";
const WEIGHT_COMPLETION_MECHANISM = "weight-log";
const WORKOUT_INTENSITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" }
];
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

export const workoutWidgetDefinition = {
  type: WORKOUT_WIDGET_TYPE,
  title: "Workout Coach",
  detailTitle: "Workout plans and tracking",
  detailSubtitle: "Plan workouts, track duration and intensity, and log weight from one widget.",
  ownerLabel: "Workout Coach",
  menuLabel: "Add Workout Coach",
  menuDescription: "Manage recurring workouts and optional weight tracking from one panel.",
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
      type: WORKOUT_WIDGET_TYPE,
      slotIndex,
      settings: {
        workoutPlans: [],
        weightTracking: {
          enabled: true,
          unit: DEFAULT_WEIGHT_UNIT,
          allowOpenLogging: true,
          schedule: null
        }
      },
      data: {
        workoutEntries: [],
        weightEntries: []
      },
      createdAt: now,
      updatedAt: now
    };
  },

  normalizeWidget(widget, { createId, now, maxWidgets }) {
    if (!widget || typeof widget !== "object") {
      return null;
    }

    return {
      id: typeof widget.id === "string" ? widget.id : createId(),
      type: WORKOUT_WIDGET_TYPE,
      slotIndex: normalizeSlotIndex(widget.slotIndex, maxWidgets || 5),
      settings: {
        workoutPlans: normalizeWorkoutPlans(widget.settings?.workoutPlans),
        weightTracking: normalizeWeightTracking(widget.settings?.weightTracking)
      },
      data: {
        workoutEntries: normalizeWorkoutEntries(widget.data?.workoutEntries),
        weightEntries: normalizeWeightEntries(widget.data?.weightEntries)
      },
      createdAt: typeof widget.createdAt === "number" ? widget.createdAt : now,
      updatedAt: typeof widget.updatedAt === "number" ? widget.updatedAt : now
    };
  },

  getUpdatedAt(widget) {
    const latestWorkout = widget?.data?.workoutEntries?.[widget.data.workoutEntries.length - 1];
    const latestWeight = widget?.data?.weightEntries?.[widget.data.weightEntries.length - 1];
    const latestPlan = widget?.settings?.workoutPlans?.reduce((max, plan) => Math.max(max, plan.updatedAt || 0), 0) || 0;
    return Math.max(latestWorkout?.at || 0, latestWeight?.at || 0, latestPlan, widget?.updatedAt || 0, widget?.createdAt || 0);
  },

  ensureTasks({ widget, store, helpers }) {
    syncWorkoutOwnedTaskTemplates(widget, store, helpers);
  },

  render({ widget, escapeHtml, formatDateTime }) {
    const planCount = widget.settings.workoutPlans.length;
    const latestWorkout = widget.data.workoutEntries[widget.data.workoutEntries.length - 1] || null;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;
    const dailyPlans = widget.settings.workoutPlans.filter((plan) => plan.recurrence?.type === "daily").length;
    const weeklyPlans = widget.settings.workoutPlans.filter((plan) => plan.recurrence?.type === "weekly").length;

    return `
      <div class="widget-slot-header">
        <div>
          <h3>Workout Coach</h3>
          <p>Track workout plans, daily or weekly progress, and optional weight logs.</p>
        </div>
        <span class="widget-badge">Scaffold</span>
      </div>
      <p>Workout plans: <strong>${planCount}</strong> (${dailyPlans} daily, ${weeklyPlans} weekly)</p>
      <p>${latestWorkout ? `Latest workout: ${escapeHtml(latestWorkout.workoutType || "Workout")} at ${formatDateTime(latestWorkout.at)}` : "No workout logs yet."}</p>
      <p>${latestWeight ? `Latest weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight logs yet."}</p>
      <div class="widget-actions">
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
        <button type="button" class="ghost-button" data-widget-action="remove-widget">Remove widget</button>
      </div>
    `;
  },

  renderDetail({ widget, tasks, escapeHtml, formatDateTime }) {
    const latestWorkout = widget.data.workoutEntries[widget.data.workoutEntries.length - 1] || null;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;
    const weightTracking = widget.settings.weightTracking;
    const planDraft = createPlanDraft();
    const ownedTemplateCount = tasks.filter((task) => isWorkoutOwnedTemplate(task, widget.id)).length;
    const progressView = buildWorkoutProgressView(tasks, widget.id);

    return `
      <section class="energy-detail">
        <div class="energy-detail-grid">
          <section class="energy-detail-card energy-settings-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Progress</p>
                <h3>Current period progress</h3>
                <p class="sync-status">Repeated same-period instances are rolled up into one tracked card per plan.</p>
              </div>
            </div>
            <div class="workout-progress-grid">
              <section class="workout-progress-section">
                <div class="workout-progress-section-header">
                  <h4>Today</h4>
                  <span>${progressView.dailyCards.length}</span>
                </div>
                <div class="workout-progress-list">
                  ${progressView.dailyCards.length
                    ? progressView.dailyCards.map((card) => renderWorkoutProgressCard(card, escapeHtml)).join("")
                    : `<p class="empty-state">No daily workout or weight tasks are scheduled today.</p>`}
                </div>
              </section>
              <section class="workout-progress-section">
                <div class="workout-progress-section-header">
                  <h4>This week</h4>
                  <span>${progressView.weeklyCards.length}</span>
                </div>
                <div class="workout-progress-list">
                  ${progressView.weeklyCards.length
                    ? progressView.weeklyCards.map((card) => renderWorkoutProgressCard(card, escapeHtml)).join("")
                    : `<p class="empty-state">No weekly workout or weight tasks are scheduled in this calendar week.</p>`}
                </div>
              </section>
            </div>
          </section>

          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Workout plans</p>
                <h3>Plan workouts</h3>
                <p class="sync-status">Create daily or weekly workout plans with linked schedule details. These plans are the source of truth for the widget's future tasks.</p>
              </div>
            </div>
            <form class="workout-plan-form" data-workout-plan-form data-editing-plan-id="">
              <div class="quick-add-grid">
                <label class="quick-add-title">
                  <span>Workout type</span>
                  <input type="text" maxlength="80" value="${escapeHtml(planDraft.workoutType)}" placeholder="Strength, run, yoga, swim..." data-workout-plan-type required />
                </label>
                <label>
                  <span>Duration (minutes)</span>
                  <input type="number" min="1" max="600" step="1" value="${planDraft.durationMinutes}" data-workout-plan-duration required />
                </label>
                <label>
                  <span>Intensity</span>
                  <select data-workout-plan-intensity>
                    ${WORKOUT_INTENSITY_OPTIONS.map((option) => `
                      <option value="${option.value}" ${planDraft.intensity === option.value ? "selected" : ""}>${option.label}</option>
                    `).join("")}
                  </select>
                </label>
                <label>
                  <span>Pattern</span>
                  <select data-workout-plan-pattern>
                    <option value="daily" selected>Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  <span>Every</span>
                  <input type="number" min="1" max="30" step="1" value="${planDraft.recurrence.interval}" data-workout-plan-interval />
                </label>
                <label>
                  <span>Time of day</span>
                  <input type="time" value="${escapeHtml(planDraft.recurrence.timeOfDay)}" data-workout-plan-time />
                </label>
              </div>
              <div class="workout-recurrence-panel" data-workout-daily-panel>
                <div class="energy-detail-header">
                  <div>
                    <h3>Additional same-day times</h3>
                    <p class="sync-status">Use these to create linked daily instances after the main time above.</p>
                  </div>
                </div>
                <div class="energy-reminder-editor" data-workout-additional-times>
                  ${renderAdditionalTimeInputs(planDraft.recurrence.additionalTimes, escapeHtml)}
                </div>
                <div class="widget-actions workout-inline-actions">
                  <button type="button" class="ghost-button" data-workout-add-time>Add time</button>
                </div>
              </div>
              <div class="workout-recurrence-panel hidden" data-workout-weekly-panel>
                <div class="weekday-picker-panel">
                  <span>Days in the week</span>
                  <div class="weekday-picker">
                    ${renderWeekdayOptions(planDraft.recurrence.weekdays)}
                  </div>
                </div>
              </div>
              <div class="widget-actions workout-inline-actions">
                <button type="submit" class="primary-button">Save plan</button>
                <button type="button" class="ghost-button hidden" data-workout-cancel-edit>Cancel edit</button>
              </div>
            </form>
            <p class="sync-status">These plans already create widget-owned recurring task templates. The next step will add richer progress rollups and widget-driven completion logging.</p>
          </section>

          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Saved plans</p>
                <h3>Current workout plans</h3>
                <p class="sync-status">${widget.settings.workoutPlans.length ? `Edit or remove stored workout plans here. ${ownedTemplateCount} widget-owned template${ownedTemplateCount === 1 ? "" : "s"} currently exist.` : "No plans yet. Save one from the editor to start building the widget schedule."}</p>
              </div>
            </div>
            <div class="workout-plan-list">
              ${widget.settings.workoutPlans.length
                ? widget.settings.workoutPlans.map((plan) => renderWorkoutPlanCard(plan, escapeHtml)).join("")
                : `<p class="empty-state">No workout plans yet.</p>`}
            </div>
          </section>

          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Weight</p>
                <h3>Weight logging</h3>
                <p class="sync-status">Weight will support open logs and optional scheduled check-ins that complete widget-owned tasks when due.</p>
              </div>
            </div>
            <p>Tracking: <strong>${weightTracking.enabled ? "On" : "Off"}</strong></p>
            <p>Unit: <strong>${escapeHtml(weightTracking.unit)}</strong></p>
            <p>${latestWeight ? `Latest logged weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight entries yet."}</p>
          </section>

          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">History</p>
                <h3>Recent activity</h3>
                <p class="sync-status">Workout and weight history will live here once the logging flow is implemented.</p>
              </div>
            </div>
            <p>${latestWorkout ? `Latest workout: ${escapeHtml(describeWorkoutEntry(latestWorkout))} at ${formatDateTime(latestWorkout.at)}` : "No workout entries yet."}</p>
            <p>${latestWeight ? `Latest weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight entries yet."}</p>
          </section>
        </div>
      </section>
    `;
  },

  mountDetail({ widget, container, helpers }) {
    const form = container.querySelector("[data-workout-plan-form]");
    const patternInput = container.querySelector("[data-workout-plan-pattern]");
    const dailyPanel = container.querySelector("[data-workout-daily-panel]");
    const weeklyPanel = container.querySelector("[data-workout-weekly-panel]");
    const additionalTimes = container.querySelector("[data-workout-additional-times]");
    const cancelEditButton = container.querySelector("[data-workout-cancel-edit]");

    if (!form || !patternInput || !dailyPanel || !weeklyPanel || !additionalTimes) {
      return null;
    }

    const syncPanels = () => {
      const isDaily = patternInput.value !== "weekly";
      dailyPanel.classList.toggle("hidden", !isDaily);
      weeklyPanel.classList.toggle("hidden", isDaily);
    };

    const resetForm = () => {
      form.reset();
      form.setAttribute("data-editing-plan-id", "");
      const freshDraft = createPlanDraft();
      form.querySelector("[data-workout-plan-duration]").value = String(freshDraft.durationMinutes);
      form.querySelector("[data-workout-plan-intensity]").value = freshDraft.intensity;
      patternInput.value = freshDraft.recurrence.type;
      form.querySelector("[data-workout-plan-interval]").value = String(freshDraft.recurrence.interval);
      form.querySelector("[data-workout-plan-time]").value = freshDraft.recurrence.timeOfDay;
      replaceAdditionalTimes(additionalTimes, freshDraft.recurrence.additionalTimes);
      setSelectedWeekdays(container, freshDraft.recurrence.weekdays);
      cancelEditButton?.classList.add("hidden");
      syncPanels();
    };

    const populateForm = (plan) => {
      form.setAttribute("data-editing-plan-id", plan.id);
      form.querySelector("[data-workout-plan-type]").value = plan.workoutType || plan.name || "";
      form.querySelector("[data-workout-plan-duration]").value = String(plan.durationMinutes || 30);
      form.querySelector("[data-workout-plan-intensity]").value = plan.intensity || DEFAULT_WORKOUT_INTENSITY;
      patternInput.value = plan.recurrence?.type || "daily";
      form.querySelector("[data-workout-plan-interval]").value = String(plan.recurrence?.interval || 1);
      form.querySelector("[data-workout-plan-time]").value = plan.recurrence?.timeOfDay || DEFAULT_WORKOUT_TIME;
      replaceAdditionalTimes(additionalTimes, plan.recurrence?.additionalTimes || []);
      setSelectedWeekdays(container, plan.recurrence?.weekdays || []);
      cancelEditButton?.classList.remove("hidden");
      syncPanels();
    };

    const clickHandler = (event) => {
      const addTimeButton = event.target.closest("[data-workout-add-time]");
      if (addTimeButton) {
        const row = document.createElement("div");
        row.className = "energy-time-row";
        row.innerHTML = renderAdditionalTimeRow(DEFAULT_WORKOUT_TIME);
        additionalTimes.appendChild(row);
        return;
      }

      const removeTimeButton = event.target.closest("[data-workout-remove-time]");
      if (removeTimeButton) {
        removeTimeButton.closest(".energy-time-row")?.remove();
        return;
      }

      const editButton = event.target.closest("[data-workout-edit-plan]");
      if (editButton) {
        const planId = editButton.getAttribute("data-plan-id") || "";
        const plan = widget.settings.workoutPlans.find((entry) => entry.id === planId);
        if (!plan) {
          helpers.setSyncStatus("That workout plan could not be found.", "error");
          return;
        }
        populateForm(plan);
        return;
      }

      const deleteButton = event.target.closest("[data-workout-delete-plan]");
      if (deleteButton) {
        const planId = deleteButton.getAttribute("data-plan-id") || "";
        const before = widget.settings.workoutPlans.length;
        widget.settings.workoutPlans = widget.settings.workoutPlans.filter((entry) => entry.id !== planId);
        if (widget.settings.workoutPlans.length === before) {
          helpers.setSyncStatus("That workout plan could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        syncWorkoutOwnedTaskTemplates(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that workout plan.", "info");
        return;
      }

      const cancelEdit = event.target.closest("[data-workout-cancel-edit]");
      if (cancelEdit) {
        resetForm();
      }
    };

    const submitHandler = (event) => {
      event.preventDefault();
      const planId = form.getAttribute("data-editing-plan-id") || "";
      const workoutType = String(form.querySelector("[data-workout-plan-type]").value || "").trim().slice(0, 80);
      const durationMinutes = normalizeDurationMinutes(form.querySelector("[data-workout-plan-duration]").value);
      const intensity = normalizeWorkoutIntensity(form.querySelector("[data-workout-plan-intensity]").value);
      const pattern = patternInput.value === "weekly" ? "weekly" : "daily";
      const interval = normalizePositiveInteger(form.querySelector("[data-workout-plan-interval]").value, 1);
      const timeOfDay = normalizeTimeValue(form.querySelector("[data-workout-plan-time]").value, DEFAULT_WORKOUT_TIME);
      const selectedWeekdays = getSelectedWeekdays(container);
      const additionalTimeValues = collectAdditionalTimes(additionalTimes);

      if (!workoutType) {
        helpers.setSyncStatus("Workout type is required.", "error");
        return;
      }

      if (durationMinutes < 1) {
        helpers.setSyncStatus("Workout duration must be at least 1 minute.", "error");
        return;
      }

      if (pattern === "weekly" && selectedWeekdays.length === 0) {
        helpers.setSyncStatus("Choose at least one weekday for a weekly workout plan.", "error");
        return;
      }

      if (!additionalTimeValues) {
        helpers.setSyncStatus("Additional workout times must be valid and unique.", "error");
        return;
      }

      const now = Date.now();
      const existing = widget.settings.workoutPlans.find((entry) => entry.id === planId) || null;
      const nextPlan = {
        id: existing?.id || helpers.createId(),
        name: workoutType,
        workoutType,
        durationMinutes,
        intensity,
        recurrence: {
          type: pattern,
          interval,
          instancesPerPeriod: pattern === "daily" ? (1 + additionalTimeValues.length) : selectedWeekdays.length,
          weekdays: pattern === "weekly" ? selectedWeekdays : [],
          timeOfDay,
          additionalTimes: pattern === "daily" ? additionalTimeValues : []
        },
        categoryKey: "health",
        points: existing?.points || 3,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      const otherPlans = widget.settings.workoutPlans.filter((entry) => entry.id !== nextPlan.id);
      widget.settings.workoutPlans = [...otherPlans, nextPlan].sort(compareWorkoutPlanDisplay);
      widget.updatedAt = now;
      syncWorkoutOwnedTaskTemplates(widget, helpers.getStore(), helpers);
      helpers.persistStore();
      helpers.renderAll();
      helpers.setSyncStatus(existing ? `Updated the ${workoutType} workout plan.` : `Added ${workoutType} as a workout plan.`, "success");
    };

    patternInput.addEventListener("change", syncPanels);
    container.addEventListener("click", clickHandler);
    form.addEventListener("submit", submitHandler);
    syncPanels();

    return () => {
      patternInput.removeEventListener("change", syncPanels);
      container.removeEventListener("click", clickHandler);
      form.removeEventListener("submit", submitHandler);
    };
  }
};

function syncWorkoutOwnedTaskTemplates(widget, store, helpers) {
  const desiredTemplates = buildDesiredWorkoutTemplates(widget, store, helpers);
  const existingTemplates = store.tasks.filter((task) => isWorkoutOwnedTemplate(task, widget.id));
  const existingByKey = new Map(existingTemplates.map((task) => [task.ownerTaskKey || "", task]));
  const desiredKeys = new Set(desiredTemplates.map((task) => task.ownerTaskKey));

  for (const desired of desiredTemplates) {
    const existing = existingByKey.get(desired.ownerTaskKey) || null;
    if (!existing) {
      store.tasks.unshift(desired);
      helpers.regenerateSeries(desired.id, { preserveClosed: false });
      continue;
    }

    if (!workoutTemplateChanged(existing, desired)) {
      continue;
    }

    Object.assign(existing, {
      ...desired,
      id: existing.id,
      createdAt: existing.createdAt,
      status: existing.status,
      history: Array.isArray(existing.history) ? existing.history : [],
      pointsEntryId: existing.pointsEntryId || ""
    });
    helpers.regenerateSeries(existing.id, { preserveClosed: true });
  }

  for (const template of existingTemplates) {
    if (!desiredKeys.has(template.ownerTaskKey || "")) {
      helpers.retireWidgetOwnedSeries(template);
    }
  }
}

function buildDesiredWorkoutTemplates(widget, store, helpers) {
  const plans = normalizeWorkoutPlans(widget.settings?.workoutPlans);
  const desired = [];

  for (const plan of plans) {
    desired.push(...buildWorkoutSessionTemplates(widget, plan, helpers, store));
  }

  const weightSchedule = normalizeWeightSchedule(widget.settings?.weightTracking?.schedule);
  if (weightSchedule) {
    desired.push(...buildWeightCheckTemplates(widget, normalizeWeightTracking(widget.settings?.weightTracking), helpers, store));
  }

  return desired.sort(compareWorkoutOwnedTemplateSchedule);
}

function buildWorkoutSessionTemplates(widget, plan, helpers, store) {
  const recurrence = normalizeWorkoutRecurrence(plan.recurrence);
  if (!recurrence) {
    return [];
  }

  const slots = buildWorkoutSlots(recurrence);
  const groupId = `${widget.id}:workout-plan:${plan.id}`;
  const healthCategory = helpers.resolveCategorySnapshot("health");

  return slots.map((slot, slotIndex) => {
    const seedDate = recurrence.type === "weekly"
      ? alignDateToWeekdayOnOrAfter(helpers.todayString(), slot.weekday)
      : helpers.todayString();
    const ownerTaskKey = recurrence.type === "weekly"
      ? `workout-plan:${plan.id}:weekday:${slot.weekday}`
      : `workout-plan:${plan.id}:time:${slot.timeOfDay}`;
    return {
      id: helpers.createId(),
      templateId: "",
      occurrenceIndex: 0,
      name: plan.name || plan.workoutType || "Workout session",
      details: buildWorkoutTaskDetails(plan),
      startDate: seedDate,
      dueDate: seedDate,
      timeOfDay: slot.timeOfDay,
      lateGraceMinutes: 15,
      notBeforeAt: startOfDayTimestamp(seedDate),
      pointsValue: normalizePoints(plan.points),
      pointsEntryId: "",
      length: durationToTaskLength(plan.durationMinutes),
      categoryKey: healthCategory.key,
      categoryLabel: healthCategory.label,
      categoryColor: healthCategory.color,
      importance: "medium",
      status: "open",
      createdAt: Date.now() + slotIndex,
      ownerWidgetId: widget.id,
      ownerWidgetType: widget.type,
      ownerTaskKey,
      widgetTaskKind: "workout-session",
      widgetTaskMeta: {
        planId: plan.id,
        workoutType: plan.workoutType,
        durationMinutes: plan.durationMinutes,
        intensity: plan.intensity,
        recurrenceType: recurrence.type,
        slotKey: ownerTaskKey
      },
      linkedSeries: {
        groupId,
        kind: recurrence.type === "weekly" ? "weekly-window" : "daily-window",
        slotIndex,
        slotCount: slots.length
      },
      sequenceDependencyId: "",
      widgetCompletion: {
        mechanism: WORKOUT_COMPLETION_MECHANISM,
        lockout: "current-day"
      },
      skipRule: recurrence.type === "weekly"
        ? { type: "end-of-day" }
        : { type: "after-due-minutes", graceMinutes: 0 },
      dependencies: [],
      recurrence: buildTaskRecurrenceFromWorkoutSlot(recurrence, slot),
      history: []
    };
  });
}

function buildWeightCheckTemplates(widget, weightTracking, helpers) {
  const recurrence = normalizeWorkoutRecurrence(weightTracking.schedule?.recurrence);
  if (!recurrence) {
    return [];
  }

  const slots = buildWorkoutSlots(recurrence);
  const groupId = `${widget.id}:weight-checkins`;
  const healthCategory = helpers.resolveCategorySnapshot("health");

  return slots.map((slot, slotIndex) => {
    const seedDate = recurrence.type === "weekly"
      ? alignDateToWeekdayOnOrAfter(helpers.todayString(), slot.weekday)
      : helpers.todayString();
    const ownerTaskKey = recurrence.type === "weekly"
      ? `weight-checkin:weekday:${slot.weekday}`
      : `weight-checkin:time:${slot.timeOfDay}`;
    return {
      id: helpers.createId(),
      templateId: "",
      occurrenceIndex: 0,
      name: "Weight check-in",
      details: `Created by Workout Coach. Log your weight in ${weightTracking.unit}.`,
      startDate: seedDate,
      dueDate: seedDate,
      timeOfDay: slot.timeOfDay,
      lateGraceMinutes: 15,
      notBeforeAt: startOfDayTimestamp(seedDate),
      pointsValue: 1,
      pointsEntryId: "",
      length: "very-short",
      categoryKey: healthCategory.key,
      categoryLabel: healthCategory.label,
      categoryColor: healthCategory.color,
      importance: "medium",
      status: "open",
      createdAt: Date.now() + 100 + slotIndex,
      ownerWidgetId: widget.id,
      ownerWidgetType: widget.type,
      ownerTaskKey,
      widgetTaskKind: "weight-checkin",
      widgetTaskMeta: {
        unit: weightTracking.unit,
        recurrenceType: recurrence.type,
        slotKey: ownerTaskKey
      },
      linkedSeries: {
        groupId,
        kind: recurrence.type === "weekly" ? "weekly-window" : "daily-window",
        slotIndex,
        slotCount: slots.length
      },
      sequenceDependencyId: "",
      widgetCompletion: {
        mechanism: WEIGHT_COMPLETION_MECHANISM,
        lockout: "current-day"
      },
      skipRule: { type: "end-of-day" },
      dependencies: [],
      recurrence: buildTaskRecurrenceFromWorkoutSlot(recurrence, slot),
      history: []
    };
  });
}

function buildWorkoutSlots(recurrence) {
  if (recurrence.type === "weekly") {
    return normalizeWeekdays(recurrence.weekdays).map((weekday) => ({
      weekday,
      timeOfDay: recurrence.timeOfDay
    }));
  }
  const times = [recurrence.timeOfDay, ...normalizeAdditionalTimes(recurrence.additionalTimes)];
  return [...new Set(times)].sort().map((timeOfDay) => ({ timeOfDay }));
}

function buildTaskRecurrenceFromWorkoutSlot(recurrence, slot) {
  return {
    type: recurrence.type,
    interval: recurrence.interval,
    weekday: recurrence.type === "weekly" ? slot.weekday : 0,
    day: 1,
    ordinal: "first",
    endDate: "",
    count: null,
    forever: true
  };
}

function buildWorkoutTaskDetails(plan) {
  return `Created by Workout Coach. Planned duration ${plan.durationMinutes} min. Intensity: ${plan.intensity}.`;
}

function durationToTaskLength(durationMinutes) {
  if (durationMinutes <= 15) {
    return "very-short";
  }
  if (durationMinutes <= 30) {
    return "short";
  }
  if (durationMinutes <= 60) {
    return "medium";
  }
  if (durationMinutes <= 90) {
    return "long";
  }
  return "very-long";
}

function startOfDayTimestamp(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function alignDateToWeekdayOnOrAfter(baseDate, weekday) {
  const date = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return baseDate;
  }
  const normalizedWeekday = Number.isInteger(weekday) ? weekday : 0;
  const diff = (normalizedWeekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return toDateString(date);
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  date.setDate(date.getDate() + count);
  return toDateString(date);
}

function compareWorkoutOwnedTemplateSchedule(left, right) {
  const leftDate = `${left.dueDate || left.startDate || ""}T${left.timeOfDay || "23:59"}`;
  const rightDate = `${right.dueDate || right.startDate || ""}T${right.timeOfDay || "23:59"}`;
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return (left.linkedSeries?.slotIndex || 0) - (right.linkedSeries?.slotIndex || 0);
}

function isWorkoutOwnedTemplate(task, widgetId = "") {
  return Boolean(
    task &&
    !task.templateId &&
    task.ownerWidgetType === WORKOUT_WIDGET_TYPE &&
    (!widgetId || task.ownerWidgetId === widgetId) &&
    (task.widgetTaskKind === "workout-session" || task.widgetTaskKind === "weight-checkin")
  );
}

function workoutTemplateChanged(existing, desired) {
  return (
    existing.name !== desired.name
    || existing.details !== desired.details
    || existing.startDate !== desired.startDate
    || existing.dueDate !== desired.dueDate
    || existing.timeOfDay !== desired.timeOfDay
    || existing.lateGraceMinutes !== desired.lateGraceMinutes
    || existing.pointsValue !== desired.pointsValue
    || existing.length !== desired.length
    || existing.categoryKey !== desired.categoryKey
    || existing.categoryLabel !== desired.categoryLabel
    || existing.categoryColor !== desired.categoryColor
    || existing.ownerTaskKey !== desired.ownerTaskKey
    || existing.widgetTaskKind !== desired.widgetTaskKind
    || JSON.stringify(existing.widgetTaskMeta || {}) !== JSON.stringify(desired.widgetTaskMeta || {})
    || JSON.stringify(existing.linkedSeries || {}) !== JSON.stringify(desired.linkedSeries || {})
    || JSON.stringify(existing.skipRule || {}) !== JSON.stringify(desired.skipRule || {})
    || JSON.stringify(existing.widgetCompletion || {}) !== JSON.stringify(desired.widgetCompletion || {})
    || JSON.stringify(existing.recurrence || {}) !== JSON.stringify(desired.recurrence || {})
  );
}

function normalizeSlotIndex(value, maxWidgets) {
  const index = Number(value);
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.max(0, Math.min(maxWidgets - 1, Math.floor(index)));
}

function normalizeWorkoutPlans(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((plan) => plan && typeof plan === "object")
    .map((plan) => ({
      id: typeof plan.id === "string" ? plan.id : "",
      name: typeof plan.name === "string" ? plan.name.trim().slice(0, 80) : "",
      workoutType: typeof plan.workoutType === "string" ? plan.workoutType.trim().slice(0, 80) : "",
      durationMinutes: normalizeDurationMinutes(plan.durationMinutes),
      intensity: normalizeWorkoutIntensity(plan.intensity),
      recurrence: normalizeWorkoutRecurrence(plan.recurrence),
      categoryKey: typeof plan.categoryKey === "string" ? plan.categoryKey : "health",
      points: normalizePoints(plan.points),
      createdAt: typeof plan.createdAt === "number" ? plan.createdAt : 0,
      updatedAt: typeof plan.updatedAt === "number" ? plan.updatedAt : 0
    }));
}

function normalizeWeightTracking(value) {
  return {
    enabled: value?.enabled !== false,
    unit: normalizeWeightUnit(value?.unit),
    allowOpenLogging: value?.allowOpenLogging !== false,
    schedule: normalizeWeightSchedule(value?.schedule)
  };
}

function normalizeWorkoutEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      at: typeof entry.at === "number" ? entry.at : 0,
      workoutType: typeof entry.workoutType === "string" ? entry.workoutType.trim().slice(0, 80) : "",
      durationMinutes: normalizeDurationMinutes(entry.durationMinutes),
      intensity: normalizeWorkoutIntensity(entry.intensity),
      taskId: typeof entry.taskId === "string" ? entry.taskId : "",
      planId: typeof entry.planId === "string" ? entry.planId : "",
      source: normalizeEntrySource(entry.source)
    }))
    .sort((left, right) => left.at - right.at);
}

function normalizeWeightEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      at: typeof entry.at === "number" ? entry.at : 0,
      value: normalizeWeightValue(entry.value),
      unit: normalizeWeightUnit(entry.unit),
      taskId: typeof entry.taskId === "string" ? entry.taskId : "",
      source: normalizeEntrySource(entry.source)
    }))
    .sort((left, right) => left.at - right.at);
}

function normalizeWorkoutIntensity(value) {
  return value === "low" || value === "high" ? value : DEFAULT_WORKOUT_INTENSITY;
}

function normalizeWorkoutRecurrence(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const type = value.type === "daily" || value.type === "weekly" ? value.type : "";
  if (!type) {
    return null;
  }
  return {
    type,
    interval: normalizePositiveInteger(value.interval, 1),
    instancesPerPeriod: normalizePositiveInteger(
      value.instancesPerPeriod,
      type === "daily"
        ? 1 + normalizeAdditionalTimes(value.additionalTimes).length
        : Math.max(1, normalizeWeekdays(value.weekdays).length)
    ),
    weekdays: Array.isArray(value.weekdays)
      ? normalizeWeekdays(value.weekdays)
      : [],
    timeOfDay: normalizeTimeValue(value.timeOfDay, DEFAULT_WORKOUT_TIME),
    additionalTimes: normalizeAdditionalTimes(value.additionalTimes)
  };
}

function normalizeWeightSchedule(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const recurrence = normalizeWorkoutRecurrence(value.recurrence);
  return recurrence
    ? {
        recurrence,
        timeOfDay: typeof value.timeOfDay === "string" ? value.timeOfDay : recurrence.timeOfDay
      }
    : null;
}

function normalizeWeightUnit(value) {
  return value === "kg" ? "kg" : DEFAULT_WEIGHT_UNIT;
}

function normalizeDurationMinutes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return Math.round(number);
}

function normalizePoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 1;
  }
  return Math.max(0, Math.min(10, Math.round(number)));
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return fallback;
  }
  return Math.round(number);
}

function normalizeWeightValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeEntrySource(value) {
  return value === "extra" ? "extra" : "task";
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((left, right) => left - right);
}

function normalizeAdditionalTimes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .filter((time) => typeof time === "string" && /^\d{2}:\d{2}$/.test(time))
      .map((time) => time.trim())
  )].sort();
}

function normalizeTimeValue(value, fallback) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : fallback;
}

function formatWeightEntry(entry) {
  if (!entry || !Number.isFinite(entry.value)) {
    return "No weight logged";
  }
  return `${trimTrailingZero(entry.value)} ${entry.unit}`;
}

function describeWorkoutEntry(entry) {
  const type = entry.workoutType || "Workout";
  const duration = entry.durationMinutes ? `${entry.durationMinutes} min` : "duration TBD";
  const intensity = entry.intensity || DEFAULT_WORKOUT_INTENSITY;
  return `${type} · ${duration} · ${intensity}`;
}

function trimTrailingZero(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function createPlanDraft() {
  return {
    workoutType: "",
    durationMinutes: 30,
    intensity: DEFAULT_WORKOUT_INTENSITY,
    recurrence: {
      type: "daily",
      interval: 1,
      instancesPerPeriod: 1,
      weekdays: [1, 3, 5],
      timeOfDay: DEFAULT_WORKOUT_TIME,
      additionalTimes: []
    }
  };
}

function renderAdditionalTimeInputs(times, escapeHtml) {
  const safeTimes = normalizeAdditionalTimes(times);
  if (!safeTimes.length) {
    return "";
  }
  return safeTimes.map((time) => renderAdditionalTimeRow(time, escapeHtml)).join("");
}

function renderAdditionalTimeRow(time, escapeHtml = (value) => value) {
  return `
    <div class="energy-time-row">
      <label>
        <span>Extra time</span>
        <input type="time" value="${escapeHtml(time)}" data-workout-additional-time />
      </label>
      <button type="button" class="ghost-button" data-workout-remove-time>Remove</button>
    </div>
  `;
}

function renderWeekdayOptions(selectedDays) {
  const selected = new Set(normalizeWeekdays(selectedDays));
  return WEEKDAY_OPTIONS.map((option) => `
    <label>
      <input type="checkbox" value="${option.value}" data-workout-weekday ${selected.has(option.value) ? "checked" : ""} />
      <span>${option.label}</span>
    </label>
  `).join("");
}

function renderWorkoutPlanCard(plan, escapeHtml) {
  const summary = describeWorkoutPlan(plan);
  return `
    <article class="workout-plan-item">
      <div class="workout-plan-item-header">
        <div>
          <h4>${escapeHtml(plan.name || plan.workoutType || "Workout plan")}</h4>
          <p class="sync-status">${escapeHtml(summary)}</p>
        </div>
        <div class="widget-actions workout-inline-actions">
          <button type="button" class="ghost-button" data-workout-edit-plan data-plan-id="${plan.id}">Edit</button>
          <button type="button" class="ghost-button" data-workout-delete-plan data-plan-id="${plan.id}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderWorkoutProgressCard(card, escapeHtml) {
  return `
    <article class="workout-progress-card">
      <div class="workout-progress-header">
        <div>
          <h4>${escapeHtml(card.label)}</h4>
          <p class="sync-status">${escapeHtml(card.summary)}</p>
        </div>
        <span class="workout-progress-chip ${card.openCount === 0 ? "done" : ""}">
          ${escapeHtml(`${card.doneCount}/${card.totalCount}`)}
        </span>
      </div>
      <div class="workout-progress-stats">
        <span><strong>Completions:</strong> ${escapeHtml(`${card.doneCount}/${card.totalCount}`)}</span>
        <span><strong>Open:</strong> ${escapeHtml(String(card.openCount))}</span>
        <span><strong>Skipped:</strong> ${escapeHtml(String(card.skippedCount))}</span>
      </div>
      ${card.nextDue ? `<p class="sync-status">Next due: ${escapeHtml(card.nextDue)}</p>` : ""}
    </article>
  `;
}

function describeWorkoutPlan(plan) {
  const workoutType = plan.workoutType || plan.name || "Workout";
  const duration = plan.durationMinutes ? `${plan.durationMinutes} min` : "Duration TBD";
  const intensity = WORKOUT_INTENSITY_OPTIONS.find((option) => option.value === plan.intensity)?.label || "Moderate";
  const recurrence = describeWorkoutRecurrence(plan.recurrence);
  return `${workoutType} · ${duration} · ${intensity} · ${recurrence}`;
}

function describeWorkoutRecurrence(recurrence) {
  if (!recurrence) {
    return "No schedule";
  }
  if (recurrence.type === "daily") {
    const allTimes = [recurrence.timeOfDay, ...normalizeAdditionalTimes(recurrence.additionalTimes)];
    return `Every ${recurrence.interval} day${recurrence.interval === 1 ? "" : "s"} at ${allTimes.join(", ")}`;
  }
  if (recurrence.type === "weekly") {
    const days = normalizeWeekdays(recurrence.weekdays)
      .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.label || "")
      .filter(Boolean)
      .join(", ");
    return `Every ${recurrence.interval} week${recurrence.interval === 1 ? "" : "s"} on ${days || "selected days"} at ${recurrence.timeOfDay}`;
  }
  return "No schedule";
}

function buildWorkoutProgressView(tasks, widgetId, now = new Date()) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const today = toDateString(now);
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  const workoutTasks = dedupeWorkoutTasksForProgress(
    allTasks.filter((task) => task?.ownerWidgetId === widgetId && isWorkoutProgressTask(task) && !task.archived)
  );

  return {
    dailyCards: buildProgressCardsForPeriod(workoutTasks, {
      period: "daily",
      today,
      weekStart,
      weekEnd
    }),
    weeklyCards: buildProgressCardsForPeriod(workoutTasks, {
      period: "weekly",
      today,
      weekStart,
      weekEnd
    })
  };
}

function buildProgressCardsForPeriod(tasks, { period, today, weekStart, weekEnd }) {
  const groups = new Map();

  for (const task of tasks) {
    const recurrenceType = task.recurrence?.sourceType || task.recurrence?.type || "";
    if (period === "daily" && recurrenceType !== "daily") {
      continue;
    }
    if (period === "weekly" && recurrenceType !== "weekly") {
      continue;
    }

    const scheduledDate = task.dueDate || task.startDate || "";
    if (!scheduledDate) {
      continue;
    }
    if (period === "daily" && scheduledDate !== today) {
      continue;
    }
    if (period === "weekly" && (scheduledDate < weekStart || scheduledDate > weekEnd)) {
      continue;
    }

    const key = buildWorkoutProgressKey(task, period);
    const group = groups.get(key) || {
      key,
      label: buildWorkoutProgressLabel(task),
      summary: buildWorkoutProgressSummary(task, period),
      totalCount: 0,
      doneCount: 0,
      skippedCount: 0,
      openCount: 0,
      nextDue: ""
    };
    group.totalCount += 1;
    if (task.status === "done") {
      group.doneCount += 1;
    } else if (task.status === "skipped") {
      group.skippedCount += 1;
    } else {
      group.openCount += 1;
    }
    if (!group.nextDue && task.status === "open") {
      group.nextDue = formatProgressDueText(task);
    }
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.openCount === 0 && right.openCount !== 0) {
      return 1;
    }
    if (right.openCount === 0 && left.openCount !== 0) {
      return -1;
    }
    return left.label.localeCompare(right.label);
  });
}

function dedupeWorkoutTasksForProgress(tasks) {
  const bySignature = new Map();
  for (const task of tasks) {
    const signature = [
      task.ownerTaskKey || "",
      task.widgetTaskKind || "",
      task.dueDate || task.startDate || "",
      task.timeOfDay || ""
    ].join("|");
    const existing = bySignature.get(signature);
    if (!existing || compareWorkoutProgressTaskPriority(task, existing) < 0) {
      bySignature.set(signature, task);
    }
  }
  return [...bySignature.values()];
}

function compareWorkoutProgressTaskPriority(left, right) {
  const leftRank = workoutProgressStatusRank(left.status);
  const rightRank = workoutProgressStatusRank(right.status);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return (left.createdAt || 0) - (right.createdAt || 0);
}

function workoutProgressStatusRank(status) {
  if (status === "done") {
    return 0;
  }
  if (status === "open") {
    return 1;
  }
  if (status === "skipped") {
    return 2;
  }
  return 3;
}

function isWorkoutProgressTask(task) {
  return task?.widgetTaskKind === "workout-session" || task?.widgetTaskKind === "weight-checkin";
}

function buildWorkoutProgressKey(task, period) {
  if (task.widgetTaskKind === "weight-checkin") {
    return `${period}:weight-checkin`;
  }
  return `${period}:${task.widgetTaskMeta?.planId || task.ownerTaskKey || task.id}`;
}

function buildWorkoutProgressLabel(task) {
  if (task.widgetTaskKind === "weight-checkin") {
    return "Weight check-ins";
  }
  return task.widgetTaskMeta?.workoutType || task.name || "Workout session";
}

function buildWorkoutProgressSummary(task, period) {
  if (task.widgetTaskKind === "weight-checkin") {
    return period === "daily"
      ? "Current-day weight logging progress"
      : "Current calendar week weight logging progress";
  }
  const duration = task.widgetTaskMeta?.durationMinutes ? `${task.widgetTaskMeta.durationMinutes} min` : "Duration TBD";
  const intensity = task.widgetTaskMeta?.intensity || "moderate";
  return `${duration} · ${intensity}`;
}

function formatProgressDueText(task) {
  const date = task.dueDate || task.startDate || "";
  const time = task.timeOfDay || "23:59";
  return date ? `${date} at ${time}` : time;
}

function replaceAdditionalTimes(container, times) {
  if (!container) {
    return;
  }
  container.innerHTML = renderAdditionalTimeInputs(times, (value) => value);
}

function setSelectedWeekdays(container, weekdays) {
  const selected = new Set(normalizeWeekdays(weekdays));
  Array.from(container.querySelectorAll("[data-workout-weekday]")).forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function getSelectedWeekdays(container) {
  return normalizeWeekdays(
    Array.from(container.querySelectorAll("[data-workout-weekday]:checked")).map((input) => Number(input.value))
  );
}

function collectAdditionalTimes(container) {
  const values = Array.from(container.querySelectorAll("[data-workout-additional-time]"))
    .map((input) => normalizeTimeValue(input.value, ""))
    .filter(Boolean);
  const normalized = normalizeAdditionalTimes(values);
  return normalized.length === values.length ? normalized : null;
}

function compareWorkoutPlanDisplay(left, right) {
  const leftName = (left.name || left.workoutType || "").toLowerCase();
  const rightName = (right.name || right.workoutType || "").toLowerCase();
  return leftName.localeCompare(rightName) || (left.createdAt || 0) - (right.createdAt || 0);
}
