// Catalogue text search, shared by the header search overlay and the /rackets filter box.
//
// Deliberately dependency-free: FilterBar ships `client:load` on the browse page, so
// anything it imports lands in the eager bundle. With ~20 rackets a scored prefix pass
// plus a bounded edit-distance fallback beats pulling Fuse.js (~7KB gz) into that path,
// and it keeps ranking predictable — "fire" always puts Fire Breathing first.
//
// Lower scores rank higher. Every query token must match something on the record, so
// "fire 4u" narrows rather than widens.

import type { Racket } from './types';

/** The minimal racket shape the search surfaces need — see /search-index.json. */
export interface SearchRecord {
  id: string;
  name: string;
  modelCode: string;
  series: string;
  classification: string;
  balance: string;
  /** Weight classes offered, e.g. ["4U", "5U"]. */
  weights: string[];
  aliases: string[];
  pricePhp: number | null;
}

export function toSearchRecord(r: Racket): SearchRecord {
  return {
    id: r.id,
    name: r.name,
    modelCode: r.modelCode,
    series: r.series,
    classification: r.classification,
    balance: r.balance,
    weights: [...new Set(r.variants.map((v) => v.weightClass))],
    aliases: r.aliases,
    pricePhp: r.pricePhp,
  };
}

/** Lowercased words, punctuation stripped. "Head-Heavy!" → ["head", "heavy"]. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * True when every query token appears as a word prefix in `haystack`. This is the
 * narrowing rule the browse-page filter uses against each card's `data-search`.
 */
export function matchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const words = tokenize(haystack);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

/** Every string on a record worth matching against, with a rank weight. */
function fieldsOf(rec: SearchRecord): { text: string; weight: number }[] {
  return [
    { text: rec.name, weight: 0 },
    { text: rec.modelCode, weight: 1 },
    ...rec.aliases.map((a) => ({ text: a, weight: 2 })),
    { text: rec.classification, weight: 4 },
    { text: rec.series, weight: 4 },
    { text: rec.balance, weight: 4 },
    ...rec.weights.map((w) => ({ text: w, weight: 4 })),
  ];
}

/** Best (lowest) score for one token against one field, or null when it doesn't match. */
function fieldScore(text: string, token: string, weight: number): number | null {
  const lower = text.toLowerCase();
  if (lower.startsWith(token)) return weight;
  const words = tokenize(text);
  if (words.some((w) => w.startsWith(token))) return weight + 0.5;
  if (lower.includes(token)) return weight + 1;
  return null;
}

function tokenScore(rec: SearchRecord, token: string): number | null {
  let best: number | null = null;
  for (const f of fieldsOf(rec)) {
    const s = fieldScore(f.text, token, f.weight);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

/** Levenshtein distance, abandoned as soon as it is certain to exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** Typos only get a second chance on longer tokens, and only against name-ish fields. */
function fuzzyScore(rec: SearchRecord, token: string): number | null {
  if (token.length < 4) return null;
  const max = token.length <= 5 ? 1 : 2;
  const candidates = [rec.name, rec.modelCode, ...rec.aliases].flatMap((t) => [
    t.toLowerCase(),
    ...tokenize(t),
  ]);
  let best: number | null = null;
  for (const c of candidates) {
    if (c.length < 3) continue;
    const d = editDistance(token, c, max);
    if (d <= max && (best === null || d < best)) best = d;
  }
  return best === null ? null : 8 + best;
}

export interface SearchHit {
  record: SearchRecord;
  score: number;
}

/**
 * Rank `index` against `query`. Exact/prefix matches come first; a typo-tolerant pass
 * runs only when the strict pass finds nothing, so "thundr" still reaches Thunder
 * Breathing without polluting clean queries.
 */
export function searchRackets(query: string, index: SearchRecord[], limit = 8): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const rank = (scorer: (rec: SearchRecord, token: string) => number | null): SearchHit[] => {
    const hits: SearchHit[] = [];
    for (const record of index) {
      let score = 0;
      let matched = true;
      for (const token of tokens) {
        const s = scorer(record, token);
        if (s === null) {
          matched = false;
          break;
        }
        score += s;
      }
      if (matched) hits.push({ record, score });
    }
    return hits.sort((a, b) => a.score - b.score || a.record.name.localeCompare(b.record.name));
  };

  const strict = rank(tokenScore);
  const hits = strict.length
    ? strict
    : rank((rec, token) => tokenScore(rec, token) ?? fuzzyScore(rec, token));
  return hits.slice(0, limit);
}
