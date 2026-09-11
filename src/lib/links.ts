// Outbound buy links with UTM tagging (product.md §9). Every conversion path ends here.
import { CHANNEL_ORDER } from './data';
import type { Channel, Racket } from './types';

export type Placement = 'detail' | 'compare' | 'finder' | 'chat';

export const CHANNEL_LABEL: Record<Channel, string> = {
  shopify: 'OGKILS Store',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok Shop',
};

/** Append the campaign UTM params (§9). `placement` says where the click came from. */
export function buildBuyUrl(
  url: string,
  racketId: string,
  channel: Channel,
  placement: Placement,
): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'compare');
  u.searchParams.set('utm_medium', 'microsite');
  u.searchParams.set('utm_campaign', 'racket_comparison');
  u.searchParams.set('utm_content', `${racketId}_${channel}_${placement}`);
  return u.toString();
}

export interface BuyLink {
  channel: Channel;
  label: string;
  url: string;
  /** Shopify is the highest-margin channel and renders primary (§9). */
  primary: boolean;
}

/** Non-null channels in priority order (shopify first, visually primary). */
export function buyLinks(racket: Racket): BuyLink[] {
  return CHANNEL_ORDER.filter((c) => racket.links[c]).map((c) => ({
    channel: c,
    label: CHANNEL_LABEL[c],
    url: racket.links[c] as string,
    primary: c === 'shopify',
  }));
}

/** Fallback when no per-racket links are set yet (§14.4 pending). */
export const STORE_FALLBACK_URL = 'https://ogkilsbadminton.com';
