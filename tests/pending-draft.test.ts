import test from "node:test";
import assert from "node:assert/strict";
import {
  savePendingDraft,
  loadPendingDraft,
  clearPendingDraft,
} from "../src/lib/pending-draft";
import { safeReturnPath } from "../src/lib/safe-return-path";
test("pending onboarding survives a new tab and expires after thirty minutes", () => {
  const items = new Map<string, string>(),
    store = {
      getItem: (key: string) => items.get(key) || null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
    };
  const id = "00000000-0000-4000-8000-000000000001",
    draft = { businessName: "A local business", _step: 3 };
  savePendingDraft(store, id, draft, 1000);
  assert.deepEqual(loadPendingDraft(store, id, 2000), draft);
  assert.equal(loadPendingDraft(store, id, 1801000), null);
  assert.equal(items.size, 0);
  savePendingDraft(store, id, draft);
  clearPendingDraft(store, id);
  assert.equal(items.size, 0);
});
test("return paths preserve the draft reference but reject external redirects", () => {
  assert.equal(safeReturnPath("/start?draft=example"), "/start?draft=example");
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\n/evil.test",
  ])
    assert.equal(safeReturnPath(value), "/dashboard");
});
