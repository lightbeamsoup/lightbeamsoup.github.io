import test from "node:test";
import assert from "node:assert/strict";
import { createDriveSyncController } from "./modules/driveSync.js";

test("quiet Drive save refuses to overwrite a newer remote store revision", async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  let store = {
    updatedAt: 100,
    userUpdatedAt: 100,
    driveFileId: "drive-file",
    fp: "local-fingerprint",
    ufp: "local-user-fingerprint"
  };

  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).endsWith("/api/lifetree/load")) {
      return {
        ok: true,
        json: async () => ({
          found: true,
          fileId: "drive-file",
          modifiedTime: "2026-04-05T04:29:22.679Z",
          payload: {
            updatedAt: 110,
            userUpdatedAt: 110,
            driveFileId: "drive-file",
            fp: "remote-fingerprint-new",
            ufp: "remote-user-fingerprint-new"
          }
        })
      };
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  };

  try {
    const controller = createDriveSyncController({
      apiBase: "http://example.test",
      fetchCredentials: "include",
      authState: {
        authenticated: true,
        user: { email: "dev@example.com" }
      },
      getStore: () => store,
      getKnownRemoteState: () => ({
        remoteFingerprint: "remote-fingerprint-old",
        remoteUpdatedAt: 90,
        remoteSavedAt: 90,
        remoteUserUpdatedAt: 90,
        remoteUserFingerprint: "remote-user-fingerprint-old"
      }),
      setStore: (nextStore) => {
        store = nextStore;
      },
      normalizeStore: (value) => value,
      mergeStores: (local, remote) => ({ ...local, ...remote }),
      finalizeStoreState: () => {},
      ensureWidgetIntegrity: () => {},
      ensureWidgetTasks: () => {},
      reconcileRecurringSeries: () => {},
      persistStore: () => {},
      renderAll: () => {},
      setSyncStatus: () => {},
      updateGoogleButtons: () => {},
      promptDriveConflictChoice: async () => "keep-local",
      canAutoMergeDriveConflict: () => true,
      getReturnToTarget: () => "/lifetree/",
      describeMergeResult: () => "",
      computeStoreFingerprint: (value) => value?.fp || "",
      computeUserContentFingerprint: (value) => value?.ufp || ""
    });

    const result = await controller.saveToDrive({
      quiet: true,
      force: true
    });

    assert.equal(result?.success, false);
    assert.equal(result?.staleRemote, true);
    assert.equal(result?.remoteChanged, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0], "http://example.test/api/lifetree/load");
  } finally {
    global.fetch = originalFetch;
  }
});
