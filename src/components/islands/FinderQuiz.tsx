import { useEffect, useMemo, useRef, useState } from 'react';
import { recommend, type FinderAnswers } from '../../lib/recommend';
import { setCompare } from '../../stores/compare';
import { track } from '../../lib/analytics';
import type { Racket } from '../../lib/types';

interface CompareBuy {
  label: string;
  url: string;
  channel: string;
  primary: boolean;
}
interface Props {
  catalog: Racket[];
  thumbs: Record<string, string | null>;
  buys: Record<string, CompareBuy[]>;
  classTokens: Record<string, { label: string }>;
  showBudget: boolean;
}

interface Option {
  value: string;
  label: string;
  desc?: string;
}
interface Question {
  key: keyof FinderAnswers;
  title: string;
  help?: string;
  options: Option[];
  /** budget stores a number|null instead of the string value. */
  numeric?: boolean;
}

const BASE_QUESTIONS: Question[] = [
  {
    key: 'skill', title: 'How would you rate your level?',
    options: [
      { value: 'beginner', label: 'Beginner', desc: 'Under a year, still learning strokes' },
      { value: 'intermediate', label: 'Intermediate', desc: 'Club or social league' },
      { value: 'advanced', label: 'Advanced', desc: 'Competitive' },
    ],
  },
  {
    key: 'context', title: 'What do you mostly play?',
    options: [
      { value: 'singles', label: 'Singles' },
      { value: 'doubles-rear', label: 'Doubles — rear court', desc: 'You take the attack from the back' },
      { value: 'doubles-front', label: 'Doubles — front court', desc: 'You play the net and defence' },
      { value: 'mixed', label: 'Mixed & casual' },
    ],
  },
  {
    key: 'style', title: "What's your style?",
    options: [
      { value: 'smash', label: 'I want to smash', desc: 'Power from the back' },
      { value: 'all-court', label: 'All-court', desc: 'A bit of everything' },
      { value: 'fast-defense', label: 'Fast & defensive', desc: 'Flat exchanges, quick hands' },
      { value: 'control', label: 'Control & placement', desc: 'I outlast people' },
    ],
  },
  {
    key: 'powerSource', title: 'Where should the power come from?',
    help: 'A flexible, head-heavy frame does more of the work. A stiff one rewards your own swing speed.',
    options: [
      { value: 'racket', label: 'The racket', desc: 'Give me help on clears and smashes' },
      { value: 'balanced', label: 'A bit of both' },
      { value: 'me', label: 'My own swing', desc: 'I generate the power, I want feel and feedback' },
    ],
  },
  {
    key: 'swing', title: 'Your swing & arm strength?',
    options: [
      { value: 'light', label: 'Light and fast' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'strong', label: 'Strong, full swings' },
    ],
  },
  {
    key: 'sessionLength', title: 'How long is a typical session?',
    help: 'Longer on court means fatigue matters more than peak power.',
    options: [
      { value: 'short', label: 'Under an hour', desc: 'A quick hit' },
      { value: 'medium', label: '1–2 hours', desc: 'A normal club night' },
      { value: 'long', label: 'Over 2 hours', desc: 'Long sessions or tournaments' },
    ],
  },
  {
    key: 'discomfort', title: 'Any wrist, elbow, or shoulder discomfort?',
    help: 'We use this to steer you toward a gentler, more forgiving frame.',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
    ],
  },
  {
    key: 'tension', title: 'Preferred string tension?',
    options: [
      { value: 'under24', label: 'Under 24 lbs' },
      { value: '24-27', label: '24–27 lbs' },
      { value: '28plus', label: '28 lbs and up' },
      { value: 'notsure', label: 'Not sure' },
    ],
  },
  {
    key: 'grip', title: 'Grip size?',
    options: [
      { value: 'G5', label: 'G5', desc: 'Larger / thicker' },
      { value: 'G6', label: 'G6', desc: 'Smaller / thinner' },
      { value: 'notsure', label: 'Not sure' },
    ],
  },
];

const BUDGET_QUESTION: Question = {
  key: 'budgetPhp', title: 'Any budget?', numeric: true,
  options: [
    { value: '3000', label: 'Under ₱3,000' },
    { value: '4500', label: 'Under ₱4,500' },
    { value: '6000', label: 'Under ₱6,000' },
    { value: '', label: 'No limit' },
  ],
};

const ANSWER_KEYS: (keyof FinderAnswers)[] = [
  'skill', 'context', 'style', 'powerSource', 'swing', 'sessionLength',
  'discomfort', 'tension', 'grip', 'budgetPhp',
];

function parseUrlAnswers(): { answers: FinderAnswers; done: boolean } {
  const p = new URLSearchParams(window.location.search);
  const answers: FinderAnswers = {};
  for (const k of ANSWER_KEYS) {
    const raw = p.get(k);
    if (raw === null) continue;
    if (k === 'budgetPhp') answers.budgetPhp = raw === '' ? null : Number(raw);
    else (answers as Record<string, string>)[k] = raw;
  }
  return { answers, done: p.get('r') === '1' };
}

export default function FinderQuiz({ catalog, thumbs, buys, classTokens, showBudget }: Props) {
  const questions = useMemo(
    () => (showBudget ? [...BASE_QUESTIONS, BUDGET_QUESTION] : BASE_QUESTIONS),
    [showBudget],
  );

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FinderAnswers>({});
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (hasMounted.current) headingRef.current?.focus();
    hasMounted.current = true;
  }, [step, done]);

  // Restore from a shared URL on mount.
  useEffect(() => {
    const { answers: a, done: d } = parseUrlAnswers();
    if (Object.keys(a).length) setAnswers(a);
    if (d) {
      setDone(true);
      // Arriving on a shared result URL is not a step change, so don't move focus —
      // landing on a heading wearing a focus ring reads as an error, not a hand-off.
      hasMounted.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recs = useMemo(() => (done ? recommend(answers, catalog) : []), [done, answers, catalog]);

  function persist(next: FinderAnswers, isDone: boolean) {
    const p = new URLSearchParams();
    for (const k of ANSWER_KEYS) {
      const val = next[k];
      if (val === undefined) continue;
      p.set(k, val === null ? '' : String(val));
    }
    if (isDone) p.set('r', '1');
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  function choose(q: Question, value: string) {
    const next: FinderAnswers = { ...answers };
    if (q.numeric) next.budgetPhp = value === '' ? null : Number(value);
    else (next as Record<string, string>)[q.key] = value;
    setAnswers(next);
    advance(next);
  }

  function skip() {
    const next = { ...answers };
    delete next[questions[step]!.key];
    setAnswers(next);
    advance(next);
  }

  function advance(current: FinderAnswers) {
    if (step + 1 >= questions.length) {
      setDone(true);
      persist(current, true);
      const recResult = recommend(current, catalog);
      track('finder_complete', {
        ...Object.fromEntries(ANSWER_KEYS.map((k) => [k, current[k] ?? null])),
        top: recResult[0]?.racketId ?? null,
      });
    } else {
      setStep((s) => s + 1);
      persist(current, false);
    }
  }

  function restart() {
    setAnswers({});
    setStep(0);
    setDone(false);
    window.history.replaceState(null, '', window.location.pathname);
  }

  // --- Results ---
  if (done) {
    const primary = recs.filter((r) => !r.alsoConsider).slice(0, 3);
    const also = recs.filter((r) => r.alsoConsider);
    const compareIdsList = primary.map((r) => r.racketId);

    return (
      <div>
        <div className="catalog-rule mb-8 flex flex-wrap items-end justify-between gap-4 pt-5">
          <div>
            <p className="section-kicker">Your result</p>
            <h2 ref={headingRef} tabIndex={-1} className="display-heading mt-2 text-3xl text-fg sm:text-4xl">
              Your matches
            </h2>
            <p className="prose-measure mt-2 text-sm text-fg-muted">
              Ranked for how you told us you play — with the honest trade-offs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {compareIdsList.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setCompare(compareIdsList);
                  window.location.href = `/compare?ids=${compareIdsList.join(',')}`;
                }}
                className="press primary-action action-sm"
              >
                Compare these {compareIdsList.length} <span aria-hidden="true">→</span>
              </button>
            )}
            <button type="button" onClick={restart} className="press secondary-action action-sm">
              Start over
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {primary.map((rec, i) => (
            <ResultCard key={rec.racketId} rec={rec} rank={i + 1} index={i} thumbs={thumbs} buys={buys} classTokens={classTokens} />
          ))}
        </div>

        {also.length > 0 && (
          <div className="mt-8">
            <h3 className="panel-heading mb-3 border-t border-line pt-5 text-fg-muted">Also worth a look</h3>
            <div className="flex flex-col gap-4">
              {also.map((rec, i) => (
                <ResultCard key={rec.racketId} rec={rec} index={primary.length + i} thumbs={thumbs} buys={buys} classTokens={classTokens} muted />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Quiz ---
  const q = questions[step]!;
  const pct = Math.round(((step + 1) / questions.length) * 100);
  return (
    <div className="mx-auto max-w-xl">
      {/* Progress */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <span className="tnum text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-fg-muted">
            Question {step + 1} <span className="text-fg-faint">/ {questions.length}</span>
          </span>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="tap inline-flex min-h-9 items-center px-1 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-brand-strong"
            >
              ← Back
            </button>
          )}
        </div>
        <div
          className="h-[3px] overflow-hidden bg-panel-2"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={questions.length}
          aria-valuetext={`Question ${step + 1} of ${questions.length}`}
          aria-label="Finder progress"
        >
          <div className="h-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* A question is explanatory copy, so it stays sentence case — the brochure keeps
          italic caps for campaign and model titles (DESIGN.md, Typography). */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        id="finder-question"
        className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-fg sm:text-[1.75rem]"
      >
        {q.title}
      </h2>
      {q.help && <p className="prose-measure mt-2 text-sm text-fg-muted">{q.help}</p>}

      <div className="mt-6 flex flex-col gap-2" role="group" aria-labelledby="finder-question">
        {q.options.map((opt) => {
          const chosen = String(answers[q.key] ?? '') === opt.value && answers[q.key] !== undefined;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={chosen}
              onClick={() => choose(q, opt.value)}
              className={
                'quiz-option group flex items-center justify-between gap-3 border p-4 text-left transition-colors ' +
                (chosen
                  ? 'border-brand-strong bg-panel-2 shadow-[inset_0_0_0_1px_var(--color-brand-strong)]'
                  : 'border-line bg-panel hover:border-brand-strong hover:bg-panel-2')
              }
            >
              <span className="min-w-0">
                <span className="block font-bold text-fg">{opt.label}</span>
                {opt.desc && <span className="mt-0.5 block text-sm text-fg-muted">{opt.desc}</span>}
              </span>
              <span
                aria-hidden="true"
                className={
                  'shrink-0 transition-transform ' +
                  (chosen ? 'text-brand-strong' : 'text-fg-faint group-hover:translate-x-0.5')
                }
              >
                {chosen ? '✓' : '→'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={skip}
          className="tap inline-block px-2 py-2 text-sm text-fg-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg"
        >
          Skip this question
        </button>
      </div>
    </div>
  );
}

// --- Result card ---
function ResultCard({
  rec, rank, index = 0, thumbs, buys, classTokens, muted = false,
}: {
  rec: ReturnType<typeof recommend>[number];
  rank?: number;
  index?: number;
  thumbs: Record<string, string | null>;
  buys: Record<string, CompareBuy[]>;
  classTokens: Record<string, { label: string }>;
  muted?: boolean;
}) {
  const r = rec.racket;
  const thumb = thumbs[r.id];
  const cls = classTokens[r.classification];
  const rBuys = buys[r.id] ?? [];

  return (
    <article
      className={
        'rise flex flex-col gap-5 border bg-panel p-5 sm:flex-row ' +
        (muted ? 'border-line' : 'border-line border-t-[3px] border-t-brand')
      }
      style={{ animationDelay: `${Math.min(index * 70, 350)}ms` }}
    >
      <div className="flex gap-4 sm:w-60 sm:shrink-0">
        <div className="stage stage--thumb h-20 w-20 shrink-0">
          {thumb && <img src={thumb} alt="" width={80} height={80} loading="lazy" />}
        </div>
        <div className="min-w-0">
          {rank && (
            <span className="tnum text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-brand-strong">
              #{rank} match
            </span>
          )}
          <a
            href={`/rackets/${r.id}`}
            className="mt-0.5 block text-sm font-extrabold uppercase leading-tight tracking-[0.02em] text-fg hover:underline"
            style={{ overflowWrap: 'break-word' }}
          >
            {r.name}
          </a>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-[2px] border border-brand px-1.5 py-1 text-[0.62rem] font-extrabold uppercase leading-none tracking-[0.08em] text-brand-strong">
            <span className="inline-block h-[0.3rem] w-[0.3rem] bg-current" aria-hidden="true" />
            {cls?.label}
          </span>
          <div className="tnum mt-1.5 text-xs text-fg-muted">
            Weight class {rec.weightClass}
            {!rec.inStock && ' · out of stock'}
            {rec.overBudget && ' · over budget'}
          </div>
        </div>
      </div>

      <div className="flex-1">
        {rec.reasons.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {rec.reasons.map((reason, i) => (
              <li key={i} className="flex gap-2 text-sm text-fg-muted">
                <span className="shrink-0 text-brand-strong" aria-hidden="true">✓</span>
                {reason}
              </li>
            ))}
          </ul>
        )}
        {rec.tradeoff && (
          <p className="mt-3 flex gap-2 border-t border-line pt-3 text-sm text-fg-faint">
            <span className="shrink-0" aria-hidden="true">→</span>
            {rec.tradeoff}
          </p>
        )}
        {rBuys.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {rBuys.map((b) => (
              <a
                key={b.channel}
                href={b.url}
                target="_blank"
                rel="noopener"
                data-buy-channel={b.channel}
                data-buy-racket={r.id}
                data-buy-placement="finder"
                data-buy-variant={rec.weightClass}
                className={`press action-sm ${b.primary ? 'primary-action' : 'secondary-action'}`}
              >
                {b.label} <span aria-hidden="true" className="text-[0.7em] opacity-70">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
