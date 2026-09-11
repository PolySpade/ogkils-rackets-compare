// Display formatting that encodes the §4.3 data-quality rules in one place.
import type { Racket, Stiffness, Variant } from './types';

export const DASH = '—';

/**
 * Stiffness display: numeric range is primary, the word is a quiet label — and never
 * both when they disagree (§4.3). When no numeric range is published, the word is all
 * we have, so it becomes the primary value.
 */
export function formatStiffness(
  st: Stiffness,
  conflict: boolean,
): { primary: string; label: string | null } {
  if (st.rangeLow !== null && st.rangeHigh !== null) {
    return {
      primary: `${st.rangeLow}–${st.rangeHigh}`,
      label: conflict ? null : st.word,
    };
  }
  return { primary: st.word || DASH, label: null };
}

/** "3U · 4U · 5U" across a racket's variants, in the order shipped. */
export function formatWeightClasses(variants: Variant[]): string {
  return variants.map((v) => v.weightClass).join(' · ');
}

/** All grip sizes offered anywhere on the racket, e.g. "G5 · G6". */
export function formatGripSizes(variants: Variant[]): string {
  const set = new Set<string>();
  for (const v of variants) for (const g of v.gripSizes) set.add(g);
  return [...set].sort().join(' · ') || DASH;
}

/** Numeric range of a per-variant field across variants, e.g. balance point "296–308". */
export function rangeAcrossVariants(
  variants: Variant[],
  pick: (v: Variant) => number | null,
): string {
  const nums = variants.map(pick).filter((n): n is number => n !== null);
  if (nums.length === 0) return DASH;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Weight span in grams across variants using the published ranges, e.g. "75–89". */
export function weightSpanG(variants: Variant[]): string {
  const lows = variants.map((v) => v.weightRangeG[0]);
  const highs = variants.map((v) => v.weightRangeG[1]);
  const lo = Math.min(...lows);
  const hi = Math.max(...highs);
  return `${lo}–${hi}`;
}

/** Peso price or null-safe dash. Kept here so the "from ₱X" policy (§14.2) lives once. */
export function formatPrice(pricePhp: number | null): string | null {
  if (pricePhp === null) return null;
  return `₱${pricePhp.toLocaleString('en-PH')}`;
}

export function racketBalanceRange(r: Racket): string {
  return rangeAcrossVariants(r.variants, (v) => v.balancePointMm);
}

/**
 * Grip length we're willing to show as fact. The LD88DPRO (170mm) and LD88SPRO (165mm)
 * figures are flagged outliers (§4.3) — likely a unit/column error — so we render "—"
 * rather than present a probably-wrong number. Real value returned otherwise.
 */
export function trustedGripLengthMm(r: Racket): number | null {
  const g = r.gripLengthMm;
  if (g === null) return null;
  if (g < 185 || g > 235) return null; // suspect — don't present as fact
  return g;
}

/**
 * The line that sits above a model name in the catalogue, mirroring the brochure's
 * "BREATHING / SPEED" product-page heading. Series identifiers stay exactly as the data
 * file spells them; the catch-all "Other" bucket simply contributes nothing, and the
 * model code only appears when it actually differs from the display name (only the
 * Dimensional Slash Pro / DSPRO does today) so cards don't repeat themselves.
 */
export function seriesLine(r: Racket): string | null {
  const parts: string[] = [];
  if (r.series && r.series !== 'Other') parts.push(`${r.series} series`);
  if (r.modelCode && r.modelCode.toUpperCase() !== r.name.toUpperCase()) parts.push(r.modelCode);
  return parts.length ? parts.join(' · ') : null;
}
