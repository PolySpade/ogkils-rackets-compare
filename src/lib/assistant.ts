// Racket Assistant — retrieval + intent matching over the catalog (product.md §8).
// There is NO LLM at runtime; this is deterministic and fully unit-tested. Honest by
// design: the UI labels it "Racket Assistant", not "AI".
//
// Structure:
//   1. Normalise      — lowercase, Taglish/PH-English synonyms, number forms
//   2. Extract        — rackets, specs, attributes, price caps, materials, pronouns
//   3. Classify       — intent, most specific first
//   4. Respond        — templated from real data, never invented
//
// The DIMENSIONS table (§5) is the engine's spine: adding one spec there gives you a
// spec answer, a superlative ("the stiffest"), a comparative ("which is stiffer, X or
// Y?") and a yes/no check for free. Add specs there, not in the responders.
import Fuse from 'fuse.js';
import { recommend, scoreVariant, type FinderAnswers, type Style, type Skill } from './recommend';
import { balanceBucket } from './derive';
import {
  formatStiffness,
  formatPrice,
  formatWeightClasses,
  racketBalanceRange,
  trustedGripLengthMm,
} from './format';
import type { Racket, Variant } from './types';

export type Intent =
  | 'spec_lookup'
  | 'compare'
  | 'recommend'
  | 'list_by_attribute'
  | 'explain_term'
  | 'buy'
  | 'superlative'
  | 'suitability'
  | 'catalog_overview'
  | 'smalltalk'
  | 'fallback';

export interface GlossaryEntry {
  key: string;
  term: string;
  short: string;
  long: string;
}
export interface AssistantData {
  rackets: Racket[];
  glossary: GlossaryEntry[];
  /** Buy links per racket id (with UTM, placement=chat). */
  buys: Record<string, { label: string; url: string; channel: string; primary: boolean }[]>;
}

/**
 * What the assistant carries between turns. Kept small and serialisable so the widget
 * can hold it in React state — there is no session store and nothing leaves the browser.
 */
export interface AssistantContext {
  /** Racket ids from recent turns, most recent first, capped at 4. */
  recentRackets: string[];
  /** Intent of the previous turn, so a bare follow-up can inherit it. */
  lastIntent?: Intent;
  /** Spec the previous turn was about, so "and the Wind Breathing?" keeps the subject. */
  lastDimension?: string;
  /** What the player has told us about themselves, accumulated across the session. */
  profile: FinderAnswers;
}

export const emptyContext = (): AssistantContext => ({ recentRackets: [], profile: {} });

export interface AssistantAction {
  label: string;
  href: string;
}
export interface AssistantResponse {
  intent: Intent;
  text: string;
  /** Racket ids referenced, for the UI to render chips/links. */
  rackets: string[];
  table?: { headers: string[]; rows: string[][] };
  actions: AssistantAction[];
  /** Follow-up chips. Always offered on fallback; often useful elsewhere too. */
  suggestions: string[];
  fellBack: boolean;
  /** Carry this back into the next answer() call to keep the thread. */
  context: AssistantContext;
}

const DASH = '—';

// --- 1. Normalise (Taglish + PH-English synonyms, §8.1) ------------------------------
const SYNONYMS: [RegExp, string][] = [
  [/pang[-\s]?smash|pansmash/g, 'smash'],
  [/magaan/g, 'light'],
  [/mabigat/g, 'heavy'],
  [/matigas/g, 'stiff'],
  [/malambot/g, 'flexible'],
  [/pambato|pinakama(ganda|husay)/g, 'best'],
  [/magkano|presyo/g, 'price'],
  [/\bsaan\b/g, 'where'],
  [/mabibili|bilhin/g, 'buy'],
  [/panimula|nagsisimula/g, 'beginner'],
  [/\bano\b/g, 'what'],
  [/\bmura\b/g, 'cheap'],
  [/\bmeron\b|\bmayroon\b/g, 'have'],
  [/\bsalamat\b/g, 'thanks'],
];

export function normalize(input: string): string {
  let s = input.toLowerCase().trim();
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep);
  // Money and shorthand survive punctuation stripping: "₱4,500" and "4.5k" both become
  // plain digits so a price cap can be read off them.
  s = s.replace(/(\d)[,](\d{3})\b/g, '$1$2');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?k\b/g, (_m, n) => String(Math.round(Number(n) * 1000)));
  s = s.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

const has = (s: string, arr: string[]) => arr.some((k) => s.includes(k));
/** Whole-word test — "u" must not match inside "vibranium". */
const hasWord = (s: string, word: string) =>
  new RegExp(`(^|\\s)${escapeRe(word)}(\\s|$)`).test(s);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- 2. Entity extraction ------------------------------------------------------------
function buildFuse(rackets: Racket[]) {
  const docs = rackets.map((r) => ({
    id: r.id,
    name: r.name,
    modelCode: r.modelCode,
    aliases: r.aliases.join(' '),
  }));
  return new Fuse(docs, {
    keys: ['name', 'modelCode', 'aliases'],
    threshold: 0.3,
    includeScore: true,
    ignoreLocation: true,
  });
}

/** Words that must never fuzzy-match a model name — they carry their own meaning. */
const FUZZY_STOPWORDS = new Set([
  'have', 'want', 'need', 'best', 'good', 'light', 'heavy', 'stiff', 'soft', 'price',
  'cheap', 'under', 'over', 'about', 'which', 'what', 'that', 'this', 'them', 'they',
  'more', 'most', 'less', 'least', 'take', 'takes', 'with', 'from', 'your', 'mine',
  'beginner', 'advanced', 'intermediate', 'smash', 'defense', 'defence', 'control',
  'attack', 'speed', 'balance', 'weight', 'tension', 'shaft', 'frame', 'grip', 'racket',
  'rackets', 'string', 'stock', 'available', 'recommend', 'compare', 'between',
  // Series words name a whole family. "the breathing rackets" used to fuzzy-resolve to
  // whichever Breathing model happened to sort first.
  'breathing', 'leading', 'series',
]);

export function extractRackets(normalized: string, rackets: Racket[]): Racket[] {
  const byId = new Map(rackets.map((r) => [r.id, r]));
  const found = new Map<string, number>(); // id → position in query (for ordering)

  // Direct term matches (name words, model code, aliases) — most reliable.
  for (const r of rackets) {
    const terms = new Set<string>([
      r.modelCode.toLowerCase(),
      ...r.aliases.map((a) => a.toLowerCase()),
    ]);
    // Distinctive first word of the name (e.g. "fire", "thunder", "mist").
    const firstWord = r.name.toLowerCase().split(' ')[0]!;
    if (firstWord.length >= 3) terms.add(firstWord);
    terms.add(r.name.toLowerCase());
    for (const t of terms) {
      const idx = normalized.indexOf(t);
      if (idx >= 0 && hasWord(normalized, t)) {
        if (!found.has(r.id)) found.set(r.id, idx);
      }
    }
  }

  // Fuzzy fallback for typos when nothing matched directly. Bare numbers and ordinary
  // English words are excluded — "anything under 4000" used to resolve to a racket.
  if (found.size === 0) {
    const fuse = buildFuse(rackets);
    for (const word of normalized.split(' ')) {
      if (word.length < 4) continue;
      if (/^\d+$/.test(word)) continue;
      if (FUZZY_STOPWORDS.has(word)) continue;
      const hit = fuse.search(word)[0];
      if (hit && (hit.score ?? 1) < 0.2) found.set(hit.item.id, normalized.indexOf(word));
    }
  }

  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => byId.get(id)!)
    .filter(Boolean);
}

interface Attrs {
  weightClass?: string;
  grip?: string;
  tensionLbs?: number;
  /** "under 4000", "below ₱5,500" — a soft ceiling, never a hard filter on its own. */
  maxPricePhp?: number;
  /** A frame material named in the query, matched against the catalogue's own list. */
  material?: string;
  /** A whole series — "the breathing rackets" — which scopes rather than selects. */
  series?: string;
}

export function extractAttrs(normalized: string, rackets: Racket[] = []): Attrs {
  const attrs: Attrs = {};
  const wc = normalized.match(/\b([3456])\s?u\b/);
  if (wc) attrs.weightClass = `${wc[1]}U`;
  const g = normalized.match(/\bg\s?([56])\b/);
  if (g) attrs.grip = `G${g[1]}`;
  const t = normalized.match(/\b(\d{2})\s?(lbs?|pounds)\b/);
  if (t) attrs.tensionLbs = Number(t[1]);

  const price = normalized.match(/\b(?:under|below|less than|within|max|budget of|up to)\s+(\d{3,6})\b/);
  if (price) attrs.maxPricePhp = Number(price[1]);

  // A series word only scopes the question when it isn't part of a model name that was
  // spelled out ("the breathing rackets" scopes; "fire breathing" does not).
  const seriesNames = [...new Set(rackets.map((r) => r.series))].filter((x) => x !== 'Other');
  for (const series of seriesNames) {
    const token = series.toLowerCase();
    if (!hasWord(normalized, token)) continue;
    const namesAModel = rackets.some(
      (r) => r.series === series && hasWord(normalized, r.name.toLowerCase().split(' ')[0]!),
    );
    if (!namesAModel) {
      attrs.series = series;
      break;
    }
  }

  // Materials come from the data, so "what is vibranium" is answered from the catalogue
  // rather than guessed at — and a material we don't stock simply isn't matched.
  const materials = new Set<string>();
  for (const r of rackets) for (const m of r.materials) materials.add(m);
  for (const m of materials) {
    const token = m.toLowerCase();
    if (normalized.includes(token)) {
      attrs.material = m;
      break;
    }
    // Match the distinctive head word too: "toray" for "TORAY M46J".
    const head = token.split(/[\s+]/)[0]!;
    if (head.length >= 5 && hasWord(normalized, head)) {
      attrs.material = m;
      break;
    }
  }
  return attrs;
}

// --- 3. Measurable dimensions --------------------------------------------------------
// One row here gives: a spec answer, a superlative, a comparative, and a yes/no check.
type Dir = 'high' | 'low';

interface Dimension {
  key: string;
  label: string;
  /** Phrases that select this dimension. Matched longest-first. */
  triggers: string[];
  /** Superlative phrasings, e.g. "heaviest". */
  highWords: string[];
  lowWords: string[];
  /** What "high" means in plain words, for the superlative sentence. */
  highNoun: string;
  lowNoun: string;
  /** Comparable value; null when the figure is not published (§4.3). */
  value: (r: Racket, dir: Dir) => number | null;
  /** How this racket's figure reads in a sentence. */
  say: (r: Racket) => string;
  /**
   * The single figure being ranked, for superlatives and head-to-heads. `say` reports
   * the whole span, which reads badly in "the lightest is X — 3U · 4U · 5U (75–89.9g)".
   */
  sayAt?: (r: Racket, dir: Dir) => string;
  /**
   * What tied rackets genuinely have in common. Stiffness ranks on the published word,
   * so reporting one racket's numeric range would imply the others share it — they
   * don't (Love Breathing reads "Slightly Soft" at 8.7, LD800PRO "Slightly Stiff" at
   * 7.75, so the numbers do not track the word).
   */
  sayShared?: (r: Racket) => string;
}

const variantNums = (r: Racket, pick: (v: Variant) => number | null): number[] =>
  r.variants.map(pick).filter((n): n is number => n !== null);

const spanOf = (r: Racket, pick: (v: Variant) => number | null, dir: Dir): number | null => {
  const nums = variantNums(r, pick);
  if (nums.length === 0) return null;
  return dir === 'high' ? Math.max(...nums) : Math.min(...nums);
};

/** The variant that carries a racket's extreme value on some measure. */
const pickVariant = (
  r: Racket,
  pick: (v: Variant) => number | null,
  dir: Dir,
): Variant | undefined => {
  const withValue = r.variants.filter((v) => pick(v) !== null);
  if (withValue.length === 0) return undefined;
  return withValue.reduce((best, v) =>
    (dir === 'high' ? pick(v)! > pick(best)! : pick(v)! < pick(best)!) ? v : best,
  );
};

/** The ranked figure if the dimension reports one, otherwise its summary. */
const figure = (dim: Dimension, r: Racket, dir: Dir): string =>
  dim.sayAt ? dim.sayAt(r, dir) : dim.say(r);

/** What a set of tied rackets can honestly be said to share. */
const shared = (dim: Dimension, r: Racket, dir: Dir): string =>
  dim.sayShared ? dim.sayShared(r) : figure(dim, r, dir);

export const DIMENSIONS: Dimension[] = [
  {
    key: 'swingWeight',
    label: 'Swing weight',
    triggers: ['swing weight', 'swingweight', 'swing'],
    highWords: ['highest swing weight', 'heaviest swing'],
    lowWords: ['lowest swing weight', 'lightest swing'],
    highNoun: 'the highest swing weight',
    lowNoun: 'the lowest swing weight',
    value: (r, dir) => spanOf(r, (v) => (v.swingWeightMissing ? null : v.swingWeight), dir),
    say: (r) => {
      const nums = variantNums(r, (v) => (v.swingWeightMissing ? null : v.swingWeight));
      if (nums.length === 0) return `${DASH} (not published)`;
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      return lo === hi ? `${lo}` : `${lo}–${hi}`;
    },
  },
  {
    key: 'weight',
    label: 'Weight',
    triggers: ['weight class', 'how heavy', 'how light', 'weight', 'heavy', 'light', 'grams'],
    highWords: ['heaviest', 'most heavy'],
    lowWords: ['lightest', 'most light'],
    highNoun: 'the heaviest frame',
    lowNoun: 'the lightest frame',
    value: (r, dir) => spanOf(r, (v) => v.weightMidG, dir),
    say: (r) => {
      const lo = Math.min(...r.variants.map((v) => v.weightRangeG[0]));
      const hi = Math.max(...r.variants.map((v) => v.weightRangeG[1]));
      return `${formatWeightClasses(r.variants)} (${lo}–${hi}g)`;
    },
    sayAt: (r, dir) => {
      const v = pickVariant(r, (x) => x.weightMidG, dir)!;
      return `${v.weightRangeG[0]}–${v.weightRangeG[1]}g in ${v.weightClass}`;
    },
    sayShared: (r) => {
      const v = pickVariant(r, (x) => x.weightMidG, 'high')!;
      return `a ${v.weightClass} band (${v.weightRangeG[0]}–${v.weightRangeG[1]}g)`;
    },
  },
  {
    key: 'balance',
    label: 'Balance point',
    triggers: ['balance point', 'balance', 'head-heavy', 'head heavy', 'head-light', 'head light'],
    highWords: ['most head-heavy', 'most head heavy', 'heaviest head'],
    lowWords: ['most head-light', 'most head light', 'lightest head'],
    highNoun: 'the most head-heavy balance',
    lowNoun: 'the most head-light balance',
    value: (r, dir) => spanOf(r, (v) => v.balancePointMm, dir),
    say: (r) => `${racketBalanceRange(r)}mm (${r.balance.toLowerCase()})`,
    sayAt: (r, dir) => {
      const v = pickVariant(r, (x) => x.balancePointMm, dir)!;
      return `${v.balancePointMm}mm in ${v.weightClass}`;
    },
  },
  {
    key: 'stiffness',
    label: 'Stiffness',
    triggers: ['shaft stiffness', 'stiffness', 'stiff', 'flex', 'flexible', 'soft', 'forgiving'],
    highWords: ['stiffest', 'most stiff'],
    lowWords: ['most flexible', 'softest', 'most forgiving', 'least stiff'],
    highNoun: 'the stiffest shaft',
    lowNoun: 'the most flexible shaft',
    // Ranked on the published word only: the numeric range measures the shaft, not its
    // flex, and runs the other way for several models (§4.3).
    value: (r) => r.derived.stiffnessOrdinal,
    say: (r) => {
      const s = formatStiffness(r.stiffness, r.derived.stiffnessWordConflict);
      return s.label ? `${s.label} (${s.primary})` : s.primary;
    },
    sayShared: (r) => r.stiffness.word,
  },
  {
    key: 'maxTension',
    label: 'Max tension',
    triggers: ['max tension', 'string tension', 'tension', 'lbs', 'pounds'],
    highWords: ['highest tension', 'most tension'],
    lowWords: ['lowest tension'],
    highNoun: 'the highest tension ceiling',
    lowNoun: 'the lowest tension ceiling',
    value: (r, dir) => spanOf(r, (v) => v.maxTensionLbs, dir),
    say: (r) => `up to ${Math.max(...r.variants.map((v) => v.maxTensionLbs))} lbs`,
    sayAt: (r, dir) => `${spanOf(r, (v) => v.maxTensionLbs, dir)} lbs`,
  },
  {
    key: 'frameArea',
    label: 'Frame area',
    triggers: ['frame area', 'head size', 'biggest head', 'largest head', 'sweet spot'],
    highWords: ['biggest head', 'largest head', 'biggest frame', 'largest frame'],
    lowWords: ['smallest head', 'smallest frame'],
    highNoun: 'the largest frame area',
    lowNoun: 'the smallest frame area',
    value: (r) => r.frameAreaCm2,
    say: (r) => (r.frameAreaCm2 === null ? `${DASH} (not published)` : `${r.frameAreaCm2}cm²`),
  },
  {
    key: 'shaftDiameter',
    label: 'Shaft diameter',
    triggers: ['shaft diameter', 'shaft thickness', 'shaft'],
    highWords: ['thickest shaft'],
    lowWords: ['thinnest shaft'],
    highNoun: 'the thickest shaft',
    lowNoun: 'the thinnest shaft',
    value: (r) => r.shaftDiameterMm,
    say: (r) => `${r.shaftDiameterMm}mm`,
  },
  {
    key: 'price',
    label: 'Price',
    triggers: ['price', 'cost'],
    highWords: ['most expensive', 'priciest', 'dearest'],
    lowWords: ['cheapest', 'most affordable', 'least expensive', 'lowest price', 'cheap'],
    highNoun: 'the highest price',
    lowNoun: 'the lowest price',
    value: (r) => r.pricePhp,
    say: (r) => formatPrice(r.pricePhp) ?? `${DASH} (price shown at the store)`,
  },
  {
    key: 'gripLength',
    label: 'Grip length',
    triggers: ['grip length', 'handle length'],
    highWords: ['longest grip', 'longest handle'],
    lowWords: ['shortest grip', 'shortest handle'],
    highNoun: 'the longest grip',
    lowNoun: 'the shortest grip',
    value: (r) => trustedGripLengthMm(r),
    say: (r) => {
      const g = trustedGripLengthMm(r);
      return g === null ? `${DASH} (not published)` : `${g}mm`;
    },
  },
  {
    key: 'racketLength',
    label: 'Racket length',
    triggers: ['racket length', 'how long', 'length'],
    highWords: ['longest racket'],
    lowWords: ['shortest racket'],
    highNoun: 'the greatest length',
    lowNoun: 'the shortest length',
    value: (r) => r.racketLengthMm,
    say: (r) => `${r.racketLengthMm}mm`,
  },
];

/** The dimension a query is asking about, most specific phrase first. */
export function detectDimension(normalized: string): Dimension | undefined {
  let best: { dim: Dimension; len: number } | undefined;
  for (const dim of DIMENSIONS) {
    for (const t of dim.triggers) {
      if (!normalized.includes(t)) continue;
      if (!best || t.length > best.len) best = { dim, len: t.length };
    }
  }
  return best?.dim;
}

/** A superlative request: which dimension, and which end of it. */
function detectSuperlative(normalized: string): { dim: Dimension; dir: Dir } | undefined {
  let best: { dim: Dimension; dir: Dir; len: number } | undefined;
  for (const dim of DIMENSIONS) {
    for (const w of dim.highWords) {
      if (normalized.includes(w) && (!best || w.length > best.len)) best = { dim, dir: 'high', len: w.length };
    }
    for (const w of dim.lowWords) {
      if (normalized.includes(w) && (!best || w.length > best.len)) best = { dim, dir: 'low', len: w.length };
    }
  }
  if (best) return { dim: best.dim, dir: best.dir };

  // Generic "-est" / "most X" phrasing paired with a dimension word, e.g. "which racket
  // has the biggest frame area".
  const generic = /\b(biggest|largest|highest|greatest|most|smallest|lowest|least)\b/.test(normalized);
  if (!generic) return undefined;
  const dim = detectDimension(normalized);
  if (!dim) return undefined;
  const dir: Dir = /\b(smallest|lowest|least)\b/.test(normalized) ? 'low' : 'high';
  return { dim, dir };
}

// --- 4. Intent classification --------------------------------------------------------
const BUY_KEYWORDS = ['price', 'buy', 'how much', 'available', 'in stock', 'stock', 'cost', 'where'];
const COMPARE_KEYWORDS = ['vs', 'versus', 'compare', 'difference', 'better'];
const LIST_KEYWORDS = ['which rackets', 'what rackets', 'show me', 'list', 'rackets that', 'ones that', 'all the', 'which ones', 'any rackets'];
const RECOMMEND_KEYWORDS = ['recommend', 'best', 'suggest', 'good for', 'for beginner', 'for smash', 'which racket for', 'what should', 'help me', 'for a beginner', 'what do you recommend', 'should i get', 'should i buy'];
const EXPLAIN_KEYWORDS = ['what is', 'what is a', 'what does', 'explain', 'meaning', 'what are', 'mean', 'difference between'];
const SUITABILITY_PATTERNS = [
  /\bis the .+ (good|ok|okay|suitable|right|fine)\b/,
  /\bwould the .+ (work|suit|be good)\b/,
  /\bis .+ good for\b/,
  /\bis .+ suitable\b/,
];
const OVERVIEW_KEYWORDS = ['what rackets do you have', 'what do you have', 'full lineup', 'whole lineup', 'all your rackets', 'how many rackets', 'what models'];
const GREETING_WORDS = ['hi', 'hello', 'hey', 'yo', 'kumusta', 'kamusta', 'good morning', 'good afternoon', 'good evening'];
const THANKS_WORDS = ['thanks', 'thank you', 'salamat', 'ty', 'nice', 'cool', 'ok', 'okay'];
const IDENTITY_PATTERNS = [/\bare you (a )?(bot|ai|robot|human|real)\b/, /\bwho are you\b/, /\bwhat are you\b/, /\bare you chatgpt\b/];
const DISCOMFORT_WORDS = ['tennis elbow', 'elbow', 'shoulder', 'wrist', 'injur', 'pain', 'sore', 'sakit'];

function detectGlossaryKey(normalized: string, glossary: GlossaryEntry[]): string | undefined {
  // Word-boundary triggers. The previous version trimmed " u " to "u" and matched the
  // letter inside any word, so "what is vibranium" answered with the weight-class entry.
  const TRIGGERS: Record<string, { phrases?: string[]; words?: string[] }> = {
    'weight-class': {
      phrases: ['u weight', 'weight class', 'weight band'],
      words: ['3u', '4u', '5u', '6u', 'u'],
    },
    'balance-point': { phrases: ['balance point', 'balance'] },
    'shaft-stiffness': { phrases: ['stiffness', 'shaft flex'], words: ['flex'] },
    'shaft-diameter': { phrases: ['shaft diameter', 'shaft thickness'] },
    'frame-holes': { phrases: ['grommet'], words: ['holes'] },
    'frame-area': { phrases: ['frame area', 'head size'] },
    'grip-size': { phrases: ['grip size'] },
    'max-tension': { phrases: ['max tension', 'tension'] },
    'swing-weight': { phrases: ['swing weight'] },
    classification: { phrases: ['classification'] },
  };
  let best: { key: string; len: number } | undefined;
  for (const g of glossary) {
    const trig = TRIGGERS[g.key] ?? { phrases: [g.term.toLowerCase()] };
    for (const p of trig.phrases ?? []) {
      if (normalized.includes(p) && (!best || p.length > best.len)) best = { key: g.key, len: p.length };
    }
    for (const w of trig.words ?? []) {
      if (hasWord(normalized, w) && (!best || w.length > best.len)) best = { key: g.key, len: w.length };
    }
  }
  return best?.key;
}

function detectSmalltalk(normalized: string): 'greeting' | 'thanks' | 'identity' | undefined {
  if (IDENTITY_PATTERNS.some((re) => re.test(normalized))) return 'identity';
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return 'greeting';
  // Only treat it as smalltalk when that is the whole message — "hi, how heavy is the
  // fire breathing" is a spec question with a greeting stuck on the front.
  if (words.length <= 3) {
    if (words.some((w) => GREETING_WORDS.includes(w)) || GREETING_WORDS.some((g) => normalized === g)) return 'greeting';
    if (words.some((w) => THANKS_WORDS.includes(w))) return 'thanks';
  }
  return undefined;
}

export function classifyIntent(
  normalized: string,
  rackets: Racket[],
  glossary: GlossaryEntry[],
  attrs: Attrs = {},
): Intent {
  if (detectSmalltalk(normalized)) return 'smalltalk';
  if (has(normalized, OVERVIEW_KEYWORDS)) return 'catalog_overview';

  const glossaryKey = detectGlossaryKey(normalized, glossary);
  const isDefinitional = has(normalized, EXPLAIN_KEYWORDS);

  // "is the Fire Breathing good for a beginner" is a question about that racket, not a
  // request for three different ones.
  if (rackets.length === 1 && SUITABILITY_PATTERNS.some((re) => re.test(normalized))) {
    return 'suitability';
  }

  // A superlative is a catalogue-wide question and outranks a single racket mention.
  if (detectSuperlative(normalized) && rackets.length <= 1) return 'superlative';

  // A definitional question about a material is answered from the catalogue.
  if (isDefinitional && attrs.material && rackets.length === 0) return 'explain_term';
  if (isDefinitional && glossaryKey && rackets.length === 0) return 'explain_term';

  if (rackets.length >= 2 || (has(normalized, COMPARE_KEYWORDS) && rackets.length === 1)) return 'compare';

  // "what should I buy" is a recommendation, even though it contains "buy".
  const wantsRecommendation =
    has(normalized, RECOMMEND_KEYWORDS) || detectStyle(normalized) || detectSkill(normalized) || has(normalized, DISCOMFORT_WORDS);
  if (wantsRecommendation && rackets.length === 0) return 'recommend';

  if (has(normalized, BUY_KEYWORDS) && (rackets.length === 1 || !wantsRecommendation)) return 'buy';

  // A list request beats a single-racket spec read: "show me head-light rackets" is not
  // a question about whichever racket happened to fuzzy-match.
  if (has(normalized, LIST_KEYWORDS) || attrs.maxPricePhp !== undefined) return 'list_by_attribute';

  if (rackets.length === 1) return 'spec_lookup';

  if (wantsRecommendation) return 'recommend';
  if (has(normalized, COMPARE_KEYWORDS)) return 'compare';
  if (isDefinitional && (glossaryKey || attrs.material)) return 'explain_term';

  // A bare attribute description — "something stiff and head heavy" — is a filter.
  if (countAttributeFilters(normalized, attrs) > 0) return 'list_by_attribute';

  return 'fallback';
}

// --- helpers for recommend mapping ---
function detectStyle(s: string): Style | undefined {
  if (s.includes('smash')) return 'smash';
  if (s.includes('defen') || s.includes('fast') || s.includes('flat')) return 'fast-defense';
  if (s.includes('control') || s.includes('placement')) return 'control';
  if (s.includes('all-court') || s.includes('all court') || s.includes('all-around') || s.includes('everything')) return 'all-court';
  return undefined;
}
function detectSkill(s: string): Skill | undefined {
  if (s.includes('beginner') || s.includes('starting') || s.includes('new to') || s.includes('just started')) return 'beginner';
  if (s.includes('advanced') || s.includes('competitive')) return 'advanced';
  if (s.includes('intermediate')) return 'intermediate';
  return undefined;
}

/** Everything the query says about the player, folded into the running profile. */
function readProfile(normalized: string, attrs: Attrs, prior: FinderAnswers): FinderAnswers {
  const p: FinderAnswers = { ...prior };
  const style = detectStyle(normalized);
  const skill = detectSkill(normalized);
  if (style) p.style = style;
  if (skill) p.skill = skill;
  if (attrs.grip === 'G5' || attrs.grip === 'G6') p.grip = attrs.grip;
  if (has(normalized, DISCOMFORT_WORDS)) p.discomfort = 'yes';
  if (normalized.includes('doubles') && (normalized.includes('back') || normalized.includes('rear'))) p.context = 'doubles-rear';
  else if (normalized.includes('doubles') && (normalized.includes('front') || normalized.includes('net'))) p.context = 'doubles-front';
  else if (normalized.includes('singles')) p.context = 'singles';
  if (attrs.maxPricePhp !== undefined) p.budgetPhp = attrs.maxPricePhp;
  return p;
}

// --- 5. Respond ----------------------------------------------------------------------
function buyAction(r: Racket, data: AssistantData): AssistantAction | null {
  const b = data.buys[r.id]?.[0];
  return b ? { label: `Buy the ${r.name}`, href: b.url } : null;
}

const listNames = (rs: Racket[]): string =>
  rs.length <= 1
    ? (rs[0]?.name ?? '')
    : `${rs.slice(0, -1).map((r) => r.name).join(', ')} and ${rs.at(-1)!.name}`;

/**
 * A direct yes/no where the query asks whether a racket does something specific.
 * Returns null when the question isn't of that shape, so the caller falls through.
 */
function yesNoAnswer(r: Racket, normalized: string, attrs: Attrs): string | null {
  // "can I string it at 30 lbs" / "does it take 32 lbs"
  if (attrs.tensionLbs !== undefined) {
    const max = Math.max(...r.variants.map((v) => v.maxTensionLbs));
    return attrs.tensionLbs <= max
      ? `Yes — the ${r.name}'s ceiling is ${max} lbs, so ${attrs.tensionLbs} lbs is within it. String below the ceiling for durability; it's a maximum, not a recommendation.`
      : `No — the ${r.name} is rated to ${max} lbs, below the ${attrs.tensionLbs} lbs you asked about. Going over a published ceiling risks the frame.`;
  }

  // "does it come in G6" / "is there a 4U"
  if (attrs.grip) {
    const grips = [...new Set(r.variants.flatMap((v) => v.gripSizes))].sort();
    return grips.includes(attrs.grip as never)
      ? `Yes — the ${r.name} is offered in ${attrs.grip}${grips.length > 1 ? ` (also ${grips.filter((g) => g !== attrs.grip).join(', ')})` : ''}.`
      : `No — the ${r.name} only comes in ${grips.join(' and ')}.`;
  }
  if (attrs.weightClass) {
    const classes = r.variants.map((v) => v.weightClass);
    return classes.includes(attrs.weightClass as never)
      ? `Yes — the ${r.name} ships in ${attrs.weightClass}${classes.length > 1 ? ` (also ${classes.filter((c) => c !== attrs.weightClass).join(', ')})` : ''}.`
      : `No — the ${r.name} comes in ${formatWeightClasses(r.variants)} only.`;
  }

  // "is it head-heavy" / "is it stiff"
  const asksYesNo = /^(is|are|does|do|can|has|have)\b/.test(normalized);
  if (!asksYesNo) return null;
  if (has(normalized, ['head-heavy', 'head heavy'])) return balanceVerdict(r, 'Head-Heavy');
  if (has(normalized, ['head-light', 'head light'])) return balanceVerdict(r, 'Head-Light');
  if (has(normalized, ['stiff'])) {
    const stiff = formatStiffness(r.stiffness, r.derived.stiffnessWordConflict);
    return r.derived.stiffnessOrdinal >= 3
      ? `Yes — the ${r.name}'s shaft reads ${stiff.label ?? stiff.primary}.`
      : `Not especially — the ${r.name}'s shaft reads ${stiff.label ?? stiff.primary}.`;
  }
  if (has(normalized, ['in stock', 'available'])) {
    return r.stockLevel
      ? `The ${r.name} is currently ${r.stockLevel.toLowerCase()}.`
      : `I don't have a live stock figure for the ${r.name} — the store page will show it.`;
  }
  return null;
}

/**
 * Six rackets in this lineup cross a balance bucket between weight classes (the
 * Annihilation is even at 300mm in 3U and head-heavy at 304mm in 4U). A flat yes/no
 * would be wrong for one of them, so say which class does what.
 */
function balanceVerdict(r: Racket, want: 'Head-Heavy' | 'Head-Light'): string {
  const per = r.variants.map((v) => ({ v, bucket: balanceBucket(v.balancePointMm) }));
  const buckets = new Set(per.map((x) => x.bucket));

  if (buckets.size > 1) {
    const detail = per.map((x) => `${x.v.weightClass} at ${x.v.balancePointMm}mm is ${x.bucket.toLowerCase()}`).join(', and ');
    const any = per.some((x) => x.bucket === want);
    return `${any ? 'It depends on the weight class' : 'No'} — the ${r.name}'s ${detail}.`;
  }

  const only = per[0]!.bucket;
  return only === want
    ? `Yes — the ${r.name} is ${only.toLowerCase()}, balancing at ${racketBalanceRange(r)}mm.`
    : `No — the ${r.name} is ${only.toLowerCase()} at ${racketBalanceRange(r)}mm.`;
}

function specSentence(r: Racket, normalized: string, attrs: Attrs): string {
  const direct = yesNoAnswer(r, normalized, attrs);
  if (direct) return direct;

  // Longest-phrase matching means "swing weight" no longer loses to "weight".
  const dim = detectDimension(normalized);
  if (dim) return `${r.name} — ${dim.label.toLowerCase()}: ${dim.say(r)}.`;

  if (has(normalized, ['grip'])) {
    const grips = [...new Set(r.variants.flatMap((v) => v.gripSizes))].sort();
    return `The ${r.name} is available in ${grips.join(' and ')}.`;
  }
  if (has(normalized, ['material', 'made of', 'made from', 'carbon'])) {
    return `The ${r.name} is built from ${r.materials.join(', ')}.`;
  }
  if (has(normalized, ['hole', 'grommet'])) {
    return `The ${r.name} has a ${r.frameHoleType.toLowerCase()} frame.`;
  }

  const stiff = formatStiffness(r.stiffness, r.derived.stiffnessWordConflict);
  return `The ${r.name} is an ${r.classification.toLowerCase()} racket — ${r.balance.toLowerCase()}, ${stiff.label ?? stiff.primary} shaft, in ${formatWeightClasses(r.variants)}.`;
}

/** Which of two rackets sits further along a dimension, answered before the table. */
function comparativeLead(dim: Dimension, picks: Racket[], normalized: string): string | null {
  const wantsLow = dim.lowWords.some((w) => normalized.includes(w)) || /\b(lighter|softer|cheaper|thinner|smaller|shorter|more flexible|more forgiving)\b/.test(normalized);
  const wantsHigh = dim.highWords.some((w) => normalized.includes(w)) || /\b(heavier|stiffer|bigger|larger|thicker|longer|more expensive|more head-heavy)\b/.test(normalized);
  if (!wantsLow && !wantsHigh) return null;

  const dir: Dir = wantsLow ? 'low' : 'high';
  const scored = picks
    .map((r) => ({ r, v: dim.value(r, dir) }))
    .filter((x): x is { r: Racket; v: number } => x.v !== null);
  if (scored.length < 2) return null;

  scored.sort((a, b) => (dir === 'low' ? a.v - b.v : b.v - a.v));
  const [first, second] = scored as [{ r: Racket; v: number }, { r: Racket; v: number }];
  if (first.v === second.v) {
    return `They're level on ${dim.label.toLowerCase()} — both read ${shared(dim, first.r, dir)}.`;
  }
  return `The ${first.r.name} — ${figure(dim, first.r, dir)} against the ${second.r.name}'s ${figure(dim, second.r, dir)}.`;
}

function superlativeResponse(
  normalized: string,
  attrs: Attrs,
  data: AssistantData,
  sup: { dim: Dimension; dir: Dir },
): { text: string; rackets: Racket[]; actions: AssistantAction[] } {
  const { dim, dir } = sup;
  const pool = applyFilters(normalized, attrs, data.rackets, dim.key);
  const scoped = pool.filtered.length > 0 ? pool.filtered : data.rackets;

  const ranked = scoped
    .map((r) => ({ r, v: dim.value(r, dir) }))
    .filter((x): x is { r: Racket; v: number } => x.v !== null);

  const unpublished = scoped.length - ranked.length;
  if (ranked.length === 0) {
    return {
      text: `${dim.label} isn't published for ${pool.label ? `the ${pool.label} rackets` : 'those rackets'}, so I can't rank them on it.`,
      rackets: [],
      actions: [{ label: 'Browse the full lineup', href: '/rackets' }],
    };
  }

  ranked.sort((a, b) => (dir === 'low' ? a.v - b.v : b.v - a.v));
  const bestValue = ranked[0]!.v;
  const winners = ranked.filter((x) => x.v === bestValue).map((x) => x.r);
  const scope = pool.label ? ` ${pool.label}` : '';
  const noun = dir === 'high' ? dim.highNoun : dim.lowNoun;
  const caveat = unpublished > 0
    ? ` (${unpublished} racket${unpublished > 1 ? 's are' : ' is'} excluded — ${dim.label.toLowerCase()} isn't published for ${unpublished > 1 ? 'them' : 'it'}.)`
    : '';

  // A "winner" that half the lineup shares is a published-figure artefact, not an
  // answer. Say so, and point at the measure that actually separates them.
  if (winners.length > 3) {
    const hint =
      dim.key === 'weight'
        ? ` Weight class is a band, not a single figure — swing weight is what separates them in the hand.`
        : ` Ask about a narrower group and I can rank within it.`;
    return {
      text:
        `${winners.length} of the ${ranked.length}${scope} rackets share ${noun} — all ${shared(dim, winners[0]!, dir)}. ` +
        `On the published figures none of them stands out.${hint}${caveat}`,
      rackets: winners.slice(0, 4),
      actions: [{ label: 'Browse the full lineup', href: '/rackets' }],
    };
  }

  const lead =
    winners.length === 1
      ? `The ${winners[0]!.name} has ${noun} of the${scope} rackets — ${figure(dim, winners[0]!, dir)}.`
      : `${listNames(winners)} tie for ${noun} of the${scope} rackets — all ${shared(dim, winners[0]!, dir)}.`;

  const runnerUp = ranked.find((x) => x.v !== bestValue);
  const next = runnerUp ? ` Next is the ${runnerUp.r.name} at ${figure(dim, runnerUp.r, dir)}.` : '';

  const ids = winners.slice(0, 4).map((r) => r.id).join(',');
  return {
    text: lead + next + caveat,
    rackets: winners,
    actions: [
      { label: `See the ${winners[0]!.name}`, href: `/rackets/${winners[0]!.id}` },
      ...(winners.length > 1 ? [{ label: 'Compare them', href: `/compare?ids=${ids}` }] : []),
    ],
  };
}

/** Counts how many attribute filters a query expresses, without applying them. */
function countAttributeFilters(normalized: string, attrs: Attrs): number {
  let n = 0;
  if (/\bhead[- ]light\b|\bhead[- ]heavy\b|\beven balance\b/.test(normalized)) n++;
  if (/\battack\b|\bspeed\b|\bcontrol\b|\ball[- ]around\b/.test(normalized)) n++;
  if (/\bstiff\b|\bflexible\b|\bsoft\b/.test(normalized)) n++;
  if (attrs.weightClass) n++;
  if (attrs.grip) n++;
  if (attrs.tensionLbs !== undefined) n++;
  if (attrs.maxPricePhp !== undefined) n++;
  if (attrs.material) n++;
  if (attrs.series) n++;
  return n;
}

/** Applies every filter the query expresses, and names the scope for the reply. */
function applyFilters(
  normalized: string,
  attrs: Attrs,
  rackets: Racket[],
  /** Dimension the caller is already ranking on — "most flexible in the LD series"
      must not also filter down to flexible rackets and then rank within them. */
  skipDimension?: string,
): { filtered: Racket[]; label: string; applied: number } {
  let out = rackets;
  const parts: string[] = [];
  let applied = 0;

  if (/\bhead[- ]light\b/.test(normalized)) {
    out = out.filter((r) => r.derived.balanceBucket === 'Head-Light');
    parts.push('head-light');
    applied++;
  } else if (/\bhead[- ]heavy\b/.test(normalized)) {
    out = out.filter((r) => r.derived.balanceBucket === 'Head-Heavy');
    parts.push('head-heavy');
    applied++;
  } else if (/\beven balance\b/.test(normalized)) {
    out = out.filter((r) => r.derived.balanceBucket === 'Even');
    parts.push('even-balance');
    applied++;
  }

  const CLASSES: [RegExp, Racket['classification'], string][] = [
    [/\battack\b/, 'ATTACK', 'attack'],
    [/\bspeed\b/, 'SPEED', 'speed'],
    [/\bcontrol\b/, 'CONTROL', 'control'],
    [/\ball[- ]around\b|\ball[- ]court\b/, 'ALL-AROUND', 'all-around'],
  ];
  for (const [re, cls, word] of CLASSES) {
    if (re.test(normalized)) {
      out = out.filter((r) => r.classification === cls);
      parts.push(word);
      applied++;
      break;
    }
  }

  if (skipDimension !== 'stiffness') {
    if (/\bstiff\b/.test(normalized)) {
      out = out.filter((r) => r.derived.stiffnessOrdinal >= 3);
      parts.push('stiff-shafted');
      applied++;
    } else if (/\bflexible\b|\bsoft\b|\bforgiving\b/.test(normalized)) {
      out = out.filter((r) => r.derived.stiffnessOrdinal <= 2);
      parts.push('flexible-shafted');
      applied++;
    }
  }

  if (attrs.weightClass) {
    out = out.filter((r) => r.variants.some((v) => v.weightClass === attrs.weightClass));
    parts.push(attrs.weightClass);
    applied++;
  }
  if (attrs.grip) {
    out = out.filter((r) => r.variants.some((v) => v.gripSizes.includes(attrs.grip as never)));
    parts.push(attrs.grip);
    applied++;
  }
  if (attrs.tensionLbs !== undefined) {
    out = out.filter((r) => r.variants.some((v) => v.maxTensionLbs >= attrs.tensionLbs!));
    parts.push(`${attrs.tensionLbs} lbs or more`);
    applied++;
  }
  if (attrs.maxPricePhp !== undefined && skipDimension !== 'price') {
    out = out.filter((r) => r.pricePhp !== null && r.pricePhp <= attrs.maxPricePhp!);
    parts.push(`under ${formatPrice(attrs.maxPricePhp) ?? attrs.maxPricePhp}`);
    applied++;
  }
  if (attrs.material) {
    out = out.filter((r) => r.materials.includes(attrs.material!));
    parts.push(attrs.material.toLowerCase());
    applied++;
  }
  if (attrs.series) {
    out = out.filter((r) => r.series === attrs.series);
    parts.unshift(`${attrs.series} series`);
    applied++;
  }

  return { filtered: applied > 0 ? out : [], label: parts.join(' · '), applied };
}

function suitabilityResponse(
  r: Racket,
  profile: FinderAnswers,
  data: AssistantData,
): { text: string; rackets: Racket[]; actions: AssistantAction[] } {
  // Score this racket's best variant against the stated profile using the same engine
  // the finder uses, then place it against the rest of the lineup.
  const scored = r.variants
    .map((v) => scoreVariant(profile, r, v))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const alt = recommend(profile, data.rackets).filter((x) => !x.alsoConsider)[0];
    return {
      text:
        `The ${r.name} is ruled out for that — it doesn't offer the grip or tension you asked for.` +
        (alt ? ` The ${alt.racket.name} does.` : ''),
      rackets: alt ? [r, alt.racket] : [r],
      actions: [{ label: 'Take the 60-second finder', href: '/finder' }],
    };
  }

  const best = scored[0]!;
  const ranking = recommend(profile, data.rackets);
  const rank = ranking.findIndex((x) => x.racketId === r.id);
  const top = ranking.filter((x) => !x.alsoConsider)[0];

  let verdict: string;
  if (rank === 0) verdict = `Yes — on what you've told me it's the closest fit in the lineup.`;
  else if (rank > 0 && rank < 3) verdict = `Yes, it's a good fit — it lands in my top three for that.`;
  else if (best.score >= 65) verdict = `It'll work, though it isn't the closest fit.`;
  else verdict = `Honestly, not the first one I'd point you at.`;

  const because = best.reasons.length ? ` ${best.reasons[0]}` : '';
  const tradeoff = best.tradeoff ? ` The trade-off: ${best.tradeoff.charAt(0).toLowerCase()}${best.tradeoff.slice(1)}` : '';
  const alternative =
    rank !== 0 && top && top.racketId !== r.id
      ? ` If you want the closest match, that's the ${top.racket.name} in ${top.weightClass}.`
      : '';

  return {
    text: `${verdict}${because}${tradeoff}${alternative}`,
    rackets: top && top.racketId !== r.id ? [r, top.racket] : [r],
    actions: [
      { label: `See the ${r.name} specs`, href: `/rackets/${r.id}` },
      ...(top && top.racketId !== r.id ? [{ label: `Compare them`, href: `/compare?ids=${r.id},${top.racketId}` }] : []),
      { label: 'Take the 60-second finder', href: '/finder' },
    ],
  };
}

/** Pronouns that should inherit the rackets from the previous turn. */
const PRONOUN_RE = /\b(it|its|one|that one|this one|them|those|these|they|both|the two)\b/;
/** Phrasings that need two subjects, not one — "which one is more forgiving". */
const PAIR_RE = /\b(them|those|these|they|both|the two|which one|which of|compare)\b/;
const COMPARATIVE_RE = /\b(lighter|heavier|stiffer|softer|cheaper|thinner|thicker|bigger|larger|smaller|longer|shorter|better|more|less)\b/;

export function answer(
  query: string,
  data: AssistantData,
  prior: AssistantContext = emptyContext(),
): AssistantResponse {
  const normalized = normalize(query);
  const attrs = extractAttrs(normalized, data.rackets);
  let rackets = extractRackets(normalized, data.rackets);

  // Conversation memory: a follow-up that names no racket but uses a pronoun (or is a
  // bare spec question) keeps the subject of the previous turn.
  const byId = new Map(data.rackets.map((r) => [r.id, r]));
  const remembered = prior.recentRackets.map((id) => byId.get(id)).filter((r): r is Racket => Boolean(r));
  const inherited = rackets.length === 0 && remembered.length > 0 &&
    (PRONOUN_RE.test(normalized) || Boolean(detectDimension(normalized)) || has(normalized, BUY_KEYWORDS));
  if (inherited) {
    const wantsPair = PAIR_RE.test(normalized) || COMPARATIVE_RE.test(normalized);
    rackets = wantsPair && remembered.length >= 2 ? remembered.slice(0, 2) : remembered.slice(0, 1);
  }

  const profile = readProfile(normalized, attrs, prior.profile);
  let intent = classifyIntent(normalized, rackets, data.glossary, attrs);
  const dimension = detectDimension(normalized);

  // A turn that only tells us something new about the player ("I mostly play doubles at
  // the net") is not a failure to understand — it's a refinement. Re-rank instead of
  // falling back.
  const profileChanged = (Object.keys(profile) as (keyof FinderAnswers)[]).some(
    (k) => profile[k] !== prior.profile[k],
  );
  if (intent === 'fallback' && profileChanged) intent = 'recommend';

  const nextContext = (rs: Racket[], dim?: string): AssistantContext => ({
    recentRackets: [...new Set([...rs.map((r) => r.id), ...prior.recentRackets])].slice(0, 4),
    lastIntent: intent,
    lastDimension: dim ?? prior.lastDimension,
    profile,
  });

  const base = (over: Partial<AssistantResponse> & { rackets?: string[] }): AssistantResponse => {
    const ids = over.rackets ?? rackets.map((r) => r.id);
    return {
      intent,
      text: '',
      actions: [],
      suggestions: [],
      fellBack: false,
      ...over,
      rackets: ids,
      context: nextContext(ids.map((id) => byId.get(id)).filter((r): r is Racket => Boolean(r)), dimension?.key),
    };
  };

  switch (intent) {
    case 'smalltalk': {
      const kind = detectSmalltalk(normalized)!;
      if (kind === 'identity') {
        return base({
          text: `I'm the Racket Assistant — not an AI. I look answers up in the OGKILS catalogue, so every number I give you is the published figure. Ask me a spec, put two rackets head to head, or tell me how you play.`,
          suggestions: ['Which racket is best for smashing?', 'What is balance point?', 'Show me head-light rackets'],
          actions: [{ label: 'Take the 60-second finder', href: '/finder' }],
        });
      }
      if (kind === 'thanks') {
        return base({
          text: `Any time. If you want to go deeper, the finder matches the whole lineup to how you actually play.`,
          actions: [{ label: 'Take the 60-second finder', href: '/finder' }],
        });
      }
      return base({
        text: `Hi! I can look up any OGKILS racket's specs, put two side by side, or suggest one for how you play. What are you after?`,
        suggestions: ['Which racket is best for smashing?', 'Cheapest attack racket', 'What is balance point?'],
      });
    }

    case 'catalog_overview': {
      const byClass = new Map<string, number>();
      for (const r of data.rackets) byClass.set(r.classification, (byClass.get(r.classification) ?? 0) + 1);
      const breakdown = [...byClass.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${n} ${c.toLowerCase()}`)
        .join(', ');
      const series = [...new Set(data.rackets.map((r) => r.series))].filter((s) => s !== 'Other');
      return base({
        text: `There are ${data.rackets.length} OGKILS rackets in the 2026 lineup — ${breakdown}. They span the ${series.join(' and ')} series. Tell me how you play and I'll narrow it down, or filter the lineup yourself.`,
        rackets: [],
        actions: [
          { label: 'Browse the full lineup', href: '/rackets' },
          { label: 'Take the 60-second finder', href: '/finder' },
        ],
        suggestions: ['Show me attack rackets', 'Which is the lightest?', 'Cheapest racket'],
      });
    }

    case 'superlative': {
      const sup = detectSuperlative(normalized)!;
      const res = superlativeResponse(normalized, attrs, data, sup);
      return base({ text: res.text, rackets: res.rackets.map((r) => r.id), actions: res.actions });
    }

    case 'suitability': {
      const r = rackets[0]!;
      const res = suitabilityResponse(r, profile, data);
      return base({ text: res.text, rackets: res.rackets.map((x) => x.id), actions: res.actions });
    }

    case 'explain_term': {
      // A material named in the query is answered from the catalogue, not defined for it.
      if (attrs.material && !detectGlossaryKey(normalized, data.glossary)) {
        const users = data.rackets.filter((r) => r.materials.includes(attrs.material!));
        return base({
          text:
            `${attrs.material} is one of the frame materials OGKILS lists for this lineup. ` +
            (users.length
              ? `${users.length} racket${users.length > 1 ? 's use' : ' uses'} it: ${listNames(users.slice(0, 6))}${users.length > 6 ? ', and others' : ''}. I can only tell you where it's used — the spec sheet doesn't describe what it does.`
              : `No racket in this lineup lists it.`),
          rackets: users.slice(0, 4).map((r) => r.id),
          actions: [{ label: 'Browse the full lineup', href: '/rackets' }],
        });
      }
      const key = detectGlossaryKey(normalized, data.glossary)!;
      const g = data.glossary.find((x) => x.key === key)!;

      // "what's the difference between 3U and 4U" wants the two figures, not just prose.
      const classes = normalized.match(/\b([3456])\s?u\b/g);
      const extra =
        key === 'weight-class' && classes && new Set(classes).size >= 2
          ? ` In this lineup that's the gap you'd feel most in fast exchanges — a ${classes[0]!.toUpperCase().replace(' ', '')} frame sits a full weight band above a ${classes[1]!.toUpperCase().replace(' ', '')}.`
          : '';

      return base({
        text: `${g.term}: ${g.long}${extra}`,
        rackets: [],
        actions: [{ label: 'Read the full spec guide', href: `/guide/racket-specs#${g.key}` }],
      });
    }

    case 'buy': {
      // After a head-to-head, "how much is it" is really about both.
      if (rackets.length >= 2) {
        const pair = rackets.slice(0, 2);
        const priced = pair.map((r) => `the ${r.name} is ${formatPrice(r.pricePhp) ?? 'priced at the store'}`);
        return base({
          text: `${priced.join(', and ')}. Prices vary a little across channels — tap through to check.`,
          actions: pair
            .map((r) => buyAction(r, data))
            .filter((a): a is AssistantAction => a !== null),
        });
      }
      const r = rackets[0];
      if (!r) {
        return base({
          text: `Tell me which racket and I'll point you to it. Every racket links out to the OGKILS store, Shopee, Lazada, and TikTok Shop.`,
          suggestions: ['How much is the Fire Breathing?', 'Where can I buy the LD100ZZ?', 'Cheapest attack racket'],
        });
      }
      const price = formatPrice(r.pricePhp);
      const stock = r.stockLevel ? ` It's currently ${r.stockLevel.toLowerCase()}.` : '';
      const act = buyAction(r, data);
      return base({
        text: `${r.name}${price ? ` is ${price}` : `'s price is shown at the store`}.${stock} Prices can vary a little across channels — tap through to check.`,
        actions: [
          ...(act ? [act] : []),
          { label: `See the ${r.name} specs`, href: `/rackets/${r.id}` },
        ],
      });
    }

    case 'compare': {
      if (rackets.length < 2) {
        const one = rackets[0];
        return base({
          text: one
            ? `Which racket should I put the ${one.name} against? Name a second one and I'll line them up.`
            : `Name two rackets and I'll line them up — e.g. "Fire Breathing vs Thunder Breathing".`,
          suggestions: one
            ? data.rackets
                .filter((r) => r.id !== one.id && r.classification === one.classification)
                .slice(0, 3)
                .map((r) => `${one.name} vs ${r.name}`)
            : ['Fire Breathing vs Serpent Breathing', 'LD100ZZ vs LD800PRO'],
        });
      }
      const pick = rackets.slice(0, 4);
      const headers = ['Spec', ...pick.map((r) => r.name)];
      const rows: string[][] = [
        ['Class', ...pick.map((r) => r.classification)],
        ['Balance', ...pick.map((r) => `${racketBalanceRange(r)}mm`)],
        ['Stiffness', ...pick.map((r) => formatStiffness(r.stiffness, r.derived.stiffnessWordConflict).primary)],
        ['Weight', ...pick.map((r) => formatWeightClasses(r.variants))],
        ['Price', ...pick.map((r) => formatPrice(r.pricePhp) ?? DASH)],
      ];
      const ids = pick.map((r) => r.id).join(',');

      // Answer the actual question first when one was asked ("which is lighter?").
      const lead = dimension ? comparativeLead(dimension, pick, normalized) : null;
      return base({
        text: lead
          ? `${lead}\nHere's the rest side by side:`
          : `Here's how the ${listNames(pick)} stack up:`,
        table: { headers, rows },
        actions: [{ label: 'See the full comparison', href: `/compare?ids=${ids}` }],
      });
    }

    case 'recommend': {
      const recs = recommend(profile, data.rackets).filter((r) => !r.alsoConsider).slice(0, 3);
      // Name what the suggestion is actually based on, so the player can correct it.
      const knows = [
        profile.style && 'how you play',
        profile.skill && 'your level',
        profile.context && 'where you play on court',
        profile.discomfort === 'yes' && 'the discomfort you mentioned',
        profile.budgetPhp && 'your budget',
      ].filter(Boolean) as string[];
      const basis = knows.length
        ? `Going on ${knows.slice(0, 2).join(' and ')},`
        : 'Based on that,';
      const caveat = recs[0]?.tradeoff
        ? ` Worth knowing about the ${recs[0].racket.name}: ${recs[0].tradeoff.charAt(0).toLowerCase()}${recs[0].tradeoff.slice(1)}`
        : '';
      return base({
        text: recs.length
          ? `${basis} I'd look at ${listNames(recs.map((r) => r.racket))}.${caveat} The 60-second finder can narrow it down properly.`
          : `I can help with that — the finder will match the lineup to how you play.`,
        rackets: recs.map((r) => r.racketId),
        actions: [
          { label: 'Take the 60-second finder', href: '/finder' },
          ...(recs.length >= 2 ? [{ label: 'Compare these', href: `/compare?ids=${recs.map((r) => r.racketId).join(',')}` }] : []),
        ],
      });
    }

    case 'list_by_attribute': {
      const { filtered, label, applied } = applyFilters(normalized, attrs, data.rackets);
      if (applied === 0) {
        return fallbackResponse(rackets, nextContext(rackets), `I need something to filter on — a class, a balance, a weight, or a budget.`);
      }
      if (filtered.length === 0) {
        // Say what was asked for and what would loosen it, rather than a bare "none".
        const relaxed = attrs.maxPricePhp !== undefined
          ? data.rackets.filter((r) => r.pricePhp !== null).sort((a, b) => a.pricePhp! - b.pricePhp!)[0]
          : undefined;
        return base({
          text:
            `Nothing in the lineup matches ${label}.` +
            (relaxed ? ` The cheapest racket is the ${relaxed.name} at ${formatPrice(relaxed.pricePhp)}.` : ''),
          rackets: relaxed ? [relaxed.id] : [],
          actions: [{ label: 'Browse the full lineup', href: '/rackets' }],
        });
      }
      const shown = filtered.slice(0, 8);
      const more = filtered.length - shown.length;
      return base({
        text: `${filtered.length} ${label} racket${filtered.length > 1 ? 's' : ''}: ${listNames(shown)}${more > 0 ? `, and ${more} more` : ''}.`,
        rackets: filtered.map((r) => r.id),
        actions: [
          { label: 'Browse the full lineup', href: '/rackets' },
          ...(filtered.length >= 2 ? [{ label: 'Compare the first few', href: `/compare?ids=${filtered.slice(0, 4).map((r) => r.id).join(',')}` }] : []),
        ],
      });
    }

    case 'spec_lookup': {
      const r = rackets[0]!;
      return base({
        text: specSentence(r, normalized, attrs),
        actions: [
          { label: `See all ${r.name} specs`, href: `/rackets/${r.id}` },
          { label: 'Compare it', href: `/compare?ids=${r.id}` },
        ],
      });
    }

    default:
      return fallbackResponse(rackets, nextContext(rackets));
  }
}

function fallbackResponse(
  rackets: Racket[],
  context: AssistantContext,
  lead?: string,
): AssistantResponse {
  const last = rackets[0];
  const suggestions = last
    ? [`Compare the ${last.name}`, `How much is the ${last.name}?`, `Is the ${last.name} good for a beginner?`]
    : [`Which racket is best for smashing?`, `What is balance point?`, `Cheapest attack racket`];
  return {
    intent: 'fallback',
    text:
      (lead ? lead + ' ' : '') +
      `I can look up any racket's specs, compare two, rank the lineup on a figure like weight or price, recommend one for how you play, or explain a term. Try one of these:`,
    rackets: last ? [last.id] : [],
    actions: [{ label: 'Take the 60-second finder', href: '/finder' }],
    suggestions,
    fellBack: true,
    context: { ...context, lastIntent: 'fallback' },
  };
}
