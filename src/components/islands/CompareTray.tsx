import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { compareIds, removeCompare, setCompare } from '../../stores/compare';
import { extremeIndices } from '../../lib/derive';

// --- Shapes passed from compare/index.astro (compact, serialisable) -------------------
export interface CompareVariant {
  weightClass: string;
  weightRangeG: [number, number];
  weightMidG: number;
  gripSizes: string[];
  maxTensionLbs: number;
  balancePointMm: number;
  swingWeight: number | null;
  swingWeightMissing: boolean;
}
export interface CompareBuy {
  label: string;
  url: string;
  channel: string;
  primary: boolean;
}
export interface CompareRacket {
  id: string;
  name: string;
  modelCode: string;
  classification: string;
  classLabel: string;
  series: string;
  materials: string[];
  balance: string;
  stiffnessPrimary: string;
  stiffnessLabel: string | null;
  stiffnessOrdinal: number;
  shaftDiameterMm: number;
  frameHoleType: string;
  frameAreaCm2: number | null;
  gripLengthMm: number | null;
  racketLengthMm: number;
  variants: CompareVariant[];
  pricePhp: number | null;
  priceLabel: string | null;
  stockLevel: string | null;
  thumb: string | null;
  buys: CompareBuy[];
}
export interface SuggestedPair {
  ids: [string, string];
  labels: [string, string];
}
interface Props {
  data: Record<string, CompareRacket>;
  suggestions: SuggestedPair[];
}

const DASH = '—';
type Diff = 'high' | 'low' | 'both' | null;

interface RowDef {
  key: string;
  label: string;
  termKey?: string;
  unit?: string;
  diff: Diff;
  /** Only mark a diff when the row spans at least this much — filters out imperceptible gaps. */
  minSpread?: number;
  cell: (r: CompareRacket, v: CompareVariant) => { display: string; num: number | null };
}

const ROWS: RowDef[] = [
  { key: 'class', label: 'Classification', diff: null, cell: (r) => ({ display: r.classLabel, num: null }) },
  { key: 'materials', label: 'Materials', diff: null, cell: (r) => ({ display: r.materials.join(' · ') || DASH, num: null }) },
  { key: 'balance', label: 'Balance', termKey: 'balance-label', diff: null, cell: (r) => ({ display: r.balance, num: null }) },
  {
    key: 'stiffness', label: 'Stiffness', termKey: 'shaft-stiffness', diff: 'both',
    cell: (r) => ({ display: r.stiffnessLabel ? `${r.stiffnessPrimary} ${r.stiffnessLabel}` : r.stiffnessPrimary, num: r.stiffnessOrdinal }),
  },
  {
    key: 'balancePt', label: 'Balance point', termKey: 'balance-point', unit: 'mm', diff: 'both', minSpread: 5,
    cell: (_r, v) => ({ display: `${v.balancePointMm}`, num: v.balancePointMm }),
  },
  {
    key: 'weight', label: 'Weight', termKey: 'weight-class', unit: 'g', diff: 'both',
    cell: (_r, v) => ({ display: `${v.weightRangeG[0]}–${v.weightRangeG[1]}`, num: v.weightMidG }),
  },
  {
    key: 'swing', label: 'Swing weight', termKey: 'swing-weight', diff: 'both',
    cell: (_r, v) => (v.swingWeightMissing ? { display: DASH, num: null } : { display: `${v.swingWeight}`, num: v.swingWeight }),
  },
  {
    key: 'shaft', label: 'Shaft diameter', termKey: 'shaft-diameter', unit: 'mm', diff: 'both', minSpread: 0.2,
    cell: (r) => ({ display: `${r.shaftDiameterMm}`, num: r.shaftDiameterMm }),
  },
  {
    key: 'maxTension', label: 'Max tension', termKey: 'max-tension', unit: 'lbs', diff: 'high',
    cell: (_r, v) => ({ display: `${v.maxTensionLbs}`, num: v.maxTensionLbs }),
  },
  {
    key: 'frameArea', label: 'Frame area', termKey: 'frame-area', unit: 'cm²', diff: 'high',
    cell: (r) => (r.frameAreaCm2 === null ? { display: DASH, num: null } : { display: `${r.frameAreaCm2}`, num: r.frameAreaCm2 }),
  },
  { key: 'frameHoles', label: 'Frame holes', termKey: 'frame-holes', diff: null, cell: (r) => ({ display: r.frameHoleType, num: null }) },
  { key: 'grips', label: 'Grip sizes', termKey: 'grip-size', diff: null, cell: (_r, v) => ({ display: v.gripSizes.join(' · '), num: null }) },
  {
    key: 'gripLen', label: 'Grip length', unit: 'mm', diff: null,
    cell: (r) => (r.gripLengthMm === null ? { display: DASH, num: null } : { display: `${r.gripLengthMm}`, num: r.gripLengthMm }),
  },
  { key: 'racketLen', label: 'Racket length', unit: 'mm', diff: null, cell: (r) => ({ display: `${r.racketLengthMm}`, num: r.racketLengthMm }) },
  {
    key: 'price', label: 'Price', unit: '', diff: 'low',
    cell: (r) => (r.pricePhp === null ? { display: DASH, num: null } : { display: r.priceLabel ?? `${r.pricePhp}`, num: r.pricePhp }),
  },
];

function useSelectedRackets(data: Record<string, CompareRacket>): CompareRacket[] {
  const ids = useStore(compareIds);
  return ids.map((id) => data[id]).filter((r): r is CompareRacket => Boolean(r));
}

export default function CompareTray({ data, suggestions }: Props) {
  const rackets = useSelectedRackets(data);
  const [variantIdx, setVariantIdx] = useState<Record<string, number>>({});
  const [showSame, setShowSame] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [pairIds, setPairIds] = useState<string[]>([]);
  const [scrollable, setScrollable] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Keep the full shortlist; replace removed pair members with the next available pick.
  const pair = pairIds.map((id) => rackets.find((r) => r.id === id))
    .filter((r): r is CompareRacket => Boolean(r));
  for (const racket of rackets) {
    if (pair.length >= 2) break;
    if (!pair.some((r) => r.id === racket.id)) pair.push(racket);
  }
  const visibleRackets = mobile ? pair : rackets;

  // On mount, honour ?ids= for shareable links; then keep the URL in sync.
  useEffect(() => {
    const urlIds = new URLSearchParams(window.location.search).get('ids');
    if (urlIds) {
      const wanted = urlIds.split(',').filter((id) => data[id]);
      if (wanted.length) setCompare(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ids = useStore(compareIds);
  useEffect(() => {
    const qs = ids.length ? `?ids=${ids.join(',')}` : '';
    window.history.replaceState(null, '', qs || window.location.pathname);
  }, [ids]);

  /* Four columns fit a desktop but not a tablet, and a table that scrolls with no sign
     that it scrolls just looks truncated. Measure instead of guessing at a breakpoint.
     This also decides whether the wrapper can drop out of scroll-container mode and let
     the product headers stick, so it has to settle before paint. */
  useLayoutEffect(() => {
    const el = tableWrapRef.current;
    if (!el) {
      setScrollable(false);
      return;
    }
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleRackets.length, mobile]);

  const variantOf = (r: CompareRacket): CompareVariant => {
    const i = Math.min(variantIdx[r.id] ?? 0, r.variants.length - 1);
    return r.variants[i]!;
  };

  // --- Empty / single-selection state ---
  if (rackets.length < 2) {
    return (
      <div className="catalog-rule border-x border-b border-line bg-panel px-6 py-12 text-center sm:px-10">
        <h2 className="display-heading text-2xl text-fg sm:text-3xl">
          {rackets.length === 0 ? 'Nothing to compare yet' : 'Add one more racket'}
        </h2>
        <p className="prose-measure mx-auto mt-3 text-fg-muted">
          Pick at least two rackets — from any card's “＋ Compare” button — to see them
          side by side. Or start with a popular match-up:
        </p>

        {rackets[0] && (
          <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-3 border border-line bg-panel-2 p-3 text-left">
            <a href={`/rackets/${rackets[0].id}`} className="text-sm font-bold uppercase tracking-[0.03em] text-fg hover:underline">
              {rackets[0].name}
            </a>
            <button
              type="button"
              onClick={() => removeCompare(rackets[0]!.id)}
              aria-label={`Remove ${rackets[0].name} from comparison`}
              className="secondary-action action-sm shrink-0"
            >
              Remove
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s.ids.join('-')}
              type="button"
              onClick={() => setCompare(s.ids)}
              className="secondary-action action-sm normal-case tracking-normal"
            >
              <span className="font-bold">{s.labels[0]}</span>
              <span className="text-fg-faint">vs</span>
              <span className="font-bold">{s.labels[1]}</span>
            </button>
          ))}
        </div>

        <p className="mt-8">
          <a href="/rackets" className="text-sm font-bold uppercase tracking-[0.06em] text-brand-strong hover:text-fg">
            Browse the full lineup →
          </a>
        </p>
      </div>
    );
  }

  // Precompute per-row diff marks.
  const rowMeta = ROWS.map((row) => {
    const cells = visibleRackets.map((r) => row.cell(r, variantOf(r)));
    const nums = cells.map((c) => c.num);
    let highs = new Set<number>();
    let lows = new Set<number>();
    if (row.diff === 'high' || row.diff === 'both') highs = extremeIndices(nums, 'high', row.minSpread);
    if (row.diff === 'low' || row.diff === 'both') lows = extremeIndices(nums, 'low', row.minSpread);
    const displays = cells.map((c) => c.display);
    const uniform = displays.every((d) => d === displays[0]);
    return { row, cells, highs, lows, uniform };
  });

  // Identical rows are grouped rather than interleaved, so the differences read as a
  // block. Order within each group is preserved.
  const differing = rowMeta.filter((m) => !m.uniform);
  const same = rowMeta.filter((m) => m.uniform);

  const renderRow = ({ row, cells, highs, lows, uniform }: (typeof rowMeta)[number]) => (
    <tr key={row.key} className={uniform ? 'is-uniform' : ''}>
      <th scope="row">
        <span className="flex items-center">
          {row.label}
          {row.termKey && (
            <a
              href={`/guide/racket-specs#${row.termKey}`}
              className="spec-help"
              aria-label={`What is ${row.label}? Opens the spec guide.`}
            >
              ?
            </a>
          )}
        </span>
      </th>
      {cells.map((c, i) => {
        const isHigh = highs.has(i);
        const isLow = lows.has(i);
        const marked = isHigh || isLow;
        const missing = c.display === DASH;
        return (
          <td key={i} className={marked ? 'is-marked' : undefined}>
            <span
              className={missing ? 'spec-missing' : 'tnum font-semibold'}
              title={missing ? 'Not published by OGKILS' : undefined}
            >
              {c.display}
            </span>
            {row.unit && !missing ? <span className="spec-unit">{row.unit}</span> : null}
            {missing && <span className="sr-only">Not published</span>}
            {marked && (
              <span className="spec-diff-mark">
                <span aria-hidden="true">{isHigh ? '▲' : '▼'}</span>
                <span className="sr-only">
                  {isHigh ? 'highest of these rackets' : 'lowest of these rackets'}
                </span>
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-fg-muted">
          <span className="tnum font-bold text-fg">{mobile ? `2 of ${rackets.length}` : rackets.length}</span>{' '}
          rackets · differences marked <span className="text-diff">▲▼</span>
        </p>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-fg-muted sm:hidden">
        Two at a time on a phone. {rackets.length > 2 ? 'Use the selectors to switch your picks. ' : ''}
        Differences are marked for the pair shown.
      </p>
      {scrollable && !mobile && (
        <p className="mb-3 hidden text-xs font-bold uppercase tracking-[0.06em] text-fg-muted sm:block">
          <span aria-hidden="true">↔</span> Scroll the table sideways for the remaining columns
        </p>
      )}

      {/* Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label={mobile ? 'Two-racket comparison' : 'Racket comparison; scroll horizontally to see all rackets'}
        ref={tableWrapRef}
        className={`spec-table-wrap${scrollable ? '' : ' is-fitting'}`}
      >
        <table className="spec-table">
          <caption className="sr-only">
            Specification comparison of your shortlist. Cells marked “highest” or “lowest”
            carry the extreme value in that row. A dash means the figure is not published.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="th-corner">Item name</th>
              {visibleRackets.map((r, column) => (
                <th scope="col" key={r.id} className="th-product">
                  <div className="flex h-full min-w-0 flex-col items-center gap-2.5">
                    {mobile && rackets.length > 2 && (
                      <label className="w-full min-w-0 text-left text-[0.68rem] font-bold uppercase tracking-[0.08em]">
                        Racket {column + 1}
                        <select
                          aria-label={`Racket ${column + 1}`}
                          value={r.id}
                          onChange={(event) =>
                            setPairIds(pair.map((pick, i) => (i === column ? event.target.value : pick.id)))
                          }
                          className="mt-1 block min-h-11 w-full max-w-full min-w-0 truncate rounded-[2px] border border-fg/25 bg-panel px-2 text-sm font-medium normal-case tracking-normal text-fg"
                        >
                          {rackets
                            .filter((pick) => pick.id !== pair[1 - column]?.id)
                            .map((pick) => (
                              <option key={pick.id} value={pick.id}>{pick.name}</option>
                            ))}
                        </select>
                      </label>
                    )}

                    <div className="stage stage--thumb h-16 w-16 shrink-0 bg-panel">
                      {r.thumb ? (
                        <img src={r.thumb} alt="" width={64} height={64} loading="lazy" />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCompare(r.id)}
                      aria-label={`Remove ${r.name} from comparison`}
                      title={`Remove ${r.name}`}
                      className="th-remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>

                    <a href={`/rackets/${r.id}`} className="th-name uppercase">
                      {r.name}
                    </a>

                    <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-current/40 px-1.5 py-1 text-[0.64rem] font-extrabold uppercase leading-none tracking-[0.08em]">
                      <span className="inline-block h-[0.3rem] w-[0.3rem] bg-current" aria-hidden="true" />
                      {r.classLabel}
                    </span>

                    {r.variants.length > 1 && (
                      <div className="segmented segmented--on-brand mt-auto" role="group" aria-label={`Weight class for ${r.name}`}>
                        {r.variants.map((v, i) => {
                          const active = (variantIdx[r.id] ?? 0) === i;
                          return (
                            <button
                              key={v.weightClass}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setVariantIdx((s) => ({ ...s, [r.id]: i }))}
                            >
                              {v.weightClass}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {differing.map((meta) => renderRow(meta))}

            {/* Identical rows collapse into one muted group (product.md §6) — the count
                is the useful part: "these two only differ on five of fifteen specs". */}
            {same.length > 0 && (
              <tr className="is-disclosure">
                <td colSpan={visibleRackets.length + 1}>
                  <button
                    type="button"
                    className="spec-same-toggle"
                    aria-expanded={showSame}
                    aria-controls="same-across-all"
                    onClick={() => setShowSame((v) => !v)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span>
                      <span className="tnum">{same.length}</span>{' '}
                      {same.length === 1 ? 'spec is' : 'specs are'} the same across{' '}
                      {visibleRackets.length === 2 ? 'both' : `all ${visibleRackets.length}`}
                      {showSame ? ' — hide them' : ' — show them'}
                    </span>
                  </button>
                </td>
              </tr>
            )}
            {showSame && same.map((meta) => renderRow(meta))}

            {/* Stock */}
            <tr>
              <th scope="row">Availability</th>
              {visibleRackets.map((r) => (
                <td key={r.id}>
                  <span className={r.stockLevel ? 'font-semibold' : 'spec-missing'}>
                    {r.stockLevel ?? DASH}
                  </span>
                </td>
              ))}
            </tr>

            {/* Buy */}
            <tr className="is-actions">
              <th scope="row">Buy</th>
              {visibleRackets.map((r) => (
                <td key={r.id}>
                  <div className="flex flex-col gap-1.5">
                    {r.buys.map((b) => (
                      <a
                        key={b.channel}
                        href={b.url}
                        target="_blank"
                        rel="noopener"
                        data-buy-channel={b.channel}
                        data-buy-racket={r.id}
                        data-buy-placement="compare"
                        data-buy-variant={variantOf(r).weightClass}
                        className={`press action-sm ${b.primary ? 'primary-action' : 'secondary-action'}`}
                      >
                        {b.label} <span aria-hidden="true" className="text-[0.7em] opacity-70">↗</span>
                      </a>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
