// A tiny physics step for the spec map's "racket balls" view: every racket is a ball that
// springs toward its place on the chosen spec, collides with its neighbours (so rackets
// with similar figures pile into a beeswarm instead of hiding each other), and can be
// grabbed and flung. Pure and framework-free so it can be tested and stepped offline
// (reduced motion settles the layout in one go instead of animating it).

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Where the spring pulls the ball: its spec position and group row. */
  tx: number;
  ty: number;
  /** Held by the pointer: the step neither springs nor pushes it. */
  pinned: boolean;
}

export interface World {
  width: number;
  height: number;
  /** Spring strength toward the target, per step. */
  spring?: number;
  /** Velocity kept per step (0…1). */
  damping?: number;
  /** Collision relaxation passes per step. */
  iterations?: number;
}

/** Consecutive low-energy steps before a layout counts as settled. */
export const QUIET_STEPS = 12;

/** Advance one step. Returns the kinetic energy left, so callers can sleep when settled. */
export function step(bodies: Body[], world: World): number {
  const k = world.spring ?? 0.035;
  const damping = world.damping ?? 0.82;
  const iterations = world.iterations ?? 3;

  for (const b of bodies) {
    if (b.pinned) continue;
    b.vx = (b.vx + (b.tx - b.x) * k) * damping;
    b.vy = (b.vy + (b.ty - b.y) * k) * damping;
    b.x += b.vx;
    b.y += b.vy;
  }

  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        const min = a.r + b.r + 2; // 2px surface gap between marks
        if (d2 >= min * min) continue;
        if (d2 === 0) {
          // Exactly stacked: nudge apart on a deterministic diagonal.
          dx = (i % 2 ? 1 : -1) * 0.5;
          dy = 0.5;
          d2 = 0.5;
        }
        const d = Math.sqrt(d2);
        const overlap = (min - d) / d;
        const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5;
        const wb = b.pinned ? 0 : a.pinned ? 1 : 0.5;
        a.x -= dx * overlap * wa;
        a.y -= dy * overlap * wa;
        b.x += dx * overlap * wb;
        b.y += dy * overlap * wb;
      }
    }
  }

  let energy = 0;
  for (const b of bodies) {
    if (!b.pinned) {
      // Walls: keep every ball fully inside, with a soft bounce.
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
      if (b.x > world.width - b.r) { b.x = world.width - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
      if (b.y > world.height - b.r) { b.y = world.height - b.r; b.vy = -Math.abs(b.vy) * 0.5; }
    }
    energy += b.vx * b.vx + b.vy * b.vy;
  }
  return energy;
}

/** Run steps until the layout is still (or a cap is hit) — the reduced-motion path. */
export function settle(bodies: Body[], world: World, maxSteps = 600): void {
  // The spring overshoots, so a ball is momentarily still at each turnaround: only call
  // it settled after a run of quiet steps.
  let quiet = 0;
  for (let i = 0; i < maxSteps; i++) {
    quiet = step(bodies, world) < 0.01 ? quiet + 1 : 0;
    if (quiet >= QUIET_STEPS) break;
  }
  for (const b of bodies) {
    b.vx = 0;
    b.vy = 0;
  }
}
