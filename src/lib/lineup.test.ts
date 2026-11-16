import { describe, expect, it } from 'vitest';
import { keyDifferences, lineupRange, positionOn, shareBelow, LINEUP_SPECS, type LineupCatalogue, type LineupValues } from './lineup';

const base: LineupValues = { balance: 295, weight: 83, swing: 85, tension: 30, stiffness: 2, shaft: 6.8, frame: 300, price: 3000 };
const catalogue: LineupCatalogue = {
  balance: [285, 295, 305], weight: [78, 83, 88], swing: [80, 85, 90], tension: [28, 30, 32],
  stiffness: [1, 2, 3, 4], shaft: [6.6, 6.8, 7], frame: [290, 300, 310], price: [2000, 3000, 6000],
};

describe('lineup', () => {
  it('positions values on the catalogue range', () => {
    expect(positionOn(295, [285, 305])).toBe(0.5);
    expect(positionOn(400, [285, 305])).toBe(1);
    expect(positionOn(5, [5, 5])).toBe(0.5);
  });

  it('uses the full tick scale for stiffness', () => {
    const spec = LINEUP_SPECS.find((s) => s.key === 'stiffness')!;
    expect(lineupRange(spec, [2, 3])).toEqual([1, 4]);
  });

  it('counts the share of the lineup below a value', () => {
    expect(shareBelow(305, [285, 295, 305, 310])).toBe(50);
  });

  it('ranks differences by share of the range and skips unpublished specs', () => {
    const diffs = keyDifferences(
      [
        { id: 'a', name: 'A', values: { ...base, balance: 305, swing: null } },
        { id: 'b', name: 'B', values: { ...base, balance: 285, price: 3500 } },
      ],
      catalogue,
    );
    expect(diffs[0]!.key).toBe('balance');
    expect(diffs[0]!.high.name).toBe('A');
    expect(diffs.some((d) => d.key === 'swing')).toBe(false);
    // ₱500 of a ₱4,000 range is 12.5% — below the threshold, so not a "real" difference.
    expect(diffs.some((d) => d.key === 'price')).toBe(false);
  });
});
