import { describe, expect, it } from 'vitest';
import { filterWheel, landingRotation, randomIndex, sliceAt, type WheelRacket } from './roulette';

const r = (id: string, classLabel: string, pricePhp: number | null, weightClasses = ['4U'], series = 'LD'): WheelRacket => ({
  id, name: id, classLabel, series, weightClasses, pricePhp,
});
const all = [r('a', 'Attack', 4000), r('b', 'Speed', 6000, ['3U']), r('c', 'Control', null, ['5U'], 'Breathing')];
const none = { styles: new Set<string>(), weights: new Set<string>(), series: new Set<string>(), maxPrice: null };

describe('racket roulette', () => {
  it('filters by style, weight, series and budget', () => {
    expect(filterWheel(all, none)).toHaveLength(3);
    expect(filterWheel(all, { ...none, styles: new Set(['Speed']) }).map((x) => x.id)).toEqual(['b']);
    expect(filterWheel(all, { ...none, weights: new Set(['4U', '5U']) }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterWheel(all, { ...none, series: new Set(['Breathing']) }).map((x) => x.id)).toEqual(['c']);
    // An unpriced racket can't be shown as under budget.
    expect(filterWheel(all, { ...none, maxPrice: 5000 }).map((x) => x.id)).toEqual(['a']);
  });

  it('lands the chosen slice under the pointer, always spinning forward', () => {
    for (const count of [2, 5, 8, 22]) {
      let rot = 0;
      for (let i = 0; i < count; i++) {
        for (const offset of [-0.4, 0, 0.4]) {
          const next = landingRotation(rot, i, count, 5, offset);
          expect(next - rot).toBeGreaterThanOrEqual(360 * 5);
          expect(sliceAt(next, count)).toBe(i);
          rot = next;
        }
      }
    }
  });

  it('draws every index', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 10; k++) seen.add(randomIndex(10, () => k / 10));
    expect(seen.size).toBe(10);
    expect(randomIndex(3, () => 0.999999)).toBe(2);
  });
});
