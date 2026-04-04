import { toDateString } from "../logic.js";
import { normalizeReminderMinutes } from "./notifications.js";

export function createTaskComposerBindings(config = {}) {
  const {
    createId,
    getMaxTaskPoints,
    resolveCategorySnapshot,
    normalizeImportance,
    normalizeTaskPoints,
    normalizeWidgetTaskMeta,
    normalizeWidgetCompletion,
    normalizeLinkedSeries,
    normalizeGoogleCalendarTaskLink = (value) => ({
      calendarId: typeof value?.calendarId === "string" ? value.calendarId : "",
      eventId: typeof value?.eventId === "string" ? value.eventId : "",
      recurringEventId: typeof value?.recurringEventId === "string" ? value.recurringEventId : "",
      source: typeof value?.source === "string" ? value.source : "lifetree",
      linkedAt: typeof value?.linkedAt === "number" ? value.linkedAt : 0,
      lastSeenGoogleUpdatedAt: typeof value?.lastSeenGoogleUpdatedAt === "string" ? value.lastSeenGoogleUpdatedAt : "",
      scheduleFingerprint: typeof value?.scheduleFingerprint === "string" ? value.scheduleFingerprint : "",
      statusMirroredAt: typeof value?.statusMirroredAt === "number" ? value.statusMirroredAt : 0,
      schemaVersion: 1
    }),
    deriveTaskNotBeforeAt,
    defaultImportance = "medium",
    defaultLateGraceMinutes = 15,
    defaultLength = "medium",
    lengthOrder = {},
    dependenciesSelect = null,
    todayString = () => "",
    linkedSeriesKindDaily = "daily-window",
    linkedSeriesKindWeekly = "weekly-window",
    refs = {},
    composerPanelState = null,
    composerReminderState = null,
    escapeHtml = (value) => String(value ?? ""),
    defaultTaskDueSoonReminderMinutes = 15
  } = config;

  function parsePositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function parsePositiveOrZeroNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function normalizeWidgetReminderDefaults(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
    const dueSoonMinutes = normalizeReminderMinutes(value.dueSoonMinutes, null);
    const overdueMinutes = normalizeReminderMinutes(value.overdueMinutes, null);
    return { enabled, dueSoonMinutes, overdueMinutes };
  }

  function normalizeTaskReminders(value, {
    originalReminders = null,
    importance = defaultImportance,
    lateGraceMinutes = defaultLateGraceMinutes,
    widgetTaskMeta = null
  } = {}) {
    const widgetDefaults = normalizeWidgetReminderDefaults(widgetTaskMeta?.reminderDefaults);
    const explicitEnabled = typeof value?.enabled === "boolean"
      ? value.enabled
      : (typeof originalReminders?.enabled === "boolean" ? originalReminders.enabled : undefined);
    const enabled = typeof explicitEnabled === "boolean"
      ? explicitEnabled
      : (typeof widgetDefaults?.enabled === "boolean"
        ? widgetDefaults.enabled
        : normalizeImportance(importance) === "high");
    const dueSoonMinutes = value && Object.prototype.hasOwnProperty.call(value, "dueSoonMinutes")
      ? normalizeReminderMinutes(value.dueSoonMinutes, null)
      : (originalReminders && Object.prototype.hasOwnProperty.call(originalReminders, "dueSoonMinutes")
        ? normalizeReminderMinutes(originalReminders.dueSoonMinutes, null)
        : normalizeReminderMinutes(widgetDefaults?.dueSoonMinutes, null));
    const overdueMinutes = value && Object.prototype.hasOwnProperty.call(value, "overdueMinutes")
      ? normalizeReminderMinutes(value.overdueMinutes, null)
      : (originalReminders && Object.prototype.hasOwnProperty.call(originalReminders, "overdueMinutes")
        ? normalizeReminderMinutes(originalReminders.overdueMinutes, null)
        : normalizeReminderMinutes(widgetDefaults?.overdueMinutes, null));

    return {
      enabled,
      dueSoonMinutes,
      overdueMinutes
    };
  }

  function buildTaskReminderDraftFromForm(formData, {
    originalTask = null,
    importance = defaultImportance,
    lateGraceMinutes = defaultLateGraceMinutes,
    widgetTaskMeta = null
  } = {}) {
    return normalizeTaskReminders({
      enabled: formData.get("taskRemindersEnabled") === "on",
      dueSoonMinutes: normalizeReminderMinutes(formData.get("taskReminderDueSoonMinutes"), null),
      overdueMinutes: normalizeReminderMinutes(formData.get("taskReminderOverdueMinutes"), null)
    }, {
      originalReminders: originalTask?.reminders,
      importance,
      lateGraceMinutes,
      widgetTaskMeta
    });
  }

  function normalizeSkipRule(value) {
    if (!value || typeof value !== "object") {
      return { type: "none" };
    }

    if (value.type === "recurring-window") {
      return {
        type: value.type,
        period: value.period === "monthly" ? "monthly" : "weekly",
        cutoffDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.cutoffDate || "")) ? String(value.cutoffDate) : "",
        cutoffTime: /^\d{2}:\d{2}$/.test(String(value.cutoffTime || "")) ? String(value.cutoffTime) : "",
        cutoffReason: value.cutoffReason === "next-instance" ? "next-instance" : "period-end"
      };
    }

    if (value.type === "after-due-minutes") {
      return {
        type: value.type,
        graceMinutes: parsePositiveOrZeroNumber(value.graceMinutes) ?? 0
      };
    }

    if (value.type === "end-of-day") {
      return { type: value.type };
    }

    if (value.type === "widget-lockout") {
      return {
        type: value.type,
        policy: typeof value.policy === "string" ? value.policy : ""
      };
    }

    return { type: "none" };
  }

  function normalizeRecurrence(recurrence) {
    if (!recurrence || typeof recurrence !== "object") {
      return { type: "none" };
    }
    return {
      type: typeof recurrence.type === "string" ? recurrence.type : "none",
      interval: typeof recurrence.interval === "number" ? recurrence.interval : 1,
      weekday: typeof recurrence.weekday === "number" ? recurrence.weekday : 0,
      day: typeof recurrence.day === "number" ? recurrence.day : 1,
      ordinal: typeof recurrence.ordinal === "string" ? recurrence.ordinal : "first",
      sourceType: typeof recurrence.sourceType === "string" ? recurrence.sourceType : "",
      endDate: typeof recurrence.endDate === "string" ? recurrence.endDate : "",
      count: typeof recurrence.count === "number" ? recurrence.count : null,
      forever: recurrence.forever === true
    };
  }

  function buildSkipRule(formData, originalSkipRule = null) {
    const type = String(formData.get("skipRuleType") || originalSkipRule?.type || "none");
    if (type === "none") {
      return { type: "none" };
    }

    if (type === "after-due-minutes") {
      return {
        type,
        graceMinutes: parsePositiveOrZeroNumber(formData.get("skipGraceMinutes")) ?? originalSkipRule?.graceMinutes ?? 0
      };
    }

    if (type === "end-of-day") {
      return { type };
    }

    return normalizeSkipRule(originalSkipRule);
  }

  function buildRecurrence(formData, originalRecurrence = null) {
    const type = String(formData.get("recurrenceType") || "none");
    if (type === "none") {
      return { type: "none" };
    }

    const recurrence = {
      type,
      endDate: String(formData.get("recurrenceEndDate") || ""),
      count: parsePositiveNumber(formData.get("recurrenceCount")),
      forever: Boolean(formData.get("recurrenceForever")),
      interval: originalRecurrence?.interval || 1,
      weekday: originalRecurrence?.weekday ?? 0,
      day: originalRecurrence?.day || 1,
      ordinal: originalRecurrence?.ordinal || "first"
    };

    if (recurrence.forever) {
      recurrence.endDate = "";
      recurrence.count = null;
    }

    if (type === "daily") {
      recurrence.interval = 1;
    }

    if (type === "weekly") {
      recurrence.interval = parsePositiveNumber(formData.get("weeklyInterval")) || 1;
      recurrence.weekday = Number(formData.get("weeklyWeekday") || 0);
    }

    if (type === "monthly-date") {
      recurrence.interval = parsePositiveNumber(formData.get("monthlyInterval")) || 1;
      recurrence.day = parsePositiveNumber(formData.get("monthlyDay")) || 1;
    }

    if (type === "monthly-weekday") {
      recurrence.ordinal = String(formData.get("monthlyOrdinal") || "first");
      recurrence.weekday = Number(formData.get("monthlyWeekday") || 0);
      recurrence.interval = 1;
    }

    return recurrence;
  }

  function buildTaskDraftFromForm(formData, { originalTask = null, skipRule, categorySnapshot, recurrence } = {}) {
    const resolvedSkipRule = skipRule || (originalTask?.skipRule?.type === "widget-lockout"
      ? normalizeSkipRule(originalTask.skipRule)
      : buildSkipRule(formData, originalTask?.skipRule));
    const resolvedCategory = categorySnapshot || resolveCategorySnapshot(String(formData.get("category") || ""), originalTask);
    const resolvedRecurrence = recurrence || buildRecurrence(formData, originalTask?.recurrence);
    const resolvedImportance = String(formData.get("importance") || originalTask?.importance || defaultImportance);
    const resolvedLateGraceMinutes = parsePositiveOrZeroNumber(formData.get("lateGraceMinutes")) ?? originalTask?.lateGraceMinutes ?? defaultLateGraceMinutes;
    return {
      name: String(formData.get("name") || "").trim(),
      details: String(formData.get("details") || "").trim(),
      startDate: String(formData.get("startDate") || ""),
      dueDate: String(formData.get("dueDate") || ""),
      timeOfDay: String(formData.get("timeOfDay") || ""),
      lateGraceMinutes: resolvedLateGraceMinutes,
      points: formData.get("points"),
      length: String(formData.get("length") || defaultLength),
      category: resolvedCategory.key,
      importance: resolvedImportance,
      reminders: buildTaskReminderDraftFromForm(formData, {
        originalTask,
        importance: resolvedImportance,
        lateGraceMinutes: resolvedLateGraceMinutes,
        widgetTaskMeta: originalTask?.widgetTaskMeta
      }),
      skipRule: resolvedSkipRule,
      dependencies: Array.from(dependenciesSelect?.selectedOptions || []).map((option) => option.value),
      recurrence: resolvedRecurrence
    };
  }

  function buildTaskFromValues(values, originalTask = null, categorySnapshot = null) {
    const normalizedName = String(values?.name || "").trim();
    const normalizedDetails = String(values?.details || "").trim();
    const rawStartDate = String(values?.startDate || "").trim();
    const startDateWasImplicit = !rawStartDate;
    const normalizedStartDate = rawStartDate || originalTask?.startDate || todayString();
    const normalizedDueDate = String(values?.dueDate || "").trim();
    const rawTimeOfDay = String(values?.timeOfDay || "").trim();
    const normalizedTimeOfDay = rawTimeOfDay || (normalizedDueDate ? "23:59" : "");
    const normalizedLength = lengthOrder[String(values?.length || "")] ? String(values.length) : defaultLength;
    const resolvedCategory = categorySnapshot || resolveCategorySnapshot(String(values?.category || ""), originalTask);
    const normalizedRecurrence = normalizeRecurrence(values?.recurrence);
    const normalizedDependencies = Array.isArray(values?.dependencies)
      ? values.dependencies.filter((dependencyId) => typeof dependencyId === "string" && dependencyId)
      : [];
    const lateGraceMinutes = parsePositiveOrZeroNumber(values?.lateGraceMinutes) ?? originalTask?.lateGraceMinutes ?? defaultLateGraceMinutes;
    const normalizedImportance = normalizeImportance(String(values?.importance || originalTask?.importance || defaultImportance));
    const normalizedWidgetTaskMeta = normalizeWidgetTaskMeta(values?.widgetTaskMeta || originalTask?.widgetTaskMeta);
    const normalizedReminders = normalizeTaskReminders(values?.reminders, {
      originalReminders: originalTask?.reminders,
      importance: normalizedImportance,
      lateGraceMinutes,
      widgetTaskMeta: normalizedWidgetTaskMeta
    });

    return {
      id: originalTask?.id || createId(),
      templateId: originalTask?.templateId || "",
      occurrenceIndex: originalTask?.occurrenceIndex || 0,
      name: normalizedName,
      details: normalizedDetails,
      startDate: normalizedStartDate,
      dueDate: normalizedDueDate,
      timeOfDay: normalizedTimeOfDay,
      lateGraceMinutes,
      notBeforeAt: deriveTaskNotBeforeAt({
        recurrence: normalizedRecurrence,
        startDate: normalizedStartDate,
        dueDate: normalizedDueDate,
        originalTask,
        startDateWasImplicit
      }),
      pointsValue: normalizeTaskPoints(values?.points, originalTask?.pointsValue, getMaxTaskPoints()),
      pointsEntryId: originalTask?.pointsEntryId || "",
      length: normalizedLength,
      categoryKey: resolvedCategory.key,
      categoryLabel: resolvedCategory.label,
      categoryColor: resolvedCategory.color,
      importance: normalizedImportance,
      status: originalTask?.status || "open",
      createdAt: originalTask?.createdAt || Date.now(),
      updatedAt: Date.now(),
      ownerWidgetId: originalTask?.ownerWidgetId || "",
      ownerWidgetType: originalTask?.ownerWidgetType || "",
      ownerTaskKey: originalTask?.ownerTaskKey || "",
      widgetTaskKind: typeof values?.widgetTaskKind === "string"
        ? values.widgetTaskKind
        : (typeof originalTask?.widgetTaskKind === "string" ? originalTask.widgetTaskKind : ""),
      widgetTaskMeta: normalizedWidgetTaskMeta,
      googleCalendar: normalizeGoogleCalendarTaskLink(originalTask?.googleCalendar),
      reminders: normalizedReminders,
      linkedSeries: normalizeLinkedSeries(values?.linkedSeries || originalTask?.linkedSeries),
      sequenceDependencyId: typeof values?.sequenceDependencyId === "string"
        ? values.sequenceDependencyId
        : (typeof originalTask?.sequenceDependencyId === "string" ? originalTask.sequenceDependencyId : ""),
      widgetCompletion: normalizeWidgetCompletion(originalTask?.widgetCompletion),
      skipRule: normalizeSkipRule(values?.skipRule),
      dependencies: normalizedDependencies,
      recurrence: normalizedRecurrence,
      history: Array.isArray(originalTask?.history) ? originalTask.history : []
    };
  }

  function buildTaskFromForm(formData, originalTask = null) {
    const skipRule = originalTask?.skipRule?.type === "widget-lockout"
      ? normalizeSkipRule(originalTask.skipRule)
      : buildSkipRule(formData, originalTask?.skipRule);
    const categorySnapshot = resolveCategorySnapshot(String(formData.get("category") || ""), originalTask);
    const recurrence = buildRecurrence(formData, originalTask?.recurrence);
    return buildTaskFromValues(buildTaskDraftFromForm(formData, {
      originalTask,
      skipRule,
      categorySnapshot,
      recurrence
    }), originalTask, categorySnapshot);
  }

  function appendDailyInstanceTimeRow(value = "") {
    if (!refs.dailyInstanceTimes) {
      return;
    }
    const row = document.createElement("div");
    row.className = "recurrence-slot-row";
    row.innerHTML = `
      <input type="time" value="${escapeHtml(value)}" data-daily-instance-time />
      <button type="button" class="ghost-button" data-remove-daily-instance-time>Remove</button>
    `;
    refs.dailyInstanceTimes.appendChild(row);
  }

  function renderDailyInstanceTimes(times = []) {
    if (!refs.dailyInstanceTimes) {
      return;
    }
    refs.dailyInstanceTimes.innerHTML = "";
    times.forEach((time) => appendDailyInstanceTimeRow(time));
  }

  function handleDailyInstanceTimesClick(event) {
    const removeButton = event.target.closest("[data-remove-daily-instance-time]");
    if (!removeButton) {
      return;
    }
    removeButton.closest(".recurrence-slot-row")?.remove();
  }

  function collectDailyInstanceTimes(primaryTime) {
    const times = [String(primaryTime || "").trim()]
      .concat(Array.from(refs.dailyInstanceTimes?.querySelectorAll("[data-daily-instance-time]") || []).map((input) => String(input.value || "").trim()))
      .filter(Boolean);
    return [...new Set(times)].sort();
  }

  function getWeeklyDaySelection(defaultWeekday = 0) {
    const selected = Array.from(refs.weeklyDayPicker?.querySelectorAll('input[name="weeklyDays"]:checked') || [])
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value))
      .sort((left, right) => left - right);
    if (selected.length > 0) {
      return selected;
    }
    return [Number.isInteger(defaultWeekday) ? defaultWeekday : 0];
  }

  function syncWeeklyWeekdayHiddenValue() {
    const selected = getWeeklyDaySelection(Number(refs.weeklyWeekdayInput?.value || 0));
    if (refs.weeklyWeekdayInput) {
      refs.weeklyWeekdayInput.value = String(selected[0] ?? 0);
    }
  }

  function setWeeklyDaySelection(days) {
    const selected = new Set((Array.isArray(days) ? days : []).map((value) => Number(value)));
    Array.from(refs.weeklyDayPicker?.querySelectorAll('input[name="weeklyDays"]') || []).forEach((input) => {
      input.checked = selected.has(Number(input.value));
    });
    syncWeeklyWeekdayHiddenValue();
  }

  function buildLinkedSeriesSlotConfig(formData, draft, recurrence) {
    if (recurrence.type === "daily") {
      const times = collectDailyInstanceTimes(draft.timeOfDay || "23:59");
      if (times.length > 1) {
        return {
          kind: linkedSeriesKindDaily,
          slots: times.map((time) => ({ timeOfDay: time }))
        };
      }
      return null;
    }

    if (recurrence.type === "weekly") {
      const weekdays = getWeeklyDaySelection(Number(formData.get("weeklyWeekday") || recurrence.weekday || 0));
      if (weekdays.length > 1) {
        return {
          kind: linkedSeriesKindWeekly,
          slots: weekdays.map((weekday) => ({ weekday }))
        };
      }
    }

    return null;
  }

  function matchLinkedSeriesTemplates(existingTemplates, slotConfig) {
    const assignments = new Map();
    const unusedTemplates = [...existingTemplates];

    slotConfig.slots.forEach((slot, slotIndex) => {
      const matchIndex = unusedTemplates.findIndex((template) => {
        if (slotConfig.kind === linkedSeriesKindDaily) {
          return template.timeOfDay === slot.timeOfDay;
        }
        return Number(template.recurrence?.weekday) === Number(slot.weekday);
      });
      if (matchIndex !== -1) {
        assignments.set(slotIndex, unusedTemplates.splice(matchIndex, 1)[0]);
      }
    });

    slotConfig.slots.forEach((_, slotIndex) => {
      if (assignments.has(slotIndex)) {
        return;
      }
      if (unusedTemplates.length > 0) {
        assignments.set(slotIndex, unusedTemplates.shift());
      }
    });

    return assignments;
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

  function buildLinkedSeriesTemplatesFromDraft({
    draft,
    recurrence,
    categorySnapshot,
    slotConfig,
    existingTemplates = []
  }) {
    if (!slotConfig || !Array.isArray(slotConfig.slots) || slotConfig.slots.length <= 1) {
      return [];
    }

    const groupId = existingTemplates[0]?.linkedSeries?.groupId || createId();
    const assignments = matchLinkedSeriesTemplates(existingTemplates, slotConfig);

    return slotConfig.slots.map((slot, slotIndex) => {
      const existingTask = assignments.get(slotIndex) || null;
      const slotRecurrence = slotConfig.kind === linkedSeriesKindWeekly
        ? { ...recurrence, weekday: slot.weekday }
        : { ...recurrence };

      const baseStartDate = draft.startDate || draft.dueDate || todayString();
      const baseDueDate = draft.dueDate || draft.startDate || todayString();
      const slotStartDate = slotConfig.kind === linkedSeriesKindWeekly
        ? alignDateToWeekdayOnOrAfter(baseStartDate, slot.weekday)
        : (draft.startDate || "");
      const slotDueDate = slotConfig.kind === linkedSeriesKindWeekly
        ? alignDateToWeekdayOnOrAfter(baseDueDate, slot.weekday)
        : draft.dueDate;

      return buildTaskFromValues({
        ...draft,
        startDate: slotStartDate,
        dueDate: slotDueDate,
        timeOfDay: slot.timeOfDay || draft.timeOfDay,
        recurrence: slotRecurrence,
        linkedSeries: {
          groupId,
          kind: slotConfig.kind,
          slotIndex,
          slotCount: slotConfig.slots.length
        },
        sequenceDependencyId: ""
      }, existingTask, categorySnapshot);
    });
  }

  function applySkipRuleToForm(skipRule) {
    if (refs.skipRuleTypeInput) {
      refs.skipRuleTypeInput.value = skipRule?.type === "widget-lockout" ? "none" : (skipRule?.type || "none");
    }
    if (refs.skipGraceMinutesInput) {
      refs.skipGraceMinutesInput.value = skipRule?.graceMinutes ?? 15;
    }
  }

  function applyRecurrenceToForm(recurrence) {
    if (refs.recurrenceTypeInput) {
      refs.recurrenceTypeInput.value = recurrence?.type || "none";
    }
    if (refs.weeklyIntervalInput) {
      refs.weeklyIntervalInput.value = recurrence?.interval || 1;
    }
    if (refs.weeklyWeekdayInput) {
      refs.weeklyWeekdayInput.value = String(recurrence?.weekday ?? 0);
    }
    setWeeklyDaySelection([recurrence?.weekday ?? 0]);
    if (refs.monthlyDayInput) {
      refs.monthlyDayInput.value = recurrence?.day || 1;
    }
    if (refs.monthlyIntervalInput) {
      refs.monthlyIntervalInput.value = recurrence?.interval || 1;
    }
    if (refs.monthlyOrdinalInput) {
      refs.monthlyOrdinalInput.value = recurrence?.ordinal || "first";
    }
    if (refs.monthlyWeekdayInput) {
      refs.monthlyWeekdayInput.value = String(recurrence?.weekday ?? 0);
    }
    if (refs.recurrenceEndDateInput) {
      refs.recurrenceEndDateInput.value = recurrence?.endDate || "";
    }
    if (refs.recurrenceCountInput) {
      refs.recurrenceCountInput.value = recurrence?.count || "";
    }
    if (refs.recurrenceForeverInput) {
      refs.recurrenceForeverInput.checked = Boolean(recurrence?.forever);
    }
    renderDailyInstanceTimes([]);
    if (composerPanelState && refs.recurrenceTypeInput) {
      composerPanelState.recurrenceOpen = refs.recurrenceTypeInput.value !== "none";
    }
  }

  function syncTaskReminderInputs() {
    const remindersEnabled = refs.taskRemindersEnabledInput?.checked;
    if (refs.taskReminderDueSoonMinutesInput) {
      refs.taskReminderDueSoonMinutesInput.disabled = !remindersEnabled;
      refs.taskReminderDueSoonMinutesInput.placeholder = String(defaultTaskDueSoonReminderMinutes);
    }
    if (refs.taskReminderOverdueMinutesInput) {
      refs.taskReminderOverdueMinutesInput.disabled = !remindersEnabled;
      refs.taskReminderOverdueMinutesInput.placeholder = String(parsePositiveOrZeroNumber(refs.lateGraceMinutesInput?.value) ?? defaultLateGraceMinutes);
    }
    if (refs.taskReminderDefaultsCopy && refs.taskReminderOverdueMinutesInput) {
      const overduePlaceholder = refs.taskReminderOverdueMinutesInput.placeholder;
      refs.taskReminderDefaultsCopy.textContent = `Leave either field blank to use the default: ${defaultTaskDueSoonReminderMinutes} minutes before due, and ${overduePlaceholder} minute${overduePlaceholder === "1" ? "" : "s"} after due.`;
    }
  }

  function setTaskReminderFormValues(reminders, { importance = defaultImportance, lateGraceMinutes = defaultLateGraceMinutes, treatAsUserTouched = false } = {}) {
    const normalized = normalizeTaskReminders(reminders, { importance, lateGraceMinutes });
    if (refs.taskRemindersEnabledInput) {
      refs.taskRemindersEnabledInput.checked = normalized.enabled;
    }
    if (refs.taskReminderDueSoonMinutesInput) {
      refs.taskReminderDueSoonMinutesInput.value = normalized.dueSoonMinutes == null ? "" : String(normalized.dueSoonMinutes);
    }
    if (refs.taskReminderOverdueMinutesInput) {
      refs.taskReminderOverdueMinutesInput.value = normalized.overdueMinutes == null ? "" : String(normalized.overdueMinutes);
    }
    if (composerReminderState) {
      composerReminderState.userTouched = treatAsUserTouched;
    }
  }

  return {
    alignDateToWeekdayOnOrAfter,
    appendDailyInstanceTimeRow,
    applyRecurrenceToForm,
    applySkipRuleToForm,
    buildLinkedSeriesSlotConfig,
    buildLinkedSeriesTemplatesFromDraft,
    buildRecurrence,
    buildSkipRule,
    buildTaskDraftFromForm,
    buildTaskFromForm,
    buildTaskFromValues,
    buildTaskReminderDraftFromForm,
    collectDailyInstanceTimes,
    getWeeklyDaySelection,
    handleDailyInstanceTimesClick,
    matchLinkedSeriesTemplates,
    normalizeRecurrence,
    normalizeSkipRule,
    normalizeTaskReminders,
    normalizeWidgetReminderDefaults,
    parsePositiveNumber,
    parsePositiveOrZeroNumber,
    renderDailyInstanceTimes,
    setTaskReminderFormValues,
    setWeeklyDaySelection,
    syncTaskReminderInputs,
    syncWeeklyWeekdayHiddenValue
  };
}
