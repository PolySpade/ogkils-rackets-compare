import { useState } from 'react';
import {
  LINEUP_SPECS,
  formatLineupValue,
  lineupRange,
  positionOn,
  shareBelow,
  type LineupCatalogue,
  type LineupEntry,
} from '../../lib/lineup';

/** A shortlisted racket plus the series slot (0–3) it keeps for as long as it's listed. */
export interface ChartEntry extends LineupEntry {
  slot: number;
  weightClass: string;
}

interface Props {
  entries: ChartEntry[];
  catalogue: LineupCatalogue;
}

export const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;

/** The series marker — colour and shape together, so identity never rests on colour. */
export function SeriesMark({ slot, size = 12 }: { slot: number; size?: number }) {
  return (
    <span
      className={`series-mark series-mark--${SHAPES[slot % 4]}`}
      style={{ width: size, height: size, background: `var(--series-${(slot % 4) + 1})` }}
      aria-hidden="true"
    />
  );
}

interface Hover {
  spec: string;
  id: string;
}

/**
 * "Where they sit in the lineup": one strip per spec, one lane per shortlisted racket.
 * Faint ticks are every racket × weight class in the catalogue, so a dot reads as a
 * position in the whole range rather than only against the other picks.
 */
export default function LineupChart({ entries, catalogue }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);

  return (
    <section className="lineup" aria-labelledby="lineup-title">
      <div className="lineup-head">
        <div>
          <h2 id="lineup-title" className="panel-heading">Where they sit in the lineup</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-fg-muted">
            Each strip spans the full OGKILS range for that spec; the faint ticks are every
            racket and weight class in the catalogue. Neither end is “better” — it depends on
            how you play.
          </p>
        </div>
        <ul className="lineup-legend" aria-label="Legend">
          {entries.map((e) => (
            <li key={e.id}>
              <SeriesMark slot={e.slot} />
              <span className="font-semibold text-fg">{e.name}</span>
              <span className="text-fg-faint">{e.weightClass}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="lineup-grid">
        {LINEUP_SPECS.map((spec) => {
          const all = catalogue[spec.key] ?? [];
          const range = lineupRange(spec, all);
          if (!range) return null;
          const ticks = Array.from(new Set(all));
          // Unpublished figures are left off the strip, not parked on it.
          const lanes = entries.filter((e) => e.values[spec.key] !== null);
          const missing = entries.filter((e) => e.values[spec.key] === null);
          if (lanes.length === 0) return null;
          return (
            <figure key={spec.key} className="lineup-spec">
              <figcaption className="lineup-spec-head">
                <span className="lineup-spec-label">
                  {spec.label}
                  {spec.glossary && (
                    <a
                      href={`/guide/racket-specs#${spec.glossary}`}
                      className="spec-help"
                      aria-label={`What is ${spec.label}? Opens the spec guide.`}
                    >
                      ?
                    </a>
                  )}
                </span>
                <span className="lineup-range tnum">
                  {formatLineupValue(spec, range[0])} – {formatLineupValue(spec, range[1])}
                </span>
              </figcaption>

              <div className="lineup-ends" aria-hidden="true">
                <span>← {spec.lowHint}</span>
                <span>{spec.highHint} →</span>
              </div>

              <ul className="lineup-lanes">
                {lanes.map((e) => {
                  const v = e.values[spec.key];
                  const pos = v === null ? null : positionOn(v, range);
                  const isHover = hover?.spec === spec.key && hover.id === e.id;
                  const below = v === null ? 0 : shareBelow(v, all);
                  const label =
                    v === null
                      ? `${e.name}: ${spec.label} not published`
                      : `${e.name} ${e.weightClass}: ${spec.label} ${formatLineupValue(spec, v)}, higher than ${below}% of the lineup`;
                  return (
                    <li key={e.id} className="lineup-lane">
                      <span className="lineup-lane-name" title={e.name}>{e.name}</span>
                      <div className="lineup-track">
                        <span className="lineup-rail" aria-hidden="true" />
                        {ticks.map((t) => (
                          <span
                            key={t}
                            className="lineup-tick"
                            style={{ left: `${positionOn(t, range) * 100}%` }}
                            aria-hidden="true"
                          />
                        ))}
                        {pos === null ? (
                          <span className="lineup-missing">Not published</span>
                        ) : (
                          <button
                            type="button"
                            className="lineup-dot"
                            style={{ left: `${pos * 100}%` }}
                            aria-label={label}
                            onMouseEnter={() => setHover({ spec: spec.key, id: e.id })}
                            onMouseLeave={() => setHover(null)}
                            onFocus={() => setHover({ spec: spec.key, id: e.id })}
                            onBlur={() => setHover(null)}
                          >
                            <SeriesMark slot={e.slot} size={14} />
                            {isHover && (
                              <span
                                role="tooltip"
                                className={`lineup-tip${pos > 0.6 ? ' is-left' : ''}`}
                              >
                                <span className="block font-bold text-fg">
                                  {e.name} <span className="font-normal text-fg-faint">{e.weightClass}</span>
                                </span>
                                <span className="tnum block text-fg">{formatLineupValue(spec, v)}</span>
                                <span className="block text-fg-muted">
                                  Higher than {below}% of the lineup
                                </span>
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                      <span className={`lineup-lane-value tnum${v === null ? ' spec-missing' : ''}`}>
                        {formatLineupValue(spec, v)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {missing.length > 0 && (
                <p className="mt-1 text-[0.7rem] text-fg-faint">
                  Not published for {missing.map((e) => e.name).join(', ')}.
                </p>
              )}
            </figure>
          );
        })}
      </div>
      <p className="spec-footnote">
        Weight, balance point, swing weight and max tension follow the weight class picked in
        the table. The table above carries every figure as text.
      </p>
    </section>
  );
}
