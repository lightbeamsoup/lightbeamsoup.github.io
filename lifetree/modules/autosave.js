import { normalizeProfile } from "./profile.js";

export function createAutosaveController({
  getProfile,
  getStore,
  isAuthenticated,
  computeStoreFingerprint,
  saveToDrive
}) {
  let timerId = 0;
  let inFlight = false;
  let lastSavedFingerprint = "";
  let nextRunAt = 0;

  function clearSchedule() {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
    nextRunAt = 0;
  }

  function markCurrentAsSaved() {
    lastSavedFingerprint = computeStoreFingerprint(getStore());
  }

  function clearSavedBaseline() {
    lastSavedFingerprint = "";
  }

  async function attemptAutosave() {
    const profile = normalizeProfile(getProfile());
    if (!profile.autosaveEnabled || !isAuthenticated() || inFlight) {
      return false;
    }

    const currentFingerprint = computeStoreFingerprint(getStore());
    if (currentFingerprint === lastSavedFingerprint) {
      return false;
    }

    inFlight = true;
    nextRunAt = 0;
    try {
      const result = await saveToDrive({
        suppressAuthError: true,
        quiet: true
      });
      const success = typeof result === "object" ? Boolean(result?.success) : Boolean(result);
      if (success) {
        lastSavedFingerprint = computeStoreFingerprint(getStore());
      }
      return typeof result === "object" ? result : { success };
    } finally {
      inFlight = false;
    }
  }

  function refreshSchedule() {
    clearSchedule();
    const profile = normalizeProfile(getProfile());
    if (!profile.autosaveEnabled) {
      return;
    }
    nextRunAt = Date.now() + (profile.autosaveIntervalMinutes * 60_000);
    timerId = window.setTimeout(runCycle, profile.autosaveIntervalMinutes * 60_000);
  }

  async function runCycle() {
    timerId = 0;
    nextRunAt = 0;
    try {
      await attemptAutosave();
    } finally {
      refreshSchedule();
    }
  }

  function dispose() {
    clearSchedule();
  }

  function getStatus() {
    const profile = normalizeProfile(getProfile());
    return {
      enabled: profile.autosaveEnabled,
      intervalMinutes: profile.autosaveIntervalMinutes,
      nextRunAt,
      inFlight,
      authenticated: isAuthenticated(),
      hasSavedBaseline: Boolean(lastSavedFingerprint)
    };
  }

  return {
    refreshSchedule,
    attemptAutosave,
    markCurrentAsSaved,
    clearSavedBaseline,
    getStatus,
    dispose
  };
}
