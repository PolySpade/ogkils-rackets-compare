// Suggested comparisons for a racket detail page (product.md §5).
import comparisonsFile from '../../data/comparisons.json';
import { catalog, getRacket } from './data';
import type { Racket } from './types';

interface Pair {
  a: string;
  b: string;
}
const pairs = (comparisonsFile as { pairs: Pair[] }).pairs;

/**
 * Up to `n` rackets worth comparing this one against: curated pairs first, then
 * same-classification neighbours, then anything to fill. Never includes the racket itself.
 */
export function suggestRelated(racket: Racket, n = 3): Racket[] {
  const picked: Racket[] = [];
  const seen = new Set<string>([racket.id]);

  const add = (id: string) => {
    if (seen.has(id) || picked.length >= n) return;
    const r = getRacket(id);
    if (r) {
      picked.push(r);
      seen.add(id);
    }
  };

  // 1. Curated versus pairs mentioning this racket.
  for (const p of pairs) {
    if (p.a === racket.id) add(p.b);
    else if (p.b === racket.id) add(p.a);
  }

  // 2. Same-classification neighbours.
  for (const r of catalog) {
    if (r.classification === racket.classification) add(r.id);
  }

  // 3. Fill from the rest of the lineup.
  for (const r of catalog) add(r.id);

  return picked;
}
