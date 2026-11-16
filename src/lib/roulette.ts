// Racket Roulette: narrow the wheel to rackets that fit, spin, and land on one.
// The wheel is honest — every racket on it has an equal slice and an equal chance;
// the filters are the only thing that "tilts" it. Pure so the maths can be tested.

export interface WheelRacket {
  id: string;
  name: string;
  classLabel: string;
  series: string;
  weightClasses: string[];
  pricePhp: number | null;
}

export interface WheelFilters {
  styles: Set<string>;
  weights: Set<string>;
  series: Set<string>;
  /** Highest price to include; null = any. Unpriced rackets stay on only for "any". */
  maxPrice: number | null;
}

export function filterWheel<T extends WheelRacket>(rackets: T[], f: WheelFilters): T[] {
  return rackets.filter((r) => {
    if (f.styles.size && !f.styles.has(r.classLabel)) return false;
    if (f.series.size && !f.series.has(r.series)) return false;
    if (f.weights.size && !r.weightClasses.some((w) => f.weights.has(w))) return false;
    if (f.maxPrice !== null && (r.pricePhp === null || r.pricePhp > f.maxPrice)) return false;
    return true;
  });
}

/** Uniform index in [0, n) — crypto-backed where available, so no slice is favoured. */
export function randomIndex(n: number, rand: () => number = secureRandom): number {
  return Math.min(n - 1, Math.floor(rand() * n));
}

function secureRandom(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 2 ** 32;
  }
  return Math.random();
}

/**
 * The wheel rotation (degrees, clockwise) that brings slice `index` of `count` under a
 * pointer at 12 o'clock, at least `minTurns` full turns past `current`. Slice i spans
 * [i·s, (i+1)·s] clockwise from the top before rotation. `offset` (−0.5…0.5 of a slice)
 * stops it landing dead centre every time, so it feels like a real wheel.
 */
export function landingRotation(
  current: number,
  index: number,
  count: number,
  minTurns = 5,
  offset = 0,
): number {
  const slice = 360 / count;
  const clamped = Math.max(-0.4, Math.min(0.4, offset));
  const target = (((360 - (index + 0.5 + clamped) * slice) % 360) + 360) % 360;
  const base = current - (((current % 360) + 360) % 360);
  let next = base + target + 360 * minTurns;
  while (next - current < 360 * minTurns) next += 360;
  return next;
}

/** Which slice sits under the 12 o'clock pointer at a given rotation. */
export function sliceAt(rotation: number, count: number): number {
  const slice = 360 / count;
  const a = (((-rotation % 360) + 360) % 360);
  return Math.floor(a / slice) % count;
}
