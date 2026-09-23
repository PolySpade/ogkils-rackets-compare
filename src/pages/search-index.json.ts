// Static index for the header search overlay, fetched on first open so search costs
// nothing on pages nobody searches from (product.md §3 budget). Emits /search-index.json.
// Deliberately minimal — the full catalogue already ships at /assistant-data.json.
import type { APIRoute } from 'astro';
import { catalog } from '../lib/data';
import { toSearchRecord } from '../lib/search';

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ rackets: catalog.map(toSearchRecord) }), {
    headers: { 'content-type': 'application/json' },
  });
