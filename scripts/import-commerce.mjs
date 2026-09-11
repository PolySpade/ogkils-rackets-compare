/**
 * Connect the microsite to the OGKILS Shopify catalog.
 *
 * Reads the Shopify export produced by OGKILS_Price_List/import_from_shopify.py
 * (products.csv + images/NNN.png) and writes:
 *   - data/commerce.json  — price, stock, and buy URL keyed by racket id
 *   - src/assets/rackets/<id>.png — the featured product image per racket
 *
 * Re-run after refreshing the Shopify export to update prices/stock/images:
 *   node scripts/import-commerce.mjs [path-to-OGKILS_Price_List]
 *
 * Only the 19 catalogued rackets are mapped; other product categories and the
 * Water Breathing Malaysia special edition (no microsite page) are skipped.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const priceListDir = process.argv[2]
  ? resolve(process.argv[2])
  : '/home/donald/Desktop/OGKILS_Price_List';

const csvPath = join(priceListDir, 'products.csv');
const imgSrcDir = join(priceListDir, 'images');
const assetsDir = join(repoRoot, 'src/assets/rackets');
const commercePath = join(repoRoot, 'data/commerce.json');

// Model/SKU → microsite racket id. Order matters: specific before generic.
function toRacketId(model, sku) {
  const m = (model || '').toLowerCase();
  const s = (sku || '').toUpperCase();
  if (m.includes('malaysia') || s.includes('LIMITED')) return null; // special edition
  const rules = [
    ['annihilation', 'annihilation'],
    ['dimensional slash', 'dimensional-slash-pro'],
    ['fire breathing', 'fire-breathing'],
    ['freezing', 'freezing'],
    ['ld-lyd', 'ldlyd'],
    ['lyd', 'ldlyd'],
    ['ld1000z', 'ld1000z'],
    ['ld100zz', 'ld100zz'],
    ['ld88d', 'ld88dpro'],
    ['ld88s', 'ld88spro'],
    ['ld12', 'ld12l'],
    ['ld700', 'ld700'],
    ['ld77pro', 'ld77pro'],
    ['ld800pro', 'ld800pro'],
    ['love breathing', 'love-breathing'],
    ['mist breathing', 'mist-breathing'],
    ['serpent breathing', 'serpent-breathing'],
    ['thunder breathing', 'thunder-breathing'],
    ['water breathing', 'water-breathing'],
    ['wind breathing', 'wind-breathing'],
  ];
  for (const [needle, id] of rules) if (m.includes(needle)) return id;
  return null;
}

const STOCK_LEVELS = new Set(['In Stock', 'Low Stock', 'Out of Stock']);

// Minimal CSV parse (the export has no quoted/embedded commas).
function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
  });
}

function main() {
  if (!existsSync(csvPath)) {
    console.error(`✖ products.csv not found at ${csvPath}`);
    console.error('  Pass the OGKILS_Price_List directory as the first argument.');
    process.exit(1);
  }
  mkdirSync(assetsDir, { recursive: true });

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const commerce = {};
  const skipped = [];
  let images = 0;

  for (const row of rows) {
    if ((row.category || '').toLowerCase() !== 'racket') continue;
    const id = toRacketId(row.model, row.sku);
    if (!id) {
      skipped.push(row.model);
      continue;
    }
    const price = parseFloat(row.srp);
    const stockLevel = STOCK_LEVELS.has(row.stock) ? row.stock : null;

    commerce[id] = {
      pricePhp: Number.isFinite(price) ? Math.round(price) : null,
      stockLevel,
      buyUrl: row.link || null,
      sku: row.sku || null,
      image: null,
    };

    const srcImg = join(imgSrcDir, `${row.item_no}.png`);
    if (existsSync(srcImg)) {
      copyFileSync(srcImg, join(assetsDir, `${id}.png`));
      commerce[id].image = `${id}.png`;
      images += 1;
    }
  }

  const out = {
    schemaVersion: 1,
    source: 'OGKILS Shopify export (OGKILS_Price_List/products.csv)',
    generatedNote: 'Auto-written by scripts/import-commerce.mjs. Do not hand-edit — re-run the importer.',
    commerce,
  };
  writeFileSync(commercePath, JSON.stringify(out, null, 2) + '\n');

  const line = '─'.repeat(64);
  console.log(`\n${line}\n  SHOPIFY IMPORT\n${line}`);
  console.log(`  mapped   ${Object.keys(commerce).length} rackets`);
  console.log(`  images   ${images} copied → src/assets/rackets/`);
  if (skipped.length) console.log(`  skipped  ${skipped.length}: ${skipped.join('; ')}`);
  console.log(`  wrote    data/commerce.json\n${line}\n`);
}

main();
