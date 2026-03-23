export function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? (trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed) : "";
}

export function resolveApiBase(configuredValue, locationObject = window.location) {
  const normalized = normalizeApiBase(configuredValue);
  if (normalized) {
    return normalized;
  }

  if (isLocalhostHost(locationObject.hostname) && locationObject.port !== "3000") {
    return `${locationObject.protocol}//${locationObject.hostname}:3000`;
  }

  return "";
}

export function describeBackendUnavailable(apiBase, locationObject = window.location) {
  if (apiBase && apiBase !== locationObject.origin) {
    return `Backend not reachable at ${apiBase}. Start the Lifetree server there, then reload this page.`;
  }

  if (isLocalhostHost(locationObject.hostname)) {
    return "Backend not reachable. If the Lifetree server is running on localhost:3000, open http://localhost:3000/lifetree/ or let this page connect to that backend.";
  }

  return "Backend not reachable. Start the Lifetree server to enable Google Drive sync.";
}

export function createDriveSyncController({
  apiBase,
  fetchCredentials,
  authState,
  getStore,
  setStore,
  normalizeStore,
  mergeStores,
  ensureWidgetIntegrity,
  ensureWidgetTasks,
  reconcileRecurringSeries,
  persistStore,
  renderAll,
  setSyncStatus,
  updateGoogleButtons,
  getReturnToTarget,
  describeMergeResult,
  computeStoreFingerprint
}) {
  async function refreshAuthStatus({ suppressUnavailableError = false, signal } = {}) {
    try {
      const response = await fetch(`${apiBase}/api/auth/status`, { credentials: fetchCredentials, signal });
      const payload = await response.json();
      authState.authenticated = Boolean(payload.authenticated);
      authState.user = payload.user || null;
      setSyncStatus(
        authState.authenticated && authState.user?.email
          ? `Connected as ${authState.user.email}.`
          : "Local-only mode. Configure the Lifetree backend to enable Google Drive sync.",
        authState.authenticated ? "success" : "info"
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        return authState.authenticated;
      }
      authState.authenticated = false;
      authState.user = null;
      setSyncStatus(describeBackendUnavailable(apiBase), suppressUnavailableError ? "info" : "error");
    }
    updateGoogleButtons();
    return authState.authenticated;
  }

  function connectGoogle() {
    const returnTo = encodeURIComponent(getReturnToTarget());
    window.location.href = `${apiBase}/api/auth/google/start?returnTo=${returnTo}`;
  }

  async function disconnectGoogle() {
    try {
      await fetch(`${apiBase}/api/auth/logout`, { method: "POST", credentials: fetchCredentials });
    } catch {}
    authState.authenticated = false;
    authState.user = null;
    updateGoogleButtons();
    setSyncStatus("Disconnected. Local cache remains on this device.", "info");
  }

  async function loadFromDrive({ suppressAuthError = false, quietIfMissing = false, deferFinalize = false, signal } = {}) {
    if (!authState.authenticated) {
      if (!suppressAuthError) {
        setSyncStatus("Connect Google first to load from Drive.", "error");
      }
      return { applied: false, found: false };
    }
    try {
      const response = await fetch(`${apiBase}/api/lifetree/load`, { credentials: fetchCredentials, signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Drive load failed");
      }
      if (!payload.found) {
        if (!quietIfMissing) {
          setSyncStatus("No Drive task file found yet. Save to Drive to create it.", "info");
        }
        return { applied: false, found: false };
      }

      const remoteStore = normalizeStore(payload.payload);
      remoteStore.driveFileId = payload.fileId || "";
      const previousLocalStore = getStore();
      const localFingerprint = computeStoreFingerprint(previousLocalStore);
      const remoteFingerprint = computeStoreFingerprint(remoteStore);

      if (localFingerprint !== remoteFingerprint && (previousLocalStore.updatedAt || 0) > (remoteStore.updatedAt || 0)) {
        const keepLocalChanges = window.confirm(
          "This browser has newer local changes than Google Drive. Press OK to keep and merge your newer local changes, or Cancel to discard them and load Google Drive exactly as stored."
        );

        if (keepLocalChanges) {
          applyStore(mergeStores(previousLocalStore, remoteStore), { finalize: !deferFinalize });
          setSyncStatus("Loaded Google Drive data and kept newer local changes during merge.", "success");
          return { applied: true, found: true };
        }

        applyStore(remoteStore, { finalize: !deferFinalize });
        setSyncStatus("Discarded newer local changes and loaded the Google Drive version.", "success");
        return { applied: true, found: true };
      }

      applyStore(mergeStores(previousLocalStore, remoteStore), { finalize: !deferFinalize });
      setSyncStatus(describeMergeResult(previousLocalStore, remoteStore), "success");
      return { applied: true, found: true };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { applied: false, found: false, timedOut: true };
      }
      setSyncStatus(`Load failed: ${error.message}`, "error");
      return { applied: false, found: false };
    }
  }

  async function saveToDrive({ suppressAuthError = false, quiet = false, signal } = {}) {
    if (!authState.authenticated) {
      if (!suppressAuthError) {
        setSyncStatus("Connect Google first to save to Drive.", "error");
      }
      return false;
    }
    try {
      const remoteResponse = await fetch(`${apiBase}/api/lifetree/load`, { credentials: fetchCredentials, signal });
      const remotePayload = await remoteResponse.json();
      if (remoteResponse.ok && remotePayload.found) {
        const remoteStore = normalizeStore(remotePayload.payload);
        remoteStore.driveFileId = remotePayload.fileId || "";
        applyStore(mergeStores(getStore(), remoteStore));
      }

      const saveResponse = await fetch(`${apiBase}/api/lifetree/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: fetchCredentials,
        signal,
        body: JSON.stringify({ payload: getStore() })
      });
      const savePayload = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(savePayload.error || "Drive save failed");
      }

      if (savePayload.fileId) {
        const nextStore = getStore();
        nextStore.driveFileId = savePayload.fileId;
        persistStore({ touchUpdatedAt: false });
      }

      if (!quiet) {
        setSyncStatus("Merged local and remote changes, then saved the Lifetree data to Google Drive app data.", "success");
      }
      return true;
    } catch (error) {
      if (error?.name === "AbortError") {
        return false;
      }
      if (!quiet) {
        setSyncStatus(`Save failed: ${error.message}`, "error");
      }
      return false;
    }
  }

  async function initializeFromDrive({ timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const authenticated = await refreshAuthStatus({
        suppressUnavailableError: true,
        signal: controller.signal
      });
      if (controller.signal.aborted) {
        return { loaded: false, timedOut: true };
      }
      if (!authenticated) {
        return { loaded: false, timedOut: false };
      }
      const result = await loadFromDrive({
        suppressAuthError: true,
        quietIfMissing: true,
        deferFinalize: true,
        signal: controller.signal
      });
      if (controller.signal.aborted || result.timedOut) {
        return { loaded: false, timedOut: true };
      }
      return { loaded: result.applied, timedOut: false };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { loaded: false, timedOut: true };
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function saveToDriveOnExit() {
    if (!authState.authenticated) {
      return;
    }

    fetch(`${apiBase}/api/lifetree/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: fetchCredentials,
      keepalive: true,
      body: JSON.stringify({ payload: getStore() })
    }).catch(() => {});
  }

  function applyStore(nextStore, { finalize = true } = {}) {
    setStore(nextStore);
    if (!finalize) {
      return;
    }
    ensureWidgetIntegrity();
    ensureWidgetTasks();
    reconcileRecurringSeries();
    persistStore();
    renderAll();
  }

  return {
    refreshAuthStatus,
    connectGoogle,
    disconnectGoogle,
    loadFromDrive,
    saveToDrive,
    initializeFromDrive,
    saveToDriveOnExit
  };
}

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
