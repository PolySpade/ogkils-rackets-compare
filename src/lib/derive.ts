// Derived facts computed once from raw specs. Never hardcode these per racket.
// See product.md §4.3 (derived buckets) and §7 (recommendation inputs).

import type {
  BalanceBucket,
  Derived,
  GeneratedRacket,
  StiffnessWord,
  Variant,
  WeightClass,
} from './types';

/** Balance point (mm) → bucket. Numeric point is authoritative over the label (§4.3). */
export function balanceBucket(balancePointMm: number): BalanceBucket {
  if (balancePointMm <= 295) return 'Head-Light';
  if (balancePointMm >= 302) return 'Head-Heavy';
  return 'Even';
}

const STIFFNESS_ORDINAL: Record<StiffnessWord, number> = {
  'Slightly Soft': 1,
  Medium: 2,
  'Slightly Stiff': 3,
  Stiff: 4,
};

/** Word → 1..4 ordinal. Unknown words fall back to Medium (2) rather than throwing. */
export function stiffnessOrdinal(word: string): number {
  return STIFFNESS_ORDINAL[word as StiffnessWord] ?? 2;
}

const WEIGHT_ORDINAL: Record<WeightClass, number> = {
  '6U': 1,
  '5U': 2,
  '4U': 3,
  '3U': 4,
};

/** Weight class → ordinal (lightest 1 … heaviest 4). */
export function weightOrdinal(weightClass: WeightClass): number {
  return WEIGHT_ORDINAL[weightClass];
}

/**
 * True when the human stiffness word disagrees with the numeric range, e.g. Mist
 * Breathing (word "Medium", raw "8.2-8.5 (Stiff)"). The UI shows the numeric range as
 * primary and the word as a quiet label, and never both when they disagree (§4.3).
 */
export function stiffnessWordConflict(raw: string | null, word: string): boolean {
  if (!raw) return false;
  const m = raw.match(/\(([^)]+)\)/);
  if (!m || !m[1]) return false;
  const parenthetical = m[1].trim().toLowerCase();
  // "Moderate" in the raw is treated as agreeing with "Medium".
  const normalizedParen = parenthetical === 'moderate' ? 'medium' : parenthetical;
  return normalizedParen !== word.trim().toLowerCase();
}

/** Balance point that represents the racket in single-variant contexts (its lightest). */
function representativeBalancePoint(variants: Variant[]): number {
  // Use the first variant's balance point for the racket-level bucket; per-variant
  // comparisons always use the variant's own value.
  return variants[0]?.balancePointMm ?? 298;
}

export function deriveRacket(r: GeneratedRacket): Derived {
  const weightOrdinals = {} as Record<WeightClass, number>;
  for (const v of r.variants) weightOrdinals[v.weightClass] = weightOrdinal(v.weightClass);

  return {
    balanceBucket: balanceBucket(representativeBalancePoint(r.variants)),
    stiffnessOrdinal: stiffnessOrdinal(r.stiffness.word),
    weightOrdinals,
    stiffnessWordConflict: stiffnessWordConflict(r.stiffness.raw, r.stiffness.word),
  };
}

// --- Row-level comparison helpers (used by the compare table, §6) -----------------

export type ExtremeDirection = 'high' | 'low';

/**
 * Given the numeric values of one spec row across compared columns, return the indices
 * that hold the extreme(s), skipping nulls (missing data never wins or loses a diff).
 * Returns an empty set when every present value is equal, so identical rows collapse.
 *
 * `minSpread` suppresses the mark when the whole row spans less than a perceptible
 * delta, so "amber" only ever means "a difference a player would actually feel" — a 3mm
 * balance-point gap (within the spec's own ±3mm tolerance) reads as the same, not a diff.
 */
export function extremeIndices(
  values: Array<number | null>,
  direction: ExtremeDirection,
  minSpread = 0,
): Set<number> {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  if (present.length < 2) return new Set();

  const allEqual = present.every((x) => x.v === present[0]!.v);
  if (allEqual) return new Set();

  if (minSpread > 0) {
    const nums = present.map((x) => x.v);
    if (Math.max(...nums) - Math.min(...nums) < minSpread) return new Set();
  }

  const target =
    direction === 'high'
      ? Math.max(...present.map((x) => x.v))
      : Math.min(...present.map((x) => x.v));
  return new Set(present.filter((x) => x.v === target).map((x) => x.i));
}

/** True when all present values in a row are equal (row can collapse into "same"). */
export function rowIsUniform(values: Array<number | null | string>): boolean {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length < 2) return true;
  return present.every((v) => v === present[0]);
}
