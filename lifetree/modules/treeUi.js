export function renderTreeFruitMarkup(
  { color, stage, size, ripe, title = "", detail = false },
  { escapeHtml }
) {
  return `
    <span
      class="tree-fruit${detail ? " detail" : ""} stage-${stage}${ripe ? " ripe" : ""}"
      style="--fruit-color: ${escapeHtml(color)}; --fruit-size: ${size}px;"
      ${title ? `title="${escapeHtml(title)}"` : ""}
    >
      ${ripe ? `
        <span class="tree-fruit-sparkle sparkle-a" aria-hidden="true"></span>
        <span class="tree-fruit-sparkle sparkle-b" aria-hidden="true"></span>
        <span class="tree-fruit-sparkle sparkle-c" aria-hidden="true"></span>
      ` : ""}
    </span>
  `;
}

export function renderTreeDetailContent(
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
) {
  return `
    <section class="tree-detail-layout">
      <section class="tree-detail-overview">
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.bankedPoints))}</strong>
          <span>Banked reward points</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.growingPoints))}</strong>
          <span>Currently growing on the tree</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(formatPointsLabel(treeState.ripePoints))}</strong>
          <span>Ready to harvest now</span>
        </article>
        <article class="tree-detail-stat">
          <strong>${escapeHtml(String(treeState.ripeFruitCount))}</strong>
          <span>Ripe fruits on the branches</span>
        </article>
      </section>

      <section class="tree-detail-section">
        <div class="tree-detail-section-header">
          <div>
            <p class="eyebrow">Fruit</p>
            <h3>Current fruit by category</h3>
          </div>
          <button type="button" class="primary-button" data-tree-detail-action="harvest">Harvest ripe fruit</button>
        </div>
        <div class="tree-detail-categories">
          ${visibleCategories.length > 0 ? visibleCategories.map((category) => `
            <article class="tree-detail-card">
              <div class="tree-detail-card-header">
                <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(category.color)}">${escapeHtml(category.label)}</span>
                <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(category.color)}">${escapeHtml(formatPointsLabel(category.availablePoints))}</span>
              </div>
              <div class="tree-detail-fruit-row">
                ${category.fruits.length > 0 ? category.fruits.map((fruit) => renderTreeFruitMarkup(
                  {
                    color: category.color,
                    stage: fruit.stage,
                    size: 11 + (fruit.stage * 4),
                    ripe: fruit.ripe,
                    detail: true
                  },
                  { escapeHtml }
                )).join("") : '<span class="tree-point-empty">No visible fruit</span>'}
              </div>
              <p>${category.visibleFruitCount} / 3 fruits visible${category.overflowPoints > 0 ? ` · ${formatPointsLabel(category.overflowPoints)} waiting off-branch` : ""}</p>
              <p>${escapeHtml(formatPointsLabel(category.ripePoints))} ripe · ${escapeHtml(formatPointsLabel(category.bankedPoints))} banked</p>
            </article>
          `).join("") : '<p class="tree-point-empty">No fruit has started growing yet.</p>'}
        </div>
      </section>

      <section class="tree-detail-section">
        <div class="tree-detail-section-header">
          <div>
            <p class="eyebrow">Points</p>
            <h3>Current points by category</h3>
            <p class="sync-status">Exchange banked points at a ${treePointExchangeRatio}:1 rate without regrowing fruit on the tree.</p>
          </div>
        </div>
        <div class="tree-detail-bank-grid">
          ${exchangeState.bankedCategories.length > 0 ? exchangeState.bankedCategories.map((category) => `
            <span class="task-chip category-chip tree-detail-bank-pill" style="--chip-color: ${escapeHtml(category.color)}">
              ${escapeHtml(category.label)} · ${escapeHtml(formatPointsLabel(category.bankedPoints))}
            </span>
          `).join("") : '<span class="tree-point-empty">No banked reward points are available yet.</span>'}
        </div>
        ${exchangeState.inputCategories.length > 0 && exchangeState.outputCategories.length > 0 ? `
          <form class="tree-point-exchange-form" data-tree-detail-form="exchange">
            <label class="tree-point-exchange-field">
              <span>Input category</span>
              <select name="inputCategoryKey">
                ${exchangeState.inputCategories.map((category) => `
                  <option value="${escapeHtml(category.key)}"${category.key === exchangeState.inputCategoryKey ? " selected" : ""}>
                    ${escapeHtml(`${category.label} · ${formatPointsLabel(category.bankedPoints)} banked`)}
                  </option>
                `).join("")}
              </select>
            </label>
            <label class="tree-point-exchange-field">
              <span>Output category</span>
              <select name="outputCategoryKey">
                ${exchangeState.outputCategories.map((category) => `
                  <option value="${escapeHtml(category.key)}"${category.key === exchangeState.outputCategoryKey ? " selected" : ""}>
                    ${escapeHtml(category.label)}
                  </option>
                `).join("")}
              </select>
            </label>
            <label class="tree-point-exchange-field">
              <span>Input points</span>
              <input
                type="number"
                name="inputPoints"
                min="${treePointExchangeRatio}"
                max="${escapeHtml(String(Math.max(treePointExchangeRatio, exchangeState.maxInputPoints || treePointExchangeRatio)))}"
                step="${treePointExchangeRatio}"
                value="${escapeHtml(String(Math.max(treePointExchangeRatio, exchangeState.inputPoints || treePointExchangeRatio)))}"
              />
            </label>
            <div class="tree-point-exchange-summary">
              ${exchangeState.canExchange
                ? escapeHtml(`Spend ${formatPointsLabel(exchangeState.inputPoints)} of ${exchangeState.inputCategory?.label || "this category"} to receive ${formatPointsLabel(exchangeState.outputPoints)} in ${exchangeState.outputCategory?.label || "the target category"}.`)
                : `You need at least ${treePointExchangeRatio} banked points in one category to exchange them.`}
            </div>
            <button type="submit" class="secondary-button" ${exchangeState.canExchange ? "" : "disabled"}>
              Exchange points
            </button>
          </form>
        ` : `
          <p class="tree-point-empty">You need at least ${treePointExchangeRatio} banked points in one category and a second category to exchange into.</p>
        `}
      </section>

      <section class="tree-detail-section">
        <div class="tree-detail-section-header">
          <div>
            <p class="eyebrow">Points</p>
            <h3>Recent point history</h3>
            <p class="sync-status">Showing the last 7 days of point awards, up to ${escapeHtml(String(devSettings.maxPointHistoryEntries))} entries.</p>
          </div>
        </div>
        <div class="tree-detail-sources">
          ${pointHistory.length > 0 ? pointHistory.map((entry) => `
            <article class="tree-detail-source-item">
              <div class="tree-detail-source-heading">
                <strong>${escapeHtml(entry.sourceLabel || entry.taskName || "Point award")}</strong>
                <span class="task-chip points-chip" style="--chip-color: ${escapeHtml(entry.categoryColor)}">${escapeHtml(formatPointsLabel(entry.points))}</span>
              </div>
              <div class="tree-detail-source-meta">
                <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(entry.categoryColor)}">${escapeHtml(entry.categoryLabel)}</span>
                <span>${escapeHtml(`Awarded ${formatDateTime(entry.at)}`)}</span>
                ${formatPointHistoryDueLabel(entry, { formatDateTime }) ? `<span>${escapeHtml(`Due ${formatPointHistoryDueLabel(entry, { formatDateTime })}`)}</span>` : ""}
              </div>
            </article>
          `).join("") : '<p class="tree-point-empty">No recent point awards are recorded yet.</p>'}
        </div>
      </section>
    </section>
  `;
}

export function renderTreeStyleContent(
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
) {
  return `
    <section class="tree-style-layout">
      <section class="tree-style-summary">
        <div>
          <p class="eyebrow">Unlocked Looks</p>
          <h3>Spend harvested points on new appearances</h3>
          <p class="sync-status">Owned skins stay available once purchased. Equip any owned skin for each tree part whenever you want.</p>
        </div>
        <div class="tree-style-bank-grid">
          ${bankedCategories.length > 0 ? bankedCategories.map((entry) => `
            <span class="task-chip category-chip tree-style-bank-pill" style="--chip-color: ${escapeHtml(entry.color)}">
              ${escapeHtml(entry.label)} · ${escapeHtml(formatPointsLabel(entry.points))}
            </span>
          `).join("") : '<span class="tree-point-empty">No harvested points banked yet.</span>'}
        </div>
      </section>

      ${catalog.map((part) => {
        const equipped = getTreeSkin(part.equippedSkinId);
        return `
          <section class="tree-style-section">
            <div class="tree-style-part-header">
              <div>
                <p class="eyebrow">${escapeHtml(getTreeStylePartLabel(part.key))}</p>
                <h3>${escapeHtml(getTreeStylePartLabel(part.key))}</h3>
              </div>
              <span class="task-chip">${escapeHtml(equipped?.label || "Default")}</span>
            </div>
            <div class="tree-style-grid">
              ${part.skins.map((skin) => {
                const costCategory = skin.cost ? resolveCategorySnapshot(skin.cost.categoryKey) : null;
                return `
                  <article class="tree-style-card${skin.equipped ? " equipped" : ""}${!skin.owned ? " locked" : ""}">
                    <div class="tree-style-card-header">
                      <strong>${escapeHtml(skin.label)}</strong>
                      <span class="task-chip${skin.equipped ? " importance-high" : ""}">${escapeHtml(
                        skin.equipped
                          ? "Equipped"
                          : skin.owned
                            ? "Owned"
                            : skin.default
                              ? "Default"
                              : "Locked"
                      )}</span>
                    </div>
                    <p>${escapeHtml(skin.description || "Appearance option for this tree part.")}</p>
                    ${skin.cost ? `
                      <div class="tree-style-cost">
                        <span class="task-chip category-chip" style="--chip-color: ${escapeHtml(costCategory?.color || defaultCategoryColor)}">
                          ${escapeHtml(costCategory?.label || skin.cost.categoryKey)}
                        </span>
                        <span>${escapeHtml(formatPointsLabel(skin.cost.points))} required · ${escapeHtml(formatPointsLabel(skin.bankedPoints || 0))} banked</span>
                      </div>
                    ` : '<div class="tree-style-cost"><span class="task-action-note">Always available.</span></div>'}
                    <div class="tree-style-card-actions">
                      ${skin.equipped
                        ? '<span class="task-action-note">Currently active</span>'
                        : skin.owned
                          ? `<button type="button" class="primary-button" data-tree-style-action="equip" data-tree-style-part="${escapeHtml(part.key)}" data-tree-style-skin="${escapeHtml(skin.id)}">Equip</button>`
                          : `<button type="button" class="ghost-button" data-tree-style-action="buy" data-tree-style-part="${escapeHtml(part.key)}" data-tree-style-skin="${escapeHtml(skin.id)}" ${skin.affordable ? "" : "disabled"}>Buy skin</button>`}
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("")}
    </section>
  `;
}

function formatPointHistoryDueLabel(entry, { formatDateTime }) {
  if (!entry?.dueDate) {
    return "";
  }
  const time = entry.timeOfDay || "23:59";
  return formatDateTime(`${entry.dueDate}T${time}:00`);
}
