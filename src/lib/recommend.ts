// Deterministic racket recommendation engine (product.md §7). Pure function, no network,
// no LLM. Scores every VARIANT 0–100, applies hard filters, and returns the top picks
// with templated, honest reasons. Fully unit-tested in recommend.test.ts.
import { weightOrdinal } from './derive';
import type { Classification, GripSize, Racket, Variant } from './types';

// --- Answers (one per finder question, all skippable) --------------------------------
export type Skill = 'beginner' | 'intermediate' | 'advanced';
export type PlayContext = 'singles' | 'doubles-front' | 'doubles-rear' | 'mixed';
export type Style = 'smash' | 'all-court' | 'fast-defense' | 'control';
export type Swing = 'light' | 'balanced' | 'strong';
export type YesNo = 'yes' | 'no';
export type TensionPref = 'under24' | '24-27' | '28plus' | 'notsure';
export type GripPref = GripSize | 'notsure';

export interface FinderAnswers {
  skill?: Skill; // Q1
  context?: PlayContext; // Q2
  style?: Style; // Q3
  swing?: Swing; // Q4
  discomfort?: YesNo; // Q5
  tension?: TensionPref; // Q6
  grip?: GripPref; // Q7
  budgetPhp?: number | null; // Q8 (optional)
}

export const WEIGHTS = {
  balance: 25,
  classification: 20,
  stiffness: 20,
  weight: 20,
  tension: 10,
  shaft: 5,
} as const;
export type Criterion = keyof typeof WEIGHTS;

export interface Recommendation {
  racketId: string;
  racket: Racket;
  variant: Variant;
  weightClass: string;
  score: number;
  breakdown: Record<Criterion, number>;
  reasons: string[];
  tradeoff: string | null;
  inStock: boolean;
  overBudget: boolean;
  alsoConsider: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const SKIPPED = 70; // neutral score when the governing question was skipped (§7.2)

interface Crit {
  score: number;
  reason?: string;
  tradeoff?: string;
}

// --- Balance fit (25) ---
export function balanceCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.style) return { score: SKIPPED };
  const base: Record<Style, number> = {
    smash: 305,
    'all-court': 298,
    'fast-defense': 294,
    control: 297,
  };
  const shift: Record<PlayContext, number> = {
    'doubles-rear': 4,
    'doubles-front': -5,
    singles: 2,
    mixed: 0,
  };
  const target = base[a.style] + (a.context ? shift[a.context] : 0);
  const score = clamp(100 - Math.min(100, Math.abs(v.balancePointMm - target) * 4));
  const diff = v.balancePointMm - target;
  return {
    score,
    reason:
      score >= 80
        ? `Balance point ${v.balancePointMm}mm sits right where a ${styleLabel(a.style)} game wants it.`
        : undefined,
    tradeoff:
      score < 60
        ? diff > 0
          ? `It's more head-heavy (${v.balancePointMm}mm) than ideal for your style — a touch slower to swing.`
          : `It's more head-light (${v.balancePointMm}mm) than ideal for your style — less mass behind the smash.`
        : undefined,
  };
}

// --- Classification fit (20) ---
export function classificationCrit(a: FinderAnswers, r: Racket): Crit {
  if (!a.style) return { score: SKIPPED };
  const preferred: Record<Style, Classification> = {
    smash: 'ATTACK',
    'all-court': 'ALL-AROUND',
    'fast-defense': 'SPEED',
    control: 'CONTROL',
  };
  const p = preferred[a.style];
  let score: number;
  if (r.classification === p) score = 100;
  else if (r.classification === 'ALL-AROUND' || p === 'ALL-AROUND') score = 60;
  else score = 20;
  return {
    score,
    reason: score === 100 ? `It's an ${r.classification.toLowerCase()} racket — exactly the profile for your game.` : undefined,
    tradeoff:
      score <= 20
        ? `It's built as a ${r.classification.toLowerCase()} racket, which pulls against a ${styleLabel(a.style)} style.`
        : undefined,
  };
}

// --- Stiffness fit (20) ---
export function stiffnessCrit(a: FinderAnswers, r: Racket): Crit {
  if (!a.skill && !a.swing) return { score: SKIPPED };
  // Base target from skill (1..4), nudged by swing strength.
  let target: number;
  if (a.skill === 'advanced' && a.swing === 'strong') target = 3.5;
  else if (a.skill === 'beginner' || a.swing === 'light') target = 1.5;
  else target = 2.5;
  if (a.discomfort === 'yes') target = Math.min(target - 1, 2); // gentler on the arm
  const ord = r.derived.stiffnessOrdinal;
  const score = clamp(100 - Math.abs(ord - target) * 30);
  return {
    score,
    reason: score >= 80 ? `The shaft's flex matches your swing — enough response without punishing your timing.` : undefined,
    tradeoff:
      score < 60 && ord > target
        ? `It's a stiffer shaft — less forgiving if your timing is still developing.`
        : score < 60 && ord < target
          ? `It's a softer shaft — you may want more control than it offers as you improve.`
          : undefined,
  };
}

// --- Weight fit (20) ---
export function weightCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.swing && !a.skill) return { score: SKIPPED };
  let target: number; // weightOrdinal: 6U=1 … 3U=4
  if (a.swing === 'strong') target = 3.5;
  else if (a.swing === 'light' || a.skill === 'beginner') target = 2.5;
  else target = 3;
  if (a.discomfort === 'yes') target -= 1; // one class lighter
  const ord = weightOrdinal(v.weightClass);
  const score = clamp(100 - Math.abs(ord - target) * 30);
  return {
    score,
    reason: score >= 80 ? `The ${v.weightClass} weight suits your swing — quick to move without giving up power.` : undefined,
    tradeoff:
      score < 60 && ord > target
        ? `At ${v.weightClass} it's on the heavier side for you — more tiring over a long match.`
        : score < 60 && ord < target
          ? `At ${v.weightClass} it's quite light — you'll supply more of the power yourself.`
          : undefined,
  };
}

// --- Tension headroom (10) ---
function tensionMid(t: TensionPref): number | null {
  if (t === 'under24') return 23;
  if (t === '24-27') return 25.5;
  if (t === '28plus') return 29;
  return null; // notsure
}
export function tensionCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.tension) return { score: SKIPPED };
  const mid = tensionMid(a.tension);
  if (mid === null) return { score: 100 }; // notsure → neutral-positive
  const headroom = v.maxTensionLbs - mid;
  const score = headroom >= 2 ? 100 : headroom >= 0 ? 70 : 30;
  return {
    score,
    reason: score === 100 && a.tension === '28plus' ? `It takes up to ${v.maxTensionLbs} lbs — plenty of headroom for a high-tension setup.` : undefined,
    tradeoff: score < 60 ? `Its max tension (${v.maxTensionLbs} lbs) leaves little headroom for how tight you string.` : undefined,
  };
}

// --- Shaft diameter (5) ---
export function shaftCrit(a: FinderAnswers, r: Racket): Crit {
  if (!a.style && !a.skill) return { score: SKIPPED };
  let preferred = 6.7;
  if (a.style === 'fast-defense') preferred = 6.4;
  else if (a.style === 'smash' || a.skill === 'beginner') preferred = 6.9;
  const score = clamp(100 - Math.abs(r.shaftDiameterMm - preferred) * 100);
  return { score };
}

const ADJACENT_STYLE_LABEL: Record<Style, string> = {
  smash: 'smashing',
  'all-court': 'all-court',
  'fast-defense': 'fast, defensive',
  control: 'control-first',
};
function styleLabel(s: Style): string {
  return ADJACENT_STYLE_LABEL[s];
}

// --- Full scoring for one variant ---
interface ScoredVariant extends Recommendation {}

export function scoreVariant(a: FinderAnswers, r: Racket, v: Variant): ScoredVariant | null {
  // Hard filters (§7.2): tension ceiling and grip availability only. Budget is a soft
  // preference below — never a hard exclude — so the finder still returns three picks.
  if (a.tension === '28plus' && v.maxTensionLbs < 28) return null;
  if ((a.grip === 'G5' || a.grip === 'G6') && !v.gripSizes.includes(a.grip)) return null;

  const crits: Record<Criterion, Crit> = {
    balance: balanceCrit(a, v),
    classification: classificationCrit(a, r),
    stiffness: stiffnessCrit(a, r),
    weight: weightCrit(a, v),
    tension: tensionCrit(a, v),
    shaft: shaftCrit(a, r),
  };

  const breakdown = {} as Record<Criterion, number>;
  let weighted = 0;
  (Object.keys(WEIGHTS) as Criterion[]).forEach((k) => {
    breakdown[k] = crits[k].score;
    weighted += crits[k].score * WEIGHTS[k];
  });
  let score = weighted / 100;

  // Over budget: a soft penalty so in-budget picks rank first, but over-budget ones
  // still fill the list rather than leaving the player with fewer than three matches.
  const overBudget = typeof a.budgetPhp === 'number' && r.pricePhp !== null && r.pricePhp > a.budgetPhp;
  if (overBudget) score -= 40;

  // Out of stock: keep but rank last (§7.2), never silently hide.
  const inStock = r.inStock;
  if (!inStock) score -= 1000;

  // Reasons: highest-scoring criteria that cleared the bar, best first.
  const reasons = (Object.keys(WEIGHTS) as Criterion[])
    .filter((k) => crits[k].reason)
    .sort((x, y) => breakdown[y] - breakdown[x])
    .map((k) => crits[k].reason!)
    .slice(0, 3);

  // Tradeoff: the honest downside from the weakest criterion that has one.
  const tradeoff =
    (Object.keys(WEIGHTS) as Criterion[])
      .filter((k) => crits[k].tradeoff)
      .sort((x, y) => breakdown[x] - breakdown[y])
      .map((k) => crits[k].tradeoff!)[0] ?? null;

  return {
    racketId: r.id,
    racket: r,
    variant: v,
    weightClass: v.weightClass,
    score: Math.round(score * 10) / 10,
    breakdown,
    reasons,
    tradeoff,
    inStock,
    overBudget,
    alsoConsider: false,
  };
}

/**
 * Recommend rackets for the given answers. Returns up to 3 primary picks (max one
 * variant per racket) plus up to 2 cross-classification "also consider" picks so the
 * result set isn't three near-identical rackets (§7.2).
 */
export function recommend(answers: FinderAnswers, catalog: Racket[]): Recommendation[] {
  const scored: ScoredVariant[] = [];
  for (const r of catalog) {
    for (const v of r.variants) {
      const s = scoreVariant(answers, r, v);
      if (s) scored.push(s);
    }
  }
  scored.sort((x, y) => y.score - x.score);

  // Best variant per racket only.
  const bestPerRacket: ScoredVariant[] = [];
  const seenRacket = new Set<string>();
  for (const s of scored) {
    if (seenRacket.has(s.racketId)) continue;
    seenRacket.add(s.racketId);
    bestPerRacket.push(s);
  }

  const top = bestPerRacket.slice(0, 3);
  const topClasses = new Set(top.map((t) => t.racket.classification));

  const alsoConsider = bestPerRacket
    .slice(3)
    .filter((s) => !topClasses.has(s.racket.classification))
    .slice(0, 2)
    .map((s) => ({ ...s, alsoConsider: true }));

  return [...top, ...alsoConsider];
}
