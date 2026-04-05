export const WORKOUT_WIDGET_TYPE = "workout";

const DEFAULT_WEIGHT_UNIT = "lbs";
const DEFAULT_WORKOUT_INTENSITY = "moderate";
const DEFAULT_WORKOUT_TIME = "07:00";
const DEFAULT_WORKOUT_CALORIES = 250;
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
const WORKOUT_CHART_PERIODS = ["daily", "weekly", "monthly", "yearly"];
const WORKOUT_CHART_SPANS = {
  daily: [7, 30],
  weekly: [4, 26],
  monthly: [12, 36],
  yearly: ["all"]
};
const workoutShellUiState = new Map();

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
        workoutPlans: normalizeWorkoutPlans(widget.settings?.workoutPlans, createId),
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

  syncOwnedTasks({ widget, store }) {
    repairWorkoutOwnedSkipRules(widget, store);
  },

  canShellQuickComplete({ task }) {
    return task?.widgetTaskKind === "workout-session";
  },

  stageShellQuickComplete({ widget, task, helpers }) {
    if (!widget || !task || task.status !== "open" || task.widgetTaskKind !== "workout-session") {
      helpers.setSyncStatus("That workout task is no longer ready to complete.", "error");
      return false;
    }

    stageWorkoutTaskLog(widget, task, {
      durationMinutes: normalizeDurationMinutes(task.widgetTaskMeta?.durationMinutes || 30),
      intensity: normalizeWorkoutIntensity(task.widgetTaskMeta?.intensity),
      caloriesBurned: normalizeCaloriesBurned(task.widgetTaskMeta?.caloriesBurned ?? DEFAULT_WORKOUT_CALORIES)
    }, helpers, {
      shellQuickComplete: true,
      description: `Pending quick completion for ${task.name}. Click undo within 3 seconds to cancel.`
    });
    return true;
  },

  render({ widget, tasks, escapeHtml, formatDateTime, getPendingActionForWidget }) {
    const planCount = widget.settings.workoutPlans.length;
    const latestWorkout = widget.data.workoutEntries[widget.data.workoutEntries.length - 1] || null;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;
    const dailyPlans = widget.settings.workoutPlans.filter((plan) => plan.recurrence?.type === "daily").length;
    const weeklyPlans = widget.settings.workoutPlans.filter((plan) => plan.recurrence?.type === "weekly").length;
    const nextWorkoutTask = listReadyWorkoutTasks(tasks, widget.id)[0] || null;
    const pendingWorkoutLog = getPendingWorkoutLogAction(widget.id, getPendingActionForWidget);
    const pendingAdHocWorkout = getPendingActionForWidget?.(widget.id, "workout-adhoc") || null;
    const shellState = getWorkoutShellState(widget.id);
    const weeklyCalories = sumWorkoutCaloriesForCurrentWeek(widget.data.workoutEntries);

    return `
      <div class="widget-slot-header">
        <div>
          <h3>Workout Coach</h3>
          <p>Track workout plans, daily or weekly progress, and optional weight logs.</p>
        </div>
        <span class="widget-badge">Live</span>
      </div>
      <p>Workout plans: <strong>${planCount}</strong> (${dailyPlans} daily, ${weeklyPlans} weekly)</p>
      <p>${latestWorkout ? `Latest workout: ${escapeHtml(latestWorkout.workoutType || "Workout")} at ${formatDateTime(latestWorkout.at)}` : "No workout logs yet."}</p>
      <p>${latestWeight ? `Latest weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight logs yet."}</p>
      <p>Calories this week: <strong>${escapeHtml(formatCalories(weeklyCalories))}</strong></p>
      <p>${pendingWorkoutLog
        ? `Pending workout log: ${escapeHtml(formatPendingWorkoutSummary(pendingWorkoutLog))}`
        : nextWorkoutTask
          ? `Ready now: ${escapeHtml(nextWorkoutTask.widgetTaskMeta?.workoutType || nextWorkoutTask.name || "Workout")} due ${escapeHtml(formatProgressDueText(nextWorkoutTask))}`
          : "No workout is ready to quick-complete right now."}</p>
      <div class="widget-actions">
        ${pendingWorkoutLog
          ? `<button type="button" class="ghost-button" data-widget-action="undo-workout-log" data-pending-key="${pendingWorkoutLog.key}">Undo</button>`
          : nextWorkoutTask
            ? `<button type="button" class="primary-button" data-widget-action="quick-workout-complete" data-task-id="${nextWorkoutTask.id}">Quick complete</button>`
            : ""}
        ${pendingAdHocWorkout
          ? `<button type="button" class="ghost-button" data-widget-action="undo-adhoc-workout" data-pending-key="${pendingAdHocWorkout.key}">Undo quick workout</button>`
          : `<button type="button" class="ghost-button" data-widget-action="toggle-adhoc-workout">${shellState.quickAdHocOpen ? "Close quick workout" : "Quick workout"}</button>`}
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
      </div>
      ${shellState.quickAdHocOpen && !pendingAdHocWorkout ? renderShellAdHocWorkoutForm(escapeHtml) : ""}
    `;
  },

  renderDetail({ widget, tasks, escapeHtml, formatDateTime, getPendingActionForWidget }) {
    const detailState = getWorkoutDetailState(widget.id);
    const activeTab = detailState.detailTab;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;
    const weightTracking = widget.settings.weightTracking;
    const planDraft = createPlanDraft();
    const ownedTemplateCount = tasks.filter((task) => isWorkoutOwnedTemplate(task, widget.id)).length;
    const progressView = buildWorkoutProgressView(tasks, widget.id);
    const completionTasks = listReadyWorkoutTasks(tasks, widget.id);
    const recentWorkoutEntries = [...widget.data.workoutEntries].slice(-8).reverse();
    const recentWeightEntries = [...widget.data.weightEntries].slice(-8).reverse();
    const pendingWeightLog = getPendingActionForWidget?.(widget.id, "weight-log") || null;
    const pendingAdHocWorkout = getPendingActionForWidget?.(widget.id, "workout-adhoc") || null;
    const weightIntent = describeWeightLogIntent(tasks, widget.id, weightTracking, formatDateTime);
    const weightScheduleDraft = weightTracking.schedule?.recurrence || createWeightScheduleDraft();
    const weeklyCalories = sumWorkoutCaloriesForCurrentWeek(widget.data.workoutEntries);
    const repairableWorkoutLogs = findRepairableWorkoutTasks(tasks, widget);
    const chartModel = buildWorkoutHistoryChartModel(widget, detailState.chartPeriod, detailState.chartSpan);
    const chartSpanOptions = getWorkoutChartSpanOptions(detailState.chartPeriod);

    return `
      <section class="energy-detail">
        <div class="workout-detail-tabs" role="tablist" aria-label="Workout detail sections">
          ${renderWorkoutDetailTabButton("overview", "Overview", activeTab, escapeHtml)}
          ${renderWorkoutDetailTabButton("plans", "Plans", activeTab, escapeHtml)}
          ${renderWorkoutDetailTabButton("weight", "Weight", activeTab, escapeHtml)}
        </div>
        <div class="energy-detail-grid">
          <div class="workout-detail-tab-panel${activeTab === "overview" ? "" : " hidden"}" data-workout-tab-panel="overview">
            <section class="energy-detail-card workout-chart-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">History</p>
                  <h3>Calories and weight trend</h3>
                  <p class="sync-status">Calories are grouped into day, week, month, or year totals. Weight overlays the latest logged value in each visible period.</p>
                </div>
              </div>
              <div class="workout-chart-controls">
                <label class="workout-chart-control">
                  <span>View</span>
                  <select data-workout-chart-period>
                    ${WORKOUT_CHART_PERIODS.map((period) => `
                      <option value="${escapeHtml(period)}" ${detailState.chartPeriod === period ? "selected" : ""}>
                        ${escapeHtml(humanizeWorkoutChartPeriod(period))}
                      </option>
                    `).join("")}
                  </select>
                </label>
                <label class="workout-chart-control">
                  <span>Length</span>
                  <select data-workout-chart-span ${detailState.chartPeriod === "yearly" ? "disabled" : ""}>
                    ${chartSpanOptions.map((option) => `
                      <option value="${escapeHtml(String(option))}" ${String(chartModel.span) === String(option) ? "selected" : ""}>
                        ${escapeHtml(formatWorkoutChartSpanLabel(detailState.chartPeriod, option))}
                      </option>
                    `).join("")}
                  </select>
                </label>
              </div>
              <div class="workout-chart-legend">
                <span><i class="workout-chart-dot calories"></i>Calories burned</span>
                <span><i class="workout-chart-dot weight"></i>Weight (${escapeHtml(weightTracking.unit)})</span>
                <span class="workout-chart-summary">${escapeHtml(chartModel.summaryLabel)}: <strong>${escapeHtml(formatCalories(chartModel.totalCalories))}</strong></span>
              </div>
              <canvas class="workout-detail-chart" data-workout-chart></canvas>
              <p class="empty-state hidden" data-workout-chart-empty>No workout calories or weight logs yet.</p>
            </section>

            <section class="energy-detail-card workout-overview-weight-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">Quick weight</p>
                  <h3>Log weight</h3>
                  <p class="sync-status">${pendingWeightLog ? escapeHtml(`Pending weight log: ${formatPendingWeightSummary(pendingWeightLog)}`) : escapeHtml(weightIntent)}</p>
                </div>
              </div>
              ${renderWeightLogForm({
                escapeHtml,
                weightTracking,
                pendingWeightLog,
                submitLabel: "Log weight"
              })}
              <p>${latestWeight ? `Latest logged weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight entries yet."}</p>
            </section>

            <section class="energy-detail-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">Logging</p>
                  <h3>Complete workouts</h3>
                  <p class="sync-status">Set the actual duration and intensity here before the widget marks a workout task complete.</p>
                </div>
              </div>
              <div class="workout-log-list">
                ${completionTasks.length
                  ? completionTasks.map((task) => renderWorkoutCompletionCard(task, widget.id, escapeHtml, getPendingActionForWidget)).join("")
                  : `<p class="empty-state">No workout tasks are currently ready to log from the widget.</p>`}
              </div>
            </section>

            <section class="energy-detail-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">Ad hoc</p>
                  <h3>Log an extra workout</h3>
                  <p class="sync-status">${pendingAdHocWorkout
                    ? `Pending ad hoc workout: ${escapeHtml(formatPendingAdHocWorkoutSummary(pendingAdHocWorkout))}`
                    : "Use this when you work out outside the scheduled plans. These logs do not complete tasks or award points."}</p>
                </div>
              </div>
              ${renderAdHocWorkoutForm({
                escapeHtml,
                pendingAction: pendingAdHocWorkout,
                formAttribute: "data-workout-adhoc-form",
                submitLabel: "Log ad hoc workout",
                includeHeading: false
              })}
            </section>

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
                  <p class="eyebrow">History</p>
                  <h3>Recent activity</h3>
                  <p class="sync-status">Recent workout logs keep the actual duration, calories, and intensity recorded at completion time. Missing shell quick-complete logs can be rebuilt from the scheduled defaults.</p>
                </div>
                ${repairableWorkoutLogs.length ? `
                  <div class="widget-actions workout-inline-actions">
                    <button type="button" class="ghost-button" data-workout-repair-logs>
                      Repair ${repairableWorkoutLogs.length} missing log${repairableWorkoutLogs.length === 1 ? "" : "s"}
                    </button>
                  </div>
                ` : ""}
              </div>
              <div class="workout-entry-list">
                ${recentWorkoutEntries.length
                  ? recentWorkoutEntries.map((entry) => renderWorkoutEntryCard(entry, escapeHtml, formatDateTime)).join("")
                  : `<p class="empty-state">No workout entries yet.</p>`}
              </div>
              <div class="workout-entry-list">
                ${recentWeightEntries.length
                  ? recentWeightEntries.map((entry) => renderWeightEntryCard(entry, escapeHtml, formatDateTime)).join("")
                  : `<p class="empty-state">No weight entries yet.</p>`}
              </div>
            </section>
          </div>

          <div class="workout-detail-tab-panel${activeTab === "plans" ? "" : " hidden"}" data-workout-tab-panel="plans">
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
                    <span>Default calories burned</span>
                    <input type="number" min="0" max="5000" step="1" value="${planDraft.caloriesBurned}" data-workout-plan-calories />
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
              <p class="sync-status">These plans create the widget-owned recurring tasks that feed the progress cards and workout logging flow above.</p>
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
          </div>

          <div class="workout-detail-tab-panel${activeTab === "weight" ? "" : " hidden"}" data-workout-tab-panel="weight">
            <section class="energy-detail-card">
              <div class="energy-detail-header">
                <div>
                  <p class="eyebrow">Weight</p>
                  <h3>Weight logging</h3>
                  <p class="sync-status">${pendingWeightLog ? escapeHtml(`Pending weight log: ${formatPendingWeightSummary(pendingWeightLog)}`) : escapeHtml(weightIntent)}</p>
                </div>
              </div>
              ${renderWeightLogForm({
                escapeHtml,
                weightTracking,
                pendingWeightLog,
                submitLabel: "Log weight"
              })}
              <div class="workout-recurrence-panel">
                <div class="quick-add-grid">
                  <label>
                    <span>Track weight</span>
                    <select data-weight-enabled>
                      <option value="on" ${weightTracking.enabled ? "selected" : ""}>On</option>
                      <option value="off" ${!weightTracking.enabled ? "selected" : ""}>Off</option>
                    </select>
                  </label>
                  <label>
                    <span>Units</span>
                    <select data-weight-unit>
                      <option value="lbs" ${weightTracking.unit === "lbs" ? "selected" : ""}>lbs</option>
                      <option value="kg" ${weightTracking.unit === "kg" ? "selected" : ""}>kg</option>
                    </select>
                  </label>
                  <label>
                    <span>Scheduled check-ins</span>
                    <select data-weight-schedule-enabled>
                      <option value="off" ${!weightTracking.schedule ? "selected" : ""}>Off</option>
                      <option value="on" ${weightTracking.schedule ? "selected" : ""}>On</option>
                    </select>
                  </label>
                  <label>
                    <span>Pattern</span>
                    <select data-weight-pattern ${!weightTracking.schedule ? "disabled" : ""}>
                      <option value="daily" ${weightScheduleDraft.type !== "weekly" ? "selected" : ""}>Daily</option>
                      <option value="weekly" ${weightScheduleDraft.type === "weekly" ? "selected" : ""}>Weekly</option>
                    </select>
                  </label>
                  <label>
                    <span>Every</span>
                    <input type="number" min="1" max="30" step="1" value="${weightScheduleDraft.interval}" data-weight-interval ${!weightTracking.schedule ? "disabled" : ""} />
                  </label>
                  <label>
                    <span>Time of day</span>
                    <input type="time" value="${escapeHtml(weightScheduleDraft.timeOfDay)}" data-weight-time ${!weightTracking.schedule ? "disabled" : ""} />
                  </label>
                </div>
                <div class="workout-recurrence-panel ${weightTracking.schedule && weightScheduleDraft.type === "weekly" ? "" : "hidden"}" data-weight-weekly-panel>
                  <div class="weekday-picker-panel">
                    <span>Days in the week</span>
                    <div class="weekday-picker">
                      ${renderWeightWeekdayOptions(weightScheduleDraft.weekdays)}
                    </div>
                  </div>
                </div>
                <div class="widget-actions workout-inline-actions">
                  <button type="button" class="primary-button" data-weight-save-settings>Save weight settings</button>
                </div>
              </div>
              <p>${latestWeight ? `Latest logged weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight entries yet."}</p>
            </section>
          </div>
        </div>
      </section>
    `;
  },

  mountDetail({ widget, container, helpers }) {
    const chartCanvas = container.querySelector("[data-workout-chart]");
    const chartEmptyState = container.querySelector("[data-workout-chart-empty]");
    const chartPeriodInput = container.querySelector("[data-workout-chart-period]");
    const chartSpanInput = container.querySelector("[data-workout-chart-span]");
    const form = container.querySelector("[data-workout-plan-form]");
    const patternInput = container.querySelector("[data-workout-plan-pattern]");
    const dailyPanel = container.querySelector("[data-workout-daily-panel]");
    const weeklyPanel = container.querySelector("[data-workout-weekly-panel]");
    const additionalTimes = container.querySelector("[data-workout-additional-times]");
    const cancelEditButton = container.querySelector("[data-workout-cancel-edit]");
    const weightEnabledInput = container.querySelector("[data-weight-enabled]");
    const weightUnitInput = container.querySelector("[data-weight-unit]");
    const weightScheduleEnabledInput = container.querySelector("[data-weight-schedule-enabled]");
    const weightPatternInput = container.querySelector("[data-weight-pattern]");
    const weightIntervalInput = container.querySelector("[data-weight-interval]");
    const weightTimeInput = container.querySelector("[data-weight-time]");
    const weightWeeklyPanel = container.querySelector("[data-weight-weekly-panel]");

    if (!form || !patternInput || !dailyPanel || !weeklyPanel || !additionalTimes) {
      return null;
    }

    const refreshChart = () => {
      if (!chartCanvas || !chartEmptyState) {
        return;
      }
      const chartState = getWorkoutDetailState(widget.id);
      drawWorkoutHistoryChart(
        chartCanvas,
        chartEmptyState,
        buildWorkoutHistoryChartModel(widget, chartState.chartPeriod, chartState.chartSpan),
        widget.settings.weightTracking.unit
      );
    };

    const syncPanels = () => {
      const isDaily = patternInput.value !== "weekly";
      dailyPanel.classList.toggle("hidden", !isDaily);
      weeklyPanel.classList.toggle("hidden", isDaily);
    };

    const syncWeightPanels = () => {
      const scheduleEnabled = weightScheduleEnabledInput?.value === "on";
      const weekly = weightPatternInput?.value === "weekly";
      weightPatternInput?.toggleAttribute("disabled", !scheduleEnabled);
      weightIntervalInput?.toggleAttribute("disabled", !scheduleEnabled);
      weightTimeInput?.toggleAttribute("disabled", !scheduleEnabled);
      weightWeeklyPanel?.classList.toggle("hidden", !(scheduleEnabled && weekly));
      Array.from(container.querySelectorAll("[data-weight-weekday]")).forEach((input) => {
        input.toggleAttribute("disabled", !scheduleEnabled || !weekly);
      });
    };

    const resetForm = () => {
      form.reset();
      form.setAttribute("data-editing-plan-id", "");
      const freshDraft = createPlanDraft();
      form.querySelector("[data-workout-plan-duration]").value = String(freshDraft.durationMinutes);
      form.querySelector("[data-workout-plan-intensity]").value = freshDraft.intensity;
      form.querySelector("[data-workout-plan-calories]").value = String(freshDraft.caloriesBurned);
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
      form.querySelector("[data-workout-plan-calories]").value = String(normalizeCaloriesBurned(plan.caloriesBurned));
      patternInput.value = plan.recurrence?.type || "daily";
      form.querySelector("[data-workout-plan-interval]").value = String(plan.recurrence?.interval || 1);
      form.querySelector("[data-workout-plan-time]").value = plan.recurrence?.timeOfDay || DEFAULT_WORKOUT_TIME;
      replaceAdditionalTimes(additionalTimes, plan.recurrence?.additionalTimes || []);
      setSelectedWeekdays(container, plan.recurrence?.weekdays || []);
      cancelEditButton?.classList.remove("hidden");
      syncPanels();
    };

    const clickHandler = (event) => {
      const detailTabButton = event.target.closest("[data-workout-detail-tab]");
      if (detailTabButton) {
        const nextTab = normalizeWorkoutDetailTab(detailTabButton.getAttribute("data-workout-detail-tab"));
        if (nextTab !== getWorkoutDetailState(widget.id).detailTab) {
          setWorkoutDetailTab(widget.id, nextTab);
          helpers.renderAll();
        }
        return;
      }

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
        return;
      }

      const undoLogButton = event.target.closest("[data-workout-log-undo]");
      if (undoLogButton) {
        const pendingKey = undoLogButton.getAttribute("data-pending-key");
        if (pendingKey) {
          helpers.undoPendingAction(pendingKey, "Undid the pending workout log.");
        }
        return;
      }

      const undoAdHocWorkoutButton = event.target.closest("[data-workout-adhoc-undo]");
      if (undoAdHocWorkoutButton) {
        const pendingKey = undoAdHocWorkoutButton.getAttribute("data-pending-key");
        if (pendingKey) {
          helpers.undoPendingAction(pendingKey, "Undid the pending ad hoc workout log.");
        }
        return;
      }

      const undoWeightLogButton = event.target.closest("[data-weight-log-undo]");
      if (undoWeightLogButton) {
        const pendingKey = undoWeightLogButton.getAttribute("data-pending-key");
        if (pendingKey) {
          helpers.undoPendingAction(pendingKey, "Undid the pending weight log.");
        }
        return;
      }

      const saveWeightSettingsButton = event.target.closest("[data-weight-save-settings]");
      if (saveWeightSettingsButton) {
        const weightEnabled = weightEnabledInput?.value !== "off";
        const unit = normalizeWeightUnit(weightUnitInput?.value);
        const scheduleEnabled = weightScheduleEnabledInput?.value === "on";
        const pattern = weightPatternInput?.value === "weekly" ? "weekly" : "daily";
        const interval = normalizePositiveInteger(weightIntervalInput?.value, 1);
        const timeOfDay = normalizeTimeValue(weightTimeInput?.value, DEFAULT_WORKOUT_TIME);
        const weekdays = getSelectedWeightWeekdays(container);

        if (scheduleEnabled && pattern === "weekly" && weekdays.length === 0) {
          helpers.setSyncStatus("Choose at least one weekday for scheduled weight check-ins.", "error");
          return;
        }

        widget.settings.weightTracking = {
          ...widget.settings.weightTracking,
          enabled: weightEnabled,
          unit,
          allowOpenLogging: true,
          schedule: scheduleEnabled
            ? {
              recurrence: {
                type: pattern,
                interval,
                instancesPerPeriod: pattern === "weekly" ? weekdays.length : 1,
                weekdays: pattern === "weekly" ? weekdays : [],
                timeOfDay,
                additionalTimes: []
              },
              timeOfDay
            }
            : null
        };
        widget.updatedAt = Date.now();
        syncWorkoutOwnedTaskTemplates(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Saved the weight tracking settings.", "success");
        return;
      }

      const repairLogsButton = event.target.closest("[data-workout-repair-logs]");
      if (repairLogsButton) {
        const repairedCount = repairMissingWorkoutLogs(widget, helpers.getStore(), helpers);
        if (repairedCount > 0) {
          helpers.persistStore();
          helpers.renderAll();
          helpers.setSyncStatus(`Rebuilt ${repairedCount} missing workout log${repairedCount === 1 ? "" : "s"} from completed workout tasks.`, "success");
        } else {
          helpers.setSyncStatus("No missing workout logs were found to repair.", "info");
        }
        return;
      }
    };

    const submitWeightLogHandler = (event) => {
      const weightForm = event.target.closest("[data-weight-log-form]");
      if (!weightForm) {
        return;
      }
      event.preventDefault();

      const weightValueInput = weightForm.querySelector("[data-weight-log-value]");
      const weightValue = normalizeWeightValue(weightValueInput?.value);
      if (!weightValue || weightValue <= 0) {
        helpers.setSyncStatus("Enter a valid weight before logging.", "error");
        return;
      }
      if (widget.settings.weightTracking.enabled === false) {
        helpers.setSyncStatus("Weight tracking is currently turned off.", "error");
        return;
      }

      const entryTime = Date.now();
      helpers.stageWidgetAction(widget, "weight-log", {
        value: weightValue,
        unit: widget.settings.weightTracking.unit,
        description: `Pending weight log of ${trimTrailingZero(weightValue)} ${widget.settings.weightTracking.unit}. Click undo within 3 seconds to cancel.`,
        commit: () => {
          helpers.applyAutoSkipRules(new Date(entryTime));
          const completedTask = helpers.completeNextTaskFromWidget(widget, WEIGHT_COMPLETION_MECHANISM, entryTime);
          upsertWeightEntry(widget, {
            id: helpers.createId(),
            at: entryTime,
            value: weightValue,
            unit: widget.settings.weightTracking.unit,
            taskId: completedTask?.id || "",
            taskName: completedTask?.name || "",
            scheduledDate: completedTask?.dueDate || completedTask?.startDate || "",
            scheduledTime: completedTask?.timeOfDay || "",
            source: completedTask ? "task" : "extra"
          });
          widget.updatedAt = entryTime;

          return completedTask
            ? {
              message: `Logged ${trimTrailingZero(weightValue)} ${widget.settings.weightTracking.unit} and completed ${completedTask.name}.`,
              tone: "info"
            }
            : {
              message: `Logged ${trimTrailingZero(weightValue)} ${widget.settings.weightTracking.unit}. Unscheduled weight logs do not award points.`,
              tone: "info"
            };
        }
      });
    };

    const submitLogHandler = (event) => {
      const logForm = event.target.closest("[data-workout-log-form]");
      if (!logForm) {
        return;
      }
      event.preventDefault();

      const taskId = logForm.getAttribute("data-task-id") || "";
      const durationInput = logForm.querySelector("[data-workout-log-duration]");
      const intensityInput = logForm.querySelector("[data-workout-log-intensity]");
      const caloriesInput = logForm.querySelector("[data-workout-log-calories]");
      const durationMinutes = normalizeDurationMinutes(durationInput?.value);
      const intensity = normalizeWorkoutIntensity(intensityInput?.value);
      const caloriesBurned = normalizeCaloriesBurned(caloriesInput?.value);

      if (!taskId) {
        helpers.setSyncStatus("That workout task could not be identified.", "error");
        return;
      }
      if (durationMinutes < 1) {
        helpers.setSyncStatus("Workout duration must be at least 1 minute.", "error");
        return;
      }

      const task = helpers.getStore().tasks.find((entry) => entry.id === taskId);
      if (!task || task.status !== "open" || task.widgetTaskKind !== "workout-session") {
        helpers.setSyncStatus("That workout task is no longer ready to log.", "error");
        return;
      }
      stageWorkoutTaskLog(widget, task, { durationMinutes, intensity, caloriesBurned }, helpers);
    };

    const submitAdHocHandler = (event) => {
      const adHocForm = event.target.closest("[data-workout-adhoc-form]");
      if (!adHocForm) {
        return;
      }
      event.preventDefault();
      submitAdHocWorkoutForm(widget, adHocForm, helpers);
    };

    const submitHandler = (event) => {
      event.preventDefault();
      const planId = form.getAttribute("data-editing-plan-id") || "";
      const workoutType = String(form.querySelector("[data-workout-plan-type]").value || "").trim().slice(0, 80);
      const durationMinutes = normalizeDurationMinutes(form.querySelector("[data-workout-plan-duration]").value);
      const intensity = normalizeWorkoutIntensity(form.querySelector("[data-workout-plan-intensity]").value);
      const caloriesBurned = normalizeCaloriesBurned(form.querySelector("[data-workout-plan-calories]").value);
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
        caloriesBurned,
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

    const handleChartPeriodChange = () => {
      setWorkoutChartPeriod(widget.id, chartPeriodInput?.value);
      helpers.renderAll();
    };

    const handleChartSpanChange = () => {
      setWorkoutChartSpan(widget.id, chartPeriodInput?.value, chartSpanInput?.value);
      helpers.renderAll();
    };

    patternInput.addEventListener("change", syncPanels);
    weightPatternInput?.addEventListener("change", syncWeightPanels);
    weightScheduleEnabledInput?.addEventListener("change", syncWeightPanels);
    chartPeriodInput?.addEventListener("change", handleChartPeriodChange);
    chartSpanInput?.addEventListener("change", handleChartSpanChange);
    container.addEventListener("click", clickHandler);
    container.addEventListener("submit", submitWeightLogHandler);
    container.addEventListener("submit", submitLogHandler);
    container.addEventListener("submit", submitAdHocHandler);
    form.addEventListener("submit", submitHandler);
    syncPanels();
    syncWeightPanels();
    refreshChart();
    window.addEventListener("resize", refreshChart);

    return () => {
      patternInput.removeEventListener("change", syncPanels);
      weightPatternInput?.removeEventListener("change", syncWeightPanels);
      weightScheduleEnabledInput?.removeEventListener("change", syncWeightPanels);
      chartPeriodInput?.removeEventListener("change", handleChartPeriodChange);
      chartSpanInput?.removeEventListener("change", handleChartSpanChange);
      container.removeEventListener("click", clickHandler);
      container.removeEventListener("submit", submitWeightLogHandler);
      container.removeEventListener("submit", submitLogHandler);
      container.removeEventListener("submit", submitAdHocHandler);
      form.removeEventListener("submit", submitHandler);
      window.removeEventListener("resize", refreshChart);
    };
  },

  handleAction({ action, actionTarget, widget, helpers }) {
    if (action === "undo-workout-log") {
      const pendingKey = actionTarget.getAttribute("data-pending-key");
      if (pendingKey) {
        helpers.undoPendingAction(pendingKey, "Undid the pending workout log.");
      }
      return true;
    }

    if (action === "toggle-adhoc-workout") {
      setWorkoutShellQuickFormOpen(widget.id, !getWorkoutShellState(widget.id).quickAdHocOpen);
      helpers.renderAll();
      return true;
    }

    if (action === "undo-adhoc-workout") {
      const pendingKey = actionTarget.getAttribute("data-pending-key");
      if (pendingKey) {
        helpers.undoPendingAction(pendingKey, "Undid the pending ad hoc workout log.");
      }
      return true;
    }

    if (action === "quick-workout-complete") {
      const taskId = actionTarget.getAttribute("data-task-id") || "";
      const task = helpers.getStore().tasks.find((entry) => entry.id === taskId);
      workoutWidgetDefinition.stageShellQuickComplete({ widget, task, helpers });
      return true;
    }

    return false;
  },

  handleSubmit({ form, widget, helpers }) {
    if (!form.matches("[data-workout-shell-adhoc-form]")) {
      return false;
    }
    submitAdHocWorkoutForm(widget, form, helpers);
    return true;
  },

  shouldAutoSkipOwnedTask({ task, now, store }) {
    if (task?.widgetTaskKind !== "workout-session" || task.skipRule?.policy !== "workout-next-window") {
      return false;
    }
    const sequence = listWorkoutSeriesTasks(store?.tasks, task);
    const currentIndex = sequence.findIndex((entry) => entry.id === task.id);
    if (currentIndex === -1) {
      return false;
    }
    const nextTask = sequence[currentIndex + 1] || null;
    const cutoff = resolveWorkoutAutoSkipCutoff(task, nextTask);
    return cutoff > 0 ? now.getTime() >= cutoff : false;
  }
};

function stageWorkoutTaskLog(widget, task, { durationMinutes, intensity, caloriesBurned }, helpers, options = {}) {
  const taskId = task?.id || "";
  if (!taskId) {
    return;
  }
  const normalizedDuration = normalizeDurationMinutes(durationMinutes);
  const normalizedIntensity = normalizeWorkoutIntensity(intensity);
  const normalizedCalories = normalizeCaloriesBurned(caloriesBurned);
  const entryTime = Date.now();
  helpers.stageWidgetAction(widget, `workout-log:${taskId}`, {
    taskId,
    shellQuickComplete: options.shellQuickComplete === true,
    durationMinutes: normalizedDuration,
    intensity: normalizedIntensity,
    caloriesBurned: normalizedCalories,
    description: options.description || `Pending workout log for ${task.name}. Click undo within 3 seconds to cancel.`,
    commit: () => {
      const currentTask = helpers.getStore().tasks.find((entry) => entry.id === taskId);
      if (!currentTask || currentTask.status !== "open" || currentTask.widgetTaskKind !== "workout-session") {
        return false;
      }

      const completedTask = helpers.completeWidgetTaskById(taskId, entryTime);
      if (!completedTask) {
        return false;
      }

      upsertWorkoutEntry(widget, {
        id: helpers.createId(),
        at: entryTime,
        workoutType: currentTask.widgetTaskMeta?.workoutType || currentTask.name || "Workout",
        durationMinutes: normalizedDuration,
        intensity: normalizedIntensity,
        caloriesBurned: normalizedCalories,
        taskId: currentTask.id,
        taskName: currentTask.name || "",
        planId: currentTask.widgetTaskMeta?.planId || "",
        scheduledDate: currentTask.dueDate || currentTask.startDate || "",
        scheduledTime: currentTask.timeOfDay || "",
        source: "task"
      });
      widget.updatedAt = entryTime;

      return {
        message: `Logged ${currentTask.name} at ${normalizedDuration} min (${normalizedIntensity}, ${formatCalories(normalizedCalories)}) and completed the task.`,
        tone: "info"
      };
    }
  });
}

function stageAdHocWorkoutLog(widget, values, helpers) {
  const normalizedType = String(values.workoutType || "").trim().slice(0, 80);
  const normalizedDuration = normalizeDurationMinutes(values.durationMinutes);
  const normalizedIntensity = normalizeWorkoutIntensity(values.intensity);
  const normalizedCalories = normalizeCaloriesBurned(values.caloriesBurned);
  if (!normalizedType) {
    helpers.setSyncStatus("Workout type is required.", "error");
    return false;
  }
  if (normalizedDuration < 1) {
    helpers.setSyncStatus("Workout duration must be at least 1 minute.", "error");
    return false;
  }
  const entryTime = Date.now();
  helpers.stageWidgetAction(widget, "workout-adhoc", {
    workoutType: normalizedType,
    durationMinutes: normalizedDuration,
    intensity: normalizedIntensity,
    caloriesBurned: normalizedCalories,
    description: `Pending ad hoc workout log for ${normalizedType}. Click undo within 3 seconds to cancel.`,
    commit: () => {
      upsertWorkoutEntry(widget, {
        id: helpers.createId(),
        at: entryTime,
        workoutType: normalizedType,
        durationMinutes: normalizedDuration,
        intensity: normalizedIntensity,
        caloriesBurned: normalizedCalories,
        taskId: "",
        taskName: "",
        planId: "",
        scheduledDate: "",
        scheduledTime: "",
        source: "extra"
      });
      widget.updatedAt = entryTime;
      setWorkoutShellQuickFormOpen(widget.id, false);
      return {
        message: `Logged ${normalizedType} for ${normalizedDuration} min (${normalizedIntensity}, ${formatCalories(normalizedCalories)}). Unscheduled workout logs do not award points.`,
        tone: "info"
      };
    }
  });
  return true;
}

function syncWorkoutOwnedTaskTemplates(widget, store, helpers) {
  const desiredTemplates = buildDesiredWorkoutTemplates(widget, store, helpers);
  const existingTemplates = store.tasks.filter((task) => isWorkoutOwnedTemplate(task, widget.id));
  const matchedExistingIds = new Set();

  for (const desired of desiredTemplates) {
    const existing = findMatchingWorkoutTemplate(existingTemplates, desired, matchedExistingIds) || null;
    const nextDesired = existing
      ? {
          ...desired,
          startDate: existing.startDate || desired.startDate,
          dueDate: existing.dueDate || desired.dueDate,
          notBeforeAt: typeof existing.notBeforeAt === "number" ? existing.notBeforeAt : desired.notBeforeAt
        }
      : desired;
    if (!existing) {
      store.tasks.unshift(nextDesired);
      helpers.regenerateSeries(nextDesired.id, { preserveClosed: false });
      continue;
    }

    matchedExistingIds.add(existing.id);

    if (!workoutTemplateChanged(existing, nextDesired)) {
      continue;
    }

    Object.assign(existing, {
      ...nextDesired,
      id: existing.id,
      createdAt: existing.createdAt,
      status: existing.status,
      history: Array.isArray(existing.history) ? existing.history : [],
      pointsEntryId: existing.pointsEntryId || ""
    });
    helpers.regenerateSeries(existing.id, { preserveClosed: true });
  }

  for (const template of existingTemplates) {
    if (!matchedExistingIds.has(template.id)) {
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

  const weightTracking = normalizeWeightTracking(widget.settings?.weightTracking);
  const weightSchedule = weightTracking.enabled ? normalizeWeightSchedule(weightTracking.schedule) : null;
  if (weightSchedule) {
    desired.push(...buildWeightCheckTemplates(widget, weightTracking, helpers, store));
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
      : `workout-plan:${plan.id}:slot:${slotIndex}`;
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
        caloriesBurned: plan.caloriesBurned,
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
      skipRule: buildWorkoutSessionSkipRule(),
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
      : `weight-checkin:slot:${slotIndex}`;
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

function buildWorkoutSessionSkipRule() {
  return {
    type: "widget-lockout",
    policy: "workout-next-window"
  };
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
  return `Created by Workout Coach. Planned duration ${plan.durationMinutes} min. Intensity: ${plan.intensity}. Calories burned: ${normalizeCaloriesBurned(plan.caloriesBurned)}.`;
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

function repairWorkoutOwnedSkipRules(widget, store) {
  if (!widget?.id || !Array.isArray(store?.tasks)) {
    return;
  }

  for (const task of store.tasks) {
    if (task?.ownerWidgetId !== widget.id || task?.ownerWidgetType !== WORKOUT_WIDGET_TYPE || task.archived) {
      continue;
    }

    if (task.widgetTaskKind === "workout-session") {
      const desired = buildWorkoutSessionSkipRule();
      if (JSON.stringify(task.skipRule || {}) !== JSON.stringify(desired)) {
        task.skipRule = desired;
      }
      continue;
    }

    if (task.widgetTaskKind === "weight-checkin") {
      const desired = { type: "end-of-day" };
      if (JSON.stringify(task.skipRule || {}) !== JSON.stringify(desired)) {
        task.skipRule = desired;
      }
    }
  }
}

function findMatchingWorkoutTemplate(existingTemplates, desired, matchedExistingIds = new Set()) {
  const exact = existingTemplates.find((task) => (
    !matchedExistingIds.has(task.id)
    && (task.ownerTaskKey || "") === (desired.ownerTaskKey || "")
  ));
  if (exact) {
    return exact;
  }

  const desiredRecurrenceType = getWorkoutTemplateRecurrenceType(desired);
  const desiredSlotIndex = desired.linkedSeries?.slotIndex ?? 0;
  const desiredWeekday = Number(desired.recurrence?.weekday ?? -1);

  return existingTemplates.find((task) => {
    if (matchedExistingIds.has(task.id) || task.widgetTaskKind !== desired.widgetTaskKind) {
      return false;
    }

    const taskRecurrenceType = getWorkoutTemplateRecurrenceType(task);
    if (taskRecurrenceType !== desiredRecurrenceType) {
      return false;
    }

    if (desired.widgetTaskKind === "workout-session") {
      const desiredPlanId = desired.widgetTaskMeta?.planId || "";
      const taskPlanId = task.widgetTaskMeta?.planId || "";
      const legacyKeyMatch = desiredPlanId && String(task.ownerTaskKey || "").startsWith(`workout-plan:${desiredPlanId}:`);
      if (desiredPlanId && taskPlanId && taskPlanId !== desiredPlanId && !legacyKeyMatch) {
        return false;
      }
    }

    if (desiredRecurrenceType === "weekly") {
      return Number(task.recurrence?.weekday ?? -2) === desiredWeekday;
    }

    return (task.linkedSeries?.slotIndex ?? 0) === desiredSlotIndex;
  }) || null;
}

function getWorkoutTemplateRecurrenceType(task) {
  return task?.recurrence?.type === "generated"
    ? task?.recurrence?.sourceType || ""
    : task?.recurrence?.type || "";
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

function normalizeWorkoutPlans(value, createId = () => "") {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((plan) => plan && typeof plan === "object")
    .map((plan) => ({
      id: typeof plan.id === "string" && plan.id.trim()
        ? plan.id
        : String(createId() || ""),
      name: typeof plan.name === "string" ? plan.name.trim().slice(0, 80) : "",
      workoutType: typeof plan.workoutType === "string" ? plan.workoutType.trim().slice(0, 80) : "",
      durationMinutes: normalizeDurationMinutes(plan.durationMinutes),
      intensity: normalizeWorkoutIntensity(plan.intensity),
      caloriesBurned: normalizeCaloriesBurned(plan.caloriesBurned ?? DEFAULT_WORKOUT_CALORIES),
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
      caloriesBurned: normalizeCaloriesBurned(entry.caloriesBurned),
      taskId: typeof entry.taskId === "string" ? entry.taskId : "",
      taskName: typeof entry.taskName === "string" ? entry.taskName.trim().slice(0, 120) : "",
      planId: typeof entry.planId === "string" ? entry.planId : "",
      scheduledDate: typeof entry.scheduledDate === "string" ? entry.scheduledDate : "",
      scheduledTime: normalizeTimeValue(entry.scheduledTime, ""),
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
      taskName: typeof entry.taskName === "string" ? entry.taskName.trim().slice(0, 120) : "",
      scheduledDate: typeof entry.scheduledDate === "string" ? entry.scheduledDate : "",
      scheduledTime: normalizeTimeValue(entry.scheduledTime, ""),
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

function normalizeCaloriesBurned(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return Math.min(5000, Math.round(number));
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

function describeWeightLogIntent(tasks, widgetId, weightTracking, formatDateTime) {
  if (weightTracking?.enabled === false) {
    return "Weight tracking is off. Turn it back on below to log or schedule weight check-ins.";
  }
  const activeTask = findActiveWeightCheckTask(tasks, widgetId);
  if (activeTask) {
    return `A scheduled weight check-in is ready now. Logging weight will complete ${activeTask.name} due ${formatDateTime(`${activeTask.dueDate}T${activeTask.timeOfDay || "23:59"}:00`)}.`;
  }
  return "No scheduled weight check-in is due right now. Logging here will be stored as an extra entry with no points awarded.";
}

function formatPendingWeightSummary(pendingAction) {
  if (!pendingAction) {
    return "";
  }
  return `${trimTrailingZero(pendingAction.value)} ${pendingAction.unit}`;
}

function getPendingWorkoutLogAction(widgetId, getPendingActionForWidget) {
  if (typeof getPendingActionForWidget !== "function") {
    return null;
  }
  return getPendingActionForWidget(widgetId, "workout-log:") || null;
}

function formatPendingWorkoutSummary(pendingAction) {
  if (!pendingAction) {
    return "";
  }
  const type = pendingAction.intensity ? humanizeIntensity(pendingAction.intensity) : "Workout";
  return `${pendingAction.durationMinutes || 0} min · ${type} · ${formatCalories(pendingAction.caloriesBurned)}`;
}

function describeWorkoutEntry(entry) {
  const type = entry.workoutType || "Workout";
  const duration = entry.durationMinutes ? `${entry.durationMinutes} min` : "duration TBD";
  const intensity = humanizeIntensity(entry.intensity || DEFAULT_WORKOUT_INTENSITY);
  const calories = formatCalories(entry.caloriesBurned);
  return `${type} · ${duration} · ${intensity} · ${calories}`;
}

function formatScheduledWorkoutSlot(entry) {
  const date = entry.scheduledDate || "";
  const time = entry.scheduledTime || "";
  if (date && time) {
    return `${date} at ${time}`;
  }
  return date || time || "No scheduled slot";
}

function trimTrailingZero(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function createPlanDraft() {
  return {
    workoutType: "",
    durationMinutes: 30,
    intensity: DEFAULT_WORKOUT_INTENSITY,
    caloriesBurned: DEFAULT_WORKOUT_CALORIES,
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

function createWeightScheduleDraft() {
  return {
    type: "daily",
    interval: 1,
    instancesPerPeriod: 1,
    weekdays: [1],
    timeOfDay: DEFAULT_WORKOUT_TIME,
    additionalTimes: []
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

function renderWeightWeekdayOptions(selectedDays) {
  const selected = new Set(normalizeWeekdays(selectedDays));
  return WEEKDAY_OPTIONS.map((option) => `
    <label>
      <input type="checkbox" value="${option.value}" data-weight-weekday ${selected.has(option.value) ? "checked" : ""} />
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

function renderWorkoutCompletionCard(task, widgetId, escapeHtml, getPendingActionForWidget) {
  const pendingAction = getPendingActionForWidget?.(widgetId, `workout-log:${task.id}`) || null;
  const durationMinutes = normalizeDurationMinutes(task.widgetTaskMeta?.durationMinutes || 30);
  const intensity = normalizeWorkoutIntensity(task.widgetTaskMeta?.intensity);
  const caloriesBurned = normalizeCaloriesBurned(task.widgetTaskMeta?.caloriesBurned ?? DEFAULT_WORKOUT_CALORIES);
  const disabled = pendingAction ? "disabled" : "";

  return `
    <article class="workout-log-card">
      <div class="workout-log-card-header">
        <div>
          <h4>${escapeHtml(task.widgetTaskMeta?.workoutType || task.name || "Workout")}</h4>
          <p class="sync-status">${escapeHtml(task.name || "Workout task")} · Due ${escapeHtml(formatProgressDueText(task))}</p>
        </div>
        <span class="workout-progress-chip">${escapeHtml(humanizeIntensity(intensity))}</span>
      </div>
      <form class="workout-log-form" data-workout-log-form data-task-id="${task.id}">
        <div class="quick-add-grid">
          <label>
            <span>Actual duration</span>
            <input type="number" min="1" max="600" step="1" value="${durationMinutes}" data-workout-log-duration ${disabled} />
          </label>
          <label>
            <span>Actual intensity</span>
            <select data-workout-log-intensity ${disabled}>
              ${WORKOUT_INTENSITY_OPTIONS.map((option) => `
                <option value="${option.value}" ${intensity === option.value ? "selected" : ""}>${option.label}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Calories burned</span>
            <input type="number" min="0" max="5000" step="1" value="${caloriesBurned}" data-workout-log-calories ${disabled} />
          </label>
        </div>
        <div class="widget-actions workout-inline-actions">
          ${pendingAction
            ? `<button type="button" class="ghost-button" data-workout-log-undo data-pending-key="${pendingAction.key}">Undo</button>`
            : `<button type="submit" class="primary-button">Complete + log</button>`}
        </div>
      </form>
    </article>
  `;
}

function renderWorkoutEntryCard(entry, escapeHtml, formatDateTime) {
  return `
    <article class="workout-entry-card">
      <div class="workout-entry-card-header">
        <div>
          <h4>${escapeHtml(entry.workoutType || entry.taskName || "Workout")}</h4>
          <p class="sync-status">${escapeHtml(describeWorkoutEntry(entry))}</p>
        </div>
        <span class="workout-progress-chip done">${escapeHtml(entry.source === "extra" ? "Extra" : "Task")}</span>
      </div>
      <div class="workout-progress-stats">
        <span><strong>Logged:</strong> ${escapeHtml(formatDateTime(entry.at))}</span>
        ${entry.scheduledDate ? `<span><strong>Scheduled:</strong> ${escapeHtml(formatScheduledWorkoutSlot(entry))}</span>` : ""}
      </div>
    </article>
  `;
}

function renderWeightEntryCard(entry, escapeHtml, formatDateTime) {
  return `
    <article class="workout-entry-card">
      <div class="workout-entry-card-header">
        <div>
          <h4>${escapeHtml(formatWeightEntry(entry))}</h4>
          <p class="sync-status">${escapeHtml(entry.taskName || (entry.source === "extra" ? "Extra weight log" : "Scheduled weight check-in"))}</p>
        </div>
        <span class="workout-progress-chip done">${escapeHtml(entry.source === "extra" ? "Extra" : "Task")}</span>
      </div>
      <div class="workout-progress-stats">
        <span><strong>Logged:</strong> ${escapeHtml(formatDateTime(entry.at))}</span>
        ${entry.scheduledDate ? `<span><strong>Scheduled:</strong> ${escapeHtml(formatScheduledWorkoutSlot(entry))}</span>` : ""}
      </div>
    </article>
  `;
}

function describeWorkoutPlan(plan) {
  const workoutType = plan.workoutType || plan.name || "Workout";
  const duration = plan.durationMinutes ? `${plan.durationMinutes} min` : "Duration TBD";
  const intensity = humanizeIntensity(plan.intensity);
  const calories = formatCalories(plan.caloriesBurned);
  const recurrence = describeWorkoutRecurrence(plan.recurrence);
  return `${workoutType} · ${duration} · ${intensity} · ${calories} · ${recurrence}`;
}

function humanizeIntensity(value) {
  return WORKOUT_INTENSITY_OPTIONS.find((option) => option.value === value)?.label || "Moderate";
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

function findActiveWeightCheckTask(tasks, widgetId, at = Date.now()) {
  const today = toDateString(new Date(at));
  return [...(Array.isArray(tasks) ? tasks : [])]
    .filter((task) => task?.ownerWidgetId === widgetId && task?.widgetCompletion?.mechanism === WEIGHT_COMPLETION_MECHANISM)
    .filter((task) => task.status === "open" && !task.archived)
    .filter((task) => !taskScheduleDate(task) || taskScheduleDate(task) <= today)
    .sort(compareWorkoutTaskSchedule)[0] || null;
}

function listReadyWorkoutTasks(tasks, widgetId, at = Date.now()) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  return allTasks
    .filter((task) =>
      task
      && task.ownerWidgetId === widgetId
      && task.widgetTaskKind === "workout-session"
      && !task.archived
      && task.status === "open"
      && isWorkoutTaskReady(task, allTasks, at)
    )
    .sort(compareWorkoutTaskSchedule);
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
  const calories = formatCalories(task.widgetTaskMeta?.caloriesBurned ?? DEFAULT_WORKOUT_CALORIES);
  return `${duration} · ${intensity} · ${calories}`;
}

function formatProgressDueText(task) {
  const date = task.dueDate || task.startDate || "";
  const time = task.timeOfDay || "23:59";
  return date ? `${date} at ${time}` : time;
}

function taskScheduleDate(task) {
  return task?.dueDate || task?.startDate || "";
}

function listWorkoutSeriesTasks(tasks, task) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const groupId = task?.linkedSeries?.groupId || "";
  return allTasks
    .filter((entry) => entry && !entry.archived && entry.widgetTaskKind === task?.widgetTaskKind)
    .filter((entry) => entry.ownerWidgetId === task?.ownerWidgetId)
    .filter((entry) => {
      if (groupId) {
        return entry.linkedSeries?.groupId === groupId;
      }
      return (entry.ownerTaskKey || "") === (task?.ownerTaskKey || "");
    })
    .sort(compareWorkoutTaskSchedule);
}

function resolveWorkoutAutoSkipCutoff(task, nextTask) {
  const scheduledDate = taskScheduleDate(task);
  if (!scheduledDate) {
    return 0;
  }
  if (nextTask && taskScheduleDate(nextTask) === scheduledDate) {
    return taskDueTimestamp(nextTask);
  }
  return taskDayEndTimestamp(task);
}

function compareWorkoutTaskSchedule(left, right) {
  const leftDate = `${left.dueDate || left.startDate || ""}T${left.timeOfDay || "23:59"}`;
  const rightDate = `${right.dueDate || right.startDate || ""}T${right.timeOfDay || "23:59"}`;
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return (left.createdAt || 0) - (right.createdAt || 0);
}

function taskDueTimestamp(task) {
  const date = taskScheduleDate(task);
  const time = task?.timeOfDay || "23:59";
  if (!date) {
    return 0;
  }
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function taskDayEndTimestamp(task) {
  const date = taskScheduleDate(task);
  if (!date) {
    return 0;
  }
  const timestamp = new Date(`${date}T23:59:59.999`).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isWorkoutTaskReady(task, tasks, at = Date.now()) {
  if (typeof task.notBeforeAt === "number" && task.notBeforeAt > at) {
    return false;
  }
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
  return dependencies.every((dependencyId) => {
    const dependency = tasks.find((entry) => entry.id === dependencyId);
    return !dependency || dependency.status === "done" || dependency.status === "skipped";
  });
}

function upsertWorkoutEntry(widget, entry) {
  const nextEntry = {
    id: typeof entry.id === "string" ? entry.id : "",
    at: typeof entry.at === "number" ? entry.at : Date.now(),
    workoutType: typeof entry.workoutType === "string" ? entry.workoutType.trim().slice(0, 80) : "",
    durationMinutes: normalizeDurationMinutes(entry.durationMinutes),
    intensity: normalizeWorkoutIntensity(entry.intensity),
    caloriesBurned: normalizeCaloriesBurned(entry.caloriesBurned),
    taskId: typeof entry.taskId === "string" ? entry.taskId : "",
    taskName: typeof entry.taskName === "string" ? entry.taskName.trim().slice(0, 120) : "",
    planId: typeof entry.planId === "string" ? entry.planId : "",
    scheduledDate: typeof entry.scheduledDate === "string" ? entry.scheduledDate : "",
    scheduledTime: normalizeTimeValue(entry.scheduledTime, ""),
    source: normalizeEntrySource(entry.source)
  };

  const existingIndex = nextEntry.taskId
    ? widget.data.workoutEntries.findIndex((item) => item.taskId === nextEntry.taskId && item.source === nextEntry.source)
    : -1;

  if (existingIndex >= 0) {
    widget.data.workoutEntries.splice(existingIndex, 1, {
      ...widget.data.workoutEntries[existingIndex],
      ...nextEntry
    });
  } else {
    widget.data.workoutEntries.push(nextEntry);
  }

  widget.data.workoutEntries.sort((left, right) => left.at - right.at);
}

function upsertWeightEntry(widget, entry) {
  const nextEntry = {
    id: typeof entry.id === "string" ? entry.id : "",
    at: typeof entry.at === "number" ? entry.at : Date.now(),
    value: normalizeWeightValue(entry.value),
    unit: normalizeWeightUnit(entry.unit),
    taskId: typeof entry.taskId === "string" ? entry.taskId : "",
    taskName: typeof entry.taskName === "string" ? entry.taskName.trim().slice(0, 120) : "",
    scheduledDate: typeof entry.scheduledDate === "string" ? entry.scheduledDate : "",
    scheduledTime: normalizeTimeValue(entry.scheduledTime, ""),
    source: normalizeEntrySource(entry.source)
  };

  const existingIndex = nextEntry.taskId
    ? widget.data.weightEntries.findIndex((item) => item.taskId === nextEntry.taskId && item.source === nextEntry.source)
    : -1;

  if (existingIndex >= 0) {
    widget.data.weightEntries.splice(existingIndex, 1, {
      ...widget.data.weightEntries[existingIndex],
      ...nextEntry
    });
  } else {
    widget.data.weightEntries.push(nextEntry);
  }

  widget.data.weightEntries.sort((left, right) => left.at - right.at);
}

function findRepairableWorkoutTasks(tasks, widget) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const workoutEntries = normalizeWorkoutEntries(widget?.data?.workoutEntries);
  const existingTaskIds = new Set(workoutEntries.map((entry) => entry.taskId).filter(Boolean));
  return allTasks
    .filter((task) =>
      task
      && task.ownerWidgetId === widget?.id
      && task.widgetTaskKind === "workout-session"
      && task.status === "done"
      && !task.archived
      && !existingTaskIds.has(task.id)
    )
    .sort(compareWorkoutTaskSchedule);
}

function repairMissingWorkoutLogs(widget, store, helpers) {
  const tasks = Array.isArray(store?.tasks) ? store.tasks : [];
  const repairableTasks = findRepairableWorkoutTasks(tasks, widget);
  let repairedCount = 0;

  for (const task of repairableTasks) {
    const completedAt = getLatestCompletedTimestamp(task) || task.updatedAt || task.createdAt || Date.now();
    upsertWorkoutEntry(widget, {
      id: helpers.createId(),
      at: completedAt,
      workoutType: task.widgetTaskMeta?.workoutType || task.name || "Workout",
      durationMinutes: normalizeDurationMinutes(task.widgetTaskMeta?.durationMinutes || 30),
      intensity: normalizeWorkoutIntensity(task.widgetTaskMeta?.intensity),
      caloriesBurned: normalizeCaloriesBurned(task.widgetTaskMeta?.caloriesBurned ?? DEFAULT_WORKOUT_CALORIES),
      taskId: task.id,
      taskName: task.name || "",
      planId: task.widgetTaskMeta?.planId || "",
      scheduledDate: task.dueDate || task.startDate || "",
      scheduledTime: task.timeOfDay || "",
      source: "task"
    });
    repairedCount += 1;
  }

  if (repairedCount > 0) {
    widget.updatedAt = Date.now();
  }

  return repairedCount;
}

function getLatestCompletedTimestamp(task) {
  const history = Array.isArray(task?.history) ? task.history : [];
  let latest = 0;
  for (const item of history) {
    if (item?.type === "completed" && typeof item.at === "number" && item.at > latest) {
      latest = item.at;
    }
  }
  return latest;
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

function getSelectedWeightWeekdays(container) {
  return normalizeWeekdays(
    Array.from(container.querySelectorAll("[data-weight-weekday]:checked")).map((input) => Number(input.value))
  );
}

function collectAdditionalTimes(container) {
  const values = Array.from(container.querySelectorAll("[data-workout-additional-time]"))
    .map((input) => normalizeTimeValue(input.value, ""))
    .filter(Boolean);
  const normalized = normalizeAdditionalTimes(values);
  return normalized.length === values.length ? normalized : null;
}

function normalizeWorkoutDetailTab(value) {
  return value === "plans" || value === "weight" ? value : "overview";
}

function normalizeWorkoutChartPeriod(value) {
  return WORKOUT_CHART_PERIODS.includes(value) ? value : "daily";
}

function getWorkoutChartSpanOptions(period) {
  return WORKOUT_CHART_SPANS[normalizeWorkoutChartPeriod(period)] || WORKOUT_CHART_SPANS.daily;
}

function normalizeWorkoutChartSpan(period, value) {
  const normalizedPeriod = normalizeWorkoutChartPeriod(period);
  if (normalizedPeriod === "yearly") {
    return "all";
  }
  const options = getWorkoutChartSpanOptions(normalizedPeriod);
  return options.includes(Number(value)) ? Number(value) : options[0];
}

function getWorkoutShellState(widgetId) {
  if (!workoutShellUiState.has(widgetId)) {
    workoutShellUiState.set(widgetId, {
      quickAdHocOpen: false,
      detailTab: "overview",
      chartPeriod: "daily",
      chartSpan: 7
    });
  }
  return workoutShellUiState.get(widgetId);
}

function setWorkoutShellQuickFormOpen(widgetId, quickAdHocOpen) {
  workoutShellUiState.set(widgetId, {
    ...getWorkoutShellState(widgetId),
    quickAdHocOpen: Boolean(quickAdHocOpen)
  });
}

function getWorkoutDetailState(widgetId) {
  const shellState = getWorkoutShellState(widgetId);
  const chartPeriod = normalizeWorkoutChartPeriod(shellState.chartPeriod);
  return {
    ...shellState,
    detailTab: normalizeWorkoutDetailTab(shellState.detailTab),
    chartPeriod,
    chartSpan: normalizeWorkoutChartSpan(chartPeriod, shellState.chartSpan)
  };
}

function setWorkoutDetailTab(widgetId, detailTab) {
  workoutShellUiState.set(widgetId, {
    ...getWorkoutShellState(widgetId),
    detailTab: normalizeWorkoutDetailTab(detailTab)
  });
}

function setWorkoutChartPeriod(widgetId, chartPeriod) {
  const normalizedPeriod = normalizeWorkoutChartPeriod(chartPeriod);
  workoutShellUiState.set(widgetId, {
    ...getWorkoutShellState(widgetId),
    chartPeriod: normalizedPeriod,
    chartSpan: normalizeWorkoutChartSpan(normalizedPeriod, getWorkoutShellState(widgetId).chartSpan)
  });
}

function setWorkoutChartSpan(widgetId, chartPeriod, chartSpan) {
  const normalizedPeriod = normalizeWorkoutChartPeriod(chartPeriod);
  workoutShellUiState.set(widgetId, {
    ...getWorkoutShellState(widgetId),
    chartPeriod: normalizedPeriod,
    chartSpan: normalizeWorkoutChartSpan(normalizedPeriod, chartSpan)
  });
}

function renderWorkoutDetailTabButton(key, label, activeTab, escapeHtml) {
  const active = activeTab === key;
  return `
    <button
      type="button"
      class="workout-detail-tab${active ? " is-active" : ""}"
      data-workout-detail-tab="${key}"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      title="${escapeHtml(label)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderShellAdHocWorkoutForm(escapeHtml) {
  return renderAdHocWorkoutForm({
    escapeHtml,
    pendingAction: null,
    formAttribute: "data-workout-shell-adhoc-form",
    submitLabel: "Log workout",
    includeHeading: false,
    compact: true
  });
}

function renderWeightLogForm({ escapeHtml, weightTracking, pendingWeightLog, submitLabel, compact = false }) {
  const disabled = !weightTracking.enabled || pendingWeightLog ? "disabled" : "";
  return `
    <form class="workout-log-form ${compact ? "workout-shell-form" : ""}" data-weight-log-form>
      <div class="quick-add-grid">
        <label class="${compact ? "quick-add-title" : ""}">
          <span>Weight (${escapeHtml(weightTracking.unit)})</span>
          <input
            type="number"
            min="1"
            max="2000"
            step="0.1"
            placeholder="Enter weight"
            data-weight-log-value
            ${disabled}
          />
        </label>
      </div>
      <div class="widget-actions workout-inline-actions">
        ${pendingWeightLog
          ? `<button type="button" class="ghost-button" data-weight-log-undo data-pending-key="${pendingWeightLog.key}">Undo</button>`
          : `<button type="submit" class="primary-button" ${!weightTracking.enabled ? "disabled" : ""}>${escapeHtml(submitLabel)}</button>`}
      </div>
    </form>
  `;
}

function renderAdHocWorkoutForm({ escapeHtml, pendingAction, formAttribute, submitLabel, includeHeading, compact = false }) {
  const disabled = pendingAction ? "disabled" : "";
  return `
    <form class="workout-log-form ${compact ? "workout-shell-form" : ""}" ${formAttribute}>
      ${includeHeading ? "<h4>Ad hoc workout</h4>" : ""}
      <div class="quick-add-grid">
        <label class="${compact ? "quick-add-title" : ""}">
          <span>Workout type</span>
          <input type="text" maxlength="80" placeholder="Run, lift, yoga..." data-workout-adhoc-type ${disabled} />
        </label>
        <label>
          <span>Duration (minutes)</span>
          <input type="number" min="1" max="600" step="1" value="30" data-workout-adhoc-duration ${disabled} />
        </label>
        <label>
          <span>Intensity</span>
          <select data-workout-adhoc-intensity ${disabled}>
            ${WORKOUT_INTENSITY_OPTIONS.map((option) => `
              <option value="${option.value}" ${option.value === DEFAULT_WORKOUT_INTENSITY ? "selected" : ""}>${option.label}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>Calories burned</span>
          <input type="number" min="0" max="5000" step="1" value="${DEFAULT_WORKOUT_CALORIES}" data-workout-adhoc-calories ${disabled} />
        </label>
      </div>
      <div class="widget-actions workout-inline-actions">
        ${pendingAction
          ? `<button type="button" class="ghost-button" data-workout-adhoc-undo data-pending-key="${pendingAction.key}">Undo</button>`
          : `<button type="submit" class="primary-button">${escapeHtml(submitLabel)}</button>`}
      </div>
    </form>
  `;
}

function submitAdHocWorkoutForm(widget, form, helpers) {
  const workoutType = String(form.querySelector("[data-workout-adhoc-type]")?.value || "").trim().slice(0, 80);
  const durationMinutes = normalizeDurationMinutes(form.querySelector("[data-workout-adhoc-duration]")?.value);
  const intensity = normalizeWorkoutIntensity(form.querySelector("[data-workout-adhoc-intensity]")?.value);
  const caloriesBurned = normalizeCaloriesBurned(form.querySelector("[data-workout-adhoc-calories]")?.value);
  const staged = stageAdHocWorkoutLog(widget, { workoutType, durationMinutes, intensity, caloriesBurned }, helpers);
  if (staged && form.matches("[data-workout-shell-adhoc-form]")) {
    setWorkoutShellQuickFormOpen(widget.id, false);
    helpers.renderAll();
  }
}

function formatCalories(value) {
  return `${normalizeCaloriesBurned(value)} cal`;
}

function sumWorkoutCaloriesForCurrentWeek(entries, now = new Date()) {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  return normalizeWorkoutEntries(entries)
    .filter((entry) => {
      const date = toDateString(new Date(entry.at));
      return date >= weekStart && date <= weekEnd;
    })
    .reduce((sum, entry) => sum + normalizeCaloriesBurned(entry.caloriesBurned), 0);
}

function formatPendingAdHocWorkoutSummary(pendingAction) {
  if (!pendingAction) {
    return "";
  }
  return `${pendingAction.workoutType || "Workout"} · ${pendingAction.durationMinutes || 0} min · ${humanizeIntensity(pendingAction.intensity)} · ${formatCalories(pendingAction.caloriesBurned)}`;
}

function humanizeWorkoutChartPeriod(period) {
  switch (normalizeWorkoutChartPeriod(period)) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      return "Daily";
  }
}

function formatWorkoutChartSpanLabel(period, span) {
  const normalizedPeriod = normalizeWorkoutChartPeriod(period);
  if (normalizedPeriod === "yearly") {
    return "All time";
  }
  const numeric = Number(span);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return "";
  }
  const noun = normalizedPeriod === "weekly"
    ? "week"
    : normalizedPeriod === "monthly"
      ? "month"
      : "day";
  return `${numeric} ${noun}${numeric === 1 ? "" : "s"}`;
}

function buildWorkoutHistoryChartModel(widget, period, span, now = new Date()) {
  const normalizedPeriod = normalizeWorkoutChartPeriod(period);
  const normalizedSpan = normalizeWorkoutChartSpan(normalizedPeriod, span);
  const workoutEntries = normalizeWorkoutEntries(widget?.data?.workoutEntries)
    .map((entry) => ({
      at: entry.at,
      caloriesBurned: normalizeCaloriesBurned(entry.caloriesBurned)
    }))
    .filter((entry) => entry.caloriesBurned > 0)
    .sort((left, right) => left.at - right.at);
  const weightEntries = normalizeWeightEntries(widget?.data?.weightEntries)
    .map((entry) => ({
      at: entry.at,
      value: normalizeWeightValue(entry.value)
    }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => left.at - right.at);
  const buckets = buildWorkoutHistoryBuckets(normalizedPeriod, normalizedSpan, workoutEntries, weightEntries, now).map((bucket) => {
    const calorieEntries = workoutEntries.filter((entry) => entry.at >= bucket.startAt && entry.at < bucket.endAt);
    const weightInBucket = weightEntries.filter((entry) => entry.at >= bucket.startAt && entry.at < bucket.endAt);
    const latestWeight = weightInBucket.length ? weightInBucket[weightInBucket.length - 1] : null;
    return {
      ...bucket,
      calories: calorieEntries.reduce((sum, entry) => sum + entry.caloriesBurned, 0),
      weight: latestWeight?.value ?? null
    };
  });
  const totalCalories = buckets.reduce((sum, bucket) => sum + bucket.calories, 0);

  return {
    period: normalizedPeriod,
    span: normalizedSpan,
    buckets,
    totalCalories,
    hasData: buckets.some((bucket) => bucket.calories > 0 || bucket.weight !== null),
    summaryLabel: normalizedPeriod === "yearly"
      ? "All-time calories"
      : `${humanizeWorkoutChartPeriod(normalizedPeriod)} total (${formatWorkoutChartSpanLabel(normalizedPeriod, normalizedSpan)})`
  };
}

function buildWorkoutHistoryBuckets(period, span, workoutEntries, weightEntries, now) {
  const allEntries = [...workoutEntries, ...weightEntries].sort((left, right) => left.at - right.at);
  if (period === "yearly") {
    if (!allEntries.length) {
      return [];
    }
    const firstYear = new Date(allEntries[0].at).getFullYear();
    const currentYear = new Date(now).getFullYear();
    const buckets = [];
    for (let year = firstYear; year <= currentYear; year += 1) {
      const start = chartStartOfYear(new Date(year, 0, 1));
      const end = chartStartOfYear(new Date(year + 1, 0, 1));
      buckets.push({
        startAt: start.getTime(),
        endAt: end.getTime(),
        label: String(year),
        shortLabel: String(year)
      });
    }
    return buckets;
  }

  if (period === "monthly") {
    const currentMonthStart = chartStartOfMonth(now);
    const firstMonthStart = chartAddMonths(currentMonthStart, -(span - 1));
    return Array.from({ length: span }, (_, index) => {
      const start = chartAddMonths(firstMonthStart, index);
      const end = chartAddMonths(start, 1);
      return {
        startAt: start.getTime(),
        endAt: end.getTime(),
        label: formatMonthBucketLabel(start),
        shortLabel: formatMonthBucketLabel(start, { compact: span <= 12 })
      };
    });
  }

  if (period === "weekly") {
    const currentWeekStart = chartStartOfWeek(now);
    const firstWeekStart = chartAddDays(currentWeekStart, -((span - 1) * 7));
    return Array.from({ length: span }, (_, index) => {
      const start = chartAddDays(firstWeekStart, index * 7);
      const end = chartAddDays(start, 7);
      return {
        startAt: start.getTime(),
        endAt: end.getTime(),
        label: `Week of ${formatShortDate(start)}`,
        shortLabel: formatShortDate(start)
      };
    });
  }

  const currentDayStart = chartStartOfDay(now);
  const firstDayStart = chartAddDays(currentDayStart, -(span - 1));
  return Array.from({ length: span }, (_, index) => {
    const start = chartAddDays(firstDayStart, index);
    const end = chartAddDays(start, 1);
    return {
      startAt: start.getTime(),
      endAt: end.getTime(),
      label: formatDailyBucketLabel(start),
      shortLabel: formatShortDate(start)
    };
  });
}

function drawWorkoutHistoryChart(canvas, emptyState, chartModel, weightUnit) {
  const ctx = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.floor(bounds.width || canvas.clientWidth || 720));
  const height = Math.max(260, Math.floor(bounds.height || 280));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!chartModel?.hasData || !Array.isArray(chartModel?.buckets) || !chartModel.buckets.length) {
    canvas.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  canvas.classList.remove("hidden");
  emptyState.classList.add("hidden");

  const padding = { top: 24, right: 56, bottom: 42, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const calorieValues = chartModel.buckets.map((bucket) => bucket.calories);
  const weightValues = chartModel.buckets
    .map((bucket) => bucket.weight)
    .filter((value) => Number.isFinite(value));
  const calorieMax = Math.max(...calorieValues, 100);
  const singleWeightValue = weightValues.length === 1 ? weightValues[0] : null;
  const weightMin = weightValues.length
    ? (singleWeightValue !== null ? singleWeightValue - 1 : Math.min(...weightValues))
    : 0;
  const weightMax = weightValues.length
    ? (singleWeightValue !== null ? singleWeightValue + 1 : Math.max(...weightValues))
    : 10;
  const weightSpan = Math.max(weightMax - weightMin, 1);
  const bucketWidth = chartWidth / Math.max(chartModel.buckets.length, 1);
  const barWidth = Math.max(8, Math.min(34, bucketWidth * 0.58));

  ctx.strokeStyle = "rgba(124, 146, 173, 0.18)";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(37, 50, 67, 0.78)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  drawWorkoutBars(ctx, chartModel.buckets, {
    padding,
    chartHeight,
    barWidth,
    calorieMax,
    bucketWidth
  });
  const weightPoints = chartModel.buckets
    .map((bucket, index) => {
      if (!Number.isFinite(bucket.weight)) {
        return null;
      }
      return {
        x: padding.left + (bucketWidth * index) + (bucketWidth / 2),
        y: padding.top + chartHeight - (((bucket.weight - weightMin) / weightSpan) * chartHeight),
        value: bucket.weight
      };
    })
    .filter(Boolean);
  drawWorkoutSeries(ctx, weightPoints, "#4ea8de", "rgba(78, 168, 222, 0.18)");

  ctx.fillStyle = "rgba(118, 138, 164, 0.92)";
  ctx.font = "12px Sora, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("0 cal", padding.left - 10, height - padding.bottom + 4);
  ctx.fillText(formatCalories(calorieMax), padding.left - 10, padding.top + 4);
  ctx.textAlign = "left";
  if (weightValues.length) {
    ctx.fillText(`${trimTrailingZero(weightMin)} ${weightUnit}`, width - padding.right + 10, height - padding.bottom + 4);
    ctx.fillText(`${trimTrailingZero(weightMax)} ${weightUnit}`, width - padding.right + 10, padding.top + 4);
  }

  drawWorkoutChartLabels(ctx, chartModel, padding, chartWidth, height);
}

function drawWorkoutBars(ctx, buckets, {
  padding,
  chartHeight,
  barWidth,
  calorieMax,
  bucketWidth
}) {
  ctx.fillStyle = "rgba(255, 140, 66, 0.78)";
  buckets.forEach((bucket, index) => {
    if (bucket.calories <= 0) {
      return;
    }
    const barHeight = Math.max(3, (bucket.calories / calorieMax) * chartHeight);
    const x = padding.left + (bucketWidth * index) + ((bucketWidth - barWidth) / 2);
    const y = padding.top + chartHeight - barHeight;
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

function drawWorkoutSeries(ctx, points, strokeStyle, fillStyle) {
  if (!points.length) {
    return;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = strokeStyle;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawWorkoutChartLabels(ctx, chartModel, padding, chartWidth, height) {
  if (!chartModel?.buckets?.length) {
    return;
  }
  const maxLabels = 6;
  const buckets = chartModel.buckets;
  const sample = [buckets[0]];
  if (buckets.length > 2) {
    sample.push(buckets[Math.floor(buckets.length / 2)]);
  }
  if (buckets.length > 1) {
    sample.push(buckets[buckets.length - 1]);
  }
  if (buckets.length > maxLabels) {
    const step = Math.max(1, Math.floor((buckets.length - 1) / (maxLabels - 1)));
    for (let index = step; index < buckets.length - 1; index += step) {
      sample.push(buckets[index]);
    }
  }
  const seen = new Set();
  ctx.fillStyle = "rgba(118, 138, 164, 0.92)";
  ctx.font = "12px Sora, sans-serif";
  ctx.textAlign = "center";
  const bucketWidth = chartWidth / Math.max(buckets.length, 1);
  sample.forEach((bucket) => {
    if (seen.has(bucket.startAt)) {
      return;
    }
    seen.add(bucket.startAt);
    const bucketIndex = buckets.findIndex((entry) => entry.startAt === bucket.startAt);
    if (bucketIndex < 0) {
      return;
    }
    const x = padding.left + (bucketWidth * bucketIndex) + (bucketWidth / 2);
    ctx.fillText(bucket.shortLabel, x, height - 12);
  });
}

function chartStartOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function chartStartOfWeek(value) {
  const dayStart = chartStartOfDay(value);
  return chartAddDays(dayStart, -dayStart.getDay());
}

function chartStartOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function chartStartOfYear(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), 0, 1);
}

function chartAddDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return chartStartOfDay(date);
}

function chartAddMonths(value, amount) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatShortDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDailyBucketLabel(value) {
  const date = new Date(value);
  return `${WEEKDAY_OPTIONS[date.getDay()]?.label || ""} ${formatShortDate(date)}`;
}

function formatMonthBucketLabel(value, { compact = false } = {}) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, compact
    ? { month: "short" }
    : { month: "short", year: "numeric" });
}

function compareWorkoutPlanDisplay(left, right) {
  const leftName = (left.name || left.workoutType || "").toLowerCase();
  const rightName = (right.name || right.workoutType || "").toLowerCase();
  return leftName.localeCompare(rightName) || (left.createdAt || 0) - (right.createdAt || 0);
}
