export function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? (trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed) : "";
}

export function resolveApiBase(configuredValue, locationObject = window.location) {
  const normalized = normalizeApiBase(configuredValue);
  if (normalized) {
    return normalized;
  }

  if (isLocalhostHost(locationObject.hostname)) {
    if (locationObject.hostname === "127.0.0.1" || locationObject.port !== "3000") {
      return `${locationObject.protocol}//localhost:3000`;
    }
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
  getKnownRemoteState,
  setStore,
  normalizeStore,
  mergeStores,
  finalizeStoreState,
  ensureWidgetIntegrity,
  ensureWidgetTasks,
  reconcileRecurringSeries,
  persistStore,
  renderAll,
  setSyncStatus,
  updateGoogleButtons,
  promptDriveConflictChoice,
  canAutoMergeDriveConflict,
  getReturnToTarget,
  describeMergeResult,
  computeStoreFingerprint,
  computeUserContentFingerprint
}) {
  function parseDriveModifiedTime(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  async function chooseDriveConflictResolution({
    operation = "load",
    localUserUpdatedAt = 0,
    remoteUserUpdatedAt = 0,
    strategy = "prompt"
  } = {}) {
    if (strategy === "keep-local") {
      return "keep-local";
    }
    if (strategy === "remote") {
      return "keep-drive";
    }
    if (strategy === "auto-merge") {
      return "auto-merge";
    }
    if (strategy === "prompt-if-remote-newer" && remoteUserUpdatedAt <= localUserUpdatedAt) {
      return "keep-local";
    }

    if (typeof promptDriveConflictChoice === "function") {
      return (await promptDriveConflictChoice({
        operation,
        localUserUpdatedAt,
        remoteUserUpdatedAt
      })) || "cancel";
    }

    return window.confirm("Local and Google Drive data differ. Press OK to auto-merge them, or Cancel to keep the Google Drive version.")
      ? "auto-merge"
      : "keep-drive";
  }

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

  async function ensureAuthenticated({ suppressUnavailableError = false, signal } = {}) {
    if (authState.authenticated) {
      return true;
    }
    return refreshAuthStatus({ suppressUnavailableError, signal });
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

  async function loadFromDrive({
    suppressAuthError = false,
    quietIfMissing = false,
    deferFinalize = false,
    signal,
    conflictStrategy = "prompt"
  } = {}) {
    const authenticated = await ensureAuthenticated({
      suppressUnavailableError: suppressAuthError,
      signal
    });
    if (!authenticated) {
      if (!suppressAuthError) {
        setSyncStatus("Connect Google first to load from Drive.", "error");
      }
      return {
        applied: false,
        found: false,
        keptLocalChanges: false,
        synced: false,
        remoteUpdatedAt: 0,
        remoteFingerprint: "",
        remoteSavedAt: 0,
        remoteUserUpdatedAt: 0,
        remoteUserFingerprint: ""
      };
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
        return {
          applied: false,
          found: false,
          keptLocalChanges: false,
          synced: false,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteSavedAt: 0,
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }

      const remoteStore = normalizeStore(payload.payload);
      remoteStore.driveFileId = payload.fileId || "";
      const remoteSavedAt = parseDriveModifiedTime(payload.modifiedTime);
      const previousLocalStore = getStore();
      const localFingerprint = computeStoreFingerprint(previousLocalStore);
      const remoteFingerprint = computeStoreFingerprint(remoteStore);
      const localUserFingerprint = previousLocalStore.userFingerprint || computeUserContentFingerprint(previousLocalStore);
      const remoteUserFingerprint = remoteStore.userFingerprint || computeUserContentFingerprint(remoteStore);
      const localUserUpdatedAt = previousLocalStore.userUpdatedAt || previousLocalStore.updatedAt || 0;
      const remoteUserUpdatedAt = remoteStore.userUpdatedAt || remoteStore.updatedAt || 0;

      if (localUserFingerprint !== remoteUserFingerprint) {
        const resolution = await chooseDriveConflictResolution({
          operation: "load",
          localUserUpdatedAt,
          remoteUserUpdatedAt,
          strategy: conflictStrategy
        });

        if (resolution === "cancel") {
          setSyncStatus("Cancelled Drive load. Local data is unchanged.", "info");
          return {
            applied: false,
            found: true,
            keptLocalChanges: true,
            cancelled: true,
            synced: localFingerprint === remoteFingerprint,
            remoteUpdatedAt: remoteStore.updatedAt || 0,
            remoteFingerprint,
            remoteSavedAt,
            remoteUserUpdatedAt,
            remoteUserFingerprint
          };
        }

        if (resolution === "auto-merge") {
          const mergedStore = mergeStores(previousLocalStore, remoteStore);
          applyStore(mergedStore, { finalize: !deferFinalize });
          setSyncStatus("Loaded Google Drive data and auto-merged it with local changes.", "success");
          return {
            applied: true,
            found: true,
            keptLocalChanges: true,
            synced: computeStoreFingerprint(mergedStore) === remoteFingerprint,
            remoteUpdatedAt: remoteStore.updatedAt || 0,
            remoteFingerprint,
            remoteSavedAt,
            remoteUserUpdatedAt,
            remoteUserFingerprint
          };
        }

        if (resolution === "keep-local") {
          setSyncStatus("Kept the local Lifetree data. Google Drive was not loaded.", "info");
          return {
            applied: false,
            found: true,
            keptLocalChanges: true,
            synced: false,
            remoteUpdatedAt: remoteStore.updatedAt || 0,
            remoteFingerprint,
            remoteSavedAt,
            remoteUserUpdatedAt,
            remoteUserFingerprint
          };
        }

        applyStore(remoteStore, { finalize: !deferFinalize });
        setSyncStatus("Loaded the Google Drive version and replaced local conflicting changes.", "success");
        return {
          applied: true,
          found: true,
          keptLocalChanges: false,
          synced: true,
          remoteUpdatedAt: remoteStore.updatedAt || 0,
          remoteFingerprint,
          remoteSavedAt,
          remoteUserUpdatedAt,
          remoteUserFingerprint
        };
      }

      const mergedStore = mergeStores(previousLocalStore, remoteStore);
      applyStore(mergedStore, { finalize: !deferFinalize });
      setSyncStatus(describeMergeResult(previousLocalStore, remoteStore), "success");
      return {
        applied: true,
        found: true,
        keptLocalChanges: false,
        synced: computeStoreFingerprint(mergedStore) === remoteFingerprint,
        remoteUpdatedAt: remoteStore.updatedAt || 0,
        remoteFingerprint,
        remoteSavedAt,
        remoteUserUpdatedAt,
        remoteUserFingerprint
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return {
          applied: false,
          found: false,
          keptLocalChanges: false,
          synced: false,
          timedOut: true,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteSavedAt: 0,
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }
      setSyncStatus(`Load failed: ${error.message}`, "error");
      return {
        applied: false,
        found: false,
        keptLocalChanges: false,
        synced: false,
        remoteUpdatedAt: 0,
        remoteFingerprint: "",
        remoteSavedAt: 0,
        remoteUserUpdatedAt: 0,
        remoteUserFingerprint: ""
      };
    }
  }

  async function peekRemoteStore({ suppressAuthError = true, signal } = {}) {
    const authenticated = await ensureAuthenticated({
      suppressUnavailableError: suppressAuthError,
      signal
    });
    if (!authenticated) {
      return {
        ok: false,
        found: false,
        authenticated: false,
        remoteUpdatedAt: 0,
        remoteFingerprint: "",
        remoteSavedAt: 0,
        remoteUserUpdatedAt: 0,
        remoteUserFingerprint: ""
      };
    }
    try {
      const response = await fetch(`${apiBase}/api/lifetree/load`, { credentials: fetchCredentials, signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Drive load failed");
      }
      if (!payload.found) {
        return {
          ok: true,
          found: false,
          authenticated: true,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteSavedAt: 0,
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }

      const remoteStore = normalizeStore(payload.payload);
      remoteStore.driveFileId = payload.fileId || "";
      return {
        ok: true,
        found: true,
        authenticated: true,
        remoteUpdatedAt: remoteStore.updatedAt || 0,
        remoteFingerprint: computeStoreFingerprint(remoteStore),
        remoteSavedAt: parseDriveModifiedTime(payload.modifiedTime),
        remoteUserUpdatedAt: remoteStore.userUpdatedAt || remoteStore.updatedAt || 0,
        remoteUserFingerprint: remoteStore.userFingerprint || computeUserContentFingerprint(remoteStore)
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return {
          ok: false,
          found: false,
          authenticated: true,
          aborted: true,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteSavedAt: 0,
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }
      return {
        ok: false,
        found: false,
        authenticated: true,
        error: error.message,
        remoteUpdatedAt: 0,
        remoteFingerprint: "",
        remoteSavedAt: 0,
        remoteUserUpdatedAt: 0,
        remoteUserFingerprint: ""
      };
    }
  }

  async function saveToDrive({
    suppressAuthError = false,
    quiet = false,
    signal,
    force = false,
    conflictStrategy = quiet ? "auto-merge" : "prompt-if-auto-merge-fails"
  } = {}) {
    const authenticated = await ensureAuthenticated({
      suppressUnavailableError: suppressAuthError || quiet,
      signal
    });
    if (!authenticated) {
      if (!suppressAuthError) {
        setSyncStatus("Connect Google first to save to Drive.", "error");
      }
      return { success: false, remoteUpdatedAt: 0, remoteFingerprint: "", remoteSavedAt: 0 };
    }
    try {
      let currentStore = getStore();
      let saveOutcome = "plain-save";
      const currentFingerprint = computeStoreFingerprint(currentStore);
      const knownRemoteState = typeof getKnownRemoteState === "function" ? getKnownRemoteState() : {};
      const knownRemoteFingerprint = knownRemoteState?.remoteFingerprint || "";
      const knownRemoteUpdatedAt = knownRemoteState?.remoteUpdatedAt || 0;
      const knownRemoteSavedAt = knownRemoteState?.remoteSavedAt || 0;
      const knownRemoteUserUpdatedAt = knownRemoteState?.remoteUserUpdatedAt || 0;
      const knownRemoteUserFingerprint = knownRemoteState?.remoteUserFingerprint || "";

      if (!force && knownRemoteFingerprint && currentFingerprint === knownRemoteFingerprint) {
        if (!quiet) {
          setSyncStatus("Google Drive is already up to date.", "info");
        }
        return {
          success: true,
          skipped: true,
          remoteUpdatedAt: knownRemoteUpdatedAt || currentStore.updatedAt || 0,
          remoteFingerprint: knownRemoteFingerprint,
          remoteSavedAt: knownRemoteSavedAt || knownRemoteUpdatedAt || currentStore.updatedAt || 0,
          remoteUserUpdatedAt: knownRemoteUserUpdatedAt || currentStore.userUpdatedAt || currentStore.updatedAt || 0,
          remoteUserFingerprint: knownRemoteUserFingerprint || currentStore.userFingerprint || computeUserContentFingerprint(currentStore)
        };
      }

      const remoteResponse = await fetch(`${apiBase}/api/lifetree/load`, { credentials: fetchCredentials, signal });
      const remotePayload = await remoteResponse.json();
      let preferredFileId = currentStore.driveFileId || "";
      if (remoteResponse.ok && remotePayload.found) {
        const remoteStore = normalizeStore(remotePayload.payload);
        remoteStore.driveFileId = remotePayload.fileId || "";
        preferredFileId = remotePayload.fileId || preferredFileId;
        const latestLocalStore = getStore();
        const localUserFingerprint = latestLocalStore.userFingerprint || computeUserContentFingerprint(latestLocalStore);
        const remoteUserFingerprint = remoteStore.userFingerprint || computeUserContentFingerprint(remoteStore);
        const localUserUpdatedAt = latestLocalStore.userUpdatedAt || latestLocalStore.updatedAt || 0;
        const remoteUserUpdatedAt = remoteStore.userUpdatedAt || remoteStore.updatedAt || 0;

        if (localUserFingerprint !== remoteUserFingerprint) {
          const effectiveConflictStrategy = conflictStrategy === "prompt-if-auto-merge-fails"
            ? (typeof canAutoMergeDriveConflict === "function" && canAutoMergeDriveConflict(latestLocalStore, remoteStore)
                ? "auto-merge"
                : "prompt")
            : conflictStrategy;
          const resolution = await chooseDriveConflictResolution({
            operation: "save",
            localUserUpdatedAt,
            remoteUserUpdatedAt,
            strategy: effectiveConflictStrategy
          });

          if (resolution === "cancel") {
            if (!quiet) {
              setSyncStatus("Cancelled Drive save. Nothing was changed.", "info");
            }
            return {
              success: false,
              skipped: true,
              cancelled: true,
              remoteUpdatedAt: remoteStore.updatedAt || 0,
              remoteFingerprint: computeStoreFingerprint(remoteStore),
              remoteSavedAt: parseDriveModifiedTime(remotePayload.modifiedTime) || 0,
              remoteUserUpdatedAt,
              remoteUserFingerprint
            };
          }

          if (resolution === "keep-drive") {
            applyStore(remoteStore);
            if (!quiet) {
              setSyncStatus("Kept the Google Drive version and replaced local conflicting changes.", "success");
            }
            return {
              success: true,
              skipped: true,
              remoteUpdatedAt: remoteStore.updatedAt || 0,
              remoteFingerprint: computeStoreFingerprint(remoteStore),
              remoteSavedAt: parseDriveModifiedTime(remotePayload.modifiedTime) || Date.now(),
              remoteUserUpdatedAt,
              remoteUserFingerprint
            };
          }

          if (resolution === "auto-merge") {
            applyStore(mergeStores(latestLocalStore, remoteStore));
            currentStore = getStore();
            saveOutcome = "auto-merge";
          } else {
            currentStore = latestLocalStore;
            saveOutcome = "keep-local";
          }
        } else {
          applyStore(mergeStores(latestLocalStore, remoteStore));
          currentStore = getStore();
          saveOutcome = "auto-merge";
        }
      }

      const saveResponse = await fetch(`${apiBase}/api/lifetree/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: fetchCredentials,
        signal,
        body: JSON.stringify({
          fileId: preferredFileId || getStore().driveFileId || "",
          payload: getStore()
        })
      });
      const savePayload = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(savePayload.error || "Drive save failed");
      }

      if (savePayload.fileId) {
        const nextStore = getStore();
        nextStore.driveFileId = savePayload.fileId;
        persistStore({ touchUpdatedAt: false, touchUserUpdatedAt: false });
      }

      const savedStore = getStore();
      const remoteUpdatedAt = savedStore.updatedAt || 0;
      const remoteFingerprint = computeStoreFingerprint(savedStore);
      const remoteSavedAt = parseDriveModifiedTime(savePayload.modifiedTime) || Date.now();
      const remoteUserUpdatedAt = savedStore.userUpdatedAt || savedStore.updatedAt || 0;
      const remoteUserFingerprint = savedStore.userFingerprint || computeUserContentFingerprint(savedStore);

      if (!quiet) {
        const successMessage = saveOutcome === "keep-local"
          ? "Saved this browser's version to Google Drive."
          : saveOutcome === "auto-merge"
            ? "Auto-merged local and Drive changes where possible, then saved the result to Google Drive."
            : "Saved the Lifetree data to Google Drive app data.";
        setSyncStatus(successMessage, "success");
      }
      return { success: true, remoteUpdatedAt, remoteFingerprint, remoteSavedAt, remoteUserUpdatedAt, remoteUserFingerprint };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { success: false, remoteUpdatedAt: 0, remoteFingerprint: "", remoteSavedAt: 0, remoteUserUpdatedAt: 0, remoteUserFingerprint: "" };
      }
      if (!quiet) {
        setSyncStatus(`Save failed: ${error.message}`, "error");
      }
      return { success: false, remoteUpdatedAt: 0, remoteFingerprint: "", remoteSavedAt: 0, remoteUserUpdatedAt: 0, remoteUserFingerprint: "" };
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
        signal: controller.signal,
        conflictStrategy: "prompt-if-remote-newer"
      });
      if (controller.signal.aborted || result.timedOut) {
        return {
          loaded: false,
          timedOut: true,
          keptLocalChanges: false,
          synced: false,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }
      return {
        loaded: result.applied,
        timedOut: false,
        keptLocalChanges: result.keptLocalChanges,
        synced: result.synced,
        remoteUpdatedAt: result.remoteUpdatedAt || 0,
        remoteFingerprint: result.remoteFingerprint || "",
        remoteSavedAt: result.remoteSavedAt || 0,
        remoteUserUpdatedAt: result.remoteUserUpdatedAt || 0,
        remoteUserFingerprint: result.remoteUserFingerprint || ""
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return {
          loaded: false,
          timedOut: true,
          keptLocalChanges: false,
          synced: false,
          remoteUpdatedAt: 0,
          remoteFingerprint: "",
          remoteSavedAt: 0,
          remoteUserUpdatedAt: 0,
          remoteUserFingerprint: ""
        };
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function saveToDriveOnExit() {
    // Intentionally disabled. A blind keepalive write during pagehide can overwrite
    // newer Drive data from another session because it cannot safely re-fetch and
    // reconcile remote state before the page closes.
  }

  function applyStore(nextStore, { finalize = true } = {}) {
    setStore(nextStore);
    if (!finalize) {
      return;
    }
    if (typeof finalizeStoreState === "function") {
      finalizeStoreState();
    } else {
      ensureWidgetIntegrity();
      ensureWidgetTasks();
      reconcileRecurringSeries();
    }
    persistStore({ touchUserUpdatedAt: false });
    renderAll();
  }

  return {
    refreshAuthStatus,
    connectGoogle,
    disconnectGoogle,
    loadFromDrive,
    peekRemoteStore,
    saveToDrive,
    initializeFromDrive,
    saveToDriveOnExit
  };
}

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
