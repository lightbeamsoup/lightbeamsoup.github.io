export function buildPointSummary(entries = []) {
  const byCategory = new Map();
  const bySource = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const category = byCategory.get(entry.categoryKey) || {
      key: entry.categoryKey,
      label: entry.categoryLabel,
      color: entry.categoryColor,
      points: 0
    };
    category.points += entry.points;
    byCategory.set(entry.categoryKey, category);

    const sourceKey = entry.sourceKey || `${entry.sourceType}:${entry.sourceLabel}`;
    const source = bySource.get(sourceKey) || {
      key: sourceKey,
      label: entry.sourceLabel,
      type: entry.sourceType,
      points: 0
    };
    source.points += entry.points;
    bySource.set(sourceKey, source);
  }

  return {
    totalPoints: Array.from(byCategory.values()).reduce((sum, entry) => sum + entry.points, 0),
    byCategory: Array.from(byCategory.values()).sort((left, right) => right.points - left.points || left.label.localeCompare(right.label)),
    bySource: Array.from(bySource.values()).sort((left, right) => right.points - left.points || left.label.localeCompare(right.label))
  };
}

export function buildFruitDisplayState({ pointLedger = [], treeState, categories = [], resolveCategorySnapshot }) {
  const pointSummary = buildPointSummary(pointLedger);
  const earnedByCategory = new Map(pointSummary.byCategory.map((entry) => [entry.key, entry]));
  const mergedCategories = new Map((Array.isArray(categories) ? categories : []).map((category) => [category.key, category]));

  for (const entry of pointSummary.byCategory) {
    if (!mergedCategories.has(entry.key)) {
      mergedCategories.set(entry.key, {
        key: entry.key,
        label: entry.label,
        color: entry.color,
        active: true,
        builtin: false,
        updatedAt: 0
      });
    }
  }

  for (const categoryKey of Object.keys(treeState?.harvestedByCategory || {})) {
    if (!mergedCategories.has(categoryKey)) {
      const snapshot = resolveCategorySnapshot(categoryKey);
      mergedCategories.set(categoryKey, {
        key: categoryKey,
        label: snapshot.label,
        color: snapshot.color,
        active: true,
        builtin: false,
        updatedAt: 0
      });
    }
  }

  for (const categoryKey of Object.keys(treeState?.devFruitPoints || {})) {
    if (!mergedCategories.has(categoryKey)) {
      const snapshot = resolveCategorySnapshot(categoryKey);
      mergedCategories.set(categoryKey, {
        key: categoryKey,
        label: snapshot.label,
        color: snapshot.color,
        active: true,
        builtin: false,
        updatedAt: 0
      });
    }
  }

  const categoryList = Array.from(mergedCategories.values()).sort((left, right) => left.label.localeCompare(right.label)).map((category, index) => {
    const earned = earnedByCategory.get(category.key)?.points || 0;
    const adjustment = treeState?.devFruitPoints?.[category.key] || 0;
    const banked = treeState?.harvestedByCategory?.[category.key] || 0;
    const available = Math.max(0, earned + adjustment - banked);
    const fruits = buildFruitSlots(available);
    const ripePoints = fruits.filter((fruit) => fruit.ripe).reduce((sum, fruit) => sum + fruit.points, 0);
    return {
      ...category,
      order: index,
      earnedPoints: earned,
      availablePoints: available,
      bankedPoints: banked,
      adjustmentPoints: adjustment,
      ripePoints,
      visibleFruitCount: fruits.length,
      overflowPoints: Math.max(available - 75, 0),
      fruits
    };
  });

  const visibleCategories = categoryList.filter((category) => category.visibleFruitCount > 0);
  const fruitDescriptors = visibleCategories.flatMap((category, categoryIndex) => {
    const anchor = computeFruitAnchor(categoryIndex, visibleCategories.length);
    return category.fruits.map((fruit, fruitIndex) => {
      const offset = [
        { left: -4.5, top: 4.5 },
        { left: 0, top: -5.5 },
        { left: 4.5, top: 4.2 }
      ][fruitIndex] || { left: 0, top: 0 };
      return {
        categoryKey: category.key,
        categoryLabel: category.label,
        color: category.color,
        stage: fruit.stage,
        points: fruit.points,
        ripe: fruit.ripe,
        size: 11 + (fruit.stage * 4),
        left: anchor.left + offset.left,
        top: anchor.top + offset.top
      };
    });
  });

  return {
    categories: categoryList,
    bankedPoints: categoryList.reduce((sum, category) => sum + category.bankedPoints, 0),
    growingPoints: categoryList.reduce((sum, category) => sum + category.availablePoints, 0),
    ripePoints: categoryList.reduce((sum, category) => sum + category.ripePoints, 0),
    ripeFruitCount: categoryList.reduce((sum, category) => sum + category.fruits.filter((fruit) => fruit.ripe).length, 0),
    fruitDescriptors
  };
}

function buildFruitSlots(points) {
  const fruits = [];
  for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
    const slotPoints = Math.max(0, Math.min(25, points - (slotIndex * 25)));
    if (slotPoints <= 0) {
      continue;
    }
    fruits.push({
      slotIndex,
      points: slotPoints,
      stage: Math.min(5, Math.ceil(slotPoints / 5)),
      ripe: slotPoints >= 25
    });
  }
  return fruits;
}

function computeFruitAnchor(index, count) {
  if (count <= 1) {
    return { left: 50, top: 31 };
  }
  const startAngle = 205;
  const endAngle = 335;
  const angle = startAngle + ((endAngle - startAngle) * index) / Math.max(count - 1, 1);
  const radians = (angle * Math.PI) / 180;
  return {
    left: 50 + (Math.cos(radians) * 27),
    top: 44 + (Math.sin(radians) * 16)
  };
}
