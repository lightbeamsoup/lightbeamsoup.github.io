export const DEFAULT_AUTOSAVE_ENABLED = true;
export const DEFAULT_AUTOSAVE_INTERVAL_MINUTES = 5;
export const MIN_AUTOSAVE_INTERVAL_MINUTES = 1;
export const MAX_AUTOSAVE_INTERVAL_MINUTES = 120;
export const DEFAULT_DARK_MODE_ENABLED = false;
export const DEFAULT_AUTO_DARK_MODE_ENABLED = false;
export const DEFAULT_AUTO_DARK_MODE_START = "21:00";
export const DEFAULT_AUTO_DARK_MODE_END = "07:00";

export function normalizeProfile(value) {
  const autoDarkModeEnabled = value?.autoDarkModeEnabled === true;
  return {
    displayName: typeof value?.displayName === "string" ? value.displayName.trim().slice(0, 40) : "",
    autosaveEnabled: value?.autosaveEnabled !== false,
    autosaveIntervalMinutes: normalizeAutosaveIntervalMinutes(value?.autosaveIntervalMinutes),
    darkModeEnabled: !autoDarkModeEnabled && value?.darkModeEnabled === true,
    autoDarkModeEnabled,
    autoDarkModeStart: normalizeThemeTime(value?.autoDarkModeStart, DEFAULT_AUTO_DARK_MODE_START),
    autoDarkModeEnd: normalizeThemeTime(value?.autoDarkModeEnd, DEFAULT_AUTO_DARK_MODE_END),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  };
}

export function choosePreferredProfile(localProfile, remoteProfile) {
  const local = normalizeProfile(localProfile);
  const remote = normalizeProfile(remoteProfile);
  return (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
}

export function normalizeAutosaveIntervalMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUTOSAVE_INTERVAL_MINUTES;
  }
  return Math.max(
    MIN_AUTOSAVE_INTERVAL_MINUTES,
    Math.min(MAX_AUTOSAVE_INTERVAL_MINUTES, Math.round(parsed))
  );
}

export function normalizeThemeTime(value, fallback = DEFAULT_AUTO_DARK_MODE_START) {
  const candidate = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : fallback;
}

export function isDarkModeActive(profile, now = new Date()) {
  const normalized = normalizeProfile(profile);
  if (normalized.darkModeEnabled) {
    return true;
  }
  if (!normalized.autoDarkModeEnabled) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeStringToMinutes(normalized.autoDarkModeStart);
  const endMinutes = timeStringToMinutes(normalized.autoDarkModeEnd);

  if (startMinutes === endMinutes) {
    return true;
  }
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function timeStringToMinutes(value) {
  const [hours, minutes] = normalizeThemeTime(value).split(":").map((part) => Number(part));
  return (hours * 60) + minutes;
}
