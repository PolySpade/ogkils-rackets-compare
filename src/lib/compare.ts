// Shared rules for the comparison tables, so the on-screen key can never drift from the
// logic it describes. Used by StaticCompareTable.astro and islands/CompareTray.tsx.

/**
 * A difference has to be big enough to feel before it is worth marking. Below these the
 * row is left plain — two frames 2mm apart in balance point are the same racket in the
 * hand, and marking it would manufacture a distinction (DESIGN.md, Comparison behavior).
 */
export const MIN_SPREAD = {
  balancePointMm: 5,
  shaftDiameterMm: 0.2,
} as const;

export interface DiffKeyEntry {
  glyph: string;
  label: string;
  /** Rendered in the muted "missing value" colour rather than the difference amber. */
  muted?: boolean;
}

/** The key shown with the table controls. */
export const DIFF_KEY: DiffKeyEntry[] = [
  { glyph: '▲', label: 'highest figure here' },
  { glyph: '▼', label: 'lowest figure here' },
  { glyph: '—', label: 'not published', muted: true },
];

/**
 * The footnote under the table. It has to say the uncomfortable part out loud: an arrow
 * marks an extreme, not a winner. A thicker shaft or a heavier frame is a measurement,
 * and which end suits you depends entirely on how you play.
 */
export const DIFF_FOOTNOTE =
  `An arrow marks the extreme value in that row — it is a measurement, not a verdict: ` +
  `heavier, stiffer or thicker is not automatically better, and which end suits you ` +
  `depends on how you play. A row is left unmarked when the values match, when the gap ` +
  `is too small to feel (under ${MIN_SPREAD.balancePointMm}mm of balance point or ` +
  `${MIN_SPREAD.shaftDiameterMm}mm of shaft diameter), or when the figure isn't published.`;
