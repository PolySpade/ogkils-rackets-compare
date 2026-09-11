// Domain types for the OGKILS racket catalog.
// Mirrors data/rackets.generated.json (schemaVersion 1) merged with
// data/rackets.overrides.json. See product.md §4.2.
//
// Spec fields that the source spreadsheet leaves blank are `number | null`.
// Never coerce a missing value to 0 — the UI must render "—" (§4.3, §13).

export type Series = 'Breathing' | 'LD' | 'Other';
export type Classification = 'ATTACK' | 'SPEED' | 'CONTROL' | 'ALL-AROUND';
export type BalanceLabel = 'Head-Heavy' | 'Even Balance' | 'Head-Light';
export type WeightClass = '3U' | '4U' | '5U' | '6U';
export type GripSize = 'G5' | 'G6';
export type StiffnessWord = 'Slightly Soft' | 'Medium' | 'Slightly Stiff' | 'Stiff';
export type Channel = 'shopify' | 'shopee' | 'lazada' | 'tiktok';
export type StockLevel = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface Stiffness {
  word: StiffnessWord | string;
  rangeLow: number | null;
  rangeHigh: number | null;
  value: number | null;
  raw: string | null;
}

export interface Variant {
  weightClass: WeightClass;
  weightRangeG: [number, number];
  weightMidG: number;
  gripSizes: GripSize[];
  maxTensionLbs: number;
  balancePointMm: number;
  balancePointToleranceMm: number;
  swingWeight: number | null;
  swingWeightTolerance: number | null;
  swingWeightMissing: boolean;
}

/** Fields authored by hand in rackets.overrides.json (never written by the converter). */
export interface RacketOverride {
  tagline: string | null;
  description: string | null;
  /** Short "who it's for" blurb shown on the detail page. */
  whoItsFor: string | null;
  pricePhp: number | null;
  images: string[];
  links: Record<Channel, string | null>;
  /** Extra names/typos the assistant should fuzzy-match to this racket (§8.2). */
  aliases: string[];
}

/** A racket exactly as emitted by build_rackets_json.py (manual fields still null). */
export interface GeneratedRacket {
  id: string;
  name: string;
  modelCode: string;
  series: Series;
  classification: Classification;
  balance: BalanceLabel;
  materials: string[];
  materialsRaw: string;
  shaftDiameterMm: number;
  shaftNote: string;
  stiffness: Stiffness;
  frameHoleCount: number;
  frameHoleType: string;
  frameAreaCm2: number | null;
  gripLengthMm: number | null;
  racketLengthMm: number;
  variants: Variant[];
  tagline: string | null;
  description: string | null;
  pricePhp: number | null;
  images: string[];
  inStock: boolean;
  links: Record<Channel, string | null>;
}

/** Buckets derived once in derive.ts — the recommendation engine's source of truth. */
export type BalanceBucket = 'Head-Light' | 'Even' | 'Head-Heavy';

export interface Derived {
  /** From the numeric balance point, which is authoritative over the label (§4.3). */
  balanceBucket: BalanceBucket;
  /** 1 Slightly Soft … 4 Stiff. */
  stiffnessOrdinal: number;
  /** Lightest (6U) 1 … heaviest (3U) 4, per variant. */
  weightOrdinals: Record<WeightClass, number>;
  /** True when the display word disagrees with the numeric range (§4.3). */
  stiffnessWordConflict: boolean;
}

/** Shopify-sourced commerce data, written by scripts/import-commerce.mjs. */
export interface Commerce {
  pricePhp: number | null;
  stockLevel: StockLevel | null;
  buyUrl: string | null;
  sku: string | null;
  image: string | null;
}

export interface CommerceFile {
  schemaVersion: number;
  source: string;
  commerce: Record<string, Partial<Commerce>>;
}

/** The merged, display-ready racket used everywhere in the app. */
export interface Racket extends GeneratedRacket {
  whoItsFor: string | null;
  aliases: string[];
  /** From Shopify (commerce.json); null when the racket isn't listed online. */
  stockLevel: StockLevel | null;
  /** SKU from Shopify, for reference. */
  sku: string | null;
  derived: Derived;
}

/** A racket paired to one selected variant — the true unit of comparison (§4.2). */
export interface VariantRef {
  racket: Racket;
  variant: Variant;
}

export interface RacketsFile {
  schemaVersion: number;
  source: string;
  count: number;
  rackets: GeneratedRacket[];
}

export interface OverridesFile {
  schemaVersion: number;
  overrides: Record<string, Partial<RacketOverride>>;
}
