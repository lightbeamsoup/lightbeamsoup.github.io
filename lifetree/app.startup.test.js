import test from "node:test";
import assert from "node:assert/strict";
import { installBrowserTestHarness } from "./testBrowserHarness.js";

test("app.js boot smoke test imports without top-level startup failures", async () => {
  const harness = installBrowserTestHarness();
  const unhandled = [];
  const handleUnhandledRejection = (reason) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", handleUnhandledRejection);
  try {
    await harness.importAppModule();
    await harness.flushAsync();
    assert.equal(unhandled.length, 0, `Unexpected startup rejection: ${String(unhandled[0])}`);
  } finally {
    process.removeListener("unhandledRejection", handleUnhandledRejection);
    harness.restore();
  }
});
