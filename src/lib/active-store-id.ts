/** sessionStorage: loja ativa no dashboard (multi-loja por conta). */
const STORAGE_KEY = "ltv-active-store-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPersistedActiveStoreId(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (!v || !UUID_RE.test(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function writePersistedActiveStoreId(id: string | null) {
  try {
    if (id && UUID_RE.test(id)) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / SSR */
  }
}

export function pickStoreIdFromList(
  ids: string[],
  hint: string | null | undefined,
): string | null {
  if (ids.length === 0) return null;
  if (hint && ids.includes(hint)) return hint;
  const p = readPersistedActiveStoreId();
  if (p && ids.includes(p)) return p;
  return ids[0] ?? null;
}
