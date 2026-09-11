import { useEffect, useMemo, useRef, useState } from 'react';

export interface FilterGroup {
  key: string;
  label: string;
  /** data-* attribute on each card to match against. */
  attr: string;
  /** True when the card attribute holds a space-separated list (weight, grip). */
  list: boolean;
  options: string[];
}

interface Props {
  groups: FilterGroup[];
  total: number;
}

type Selected = Record<string, Set<string>>;

function readFromUrl(groups: FilterGroup[]): Selected {
  const sel: Selected = {};
  const params = new URLSearchParams(window.location.search);
  for (const g of groups) {
    const raw = params.get(g.key);
    sel[g.key] = new Set(raw ? raw.split(',').filter(Boolean) : []);
  }
  return sel;
}

function writeToUrl(groups: FilterGroup[], sel: Selected): void {
  const params = new URLSearchParams(window.location.search);
  for (const g of groups) {
    const s = sel[g.key];
    if (s && s.size) params.set(g.key, [...s].join(','));
    else params.delete(g.key);
  }
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

function cardMatches(card: Element, groups: FilterGroup[], sel: Selected): boolean {
  for (const g of groups) {
    const chosen = sel[g.key];
    if (!chosen || chosen.size === 0) continue;
    const raw = card.getAttribute(g.attr) ?? '';
    if (g.list) {
      const vals = raw.split(' ').filter(Boolean);
      if (!vals.some((v) => chosen.has(v))) return false;
    } else if (!chosen.has(raw)) {
      return false;
    }
  }
  return true;
}

export default function FilterBar({ groups, total }: Props) {
  const emptyState = useMemo<Selected>(
    () => Object.fromEntries(groups.map((g) => [g.key, new Set<string>()])),
    [groups],
  );
  const [selected, setSelected] = useState<Selected>(emptyState);
  const [shown, setShown] = useState(total);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setSelected(readFromUrl(groups));
    setReady(true);
  }, [groups]);

  useEffect(() => {
    if (!ready) return;
    const cards = document.querySelectorAll<HTMLElement>('[data-racket-card]');
    let visible = 0;
    cards.forEach((card) => {
      const match = cardMatches(card, groups, selected);
      card.hidden = !match;
      if (match) visible += 1;
    });
    setShown(visible);
    const empty = document.getElementById('rackets-empty');
    if (empty) empty.hidden = visible !== 0;
    writeToUrl(groups, selected);
  }, [selected, ready, groups]);

  // Native modal semantics keep keyboard focus inside and support Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    dialog?.addEventListener('keydown', keepFocusInside);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSheetOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      dialog?.removeEventListener('keydown', keepFocusInside);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', closeOnDesktop);
      previousFocus?.focus();
    };
  }, [sheetOpen]);

  const activeCount = Object.values(selected).reduce((n, s) => n + s.size, 0);

  function toggle(groupKey: string, option: string) {
    setSelected((prev) => {
      const next: Selected = { ...prev, [groupKey]: new Set(prev[groupKey]) };
      const set = next[groupKey]!;
      if (set.has(option)) set.delete(option);
      else set.add(option);
      return next;
    });
  }

  function clearAll() {
    setSelected(Object.fromEntries(groups.map((g) => [g.key, new Set<string>()])));
  }

  // The three filters players reach for first stay open on desktop; the rest fold behind
  // a "More filters" disclosure so the sidebar isn't a wall of ~20 chips (mobile already
  // collapses everything into the sheet).
  const PRIMARY_KEYS = new Set(['classification', 'balance', 'weight']);
  const primaryGroups = groups.filter((g) => PRIMARY_KEYS.has(g.key));
  const secondaryGroups = groups.filter((g) => !PRIMARY_KEYS.has(g.key));
  const secondaryActive = secondaryGroups.reduce((n, g) => n + (selected[g.key]?.size ?? 0), 0);
  const secondaryOpen = showMore || secondaryActive > 0;

  const renderGroups = (list: FilterGroup[]) => (
    <div className="flex flex-col gap-3">
      {list.map((g) => (
        <fieldset key={g.key} className="flex flex-wrap items-center gap-1.5">
          <legend className="mb-1 inline-block w-full text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-fg-muted">
            {g.label}
          </legend>
          {g.options.map((opt) => {
            const on = selected[g.key]?.has(opt) ?? false;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(g.key, opt)}
                className="chip"
              >
                {opt}
              </button>
            );
          })}
        </fieldset>
      ))}
    </div>
  );

  const desktopControls = (
    <div className="flex flex-col gap-3">
      {renderGroups(primaryGroups)}
      {secondaryGroups.length > 0 && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={secondaryOpen}
            className="inline-flex min-h-9 items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-brand-strong"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              className={'transition-transform ' + (secondaryOpen ? 'rotate-180' : '')}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
            {secondaryOpen ? 'Fewer filters' : 'More filters'}
            {!secondaryOpen && secondaryActive > 0 && (
              <span className="tnum inline-flex h-4 min-w-4 items-center justify-center rounded-[2px] bg-brand-strong px-1 text-[0.65rem] font-bold text-on-brand">
                {secondaryActive}
              </span>
            )}
          </button>
          {secondaryOpen && <div className="mt-3">{renderGroups(secondaryGroups)}</div>}
        </div>
      )}
    </div>
  );

  const clearButton = activeCount > 0 && (
    <button
      type="button"
      onClick={clearAll}
      className="text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-brand-strong underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg"
    >
      Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
    </button>
  );

  return (
    <>
      {/* Desktop: inline sidebar panel */}
      <div className="catalog-rule hidden border-x border-b border-line bg-panel p-4 lg:block">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <p role="status" className="text-sm text-fg-muted">
            Showing <span className="tnum font-bold text-fg">{shown}</span> of {total}
          </p>
          {clearButton}
        </div>
        {desktopControls}
      </div>

      {/* Mobile: sticky trigger bar */}
      <div className="sticky top-16 z-30 -mx-4 mb-3 border-b border-line bg-ink/92 px-4 py-2.5 backdrop-blur sm:top-18 sm:-mx-6 sm:px-6 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="press secondary-action action-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {activeCount > 0 && (
              <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] bg-brand-strong px-1 text-[0.7rem] font-bold text-on-brand">
                {activeCount}
              </span>
            )}
          </button>
          <span className="text-sm text-fg-muted">
            <span className="tnum font-semibold text-fg">{shown}</span> of {total}
          </span>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      {sheetOpen && (
        <dialog ref={dialogRef} onCancel={() => setSheetOpen(false)} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-fg backdrop:bg-transparent" aria-label="Filters">
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div
            className="rise absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col border-t-[3px] border-brand bg-panel"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="panel-heading">Filters</h2>
              <div className="flex items-center gap-3">
                {clearButton}
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close filters"
                  className="icon-btn h-11 w-11"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderGroups(groups)}</div>
            <div className="border-t border-line p-4">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="press primary-action w-full"
              >
                Show {shown} racket{shown === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
