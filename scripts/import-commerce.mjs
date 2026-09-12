/**
 * Connect the microsite to the OGKILS Shopify catalog.
 *
 * Reads every `productType:Racket` product from Shopify and writes:
 *   - data/shopify.snapshot.json — the raw live pull (audit trail + offline replay)
 *   - data/commerce.json         — price, stock, buy URL and SKU keyed by racket id
 *   - src/assets/rackets/<id>.png — the featured product image per racket
 *
 * Two ways to get the data in:
 *
 *   1. Live (preferred). Needs a custom-app Admin API token with `read_products`:
 *        Shopify admin → Settings → Apps and sales channels → Develop apps
 *        → Create an app → Configure Admin API scopes → read_products → Install
 *      Then:
 *        export SHOPIFY_STORE_DOMAIN=ogkils-ph.myshopify.com
 *        export SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxx
 *        node scripts/import-commerce.mjs
 *      This refreshes data/shopify.snapshot.json as a side effect.
 *
 *   2. Snapshot replay (no credentials). Uses whatever is already in
 *      data/shopify.snapshot.json — which Claude can regenerate through the
 *      Shopify MCP connector:
 *        node scripts/import-commerce.mjs --snapshot
 *
 * Flags:
 *   --snapshot[=path]  Replay a snapshot instead of calling the API.
 *   --images=all       Re-download every featured image (default: only fill gaps,
 *                      so hand-tuned artwork already in src/assets/rackets/ survives).
 *   --dry-run          Report what would change without writing anything.
 *
 * Only rackets that already have a specs row in data/rackets.generated.json are
 * written — scripts/validate-data.ts hard-fails on a commerce id it doesn't know.
 * Anything else on Shopify is reported as unmapped so it can be added to
 * Product_Database_Racket_Specs.xlsx first.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const assetsDir = join(repoRoot, 'src/assets/rackets');
const commercePath = join(repoRoot, 'data/commerce.json');
const generatedPath = join(repoRoot, 'data/rackets.generated.json');
const defaultSnapshotPath = join(repoRoot, 'data/shopify.snapshot.json');

const API_VERSION = '2025-07';

/**
 * The microsite presents the whole range as available rather than mirroring
 * Shopify's per-variant counts — a colour or grip being momentarily out on the
 * store shouldn't read as "this racket is gone" on a spec-comparison page.
 *
 * Set this to false to go back to deriving the badge from live inventory, in which
 * case LOW_STOCK_AT_OR_BELOW sets where "Low Stock" starts.
 */
const TREAT_ALL_AS_IN_STOCK = true;
const LOW_STOCK_AT_OR_BELOW = 3;

function stockLevelFor(units) {
  if (TREAT_ALL_AS_IN_STOCK) return 'In Stock';
  if (!Number.isFinite(units)) return null;
  if (units <= 0) return 'Out of Stock'; // negative = oversold, still not sellable
  return units <= LOW_STOCK_AT_OR_BELOW ? 'Low Stock' : 'In Stock';
}

/** Shopify product title → microsite racket id. Order matters: specific before generic. */
function toRacketId(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('malaysia') || t.includes('special edition')) return null; // no microsite page
  const rules = [
    ['annihilation', 'annihilation'],
    ['dimensional slash', 'dimensional-slash-pro'],
    ['fire breathing', 'fire-breathing'],
    ['freezing', 'freezing'],
    ['insect breathing', 'insect-breathing'],
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
  for (const [needle, id] of rules) if (t.includes(needle)) return id;
  return null;
}

/**
 * Variants carry per-colour/per-size SKUs (OR-ANN-F-3UG5); the catalogue wants the
 * shared stem (OR-ANN-F). Falls back to the first full SKU when the variants don't
 * agree on at least two segments, and to null when Shopify has no SKUs at all.
 */
function commonSkuStem(skus) {
  const present = (skus || []).filter(Boolean);
  if (!present.length) return null;
  const split = present.map((s) => s.split('-'));
  const stem = [];
  for (let i = 0; i < split[0].length; i += 1) {
    const seg = split[0][i];
    if (!split.every((parts) => parts[i] === seg)) break;
    stem.push(seg);
  }
  return stem.length >= 2 ? stem.join('-') : present[0];
}

const PRODUCTS_QUERY = `
  query RacketProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "product_type:Racket") {
      pageInfo { hasNextPage endCursor }
      nodes {
        handle
        title
        status
        tags
        totalInventory
        featuredMedia { preview { image { url } } }
        priceRangeV2 { minVariantPrice { amount } }
        variants(first: 100) { nodes { sku } }
      }
    }
  }
`;

async function fetchLive(domain, token) {
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const products = [];
  let cursor = null;

  for (;;) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { cursor } }),
    });
    if (!res.ok) throw new Error(`Shopify API ${res.status} ${res.statusText}`);
    const body = await res.json();
    if (body.errors) throw new Error(`Shopify API: ${JSON.stringify(body.errors)}`);

    const page = body.data.products;
    for (const n of page.nodes) {
      products.push({
        handle: n.handle,
        title: n.title,
        status: n.status,
        tags: n.tags,
        totalInventory: n.totalInventory,
        minPrice: Number(n.priceRangeV2?.minVariantPrice?.amount ?? NaN),
        featuredImageUrl: n.featuredMedia?.preview?.image?.url ?? null,
        variantSkus: n.variants.nodes.map((v) => v.sku).filter(Boolean),
      });
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return {
    schemaVersion: 1,
    note: 'Live pull of productType:Racket from the OGKILS PH Shopify Admin API. Written by scripts/import-commerce.mjs. Feeds scripts/import-commerce.mjs --snapshot.',
    shop: domain,
    fetchedAt: new Date().toISOString().slice(0, 10),
    products,
  };
}

/** Shopify serves jpg/webp/png; astro:assets globs *.png, so normalise on the way in. */
async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).png().toFile(destPath);
}

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
}

async function main() {
  const dryRun = Boolean(arg('dry-run'));
  const snapshotArg = arg('snapshot');
  const refreshAllImages = arg('images') === 'all';

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const useLive = !snapshotArg && Boolean(domain && token);

  if (!useLive && !snapshotArg) {
    console.error('✖ No Shopify credentials and no --snapshot flag.');
    console.error('  Set SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN for a live pull,');
    console.error('  or run with --snapshot to replay data/shopify.snapshot.json.');
    process.exit(1);
  }

  const snapshotPath =
    typeof snapshotArg === 'string' && snapshotArg ? resolve(snapshotArg) : defaultSnapshotPath;

  let snapshot;
  if (useLive) {
    console.log(`  fetching ${domain} …`);
    snapshot = await fetchLive(domain, token);
    if (!dryRun) writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  } else {
    if (!existsSync(snapshotPath)) {
      console.error(`✖ snapshot not found at ${snapshotPath}`);
      process.exit(1);
    }
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  }

  const knownIds = new Set(
    JSON.parse(readFileSync(generatedPath, 'utf8')).rackets.map((r) => r.id),
  );
  const previous = existsSync(commercePath)
    ? JSON.parse(readFileSync(commercePath, 'utf8')).commerce ?? {}
    : {};

  if (!dryRun) mkdirSync(assetsDir, { recursive: true });

  const commerce = {};
  const unmapped = [];
  const noSpecs = [];
  const changes = [];
  const imageJobs = [];

  for (const p of snapshot.products) {
    const id = toRacketId(p.title);
    if (!id) {
      unmapped.push(p.title);
      continue;
    }
    if (!knownIds.has(id)) {
      // On Shopify but absent from Product_Database_Racket_Specs.xlsx. Writing it
      // would trip validate-data.ts, so surface it instead of silently dropping it.
      noSpecs.push(`${p.title} → would be "${id}"`);
      continue;
    }

    const price = Number.isFinite(p.minPrice) ? Math.round(p.minPrice) : null;
    const stockLevel = stockLevelFor(p.totalInventory);
    const destPath = join(assetsDir, `${id}.png`);
    const hasImage = existsSync(destPath);

    let image = hasImage ? `${id}.png` : null;
    if (p.featuredImageUrl && (refreshAllImages || !hasImage)) {
      imageJobs.push({ id, url: p.featuredImageUrl, destPath, replacing: hasImage });
      image = `${id}.png`;
    }

    commerce[id] = {
      pricePhp: price,
      stockLevel,
      buyUrl: `https://www.ogkilsbadminton.com/products/${p.handle}`,
      sku: commonSkuStem(p.variantSkus),
      image,
    };

    const was = previous[id];
    if (!was) {
      changes.push(`+ ${id} added (₱${price}, ${stockLevel})`);
    } else {
      if (was.pricePhp !== price) changes.push(`~ ${id} price ₱${was.pricePhp} → ₱${price}`);
      if (was.stockLevel !== stockLevel)
        changes.push(`~ ${id} stock ${was.stockLevel} → ${stockLevel} (${p.totalInventory} units)`);
      if (was.buyUrl !== commerce[id].buyUrl)
        changes.push(`~ ${id} buyUrl → ${commerce[id].buyUrl}`);
    }
  }

  for (const id of Object.keys(previous)) {
    if (!commerce[id]) changes.push(`- ${id} no longer on Shopify`);
  }

  let imagesWritten = 0;
  for (const job of imageJobs) {
    if (dryRun) {
      changes.push(`~ ${job.id} image would be ${job.replacing ? 'replaced' : 'downloaded'}`);
      continue;
    }
    try {
      await downloadImage(job.url, job.destPath);
      imagesWritten += 1;
      changes.push(`~ ${job.id} image ${job.replacing ? 'replaced' : 'downloaded'}`);
    } catch (e) {
      console.error(`  ! ${job.id} image failed: ${e.message}`);
    }
  }

  const out = {
    schemaVersion: 1,
    source: `OGKILS Shopify Admin API (${useLive ? 'live' : 'snapshot replay'})`,
    generatedNote:
      'Auto-written by scripts/import-commerce.mjs. Do not hand-edit — re-run the importer.',
    commerce: Object.fromEntries(Object.entries(commerce).sort(([a], [b]) => a.localeCompare(b))),
  };
  if (!dryRun) writeFileSync(commercePath, JSON.stringify(out, null, 2) + '\n');

  const line = '─'.repeat(70);
  console.log(`\n${line}\n  SHOPIFY IMPORT${dryRun ? ' (dry run — nothing written)' : ''}\n${line}`);
  console.log(`  source   ${out.source}`);
  console.log(`  mapped   ${Object.keys(commerce).length} rackets`);
  console.log(`  images   ${imagesWritten} written → src/assets/rackets/`);
  if (changes.length) {
    console.log(`  changes  ${changes.length}`);
    for (const c of changes) console.log(`    ${c}`);
  } else {
    console.log('  changes  none — already in sync');
  }
  if (noSpecs.length) {
    console.log(`\n  ⚠ on Shopify but missing from Product_Database_Racket_Specs.xlsx:`);
    for (const s of noSpecs) console.log(`    ${s}`);
    console.log('    Add the spec row, re-run scripts/build_rackets_json.py, then re-run this.');
  }
  if (unmapped.length) console.log(`\n  skipped  ${unmapped.length}: ${unmapped.join('; ')}`);
  console.log(`${line}\n`);
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
