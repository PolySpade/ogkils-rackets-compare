// Resolves a racket id to its optimizable product image (from the Shopify import).
// Images live in src/assets/rackets/<id>.png so astro:assets can emit responsive webp.
// Server-only (uses import.meta.glob) — never import from a client island.
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/rackets/*.png', {
  eager: true,
});

const byId = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(files)) {
  const id = path.split('/').pop()!.replace(/\.png$/, '');
  byId.set(id, mod.default);
}

export function racketImage(id: string): ImageMetadata | undefined {
  return byId.get(id);
}

export function hasRacketImage(id: string): boolean {
  return byId.has(id);
}
