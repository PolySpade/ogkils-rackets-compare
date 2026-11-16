// "Racket balls": every OGKILS racket as a ball wearing its artwork. Balls spring toward
// their place on the spec you pick and pile up where figures are close, so clusters show
// which rackets play alike. Grab and fling them, tap one for its figures, add it to the
// compare tray. Positions are written straight to the DOM each frame; React only renders
// when the controls, hover or selection change.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { compareIds, toggleCompare, MAX_COMPARE } from '../../stores/compare';
import { AXES, AXIS_ORDER, formatAxisValue, niceTicks, type AxisKey } from '../../lib/specmap';
import { QUIET_STEPS, settle, step, type Body } from '../../lib/balls';

export interface BallRacket {
  id: string;
  name: string;
  classification: string;
  classLabel: string;
  balanceBucket: string;
  series: string;
  weightClasses: string[];
  thumb: string | null;
  priceLabel: string | null;
  /** Midpoint across weight classes; null when the figure isn't published. */
  values: Record<AxisKey, number | null>;
  /** [min, max] across weight classes, for the label. */
  ranges: Record<AxisKey, [number, number] | null>;
}

type GroupKey = 'none' | 'classification' | 'balanceBucket' | 'series';

const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: 'none', label: 'All together' },
  { key: 'classification', label: 'By style' },
  { key: 'balanceBucket', label: 'By balance' },
  { key: 'series', label: 'By series' },
];

const GROUP_ORDER: Record<Exclude<GroupKey, 'none'>, string[]> = {
  classification: ['Attack', 'Speed', 'Control', 'All-Around'],
  balanceBucket: ['Head-Heavy', 'Even', 'Head-Light'],
  series: ['Breathing', 'LD', 'Other'],
};

interface Props {
  rackets: BallRacket[];
}

const PAD_X = 28;
const AXIS_H = 52;

function groupOf(r: BallRacket, g: GroupKey): string {
  if (g === 'none') return '';
  if (g === 'classification') return r.classLabel;
  if (g === 'balanceBucket') return r.balanceBucket;
  return r.series;
}

function rangeLabel(axisKey: AxisKey, r: BallRacket): string {
  const axis = AXES[axisKey];
  const range = r.ranges[axisKey];
  if (!range) return 'Not published';
  if (range[0] === range[1]) return formatAxisValue(axis, range[0]);
  const lo = formatAxisValue(axis, range[0]);
  const hi = formatAxisValue(axis, range[1]);
  return axis.unit ? `${lo.replace(` ${axis.unit}`, '')}–${hi}` : `${lo} – ${hi}`;
}

export default function RacketBalls({ rackets }: Props) {
  const [axisKey, setAxisKey] = useState<AxisKey>('balance');
  const [group, setGroup] = useState<GroupKey>('none');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [reduced, setReduced] = useState(false);
  const ids = useStore(compareIds);

  const arenaRef = useRef<HTMLDivElement>(null);
  const ballRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const bodies = useRef<Map<string, Body>>(new Map());
  const raf = useRef<number | null>(null);
  const quiet = useRef(0);
  const drag = useRef<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
  } | null>(null);

  const mobile = width > 0 && width < 640;
  const radius = mobile ? 17 : 25;

  // --- Layout: groups, height, the spec scale -----------------------------------------
  const groupNames = useMemo(() => {
    if (group === 'none') return [''];
    const present = new Set(rackets.filter((r) => r.values[axisKey] !== null).map((r) => groupOf(r, group)));
    return GROUP_ORDER[group].filter((g) => present.has(g));
  }, [group, rackets, axisKey]);

  const rowH = group === 'none' ? (mobile ? 220 : 250) : mobile ? 130 : 150;
  const height = groupNames.length * rowH + AXIS_H;
  const labelW = group === 'none' ? 0 : mobile ? 0 : 92;

  const axis = AXES[axisKey];
  // A racket without a published figure for this spec is left off the arena entirely —
  // no guessed position — and named under it instead.
  const shown = rackets.filter((r) => r.values[axisKey] !== null);
  const hidden = rackets.filter((r) => r.values[axisKey] === null);
  const published = shown.map((r) => r.values[axisKey] as number);
  const domain: [number, number] = useMemo(() => {
    if (axis.ticks) {
      const ts = axis.ticks.map((t) => t.value);
      return [Math.min(...ts), Math.max(...ts)];
    }
    if (!published.length) return [0, 1];
    const lo = Math.min(...published);
    const hi = Math.max(...published);
    return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisKey, rackets]);

  const plotL = PAD_X + labelW + radius;
  const plotR = Math.max(plotL + 50, width - PAD_X - radius);
  const xOf = (v: number) =>
    plotL + ((v - domain[0]) / (domain[1] - domain[0] || 1)) * (plotR - plotL);

  const ticks = axis.ticks
    ? axis.ticks.map((t) => ({ value: t.value, label: t.label }))
    : niceTicks(domain[0], domain[1], mobile ? 4 : 6).map((t) => ({ value: t, label: formatAxisValue(axis, t) }));

  const targetOf = (r: BallRacket): { x: number; y: number } => {
    const row = Math.max(0, groupNames.indexOf(groupOf(r, group)));
    const y = row * rowH + rowH / 2;
    const v = r.values[axisKey];
    return { x: v === null ? width / 2 : xOf(v), y };
  };

  // --- Measure ------------------------------------------------------------------------
  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, []);

  // --- Physics loop -------------------------------------------------------------------
  const paint = () => {
    for (const [id, b] of bodies.current) {
      const el = ballRefs.current.get(id);
      if (el) el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
    }
  };

  // The loop outlives a render, so it reads the arena size from a ref, not a closure.
  const worldRef = useRef({ width: 0, height: 0 });
  worldRef.current = { width, height };
  const world = () => worldRef.current;

  const tick = () => {
    const energy = step([...bodies.current.values()], world());
    paint();
    quiet.current = energy < 0.01 ? quiet.current + 1 : 0;
    if (drag.current || quiet.current < QUIET_STEPS) raf.current = requestAnimationFrame(tick);
    else raf.current = null;
  };

  const wake = () => {
    if (reduced) {
      settle([...bodies.current.values()], world());
      paint();
      return;
    }
    quiet.current = 0;
    if (raf.current === null) raf.current = requestAnimationFrame(tick);
  };

  // Retarget whenever the spec, grouping or size changes; new balls drop in from above.
  useEffect(() => {
    if (!width) return;
    const showing = new Set(shown.map((r) => r.id));
    for (const [id] of bodies.current) if (!showing.has(id)) bodies.current.delete(id);
    shown.forEach((r, i) => {
      const t = targetOf(r);
      const existing = bodies.current.get(r.id);
      if (existing) {
        existing.tx = t.x;
        existing.ty = t.y;
        existing.r = radius;
      } else {
        bodies.current.set(r.id, {
          x: t.x + ((i * 37) % 60) - 30,
          y: -radius * 2 - (i % 6) * 30,
          vx: 0,
          vy: 0,
          r: radius,
          tx: t.x,
          ty: t.y,
          pinned: false,
        });
      }
    });
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisKey, group, width, height, radius, reduced]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  // --- Pointer: drag, fling, tap ------------------------------------------------------
  const local = (e: React.PointerEvent) => {
    const rect = arenaRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const b = bodies.current.get(id);
    if (!b || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    b.pinned = true;
    b.vx = 0;
    b.vy = 0;
    drag.current = {
      id, pointerId: e.pointerId, dx: b.x - p.x, dy: b.y - p.y,
      startX: p.x, startY: p.y, moved: false,
      lastX: p.x, lastY: p.y, lastT: performance.now(), vx: 0, vy: 0,
    };
    wake();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const b = bodies.current.get(d.id)!;
    const p = local(e);
    if (Math.hypot(p.x - d.startX, p.y - d.startY) > 5) d.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    // Velocity in px per frame (~16ms), smoothed so a flick reads as a flick.
    d.vx = d.vx * 0.5 + ((p.x - d.lastX) / dt) * 16 * 0.5;
    d.vy = d.vy * 0.5 + ((p.y - d.lastY) / dt) * 16 * 0.5;
    d.lastX = p.x;
    d.lastY = p.y;
    d.lastT = now;
    b.x = Math.min(width - b.r, Math.max(b.r, p.x + d.dx));
    b.y = Math.min(height - b.r, Math.max(b.r, p.y + d.dy));
    if (reduced) paint();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const b = bodies.current.get(d.id)!;
    b.pinned = false;
    if (d.moved && !reduced) {
      b.vx = Math.max(-45, Math.min(45, d.vx));
      b.vy = Math.max(-45, Math.min(45, d.vy));
    } else if (!d.moved) {
      setSelectedId((cur) => (cur === d.id ? null : d.id));
    }
    drag.current = null;
    wake();
  };

  const selected = shown.find((r) => r.id === selectedId) ?? null;
  const selectedOn = selected ? ids.includes(selected.id) : false;
  const full = ids.length >= MAX_COMPARE;

  return (
    <section className="balls" aria-labelledby="balls-title">
      <div className="balls-head">
        <div>
          <p className="section-kicker">Play with the lineup</p>
          <h2 id="balls-title" className="display-heading mt-1 text-3xl text-fg sm:text-4xl">
            Racket balls
          </h2>
          <p className="prose-measure mt-2 text-sm text-fg-muted">
            Every racket is a ball. Pick a spec and they roll to their place on it — rackets
            that pile up together play alike. Drag and fling them, tap one for its figures.
          </p>
        </div>
      </div>

      <div className="balls-controls">
        <div role="group" aria-label="Spec to sort by" className="flex flex-wrap gap-1.5">
          {AXIS_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={axisKey === k}
              onClick={() => setAxisKey(k)}
            >
              {AXES[k].label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Group rackets">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={arenaRef}
        className="balls-arena"
        style={{ height }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {/* Group rows */}
        {group !== 'none' &&
          groupNames.map((g, i) => (
            <div key={g} className="balls-row" style={{ top: i * rowH, height: rowH }}>
              <span className="balls-row-label">{g}</span>
            </div>
          ))}

        {/* Spec scale */}
        {width > 0 && (
          <div className="balls-axis" style={{ top: height - AXIS_H }} aria-hidden="true">
            {ticks.map((t) => (
              <span key={t.value} className="balls-tick" style={{ left: xOf(t.value) }}>
                {t.label}
              </span>
            ))}
            <span className="balls-hint" style={{ left: plotL }}>← {axis.lowHint}</span>
            <span className="balls-hint is-end" style={{ left: plotR }}>{axis.highHint} →</span>
          </div>
        )}

        {/* Balls */}
        {shown.map((r) => {
          const on = ids.includes(r.id);
          const isSel = selectedId === r.id;
          const showTip = hoverId === r.id && !isSel;
          return (
            <button
              key={r.id}
              ref={(el) => {
                if (el) ballRefs.current.set(r.id, el);
                else ballRefs.current.delete(r.id);
              }}
              type="button"
              className={`ball${on ? ' is-on' : ''}${isSel ? ' is-selected' : ''}`}
              style={{ width: radius * 2, height: radius * 2 }}
              aria-label={`${r.name}, ${r.classLabel}. ${axis.label}: ${rangeLabel(axisKey, r)}.${on ? ' In your comparison.' : ''}`}
              aria-pressed={isSel}
              onPointerDown={onPointerDown(r.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerEnter={() => setHoverId(r.id)}
              onPointerLeave={() => setHoverId((h) => (h === r.id ? null : h))}
              onFocus={() => setHoverId(r.id)}
              onBlur={() => setHoverId((h) => (h === r.id ? null : h))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId((cur) => (cur === r.id ? null : r.id));
                }
              }}
            >
              {r.thumb ? (
                <img src={r.thumb} alt="" draggable={false} />
              ) : (
                <span className="ball-initials">{r.name.slice(0, 2)}</span>
              )}
              {(showTip || isSel) && (
                <span className="ball-tip" role="tooltip">
                  <span className="block font-bold text-fg">{r.name}</span>
                  <span className="tnum block text-fg-muted">{rangeLabel(axisKey, r)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hidden.length > 0 && (
        <p className="mt-2 text-xs text-fg-faint">
          Not shown — {axis.label.toLowerCase()} not published:{' '}
          {hidden.map((r) => r.name).join(', ')}.
        </p>
      )}

      {/* Selected racket */}
      <div className="balls-panel" aria-live="polite">
        {selected ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              {selected.thumb && (
                <img src={selected.thumb} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
              )}
              <div className="min-w-0">
                <p className="category-label">{selected.classLabel} · {selected.series === 'Other' ? 'OGKILS' : `${selected.series} series`}</p>
                <p className="display-heading truncate text-xl text-fg">{selected.name}</p>
              </div>
            </div>
            <dl className="balls-facts">
              <div>
                <dt>{axis.label}</dt>
                <dd className="tnum">{rangeLabel(axisKey, selected)}</dd>
              </div>
              <div>
                <dt>Weights</dt>
                <dd>{selected.weightClasses.join(' · ')}</dd>
              </div>
              {selected.priceLabel && (
                <div>
                  <dt>Price</dt>
                  <dd className="tnum">{selected.priceLabel}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`action-sm press ${selectedOn ? 'secondary-action' : 'primary-action'}`}
                aria-pressed={selectedOn}
                disabled={!selectedOn && full}
                onClick={() => toggleCompare(selected.id)}
              >
                {selectedOn ? '✓ In comparison' : full ? 'Compare is full' : '＋ Compare'}
              </button>
              <a href={`/rackets/${selected.id}`} className="secondary-action action-sm press">
                View specs →
              </a>
              {ids.length >= 2 && (
                <a href={`/compare?ids=${ids.join(',')}`} className="secondary-action action-sm press">
                  Compare {ids.length} →
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            Tap a ball to see its figures. Balls ringed in lime are in your comparison.
          </p>
        )}
      </div>
    </section>
  );
}
