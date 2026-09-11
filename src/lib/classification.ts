// Maps performance classifications to the brochure's shared turquoise treatment and a
// plain-language gloss. The written label carries the meaning; color does not.

import type { Classification } from './types';

interface ClassMeta {
  /** CSS var name for the accent (matches @theme in global.css). */
  token: string;
  /** Tailwind text/border/bg colour key. */
  key: 'attack' | 'speed' | 'control' | 'allaround';
  label: string;
  /** One-line "what it's built for". */
  blurb: string;
}

export const CLASSIFICATION_META: Record<Classification, ClassMeta> = {
  ATTACK: {
    token: 'var(--color-attack)',
    key: 'attack',
    label: 'Attack',
    blurb: 'Head-heavy power — built to smash.',
  },
  SPEED: {
    token: 'var(--color-speed)',
    key: 'speed',
    label: 'Speed',
    blurb: 'Fast, flat exchanges and quick defence.',
  },
  CONTROL: {
    token: 'var(--color-control)',
    key: 'control',
    label: 'Control',
    blurb: 'Placement and a steady, precise feel.',
  },
  'ALL-AROUND': {
    token: 'var(--color-allaround)',
    key: 'allaround',
    label: 'All-Around',
    blurb: 'Balanced and adaptable — a safe default.',
  },
};

export function classMeta(c: Classification): ClassMeta {
  return CLASSIFICATION_META[c];
}
