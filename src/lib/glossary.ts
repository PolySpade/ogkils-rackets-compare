// Typed access to the shared glossary. Feeds both the ? tooltips and the assistant's
// explain_term intent from ONE source (data/glossary.json). See product.md §6, §8.

import glossaryFile from '../../data/glossary.json';

export interface GlossaryTerm {
  term: string;
  short: string;
  long: string;
}

const terms = glossaryFile.terms as Record<string, GlossaryTerm>;

export type GlossaryKey = keyof typeof terms;

export function getTerm(key: string): GlossaryTerm | undefined {
  return terms[key];
}

export function allTerms(): Array<{ key: string } & GlossaryTerm> {
  return Object.entries(terms).map(([key, value]) => ({ key, ...value }));
}
