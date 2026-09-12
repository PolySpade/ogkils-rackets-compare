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
/** Where the player wants the power to come from — the frame, or their own swing. */
export type PowerSource = 'racket' | 'balanced' | 'me';
/** Typical time on court, which governs how much swing weight they'll tolerate. */
export type SessionLength = 'short' | 'medium' | 'long';

export interface FinderAnswers {
  skill?: Skill; // Q1
  context?: PlayContext; // Q2
  style?: Style; // Q3
  powerSource?: PowerSource; // Q4
  swing?: Swing; // Q5
  sessionLength?: SessionLength; // Q6
  discomfort?: YesNo; // Q7
  tension?: TensionPref; // Q8
  grip?: GripPref; // Q9
  budgetPhp?: number | null; // Q10 (optional)
}

/**
 * Style used to drive 45 of 100 points (balance + classification), so four style options
 * collapsed into roughly four outcomes: across all 3,456 answer combinations the finder
 * produced only 74 distinct top-threes, one racket won 29% of quizzes, and two rackets
 * were unreachable. Spreading the weight over more independent axes — and giving swing
 * weight and price real votes — is what makes the questions actually narrow anything.
 */
export const WEIGHTS = {
  balance: 18,
  stiffness: 16,
  weight: 16,
  classification: 14,
  maneuver: 12,
  budget: 12,
  tension: 8,
  shaft: 4,
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

// --- Balance fit (18) ---
export function balanceCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.style && !a.powerSource) return { score: SKIPPED };
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
  // Mass in the head is what makes a frame hit for you, so this is the axis that lets a
  // head-heavy speed racket be the right answer for someone who wants the racket to work.
  const power: Record<PowerSource, number> = { racket: 6, balanced: 0, me: -6 };
  const target =
    (a.style ? base[a.style] : 298) +
    (a.context ? shift[a.context] : 0) +
    (a.powerSource ? power[a.powerSource] : 0);
  const score = clamp(100 - Math.min(100, Math.abs(v.balancePointMm - target) * 4));
  const diff = v.balancePointMm - target;
  const forWhat = a.style ? `a ${styleLabel(a.style)} game` : 'how you want the power delivered';
  return {
    score,
    reason:
      score >= 80 ? `Balance point ${v.balancePointMm}mm sits right where ${forWhat} wants it.` : undefined,
    tradeoff:
      score < 60
        ? diff > 0
          ? `It's more head-heavy (${v.balancePointMm}mm) than ideal for you — a touch slower to swing.`
          : `It's more head-light (${v.balancePointMm}mm) than ideal for you — less mass behind the smash.`
        : undefined,
  };
}

/**
 * Style → classification affinity (14). The old version scored 100/60/20, and a flat 20
 * for any cross-class pick was heavy enough to make whole classifications unreachable —
 * a speed frame could never answer a smash question even when every other spec fit.
 * These softer floors let a strong all-round fit outrank a nominal category match.
 */
const CLASS_AFFINITY: Record<Style, Record<Classification, number>> = {
  smash: { ATTACK: 100, 'ALL-AROUND': 65, SPEED: 50, CONTROL: 30 },
  'all-court': { 'ALL-AROUND': 100, SPEED: 70, CONTROL: 70, ATTACK: 65 },
  'fast-defense': { SPEED: 100, 'ALL-AROUND': 65, ATTACK: 50, CONTROL: 45 },
  control: { CONTROL: 100, 'ALL-AROUND': 70, SPEED: 50, ATTACK: 35 },
};

// --- Classification fit (14) ---
export function classificationCrit(a: FinderAnswers, r: Racket): Crit {
  if (!a.style) return { score: SKIPPED };
  const score = CLASS_AFFINITY[a.style][r.classification];
  return {
    score,
    reason:
      score === 100
        ? `It's an ${r.classification.toLowerCase()} racket — exactly the profile for your game.`
        : undefined,
    tradeoff:
      score <= 50
        ? `It's built as a ${r.classification.toLowerCase()} racket, which pulls against a ${styleLabel(a.style)} style.`
        : undefined,
  };
}

// --- Stiffness fit (16) ---
export function stiffnessCrit(a: FinderAnswers, r: Racket): Crit {
  if (!a.skill && !a.swing && !a.powerSource) return { score: SKIPPED };
  // Skill sets the target; swing only nudges it. Treating a light swing as an override
  // meant a light swinger could never be matched to a stiff shaft — which wrongly ruled
  // out every ultralight stiff frame, the exact class of racket built for that player.
  let target = 2.5;
  if (a.skill === 'advanced') target = 3.2;
  else if (a.skill === 'beginner') target = 1.6;
  if (a.swing === 'strong') target += 0.4;
  else if (a.swing === 'light') target -= 0.4;
  // A flexible shaft loads and springs back, doing some of the work; a stiff one just
  // transmits what you gave it. Kept deliberately small: shaft flex and head mass are
  // independent, so this must not cancel out the balance signal it also drives.
  if (a.powerSource === 'racket') target -= 0.4;
  else if (a.powerSource === 'me') target += 0.4;
  if (a.discomfort === 'yes') target = Math.min(target - 1, 2); // gentler on the arm
  target = Math.max(1, Math.min(4, target));
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

// --- Weight fit (16) ---
export function weightCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.swing && !a.skill && !a.sessionLength) return { score: SKIPPED };
  let target: number; // weightOrdinal: 6U=1 … 3U=4
  if (a.swing === 'strong') target = 3.5;
  else if (a.swing === 'light' || a.skill === 'beginner') target = 2.5;
  else target = 3;
  // Grams you barely notice in game one are what your shoulder notices in hour three.
  if (a.sessionLength === 'long') target -= 0.6;
  else if (a.sessionLength === 'short') target += 0.3;
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

/**
 * Manoeuvrability (12) — swing weight, which is how heavy the frame *feels* mid-rally
 * rather than what it reads on a scale. Only 12 of 20 rackets publish it; the rest score
 * neutral so an unpublished spec never counts against a racket (§4.3).
 */
export function maneuverCrit(a: FinderAnswers, v: Variant): Crit {
  if (!a.sessionLength && !a.style && !a.context) return { score: SKIPPED };
  if (v.swingWeight === null) return { score: SKIPPED };
  let target = 86; // mid of the catalogue's 82–90 range
  if (a.sessionLength === 'long') target -= 2.5;
  else if (a.sessionLength === 'short') target += 2;
  if (a.style === 'fast-defense') target -= 1.5;
  else if (a.style === 'smash') target += 1.5;
  if (a.context === 'doubles-front') target -= 1;
  else if (a.context === 'doubles-rear') target += 1;
  const score = clamp(100 - Math.abs(v.swingWeight - target) * 11);
  return {
    score,
    reason:
      score >= 80
        ? `Swing weight ${v.swingWeight} keeps it quick through the air for the way you play.`
        : undefined,
    tradeoff:
      score < 55
        ? v.swingWeight > target
          ? `Swing weight ${v.swingWeight} makes it feel heavier in hand than you'll want late in a session.`
          : `Swing weight ${v.swingWeight} is light in hand — less momentum carried into the shuttle.`
        : undefined,
  };
}

/**
 * Budget (12). Previously budget was only a flat −40 on the final score, which buried
 * over-budget rackets without ever rewarding a good in-budget fit. As a criterion it
 * competes properly, and the residual penalty below just breaks ties toward affordable.
 */
export function budgetCrit(a: FinderAnswers, r: Racket): Crit {
  if (typeof a.budgetPhp !== 'number' || r.pricePhp === null) return { score: SKIPPED };
  if (r.pricePhp <= a.budgetPhp) return { score: 100 };
  const over = (r.pricePhp - a.budgetPhp) / a.budgetPhp;
  const score = over <= 0.1 ? 55 : over <= 0.25 ? 30 : 10;
  return {
    score,
    tradeoff: `At ₱${r.pricePhp.toLocaleString()} it's over the ₱${a.budgetPhp.toLocaleString()} you set.`,
  };
}

// --- Tension headroom (8) ---
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
    maneuver: maneuverCrit(a, v),
    budget: budgetCrit(a, r),
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

  // Over budget: budgetCrit already carries most of this. A small residual penalty keeps
  // in-budget picks ahead on ties without starving the list below three matches.
  const overBudget = typeof a.budgetPhp === 'number' && r.pricePhp !== null && r.pricePhp > a.budgetPhp;
  if (overBudget) score -= 10;

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
