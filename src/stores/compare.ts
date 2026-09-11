// Shared compare selection (product.md §6). One nanostore, imported by the vanilla
// add-to-compare controls, the floating CompareBar island, and the CompareTray — so a
// click on any card updates all of them. Persists to sessionStorage and survives
// navigation; the /compare page also mirrors it to the ?ids= query for shareable links.
import { atom } from 'nanostores';

export const MAX_COMPARE = 4;
const KEY = 'ogkils:compare';

export const compareIds = atom<string[]>([]);

if (typeof window !== 'undefined') {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) compareIds.set(saved.slice(0, MAX_COMPARE));
  } catch {
    /* ignore malformed storage */
  }
  compareIds.subscribe((ids) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* storage may be unavailable */
    }
  });
}

export function toggleCompare(id: string): void {
  const cur = compareIds.get();
  if (cur.includes(id)) compareIds.set(cur.filter((x) => x !== id));
  else if (cur.length < MAX_COMPARE) compareIds.set([...cur, id]);
}

export function removeCompare(id: string): void {
  compareIds.set(compareIds.get().filter((x) => x !== id));
}

export function clearCompare(): void {
  compareIds.set([]);
}

/** Replace the whole selection (used when loading /compare?ids=…). */
export function setCompare(ids: string[]): void {
  const seen = new Set<string>();
  const unique = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  compareIds.set(unique.slice(0, MAX_COMPARE));
}
