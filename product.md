# OGKILS Racket Comparison — Product Spec

> **For Claude Code.** Read this whole file before writing code. Build in the phase order
> in §12. At the end of each phase: run typecheck + build, then stop and summarize what
> changed. Do not add dependencies not listed in §3 without asking. Do not invent racket
> specs — every number on the site must come from `data/rackets.json`.

---

## 1. What this is

A standalone microsite (sub-site of ogkilsbadminton.com) whose only job is to help a
badminton player pick the right OGKILS racket, then send them to a place where they can
buy it. It is **not** a store. It has no cart and no checkout. Every conversion path ends
in an outbound link to the Shopify store, Shopee, Lazada, or TikTok Shop.

**Target domain:** `compare.ogkilsbadminton.com` (confirm before configuring DNS-dependent code).

**Primary users:** Philippine recreational and club-level badminton players, mostly on
mobile, often comparing OGKILS against Yonex/Li-Ning/Victor before buying. Many do not
know what "balance point" or "4U" mean — the site must teach while it compares.

**Success = three jobs done well:**

1. **Compare** — put 2–4 rackets side by side, spec by spec, with the differences obvious.
2. **Recommend** — take a player's answers about how they play and rank the lineup for them.
3. **Convert** — one tap from any racket to any of the four sales channels.

## 2. Non-goals

- No cart, checkout, payments, accounts, or user login.
- No live inventory or price sync in v1 (prices are static fields in the data file).
- No server-side runtime, database, or CMS in v1. The site is fully static.
- No real LLM inference in the browser (see §8 for how the "chatbot" actually works).
- No comparison against competitor brands (Yonex etc.) in v1 — OGKILS lineup only.

## 3. Stack and constraints

- **Astro 5** with **TypeScript** (strict), static output (`output: 'static'`).
- **Tailwind CSS v4** for styling.
- **React islands** only where interactivity is required: compare tray, finder quiz, chat
  widget, filter bar. Everything else ships as zero-JS HTML.
- **No backend.** All data is bundled JSON, imported at build time.
- Deploy target: Cloudflare Pages (or Netlify — keep the build output portable).
- Package manager: `pnpm`.
- Allowed extra deps: `nanostores` + `@nanostores/react` (shared compare/quiz state),
  `fuse.js` (fuzzy racket-name matching in the chat widget). Ask before anything else.

**Performance budget (mobile, 4G):** LCP < 2.0s, total JS < 120KB gzipped, Lighthouse
performance ≥ 90. This is a Philippine mobile audience — treat the budget as a hard
requirement, not an aspiration.

**Accessibility:** keyboard-navigable compare table, visible focus states, AA contrast,
`prefers-reduced-motion` respected.

## 4. Data

### 4.1 Source of truth

`data/rackets.json` (provided, 19 rackets, `schemaVersion: 1`). It was generated from
`Product_Database_Racket_Specs.xlsx` by `scripts/build_rackets_json.py`. When the
spreadsheet is updated, re-run that script — never hand-edit generated spec fields.

Fields marked "to be filled manually" in the JSON (`tagline`, `description`, `pricePhp`,
`images`, `links`) are **not** overwritten by the script only because the script writes
them as `null`. Before Phase 1, move the manual fields into a separate
`data/rackets.overrides.json` keyed by racket `id`, and have the build merge
`generated + overrides`. That keeps a spreadsheet refresh from wiping marketing copy.

### 4.2 Shape

```jsonc
{
  "id": "mist-breathing",            // slug, stable, used in URLs
  "name": "Mist Breathing",
  "modelCode": "MIST BREATHING",
  "series": "Breathing" | "LD" | "Other",
  "classification": "ATTACK" | "SPEED" | "CONTROL" | "ALL-AROUND",
  "balance": "Head-Heavy" | "Even Balance" | "Head-Light",
  "materials": ["VIBRANIUM", "TORAY M46J", "HIGH MODULUS CARBON FIBER"],
  "shaftDiameterMm": 6.8,
  "stiffness": { "word": "Medium", "rangeLow": 8.2, "rangeHigh": 8.5, "value": 8.35, "raw": "..." },
  "frameHoleCount": 76,
  "frameHoleType": "76 Slanted Hole",
  "frameAreaCm2": 355.07,
  "gripLengthMm": 217,
  "racketLengthMm": 675,
  "variants": [                       // one per weight class the model ships in
    {
      "weightClass": "3U",
      "weightRangeG": [85.0, 89.9],
      "weightMidG": 87.5,
      "gripSizes": ["G5"],
      "maxTensionLbs": 31,
      "balancePointMm": 296,
      "balancePointToleranceMm": 3,
      "swingWeight": 87,
      "swingWeightMissing": false
    }
  ],
  "tagline": null, "description": null, "pricePhp": null,
  "images": [], "inStock": true,
  "links": { "shopify": null, "shopee": null, "lazada": null, "tiktok": null }
}
```

**The comparison unit is the variant, not the racket.** A 3U Fire Breathing and a 5U Fire
Breathing are different rackets in the hand. Compare rows must show per-variant values
side by side, and the finder must recommend a *variant* (e.g. "Fire Breathing 4U G6").

### 4.3 Known data-quality issues — handle, don't paper over

The source spreadsheet is inconsistent. Build a `scripts/validate-data.ts` that fails the
build on schema violations and prints warnings for the rest:

| Issue | Where | Required behavior |
|---|---|---|
| `stiffness.word` contradicts `stiffness.raw` | e.g. Mist Breathing: word "Medium", raw "8.2-8.5 (Stiff)" | Warn at build. Display the **numeric range** as primary and the word as a label; never show both when they disagree. |
| Swing weight missing | DSPRO, Freezing, LD88DPRO, LDLYD, LD12L, Annihilation, LD88SPRO | Render "—" with a tooltip "Not published". Exclude from that row's diff highlighting and from any sort. |
| Swing-weight column duplicated the balance point | LDLYD row in source | Already nulled by the converter. Do not re-derive. |
| Missing frame area / grip length | Annihilation, LD88DPRO | Render "—". |
| `balance` label vs `balancePointMm` disagree | e.g. Wind Breathing labelled Even Balance at 294mm | The **numeric balance point is authoritative** for the recommendation engine. The label is display-only. |
| Grip length 165–170mm on LD88DPRO/LD88SPRO vs ~205–217mm elsewhere | source | Warn — likely a unit or column error. Flag it for Donald rather than showing it as fact. |
| `maxTensionLbs` is a ceiling, not a recommendation | all | Label the row "Max Tension" and never present it as a suggested stringing tension. |

Derived buckets (compute once in `src/lib/derive.ts`, do not hardcode per racket):

- `balanceBucket`: `≤295` Head-Light, `296–301` Even, `≥302` Head-Heavy.
- `stiffnessOrdinal`: `Slightly Soft` 1, `Medium` 2, `Slightly Stiff` 3, `Stiff` 4.
- `weightOrdinal`: `6U` 1 … `3U` 4.

## 5. Site map

| Route | Rendering | Purpose |
|---|---|---|
| `/` | static | Hero, three entry points (Find my racket / Compare / Browse all), 3 featured rackets, short "how to read racket specs" teaser. |
| `/rackets` | static | Full lineup grid + filter bar (classification, balance, weight class, stiffness, series, grip size). |
| `/rackets/[id]` | static, 19 pages | One racket: full spec table, variant switcher, "who it's for", 3 suggested comparisons, buy buttons. |
| `/compare` | static shell + client state | Compare tray reads `?ids=a,b,c` (max 4). Shareable URL. |
| `/compare/[slugA]-vs-[slugB]` | static, pre-generated | SEO pages for a curated pair list (§10). Same table, plus a written verdict paragraph from override data. |
| `/finder` | static shell + client quiz | The recommendation quiz (§7). Results deep-link to `/compare?ids=...`. |
| `/guide/racket-specs` | static | Plain-language explainer: what U-weights, balance point, shaft stiffness, and hole count actually do. Links from every `?` tooltip. |
| `/404` | static | Suggest search + top rackets. |

Chat widget (§8) is a global island available on every page.

## 6. Feature: Compare

- Select 2–4 rackets. Selection persists across pages (nanostores + `sessionStorage`) and
  is reflected in the URL so a comparison can be shared or pinned.
- Layout: **desktop** = columns per racket, rows per spec, sticky spec-label column and
  sticky racket header. **Mobile** = horizontally scrollable columns with the spec label
  column frozen; do not collapse into stacked cards, players want to see values adjacent.
- Each racket column has a variant selector (3U / 4U / 5U). Changing it updates every
  variant-scoped row live.
- **Difference highlighting** is the core value: for each row, if values differ, highlight
  the extreme(s) — heaviest/lightest, stiffest/most flexible, most head-heavy, highest max
  tension, largest frame. Use a subtle background tint plus an icon or "▲/▼" marker, never
  color alone. Rows where all values are equal collapse into a muted "same across all" group
  the user can expand.
- A "Differences only" toggle hides identical rows.
- Every spec label has a `?` that opens a one-sentence plain-language explanation
  ("Balance point: higher number = more weight in the head = more power, slower swing").
- Bottom of each column: price (if set), stock state, and the four buy buttons.
- Empty and single-selection states must be useful, not blank: suggest popular pairs.

## 7. Feature: Racket Finder (deterministic recommendation engine)

`src/lib/recommend.ts` — a pure function, fully unit-tested, **no network calls and no LLM**.

```ts
recommend(answers: FinderAnswers, catalog: Racket[]): Recommendation[]
```

### 7.1 Questions (one per screen, progress bar, back button, all skippable)

1. **Skill level** — Beginner (< 1 yr) / Intermediate (club/social league) / Advanced (competitive)
2. **What you mostly play** — Singles / Doubles (front court) / Doubles (rear court) / Mixed & casual
3. **Your style** — "I want to smash" / "All-court, I do a bit of everything" / "Fast flat exchanges and defense" / "Control and placement, I outlast people"
4. **Swing & arm strength** — Light and fast swings / Balanced / Strong full swings
5. **Any wrist, elbow, or shoulder discomfort?** — Yes / No
6. **Preferred string tension** — Under 24 lbs / 24–27 lbs / 28 lbs+ / Not sure
7. **Grip size** — G5 (larger) / G6 (smaller) / Not sure
8. **Budget** — optional; only shown if `pricePhp` is populated for ≥ 80% of the catalog.

### 7.2 Scoring

Score every **variant** (not racket) 0–100.

**Hard filters (exclude the variant):**
- Q6 answer `28+` and `maxTensionLbs < 28`.
- Q7 answer G5 or G6 and that grip is not offered in the variant.
- `inStock === false` (rank last with a "notify me" note rather than hiding, if the racket
  is otherwise a strong match).

**Weighted criteria** (weights sum to 100; keep them in one exported `WEIGHTS` const so
they are tunable in one place):

| Criterion | Weight | Rule |
|---|---|---|
| Balance fit | 25 | Map Q3: smash → target 305mm; all-court → 298mm; fast/defense → 294mm; control → 297mm. Then shift by Q2: rear-court doubles +4mm, front-court doubles −5mm, singles +2mm. Score = `100 − min(100, |balancePointMm − target| × 4)`. |
| Classification fit | 20 | Q3 → preferred `classification` (smash→ATTACK, all-court→ALL-AROUND, fast→SPEED, control→CONTROL). Exact 100, adjacent 60 (ALL-AROUND is adjacent to everything), opposite 20. |
| Stiffness fit | 20 | Target ordinal from Q1 + Q4: Beginner or light swing → 1–2; Intermediate or balanced → 2–3; Advanced and strong swing → 3–4. Q5 = Yes forces target down by 1 and caps at 2. Score = `100 − |ordinal − target| × 30`. |
| Weight fit | 20 | Target weight class from Q4 + Q1: strong swing → 3U/4U; balanced → 4U; light/fast or beginner → 4U/5U/6U. Q5 = Yes shifts one class lighter. Score = `100 − |weightOrdinal − target| × 30`. |
| Tension headroom | 10 | Q6 midpoint vs `maxTensionLbs`: ≥ 2 lbs headroom = 100, 0–2 = 70, below = excluded by hard filter. "Not sure" = 100 for all. |
| Shaft diameter | 5 | Thinner (6.2–6.6mm) favored for fast/defense answers, thicker (6.8–7.0mm) for smash and beginner answers. Linear. |

Skipped question → that criterion scores a flat 70 for every variant (neutral, doesn't distort ranking).

**Output:** top 3 variants, plus up to 2 "also consider" from a different classification so
the result set isn't three near-identical rackets. Enforce max 1 variant per racket in the
top 3.

### 7.3 Explaining the result — no LLM needed

Each criterion emits a templated reason string when it scores ≥ 80, e.g.
`"Head-heavy at {balancePointMm}mm — the weight sits forward, which is what you want for
smashing from the back."` Show the top 3 reasons per recommendation, plus one honest
trade-off from the lowest-scoring criterion (`"It's a stiff shaft — less forgiving if your
timing is still developing."`). Honest trade-offs build trust and reduce returns; do not
suppress them.

Results screen: 3 cards → "Compare these 3" (deep-links to `/compare?ids=...`) → buy
buttons on each. Result state must be encoded in the URL so players can share it.

## 8. Feature: Chat / advisor widget

There is no LLM at runtime. This is a **retrieval + intent-matching assistant** over
`rackets.json`. Be honest in the UI: label it "Racket Assistant", not "AI".

Pipeline in `src/lib/assistant.ts`:

1. **Normalize** input (lowercase, strip punctuation, expand PH-English/Taglish synonyms:
   "pang-smash" → smash, "magaan" → light, "matigas" → stiff, "pambato" → best).
2. **Entity extraction** — racket names and model codes via exact word match first, then
   Fuse.js fuzzy match over `name`, `modelCode`, and an alias list in overrides (e.g.
   "annihilator" → Annihilation, "77" → LD77PRO). Bare numbers, ordinary English words and
   series names are excluded from the fuzzy pass so "anything under 4000" and "the
   breathing rackets" don't resolve to a single model. Also extract weight classes (`4u`),
   grips (`g6`), tensions (`28 lbs`), price caps ("under ₱4,500", "4.5k"), frame materials
   (matched against the catalogue's own list) and series.
3. **Intent classification** by keyword rule set, most specific first:
   - `spec_lookup` — "how heavy is X", "what's the balance of X", "can I string X at 30 lbs"
   - `compare` — "X vs Y", "difference between X and Y", "which is lighter, X or Y"
   - `superlative` — "cheapest attack racket", "which has the biggest head"
   - `suitability` — "is the Fire Breathing good for a beginner"
   - `recommend` — "which racket for smashing", "best for beginners"
   - `list_by_attribute` — "what rackets are head-light", "which ones take 30 lbs"
   - `explain_term` — "what is 4U", "what does balance point mean", "what is vibranium"
   - `buy` — "how much", "where to buy", "available in Shopee?"
   - `catalog_overview` — "what rackets do you have"
   - `smalltalk` — greetings, thanks, "are you an AI?" (answer: no, and say why)
   - `fallback`

   Measurable specs live in one `DIMENSIONS` table in `assistant.ts`. Adding a row there
   gives a spec answer, a superlative, a head-to-head comparative and a yes/no check at
   once — add specs there, not in the responders. Rank only on figures that discriminate:
   weight class and stiffness are published as *bands*, so when a "winner" is shared by
   more than three rackets the assistant says so instead of crowning one arbitrarily, and
   unpublished figures are excluded from every ranking and named in the reply (§4.3).
4. **Respond** from templates filled with real data. `compare` renders an inline mini table
   plus a "See full comparison" button. `recommend` runs the §7 engine with whatever
   attributes were extracted and offers the quiz for the rest. `explain_term` pulls from
   the same glossary as the `?` tooltips (single source: `data/glossary.json`).
5. **Fallback** never says "I don't understand" and stops. It offers 3 tappable suggestion
   chips relevant to the last-mentioned racket, plus "Take the 60-second quiz".
6. **Conversation memory.** `answer(query, data, context)` returns the next `context`:
   the rackets from recent turns and a `FinderAnswers` profile accumulated from what the
   player has said about themselves. That is what lets "can I string it at 30 lbs" and
   "which one is more forgiving" work as follow-ups. It lives in React state in the widget
   only — nothing is persisted and nothing leaves the browser — and the panel has a
   "Start over" control. A turn that only adds to the profile re-ranks rather than
   falling back.

`pnpm assistant:eval` prints the real prose for a stored set of single-turn and multi-turn
questions. When a genuine question shows up in the `assistant_fallback` analytics event,
add it there, fix the rules, and add the case to `assistant.test.ts`.

Always end a spec answer with a next step (compare / see racket / buy). Log every intent +
matched entity + whether it fell back, so the keyword rules can be improved from real logs.

**Optional Phase 4 (do not build in v1):** a Cloudflare Worker that proxies to the Claude
API for `fallback` intents only, with a strict system prompt that forbids inventing specs
and requires it to answer from a supplied JSON of the catalog. Keep the rule-based path as
the primary so the site still works if the Worker is down or the budget runs out.

## 9. Buy links and tracking

- Four channels per racket: `shopify`, `shopee`, `lazada`, `tiktok`. Render only the ones
  with a non-null URL. If `shopify` exists, present it first and visually primary — it is
  the highest-margin channel.
- Appended params on every outbound link:
  `utm_source=compare&utm_medium=microsite&utm_campaign=racket_comparison&utm_content={racketId}_{channel}_{placement}`
  where `placement` ∈ `detail | compare | finder | chat`.
- `rel="noopener"`, `target="_blank"`, and an analytics event `buy_click` with
  `{racketId, variant, channel, placement}` before navigation.
- Track also: `compare_add`, `compare_view` (with the id set), `finder_complete` (with the
  answer vector and the top result), `assistant_intent`, `assistant_fallback`.
- Analytics: privacy-friendly and lightweight (Plausible or Cloudflare Web Analytics).
  Confirm which before adding the script.

## 10. SEO

- Pre-generate `/compare/[a]-vs-[b]` for a curated pair list in `data/comparisons.json`
  (start with same-classification pairs and the Breathing-series flagships — roughly 15–25
  pages, not the full 171-pair cross product).
- Per-page `title`/`description` templates, canonical URLs, OpenGraph images.
- JSON-LD: `Product` on racket pages (with `offers` only where `pricePhp` is set),
  `FAQPage` on the guide, `BreadcrumbList` everywhere.
- Sitemap + robots.txt. Cross-link to the main store; ask Donald to link back from Shopify.
- Every racket page and comparison page needs ≥ 150 words of unique prose from overrides —
  a spec table alone will not rank.

## 11. Design direction

- Feels like an equipment spec sheet a serious player would trust: dense, precise,
  high-contrast, fast. Not a generic SaaS landing page.
- Dark UI, one accent color per performance classification used consistently across the
  whole site (ATTACK / SPEED / CONTROL / ALL-AROUND), so classification becomes readable at
  a glance. Confirm the exact palette against OGKILS brand colors before locking it in.
- Numbers set in a tabular-figure font so columns align. Spec values are the hero content —
  give them size and weight, and keep the labels quiet.
- Mobile-first. Every primary action reachable one-handed; buy buttons never below a fold
  that requires a second scroll on a racket page.

## 12. Build order

Stop after each phase and report.

1. **Phase 0 — Scaffold.** Astro + TS strict + Tailwind, data loading, `derive.ts`,
   `validate-data.ts` wired into the build, overrides merge. Print the data warnings.
2. **Phase 1 — Browse.** `/rackets` grid + filters, `/rackets/[id]` detail pages with
   variant switcher and buy buttons. `/guide/racket-specs` + glossary.
3. **Phase 2 — Compare.** Compare tray, `/compare`, diff highlighting, mobile table,
   shareable URLs, pre-generated versus pages.
4. **Phase 3 — Finder.** Quiz UI, `recommend.ts` + unit tests, results screen, deep-link
   into compare.
5. **Phase 4 — Assistant.** Intent rules, entity matching, templated responses, suggestion
   chips, logging.
6. **Phase 5 — Polish.** SEO metadata, JSON-LD, sitemap, analytics, Lighthouse pass against
   the §3 budget, a11y audit.

## 13. Acceptance criteria

- [ ] All 19 rackets and every variant render with no `undefined`, `null`, or `NaN` visible.
- [ ] Missing specs show "—", never a zero or a blank cell.
- [ ] A 4-racket comparison is readable and scrollable on a 375px-wide viewport.
- [ ] `/compare?ids=fire-breathing,ld100zz` loads that exact comparison from a cold start.
- [ ] The finder returns 3 recommendations for every one of a stored set of 12 sample answer
      vectors, and never returns the same racket twice in the top 3.
- [ ] `recommend.ts` has unit tests covering each hard filter and each criterion.
- [ ] The assistant answers correctly for the stored sample questions covering every intent,
      and never renders `undefined`, `null` or `NaN` in a reply.
- [ ] Every buy button carries correct UTM params and fires `buy_click`.
- [ ] Re-running `build_rackets_json.py` after editing the spreadsheet does not lose any
      manual copy, prices, images, or links.
- [ ] Lighthouse mobile: performance ≥ 90, accessibility ≥ 95, SEO ≥ 95.
- [ ] `pnpm build` passes with zero TypeScript errors.

## 14. Open questions — ask Donald, don't guess

1. Final domain / subdomain, and whether it deploys to Cloudflare Pages or Netlify.
2. Should prices be shown at all, given they differ across Shopee / Lazada / TikTok? Options:
   hide prices, show "from ₱X", or show per-channel.
3. Product image sources — Shopify CDN URLs, or a local `public/images/rackets/` set?
4. Confirm the four buy URLs per racket (19 × 4). Provide as a CSV keyed by racket `id`.
5. Brand palette and font — reuse the Kalles/Shopify theme's, or diverge for this microsite?
6. The grip-length outliers on LD88DPRO (170mm) and LD88SPRO (165mm) — real, or a
   spreadsheet error?
7. Which rackets are discontinued or out of stock, so `inStock` starts accurate?
