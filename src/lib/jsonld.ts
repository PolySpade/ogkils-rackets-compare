// Structured data builders (product.md §10). Plain objects → JSON-LD in Base.astro.
import type { GlossaryTerm } from './glossary';
import type { Racket } from './types';

type Json = Record<string, unknown>;

function abs(site: string | URL, path: string): string {
  return new URL(path, site).href;
}

export function breadcrumbJsonLd(site: string | URL, items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(site, it.path),
    })),
  };
}

export function productJsonLd(
  site: string | URL,
  r: Racket,
  description: string,
  imageUrl?: string,
): Json {
  const json: Json = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: r.name,
    category: 'Badminton Racket',
    brand: { '@type': 'Brand', name: 'OGKILS' },
    description,
    url: abs(site, `/rackets/${r.id}`),
  };
  if (r.sku) json.sku = r.sku;
  if (imageUrl) json.image = [imageUrl];
  if (r.pricePhp !== null) {
    json.offers = {
      '@type': 'Offer',
      price: r.pricePhp,
      priceCurrency: 'PHP',
      availability:
        r.stockLevel === 'Out of Stock'
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      url: abs(site, `/rackets/${r.id}`),
    };
  }
  return json;
}

export function faqJsonLd(terms: (GlossaryTerm & { key: string })[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: terms.map((t) => ({
      '@type': 'Question',
      name: `What is ${t.term.toLowerCase()} in a badminton racket?`,
      acceptedAnswer: { '@type': 'Answer', text: t.long },
    })),
  };
}

export function organizationJsonLd(site: string | URL): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'OGKILS',
    url: 'https://ogkilsbadminton.com',
    subOrganization: { '@type': 'WebSite', name: 'OGKILS Racket Compare', url: abs(site, '/') },
  };
}
