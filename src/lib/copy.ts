// Generated, fact-based prose used when a hand-authored override is absent.
// Everything here is derived from real specs — no invented claims (product.md §1, §4).
import { classMeta } from './classification';
import { formatStiffness, formatWeightClasses, racketBalanceRange, trustedGripLengthMm } from './format';
import type { Racket } from './types';

const BUCKET_PHRASE = {
  'Head-Light': 'head-light (weight toward the handle, quicker to swing and defend with)',
  Even: 'even-balanced (a middle-ground feel)',
  'Head-Heavy': 'head-heavy (weight toward the head, more power behind a smash)',
} as const;

/**
 * A "who it's for" paragraph built entirely from this racket's own specs, used when
 * `whoItsFor` isn't set in overrides. Teaches while it describes (§1).
 */
export function whoItsForFallback(r: Racket): string {
  const meta = classMeta(r.classification);
  const stiff = formatStiffness(r.stiffness, r.derived.stiffnessWordConflict);
  const bucket = BUCKET_PHRASE[r.derived.balanceBucket];
  const shaftWord = stiff.label ? `a ${stiff.label.toLowerCase()} shaft` : `a shaft measured ${stiff.primary}`;

  return (
    `${r.name} is an OGKILS ${meta.label.toLowerCase()} frame — ${meta.blurb.toLowerCase()} ` +
    `Its balance point sits at ${racketBalanceRange(r)}mm, making it ${bucket}, on ${shaftWord}. ` +
    `It comes in ${formatWeightClasses(r.variants)}. If you're not sure it fits how you play, ` +
    `the finder can match it against how you actually swing.`
  );
}

/**
 * A second fact-based paragraph on how the frame plays, so every racket page carries the
 * unique prose search engines want (§10) even before Donald writes marketing copy.
 */
export function howItPlaysFallback(r: Racket): string {
  const stiff = formatStiffness(r.stiffness, r.derived.stiffnessWordConflict);
  const grip = trustedGripLengthMm(r);
  const maxTension = Math.max(...r.variants.map((v) => v.maxTensionLbs));
  const grips = [...new Set(r.variants.flatMap((v) => v.gripSizes))].sort().join(' and ');
  const shaftFeel =
    r.shaftDiameterMm <= 6.6
      ? 'a thinner shaft that cuts through the air for quicker swings'
      : 'a fuller shaft that stays stable through powerful hits';

  const stiffnessNote = stiff.label
    ? `The ${stiff.label.toLowerCase()} shaft ${stiff.label.includes('Stiff') ? 'rewards clean, well-timed contact with a crisp, controlled response' : 'loads and springs back to add repulsion, which is more forgiving of imperfect timing'}.`
    : `Its shaft is measured at ${stiff.primary}.`;

  return (
    `Built from ${r.materials.join(', ').toLowerCase()}, the ${r.name} pairs ${shaftFeel} ` +
    `(${r.shaftDiameterMm}mm) with a ${r.frameHoleType.toLowerCase()} frame. ` +
    `${stiffnessNote} ` +
    `It can be strung up to ${maxTension} lbs — a ceiling rather than a recommendation, so ` +
    `string comfortably below it for durability and cleaner control. ` +
    `You'll find it in ${grips} grip${grips.includes('and') ? 's' : ''}` +
    `${grip ? `, on a ${grip}mm handle` : ''}, at a total length of ${r.racketLengthMm}mm. ` +
    `Use the spec guide if any of these numbers are unfamiliar, or line it up against another ` +
    `frame in the comparison tool to see the differences that matter for your game.`
  );
}
