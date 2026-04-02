export function createTreeController(config = {}) {
  const {
    refs = {},
    getStore,
    getTreeDisplayState,
    getRecentPointHistory,
    getVisibleCategoryDefinitions,
    normalizeTreeState,
    normalizeDevSettings,
    resolveCategorySnapshot,
    renderTreeDetailContent,
    renderTreeStyleContent,
    buildTreeStyleCatalog,
    getTreeBankedPointsByCategory,
    getTreeStylePartLabel,
    getTreeSkin,
    exchangeTreeBankedPoints,
    purchaseTreeSkin,
    equipTreeSkin,
    removeOwnedTreeSkin,
    treePointExchangeRatio = 2,
    defaultCategoryColor = "#7dbf74",
    escapeHtml = (value) => String(value ?? ""),
    formatPointsLabel = (value) => String(value ?? ""),
    formatDateTime = (value) => String(value ?? ""),
    persistStore,
    renderAll,
    setSyncStatus,
    isDeveloperUser = () => false
  } = config;

  const treePointExchangeDraft = {
    inputCategoryKey: "",
    outputCategoryKey: "",
    inputPoints: treePointExchangeRatio
  };

  function isTreeDetailOpen() {
    return !refs.treeDetailModal?.classList.contains("hidden");
  }

  function isTreeStyleOpen() {
    return !refs.treeStyleModal?.classList.contains("hidden");
  }

  function openTreeStyle() {
    refs.treeStyleModal?.classList.remove("hidden");
    refs.treeStyleModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("tree-style-open");
    renderTreeStyleIfOpen();
  }

  function openTreeDetail() {
    refs.treeDetailModal?.classList.remove("hidden");
    refs.treeDetailModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("tree-detail-open");
    renderTreeDetailIfOpen();
  }

  function closeTreeDetail() {
    refs.treeDetailModal?.classList.add("hidden");
    refs.treeDetailModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tree-detail-open");
  }

  function closeTreeStyle() {
    refs.treeStyleModal?.classList.add("hidden");
    refs.treeStyleModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tree-style-open");
  }

  function normalizeTreePointExchangeInput(value, maxValue) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric) || numeric < treePointExchangeRatio || maxValue < treePointExchangeRatio) {
      return 0;
    }
    const steppedValue = numeric - (numeric % treePointExchangeRatio);
    const cappedValue = Math.min(maxValue, steppedValue);
    return cappedValue >= treePointExchangeRatio ? cappedValue : treePointExchangeRatio;
  }

  function getTreePointExchangeState(treeState) {
    const allCategories = getVisibleCategoryDefinitions();
    const inputCategories = treeState.categories
      .filter((category) => category.bankedPoints >= treePointExchangeRatio)
      .sort((left, right) => right.bankedPoints - left.bankedPoints || left.label.localeCompare(right.label));
    const fallbackInputKey = inputCategories[0]?.key || "";
    const inputCategoryKey = inputCategories.some((category) => category.key === treePointExchangeDraft.inputCategoryKey)
      ? treePointExchangeDraft.inputCategoryKey
      : fallbackInputKey;
    const outputCategories = allCategories.filter((category) => category.key !== inputCategoryKey);
    const fallbackOutputKey = outputCategories[0]?.key || "";
    const outputCategoryKey = outputCategories.some((category) => category.key === treePointExchangeDraft.outputCategoryKey)
      ? treePointExchangeDraft.outputCategoryKey
      : fallbackOutputKey;
    const inputCategory = inputCategories.find((category) => category.key === inputCategoryKey) || null;
    const outputCategory = outputCategories.find((category) => category.key === outputCategoryKey) || null;
    const maxInputPoints = inputCategory
      ? inputCategory.bankedPoints - (inputCategory.bankedPoints % treePointExchangeRatio)
      : 0;
    const inputPoints = normalizeTreePointExchangeInput(treePointExchangeDraft.inputPoints, maxInputPoints);
    const outputPoints = inputPoints >= treePointExchangeRatio ? (inputPoints / treePointExchangeRatio) : 0;

    treePointExchangeDraft.inputCategoryKey = inputCategoryKey;
    treePointExchangeDraft.outputCategoryKey = outputCategoryKey;
    treePointExchangeDraft.inputPoints = inputPoints || treePointExchangeRatio;

    return {
      bankedCategories: treeState.categories.filter((category) => category.bankedPoints > 0),
      inputCategories,
      outputCategories,
      inputCategory,
      outputCategory,
      inputCategoryKey,
      outputCategoryKey,
      inputPoints,
      outputPoints,
      maxInputPoints,
      canExchange: Boolean(inputCategory && outputCategory && inputPoints >= treePointExchangeRatio)
    };
  }

  function commitTreeState(nextTreeState, message, tone = "info") {
    const store = getStore();
    store.treeState = normalizeTreeState({
      ...nextTreeState,
      updatedAt: Date.now()
    });
    persistStore();
    renderAll();
    setSyncStatus(message, tone);
  }

  function renderTreeDetailIfOpen() {
    if (!isTreeDetailOpen() || !refs.treeDetailBody) {
      return;
    }

    const store = getStore();
    const treeState = getTreeDisplayState();
    const pointHistory = getRecentPointHistory();
    const devSettings = normalizeDevSettings(store.devSettings);
    const visibleCategories = treeState.categories.filter((category) => (
      category.availablePoints > 0
      || category.bankedPoints > 0
      || category.earnedPoints > 0
      || category.adjustmentPoints !== 0
    ));
    const exchangeState = getTreePointExchangeState(treeState);

    refs.treeDetailBody.innerHTML = renderTreeDetailContent(
      {
        treeState,
        pointHistory,
        devSettings,
        visibleCategories,
        exchangeState,
        treePointExchangeRatio
      },
      {
        escapeHtml,
        formatPointsLabel,
        formatDateTime
      }
    );

    refs.treeDetailBody.querySelector("[data-tree-detail-action='harvest']")?.addEventListener("click", harvestRipeFruit);
    refs.treeDetailBody.querySelector("[data-tree-detail-form='exchange']")?.addEventListener("change", handleTreePointExchangeDraftChange);
    refs.treeDetailBody.querySelector("[data-tree-detail-form='exchange']")?.addEventListener("submit", handleTreePointExchangeSubmit);
  }

  function handleTreePointExchangeDraftChange(event) {
    const form = event.currentTarget;
    treePointExchangeDraft.inputCategoryKey = String(form.elements.inputCategoryKey?.value || "");
    treePointExchangeDraft.outputCategoryKey = String(form.elements.outputCategoryKey?.value || "");
    treePointExchangeDraft.inputPoints = Math.max(
      treePointExchangeRatio,
      Math.round(Number(form.elements.inputPoints?.value) || treePointExchangeRatio)
    );
    renderTreeDetailIfOpen();
  }

  function handleTreePointExchangeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const inputCategoryKey = String(form.elements.inputCategoryKey?.value || "");
    const outputCategoryKey = String(form.elements.outputCategoryKey?.value || "");
    const inputPoints = Math.round(Number(form.elements.inputPoints?.value) || 0);

    if (!inputCategoryKey || !outputCategoryKey || inputCategoryKey === outputCategoryKey) {
      setSyncStatus("Choose different input and output categories for the exchange.", "error");
      return;
    }
    if (inputPoints < treePointExchangeRatio || inputPoints % treePointExchangeRatio !== 0) {
      setSyncStatus(`Exchange amounts must be at least ${treePointExchangeRatio} points and in ${treePointExchangeRatio}-point steps.`, "error");
      return;
    }

    const result = exchangeTreeBankedPoints(normalizeTreeState(getStore().treeState), {
      inputCategoryKey,
      outputCategoryKey,
      inputPoints
    });
    if (!result.changed) {
      const message = result.reason === "insufficient-points"
        ? "Not enough banked points are available in that category."
        : `Exchange amounts must be at least ${treePointExchangeRatio} points and in ${treePointExchangeRatio}-point steps.`;
      setSyncStatus(message, "error");
      return;
    }

    const inputCategory = resolveCategorySnapshot(result.inputCategoryKey);
    const outputCategory = resolveCategorySnapshot(result.outputCategoryKey);
    treePointExchangeDraft.inputCategoryKey = result.inputCategoryKey;
    treePointExchangeDraft.outputCategoryKey = result.outputCategoryKey;
    treePointExchangeDraft.inputPoints = treePointExchangeRatio;

    commitTreeState(
      result.treeState,
      `Exchanged ${formatPointsLabel(result.inputPoints)} of ${inputCategory.label} into ${formatPointsLabel(result.outputPoints)} of ${outputCategory.label}.`,
      "success"
    );
  }

  function renderTreeStyleIfOpen() {
    if (!isTreeStyleOpen() || !refs.treeStyleBody) {
      return;
    }

    const treeState = normalizeTreeState(getStore().treeState);
    const catalog = buildTreeStyleCatalog(treeState);
    const bankedPoints = getTreeBankedPointsByCategory(treeState);
    const bankedCategories = Object.entries(bankedPoints)
      .map(([key, points]) => {
        const category = resolveCategorySnapshot(key);
        return {
          key,
          points,
          label: category.label,
          color: category.color
        };
      })
      .filter((entry) => entry.points > 0)
      .sort((left, right) => right.points - left.points || left.label.localeCompare(right.label));

    refs.treeStyleBody.innerHTML = renderTreeStyleContent(
      {
        catalog,
        bankedCategories,
        defaultCategoryColor
      },
      {
        escapeHtml,
        formatPointsLabel,
        getTreeStylePartLabel,
        getTreeSkin,
        resolveCategorySnapshot
      }
    );
  }

  function handleTreeStyleAction(event) {
    const button = event.target.closest("[data-tree-style-action]");
    if (!button) {
      return;
    }

    const action = button.getAttribute("data-tree-style-action");
    const part = button.getAttribute("data-tree-style-part") || "";
    const skinId = button.getAttribute("data-tree-style-skin") || "";
    if (!skinId) {
      return;
    }

    if (action === "buy") {
      const result = purchaseTreeSkin(normalizeTreeState(getStore().treeState), skinId);
      if (!result.changed) {
        setSyncStatus(result.reason === "insufficient-points" ? "Not enough harvested fruit points for that skin yet." : "That skin is already available.", "error");
        return;
      }
      commitTreeState(result.treeState, `Unlocked ${result.skin.label}.`, "success");
      return;
    }

    if (action === "equip") {
      const result = equipTreeSkin(normalizeTreeState(getStore().treeState), part, skinId);
      if (!result.changed) {
        setSyncStatus("That skin is not available to equip.", "error");
        return;
      }
      commitTreeState(result.treeState, `Equipped ${result.skin.label}.`, "info");
    }
  }

  function harvestRipeFruit() {
    const store = getStore();
    const treeState = getTreeDisplayState();
    if (treeState.ripePoints <= 0) {
      setSyncStatus("There is no ripe fruit to harvest yet.", "info");
      return;
    }

    const harvestedByCategory = { ...normalizeTreeState(store.treeState).harvestedByCategory };
    for (const category of treeState.categories) {
      if (category.ripePoints <= 0) {
        continue;
      }
      harvestedByCategory[category.key] = (harvestedByCategory[category.key] || 0) + category.ripePoints;
    }

    commitTreeState(
      {
        ...store.treeState,
        harvestedByCategory
      },
      `Harvested ${formatPointsLabel(treeState.ripePoints)} from ${treeState.ripeFruitCount} ripe ${treeState.ripeFruitCount === 1 ? "fruit" : "fruits"}.`,
      "info"
    );
  }

  function buySelectedTreeSkin() {
    if (!isDeveloperUser()) {
      return;
    }
    const skinId = refs.developerTreeSkin?.value || "";
    if (!skinId) {
      return;
    }
    const result = purchaseTreeSkin(normalizeTreeState(getStore().treeState), skinId);
    if (!result.changed) {
      setSyncStatus(result.reason === "insufficient-points" ? "Not enough banked points to buy that skin yet." : "That skin is already owned.", "error");
      return;
    }
    commitTreeState(result.treeState, `Bought ${result.skin.label}.`, "success");
  }

  function removeSelectedTreeSkin() {
    if (!isDeveloperUser()) {
      return;
    }
    const skinId = refs.developerTreeSkin?.value || "";
    if (!skinId) {
      return;
    }
    const result = removeOwnedTreeSkin(normalizeTreeState(getStore().treeState), skinId);
    if (!result.changed) {
      setSyncStatus("That skin is not currently owned.", "error");
      return;
    }
    commitTreeState(result.treeState, `Removed ${result.skin.label} from the available skins.`, "info");
  }

  return {
    buySelectedTreeSkin,
    closeTreeDetail,
    closeTreeStyle,
    handleTreeStyleAction,
    harvestRipeFruit,
    isTreeDetailOpen,
    isTreeStyleOpen,
    openTreeDetail,
    openTreeStyle,
    removeSelectedTreeSkin,
    renderTreeDetailIfOpen,
    renderTreeStyleIfOpen
  };
}
