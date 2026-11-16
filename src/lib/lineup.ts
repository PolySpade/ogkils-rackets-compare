// Shared logic for the compare page's lineup chart and "biggest differences" summary.
// Every spec is placed on the range the whole OGKILS catalogue spans, so a gap between two
// rackets reads against how much the lineup actually varies — 5mm of balance point means
// more in a lineup that only spans 15mm than in one that spans 40mm.
//
// Pure and serialisable: the page builds the catalogue values at compile time, the island
// adds the shortlist's selected variants on the client.

import { AXES, AXIS_ORDER, formatAxisValue, type AxisDef, type AxisKey } from './specmap';

export type LineupKey = AxisKey | 'price';

export interface LineupSpec extends Omit<AxisDef, 'key'> {
  key: LineupKey;
}

const PRICE: LineupSpec = {
  key: 'price',
  label: 'Price',
  unit: '₱',
  lowHint: 'Cheaper',
  highHint: 'Pricier',
};

export const LINEUP_SPECS: LineupSpec[] = [...AXIS_ORDER.map((k) => AXES[k] as LineupSpec), PRICE];

export type LineupValues = Record<LineupKey, number | null>;

/** Every published value in the catalogue, per spec (one per racket × weight class). */
export type LineupCatalogue = Record<LineupKey, number[]>;

export interface LineupEntry {
  id: string;
  name: string;
  values: LineupValues;
}

export function formatLineupValue(spec: LineupSpec, value: number | null): string {
  if (value === null) return '—';
  if (spec.key === 'price') return `₱${value.toLocaleString('en-PH')}`;
  return formatAxisValue(spec as AxisDef, value);
}

/** [min, max] the catalogue spans for a spec; ordinal specs use their full tick scale. */
export function lineupRange(spec: LineupSpec, values: number[]): [number, number] | null {
  if (spec.ticks) {
    const ts = spec.ticks.map((t) => t.value);
    return [Math.min(...ts), Math.max(...ts)];
  }
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}

/** 0…1 position of a value on the range; a flat range puts everything in the middle. */
export function positionOn(value: number, [lo, hi]: [number, number]): number {
  if (hi === lo) return 0.5;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/**
 * Share of catalogue values strictly below this one, as a whole percentage. Used for the
 * tooltip ("higher than 64% of the lineup"), never as a score.
 */
export function shareBelow(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const below = values.filter((v) => v < value).length;
  return Math.round((below / values.length) * 100);
}

export interface Difference {
  key: LineupKey;
  label: string;
  /** Gap between the extremes as a share (0…1) of the catalogue's range. */
  share: number;
  high: { name: string; value: number };
  low: { name: string; value: number };
  sentence: string;
}

function gapText(spec: LineupSpec, gap: number): string {
  if (spec.ticks) return `${gap} step${gap === 1 ? '' : 's'} apart on the stiffness scale`;
  if (spec.key === 'price') return `₱${gap.toLocaleString('en-PH')} apart`;
  const n = Number.isInteger(gap) ? String(gap) : gap.toFixed(gap < 10 ? 2 : 1).replace(/\.?0+$/, '');
  return `${n}${spec.unit ? ` ${spec.unit}` : ''} apart`;
}

/**
 * The specs where the shortlist differs most, measured against the catalogue's range,
 * with a plain sentence each. Specs where any entry is unpublished are skipped rather
 * than guessed, and gaps under `minShare` of the range are treated as no real difference.
 */
export function keyDifferences(
  entries: LineupEntry[],
  catalogue: LineupCatalogue,
  limit = 3,
  minShare = 0.15,
): Difference[] {
  if (entries.length < 2) return [];
  const out: Difference[] = [];
  for (const spec of LINEUP_SPECS) {
    const range = lineupRange(spec, catalogue[spec.key] ?? []);
    if (!range || range[1] === range[0]) continue;
    const vals = entries.map((e) => e.values[spec.key]);
    if (vals.some((v) => v === null)) continue;
    const nums = vals as number[];
    const hiIdx = nums.indexOf(Math.max(...nums));
    const loIdx = nums.indexOf(Math.min(...nums));
    const gap = nums[hiIdx]! - nums[loIdx]!;
    if (gap === 0) continue;
    const share = gap / (range[1] - range[0]);
    if (share < minShare) continue;
    const high = { name: entries[hiIdx]!.name, value: nums[hiIdx]! };
    const low = { name: entries[loIdx]!.name, value: nums[loIdx]! };
    const sentence =
      `${high.name} sits at the ${spec.highHint.toLowerCase()} end (${formatLineupValue(spec, high.value)}), ` +
      `${low.name} at the ${spec.lowHint.toLowerCase()} end (${formatLineupValue(spec, low.value)}) — ` +
      `${gapText(spec, Number((gap).toFixed(2)))}, ${Math.round(Math.min(1, share) * 100)}% of the range across the lineup.`;
    out.push({ key: spec.key, label: spec.label, share, high, low, sentence });
  }
  return out.sort((a, b) => b.share - a.share).slice(0, limit);
}
