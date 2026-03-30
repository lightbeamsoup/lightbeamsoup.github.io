const TREE_PHASES = ["sunrise", "morning", "midday", "evening", "sunset", "night"];

export const TREE_STYLE_PARTS = [
  { key: "canopy", label: "Canopy" },
  { key: "grass", label: "Grass" },
  { key: "trunk", label: "Trunk" },
  { key: "fruit", label: "Fruit" },
  { key: "background", label: "Background" },
  { key: "sunMoon", label: "Sun / moon" }
];

const DEFAULT_EQUIPPED_SKINS = {
  canopy: "default-canopy",
  grass: "default-grass",
  trunk: "default-trunk",
  fruit: "default-fruit",
  background: "default-background",
  sunMoon: "default-sun-moon"
};

const DEFAULT_TREE_IMAGE = "images/oak-tree-hub.svg";
const SPRING_TREE_IMAGE = "images/oak-tree-hub-spring-grass.svg";

const DEFAULT_BACKGROUND_PHASES = {
  sunrise: {
    skyTop: "#f8c3a2",
    skyBottom: "#fff1d1",
    horizonGlow: "rgba(255, 205, 136, 0.82)"
  },
  morning: {
    skyTop: "#b8defa",
    skyBottom: "#eef8ff",
    horizonGlow: "rgba(255, 231, 178, 0.45)"
  },
  midday: {
    skyTop: "#89c6f3",
    skyBottom: "#ebf9ff",
    horizonGlow: "rgba(255, 240, 205, 0.28)"
  },
  evening: {
    skyTop: "#ffd49e",
    skyBottom: "#fff1d8",
    horizonGlow: "rgba(255, 190, 122, 0.52)"
  },
  sunset: {
    skyTop: "#7769aa",
    skyBottom: "#ffc18f",
    horizonGlow: "rgba(255, 157, 101, 0.72)"
  },
  night: {
    skyTop: "#0d1530",
    skyBottom: "#263a63",
    horizonGlow: "rgba(89, 121, 188, 0.38)"
  }
};

const DEFAULT_SUN_MOON_PHASES = {
  sunrise: { sunOpacity: 0.92, moonOpacity: 0.26, starOpacity: 0.18 },
  morning: { sunOpacity: 0.98, moonOpacity: 0, starOpacity: 0 },
  midday: { sunOpacity: 1, moonOpacity: 0, starOpacity: 0 },
  evening: { sunOpacity: 0.84, moonOpacity: 0.12, starOpacity: 0.04 },
  sunset: { sunOpacity: 0.68, moonOpacity: 0.42, starOpacity: 0.3 },
  night: { sunOpacity: 0, moonOpacity: 0.94, starOpacity: 0.88 }
};

export const TREE_STYLE_SKINS = [
  {
    id: "default-canopy",
    part: "canopy",
    label: "Classic canopy",
    description: "The standard oak canopy.",
    default: true
  },
  {
    id: "default-grass",
    part: "grass",
    label: "Classic grass",
    description: "The standard Lifetree meadow.",
    default: true,
    treeImageSrc: DEFAULT_TREE_IMAGE
  },
  {
    id: "default-trunk",
    part: "trunk",
    label: "Classic trunk",
    description: "The standard oak trunk.",
    default: true
  },
  {
    id: "default-fruit",
    part: "fruit",
    label: "Classic fruit",
    description: "Fruit colors come directly from your task categories.",
    default: true
  },
  {
    id: "default-background",
    part: "background",
    label: "Classic sky",
    description: "The standard Lifetree day and night sky.",
    default: true,
    phases: DEFAULT_BACKGROUND_PHASES
  },
  {
    id: "default-sun-moon",
    part: "sunMoon",
    label: "Classic celestial",
    description: "The standard sun, moon, and stars.",
    default: true,
    phases: DEFAULT_SUN_MOON_PHASES
  },
  {
    id: "spring-grass",
    part: "grass",
    label: "Spring meadow",
    description: "Fresh spring grass with flowers at the base of your tree.",
    default: false,
    cost: {
      categoryKey: "productivity",
      points: 25
    },
    treeImageSrc: SPRING_TREE_IMAGE
  },
  {
    id: "cherry-blossom-2026",
    part: "canopy",
    label: "Cherry Blossom 2026",
    description: "A soft cherry blossom accent set for the canopy, unlocked with Health points.",
    default: false,
    cost: {
      categoryKey: "health",
      points: 50
    },
    canopyDecoration: "cherry-blossom-2026"
  }
];

const SKIN_BY_ID = new Map(TREE_STYLE_SKINS.map((skin) => [skin.id, skin]));

export function normalizeTreeStyleState(value) {
  const ownedSet = new Set(
    Array.isArray(value?.ownedSkinIds)
      ? value.ownedSkinIds.filter((id) => SKIN_BY_ID.has(id) && !SKIN_BY_ID.get(id).default)
      : []
  );
  const equippedByPart = {};

  for (const part of TREE_STYLE_PARTS) {
    const requestedSkinId = typeof value?.equippedByPart?.[part.key] === "string"
      ? value.equippedByPart[part.key]
      : DEFAULT_EQUIPPED_SKINS[part.key];
    const resolved = resolveEquippedSkinId(part.key, requestedSkinId, ownedSet);
    equippedByPart[part.key] = resolved;
  }

  return {
    ownedSkinIds: Array.from(ownedSet).sort(),
    equippedByPart
  };
}

export function getTreeSkin(skinId) {
  return SKIN_BY_ID.get(skinId) || null;
}

export function listTreeSkins() {
  return [...TREE_STYLE_SKINS];
}

export function listTreeSkinsForPart(part) {
  return TREE_STYLE_SKINS.filter((skin) => skin.part === part);
}

export function isTreeSkinOwned(styleState, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin) {
    return false;
  }
  if (skin.default) {
    return true;
  }
  return normalizeTreeStyleState(styleState).ownedSkinIds.includes(skinId);
}

export function getEquippedTreeSkinId(styleState, part) {
  return normalizeTreeStyleState(styleState).equippedByPart[part] || DEFAULT_EQUIPPED_SKINS[part];
}

export function getTreeBankedPointsByCategory(treeState) {
  const harvested = treeState?.harvestedByCategory && typeof treeState.harvestedByCategory === "object"
    ? treeState.harvestedByCategory
    : {};
  return Object.fromEntries(
    Object.entries(harvested).map(([key, value]) => [key, Math.max(0, Math.round(Number(value) || 0))])
  );
}

export function canAffordTreeSkin(treeState, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin || skin.default || !skin.cost) {
    return true;
  }
  const banked = getTreeBankedPointsByCategory(treeState);
  return (banked[skin.cost.categoryKey] || 0) >= skin.cost.points;
}

export function purchaseTreeSkin(treeState, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin) {
    return { changed: false, reason: "missing" };
  }
  const nextStyleState = normalizeTreeStyleState(treeState?.styleState);
  if (skin.default || isTreeSkinOwned(nextStyleState, skinId)) {
    return {
      changed: false,
      treeState,
      reason: "owned"
    };
  }
  if (!canAffordTreeSkin(treeState, skinId)) {
    return {
      changed: false,
      treeState,
      reason: "insufficient-points"
    };
  }

  const harvestedByCategory = { ...(treeState?.harvestedByCategory || {}) };
  harvestedByCategory[skin.cost.categoryKey] = Math.max(0, (harvestedByCategory[skin.cost.categoryKey] || 0) - skin.cost.points);
  nextStyleState.ownedSkinIds = [...nextStyleState.ownedSkinIds, skinId].sort();
  nextStyleState.equippedByPart[skin.part] = skinId;

  return {
    changed: true,
    treeState: {
      ...(treeState || {}),
      harvestedByCategory,
      styleState: nextStyleState
    },
    skin
  };
}

export function grantTreeSkin(treeState, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin || skin.default) {
    return { changed: false, treeState };
  }

  const nextStyleState = normalizeTreeStyleState(treeState?.styleState);
  if (!nextStyleState.ownedSkinIds.includes(skinId)) {
    nextStyleState.ownedSkinIds = [...nextStyleState.ownedSkinIds, skinId].sort();
  }

  return {
    changed: true,
    treeState: {
      ...(treeState || {}),
      styleState: nextStyleState
    },
    skin
  };
}

export function removeOwnedTreeSkin(treeState, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin || skin.default) {
    return { changed: false, treeState };
  }

  const nextStyleState = normalizeTreeStyleState(treeState?.styleState);
  if (!nextStyleState.ownedSkinIds.includes(skinId)) {
    return { changed: false, treeState };
  }

  nextStyleState.ownedSkinIds = nextStyleState.ownedSkinIds.filter((id) => id !== skinId);
  if (nextStyleState.equippedByPart[skin.part] === skinId) {
    nextStyleState.equippedByPart[skin.part] = DEFAULT_EQUIPPED_SKINS[skin.part];
  }

  return {
    changed: true,
    treeState: {
      ...(treeState || {}),
      styleState: nextStyleState
    },
    skin
  };
}

export function equipTreeSkin(treeState, part, skinId) {
  const skin = getTreeSkin(skinId);
  if (!skin || skin.part !== part || !isTreeSkinOwned(treeState?.styleState, skinId)) {
    return { changed: false, treeState };
  }

  const nextStyleState = normalizeTreeStyleState(treeState?.styleState);
  nextStyleState.equippedByPart[part] = skinId;

  return {
    changed: true,
    treeState: {
      ...(treeState || {}),
      styleState: nextStyleState
    },
    skin
  };
}

export function buildAppliedTreeAppearance(styleState, phase) {
  const normalized = normalizeTreeStyleState(styleState);
  const appearance = {
    treeImageSrc: DEFAULT_TREE_IMAGE,
    background: { ...(DEFAULT_BACKGROUND_PHASES[phase] || DEFAULT_BACKGROUND_PHASES.morning) },
    sunMoon: { ...(DEFAULT_SUN_MOON_PHASES[phase] || DEFAULT_SUN_MOON_PHASES.morning) },
    canopyDecoration: ""
  };

  for (const part of TREE_STYLE_PARTS) {
    const skin = getTreeSkin(normalized.equippedByPart[part.key]);
    if (!skin) {
      continue;
    }
    if (skin.treeImageSrc) {
      appearance.treeImageSrc = skin.treeImageSrc;
    }
    if (part.key === "canopy" && typeof skin.canopyDecoration === "string") {
      appearance.canopyDecoration = skin.canopyDecoration;
    }
    if (part.key === "background" && skin.phases?.[phase]) {
      appearance.background = { ...appearance.background, ...skin.phases[phase] };
    }
    if (part.key === "sunMoon" && skin.phases?.[phase]) {
      appearance.sunMoon = { ...appearance.sunMoon, ...skin.phases[phase] };
    }
  }

  return appearance;
}

export function buildTreeStyleCatalog(treeState) {
  const styleState = normalizeTreeStyleState(treeState?.styleState);
  const bankedPoints = getTreeBankedPointsByCategory(treeState);

  return TREE_STYLE_PARTS.map((part) => ({
    ...part,
    equippedSkinId: styleState.equippedByPart[part.key],
    skins: listTreeSkinsForPart(part.key).map((skin) => ({
      ...skin,
      owned: isTreeSkinOwned(styleState, skin.id),
      equipped: styleState.equippedByPart[part.key] === skin.id,
      affordable: canAffordTreeSkin(treeState, skin.id),
      bankedPoints: skin.cost ? (bankedPoints[skin.cost.categoryKey] || 0) : 0
    }))
  }));
}

export function listPurchasableTreeSkins() {
  return TREE_STYLE_SKINS.filter((skin) => !skin.default);
}

function resolveEquippedSkinId(part, requestedSkinId, ownedSet) {
  const requested = getTreeSkin(requestedSkinId);
  if (requested && requested.part === part && (requested.default || ownedSet.has(requested.id))) {
    return requested.id;
  }
  return DEFAULT_EQUIPPED_SKINS[part];
}

export function getTreeStylePartLabel(part) {
  return TREE_STYLE_PARTS.find((entry) => entry.key === part)?.label || part;
}

export { DEFAULT_TREE_IMAGE, TREE_PHASES };
