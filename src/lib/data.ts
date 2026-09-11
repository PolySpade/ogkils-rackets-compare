// The ONLY module that touches raw JSON. Everything else imports `catalog` from here.
// Merges generated specs with hand-authored overrides and attaches derived buckets.
// See product.md §4.1 (source of truth) and §4.2 (shape).

import generated from '../../data/rackets.generated.json';
import overridesFile from '../../data/rackets.overrides.json';
import commerceFileRaw from '../../data/commerce.json';
import { deriveRacket } from './derive';
import type {
  Channel,
  Commerce,
  CommerceFile,
  GeneratedRacket,
  OverridesFile,
  Racket,
  RacketOverride,
  RacketsFile,
} from './types';

const CHANNELS: Channel[] = ['shopify', 'shopee', 'lazada', 'tiktok'];

const emptyLinks = (): Record<Channel, string | null> =>
  Object.fromEntries(CHANNELS.map((c) => [c, null])) as Record<Channel, string | null>;

const DEFAULT_OVERRIDE: RacketOverride = {
  tagline: null,
  description: null,
  whoItsFor: null,
  pricePhp: null,
  images: [],
  links: emptyLinks(),
  aliases: [],
};

function mergeRacket(
  gen: GeneratedRacket,
  ov: Partial<RacketOverride> | undefined,
  cm: Partial<Commerce> | undefined,
): Racket {
  const o: RacketOverride = { ...DEFAULT_OVERRIDE, ...ov };
  // Shopify buy URL feeds the shopify channel; a hand-set override link still wins.
  const links = { ...gen.links, ...o.links };
  if (cm?.buyUrl && !links.shopify) links.shopify = cm.buyUrl;

  // Commerce is authoritative for price and stock (Shopify is the live source).
  const stockLevel = cm?.stockLevel ?? null;
  const inStock = stockLevel ? stockLevel !== 'Out of Stock' : gen.inStock;

  return {
    ...gen,
    tagline: o.tagline ?? gen.tagline,
    description: o.description ?? gen.description,
    pricePhp: o.pricePhp ?? cm?.pricePhp ?? gen.pricePhp,
    images: o.images.length ? o.images : gen.images,
    links,
    inStock,
    stockLevel,
    sku: cm?.sku ?? null,
    whoItsFor: o.whoItsFor,
    aliases: o.aliases,
    derived: deriveRacket(gen),
  };
}

// JSON imports infer looser types (string vs literal unions, number[] vs tuple); the
// validate-data.ts gate guarantees the real shape, so assert through `unknown`.
const racketsFile = generated as unknown as RacketsFile;
const overrides = (overridesFile as unknown as OverridesFile).overrides ?? {};
const commerce = (commerceFileRaw as unknown as CommerceFile).commerce ?? {};

export const catalog: Racket[] = racketsFile.rackets.map((r) =>
  mergeRacket(r, overrides[r.id], commerce[r.id]),
);

const byId = new Map(catalog.map((r) => [r.id, r]));

export function getRacket(id: string): Racket | undefined {
  return byId.get(id);
}

export function allRacketIds(): string[] {
  return catalog.map((r) => r.id);
}

/** Share of the catalog with a real price — gates the finder's optional budget step (§7.1). */
export function pricedFraction(): number {
  const priced = catalog.filter((r) => typeof r.pricePhp === 'number').length;
  return catalog.length ? priced / catalog.length : 0;
}

export const CHANNEL_ORDER = CHANNELS;
