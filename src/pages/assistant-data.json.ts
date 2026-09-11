// Static data file for the Racket Assistant, fetched on first open so the widget adds
// almost nothing to per-page weight (product.md §3 budget). Emits /assistant-data.json.
import type { APIRoute } from 'astro';
import { catalog } from '../lib/data';
import { allTerms } from '../lib/glossary';
import { buyLinks, buildBuyUrl, STORE_FALLBACK_URL } from '../lib/links';

export const GET: APIRoute = () => {
  const buys: Record<string, { label: string; url: string; channel: string; primary: boolean }[]> = {};
  for (const r of catalog) {
    const links = buyLinks(r);
    buys[r.id] = links.length
      ? links.map((l) => ({ label: l.label, channel: l.channel, primary: l.primary, url: buildBuyUrl(l.url, r.id, l.channel, 'chat') }))
      : [{ label: 'OGKILS Store', channel: 'shopify', primary: true, url: STORE_FALLBACK_URL }];
  }
  return new Response(JSON.stringify({ rackets: catalog, glossary: allTerms(), buys }), {
    headers: { 'content-type': 'application/json' },
  });
};
