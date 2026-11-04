import { describe, it, expect } from 'vitest';
import { catalog } from './data';
import { AXES, axisDomain, buildSpecPoints, formatAxisValue, niceTicks } from './specmap';

const points = buildSpecPoints(catalog);

describe('buildSpecPoints', () => {
  it('emits one point per racket × weight class', () => {
    const expected = catalog.reduce((n, r) => n + r.variants.length, 0);
    expect(points).toHaveLength(expected);
    expect(new Set(points.map((p) => p.key)).size).toBe(points.length);
  });

  it('keeps unpublished specs null instead of zero', () => {
    const p = points.find((x) => x.key === 'freezing:4U');
    expect(p?.values.swing).toBeNull();
    for (const pt of points) {
      for (const v of Object.values(pt.values)) expect(v).not.toBe(0);
    }
  });

  it('uses the variant’s own balance point and weight', () => {
    const p = points.find((x) => x.key === 'fire-breathing:5U');
    expect(p?.values.balance).toBe(308);
    expect(p?.values.stiffness).toBe(2);
  });
});

describe('axis helpers', () => {
  it('niceTicks covers the range with round steps', () => {
    expect(niceTicks(290, 315, 5)).toEqual([290, 295, 300, 305, 310, 315]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('axisDomain pads numeric axes and fixes ordinal ones', () => {
    const [lo, hi] = axisDomain(AXES.balance, [292, 313]);
    expect(lo).toBeLessThan(292);
    expect(hi).toBeGreaterThan(313);
    expect(axisDomain(AXES.stiffness, [2])).toEqual([0.5, 4.5]);
  });

  it('formats values with units and ordinal labels', () => {
    expect(formatAxisValue(AXES.balance, 302)).toBe('302 mm');
    expect(formatAxisValue(AXES.shaft, 6.8)).toBe('6.8 mm');
    expect(formatAxisValue(AXES.stiffness, 4)).toBe('Stiff');
    expect(formatAxisValue(AXES.swing, null)).toBe('—');
  });
});
