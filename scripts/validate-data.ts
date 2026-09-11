/**
 * Build-time data gate (product.md §4.3). Run via `pnpm validate` and as `prebuild`.
 *
 *  - ERRORS (exit 1) on schema violations: missing/mistyped fields, bad enums, broken
 *    variant integrity, comparisons/overrides referencing unknown rackets, duplicate ids.
 *  - WARNS (exit 0) on the known spreadsheet-quality issues so they're visible but don't
 *    block the build. The app's display rules handle each one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { balanceBucket, stiffnessWordConflict } from '../src/lib/derive';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../data');

const read = (name: string): any =>
  JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

const SERIES = new Set(['Breathing', 'LD', 'Other']);
const CLASSIFICATION = new Set(['ATTACK', 'SPEED', 'CONTROL', 'ALL-AROUND']);
const BALANCE = new Set(['Head-Heavy', 'Even Balance', 'Head-Light']);
const WEIGHT_CLASS = new Set(['3U', '4U', '5U', '6U']);
const GRIP = new Set(['G5', 'G6']);
const CHANNELS = ['shopify', 'shopee', 'lazada', 'tiktok'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const racketsFile = read('rackets.generated.json');
const overridesFile = read('rackets.overrides.json');
const comparisonsFile = read('comparisons.json');
const commerceFile = read('commerce.json');

const STOCK_LEVELS = new Set(['In Stock', 'Low Stock', 'Out of Stock']);

const rackets: any[] = racketsFile.rackets ?? [];
const ids = new Set<string>();

for (const r of rackets) {
  const tag = r?.id ? `racket "${r.id}"` : `racket ${r?.name ?? '(unknown)'}`;

  if (!isStr(r.id)) err(`${tag}: missing/invalid id`);
  else if (ids.has(r.id)) err(`duplicate racket id "${r.id}"`);
  else ids.add(r.id);

  if (!isStr(r.name)) err(`${tag}: missing name`);
  if (!isStr(r.modelCode)) err(`${tag}: missing modelCode`);
  if (!SERIES.has(r.series)) err(`${tag}: bad series "${r.series}"`);
  if (!CLASSIFICATION.has(r.classification))
    err(`${tag}: bad classification "${r.classification}"`);
  if (!BALANCE.has(r.balance)) err(`${tag}: bad balance "${r.balance}"`);
  if (!Array.isArray(r.materials) || r.materials.length === 0)
    err(`${tag}: materials must be a non-empty array`);
  if (!isNum(r.shaftDiameterMm) || r.shaftDiameterMm <= 0)
    err(`${tag}: bad shaftDiameterMm`);
  if (!isNum(r.racketLengthMm) || r.racketLengthMm <= 0)
    err(`${tag}: bad racketLengthMm`);
  if (typeof r.inStock !== 'boolean') err(`${tag}: inStock must be boolean`);

  // links object must carry all four channels (string | null)
  if (typeof r.links !== 'object' || r.links === null) err(`${tag}: missing links`);
  else
    for (const c of CHANNELS) {
      const v = r.links[c];
      if (v !== null && !isStr(v)) err(`${tag}: links.${c} must be a URL string or null`);
    }

  // --- stiffness ---
  const st = r.stiffness ?? {};
  if (!isStr(st.word)) err(`${tag}: stiffness.word missing`);
  for (const k of ['rangeLow', 'rangeHigh', 'value']) {
    if (st[k] !== null && !isNum(st[k])) err(`${tag}: stiffness.${k} must be number|null`);
  }
  if (stiffnessWordConflict(st.raw ?? null, st.word ?? '')) {
    warn(`${tag}: stiffness word "${st.word}" disagrees with raw "${st.raw}" — show numeric range as primary, word as label (§4.3).`);
  }

  // --- missing display specs (render "—") ---
  if (r.frameAreaCm2 !== null && !isNum(r.frameAreaCm2)) err(`${tag}: bad frameAreaCm2`);
  else if (r.frameAreaCm2 === null) warn(`${tag}: frame area not published — render "—".`);

  if (r.gripLengthMm !== null && !isNum(r.gripLengthMm)) err(`${tag}: bad gripLengthMm`);
  else if (r.gripLengthMm === null) warn(`${tag}: grip length not published — render "—".`);
  else if (r.gripLengthMm < 185 || r.gripLengthMm > 235)
    warn(`${tag}: grip length ${r.gripLengthMm}mm is an outlier vs ~200–217mm — likely a unit/column error, flag for Donald, don't present as fact (§4.3).`);

  // --- variants ---
  if (!Array.isArray(r.variants) || r.variants.length === 0) {
    err(`${tag}: must have at least one variant`);
    continue;
  }
  for (const v of r.variants) {
    const vtag = `${tag} variant ${v?.weightClass ?? '(?)'}`;
    if (!WEIGHT_CLASS.has(v.weightClass)) err(`${vtag}: bad weightClass`);
    if (!Array.isArray(v.weightRangeG) || v.weightRangeG.length !== 2 || !v.weightRangeG.every(isNum))
      err(`${vtag}: weightRangeG must be [number, number]`);
    if (!Array.isArray(v.gripSizes) || v.gripSizes.length === 0 || !v.gripSizes.every((g: string) => GRIP.has(g)))
      err(`${vtag}: gripSizes must be a non-empty subset of {G5,G6}`);
    if (!isNum(v.maxTensionLbs) || v.maxTensionLbs <= 0) err(`${vtag}: bad maxTensionLbs`);
    if (!isNum(v.balancePointMm) || v.balancePointMm <= 0) err(`${vtag}: bad balancePointMm`);

    // swing weight may be absent; the flag must match the value
    if (v.swingWeight === null || v.swingWeightMissing === true) {
      if (v.swingWeight !== null || v.swingWeightMissing !== true)
        err(`${vtag}: swingWeight/swingWeightMissing inconsistent`);
      warn(`${vtag}: swing weight not published — render "—", exclude from diff/sort (§4.3).`);
    } else if (!isNum(v.swingWeight)) {
      err(`${vtag}: swingWeight must be number|null`);
    }

    // balance label vs numeric bucket — numeric is authoritative (§4.3)
    if (isNum(v.balancePointMm)) {
      const bucket = balanceBucket(v.balancePointMm); // Head-Light | Even | Head-Heavy
      const labelBucket =
        r.balance === 'Even Balance' ? 'Even' : r.balance;
      if (bucket !== labelBucket) {
        warn(`${vtag}: label "${r.balance}" disagrees with balance point ${v.balancePointMm}mm (=${bucket}) — numeric is authoritative for recommendations, label is display-only (§4.3).`);
      }
    }
  }
}

// --- overrides reference real rackets ---
for (const id of Object.keys(overridesFile.overrides ?? {})) {
  if (!ids.has(id)) err(`overrides: unknown racket id "${id}"`);
}

// --- commerce (Shopify import) references real rackets with sane values ---
let pricedCount = 0;
for (const [id, c] of Object.entries<any>(commerceFile.commerce ?? {})) {
  if (!ids.has(id)) {
    err(`commerce: unknown racket id "${id}"`);
    continue;
  }
  if (c.pricePhp !== null && (!isNum(c.pricePhp) || c.pricePhp <= 0))
    err(`commerce "${id}": pricePhp must be a positive number or null`);
  if (isNum(c.pricePhp)) pricedCount += 1;
  if (c.stockLevel !== null && !STOCK_LEVELS.has(c.stockLevel))
    err(`commerce "${id}": bad stockLevel "${c.stockLevel}"`);
  if (c.buyUrl !== null && !isStr(c.buyUrl)) err(`commerce "${id}": buyUrl must be a URL or null`);
  else if (isStr(c.buyUrl)) {
    try {
      new URL(c.buyUrl);
    } catch {
      err(`commerce "${id}": buyUrl is not a valid URL`);
    }
  }
}
const missingCommerce = [...ids].filter((id) => !(commerceFile.commerce ?? {})[id]);
if (missingCommerce.length)
  warn(`commerce: ${missingCommerce.length} racket(s) not listed on Shopify (no price/stock/buy link): ${missingCommerce.join(', ')}. Store fallback link is used.`);

// --- comparisons reference real, distinct rackets ---
for (const p of comparisonsFile.pairs ?? []) {
  if (!ids.has(p.a)) err(`comparisons: unknown racket id "${p.a}"`);
  if (!ids.has(p.b)) err(`comparisons: unknown racket id "${p.b}"`);
  if (p.a === p.b) err(`comparisons: pair compares "${p.a}" with itself`);
}

// --- report ---
const line = '─'.repeat(72);
console.log(`\n${line}\n  DATA VALIDATION — ${rackets.length} rackets\n${line}`);
if (warnings.length) {
  console.log(`\n  ⚠ ${warnings.length} known data-quality warning(s):\n`);
  for (const w of warnings) console.log(`    • ${w}`);
}
if (errors.length) {
  console.log(`\n  ✖ ${errors.length} schema error(s):\n`);
  for (const e of errors) console.log(`    • ${e}`);
  console.log(`\n${line}\n  BUILD BLOCKED — fix the errors above.\n${line}\n`);
  process.exit(1);
}
const pricedPct = Math.round((pricedCount / rackets.length) * 100);
console.log(
  `\n  ✓ Schema valid. ${warnings.length} warning(s) noted (non-blocking).` +
    `\n  ✓ Shopify: ${pricedCount}/${rackets.length} rackets priced (${pricedPct}%).\n${line}\n`,
);
