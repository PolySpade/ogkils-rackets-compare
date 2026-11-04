// Data for the interactive spec map (/spec-map): one point per racket × weight class,
// plotted on two player-chosen spec axes. Pure and serialisable so the page can build it
// at compile time and hand it to the SpecMap island.

import { classMeta } from './classification';
import { stiffnessOrdinal } from './derive';
import type { Classification, Racket, Variant, WeightClass } from './types';

export type AxisKey = 'balance' | 'weight' | 'swing' | 'tension' | 'stiffness' | 'shaft' | 'frame';

export interface AxisDef {
  key: AxisKey;
  label: string;
  /** Short unit for tick values and tooltips ('' for ordinal axes). */
  unit: string;
  /** Plain-language meaning of each end, shown at the axis ends. */
  lowHint: string;
  highHint: string;
  /** Fixed tick labels for ordinal axes; numeric axes get computed ticks. */
  ticks?: Array<{ value: number; label: string }>;
  /** Shaded reference bands, e.g. the "Even" balance zone. */
  bands?: Array<{ from: number; to: number; label: string }>;
  /** Glossary key for the "what does this mean" line. */
  glossary?: string;
}

const STIFFNESS_TICKS = [
  { value: 1, label: 'Slightly soft' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Slightly stiff' },
  { value: 4, label: 'Stiff' },
];

export const AXES: Record<AxisKey, AxisDef> = {
  balance: {
    key: 'balance',
    label: 'Balance point',
    unit: 'mm',
    lowHint: 'Head-light',
    highHint: 'Head-heavy',
    // Matches balanceBucket() in derive.ts: ≤295 head-light, ≥302 head-heavy.
    bands: [{ from: 295.5, to: 301.5, label: 'Even' }],
    glossary: 'balance-point',
  },
  weight: {
    key: 'weight',
    label: 'Weight',
    unit: 'g',
    lowHint: 'Lighter',
    highHint: 'Heavier',
    glossary: 'weight-class',
  },
  swing: {
    key: 'swing',
    label: 'Swing weight',
    unit: 'kg·cm²',
    lowHint: 'Quicker to swing',
    highHint: 'More momentum',
    glossary: 'swing-weight',
  },
  tension: {
    key: 'tension',
    label: 'Max string tension',
    unit: 'lbs',
    lowHint: 'Lower max',
    highHint: 'Higher max',
    glossary: 'max-tension',
  },
  stiffness: {
    key: 'stiffness',
    label: 'Shaft stiffness',
    unit: '',
    lowHint: 'Softer',
    highHint: 'Stiffer',
    ticks: STIFFNESS_TICKS,
    glossary: 'shaft-stiffness',
  },
  shaft: {
    key: 'shaft',
    label: 'Shaft diameter',
    unit: 'mm',
    lowHint: 'Thinner',
    highHint: 'Thicker',
    glossary: 'shaft-diameter',
  },
  frame: {
    key: 'frame',
    label: 'Frame area',
    unit: 'cm²',
    lowHint: 'Smaller head',
    highHint: 'Larger head',
    glossary: 'frame-area',
  },
};

export const AXIS_ORDER: AxisKey[] = ['balance', 'weight', 'swing', 'stiffness', 'tension', 'shaft', 'frame'];

export interface Preset {
  id: string;
  label: string;
  /** One sentence on what this view helps a player decide. */
  question: string;
  x: AxisKey;
  y: AxisKey;
}

export const PRESETS: Preset[] = [
  {
    id: 'power',
    label: 'Power vs. speed',
    question: 'Top right is heavy and head-heavy for smashing. Bottom left is light and quick for defence.',
    x: 'balance',
    y: 'weight',
  },
  {
    id: 'swing',
    label: 'Swing feel',
    question: 'Swing weight is how heavy the racket feels in motion. Higher means more power and a slower swing.',
    x: 'balance',
    y: 'swing',
  },
  {
    id: 'flex',
    label: 'Flex & tension',
    question: 'Stiffer shafts and higher string tension suit fast, strong swings. Softer suits developing players.',
    x: 'stiffness',
    y: 'tension',
  },
  {
    id: 'frame',
    label: 'Frame & shaft',
    question: 'A larger frame is more forgiving. A thinner shaft cuts through the air faster.',
    x: 'frame',
    y: 'shaft',
  },
];

export interface SpecPoint {
  /** Unique per racket × weight class, e.g. "fire-breathing:4U". */
  key: string;
  id: string;
  name: string;
  classification: Classification;
  classLabel: string;
  weightClass: WeightClass;
  weightRange: [number, number];
  /** null = the brand hasn't published it; the point is left off that view. */
  values: Record<AxisKey, number | null>;
}

export function variantValues(r: Racket, v: Variant): Record<AxisKey, number | null> {
  return {
    balance: v.balancePointMm,
    weight: v.weightMidG,
    swing: v.swingWeightMissing ? null : v.swingWeight,
    tension: v.maxTensionLbs,
    stiffness: r.stiffness.word ? stiffnessOrdinal(r.stiffness.word) : null,
    shaft: r.shaftDiameterMm,
    frame: r.frameAreaCm2,
  };
}

export function buildSpecPoints(rackets: Racket[]): SpecPoint[] {
  return rackets.flatMap((r) =>
    r.variants.map((v) => ({
      key: `${r.id}:${v.weightClass}`,
      id: r.id,
      name: r.name,
      classification: r.classification,
      classLabel: classMeta(r.classification).label,
      weightClass: v.weightClass,
      weightRange: v.weightRangeG,
      values: variantValues(r, v),
    })),
  );
}

/** Rounded, evenly spaced ticks covering [min, max] — at most ~`target` of them. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

/** Axis domain from the plotted values, padded so edge points aren't clipped. */
export function axisDomain(axis: AxisDef, values: number[]): [number, number] {
  if (axis.ticks) {
    const vs = axis.ticks.map((t) => t.value);
    return [Math.min(...vs) - 0.5, Math.max(...vs) + 0.5];
  }
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi === lo ? Math.max(1, Math.abs(hi) * 0.05) : (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/** Value with its unit, e.g. "302 mm", or the ordinal label for stiffness. */
export function formatAxisValue(axis: AxisDef, value: number | null): string {
  if (value === null) return '—';
  const tick = axis.ticks?.find((t) => t.value === value);
  if (tick) return tick.label;
  const n = Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 2 : 1).replace(/\.?0+$/, '');
  return axis.unit ? `${n} ${axis.unit}` : n;
}
