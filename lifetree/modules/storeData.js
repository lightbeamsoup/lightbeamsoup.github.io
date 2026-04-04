export function createStoreDataBindings(config = {}) {
  const {
    baseCategories = [],
    defaultCategoryKey = "productivity",
    defaultCategoryColor = "#7dbf74",
    defaultImportance = "medium",
    defaultLateGraceMinutes = 15,
    lengthOrder = {},
    maxTasks = 3000,
    maxWidgets = 5,
    maxDeletionMarkers = 300,
    deletionMarkerRetentionMs = 1000 * 60 * 60 * 24 * 14,
    linkedSeriesKindDaily = "daily-window",
    linkedSeriesKindWeekly = "weekly-window",
    treePointExchangeRatio = 2,
    createId,
    defaultPointsForLength,
    normalizeTaskPoints,
    compactTaskHistory,
    buildLogicalWidgetTaskKey,
    compareTaskResolutionPreference,
    normalizeWidgets,
    listWidgetCategories,
    mergeWidgetLists,
    mergeRetiredWidgets,
    normalizeProfile,
    choosePreferredProfile,
    normalizeNotifications,
    choosePreferredNotifications,
    normalizeDevSettings,
    normalizeTreeState,
    choosePreferredTreeState,
    normalizePointLedgerBase,
    normalizePointHistoryBase,
    mergePointLedger,
    mergePointHistory,
    normalizeImportance: normalizeImportanceFromApp = null,
    normalizeCategoryColor: normalizeCategoryColorFromApp = null,
    normalizeTaskReminders,
    normalizeWidgetTaskMeta,
    normalizeWidgetCompletion,
    normalizeSkipRule,
    normalizeRecurrence,
    deriveTaskNotBeforeAt,
    parsePositiveOrZeroNumber,
    getWidgetUpdatedAt,
    compareWidgetFingerprints
  } = config;

  function normalizeCategoryColor(value) {
    if (typeof normalizeCategoryColorFromApp === "function") {
      return normalizeCategoryColorFromApp(value);
    }
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : defaultCategoryColor;
  }

  function slugifyCategoryKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function normalizeImportance(value) {
    if (typeof normalizeImportanceFromApp === "function") {
      return normalizeImportanceFromApp(value);
    }
    return value === "low" || value === "high" ? value : defaultImportance;
  }

  function normalizeStatus(task) {
    if (task.status === "done" || task.completed === true) {
      return "done";
    }
    if (task.status === "skipped" || task.skipped === true) {
      return "skipped";
    }
    return "open";
  }

  function normalizeLinkedSeries(linkedSeries) {
    if (!linkedSeries || typeof linkedSeries !== "object") {
      return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
    }
    const groupId = typeof linkedSeries.groupId === "string" ? linkedSeries.groupId : "";
    const kind = linkedSeries.kind === linkedSeriesKindDaily || linkedSeries.kind === linkedSeriesKindWeekly
      ? linkedSeries.kind
      : "";
    const slotIndex = Number.isInteger(linkedSeries.slotIndex) ? linkedSeries.slotIndex : 0;
    const slotCount = Number.isInteger(linkedSeries.slotCount) ? linkedSeries.slotCount : 1;
    if (!groupId || !kind || slotCount <= 1 || slotIndex < 0 || slotIndex >= slotCount) {
      return { groupId: "", kind: "", slotIndex: 0, slotCount: 1 };
    }
    return {
      groupId,
      kind,
      slotIndex,
      slotCount
    };
  }

  function hasLinkedSeriesGroup(task) {
    return Boolean(task?.linkedSeries?.groupId && task.linkedSeries.slotCount > 1);
  }

  function createCategoryDefinition(category) {
    const key = slugifyCategoryKey(category?.key || category?.label || "");
    if (!key) {
      return null;
    }

    const baseCategory = baseCategories.find((item) => item.key === key);
    return {
      key,
      label: typeof category?.label === "string" && category.label.trim() ? category.label.trim() : (baseCategory?.label || "Category"),
      color: normalizeCategoryColor(category?.color || baseCategory?.color || defaultCategoryColor),
      builtin: category?.builtin === true || Boolean(baseCategory?.builtin),
      active: category?.active !== false,
      updatedAt: typeof category?.updatedAt === "number" ? category.updatedAt : 0
    };
  }

  function normalizeCategoryDefinitions(value) {
    const mergedByKey = new Map(baseCategories.map((category) => [category.key, createCategoryDefinition(category)]));

    if (Array.isArray(value)) {
      for (const category of value) {
        const normalized = createCategoryDefinition(category);
        if (!normalized) {
          continue;
        }
        const existing = mergedByKey.get(normalized.key);
        if (!existing) {
          mergedByKey.set(normalized.key, normalized);
          continue;
        }
        mergedByKey.set(normalized.key, choosePreferredCategoryDefinition(normalized, existing));
      }
    }

    return Array.from(mergedByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
  }

  function choosePreferredCategoryDefinition(localCategory, remoteCategory) {
    return (localCategory.updatedAt || 0) >= (remoteCategory.updatedAt || 0) ? localCategory : remoteCategory;
  }

  function mergeCategoryDefinitions(localCategories = [], remoteCategories = []) {
    const mergedByKey = new Map();

    for (const category of normalizeCategoryDefinitions(remoteCategories)) {
      mergedByKey.set(category.key, category);
    }
    for (const category of normalizeCategoryDefinitions(localCategories)) {
      const existing = mergedByKey.get(category.key);
      if (!existing) {
        mergedByKey.set(category.key, category);
        continue;
      }
      mergedByKey.set(category.key, choosePreferredCategoryDefinition(category, existing));
    }

    return Array.from(mergedByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
  }

  function createCategorySnapshotResolver(categories = [], widgets = []) {
    const mergedByKey = new Map();

    for (const category of normalizeCategoryDefinitions(categories)) {
      mergedByKey.set(category.key, category);
    }
    for (const category of listWidgetCategories(widgets)) {
      const normalized = createCategoryDefinition(category);
      if (normalized && !mergedByKey.has(normalized.key)) {
        mergedByKey.set(normalized.key, normalized);
      }
    }

    return (categoryKey, originalTask = null) => {
      const selectedKey = slugifyCategoryKey(categoryKey || originalTask?.categoryKey || defaultCategoryKey);
      const currentCategory = mergedByKey.get(selectedKey);
      if (currentCategory) {
        return {
          key: currentCategory.key,
          label: currentCategory.label,
          color: currentCategory.color
        };
      }

      if (originalTask?.categoryKey) {
        return {
          key: originalTask.categoryKey,
          label: originalTask.categoryLabel || "Category",
          color: normalizeCategoryColor(originalTask.categoryColor)
        };
      }

      const fallback = baseCategories.find((category) => category.key === defaultCategoryKey) || baseCategories[0];
      return {
        key: fallback.key,
        label: fallback.label,
        color: fallback.color
      };
    };
  }

  function normalizeTask(task) {
    const fallbackCategory = baseCategories.find((category) => category.key === (typeof task.categoryKey === "string" ? task.categoryKey : defaultCategoryKey))
      || baseCategories.find((category) => category.key === defaultCategoryKey)
      || baseCategories[0];
    const normalizedImportance = normalizeImportance(task.importance);
    const normalizedWidgetTaskMeta = normalizeWidgetTaskMeta(task.widgetTaskMeta);
    const normalizedLateGraceMinutes = parsePositiveOrZeroNumber(task.lateGraceMinutes) ?? defaultLateGraceMinutes;
    return {
      id: typeof task.id === "string" ? task.id : createId(),
      templateId: typeof task.templateId === "string" ? task.templateId : "",
      occurrenceIndex: typeof task.occurrenceIndex === "number" ? task.occurrenceIndex : 0,
      name: typeof task.name === "string" ? task.name : "Untitled task",
      details: typeof task.details === "string" ? task.details : "",
      startDate: typeof task.startDate === "string" ? task.startDate : "",
      dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
      timeOfDay: typeof task.timeOfDay === "string" ? task.timeOfDay : "",
      lateGraceMinutes: normalizedLateGraceMinutes,
      notBeforeAt: typeof task.notBeforeAt === "number"
        ? task.notBeforeAt
        : deriveTaskNotBeforeAt({
          recurrence: normalizeRecurrence(task.recurrence),
          startDate: typeof task.startDate === "string" ? task.startDate : "",
          dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
          originalTask: task
        }),
      length: lengthOrder[task.length] ? task.length : "medium",
      pointsValue: normalizeTaskPoints(task.pointsValue, defaultPointsForLength(task.length)),
      pointsEntryId: typeof task.pointsEntryId === "string" ? task.pointsEntryId : "",
      categoryKey: typeof task.categoryKey === "string" ? task.categoryKey : defaultCategoryKey,
      categoryLabel: typeof task.categoryLabel === "string" ? task.categoryLabel : fallbackCategory.label,
      categoryColor: normalizeCategoryColor(task.categoryColor || fallbackCategory.color),
      importance: normalizedImportance,
      status: normalizeStatus(task),
      createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
      updatedAt: typeof task.updatedAt === "number"
        ? task.updatedAt
        : Math.max(
          typeof task.createdAt === "number" ? task.createdAt : 0,
          Array.isArray(task.history)
            ? task.history.reduce((latest, item) => Math.max(latest, item?.at || 0), 0)
            : 0
        ),
      ownerWidgetId: typeof task.ownerWidgetId === "string" ? task.ownerWidgetId : "",
      ownerWidgetType: typeof task.ownerWidgetType === "string" ? task.ownerWidgetType : "",
      ownerTaskKey: typeof task.ownerTaskKey === "string" ? task.ownerTaskKey : "",
      widgetTaskKind: typeof task.widgetTaskKind === "string" ? task.widgetTaskKind : "",
      widgetTaskMeta: normalizedWidgetTaskMeta,
      reminders: normalizeTaskReminders(task.reminders, {
        importance: normalizedImportance,
        lateGraceMinutes: normalizedLateGraceMinutes,
        widgetTaskMeta: normalizedWidgetTaskMeta
      }),
      linkedSeries: normalizeLinkedSeries(task.linkedSeries),
      sequenceDependencyId: typeof task.sequenceDependencyId === "string" ? task.sequenceDependencyId : "",
      widgetCompletion: normalizeWidgetCompletion(task.widgetCompletion),
      skipRule: normalizeSkipRule(task.skipRule),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies.filter((id) => typeof id === "string") : [],
      recurrence: normalizeRecurrence(task.recurrence),
      archived: task.archived === true,
      historyOnly: task.historyOnly === true,
      hideAfterAt: typeof task.hideAfterAt === "number" ? task.hideAfterAt : 0,
      seriesOriginId: typeof task.seriesOriginId === "string" ? task.seriesOriginId : "",
      history: Array.isArray(task.history)
        ? compactTaskHistory(task.history
          .filter((item) => typeof item?.type === "string" && typeof item?.at === "number")
          .map((item, index) => ({
            id: typeof item.id === "string" && item.id ? item.id : `${typeof task.id === "string" ? task.id : "task"}-history-${index}-${item.at}`,
            type: item.type,
            at: item.at,
            reason: typeof item.reason === "string" ? item.reason : ""
          })))
        : []
    };
  }

  function normalizeDeletionMarkers(value, now = Date.now()) {
    if (!Array.isArray(value)) {
      return [];
    }

    const cutoff = now - deletionMarkerRetentionMs;
    const mergedByKey = new Map();
    for (const entry of value) {
      const type = entry?.type === "task-id" || entry?.type === "task-key" || entry?.type === "series-id"
        ? entry.type
        : "";
      const markerValue = typeof entry?.value === "string" ? entry.value.slice(0, 240) : "";
      const deletedAt = typeof entry?.deletedAt === "number" ? entry.deletedAt : 0;
      if (!type || !markerValue || deletedAt <= 0 || deletedAt < cutoff) {
        continue;
      }
      const key = `${type}:${markerValue}`;
      const existing = mergedByKey.get(key);
      if (!existing || deletedAt >= existing.deletedAt) {
        mergedByKey.set(key, {
          type,
          value: markerValue,
          deletedAt
        });
      }
    }

    return Array.from(mergedByKey.values())
      .sort((left, right) => right.deletedAt - left.deletedAt || left.type.localeCompare(right.type) || left.value.localeCompare(right.value))
      .slice(0, maxDeletionMarkers);
  }

  function mergeDeletionMarkers(localMarkers = [], remoteMarkers = [], now = Date.now()) {
    return normalizeDeletionMarkers([
      ...normalizeDeletionMarkers(localMarkers, now),
      ...normalizeDeletionMarkers(remoteMarkers, now)
    ], now);
  }

  function buildDeletionMarkerMaps(markers = []) {
    const taskIds = new Map();
    const taskKeys = new Map();
    const seriesIds = new Map();
    for (const marker of normalizeDeletionMarkers(markers)) {
      const target = marker.type === "task-id"
        ? taskIds
        : marker.type === "task-key"
          ? taskKeys
          : seriesIds;
      const existing = target.get(marker.value) || 0;
      if (marker.deletedAt >= existing) {
        target.set(marker.value, marker.deletedAt);
      }
    }
    return { taskIds, taskKeys, seriesIds };
  }

  function latestTaskTimestampForMerge(task) {
    let latest = Math.max(0, task?.createdAt || 0, task?.updatedAt || 0, task?.hideAfterAt || 0);
    if (Array.isArray(task?.history)) {
      for (const item of task.history) {
        latest = Math.max(latest, item?.at || 0);
      }
    }
    return latest;
  }

  function deletionMarkerSuppressesTask(task, deletionMarkerMaps) {
    if (!task || !deletionMarkerMaps) {
      return false;
    }

    const latestTaskAt = latestTaskTimestampForMerge(task);
    const taskIdDeletedAt = deletionMarkerMaps.taskIds.get(task.id) || 0;
    if (taskIdDeletedAt >= latestTaskAt) {
      return true;
    }

    const logicalKey = buildLogicalWidgetTaskKey(task);
    const taskKeyDeletedAt = logicalKey ? (deletionMarkerMaps.taskKeys.get(logicalKey) || 0) : 0;
    if (taskKeyDeletedAt >= latestTaskAt) {
      return true;
    }

    const seriesDeletedAt = Math.max(
      deletionMarkerMaps.seriesIds.get(task.id) || 0,
      task.templateId ? (deletionMarkerMaps.seriesIds.get(task.templateId) || 0) : 0
    );
    return seriesDeletedAt >= latestTaskAt;
  }

  function normalizeRecurringBonusSelections(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry) => typeof entry?.key === "string" && entry.key)
      .map((entry) => ({
        key: entry.key,
        selectedCategoryKey: slugifyCategoryKey(entry.selectedCategoryKey || ""),
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0
      }))
      .filter((entry) => entry.selectedCategoryKey)
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  function mergeRecurringBonusSelections(localSelections = [], remoteSelections = []) {
    const mergedByKey = new Map();

    for (const entry of normalizeRecurringBonusSelections(remoteSelections)) {
      mergedByKey.set(entry.key, entry);
    }
    for (const entry of normalizeRecurringBonusSelections(localSelections)) {
      const existing = mergedByKey.get(entry.key);
      if (!existing || (entry.updatedAt || 0) >= (existing.updatedAt || 0)) {
        mergedByKey.set(entry.key, entry);
      }
    }

    return Array.from(mergedByKey.values()).sort((left, right) => left.key.localeCompare(right.key));
  }

  function buildComparableValueSignature(value) {
    return JSON.stringify(sortObjectKeys(value));
  }

  function buildCategoryMergeSignature(category) {
    return buildComparableValueSignature({
      key: category.key,
      label: category.label,
      color: category.color,
      builtin: category.builtin === true,
      active: category.active !== false
    });
  }

  function buildWidgetMergeSignature(widget) {
    return buildComparableValueSignature(sortObjectKeys(widget));
  }

  function createEmptyStore() {
    const now = Date.now();
    const emptyStore = {
      version: 18,
      updatedAt: now,
      userUpdatedAt: now,
      driveFileId: "",
      profile: normalizeProfile({}),
      notifications: normalizeNotifications({}),
      tasks: [],
      pointLedger: [],
      pointHistory: [],
      treeState: normalizeTreeState({}),
      devSettings: normalizeDevSettings({}),
      categories: normalizeCategoryDefinitions([]),
      widgets: [],
      retiredWidgets: [],
      recurringBonusSelections: [],
      deletionMarkers: []
    };
    emptyStore.userFingerprint = computeUserContentFingerprintFromNormalized(emptyStore);
    return emptyStore;
  }

  function normalizeStore(input) {
    const source = input && typeof input === "object" ? input : {};
    const tasks = Array.isArray(source.tasks)
      ? source.tasks
          .filter((task) => task && typeof task === "object")
          .map(normalizeTask)
          .slice(0, maxTasks)
      : [];
    const categories = normalizeCategoryDefinitions(source.categories);
    const widgets = normalizeWidgets(source.widgets);
    const retiredWidgets = normalizeWidgets(source.retiredWidgets);
    const resolveStoredCategorySnapshot = createCategorySnapshotResolver(categories, widgets);
    const devSettings = normalizeDevSettings(source.devSettings);
    const normalizedPointLedger = normalizePointLedgerBase(source.pointLedger, {
      defaultCategoryKey,
      normalizeCategoryColor,
      resolveCategorySnapshot: resolveStoredCategorySnapshot
    });
    const pointHistorySource = Array.isArray(source.pointHistory) ? source.pointHistory : normalizedPointLedger;
    const normalized = {
      version: 18,
      updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : Date.now(),
      driveFileId: typeof source.driveFileId === "string" ? source.driveFileId : "",
      profile: normalizeProfile(source.profile),
      notifications: normalizeNotifications(source.notifications),
      tasks,
      pointLedger: normalizedPointLedger,
      pointHistory: normalizePointHistoryBase(pointHistorySource, {
        defaultCategoryKey,
        normalizeCategoryColor,
        resolveCategorySnapshot: resolveStoredCategorySnapshot,
        maxEntries: devSettings.maxPointHistoryEntries
      }),
      treeState: normalizeTreeState(source.treeState),
      devSettings,
      categories,
      widgets,
      retiredWidgets,
      recurringBonusSelections: normalizeRecurringBonusSelections(source.recurringBonusSelections),
      deletionMarkers: normalizeDeletionMarkers(source.deletionMarkers)
    };
    normalized.userUpdatedAt = typeof source.userUpdatedAt === "number"
      ? source.userUpdatedAt
      : normalized.updatedAt;
    normalized.userFingerprint = computeUserContentFingerprintFromNormalized(normalized);
    return normalized;
  }

  function choosePreferredUserSyncState(localStore, remoteStore) {
    const localUserUpdatedAt = localStore.userUpdatedAt || localStore.updatedAt || 0;
    const remoteUserUpdatedAt = remoteStore.userUpdatedAt || remoteStore.updatedAt || 0;
    const localUserFingerprint = localStore.userFingerprint || computeUserContentFingerprint(localStore);
    const remoteUserFingerprint = remoteStore.userFingerprint || computeUserContentFingerprint(remoteStore);

    if (localUserUpdatedAt > remoteUserUpdatedAt) {
      return {
        userUpdatedAt: localUserUpdatedAt,
        userFingerprint: localUserFingerprint
      };
    }
    if (remoteUserUpdatedAt > localUserUpdatedAt) {
      return {
        userUpdatedAt: remoteUserUpdatedAt,
        userFingerprint: remoteUserFingerprint
      };
    }
    return (localStore.updatedAt || 0) >= (remoteStore.updatedAt || 0)
      ? {
          userUpdatedAt: localUserUpdatedAt,
          userFingerprint: localUserFingerprint
        }
      : {
          userUpdatedAt: remoteUserUpdatedAt,
          userFingerprint: remoteUserFingerprint
        };
  }

  function shouldAlwaysKeepUnpairedTask(task) {
    return !task.ownerWidgetType
      || task.status !== "open"
      || Boolean(task.pointsEntryId)
      || task.archived === true
      || task.historyOnly === true
      || (Array.isArray(task.history) && task.history.length > 0);
  }

  function shouldKeepUnpairedTask(task, otherStoreUpdatedAt = 0) {
    if (!task) {
      return false;
    }
    if (shouldAlwaysKeepUnpairedTask(task)) {
      return true;
    }
    if (!otherStoreUpdatedAt) {
      return true;
    }
    return latestTaskTimestampForMerge(task) >= otherStoreUpdatedAt;
  }

  function getTaskMergeUpdatedAt(task) {
    return latestTaskTimestampForMerge(task);
  }

  function buildTaskMergeSignature(task) {
    return JSON.stringify({
      templateId: task.templateId || "",
      occurrenceIndex: task.occurrenceIndex || 0,
      name: task.name,
      details: task.details,
      startDate: task.startDate || "",
      dueDate: task.dueDate || "",
      timeOfDay: task.timeOfDay || "",
      lateGraceMinutes: task.lateGraceMinutes || 0,
      notBeforeAt: task.notBeforeAt || 0,
      pointsValue: task.pointsValue,
      pointsEntryId: task.pointsEntryId || "",
      length: task.length,
      categoryKey: task.categoryKey,
      categoryLabel: task.categoryLabel,
      categoryColor: task.categoryColor,
      importance: task.importance,
      status: task.status,
      ownerWidgetId: task.ownerWidgetId || "",
      ownerWidgetType: task.ownerWidgetType || "",
      ownerTaskKey: task.ownerTaskKey || "",
      widgetTaskKind: task.widgetTaskKind || "",
      widgetTaskMeta: normalizeWidgetTaskMeta(task.widgetTaskMeta),
      reminders: normalizeTaskReminders(task.reminders, {
        importance: task.importance,
        lateGraceMinutes: task.lateGraceMinutes,
        widgetTaskMeta: task.widgetTaskMeta
      }),
      linkedSeries: normalizeLinkedSeries(task.linkedSeries),
      sequenceDependencyId: task.sequenceDependencyId || "",
      widgetCompletion: normalizeWidgetCompletion(task.widgetCompletion),
      skipRule: normalizeSkipRule(task.skipRule),
      dependencies: [...(task.dependencies || [])].sort(),
      recurrence: normalizeRecurrence(task.recurrence),
      archived: task.archived === true,
      historyOnly: task.historyOnly === true,
      hideAfterAt: task.hideAfterAt || 0,
      seriesOriginId: task.seriesOriginId || "",
      history: compactTaskHistory(task.history || []).map((item) => ({
        id: item.id,
        type: item.type,
        at: item.at,
        reason: typeof item.reason === "string" ? item.reason : ""
      }))
    });
  }

  function chooseByTaskUpdatedAt(localTask, remoteTask, localStoreUpdatedAt, remoteStoreUpdatedAt) {
    const localTaskUpdatedAt = getTaskMergeUpdatedAt(localTask);
    const remoteTaskUpdatedAt = getTaskMergeUpdatedAt(remoteTask);
    if (localTaskUpdatedAt !== remoteTaskUpdatedAt) {
      return localTaskUpdatedAt >= remoteTaskUpdatedAt ? localTask : remoteTask;
    }
    return localStoreUpdatedAt >= remoteStoreUpdatedAt ? localTask : remoteTask;
  }

  function choosePreferredTask(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt) {
    if (localTask.status !== remoteTask.status) {
      if (localTask.status === "done" && localTask.pointsEntryId && !remoteTask.pointsEntryId) {
        return localTask;
      }
      if (remoteTask.status === "done" && remoteTask.pointsEntryId && !localTask.pointsEntryId) {
        return remoteTask;
      }
      const resolutionComparison = compareTaskResolutionPreference(localTask, remoteTask);
      if (resolutionComparison !== 0) {
        return resolutionComparison >= 0 ? localTask : remoteTask;
      }
      return chooseByTaskUpdatedAt(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt);
    }
    if (buildTaskMergeSignature(localTask) !== buildTaskMergeSignature(remoteTask)) {
      return chooseByTaskUpdatedAt(localTask, remoteTask, localUpdatedAt, remoteUpdatedAt);
    }
    return localTask.createdAt >= remoteTask.createdAt ? localTask : remoteTask;
  }

  function mergeStores(localStore, remoteStore) {
    const mergedCategories = mergeCategoryDefinitions(localStore.categories, remoteStore.categories);
    const mergedWidgets = mergeWidgetLists(localStore.widgets, remoteStore.widgets);
    const resolveMergedCategorySnapshot = createCategorySnapshotResolver(mergedCategories, mergedWidgets);
    const mergedPointOptions = {
      defaultCategoryKey,
      normalizeCategoryColor,
      resolveCategorySnapshot: resolveMergedCategorySnapshot
    };
    const preferredUserState = choosePreferredUserSyncState(localStore, remoteStore);
    const mergedDeletionMarkers = mergeDeletionMarkers(localStore.deletionMarkers, remoteStore.deletionMarkers);
    const deletionMarkerMaps = buildDeletionMarkerMaps(mergedDeletionMarkers);
    const mergedDevSettings = (localStore.updatedAt || 0) >= (remoteStore.updatedAt || 0)
      ? normalizeDevSettings(localStore.devSettings)
      : normalizeDevSettings(remoteStore.devSettings);
    const mergedById = new Map();
    const localById = new Map(localStore.tasks.map((task) => [task.id, task]));
    const remoteById = new Map(remoteStore.tasks.map((task) => [task.id, task]));
    const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

    for (const taskId of allIds) {
      const localTask = localById.get(taskId) || null;
      const remoteTask = remoteById.get(taskId) || null;
      if (localTask && remoteTask) {
        mergedById.set(taskId, choosePreferredTask(localTask, remoteTask, localStore.updatedAt, remoteStore.updatedAt));
        continue;
      }
      if (localTask && !deletionMarkerSuppressesTask(localTask, deletionMarkerMaps) && shouldKeepUnpairedTask(localTask, remoteStore.updatedAt || 0)) {
        mergedById.set(taskId, localTask);
        continue;
      }
      if (remoteTask && !deletionMarkerSuppressesTask(remoteTask, deletionMarkerMaps) && shouldKeepUnpairedTask(remoteTask, localStore.updatedAt || 0)) {
        mergedById.set(taskId, remoteTask);
      }
    }

    return {
      version: 18,
      updatedAt: Math.max(localStore.updatedAt || 0, remoteStore.updatedAt || 0),
      userUpdatedAt: preferredUserState.userUpdatedAt,
      userFingerprint: preferredUserState.userFingerprint,
      driveFileId: remoteStore.driveFileId || localStore.driveFileId || "",
      profile: choosePreferredProfile(localStore.profile, remoteStore.profile),
      notifications: choosePreferredNotifications(localStore.notifications, remoteStore.notifications),
      tasks: Array.from(mergedById.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, maxTasks),
      pointLedger: mergePointLedger(localStore.pointLedger, remoteStore.pointLedger, mergedPointOptions),
      pointHistory: mergePointHistory(
        Array.isArray(localStore.pointHistory) ? localStore.pointHistory : localStore.pointLedger,
        Array.isArray(remoteStore.pointHistory) ? remoteStore.pointHistory : remoteStore.pointLedger,
        {
          ...mergedPointOptions,
          maxEntries: mergedDevSettings.maxPointHistoryEntries
        }
      ),
      treeState: choosePreferredTreeState(localStore.treeState, remoteStore.treeState),
      devSettings: mergedDevSettings,
      categories: mergedCategories,
      widgets: mergedWidgets,
      retiredWidgets: mergeRetiredWidgets(localStore.retiredWidgets, remoteStore.retiredWidgets, mergedWidgets),
      recurringBonusSelections: mergeRecurringBonusSelections(localStore.recurringBonusSelections, remoteStore.recurringBonusSelections),
      deletionMarkers: mergedDeletionMarkers
    };
  }

  function hasAmbiguousProfileMerge(localProfile, remoteProfile) {
    const local = normalizeProfile(localProfile);
    const remote = normalizeProfile(remoteProfile);
    return (local.updatedAt || 0) === (remote.updatedAt || 0)
      && buildComparableValueSignature(local) !== buildComparableValueSignature(remote);
  }

  function hasAmbiguousNotificationsMerge(localNotifications, remoteNotifications) {
    const local = normalizeNotifications(localNotifications).email;
    const remote = normalizeNotifications(remoteNotifications).email;
    return (local.updatedAt || 0) === (remote.updatedAt || 0)
      && buildComparableValueSignature({
        recipientEmail: local.recipientEmail,
        summaries: local.summaries,
        reminders: local.reminders
      }) !== buildComparableValueSignature({
        recipientEmail: remote.recipientEmail,
        summaries: remote.summaries,
        reminders: remote.reminders
      });
  }

  function hasAmbiguousTreeStateMerge(localTreeState, remoteTreeState) {
    const local = normalizeTreeState(localTreeState);
    const remote = normalizeTreeState(remoteTreeState);
    return (local.updatedAt || 0) === (remote.updatedAt || 0)
      && buildComparableValueSignature(local) !== buildComparableValueSignature(remote);
  }

  function hasAmbiguousDevSettingsMerge(localDevSettings, remoteDevSettings, localStoreUpdatedAt = 0, remoteStoreUpdatedAt = 0) {
    return (localStoreUpdatedAt || 0) === (remoteStoreUpdatedAt || 0)
      && buildComparableValueSignature(normalizeDevSettings(localDevSettings)) !== buildComparableValueSignature(normalizeDevSettings(remoteDevSettings));
  }

  function hasAmbiguousCategoryMerge(localCategories = [], remoteCategories = []) {
    const localByKey = new Map(normalizeCategoryDefinitions(localCategories).map((category) => [category.key, category]));
    const remoteByKey = new Map(normalizeCategoryDefinitions(remoteCategories).map((category) => [category.key, category]));
    for (const key of new Set([...localByKey.keys(), ...remoteByKey.keys()])) {
      const local = localByKey.get(key);
      const remote = remoteByKey.get(key);
      if (!local || !remote) {
        continue;
      }
      if ((local.updatedAt || 0) === (remote.updatedAt || 0)
        && buildCategoryMergeSignature(local) !== buildCategoryMergeSignature(remote)) {
        return true;
      }
    }
    return false;
  }

  function hasAmbiguousWidgetMerge(localWidgets = [], remoteWidgets = []) {
    const localByType = new Map(normalizeWidgets(localWidgets).map((widget) => [widget.type, widget]));
    const remoteByType = new Map(normalizeWidgets(remoteWidgets).map((widget) => [widget.type, widget]));
    for (const type of new Set([...localByType.keys(), ...remoteByType.keys()])) {
      const local = localByType.get(type);
      const remote = remoteByType.get(type);
      if (!local || !remote) {
        continue;
      }
      if (getWidgetUpdatedAt(local) === getWidgetUpdatedAt(remote)
        && buildWidgetMergeSignature(local) !== buildWidgetMergeSignature(remote)) {
        return true;
      }
    }
    return false;
  }

  function hasAmbiguousRecurringBonusMerge(localSelections = [], remoteSelections = []) {
    const localByKey = new Map(normalizeRecurringBonusSelections(localSelections).map((entry) => [entry.key, entry]));
    const remoteByKey = new Map(normalizeRecurringBonusSelections(remoteSelections).map((entry) => [entry.key, entry]));
    for (const key of new Set([...localByKey.keys(), ...remoteByKey.keys()])) {
      const local = localByKey.get(key);
      const remote = remoteByKey.get(key);
      if (!local || !remote) {
        continue;
      }
      if ((local.updatedAt || 0) === (remote.updatedAt || 0)
        && buildComparableValueSignature(local) !== buildComparableValueSignature(remote)) {
        return true;
      }
    }
    return false;
  }

  function tasksNeedAmbiguousMergePrompt(localTask, remoteTask, localStoreUpdatedAt = 0, remoteStoreUpdatedAt = 0) {
    if (buildTaskMergeSignature(localTask) === buildTaskMergeSignature(remoteTask)) {
      return false;
    }
    if ((localTask.status === "done" && localTask.pointsEntryId && !remoteTask.pointsEntryId)
      || (remoteTask.status === "done" && remoteTask.pointsEntryId && !localTask.pointsEntryId)) {
      return false;
    }
    if (compareTaskResolutionPreference(localTask, remoteTask) !== 0) {
      return false;
    }
    if (getTaskMergeUpdatedAt(localTask) !== getTaskMergeUpdatedAt(remoteTask)) {
      return false;
    }
    return (localStoreUpdatedAt || 0) === (remoteStoreUpdatedAt || 0);
  }

  function hasAmbiguousTaskMerge(localTasks = [], remoteTasks = [], localStoreUpdatedAt = 0, remoteStoreUpdatedAt = 0) {
    const localById = new Map((Array.isArray(localTasks) ? localTasks : []).map((task) => [task.id, task]));
    const remoteById = new Map((Array.isArray(remoteTasks) ? remoteTasks : []).map((task) => [task.id, task]));
    for (const taskId of new Set([...localById.keys(), ...remoteById.keys()])) {
      const local = localById.get(taskId);
      const remote = remoteById.get(taskId);
      if (!local || !remote) {
        continue;
      }
      if (!tasksNeedAmbiguousMergePrompt(local, remote, localStoreUpdatedAt, remoteStoreUpdatedAt)) {
        continue;
      }
      return true;
    }
    return false;
  }

  function hasAmbiguousDriveMergeConflict(localStore, remoteStore) {
    return hasAmbiguousProfileMerge(localStore.profile, remoteStore.profile)
      || hasAmbiguousNotificationsMerge(localStore.notifications, remoteStore.notifications)
      || hasAmbiguousTreeStateMerge(localStore.treeState, remoteStore.treeState)
      || hasAmbiguousDevSettingsMerge(localStore.devSettings, remoteStore.devSettings, localStore.updatedAt, remoteStore.updatedAt)
      || hasAmbiguousCategoryMerge(localStore.categories, remoteStore.categories)
      || hasAmbiguousWidgetMerge(localStore.widgets, remoteStore.widgets)
      || hasAmbiguousRecurringBonusMerge(localStore.recurringBonusSelections, remoteStore.recurringBonusSelections)
      || hasAmbiguousTaskMerge(localStore.tasks, remoteStore.tasks, localStore.updatedAt, remoteStore.updatedAt);
  }

  function canAutoMergeDriveConflict(localStore, remoteStore) {
    const local = normalizeStore(localStore || createEmptyStore());
    const remote = normalizeStore(remoteStore || createEmptyStore());
    return !hasAmbiguousDriveMergeConflict(local, remote);
  }

  function buildComparableStore(normalized) {
    const normalizedProfile = normalizeProfile(normalized.profile);
    const normalizedNotifications = normalizeNotifications(normalized.notifications);
    return {
      profile: {
        displayName: normalizedProfile.displayName,
        autosaveEnabled: normalizedProfile.autosaveEnabled,
        autosaveIntervalMinutes: normalizedProfile.autosaveIntervalMinutes,
        darkModeEnabled: normalizedProfile.darkModeEnabled,
        autoDarkModeEnabled: normalizedProfile.autoDarkModeEnabled,
        autoDarkModeStart: normalizedProfile.autoDarkModeStart,
        autoDarkModeEnd: normalizedProfile.autoDarkModeEnd,
        helpTextEnabled: normalizedProfile.helpTextEnabled,
        helpTooltipDelayMs: normalizedProfile.helpTooltipDelayMs
      },
      notifications: {
        email: {
          recipientEmail: normalizedNotifications.email.recipientEmail,
          summaries: sortObjectKeys(normalizedNotifications.email.summaries),
          reminders: sortObjectKeys(normalizedNotifications.email.reminders)
        }
      },
      tasks: normalized.tasks
        .map((task) => ({
          id: task.id,
          templateId: task.templateId,
          occurrenceIndex: task.occurrenceIndex,
          name: task.name,
          details: task.details,
          startDate: task.startDate,
          dueDate: task.dueDate,
          timeOfDay: task.timeOfDay,
          lateGraceMinutes: task.lateGraceMinutes,
          notBeforeAt: task.notBeforeAt || 0,
          pointsValue: task.pointsValue,
          pointsEntryId: task.pointsEntryId || "",
          length: task.length,
          categoryKey: task.categoryKey,
          categoryLabel: task.categoryLabel,
          categoryColor: task.categoryColor,
          importance: task.importance,
          reminders: normalizeTaskReminders(task.reminders, {
            importance: task.importance,
            lateGraceMinutes: task.lateGraceMinutes,
            widgetTaskMeta: task.widgetTaskMeta
          }),
          status: task.status,
          createdAt: task.createdAt,
          ownerWidgetId: task.ownerWidgetId,
          ownerWidgetType: task.ownerWidgetType,
          ownerTaskKey: task.ownerTaskKey,
          widgetTaskKind: task.widgetTaskKind || "",
          widgetTaskMeta: normalizeWidgetTaskMeta(task.widgetTaskMeta),
          linkedSeries: normalizeLinkedSeries(task.linkedSeries),
          sequenceDependencyId: task.sequenceDependencyId || "",
          widgetCompletion: {
            mechanism: task.widgetCompletion?.mechanism || "",
            lockout: task.widgetCompletion?.lockout || "none"
          },
          skipRule: normalizeSkipRule(task.skipRule),
          dependencies: [...(task.dependencies || [])].sort(),
          recurrence: normalizeRecurrence(task.recurrence),
          archived: task.archived === true,
          historyOnly: task.historyOnly === true,
          hideAfterAt: task.hideAfterAt || 0,
          seriesOriginId: task.seriesOriginId || "",
          history: [...(task.history || [])]
            .map((item) => ({
              id: item.id,
              type: item.type,
              at: item.at,
              reason: typeof item.reason === "string" ? item.reason : ""
            }))
            .sort((left, right) => {
              if (left.at !== right.at) {
                return left.at - right.at;
              }
              return left.id.localeCompare(right.id);
            })
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      pointLedger: (Array.isArray(normalized.pointLedger) ? normalized.pointLedger : [])
        .map((entry) => sortObjectKeys(entry))
        .sort((left, right) => left.id.localeCompare(right.id)),
      treeState: sortObjectKeys(normalized.treeState || {}),
      devSettings: sortObjectKeys(normalizeDevSettings(normalized.devSettings)),
      categories: (Array.isArray(normalized.categories) ? normalized.categories : [])
        .map((category) => ({
          active: category.active !== false,
          builtin: category.builtin === true,
          color: category.color,
          key: category.key,
          label: category.label
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
      widgets: (Array.isArray(normalized.widgets) ? normalized.widgets : [])
        .map((widget) => sortObjectKeys(widget))
        .sort(compareWidgetFingerprints),
      retiredWidgets: (Array.isArray(normalized.retiredWidgets) ? normalized.retiredWidgets : [])
        .map((widget) => sortObjectKeys(widget))
        .sort(compareWidgetFingerprints),
      recurringBonusSelections: normalizeRecurringBonusSelections(normalized.recurringBonusSelections)
        .map((entry) => sortObjectKeys(entry))
        .sort((left, right) => left.key.localeCompare(right.key)),
      deletionMarkers: normalizeDeletionMarkers(normalized.deletionMarkers)
        .map((entry) => sortObjectKeys(entry))
        .sort((left, right) => {
          if (left.type !== right.type) {
            return left.type.localeCompare(right.type);
          }
          return left.value.localeCompare(right.value);
        })
    };
  }

  function sortObjectKeys(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sortObjectKeys(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = sortObjectKeys(value[key]);
    }
    return result;
  }

  function hashStringFNV1a64(value) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, "0");
  }

  function hashComparableStore(comparableStore) {
    return `fnv1a64:${hashStringFNV1a64(JSON.stringify(sortObjectKeys(comparableStore)))}`;
  }

  function computeStoreFingerprint(sourceStore) {
    const normalized = normalizeStore(sourceStore || createEmptyStore());
    return hashComparableStore(buildComparableStore(normalized));
  }

  function computeUserContentFingerprintFromNormalized(normalized) {
    return hashComparableStore(buildComparableStore(normalized));
  }

  function computeUserContentFingerprint(sourceStore) {
    const normalized = normalizeStore(sourceStore || createEmptyStore());
    return computeUserContentFingerprintFromNormalized(normalized);
  }

  return {
    buildComparableStore,
    buildComparableValueSignature,
    buildDeletionMarkerMaps,
    canAutoMergeDriveConflict,
    choosePreferredCategoryDefinition,
    choosePreferredTask,
    choosePreferredUserSyncState,
    computeStoreFingerprint,
    computeUserContentFingerprint,
    computeUserContentFingerprintFromNormalized,
    createCategoryDefinition,
    createCategorySnapshotResolver,
    createEmptyStore,
    deletionMarkerSuppressesTask,
    getTaskMergeUpdatedAt,
    hasAmbiguousDriveMergeConflict,
    hasLinkedSeriesGroup,
    latestTaskTimestampForMerge,
    mergeCategoryDefinitions,
    mergeDeletionMarkers,
    mergeRecurringBonusSelections,
    mergeStores,
    normalizeCategoryColor,
    normalizeCategoryDefinitions,
    normalizeDeletionMarkers,
    normalizeImportance,
    normalizeLinkedSeries,
    normalizeRecurringBonusSelections,
    normalizeStatus,
    normalizeStore,
    normalizeTask,
    shouldKeepUnpairedTask,
    slugifyCategoryKey,
    sortObjectKeys,
    buildTaskMergeSignature
  };
}
