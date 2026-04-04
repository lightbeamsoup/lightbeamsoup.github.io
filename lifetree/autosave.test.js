import test from "node:test";
import assert from "node:assert/strict";
import { createAutosaveController } from "./modules/autosave.js";

test("autosave skips Drive writes when the current fingerprint matches the saved baseline", async () => {
  let fingerprint = "same";
  let saveCalls = 0;

  const controller = createAutosaveController({
    getProfile: () => ({
      autosaveEnabled: true,
      autosaveIntervalMinutes: 5
    }),
    getStore: () => ({ id: "store" }),
    isAuthenticated: () => true,
    computeStoreFingerprint: () => fingerprint,
    saveToDrive: async () => {
      saveCalls += 1;
      return { success: true };
    },
    canAutosave: () => ({ allowed: true, reason: "" })
  });

  controller.markCurrentAsSaved();
  const result = await controller.attemptAutosave();

  assert.equal(saveCalls, 0);
  assert.equal(result?.success, true);
  assert.equal(result?.skipped, true);
  assert.equal(result?.noChanges, true);
});

test("autosave writes to Drive when the fingerprint changed after the saved baseline", async () => {
  let fingerprint = "baseline";
  let saveCalls = 0;

  const controller = createAutosaveController({
    getProfile: () => ({
      autosaveEnabled: true,
      autosaveIntervalMinutes: 5
    }),
    getStore: () => ({ id: "store" }),
    isAuthenticated: () => true,
    computeStoreFingerprint: () => fingerprint,
    saveToDrive: async () => {
      saveCalls += 1;
      return { success: true };
    },
    canAutosave: () => ({ allowed: true, reason: "" })
  });

  controller.markCurrentAsSaved();
  fingerprint = "changed";
  const result = await controller.attemptAutosave();

  assert.equal(saveCalls, 1);
  assert.equal(result?.success, true);
  assert.notEqual(result?.noChanges, true);
});
