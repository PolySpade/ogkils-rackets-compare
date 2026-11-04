// Interactive spec map: every racket × weight class as a point on two chosen spec axes.
// Neutral marks with a shape per classification (DESIGN.md: classification is never
// carried by colour); teal marks + name labels for the focused racket and anything in
// the compare tray. Hover/tap a point for its specs; the table view carries every value
// without hovering.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { compareIds, toggleCompare, MAX_COMPARE } from '../../stores/compare';
import {
  AXES,
  AXIS_ORDER,
  PRESETS,
  axisDomain,
  formatAxisValue,
  niceTicks,
  type AxisKey,
  type SpecPoint,
} from '../../lib/specmap';
import type { Classification, WeightClass } from '../../lib/types';

interface Props {
  points: SpecPoint[];
  /** One-sentence glossary gloss per axis. */
  axisHelp: Partial<Record<AxisKey, string>>;
}

const CLASSES: Classification[] = ['ATTACK', 'SPEED', 'CONTROL', 'ALL-AROUND'];
const CLASS_LABEL: Record<Classification, string> = {
  ATTACK: 'Attack',
  SPEED: 'Speed',
  CONTROL: 'Control',
  'ALL-AROUND': 'All-around',
};
const WEIGHTS: WeightClass[] = ['3U', '4U', '5U', '6U'];

const M = { top: 20, right: 20, bottom: 58, left: 64 };
const HIT_RADIUS = 24;

/** Marker path centred on 0,0 — size ≈ 10px so it reads at ≥ 8px. */
function shapePath(c: Classification, s = 5): string {
  switch (c) {
    case 'ATTACK': // triangle
      return `M0,${-s * 1.2} L${s * 1.1},${s * 0.8} L${-s * 1.1},${s * 0.8} Z`;
    case 'SPEED': // diamond
      return `M0,${-s * 1.25} L${s * 1.25},0 L0,${s * 1.25} L${-s * 1.25},0 Z`;
    case 'CONTROL': // square
      return `M${-s},${-s} H${s} V${s} H${-s} Z`;
    default: // circle
      return `M${-s},0 a${s},${s} 0 1,0 ${s * 2},0 a${s},${s} 0 1,0 ${-s * 2},0`;
  }
}

function ShapeKey({ c }: { c: Classification }) {
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true" className="shrink-0">
      <path d={shapePath(c, 4.5)} className="specmap-key" />
    </svg>
  );
}

/** Spread points that share exact coordinates into a small sunflower so all stay visible. */
function dodge(n: number, i: number, spacing = 9): [number, number] {
  if (n === 1) return [0, 0];
  const r = spacing * Math.sqrt(i + 0.5) * 0.75;
  const a = i * 2.39996; // golden angle
  return [r * Math.cos(a), r * Math.sin(a)];
}

function readUrl(): { x: AxisKey; y: AxisKey } | null {
  const p = new URLSearchParams(window.location.search);
  const x = p.get('x') as AxisKey | null;
  const y = p.get('y') as AxisKey | null;
  if (x && y && x !== y && x in AXES && y in AXES) return { x, y };
  return null;
}

export default function SpecMap({ points, axisHelp }: Props) {
  const [xKey, setXKey] = useState<AxisKey>(PRESETS[0]!.x);
  const [yKey, setYKey] = useState<AxisKey>(PRESETS[0]!.y);
  const [classOn, setClassOn] = useState<Set<Classification>>(new Set());
  const [weightOn, setWeightOn] = useState<Set<WeightClass>>(new Set());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(720);
  const wrapRef = useRef<HTMLDivElement>(null);
  const compared = useStore(compareIds);

  // Restore a shared view, then keep the URL in step so a view can be linked.
  useEffect(() => {
    const fromUrl = readUrl();
    if (fromUrl) {
      setXKey(fromUrl.x);
      setYKey(fromUrl.y);
    }
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('x', xKey);
    p.set('y', yKey);
    history.replaceState(null, '', `?${p.toString()}`);
  }, [xKey, yKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(300, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 560 ? Math.round(width * 1.05) : Math.min(560, Math.round(width * 0.62));
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;
  const xAxis = AXES[xKey];
  const yAxis = AXES[yKey];

  const plotted = useMemo(
    () => points.filter((p) => p.values[xKey] !== null && p.values[yKey] !== null),
    [points, xKey, yKey],
  );
  const missingRackets = useMemo(() => {
    const shown = new Set(plotted.map((p) => p.id));
    return [...new Map(points.filter((p) => !shown.has(p.id)).map((p) => [p.id, p.name])).values()];
  }, [points, plotted]);

  const xDom = axisDomain(xAxis, plotted.map((p) => p.values[xKey]!));
  const yDom = axisDomain(yAxis, plotted.map((p) => p.values[yKey]!));
  const sx = (v: number) => M.left + ((v - xDom[0]) / (xDom[1] - xDom[0])) * innerW;
  const sy = (v: number) => M.top + innerH - ((v - yDom[0]) / (yDom[1] - yDom[0])) * innerH;
  const xTicks = xAxis.ticks ?? niceTicks(xDom[0], xDom[1], width < 560 ? 4 : 6).map((v) => ({ value: v, label: String(v) }));
  const yTicks = yAxis.ticks ?? niceTicks(yDom[0], yDom[1], 5).map((v) => ({ value: v, label: String(v) }));

  const isDimmed = (p: SpecPoint) =>
    (classOn.size > 0 && !classOn.has(p.classification)) || (weightOn.size > 0 && !weightOn.has(p.weightClass));

  // Screen positions, with coincident points dodged apart.
  const positioned = useMemo(() => {
    const groups = new Map<string, SpecPoint[]>();
    for (const p of plotted) {
      const k = `${p.values[xKey]}|${p.values[yKey]}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const out: Array<{ p: SpecPoint; x: number; y: number }> = [];
    for (const g of groups.values()) {
      g.forEach((p, i) => {
        const [dx, dy] = dodge(g.length, i);
        out.push({ p, x: sx(p.values[xKey]!) + dx, y: sy(p.values[yKey]!) + dy });
      });
    }
    return out;
    // sx/sy derive from these inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted, xKey, yKey, width, height]);

  const byKey = new Map(positioned.map((o) => [o.p.key, o]));
  const hovered = hoverKey ? byKey.get(hoverKey) : undefined;
  const focusId = hovered?.p.id ?? selectedId;
  const highlighted = new Set<string>([...compared, ...(focusId ? [focusId] : [])]);

  // Variants of each highlighted racket, joined lightest → heaviest.
  const trails = [...highlighted]
    .map((id) => positioned.filter((o) => o.p.id === id).sort((a, b) => a.p.weightRange[0] - b.p.weightRange[0]))
    .filter((t) => t.length > 0);

  // One name label per highlighted racket, nudged down until it clears earlier labels.
  type Box = { l: number; r: number; t: number; b: number };
  const labels: Array<{ id: string; text: string; x: number; y: number; anchor: 'start' | 'end'; box: Box }> = [];
  for (const t of trails) {
    const top = t.reduce((a, b) => (b.y < a.y ? b : a));
    const text = top.p.name;
    const estW = text.length * 6.6 + 8;
    const anchor = top.x + 10 + estW > width - M.right ? 'end' : 'start';
    const x = anchor === 'start' ? top.x + 9 : top.x - 9;
    const boxAt = (yy: number): Box => ({
      l: anchor === 'start' ? x : x - estW,
      r: anchor === 'start' ? x + estW : x,
      t: yy - 11,
      b: yy + 3,
    });
    const overlaps = (a: Box) => labels.some(({ box: o }) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t);
    let y = Math.max(M.top + 10, top.y - 10);
    for (let tries = 0; tries < 6 && overlaps(boxAt(y)); tries++) y += 15;
    labels.push({ id: top.p.id, text, x, y, anchor, box: boxAt(y) });
  }

  function nearest(clientX: number, clientY: number): string | null {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const py = ((clientY - rect.top) / rect.height) * height;
    let best: string | null = null;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (const o of positioned) {
      if (isDimmed(o.p)) continue;
      const d = (o.x - px) ** 2 + (o.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o.p.key;
      }
    }
    return best;
  }

  function select(key: string | null) {
    const p = key ? byKey.get(key)?.p : undefined;
    setSelectedKey(p ? p.key : null);
    setSelectedId(p ? p.id : null);
  }

  // Keyboard: the plot is one tab stop; arrows step through points left → right.
  const order = positioned.filter((o) => !isDimmed(o.p)).sort((a, b) => a.x - b.x || a.y - b.y);
  function onKey(e: React.KeyboardEvent) {
    if (!order.length) return;
    const cur = order.findIndex((o) => o.p.key === (hoverKey ?? selectedKey));
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = order[(cur + dir + order.length) % order.length] ?? order[0]!;
      setHoverKey(next.p.key);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (hoverKey) select(hoverKey);
    } else if (e.key === 'Escape') {
      setHoverKey(null);
      select(null);
    }
  }

  const tip = hovered;
  const tipLeft = tip ? (tip.x / width) * 100 : 0;
  const tipTop = tip ? (tip.y / height) * 100 : 0;

  const selected = selectedKey ? points.find((p) => p.key === selectedKey) : undefined;
  const selectedInCompare = selected ? compared.includes(selected.id) : false;
  const compareFull = compared.length >= MAX_COMPARE;
  const activePreset = PRESETS.find((p) => p.x === xKey && p.y === yKey);

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const tableRows = plotted
    .filter((p) => !isDimmed(p))
    .sort((a, b) => a.values[xKey]! - b.values[xKey]! || a.name.localeCompare(b.name));

  return (
    <div className="specmap">
      {/* Controls — one band above the chart */}
      <div className="flex flex-col gap-4 border-b border-line pb-5">
        <div>
          <p className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-fg-muted">Views</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={activePreset?.id === p.id}
                onClick={() => {
                  setXKey(p.x);
                  setYKey(p.y);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          {(['x', 'y'] as const).map((which, i) => {
            const value = which === 'x' ? xKey : yKey;
            const other = which === 'x' ? yKey : xKey;
            return (
              <label key={which} className={`flex flex-col gap-1 ${i === 1 ? 'sm:col-start-3' : ''}`}>
                <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-fg-muted">
                  {which === 'x' ? 'Across (X axis)' : 'Up (Y axis)'}
                </span>
                <select
                  className="specmap-select"
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value as AxisKey;
                    // Choosing the other axis's spec swaps them instead of plotting X against itself.
                    if (v === other) {
                      if (which === 'x') setYKey(xKey);
                      else setXKey(yKey);
                    }
                    if (which === 'x') setXKey(v);
                    else setYKey(v);
                  }}
                >
                  {AXIS_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {AXES[k].label}
                      {AXES[k].unit ? ` (${AXES[k].unit})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <button
            type="button"
            className="secondary-action action-sm sm:col-start-2 sm:row-start-1 sm:self-end"
            onClick={() => {
              setXKey(yKey);
              setYKey(xKey);
            }}
            aria-label="Swap the X and Y axes"
          >
            ⇄ Swap
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Highlight by playing style">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-fg-muted">Style</span>
            {CLASSES.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={classOn.has(c)}
                onClick={() => setClassOn((s) => toggleSet(s, c))}
              >
                <ShapeKey c={c} />
                {CLASS_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Highlight by weight class">
            <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-fg-muted">Weight</span>
            {WEIGHTS.map((w) => (
              <button
                key={w}
                type="button"
                className="chip tnum"
                aria-pressed={weightOn.has(w)}
                onClick={() => setWeightOn((s) => toggleSet(s, w))}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activePreset && <p className="prose-measure mt-4 text-sm text-fg-muted">{activePreset.question}</p>}

      {/* Chart */}
      <div ref={wrapRef} className="relative mt-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`Scatter chart of ${plotted.length} racket weight options: ${xAxis.label} across, ${yAxis.label} up. Use the arrow keys to step through points, or open the table view.`}
          tabIndex={0}
          className="specmap-svg block touch-manipulation"
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') setHoverKey(nearest(e.clientX, e.clientY));
          }}
          onPointerLeave={() => setHoverKey(null)}
          onClick={(e) => select(nearest(e.clientX, e.clientY))}
          onKeyDown={onKey}
          onBlur={() => setHoverKey(null)}
        >
          {/* Reference bands */}
          {xAxis.bands?.map((b) => (
            <g key={`xb-${b.label}`}>
              <rect x={sx(b.from)} y={M.top} width={Math.max(0, sx(b.to) - sx(b.from))} height={innerH} className="specmap-band" />
              <text x={(sx(b.from) + sx(b.to)) / 2} y={M.top + 12} textAnchor="middle" className="specmap-band-label">
                {b.label}
              </text>
            </g>
          ))}
          {yAxis.bands?.map((b) => (
            <g key={`yb-${b.label}`}>
              <rect x={M.left} y={sy(b.to)} width={innerW} height={Math.max(0, sy(b.from) - sy(b.to))} className="specmap-band" />
              <text x={M.left + innerW - 6} y={(sy(b.from) + sy(b.to)) / 2 + 4} textAnchor="end" className="specmap-band-label">
                {b.label}
              </text>
            </g>
          ))}

          {/* Grid + ticks */}
          {xTicks.map((t) => (
            <g key={`x${t.value}`}>
              <line x1={sx(t.value)} x2={sx(t.value)} y1={M.top} y2={M.top + innerH} className="specmap-grid" />
              <text x={sx(t.value)} y={M.top + innerH + 16} textAnchor="middle" className="specmap-tick">
                {width < 480 && xAxis.ticks ? t.label.replace('Slightly ', 'Sl. ') : t.label}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y${t.value}`}>
              <line x1={M.left} x2={M.left + innerW} y1={sy(t.value)} y2={sy(t.value)} className="specmap-grid" />
              <text x={M.left - 8} y={sy(t.value) + 4} textAnchor="end" className="specmap-tick">
                {yAxis.ticks ? t.label.replace('Slightly ', 'Sl. ') : t.label}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={M.left + innerW} y1={M.top + innerH} y2={M.top + innerH} className="specmap-axis" />
          <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + innerH} className="specmap-axis" />

          {/* Axis titles with what each end means */}
          <text x={M.left} y={height - 10} className="specmap-hint">
            ← {xAxis.lowHint}
          </text>
          <text x={M.left + innerW / 2} y={height - 10} textAnchor="middle" className="specmap-axis-title">
            {xAxis.label}
            {xAxis.unit ? ` (${xAxis.unit})` : ''}
          </text>
          <text x={M.left + innerW} y={height - 10} textAnchor="end" className="specmap-hint">
            {xAxis.highHint} →
          </text>
          <text transform={`translate(16 ${M.top + innerH / 2}) rotate(-90)`} textAnchor="middle" className="specmap-axis-title">
            {yAxis.label}
            {yAxis.unit ? ` (${yAxis.unit})` : ''}
          </text>
          {width >= 560 && (
            <>
            <text transform={`translate(16 ${M.top + innerH}) rotate(-90)`} textAnchor="start" className="specmap-hint">
              ← {yAxis.lowHint}
            </text>
            <text transform={`translate(16 ${M.top}) rotate(-90)`} textAnchor="end" className="specmap-hint">
              {yAxis.highHint} →
            </text>
            </>
          )}

          {/* Trails joining a highlighted racket's weight options */}
          {trails.map((t) =>
            t.length > 1 ? (
              <polyline key={`t-${t[0]!.p.id}`} points={t.map((o) => `${o.x},${o.y}`).join(' ')} className="specmap-trail" />
            ) : null,
          )}

          {/* Points: neutral first, highlighted on top */}
          {[...positioned]
            .sort((a, b) => Number(highlighted.has(a.p.id)) - Number(highlighted.has(b.p.id)))
            .map((o) => {
              const hi = highlighted.has(o.p.id);
              const dim = isDimmed(o.p) && !hi;
              return (
                <g
                  key={o.p.key}
                  className="specmap-pt"
                  style={{ transform: `translate(${o.x}px, ${o.y}px)` }}
                  data-hi={hi || undefined}
                  data-dim={dim || undefined}
                  data-hover={o.p.key === hoverKey || o.p.key === selectedKey || undefined}
                >
                  <path d={shapePath(o.p.classification, hi ? 5.5 : 4.8)} />
                </g>
              );
            })}

          {/* Name labels for highlighted rackets */}
          {labels.map((l) => (
            <text key={`l-${l.id}`} x={l.x} y={l.y} textAnchor={l.anchor} className="specmap-label">
              {l.text}
            </text>
          ))}
        </svg>

        {tip && (
          <div
            className="specmap-tip pointer-events-none absolute z-10"
            style={{
              left: `${tipLeft}%`,
              top: `${tipTop}%`,
              transform: `translate(${tipLeft > 60 ? 'calc(-100% - 14px)' : '14px'}, ${tipTop > 55 ? 'calc(-100% + 8px)' : '-8px'})`,
            }}
            role="status"
          >
            <p className="text-sm font-extrabold text-fg">
              {tip.p.name} <span className="tnum font-bold text-fg-muted">· {tip.p.weightClass}</span>
            </p>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
              <ShapeKey c={tip.p.classification} /> {tip.p.classLabel}
            </p>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-fg-muted">{xAxis.label}</dt>
              <dd className="tnum text-right font-bold text-fg">{formatAxisValue(xAxis, tip.p.values[xKey])}</dd>
              <dt className="text-fg-muted">{yAxis.label}</dt>
              <dd className="tnum text-right font-bold text-fg">{formatAxisValue(yAxis, tip.p.values[yKey])}</dd>
            </dl>
            <p className="mt-1.5 text-[0.68rem] text-fg-faint">Click for full specs</p>
          </div>
        )}
      </div>

      {/* Legend + data notes */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
        {CLASSES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <ShapeKey c={c} /> {CLASS_LABEL[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
            <line x1="3" y1="7" x2="19" y2="7" className="specmap-trail" />
            <circle cx="3" cy="7" r="3.5" className="specmap-key-hi" />
            <circle cx="19" cy="7" r="3.5" className="specmap-key-hi" />
          </svg>
          Selected or in compare (line joins its weights)
        </span>
      </div>
      {missingRackets.length > 0 && (
        <p className="mt-2 text-xs text-fg-faint">
          Not shown ({missingRackets.length}): {missingRackets.join(', ')}. OGKILS hasn’t published{' '}
          {[xAxis, yAxis].filter((a) => points.some((p) => p.values[a.key] === null)).map((a) => a.label.toLowerCase()).join(' or ')}{' '}
          for {missingRackets.length === 1 ? 'it' : 'them'} yet.
        </p>
      )}
      <div className="mt-3 grid gap-1 text-xs text-fg-muted sm:grid-cols-2">
        {[xAxis, yAxis].map((a) =>
          axisHelp[a.key] ? (
            <p key={a.key}>
              <span className="font-bold text-fg">{a.label}:</span> {axisHelp[a.key]}
            </p>
          ) : null,
        )}
      </div>

      {/* Selected racket */}
      <div className="mt-6 min-h-[7rem]" aria-live="polite">
        {selected ? (
          <div className="catalog-rule border-x border-b border-line bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="category-label flex items-center gap-1.5">
                  <ShapeKey c={selected.classification} /> {selected.classLabel}
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-fg">
                  {selected.name}{' '}
                  <span className="tnum text-base font-bold text-fg-muted">
                    {selected.weightClass} · {selected.weightRange[0]}–{selected.weightRange[1]} g
                  </span>
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="compare-btn"
                  data-on={selectedInCompare || undefined}
                  data-disabled={(!selectedInCompare && compareFull) || undefined}
                  disabled={!selectedInCompare && compareFull}
                  aria-pressed={selectedInCompare}
                  onClick={() => toggleCompare(selected.id)}
                >
                  {selectedInCompare ? '✓ In compare' : compareFull ? `Compare full (${MAX_COMPARE})` : '+ Compare'}
                </button>
                <a href={`/rackets/${selected.id}`} className="primary-action action-sm">
                  Full spec sheet
                </a>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {AXIS_ORDER.map((k) => (
                <div key={k} className={k === xKey || k === yKey ? 'specmap-on-axis' : ''}>
                  <dt className="text-xs text-fg-muted">{AXES[k].label}</dt>
                  <dd className="tnum font-bold text-fg">{formatAxisValue(AXES[k], selected.values[k])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="border border-dashed border-line p-5 text-sm text-fg-muted">
            Tap or click any point to see that racket’s full specs and add it to compare.
            {compared.length > 0 && ` Rackets in your compare tray are highlighted in teal.`}
          </p>
        )}
      </div>

      {/* Table view: every plotted value, no hovering needed */}
      <div className="mt-6">
        <button
          type="button"
          className="secondary-action action-sm"
          aria-expanded={showTable}
          aria-controls="specmap-table"
          onClick={() => setShowTable((s) => !s)}
        >
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
        {showTable && (
          <div id="specmap-table" className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="bg-brand text-left text-fg">
                  <th className="px-3 py-2 font-extrabold">Racket</th>
                  <th className="px-3 py-2 font-extrabold">Style</th>
                  <th className="px-3 py-2 text-right font-extrabold">{xAxis.label}</th>
                  <th className="px-3 py-2 text-right font-extrabold">{yAxis.label}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((p) => (
                  <tr key={p.key} className="border-b border-line">
                    <td className="px-3 py-1.5">
                      <a href={`/rackets/${p.id}`} className="font-bold text-fg hover:text-brand-strong">
                        {p.name}
                      </a>{' '}
                      <span className="tnum text-fg-muted">{p.weightClass}</span>
                    </td>
                    <td className="px-3 py-1.5 text-fg-muted">{p.classLabel}</td>
                    <td className="tnum px-3 py-1.5 text-right">{formatAxisValue(xAxis, p.values[xKey])}</td>
                    <td className="tnum px-3 py-1.5 text-right">{formatAxisValue(yAxis, p.values[yKey])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
