const PREFIX = "autolocal.pending-draft.";
const TTL = 30 * 60 * 1000;
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function savePendingDraft(
  storage: DraftStorage,
  id: string,
  draft: unknown,
  now = Date.now(),
) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("Invalid draft reference");
  storage.setItem(PREFIX + id, JSON.stringify({ draft, expiresAt: now + TTL }));
}
export function loadPendingDraft(
  storage: DraftStorage,
  id: string,
  now = Date.now(),
): unknown {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const item = JSON.parse(storage.getItem(PREFIX + id) || "null");
    if (!item || !Number.isFinite(item.expiresAt) || item.expiresAt <= now) {
      storage.removeItem(PREFIX + id);
      return null;
    }
    return item.draft;
  } catch {
    storage.removeItem(PREFIX + id);
    return null;
  }
}
export function clearPendingDraft(storage: DraftStorage, id: string) {
  if (/^[0-9a-f-]{36}$/i.test(id)) storage.removeItem(PREFIX + id);
}
