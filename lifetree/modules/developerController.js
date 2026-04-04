export function createDeveloperController(config = {}) {
  const {
    refs = {},
    authState,
    notificationSendState,
    getStore,
    isDeveloperUser = () => false,
    listWidgetDefinitions = () => [],
    getSelectableCategories = () => [],
    defaultCategoryKey = "productivity",
    listPurchasableTreeSkins = () => [],
    getTreeStylePartLabel = () => "",
    normalizeTreeStyleState = () => ({ ownedSkinIds: [] }),
    normalizeDevSettings = (value) => value || {},
    normalizePointHistory = (value) => value || [],
    normalizeTreeState = (value) => value || {},
    normalizeTaskPoints = (value) => Number(value || 0),
    parsePositiveNumber = (value) => Number(value || 0),
    defaultMaxTaskPoints = 10,
    defaultMaxPointHistoryEntries = 200,
    formatPointsLabel = (value) => String(value ?? ""),
    renderDeveloperFruitSummary = () => "",
    renderDeveloperPointsSummary = () => "",
    getTreeDisplayState = () => ({}),
    getPointLedgerSummary = () => ({}),
    resolveCategorySnapshot = () => ({ key: "", label: "", color: "" }),
    slugifyCategoryKey = (value) => String(value ?? ""),
    escapeHtml = (value) => String(value ?? ""),
    recordPointEntry = () => {},
    createId = () => String(Date.now()),
    persistStore = () => {},
    renderAll = () => {},
    renderTreeDetailIfOpen = () => {},
    setSyncStatus = () => {},
    syncTaskPointsDefault = () => {}
  } = config;

  const {
    openDeveloperButton = null,
    developerModal = null,
    developerPanel = null,
    developerEmail = null,
    developerWidgetType = null,
    developerMaxTaskPoints = null,
    developerMaxPointHistoryEntries = null,
    developerInjectCategory = null,
    developerInjectPoints = null,
    developerInjectSource = null,
    developerFruitCategory = null,
    developerFruitDelta = null,
    developerBankedCategory = null,
    developerBankedDelta = null,
    developerTreeSkin = null,
    grantTreeSkinButton = null,
    removeTreeSkinButton = null,
    copyNotificationDiagnosticsButton = null,
    downloadLocalDataButton = null,
    importDriveDataButton = null,
    sendDeveloperNotificationTestButton = null,
    sendDeveloperDailySummaryButton = null,
    sendDeveloperDailyAgendaButton = null,
    developerFruitSummary = null,
    developerPointsSummary = null,
    taskPointsInput = null
  } = refs;

  function syncSelectOptions(select, options, currentValue, getValue, getLabel, fallbackValue = "") {
    if (!select) {
      return;
    }
    select.innerHTML = options.map((option) => `
      <option value="${escapeHtml(getValue(option))}">${escapeHtml(getLabel(option))}</option>
    `).join("");
    select.value = Array.from(select.options).some((option) => option.value === currentValue)
      ? currentValue
      : (fallbackValue || select.options[0]?.value || "");
  }

  function closeDeveloper() {
    developerModal?.classList.add("hidden");
    developerModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("developer-open");
  }

  function isDeveloperOpen() {
    return Boolean(developerModal && !developerModal.classList.contains("hidden"));
  }

  function renderDeveloperPanel() {
    const visible = isDeveloperUser();
    openDeveloperButton?.classList.toggle("hidden", !visible);
    developerPanel?.classList.toggle("hidden", !visible);
    if (!visible) {
      closeDeveloper();
      if (developerFruitSummary) {
        developerFruitSummary.innerHTML = "";
      }
      if (developerPointsSummary) {
        developerPointsSummary.innerHTML = "";
      }
      return;
    }

    if (developerEmail) {
      developerEmail.textContent = authState?.user?.email || "";
    }

    syncSelectOptions(
      developerWidgetType,
      listWidgetDefinitions(),
      developerWidgetType?.value || "",
      (definition) => definition.type,
      (definition) => definition.title
    );

    const categories = getSelectableCategories();
    syncSelectOptions(
      developerInjectCategory,
      categories,
      developerInjectCategory?.value || "",
      (category) => category.key,
      (category) => category.label,
      categories[0]?.key || defaultCategoryKey
    );
    syncSelectOptions(
      developerFruitCategory,
      categories,
      developerFruitCategory?.value || "",
      (category) => category.key,
      (category) => category.label,
      categories[0]?.key || defaultCategoryKey
    );
    syncSelectOptions(
      developerBankedCategory,
      categories,
      developerBankedCategory?.value || "",
      (category) => category.key,
      (category) => category.label,
      categories[0]?.key || defaultCategoryKey
    );

    const currentTreeSkinValue = developerTreeSkin?.value || "";
    const treeState = normalizeTreeStyleState(getStore().treeState?.styleState);
    const purchasableSkins = listPurchasableTreeSkins();
    syncSelectOptions(
      developerTreeSkin,
      purchasableSkins,
      currentTreeSkinValue,
      (skin) => skin.id,
      (skin) => `${getTreeStylePartLabel(skin.part)} · ${skin.label}${treeState.ownedSkinIds.includes(skin.id) ? " (owned)" : ""}`,
      purchasableSkins[0]?.id || ""
    );

    const hasSkins = purchasableSkins.length > 0;
    if (developerTreeSkin) {
      developerTreeSkin.disabled = !hasSkins;
    }
    if (grantTreeSkinButton) {
      grantTreeSkinButton.disabled = !hasSkins;
    }
    if (removeTreeSkinButton) {
      removeTreeSkinButton.disabled = !hasSkins;
    }
    if (downloadLocalDataButton) {
      downloadLocalDataButton.disabled = !visible;
    }
    if (importDriveDataButton) {
      importDriveDataButton.disabled = !visible;
    }

    const notificationsBusy = !(authState?.authenticated) || notificationSendState?.inFlight;
    if (copyNotificationDiagnosticsButton) {
      copyNotificationDiagnosticsButton.disabled = !(authState?.authenticated);
    }
    if (sendDeveloperNotificationTestButton) {
      sendDeveloperNotificationTestButton.disabled = notificationsBusy;
      sendDeveloperNotificationTestButton.textContent = notificationSendState?.inFlight && notificationSendState.kind === "test"
        ? "Sending…"
        : "Send test notification email";
    }
    if (sendDeveloperDailySummaryButton) {
      sendDeveloperDailySummaryButton.disabled = notificationsBusy;
      sendDeveloperDailySummaryButton.textContent = notificationSendState?.inFlight && notificationSendState.kind === "summary"
        ? "Sending…"
        : "Send daily summary email";
    }
    if (sendDeveloperDailyAgendaButton) {
      sendDeveloperDailyAgendaButton.disabled = notificationsBusy;
      sendDeveloperDailyAgendaButton.textContent = notificationSendState?.inFlight && notificationSendState.kind === "reminder"
        ? "Sending…"
        : "Send daily agenda email";
    }

    const devSettings = normalizeDevSettings(getStore().devSettings);
    if (developerMaxTaskPoints) {
      developerMaxTaskPoints.value = String(devSettings.maxTaskPoints);
    }
    if (developerMaxPointHistoryEntries) {
      developerMaxPointHistoryEntries.value = String(devSettings.maxPointHistoryEntries);
    }
    if (taskPointsInput) {
      taskPointsInput.max = String(devSettings.maxTaskPoints);
    }
    if (developerFruitSummary) {
      developerFruitSummary.innerHTML = renderDeveloperFruitSummary(getTreeDisplayState());
    }
    if (developerPointsSummary) {
      developerPointsSummary.innerHTML = renderDeveloperPointsSummary(getPointLedgerSummary());
    }
  }

  function openDeveloper() {
    if (!isDeveloperUser()) {
      return;
    }
    developerModal?.classList.remove("hidden");
    developerModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("developer-open");
    renderDeveloperPanel();
  }

  function updateMaxTaskPointsSetting() {
    const store = getStore();
    const nextValue = Math.max(1, Math.min(50, parsePositiveNumber(developerMaxTaskPoints?.value) || defaultMaxTaskPoints));
    store.devSettings = normalizeDevSettings({
      ...store.devSettings,
      maxTaskPoints: nextValue
    });
    if (developerMaxTaskPoints) {
      developerMaxTaskPoints.value = String(nextValue);
    }
    syncTaskPointsDefault();
    persistStore();
    renderDeveloperPanel();
    setSyncStatus(`Max task points updated to ${nextValue}. Future task edits use this cap.`, "info");
  }

  function updateMaxPointHistoryEntriesSetting() {
    const store = getStore();
    const nextValue = Math.max(
      1,
      Math.min(defaultMaxPointHistoryEntries, parsePositiveNumber(developerMaxPointHistoryEntries?.value) || defaultMaxPointHistoryEntries)
    );
    store.devSettings = normalizeDevSettings({
      ...store.devSettings,
      maxPointHistoryEntries: nextValue
    });
    store.pointHistory = normalizePointHistory(store.pointHistory, store.devSettings);
    if (developerMaxPointHistoryEntries) {
      developerMaxPointHistoryEntries.value = String(nextValue);
    }
    persistStore();
    renderDeveloperPanel();
    renderTreeDetailIfOpen();
    setSyncStatus(`Recent point history is now capped at ${nextValue} entries over the last 7 days.`, "info");
  }

  function injectDeveloperPoints() {
    if (!isDeveloperUser()) {
      return;
    }

    const category = resolveCategorySnapshot(developerInjectCategory?.value || defaultCategoryKey);
    const points = normalizeTaskPoints(developerInjectPoints?.value, 1, 1000);
    const source = String(developerInjectSource?.value || "").trim() || "Developer injection";
    if (points <= 0) {
      setSyncStatus("Injected points must be at least 1.", "error");
      return;
    }

    recordPointEntry({
      id: createId(),
      taskId: "",
      taskName: "",
      at: Date.now(),
      points,
      categoryKey: category.key,
      categoryLabel: category.label,
      categoryColor: category.color,
      dueDate: "",
      timeOfDay: "",
      sourceKey: `developer:${slugifyCategoryKey(source) || "injection"}`,
      sourceType: "developer",
      sourceLabel: source
    });

    persistStore();
    renderDeveloperPanel();
    renderTreeDetailIfOpen();
    setSyncStatus(`Injected ${formatPointsLabel(points)} into ${category.label}.`, "info");
  }

  function adjustDeveloperFruitGrowth(direction) {
    if (!isDeveloperUser()) {
      return;
    }

    const store = getStore();
    const category = resolveCategorySnapshot(developerFruitCategory?.value || defaultCategoryKey);
    const delta = normalizeTaskPoints(developerFruitDelta?.value, 1, 75);
    if (delta <= 0) {
      setSyncStatus("Fruit growth changes must be at least 1 point.", "error");
      return;
    }

    const treeState = normalizeTreeState(store.treeState);
    const nextValue = (treeState.devFruitPoints[category.key] || 0) + (direction * delta);
    const nextFruitPoints = { ...treeState.devFruitPoints };
    if (nextValue === 0) {
      delete nextFruitPoints[category.key];
    } else {
      nextFruitPoints[category.key] = nextValue;
    }

    store.treeState = normalizeTreeState({
      ...treeState,
      devFruitPoints: nextFruitPoints,
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus(
      `${direction > 0 ? "Added" : "Removed"} ${formatPointsLabel(delta)} of test fruit growth for ${category.label}.`,
      "info"
    );
  }

  function adjustDeveloperBankedPoints(direction) {
    if (!isDeveloperUser()) {
      return;
    }

    const store = getStore();
    const category = resolveCategorySnapshot(developerBankedCategory?.value || defaultCategoryKey);
    const delta = normalizeTaskPoints(developerBankedDelta?.value, 1, 1000);
    if (delta <= 0) {
      setSyncStatus("Banked point changes must be at least 1 point.", "error");
      return;
    }

    const treeState = normalizeTreeState(store.treeState);
    const nextValue = Math.max(0, (treeState.harvestedByCategory[category.key] || 0) + (direction * delta));
    const nextHarvested = { ...treeState.harvestedByCategory };
    if (nextValue === 0) {
      delete nextHarvested[category.key];
    } else {
      nextHarvested[category.key] = nextValue;
    }

    store.treeState = normalizeTreeState({
      ...treeState,
      harvestedByCategory: nextHarvested,
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus(
      `${direction > 0 ? "Added" : "Removed"} ${formatPointsLabel(delta)} of banked fruit points for ${category.label}.`,
      "info"
    );
  }

  function resetDeveloperFruitGrowth() {
    if (!isDeveloperUser()) {
      return;
    }
    const store = getStore();
    store.treeState = normalizeTreeState({
      ...store.treeState,
      devFruitPoints: {},
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus("Cleared developer fruit-growth adjustments.", "info");
  }

  return {
    adjustDeveloperBankedPoints,
    adjustDeveloperFruitGrowth,
    closeDeveloper,
    injectDeveloperPoints,
    isDeveloperOpen,
    openDeveloper,
    renderDeveloperPanel,
    resetDeveloperFruitGrowth,
    updateMaxPointHistoryEntriesSetting,
    updateMaxTaskPointsSetting
  };
}
