---
target: critique (homepage anchor + shared world)
total_score: 32
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
target_identity: "file:/home/donald/Documents/20-29 Software Development/21 Web Applications/ogkils-rackets-compare/src/pages/index.astro"
target_fingerprint: "sha256:04fbfff536fb2d3ed69b1c456712d658b221fbfe22d66e97b1a6e907a228f2ac"
target_path: /home/donald/Documents/20-29 Software Development/21 Web Applications/ogkils-rackets-compare/src/pages/index.astro
timestamp: 2026-09-05T06-07-12Z
slug: src-pages-index-astro
---
# Design Critique — OGKILS Racket Compare (homepage anchor + shared world)

Method: dual-agent (A: design review · B: detector + browser evidence, isolated parallel). Target: src/pages/index.astro as anchor; shared world reviewed across /rackets, /rackets/[id], /compare, /finder at desktop 1280 and mobile 390.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Progress bar + "2 rackets · differences marked" + active nav — status everywhere. |
| 2 | Match System / Real World | 4 | "Head-heavy power — built to smash," plain PH-player language. |
| 3 | User Control and Freedom | 3 | Column ✕, Skip, Clear present; persistent tray/assistant can't be dismissed, follow onto /finder. |
| 4 | Consistency and Standards | 3 | Strong token discipline, but AA contrast + touch-target standards violated systemically; 💬 breaks authored-SVG rule. |
| 5 | Error Prevention | 3 | Compare capped at 4, "—" convention prevents zero-vs-blank. |
| 6 | Recognition Rather Than Recall | 4 | Inline ? tooltips deep-link to guide; classification blurbs. |
| 7 | Flexibility and Efficiency | 3 | Differences-only toggle, variant switch, shareable ?ids= URLs. |
| 8 | Aesthetic and Minimalist | 4 | Exceptional restraint. |
| 9 | Error Recovery | n/a | No error states on reviewed static surfaces. |
| 10 | Help and Documentation | 4 | /guide/racket-specs + tooltips + assistant. |
| Total | | 32/36 | Good, borderline Excellent (89%) |

## Design Specificity Verdict — authored, not category-interchangeable
Interior over-delivers the "precision instrument" brief: spec values lead in tabular mono, quiet labels, four classification accents are the only chroma, focus ring a deliberate fifth non-classification blue (global.css:28). Drift toward category-default only in the homepage hero, which asserts "by the numbers" rather than demonstrating it. Detector: 0 findings, exit 0, verified genuine (planted gradient tripped exit 2). Detector agrees with LLM — does not read as generated.

## What's Working
1. Compare difference-marking is triple-coded: amber tint + ▲/▼ glyphs (title + legend) + value emphasis. Colorblind-safe. Best-built thing on the site.
2. Teaching is architectural: per-term ? tooltips → guide, classification blurbs, fact-derived "who it's for" prose (copy.ts, no invented claims).
3. Responsive containment correct: 0 horizontal overflow at 390px everywhere; compare table scrolls internally with sticky first column; useful empty state; reduced-motion gated; console clean.

## Priority Issues

[P1] Systemic AA contrast failure on --color-fg-faint (#626976 = 3.02–3.56:1 on the three dark surfaces, fails AA 4.5:1). Used for breadcrumb separators, footer nav links, "Question N of 8", Skip, "Who it's for" labels, eyebrows, filter "Classification" label, tooltip ? triggers, remove ✕, AND the missing-data "—" glyph. fg-muted #99a0ac passes (6.9–7.5:1). Fix: promote text uses to fg-muted; darken fg-faint to ≥4.5:1 or reserve for non-text. → /impeccable audit

[P1] Interactive controls below 44×44px on mobile (390px): tooltip ? 16×16 (5×16 clipped in cells), remove ✕ 12×20/10×20, variant buttons 32×20, differences-only checkbox 16×16, footer links h20, Skip 115×20. Casey (one-handed mobile) is the stated primary context. The "?" is both failing-contrast and 16px. Fix: expand hit areas to ≥44 via hit-slop. → /impeccable adapt

[P1] Homepage doesn't steer the stated primary user (novice): three co-equal entry cards, taxonomy shown before the router, reassurance below the fold. Fix: make "Find my racket" dominant; Compare+Browse secondary; reassurance above fold. → /impeccable layout

[P2] Compare table: verify floating chrome doesn't occlude spec rows at desktop. Review observed CompareTray over "Max tension"/"Shaft diameter" and assistant FAB over "Swing weight" at 1280; evidence agent measured mobile clean. Unconfirmed at desktop. Fix: verify ≥1280; dock/suppress tray on /compare, pad container. → /impeccable harden

[P2] Rackets filter wall on desktop: ~20 chips, 6 groups all expanded (mobile already collapses to one button). Fix: collapse less-common groups behind "More filters" on desktop, or add ? tooltips to group headers. → /impeccable distill

[P3] 💬 emoji assistant breaks icon discipline — replace with authored SVG. → /impeccable polish
[P3] Diff-marker fires on 3mm balance delta — dilutes "amber = matters"; use a perceptible threshold. → /impeccable harden

NOT a defect (verified): "single buy channel" is correct-by-spec. data.ts:43 wires each racket's Shopify product URL into the shopify channel; BuyButtons renders only populated channels (§9). Shopee/Lazada/TikTok unpopulated = open question §14.4, not a bug.

## Persona Red Flags
Jordan (first-timer, critical): co-equal cards give no "start here"; taxonomy before router; reassurance below fold. Wins: finder pattern, tooltips, no sign-up.
Casey (mobile, primary): buy CTA high near price (good); bottom chrome thumb-reachable. Fails: sub-44px ?/✕/variant/checkbox; stacked home cards push products down.
Sam (a11y, hard req): keyboard solid — real buttons, 2px non-classification focus ring, keyboard tooltips, skip link, colorblind-safe diffs. Fails: systemic fg-faint AA failures (P1).

## Minor Observations
- Header lockup permanently "OGKILS / Compare" on all pages.
- Dimensional Slash Pro ALL-AROUND (amber) but purple art — imagery vs semantic accent disagree.
- CompareTray persists onto /finder — contextually odd, harmless.
- Hero grays the word "numbers" — de-emphasizes the key word.
- Rackets without commerce data fall back to store homepage, not a product page.

## Questions to Consider
1. Hero promises the instrument; interior is the instrument. Lead with a live 2-racket diff above the fold?
2. Emoji banned everywhere except the always-on assistant — instrument or guest?
3. Diff-marker fires on 3mm — does amber still mean "this matters"?
