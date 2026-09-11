import { describe, it, expect } from 'vitest';
import {
  answer,
  normalize,
  extractRackets,
  detectDimension,
  emptyContext,
  type AssistantContext,
  type AssistantData,
  type Intent,
} from './assistant';
import { catalog } from './data';
import { allTerms } from './glossary';
import { balanceBucket } from './derive';

const data: AssistantData = {
  rackets: catalog,
  glossary: allTerms(),
  buys: Object.fromEntries(
    catalog.map((r) => [r.id, [{ label: 'OGKILS Store', url: 'https://ogkilsbadminton.com', channel: 'shopify', primary: true }]]),
  ),
};

/** Run a whole conversation, returning every reply in order. */
function thread(...queries: string[]) {
  let ctx: AssistantContext = emptyContext();
  return queries.map((q) => {
    const res = answer(q, data, ctx);
    ctx = res.context;
    return res;
  });
}

describe('normalize (Taglish/PH-English)', () => {
  it('expands synonyms', () => {
    expect(normalize('magaan ba ito')).toContain('light');
    expect(normalize('magkano ang fire')).toContain('price');
    expect(normalize('pambato pang-smash')).toContain('best');
    expect(normalize('pambato pang-smash')).toContain('smash');
  });
  it('keeps money readable through punctuation stripping', () => {
    expect(normalize('under ₱4,500')).toContain('4500');
    expect(normalize('below 4.5k')).toContain('4500');
    expect(normalize('under 5k')).toContain('5000');
  });
});

describe('extractRackets', () => {
  it('matches by name word, model code, and alias', () => {
    expect(extractRackets('how heavy is the fire breathing', catalog).map((r) => r.id)).toContain('fire-breathing');
    expect(extractRackets('specs for ld100zz', catalog).map((r) => r.id)).toContain('ld100zz');
    expect(extractRackets('tell me about the annihilator', catalog).map((r) => r.id)).toContain('annihilation');
  });
  it('finds two rackets in a comparison query', () => {
    const ids = extractRackets('fire breathing vs thunder breathing', catalog).map((r) => r.id);
    expect(ids).toContain('fire-breathing');
    expect(ids).toContain('thunder-breathing');
  });
  it('does not invent a racket out of a price or an ordinary word', () => {
    expect(extractRackets('do you have anything under 4000', catalog)).toHaveLength(0);
    expect(extractRackets('i want something stiff and head heavy', catalog)).toHaveLength(0);
  });
  it('treats a series name as a scope, not as one of its models', () => {
    expect(extractRackets('compare all the breathing rackets', catalog)).toHaveLength(0);
  });
});

describe('detectDimension picks the most specific phrase', () => {
  it('prefers "swing weight" over "weight"', () => {
    expect(detectDimension('whats the swing weight of the dspro')?.key).toBe('swingWeight');
    expect(detectDimension('how heavy is it')?.key).toBe('weight');
  });
});

// Stored sample questions covering every intent (§13).
const SAMPLES: { q: string; intent: Intent }[] = [
  { q: 'how heavy is the fire breathing', intent: 'spec_lookup' },
  { q: "what's the balance of ld100zz", intent: 'spec_lookup' },
  { q: 'is the mist breathing stiff', intent: 'spec_lookup' },
  { q: 'tell me about the thunder breathing', intent: 'spec_lookup' },
  { q: 'fire breathing vs thunder breathing', intent: 'compare' },
  { q: 'difference between ld100zz and ld800pro', intent: 'compare' },
  { q: 'compare mist and water breathing', intent: 'compare' },
  { q: 'which racket is best for smashing', intent: 'recommend' },
  { q: 'what should a beginner get', intent: 'recommend' },
  { q: 'pambato for defense', intent: 'recommend' },
  { q: 'which rackets are head-light', intent: 'list_by_attribute' },
  { q: 'what rackets take 30 lbs', intent: 'list_by_attribute' },
  { q: 'show me attack rackets', intent: 'list_by_attribute' },
  { q: 'what is 4u', intent: 'explain_term' },
  { q: 'what does balance point mean', intent: 'explain_term' },
  { q: 'explain shaft stiffness', intent: 'explain_term' },
  { q: 'how much is the fire breathing', intent: 'buy' },
  { q: 'where can i buy the ld77pro', intent: 'buy' },
  { q: 'magkano ang serpent breathing', intent: 'buy' },
  { q: 'which racket has the biggest head', intent: 'superlative' },
  { q: 'cheapest attack racket', intent: 'superlative' },
  { q: 'is the fire breathing good for a beginner', intent: 'suitability' },
  { q: 'what rackets do you have', intent: 'catalog_overview' },
  { q: 'hello there', intent: 'smalltalk' },
  { q: 'are you chatgpt', intent: 'smalltalk' },
  { q: 'qwerty zxcv', intent: 'fallback' },
];

describe('intent classification', () => {
  it.each(SAMPLES)('classifies "$q" as $intent', ({ q, intent }) => {
    expect(answer(q, data).intent).toBe(intent);
  });

  it('covers every intent the engine can emit', () => {
    const seen = new Set(SAMPLES.map((s) => answer(s.q, data).intent));
    const required: Intent[] = [
      'spec_lookup', 'compare', 'recommend', 'list_by_attribute', 'explain_term',
      'buy', 'superlative', 'suitability', 'catalog_overview', 'smalltalk', 'fallback',
    ];
    for (const need of required) expect(seen.has(need)).toBe(true);
  });
});

describe('regressions — answers that used to be confidently wrong', () => {
  it('does not read the weight-class glossary out of the letter u in a material', () => {
    const res = answer('what is vibranium', data);
    expect(res.text.toLowerCase()).toContain('vibranium');
    expect(res.text).not.toContain('Weight (U)');
  });
  it('answers swing weight, not weight class', () => {
    const res = answer('whats the swing weight of the dspro', data);
    expect(res.text.toLowerCase()).toContain('swing weight');
  });
  it('uses an extracted grip to answer yes or no', () => {
    expect(answer('does the freezing come in g6', data).text).toMatch(/^Yes/);
    expect(answer('does the ld1000z come in g5', data).text).toMatch(/^(Yes|No)/);
  });
  it('reads a price cap as a filter rather than a racket name', () => {
    const res = answer('do you have anything under 4000', data);
    expect(res.intent).toBe('list_by_attribute');
    for (const id of res.rackets) {
      expect(catalog.find((r) => r.id === id)!.pricePhp!).toBeLessThanOrEqual(4000);
    }
  });
  it('lets a list request outrank a single-racket spec read', () => {
    const res = answer('show me head light rackets under 5000', data);
    expect(res.intent).toBe('list_by_attribute');
    for (const id of res.rackets) {
      const r = catalog.find((x) => x.id === id)!;
      expect(r.derived.balanceBucket).toBe('Head-Light');
      expect(r.pricePhp!).toBeLessThanOrEqual(5000);
    }
  });
  it('answers a question about one racket instead of recommending three others', () => {
    const res = answer('is the fire breathing good for a beginner', data);
    expect(res.intent).toBe('suitability');
    expect(res.rackets).toContain('fire-breathing');
  });
  it('treats "what should i buy" as a recommendation, not a purchase link', () => {
    expect(answer('i am a beginner what should i buy', data).intent).toBe('recommend');
  });
});

describe('measured answers', () => {
  it('names the real extreme and excludes unpublished figures', () => {
    const res = answer('which racket has the biggest head', data);
    const published = catalog.filter((r) => r.frameAreaCm2 !== null);
    const biggest = published.reduce((a, b) => (b.frameAreaCm2! > a.frameAreaCm2! ? b : a));
    expect(res.rackets).toContain(biggest.id);
    expect(res.text).toContain('excluded');
  });

  it('refuses to crown a winner when the band is shared across the lineup', () => {
    const res = answer('what is the heaviest racket you have', data);
    expect(res.text).toMatch(/none of them stands out/i);
  });

  it('respects a filter when ranking', () => {
    const res = answer('cheapest attack racket', data);
    for (const id of res.rackets) {
      expect(catalog.find((r) => r.id === id)!.classification).toBe('ATTACK');
    }
  });

  it('does not filter on the dimension it is ranking', () => {
    const res = answer('most flexible racket in the ld series', data);
    expect(res.intent).toBe('superlative');
    expect(res.text).toContain('LD series');
    expect(res.text).not.toContain('flexible-shafted');
  });

  it('answers a yes/no tension question against the published ceiling', () => {
    expect(answer('can i string the ld100zz at 30 lbs', data).text).toMatch(/^Yes/);
    expect(answer('can i string the ld100zz at 32 lbs', data).text).toMatch(/^No/);
  });

  it('breaks a straddling racket down by weight class instead of giving a flat yes/no', () => {
    const straddlers = catalog.filter(
      (r) => new Set(r.variants.map((v) => balanceBucket(v.balancePointMm))).size > 1,
    );
    expect(straddlers.length).toBeGreaterThan(0);

    for (const r of straddlers) {
      const res = answer(`is the ${r.name} head heavy`, data);
      // Every class is accounted for, whichever way the verdict lands.
      for (const v of r.variants) {
        expect(res.text).toContain(v.weightClass);
        expect(res.text).toContain(`${v.balancePointMm}mm`);
      }
    }

    // One that genuinely reaches head-heavy hedges rather than saying no.
    const reachesHeadHeavy = straddlers.find((r) =>
      r.variants.some((v) => balanceBucket(v.balancePointMm) === 'Head-Heavy'),
    )!;
    expect(answer(`is the ${reachesHeadHeavy.name} head heavy`, data).text).toContain(
      'depends on the weight class',
    );

    // One that never does answers no — and still shows its working.
    const neverHeadHeavy = straddlers.find(
      (r) => !r.variants.some((v) => balanceBucket(v.balancePointMm) === 'Head-Heavy'),
    );
    if (neverHeadHeavy) {
      expect(answer(`is the ${neverHeadHeavy.name} head heavy`, data).text).toMatch(/^No/);
    }
  });

  it('answers which of two is lighter before showing the table', () => {
    const res = answer('which is lighter, fire breathing or wind breathing', data);
    expect(res.intent).toBe('compare');
    expect(res.text.split('\n')[0]).toContain('Fire Breathing');
    expect(res.table).toBeDefined();
  });
});

describe('conversation memory', () => {
  it('carries the subject through a follow-up', () => {
    const [, tension, grip] = thread(
      'tell me about the ld100zz',
      'can i string it at 30 lbs',
      'does it come in g6',
    );
    expect(tension!.text).toContain('LD100ZZ');
    expect(grip!.text).toContain('LD100ZZ');
  });

  it('keeps both rackets for a comparative follow-up', () => {
    const [, forgiving] = thread('fire breathing vs thunder breathing', 'which one is more forgiving');
    expect(forgiving!.rackets).toEqual(expect.arrayContaining(['fire-breathing', 'thunder-breathing']));
    expect(forgiving!.text).toContain('Fire Breathing');
  });

  it('accumulates what the player says about themselves', () => {
    const replies = thread('i am a beginner', 'i mostly play doubles at the net', 'what do you recommend');
    expect(replies[1]!.intent).toBe('recommend');
    expect(replies[2]!.context.profile.skill).toBe('beginner');
    expect(replies[2]!.context.profile.context).toBe('doubles-front');
  });

  it('starts clean when no context is passed', () => {
    expect(answer('how much is it', data).intent).toBe('buy');
    expect(answer('how much is it', data).rackets).toHaveLength(0);
  });
});

describe('response content', () => {
  it('compare returns a table and a full-comparison link', () => {
    const res = answer('fire breathing vs thunder breathing', data);
    expect(res.table).toBeDefined();
    expect(res.table!.headers).toContain('Fire Breathing');
    expect(res.actions.some((a) => a.href.startsWith('/compare?ids='))).toBe(true);
  });
  it('spec_lookup answers with real data and offers a next step', () => {
    const res = answer('how heavy is the fire breathing', data);
    expect(res.text.toLowerCase()).toContain('fire breathing');
    expect(res.actions.length).toBeGreaterThan(0);
  });
  it('explain_term pulls from the glossary and links to the guide', () => {
    const res = answer('what is 4u', data);
    expect(res.text.length).toBeGreaterThan(40);
    expect(res.actions[0]!.href).toContain('/guide/racket-specs#');
  });
  it('buy states the price and offers a buy link', () => {
    const res = answer('how much is the fire breathing', data);
    expect(res.text).toContain('₱');
    expect(res.actions.some((a) => a.label.startsWith('Buy'))).toBe(true);
  });
  it('recommend runs the engine and offers the quiz', () => {
    const res = answer('which racket is best for smashing', data);
    expect(res.rackets.length).toBeGreaterThan(0);
    expect(res.actions.some((a) => a.href === '/finder')).toBe(true);
  });
  it('list_by_attribute returns only matching rackets', () => {
    const res = answer('which rackets are head-light', data);
    expect(res.rackets.length).toBeGreaterThan(0);
    for (const id of res.rackets) {
      expect(catalog.find((r) => r.id === id)!.derived.balanceBucket).toBe('Head-Light');
    }
  });
  it('an empty filter result says what would loosen it', () => {
    const res = answer('anything under 1000', data);
    expect(res.text).toContain('Nothing in the lineup');
    expect(res.text).toContain('cheapest');
  });
  it('is honest about not being an AI', () => {
    const res = answer('are you a bot', data);
    expect(res.text).toContain('not an AI');
  });
  it('fallback never dead-ends: always offers suggestions and the quiz', () => {
    const res = answer('qwerty zxcv', data);
    expect(res.fellBack).toBe(true);
    expect(res.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(res.actions.some((a) => a.href === '/finder')).toBe(true);
  });
  it('never emits an undefined, null or NaN in its text', () => {
    const queries = SAMPLES.map((s) => s.q).concat([
      'what is vibranium', 'stiffest racket', 'anything under 1000',
      'which racket has the biggest head', 'how long is the wind breathing',
    ]);
    for (const q of queries) {
      const res = answer(q, data);
      expect(res.text).not.toMatch(/undefined|null|NaN/);
    }
  });
});
