// Racket Roulette: narrow the wheel to rackets that fit you, spin, land on one.
// Every racket on the wheel gets an equal slice and an equal chance — the filters are
// the only thing that tilts it. The result card hands off to the real decision tools:
// full specs, compare, buy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { compareIds, toggleCompare, MAX_COMPARE } from '../../stores/compare';
import { filterWheel, landingRotation, randomIndex, type WheelFilters, type WheelRacket } from '../../lib/roulette';

export interface RouletteRacket extends WheelRacket {
  thumb: string | null;
  image: string | null;
  priceLabel: string | null;
  balance: string;
  stiffness: string;
  blurb: string | null;
  buyUrl: string;
  buyLabel: string;
}

interface Props {
  rackets: RouletteRacket[];
}

const STYLES = ['Attack', 'Speed', 'Control', 'All-Around'];
const WEIGHTS = ['3U', '4U', '5U', '6U'];
const BUDGETS: Array<{ label: string; value: number | null }> = [
  { label: 'Any budget', value: null },
  { label: 'Up to ₱3,000', value: 3000 },
  { label: 'Up to ₱5,000', value: 5000 },
  { label: 'Up to ₱6,000', value: 6000 },
];

const SIZE = 440;
const C = SIZE / 2;
const R = C - 10;

function toggle(set: Set<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function slicePath(i: number, n: number): string {
  if (n === 1) return `M${C},${C - R} A${R},${R} 0 1,1 ${C - 0.01},${C - R} Z`;
  const a0 = ((i * 360) / n - 90) * (Math.PI / 180);
  const a1 = (((i + 1) * 360) / n - 90) * (Math.PI / 180);
  const large = 360 / n > 180 ? 1 : 0;
  return `M${C},${C} L${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 ${large},1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} Z`;
}

function shortName(name: string): string {
  return name.replace(/ Breathing$/, '').replace('Dimensional Slash Pro', 'DS Pro');
}

export default function RacketRoulette({ rackets }: Props) {
  const [filters, setFilters] = useState<WheelFilters>({
    styles: new Set(),
    weights: new Set(),
    series: new Set(),
    maxPrice: null,
  });
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<RouletteRacket | null>(null);
  const [history, setHistory] = useState<RouletteRacket[]>([]);
  const [reduced, setReduced] = useState(false);
  const ids = useStore(compareIds);
  const resultRef = useRef<HTMLDivElement>(null);
  const pending = useRef<RouletteRacket | null>(null);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, []);

  const wheel = useMemo(() => filterWheel(rackets, filters), [rackets, filters]);
  const seriesOptions = useMemo(() => Array.from(new Set(rackets.map((r) => r.series))), [rackets]);
  const n = wheel.length;

  // Changing the filters rebuilds the wheel, so the old result no longer sits on it.
  useEffect(() => {
    if (!spinning) setWinner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const spin = () => {
    if (spinning || n === 0) return;
    const index = randomIndex(n);
    const offset = (Math.random() - 0.5) * 0.7;
    pending.current = wheel[index]!;
    setWinner(null);
    setSpinning(true);
    setRotation((cur) => landingRotation(cur, index, n, reduced ? 1 : 6, offset));
    if (reduced) window.setTimeout(finish, 350);
  };

  const finish = () => {
    const w = pending.current;
    if (!w) return;
    pending.current = null;
    setSpinning(false);
    setWinner(w);
    setHistory((h) => [w, ...h.filter((x) => x.id !== w.id)].slice(0, 6));
    window.setTimeout(() => {
      const el = resultRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      // On a phone the card sits under the wheel; bring it into view.
      if (window.matchMedia('(max-width: 1023.98px)').matches)
        el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }, 50);
  };


  return (
    <div className="roulette">
      {/* Tilt the wheel */}
      <section className="roulette-filters" aria-labelledby="roulette-filters-title">
        <h2 id="roulette-filters-title" className="panel-heading">Tilt the wheel</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Leave everything open for a wild spin, or narrow it to rackets that fit you.
        </p>

        <fieldset className="roulette-group">
          <legend>Playing style</legend>
          <div className="flex flex-wrap gap-1.5">
            {STYLES.filter((s) => rackets.some((r) => r.classLabel === s)).map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={filters.styles.has(s)}
                onClick={() => setFilters((f) => ({ ...f, styles: toggle(f.styles, s) }))}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="roulette-group">
          <legend>Budget</legend>
          <div className="flex flex-wrap gap-1.5">
            {BUDGETS.map((b) => (
              <button key={b.label} type="button" className="chip" aria-pressed={filters.maxPrice === b.value}
                onClick={() => setFilters((f) => ({ ...f, maxPrice: b.value }))}>
                {b.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="roulette-group">
          <legend>Weight</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEIGHTS.filter((w) => rackets.some((r) => r.weightClasses.includes(w))).map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={filters.weights.has(w)}
                onClick={() => setFilters((f) => ({ ...f, weights: toggle(f.weights, w) }))}>
                {w}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-fg-faint">3U is heaviest, 6U lightest.</p>
        </fieldset>

        <fieldset className="roulette-group">
          <legend>Series</legend>
          <div className="flex flex-wrap gap-1.5">
            {seriesOptions.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={filters.series.has(s)}
                onClick={() => setFilters((f) => ({ ...f, series: toggle(f.series, s) }))}>
                {s === 'Other' ? 'Other models' : s}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="roulette-count">
          <span className="tnum">{n}</span> {n === 1 ? 'racket' : 'rackets'} on the wheel
          {(filters.styles.size || filters.weights.size || filters.series.size || filters.maxPrice !== null) ? (
            <button type="button" className="ml-3 text-xs font-bold uppercase tracking-[0.06em] text-brand-strong hover:text-fg"
              onClick={() => setFilters({ styles: new Set(), weights: new Set(), series: new Set(), maxPrice: null })}>
              Reset
            </button>
          ) : null}
        </div>
      </section>

      {/* The wheel */}
      <section className="roulette-stage" aria-label="Roulette wheel">
        {n === 0 ? (
          <div className="roulette-empty">
            <p className="display-heading text-2xl text-fg">No rackets fit all that</p>
            <p className="mt-2 text-sm text-fg-muted">Loosen a filter to put rackets back on the wheel.</p>
          </div>
        ) : (
          <div className="roulette-wheel-wrap">
            <svg className="roulette-pointer" width="34" height="40" viewBox="0 0 34 40" aria-hidden="true">
              <path d="M17 38 L2 4 Q17 -2 32 4 Z" />
            </svg>
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className={`roulette-wheel${spinning ? ' is-spinning' : ''}${reduced ? ' is-reduced' : ''}`}
              style={{ transform: `rotate(${rotation}deg)` }}
              onTransitionEnd={(e) => {
                if (e.propertyName === 'transform' && spinning) finish();
              }}
              role="img"
              aria-label={`Wheel with ${n} rackets: ${wheel.map((r) => r.name).join(', ')}`}
            >
              <defs>
                {wheel.map((r) => (
                  <clipPath key={r.id} id={`thumb-${r.id}`}>
                    <circle r={n > 14 ? 15 : 22} />
                  </clipPath>
                ))}
              </defs>
              <circle cx={C} cy={C} r={R + 6} className="roulette-rim" />
              {wheel.map((r, i) => {
                const mid = ((i + 0.5) * 360) / n;
                const isWin = winner?.id === r.id;
                const thumbR = n > 14 ? 15 : 22;
                const labelR = R * 0.56;
                return (
                  <g key={r.id}>
                    <path d={slicePath(i, n)} className={`roulette-slice slice-${i % 2}${isWin ? ' is-win' : ''}`} />
                    <g transform={`rotate(${mid} ${C} ${C})`}>
                      {r.thumb && (
                        <g transform={`translate(${C} ${C - R + thumbR + 10})`}>
                          <image href={r.thumb} x={-thumbR} y={-thumbR} width={thumbR * 2} height={thumbR * 2}
                            clipPath={`url(#thumb-${r.id})`} preserveAspectRatio="xMidYMid slice" />
                          <circle r={thumbR} className="roulette-thumb-ring" />
                        </g>
                      )}
                      {/* Label reads outward from the hub along the slice. */}
                      <text
                        x={C}
                        y={C - labelR}
                        transform={`rotate(-90 ${C} ${C - labelR})`}
                        className={`roulette-label${n > 14 ? ' is-small' : ''}`}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {shortName(r.name)}
                      </text>
                    </g>
                  </g>
                );
              })}
              <circle cx={C} cy={C} r={44} className="roulette-hub" />
            </svg>
            <button type="button" className="roulette-spin" onClick={spin} disabled={spinning}
              aria-label={spinning ? 'Spinning' : `Spin the wheel of ${n} rackets`}>
              {spinning ? '…' : 'Spin'}
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="assertive">
          {spinning ? 'Spinning…' : winner ? `The wheel landed on ${winner.name}.` : ''}
        </p>
      </section>

      {/* Result */}
      <section className="roulette-result" aria-labelledby="roulette-result-title">
        {winner ? (
          <div ref={resultRef} tabIndex={-1} className={`roulette-card${reduced ? '' : ' is-pop'}`}>
            {!reduced && <span className="roulette-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>}
            <p className="section-kicker">The wheel says</p>
            <div className="mt-3 flex items-center gap-4">
              {winner.image && (
                <img src={winner.image} alt="" width={96} height={96} className="stage h-24 w-24 shrink-0 object-cover" />
              )}
              <div className="min-w-0">
                <p className="category-label">{winner.classLabel}{winner.series !== 'Other' ? ` · ${winner.series} series` : ''}</p>
                <h2 id="roulette-result-title" className="display-heading text-3xl text-fg">{winner.name}</h2>
                {winner.priceLabel && <p className="tnum mt-0.5 font-bold text-fg">{winner.priceLabel}</p>}
              </div>
            </div>
            {winner.blurb && <p className="mt-3 text-sm leading-relaxed text-fg-muted">{winner.blurb}</p>}
            <dl className="roulette-facts">
              <div><dt>Balance</dt><dd>{winner.balance}</dd></div>
              <div><dt>Stiffness</dt><dd>{winner.stiffness}</dd></div>
              <div><dt>Weights</dt><dd>{winner.weightClasses.join(' · ')}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/rackets/${winner.id}`} className="primary-action action-sm press">View full specs →</a>
              <button type="button" className="secondary-action action-sm press"
                aria-pressed={ids.includes(winner.id)}
                disabled={!ids.includes(winner.id) && ids.length >= MAX_COMPARE}
                onClick={() => toggleCompare(winner.id)}>
                {ids.includes(winner.id) ? '✓ In comparison' : ids.length >= MAX_COMPARE ? 'Compare is full' : '＋ Compare'}
              </button>
              <a href={winner.buyUrl} target="_blank" rel="noopener" className="secondary-action action-sm press"
                data-buy-channel="shopify" data-buy-racket={winner.id} data-buy-placement="roulette">
                {winner.buyLabel} <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button type="button" onClick={spin} className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-brand-strong hover:text-fg">
              Not feeling it? Spin again ↻
            </button>
          </div>
        ) : (
          <div className="roulette-card is-idle">
            <p className="section-kicker">How it works</p>
            <h2 id="roulette-result-title" className="display-heading mt-2 text-2xl text-fg">Can't decide? Let fate pick.</h2>
            <ol className="mt-3 grid gap-1.5 text-sm text-fg-muted">
              <li>1. Tilt the wheel with the filters — or don't.</li>
              <li>2. Hit spin. Every racket on it has the same chance.</li>
              <li>3. Check its specs, compare it, or spin again.</li>
            </ol>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-5">
            <p className="panel-heading">Your spins</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {history.map((h) => (
                <li key={h.id}>
                  <a href={`/rackets/${h.id}`} className="roulette-history">
                    {h.thumb && <img src={h.thumb} alt="" width={24} height={24} />}
                    {h.name}
                  </a>
                </li>
              ))}
            </ul>
            {history.length >= 2 && (
              <a href={`/compare?ids=${history.slice(0, 4).map((h) => h.id).join(',')}`}
                className="secondary-action action-sm press mt-3 inline-flex">
                Compare your last {Math.min(history.length, 4)} spins →
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
