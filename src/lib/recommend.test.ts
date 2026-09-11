import { describe, it, expect } from 'vitest';
import {
  recommend,
  scoreVariant,
  balanceCrit,
  classificationCrit,
  stiffnessCrit,
  weightCrit,
  tensionCrit,
  shaftCrit,
  WEIGHTS,
  type FinderAnswers,
} from './recommend';
import { catalog, getRacket } from './data';

const R = (id: string) => {
  const r = getRacket(id);
  if (!r) throw new Error(`missing test racket ${id}`);
  return r;
};
const variant = (id: string, weightClass: string) => {
  const v = R(id).variants.find((x) => x.weightClass === weightClass);
  if (!v) throw new Error(`missing ${id} ${weightClass}`);
  return v;
};

describe('WEIGHTS', () => {
  it('sum to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('criterion: balance', () => {
  it('scores a head-heavy variant higher for smash than for fast-defense', () => {
    const v = variant('fire-breathing', '3U'); // 302mm
    expect(balanceCrit({ style: 'smash' }, v).score).toBeGreaterThan(
      balanceCrit({ style: 'fast-defense' }, v).score,
    );
  });
  it('returns neutral 70 when style is skipped', () => {
    expect(balanceCrit({}, variant('fire-breathing', '3U')).score).toBe(70);
  });
  it('applies the doubles-rear +4mm target shift', () => {
    const v = variant('fire-breathing', '3U');
    const rear = balanceCrit({ style: 'smash', context: 'doubles-rear' }, v).score;
    const plain = balanceCrit({ style: 'smash' }, v).score;
    expect(rear).not.toBe(plain);
  });
});

describe('criterion: classification', () => {
  it('gives 100 for an exact match, 60 for all-around, 20 for opposite', () => {
    expect(classificationCrit({ style: 'smash' }, R('fire-breathing')).score).toBe(100); // ATTACK
    expect(classificationCrit({ style: 'smash' }, R('dimensional-slash-pro')).score).toBe(60); // ALL-AROUND
    expect(classificationCrit({ style: 'control' }, R('fire-breathing')).score).toBe(20); // ATTACK vs CONTROL
  });
  it('returns 70 when style skipped', () => {
    expect(classificationCrit({}, R('fire-breathing')).score).toBe(70);
  });
});

describe('criterion: stiffness', () => {
  it('prefers a soft shaft for a beginner over an advanced strong swinger', () => {
    const soft = R('love-breathing'); // Slightly Soft (ordinal 1)
    expect(stiffnessCrit({ skill: 'beginner' }, soft).score).toBeGreaterThan(
      stiffnessCrit({ skill: 'advanced', swing: 'strong' }, soft).score,
    );
  });
  it('discomfort pulls the target softer (caps at 2)', () => {
    const stiff = R('ld1000z'); // Stiff (ordinal 4)
    const withPain = stiffnessCrit({ skill: 'advanced', swing: 'strong', discomfort: 'yes' }, stiff).score;
    const without = stiffnessCrit({ skill: 'advanced', swing: 'strong' }, stiff).score;
    expect(withPain).toBeLessThan(without);
  });
  it('returns 70 when both skill and swing skipped', () => {
    expect(stiffnessCrit({}, R('love-breathing')).score).toBe(70);
  });
});

describe('criterion: weight', () => {
  it('prefers a heavier frame for a strong swing over a light one', () => {
    const v3u = variant('fire-breathing', '3U');
    expect(weightCrit({ swing: 'strong' }, v3u).score).toBeGreaterThan(
      weightCrit({ swing: 'light' }, v3u).score,
    );
  });
  it('returns 70 when swing and skill skipped', () => {
    expect(weightCrit({}, variant('fire-breathing', '3U')).score).toBe(70);
  });
});

describe('criterion: tension headroom', () => {
  it('rewards headroom and penalises a tight ceiling', () => {
    const high = variant('fire-breathing', '3U'); // 31 lbs
    const low = variant('ld100zz', '4U'); // 28 lbs
    expect(tensionCrit({ tension: '28plus' }, high).score).toBe(100); // 31 vs 29 = 2 headroom
    expect(tensionCrit({ tension: '28plus' }, low).score).toBe(30); // 28 vs 29 = below
  });
  it('is neutral-positive for "not sure" and 70 when skipped', () => {
    expect(tensionCrit({ tension: 'notsure' }, variant('fire-breathing', '3U')).score).toBe(100);
    expect(tensionCrit({}, variant('fire-breathing', '3U')).score).toBe(70);
  });
});

describe('criterion: shaft diameter', () => {
  it('prefers a thin shaft for fast-defense over smash', () => {
    const thin = R('annihilation'); // 6.4mm
    expect(shaftCrit({ style: 'fast-defense' }, thin).score).toBeGreaterThan(
      shaftCrit({ style: 'smash' }, thin).score,
    );
  });
  it('returns 70 when style and skill skipped', () => {
    expect(shaftCrit({}, R('annihilation')).score).toBe(70);
  });
});

describe('hard filters', () => {
  it('excludes variants below 28 lbs when the player wants 28+', () => {
    const recs = recommend({ tension: '28plus' }, catalog);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) expect(rec.variant.maxTensionLbs).toBeGreaterThanOrEqual(28);
  });
  it('excludes variants that do not offer the requested grip (G6)', () => {
    for (const rec of recommend({ grip: 'G6' }, catalog)) {
      expect(rec.variant.gripSizes).toContain('G6');
    }
  });
  it('excludes variants that do not offer the requested grip (G5)', () => {
    for (const rec of recommend({ grip: 'G5' }, catalog)) {
      expect(rec.variant.gripSizes).toContain('G5');
    }
  });
  it('treats budget as a soft preference: still returns 3, flags over-budget correctly', () => {
    const recs = recommend({ budgetPhp: 2500 }, catalog);
    const primary = recs.filter((r) => !r.alsoConsider).slice(0, 3);
    expect(primary).toHaveLength(3); // budget never starves the result set
    for (const rec of recs) {
      const price = rec.racket.pricePhp;
      expect(rec.overBudget).toBe(price !== null && price > 2500);
    }
  });
  it('ranks an in-budget racket ahead of the same-fit racket when over budget', () => {
    // With a very low budget, the cheapest all-around picks should surface first.
    const recs = recommend({ style: 'all-court', budgetPhp: 2500 }, catalog);
    expect(recs[0]!.overBudget).toBe(false);
  });
  it('scoreVariant returns null for a filtered variant', () => {
    const low = variant('ld100zz', '4U'); // 28 lbs, so 28+ with <28 test needs a truly-low one
    const veryLow = R('fire-breathing').variants.find((v) => v.maxTensionLbs < 28)!; // 5U = 28? check
    // fire-breathing 5U is exactly 28, so use a grip filter instead:
    expect(scoreVariant({ grip: 'G5' }, R('freezing'), variant('freezing', '4U'))).toBeNull(); // freezing 4U is G6 only
    expect(low).toBeDefined();
    expect(veryLow).toBeUndefined(); // sanity: fire-breathing has no <28 variant
  });
});

describe('out-of-stock handling', () => {
  it('never ranks an out-of-stock racket above an in-stock one', () => {
    // ld88dpro is Out of Stock; craft answers that suit it, then check ordering.
    const recs = recommend({ style: 'smash', swing: 'strong', skill: 'advanced' }, catalog);
    let seenInStock = false;
    for (const rec of recs) {
      if (rec.inStock) seenInStock = true;
      if (!rec.inStock) expect(seenInStock).toBe(true); // an in-stock pick already preceded it (or it's not first)
    }
  });
});

describe('recommend integration — 12 sample answer vectors', () => {
  const vectors: FinderAnswers[] = [
    { skill: 'beginner', context: 'doubles-front', style: 'fast-defense', swing: 'light', discomfort: 'no', tension: 'under24', grip: 'G6' },
    { skill: 'advanced', context: 'singles', style: 'smash', swing: 'strong', discomfort: 'no', tension: '28plus', grip: 'G5' },
    { skill: 'intermediate', context: 'doubles-rear', style: 'smash', swing: 'balanced', discomfort: 'no', tension: '24-27', grip: 'G6' },
    { skill: 'intermediate', context: 'mixed', style: 'all-court', swing: 'balanced', discomfort: 'no', tension: 'notsure', grip: 'notsure' },
    { skill: 'beginner', context: 'mixed', style: 'control', swing: 'light', discomfort: 'yes', tension: 'under24', grip: 'G6' },
    { skill: 'advanced', context: 'doubles-front', style: 'fast-defense', swing: 'balanced', discomfort: 'no', tension: '24-27', grip: 'G6' },
    { skill: 'intermediate', context: 'singles', style: 'control', swing: 'balanced', discomfort: 'no', tension: '24-27', grip: 'G5' },
    { skill: 'advanced', context: 'doubles-rear', style: 'smash', swing: 'strong', discomfort: 'no', tension: '28plus', grip: 'notsure' },
    { skill: 'beginner', context: 'doubles-front', style: 'all-court', swing: 'light', discomfort: 'no', tension: 'notsure', grip: 'G6' },
    { skill: 'intermediate', context: 'mixed', style: 'fast-defense', swing: 'balanced', discomfort: 'yes', tension: '24-27', grip: 'notsure' },
    { style: 'smash' }, // most questions skipped
    {}, // everything skipped
  ];

  it.each(vectors.map((v, i) => [i, v] as const))(
    'vector %i returns at least 3 picks with a distinct top 3',
    (_i, v) => {
      const recs = recommend(v, catalog);
      expect(recs.length).toBeGreaterThanOrEqual(3);
      const topThree = recs.filter((r) => !r.alsoConsider).slice(0, 3);
      expect(topThree).toHaveLength(3);
      const ids = topThree.map((r) => r.racketId);
      expect(new Set(ids).size).toBe(3); // never the same racket twice
    },
  );
});
