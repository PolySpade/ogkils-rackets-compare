import { describe, expect, it } from 'vitest';
import { settle, step, type Body } from './balls';

const body = (x: number, y: number, tx = x, ty = y): Body => ({ x, y, vx: 0, vy: 0, r: 10, tx, ty, pinned: false });
const world = { width: 400, height: 200 };

describe('racket balls physics', () => {
  it('springs a ball to its target', () => {
    const b = body(20, 20, 300, 100);
    settle([b], world);
    expect(b.x).toBeCloseTo(300, 0);
    expect(b.y).toBeCloseTo(100, 0);
  });

  it('keeps balls sharing a target from overlapping', () => {
    const bs = [body(200, 100), body(200, 100), body(200, 100)];
    settle(bs, world);
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++)
        expect(Math.hypot(bs[i]!.x - bs[j]!.x, bs[i]!.y - bs[j]!.y)).toBeGreaterThanOrEqual(21.9);
  });

  it('never moves a pinned ball and keeps others inside the walls', () => {
    const held = { ...body(200, 100), pinned: true };
    const other = body(200, 100, 999, -50);
    for (let i = 0; i < 200; i++) step([held, other], world);
    expect(held.x).toBe(200);
    expect(other.x).toBeLessThanOrEqual(390);
    expect(other.y).toBeGreaterThanOrEqual(10);
  });
});
