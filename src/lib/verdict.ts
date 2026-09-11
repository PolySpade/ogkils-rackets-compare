// Generated comparative prose for the SEO versus pages (product.md §10 wants ≥150 words
// of unique copy per comparison). Everything is derived from real specs — no invented
// claims. A hand-authored `verdict` in comparisons.json overrides this when present.
import { classMeta } from './classification';
import { formatStiffness, formatPrice } from './format';
import type { Racket } from './types';

const BUCKET = {
  'Head-Light': 'head-light, with the weight toward the handle for a quicker, more defensive feel',
  Even: 'even-balanced, a neutral feel that neither rushes nor loads the head',
  'Head-Heavy': 'head-heavy, carrying weight toward the head for more power on the smash',
} as const;

function firstVariant(r: Racket) {
  return r.variants[0]!;
}

export function generateVerdict(a: Racket, b: Racket): string {
  const ma = classMeta(a.classification);
  const mb = classMeta(b.classification);
  const sa = formatStiffness(a.stiffness, a.derived.stiffnessWordConflict);
  const sb = formatStiffness(b.stiffness, b.derived.stiffnessWordConflict);
  const va = firstVariant(a);
  const vb = firstVariant(b);

  const sentences: string[] = [];

  // Intro / classification
  if (a.classification === b.classification) {
    sentences.push(
      `The ${a.name} and the ${b.name} are both ${ma.label.toLowerCase()} rackets, so the choice comes down to feel rather than role — ${ma.blurb.toLowerCase()}`,
    );
  } else {
    sentences.push(
      `The ${a.name} is an ${ma.label.toLowerCase()} racket (${ma.blurb.toLowerCase()}), while the ${b.name} is a ${mb.label.toLowerCase()} one (${mb.blurb.toLowerCase()}) — a genuine difference in what each is built to do.`,
    );
  }

  // Balance
  sentences.push(
    `In the hand, the ${a.name} is ${BUCKET[a.derived.balanceBucket]} (balance point ${va.balancePointMm}mm), and the ${b.name} is ${BUCKET[b.derived.balanceBucket]} (${vb.balancePointMm}mm).`,
  );

  // Stiffness
  sentences.push(
    `The ${a.name}'s shaft reads ${sa.label ? sa.label.toLowerCase() : sa.primary}, versus ${sb.label ? sb.label.toLowerCase() : sb.primary} on the ${b.name} — the stiffer of the two rewards a faster, cleaner swing while the softer one adds repulsion and forgiveness.`,
  );

  // Weight
  sentences.push(
    `On weight, the ${a.name} comes in ${a.variants.map((v) => v.weightClass).join('/')} and the ${b.name} in ${b.variants.map((v) => v.weightClass).join('/')}; lighter frames move faster in defence, heavier ones put more behind an attack.`,
  );

  // Price / availability
  const pa = formatPrice(a.pricePhp);
  const pb = formatPrice(b.pricePhp);
  if (pa && pb) {
    const cheaper = (a.pricePhp ?? 0) <= (b.pricePhp ?? 0) ? a : b;
    sentences.push(
      `At ${pa} against ${pb}, the ${cheaper.name} is the more affordable of the two — worth weighing against the differences above rather than in isolation.`,
    );
  }

  // Guidance
  sentences.push(
    `If you play a power game, lean toward the more head-heavy, more attack-oriented of the two; if you value speed and control in the flat exchanges, the lighter, more even option will suit you better. Switch the weight class on either column to see how the numbers move before you decide.`,
  );

  return sentences.join(' ');
}
