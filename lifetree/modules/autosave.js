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

  function clearSchedule() {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
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
    try {
      const success = await saveToDrive({
        suppressAuthError: true,
        quiet: true
      });
      if (success) {
        lastSavedFingerprint = computeStoreFingerprint(getStore());
      }
      return success;
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
    timerId = window.setTimeout(runCycle, profile.autosaveIntervalMinutes * 60_000);
  }

  async function runCycle() {
    timerId = 0;
    try {
      await attemptAutosave();
    } finally {
      refreshSchedule();
    }
  }

  function dispose() {
    clearSchedule();
  }

  return {
    refreshSchedule,
    attemptAutosave,
    markCurrentAsSaved,
    clearSavedBaseline,
    dispose
  };
}
