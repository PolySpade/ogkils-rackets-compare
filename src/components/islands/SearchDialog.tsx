import { useCallback, useEffect, useRef, useState } from 'react';
import { searchRackets, type SearchRecord } from '../../lib/search';
import { formatPrice } from '../../lib/format';
import { track } from '../../lib/analytics';

// Mounted once in Base.astro. Any element with [data-open-search] opens it — the same
// delegated pattern [data-compare-toggle] uses — so the header button, and anything
// added later, work without prop-drilling through Astro components.

const PLACEHOLDER = 'Search rackets — name, code, or style';

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // The control that opened the dialog, so focus can go back where it came from.
  const opener = useRef<HTMLElement | null>(null);

  const openDialog = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    track('search_open');
  }, []);

  // Triggers: any [data-open-search] control, "/" anywhere, and Ctrl/⌘+K.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-open-search]');
      if (!el) return;
      e.preventDefault();
      openDialog();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const combo = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!combo && !slash) return;
      if (slash && isTypingTarget(e.target)) return;
      e.preventDefault();
      openDialog();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openDialog]);

  // The index is ~2KB of JSON and useless until someone searches, so it loads on first
  // open rather than riding on every page load.
  useEffect(() => {
    if (!open || index || loadError) return;
    let cancelled = false;
    fetch('/search-index.json')
      .then((r) => {
        if (!r.ok) throw new Error('index unavailable');
        return r.json() as Promise<{ rackets: SearchRecord[] }>;
      })
      .then((d) => {
        if (!cancelled) setIndex(d.rackets);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, index, loadError]);

  // Native modal semantics: focus stays inside and Escape closes (matches FilterBar).
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [open]);

  const results = index ? searchRackets(query, index) : [];
  const trimmed = query.trim();

  useEffect(() => {
    setActive(0);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Click the anchor so the View Transitions router handles the navigation; its
      // own onClick closes the dialog.
      itemRefs.current[active]?.click();
    }
  }

  return (
    <>
      {open && (
        <dialog
          ref={dialogRef}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          aria-label="Search rackets"
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-fg backdrop:bg-transparent"
        >
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={close} />
          <div className="absolute inset-x-0 top-0 flex justify-center px-4 pt-4 sm:pt-[10vh]">
            <div
              className="rise flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden border border-line-strong border-t-[3px] border-t-brand bg-panel shadow-[0_22px_48px_-22px_rgb(0_0_0/0.6)]"
            >
              <div className="flex items-center gap-2 border-b border-line px-3">
                <svg
                  width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  className="shrink-0 text-fg-faint"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.6-3.6" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder={index || loadError ? PLACEHOLDER : 'Loading…'}
                  aria-label="Search rackets"
                  role="combobox"
                  aria-expanded={results.length > 0}
                  aria-controls="search-results"
                  aria-autocomplete="list"
                  aria-activedescendant={results[active] ? `search-hit-${results[active].record.id}` : undefined}
                  className="min-h-12 min-w-0 flex-1 bg-transparent py-3 text-base text-fg placeholder:text-fg-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="icon-btn h-11 w-11 shrink-0"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadError && (
                  <p className="p-4 text-sm text-fg-muted">
                    The catalogue didn’t load.{' '}
                    <a href="/rackets" className="font-bold text-brand-strong underline underline-offset-4">
                      Browse all rackets
                    </a>{' '}
                    instead.
                  </p>
                )}

                {!loadError && trimmed === '' && (
                  <p className="p-4 text-sm text-fg-muted">
                    Type a name (<span className="font-semibold text-fg">Fire</span>), a model
                    code (<span className="font-semibold text-fg">LD77PRO</span>), or a style
                    (<span className="font-semibold text-fg">attack 4U</span>).
                  </p>
                )}

                {!loadError && trimmed !== '' && results.length === 0 && index && (
                  <div className="p-4">
                    <p className="text-sm text-fg-muted">
                      No racket matches “<span className="font-semibold text-fg">{trimmed}</span>”.
                    </p>
                    <a
                      href={`/rackets?q=${encodeURIComponent(trimmed)}`}
                      onClick={close}
                      className="secondary-action action-sm mt-3"
                    >
                      Browse the full lineup <span aria-hidden="true">→</span>
                    </a>
                  </div>
                )}

                {results.length > 0 && (
                  <ul id="search-results" role="listbox" aria-label="Search results">
                    {results.map((hit, i) => {
                      const r = hit.record;
                      return (
                        <li key={r.id} role="presentation">
                          <a
                            id={`search-hit-${r.id}`}
                            role="option"
                            aria-selected={i === active}
                            ref={(el) => {
                              itemRefs.current[i] = el;
                            }}
                            href={`/rackets/${r.id}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => {
                              track('search_select', { query: trimmed, racketId: r.id, rank: i });
                              close();
                            }}
                            className={
                              'flex items-center justify-between gap-3 border-b border-line px-4 py-3 transition-colors ' +
                              (i === active ? 'bg-panel-2' : 'hover:bg-panel-2')
                            }
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-extrabold uppercase tracking-tight text-fg">
                                {r.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                                {[r.classification, r.balance, r.weights.join(' / ')]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>
                            {formatPrice(r.pricePhp) && (
                              <span className="tnum shrink-0 text-sm font-bold text-fg">
                                {formatPrice(r.pricePhp)}
                              </span>
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="hidden items-center justify-between gap-3 border-t border-line bg-panel-2 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-fg-faint sm:flex">
                <span>↑ ↓ to move · ↵ to open · esc to close</span>
                <a href="/rackets" onClick={close} className="transition-colors hover:text-brand-strong">
                  Browse all
                </a>
              </div>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
