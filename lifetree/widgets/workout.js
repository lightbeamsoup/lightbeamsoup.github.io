export const WORKOUT_WIDGET_TYPE = "workout";

const DEFAULT_WEIGHT_UNIT = "lb";
const DEFAULT_WORKOUT_INTENSITY = "moderate";

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

  render({ widget, escapeHtml, formatDateTime }) {
    const planCount = widget.settings.workoutPlans.length;
    const latestWorkout = widget.data.workoutEntries[widget.data.workoutEntries.length - 1] || null;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;

    return `
      <div class="widget-slot-header">
        <div>
          <h3>Workout Coach</h3>
          <p>Track workout plans, daily or weekly progress, and optional weight logs.</p>
        </div>
        <span class="widget-badge">Scaffold</span>
      </div>
      <p>Workout plans: <strong>${planCount}</strong></p>
      <p>${latestWorkout ? `Latest workout: ${escapeHtml(latestWorkout.workoutType || "Workout")} at ${formatDateTime(latestWorkout.at)}` : "No workout logs yet."}</p>
      <p>${latestWeight ? `Latest weight: ${escapeHtml(formatWeightEntry(latestWeight))} at ${formatDateTime(latestWeight.at)}` : "No weight logs yet."}</p>
      <div class="widget-actions">
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
        <button type="button" class="ghost-button" data-widget-action="remove-widget">Remove widget</button>
      </div>
    `;
  },

  renderDetail({ widget, escapeHtml, formatDateTime }) {
    const latestWorkout = widget.data.workoutEntries[widget.data.workoutEntries.length - 1] || null;
    const latestWeight = widget.data.weightEntries[widget.data.weightEntries.length - 1] || null;
    const weightTracking = widget.settings.weightTracking;

    return `
      <section class="energy-detail">
        <div class="energy-detail-grid">
          <section class="energy-detail-card">
            <div class="energy-detail-header">
              <div>
                <p class="eyebrow">Workout plans</p>
                <h3>Plan workouts</h3>
                <p class="sync-status">Next step: define daily and weekly workout plans with workout type, duration, and intensity.</p>
              </div>
            </div>
            <p>${widget.settings.workoutPlans.length ? `${widget.settings.workoutPlans.length} workout plan${widget.settings.workoutPlans.length === 1 ? "" : "s"} scaffolded.` : "No workout plans yet."}</p>
            <p class="sync-status">These plans will eventually own linked recurring tasks and show grouped progress in Dailies and Weeklies.</p>
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
  }
};

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
    instancesPerPeriod: normalizePositiveInteger(value.instancesPerPeriod, 1),
    weekdays: Array.isArray(value.weekdays)
      ? value.weekdays
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [],
    timeOfDay: typeof value.timeOfDay === "string" ? value.timeOfDay : ""
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
