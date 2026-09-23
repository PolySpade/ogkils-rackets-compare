import { describe, it, expect } from 'vitest';
import { searchRackets, toSearchRecord, tokenize, matchesTokens } from './search';
import { catalog } from './data';

const index = catalog.map(toSearchRecord);
const ids = (q: string, limit?: number) =>
  searchRackets(q, index, limit).map((h) => h.record.id);

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Head-Heavy!')).toEqual(['head', 'heavy']);
  });

  it('returns nothing for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('matchesTokens', () => {
  it('matches on word prefixes', () => {
    expect(matchesTokens('Fire Breathing ATTACK', ['fire'])).toBe(true);
    expect(matchesTokens('Fire Breathing ATTACK', ['breath'])).toBe(true);
  });

  it('requires every token', () => {
    expect(matchesTokens('Fire Breathing ATTACK', ['fire', 'speed'])).toBe(false);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesTokens('anything', [])).toBe(true);
  });

  it('does not match mid-word', () => {
    expect(matchesTokens('Fire Breathing', ['reath'])).toBe(false);
  });
});

describe('searchRackets', () => {
  it('returns nothing for a blank query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });

  it('puts the name-prefix match first', () => {
    expect(ids('fire')[0]).toBe('fire-breathing');
    expect(ids('thunder')[0]).toBe('thunder-breathing');
  });

  it('finds a racket by model code', () => {
    expect(ids('ld77pro')[0]).toBe('ld77pro');
  });

  it('finds a racket by alias', () => {
    expect(ids('anni')[0]).toBe('annihilation');
    expect(ids('snake')[0]).toBe('serpent-breathing');
    expect(ids('dspro')[0]).toBe('dimensional-slash-pro');
  });

  it('is case insensitive', () => {
    expect(ids('FIRE')[0]).toBe('fire-breathing');
  });

  it('narrows as tokens are added', () => {
    const speed = ids('speed', 50);
    const speed5u = ids('speed 5u', 50);
    expect(speed.length).toBeGreaterThan(speed5u.length);
    expect(speed5u).toContain('love-breathing');
    expect(speed5u).not.toContain('thunder-breathing');
  });

  it('matches classification, balance and weight words', () => {
    expect(ids('attack', 50)).toContain('fire-breathing');
    expect(ids('head heavy', 50)).toContain('thunder-breathing');
    expect(ids('6u', 50)).toContain('insect-breathing');
  });

  it('tolerates a typo when nothing matches exactly', () => {
    expect(ids('thundr')[0]).toBe('thunder-breathing');
    expect(ids('breathng', 50)).toContain('fire-breathing');
  });

  it('prefers exact matches over fuzzy ones', () => {
    // "wind" is a clean prefix of Wind Breathing; it must not lose to an edit-distance
    // neighbour like "Mist"/"Water".
    expect(ids('wind')[0]).toBe('wind-breathing');
  });

  it('returns nothing for gibberish', () => {
    expect(ids('zzzzqqqq')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(ids('breathing', 3)).toHaveLength(3);
  });
});

describe('toSearchRecord', () => {
  it('carries the fields the UI renders', () => {
    const fire = index.find((r) => r.id === 'fire-breathing')!;
    expect(fire.name).toBe('Fire Breathing');
    expect(fire.classification).toBe('ATTACK');
    expect(fire.weights).toEqual(['3U', '4U', '5U']);
    expect(fire.aliases).toContain('fire');
  });

  it('deduplicates weight classes', () => {
    for (const rec of index) {
      expect(new Set(rec.weights).size).toBe(rec.weights.length);
    }
  });
});
