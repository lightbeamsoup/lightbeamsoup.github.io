export const DEFAULT_AUTOSAVE_ENABLED = true;
export const DEFAULT_AUTOSAVE_INTERVAL_MINUTES = 5;
export const MIN_AUTOSAVE_INTERVAL_MINUTES = 1;
export const MAX_AUTOSAVE_INTERVAL_MINUTES = 120;

export function normalizeProfile(value) {
  return {
    displayName: typeof value?.displayName === "string" ? value.displayName.trim().slice(0, 40) : "",
    autosaveEnabled: value?.autosaveEnabled !== false,
    autosaveIntervalMinutes: normalizeAutosaveIntervalMinutes(value?.autosaveIntervalMinutes),
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
