import { useEffect, useRef, useState } from 'react';
// The engine (and its Fuse.js dependency) is ~7KB gzipped and is useless until someone
// opens the panel, so it loads on first open alongside the catalogue rather than riding
// on every page load. Types are erased at build time and cost nothing.
import type {
  AssistantContext,
  AssistantData,
  AssistantResponse,
  answer as AnswerFn,
} from '../../lib/assistant';
import { track } from '../../lib/analytics';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  res?: AssistantResponse;
}

const GREETING: Msg = {
  role: 'assistant',
  text: "Hi — I'm the Racket Assistant. I answer straight from the OGKILS catalogue (no AI guesswork). Ask me a spec, compare two rackets, or tell me how you play.",
};
const STARTERS = ['Which racket is best for smashing?', 'Fire Breathing vs Thunder Breathing', 'What is balance point?'];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AssistantData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  // The thread's memory: which rackets were just discussed and what the player has told
  // us about themselves. Lives here only — nothing is stored or sent anywhere.
  // `undefined` means "no history yet"; the engine supplies its own empty context.
  const conversation = useRef<AssistantContext | undefined>(undefined);
  const engine = useRef<typeof AnswerFn | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !data && !loading && !loadError) {
      setLoading(true);
      Promise.all([
        fetch('/assistant-data.json').then((r) => {
          if (!r.ok) throw new Error('Catalogue unavailable');
          return r.json() as Promise<AssistantData>;
        }),
        import('../../lib/assistant'),
      ])
        .then(([d, mod]) => {
          engine.current = mod.answer;
          setData(d);
        })
        .catch(() => {
          setLoadError(true);
          setMessages((m) => [...m, { role: 'assistant', text: "I couldn't load the catalogue just now — please try again in a moment." }]);
        })
        .finally(() => setLoading(false));
    }
  }, [open, data, loading, loadError]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    if (data) inputRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); launcherRef.current?.focus(); }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, data]);

  function ask(q: string) {
    const query = q.trim();
    if (!query || !data || !engine.current) return;
    const res = engine.current(query, data, conversation.current);
    conversation.current = res.context;
    track('assistant_intent', { intent: res.intent, rackets: res.rackets.join(',') || null });
    if (res.fellBack) track('assistant_fallback', { query });
    setMessages((m) => [...m, { role: 'user', text: query }, { role: 'assistant', text: res.text, res }]);
    setInput('');
  }

  function resetThread() {
    conversation.current = undefined;
    setMessages([GREETING]);
    setInput('');
    inputRef.current?.focus();
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        ref={launcherRef}
        aria-controls="racket-assistant-panel"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close Racket Assistant' : 'Open Racket Assistant'}
        className="assistant-fab fixed right-4 z-50 flex h-12 min-w-12 items-center justify-center gap-2 rounded-[2px] border border-line-strong border-t-[3px] border-t-brand bg-panel px-3.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-fg shadow-[0_14px_32px_-18px_rgb(0_0_0/0.6)] transition-colors hover:border-brand-strong sm:px-4"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.55L3 21l1.95-5.6A8.5 8.5 0 1 1 21 11.5z" />
          </svg>
        )}
        <span className="hidden sm:inline">{open ? 'Close' : 'Racket Assistant'}</span>
      </button>

      {open && (
        <div id="racket-assistant-panel" role="region" aria-label="Racket Assistant" className="assistant-panel rise fixed right-4 z-50 flex max-h-[70vh] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden border border-line-strong border-t-[3px] border-t-brand bg-panel shadow-[0_22px_48px_-22px_rgb(0_0_0/0.6)]">
          <header className="flex items-start justify-between gap-3 border-b border-line bg-panel-2 px-4 py-3">
            <div>
              <h2 className="panel-heading">Racket Assistant</h2>
              <p className="mt-1 text-xs text-fg-muted">Answers from the OGKILS catalogue — not AI.</p>
            </div>
            {messages.length > 1 && (
              <button
                type="button"
                onClick={resetThread}
                className="shrink-0 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-brand-strong"
              >
                Start over
              </button>
            )}
          </header>

          <div ref={scrollRef} role="log" aria-label="Conversation" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <Message key={i} msg={m} onChip={ask} />
            ))}
            {loadError && (
              <button type="button" onClick={() => setLoadError(false)} className="secondary-action action-sm">
                Retry loading catalogue
              </button>
            )}
            {loading && <p className="text-xs text-fg-faint">Loading the catalogue…</p>}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {STARTERS.map((s) => (
                  <Chip key={s} label={s} onClick={() => ask(s)} disabled={!data} />
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={data ? 'Ask about any racket…' : 'Loading…'}
              disabled={!data}
              aria-label="Ask the Racket Assistant"
              className="min-h-11 min-w-0 flex-1 rounded-[2px] border border-line-strong bg-panel px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-brand-strong focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!data || !input.trim()}
              className="primary-action action-sm shrink-0 disabled:pointer-events-none disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Message({ msg, onChip }: { msg: Msg; onChip: (q: string) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="rise flex justify-end">
        <p className="max-w-[85%] rounded-[2px] bg-panel-2 px-3 py-2 text-sm font-medium text-fg">{msg.text}</p>
      </div>
    );
  }
  const res = msg.res;
  return (
    <div className="rise flex flex-col gap-2">
      <p className="max-w-[92%] whitespace-pre-line text-sm leading-relaxed text-fg-muted">{msg.text}</p>

      {res?.table && (
        <div className="overflow-x-auto border border-line border-t-[3px] border-t-brand">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {res.table.headers.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-line bg-panel-2 p-2 text-left text-[0.65rem] font-extrabold uppercase tracking-[0.06em] text-fg"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {res.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={'border-b border-line p-2 ' + (ci === 0 ? 'text-fg-muted' : 'tnum font-semibold text-fg')}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {res && res.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {res.actions.map((a) => (
            <a
              key={a.href + a.label}
              href={a.href}
              className="secondary-action action-sm normal-case tracking-normal"
            >
              {a.label} <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}

      {res && res.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {res.suggestions.map((s) => (
            <Chip key={s} label={s} onClick={() => onChip(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="chip min-h-9 normal-case tracking-normal"
    >
      {label}
    </button>
  );
}
