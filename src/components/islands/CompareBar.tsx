import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { compareIds, removeCompare, clearCompare, MAX_COMPARE } from '../../stores/compare';

interface Props {
  /** id → display name, for the selection chips. */
  names: Record<string, string>;
}

export default function CompareBar({ names }: Props) {
  const ids = useStore(compareIds);
  const barRef = useRef<HTMLDivElement>(null);

  /**
   * Publish the bar's real height so the page padding, the assistant launcher and the
   * assistant panel all clear it. With four long racket names the chips wrap to a second
   * row, and a hard-coded offset used to leave the launcher sitting on top of the bar.
   */
  useLayoutEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.setProperty('--compare-bar-h', '0px');
      return;
    }
    const publish = () => {
      root.style.setProperty('--compare-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--compare-bar-h', '0px');
    };
  }, [ids.length]);

  useEffect(() => () => document.documentElement.style.setProperty('--compare-bar-h', '0px'), []);

  if (ids.length === 0) return null;

  const canCompare = ids.length >= 2;
  const href = `/compare?ids=${ids.join(',')}`;

  return (
    <div
      className="compare-bar-wrap pointer-events-none fixed inset-x-0 z-50 px-3 pb-3 sm:px-6 sm:pb-5"
      aria-label="Comparison shortlist"
    >
      <div
        ref={barRef}
        className="rise pointer-events-auto mx-auto flex max-w-4xl flex-col gap-3 border border-line-strong border-t-[3px] border-t-brand bg-panel p-3 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)] sm:flex-row sm:items-center sm:gap-4 sm:p-4"
      >
        {/* On a phone the chips scroll sideways instead of stacking: four long model
            names used to build a bar tall enough to eat the bottom of the page. */}
        <div className="-mb-1 flex flex-1 items-center gap-2 overflow-x-auto pb-1 sm:mb-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <span className="tnum shrink-0 text-[0.7rem] font-extrabold uppercase tracking-[0.1em] text-fg-muted">
            {ids.length}/{MAX_COMPARE}
          </span>
          {ids.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-[11rem] shrink-0 items-center gap-1 rounded-[2px] border border-line bg-panel-2 py-1 pl-2.5 pr-1 text-xs font-bold uppercase tracking-[0.03em] text-fg sm:max-w-full"
            >
              <span className="truncate">{names[id] ?? id}</span>
              <button
                type="button"
                onClick={() => removeCompare(id)}
                aria-label={`Remove ${names[id] ?? id} from comparison`}
                className="tap inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-fg-faint transition-colors hover:text-fg"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={clearCompare}
            className="inline-flex min-h-11 items-center px-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-fg"
          >
            Clear
          </button>
          {canCompare ? (
            <a href={href} className="press primary-action action-sm">
              Compare {ids.length} <span aria-hidden="true">→</span>
            </a>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-[2px] border border-dashed border-line-strong px-3 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-fg-faint">
              Add one more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
