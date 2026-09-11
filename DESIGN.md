# Design — OGKILS Racket Compare

<!-- impeccable:design-world 1 -->

## The world, in one line

**An athletic product catalogue: bold campaign artwork, white product stages, turquoise technical tables.**

The visual reference is [OGKILS-2026 Brochure.pdf](<OGKILS-2026 Brochure.pdf>).
This document defines the design direction implemented across the shared styles and core
catalogue, finder, product, and comparison surfaces. It supersedes the previous warm-paper,
instrument-panel direction and the Georgia headline treatment.

## What the brochure establishes

Page references use the PDF's 1-based page order, including its cover, rather than the
printed catalogue numbering. The reference was reviewed across all 74 pages.

| Reference | Observed style | Website application |
|---|---|---|
| Cover and back cover, pp. 1, 72 | Oversized angular OGKILS logo; comic illustration; navy, red, white, and blue; diagonal movement; repeated logo border | Give campaign areas a strong sports identity through authentic artwork and a prominent logo |
| Brand introduction and athletes, pp. 3–5 | Extensive white space, thin racket-outline contours, clean sans-serif text, large pale lettering behind studio portraits | Keep supporting content spacious; use subtle racket geometry and restrained athlete imagery |
| Series introduction and selection guides, pp. 7–9 | Brush-style series headings, turquoise racket-shaped performance map, fine-line classification diagram | Use expressive section titles and turquoise as the shared navigation and comparison color |
| Racket campaigns, pp. 10, 12, 14, 16, 18, 22, 24, 26, 28 | Oversized racket heads, slanted model lettering, brush strokes, elemental textures, metallic effects, dramatic lighting | Use model-specific art for hero panels and series features |
| Racket product pages, pp. 11, 13, 15, 17, 19–21, 23, 25, 27, 29–33 | White backgrounds, upright full-length rackets, black series headings, turquoise category subtitles, compact specifications bounded by thin rules | Make product photography the focal point of cards and detail pages |
| Racket comparison tables, pp. 34–38 | Turquoise headers, pale aqua cells, fine white grid lines, dark sans-serif values, generous outer margins | Carry this table treatment directly into the comparison experience |

The brochure alternates visual intensity with quiet product information. Preserve that
rhythm: an energetic introduction followed by a clear, spacious catalogue and readable
comparison tools. Campaign colors belong to their artwork; turquoise unifies the interface.

## Color — white, turquoise, and dark ink

These reference colors come from the PDF's rendered artwork and text/vector fills. They
are practical screen references, not a claim of an official brand color specification.

| Reference color | Value | Evidence and role |
|---|---|---|
| Catalogue white | `#ffffff` | Product-page backgrounds and table margins |
| Brand turquoise | `#32aeb0` | Comparison header on p. 34; p. 8 and product subtitles use the close variant `#34aeae` |
| Pale aqua | `#d7eff0` | Dominant table-body fill on p. 34 |
| Dark ink | `#211613` | Product and table text on pp. 11 and 34 |

Use white as the default page background. Aqua introduces comparison surfaces and selected
states. Dark ink provides the reading hierarchy. Red, green, purple, blue, and gold may
appear prominently inside the corresponding campaign imagery without becoming global UI
accents.

### Semantic tokens

Retain the existing semantic token names so components can adopt the direction centrally
in `src/styles/global.css`. The following values are targets; additional neutrals and the
dark theme are web adaptations of the brochure.

| Token | Light default | Dark adaptation | Purpose |
|---|---|---|---|
| `--color-ink` | `#ffffff` | `#101719` | Page background |
| `--color-panel` | `#ffffff` | `#172225` | Product and content surfaces |
| `--color-panel-2` | `#d7eff0` | `#193233` | Comparison cells and selected surfaces |
| `--color-line` | `#d5dedd` | `#344b4e` | Quiet structural rules |
| `--color-line-strong` | `#657e7d` | `#688789` | Strong boundaries and control outlines |
| `--color-fg` | `#211613` | `#f4f8f8` | Primary text and values |
| `--color-fg-muted` | `#555553` | `#bacaca` | Supporting text |
| `--color-fg-faint` | `#656564` | `#a1b6b6` | Tertiary text and missing values |
| `--color-brand` | `#32aeb0` | `#32aeb0` | Brand fields and decorative accents |
| `--color-brand-strong` | `#067174` | `#68d5d4` | Links, category labels, and primary control fills |
| `--color-on-brand` | `#ffffff` | `#101719` | Text on `--color-brand-strong` |
| `--color-focus` | `#2563eb` | `#6ea8ff` | Keyboard focus |
| `--color-diff` | `#92400e` | `#f7b23b` | Meaningful comparison differences |

Use `--color-fg` on the bright `--color-brand` field. Use `--color-on-brand` only on
`--color-brand-strong`. White on the brochure turquoise measures approximately 2.69:1;
dark ink on that turquoise measures approximately 6.58:1. The darker web teal supports
white button text (5.80:1) and readable teal labels on pale aqua (4.83:1). These checks
describe solid color pairs; verify actual component states during implementation.

Keep light as the default and preserve the existing saved light/dark preference, header
toggle, and no-flash initialization in `Base.astro`. Dark mode carries the same turquoise,
type hierarchy, and catalogue composition onto deep charcoal surfaces. The brochure's
dark campaign posters inform it; the brochure does not define a complete dark UI.

### Classification and state colors

The brochure uses the same turquoise subtitle treatment for SPEED, ATTACK, and CONTROL;
it does not establish the previous four-color classification system as a brand rule.
Style `ClassificationBadge` with a shared teal label and optional thin outline. Always
spell out ATTACK, SPEED, CONTROL, or ALL-AROUND. Keep the existing data values intact.

When implementing, route badge styling through `ClassificationBadge` and
`src/lib/classification.ts`. Existing `--color-attack`, `--color-speed`,
`--color-control`, and `--color-allaround` may temporarily alias
`--color-brand-strong`; move generic buttons, selection, and caret colors to the brand
tokens. Model artwork must not determine classification or interaction states.

Amber remains a functional difference signal, paired with a glyph and explanation.
Red is appropriate for verified NEW labels and errors, each explicitly named.

## Typography — expressive titles, clean information

The PDF embeds ComicaBrush-Regular, several NotoSansHans weights, HarmonyOS Sans,
MiSans, AlimamaShuHeiTi, and PingFang. Product pages visually pair brush-style series
headings with clean sans-serif names and specifications. Campaign model lettering is
often stylized artwork; font metadata alone cannot identify every outlined title.

- **Brand mark:** use the authentic OGKILS logo asset with its original proportions.
  Keep clear space around it; use a white version on dark artwork where available.
  Implemented as `src/components/Logo.astro`: the four-bar symbol and the OGKILS
  wordmark, lifted as unmodified vector paths from the brochure's p.3 lockup and
  confirmed against the brand PNG supplied by OGKILS. It fills with `currentColor`, so
  the header, footer and dark theme colour it without a second asset. `variant="mark"`
  gives the symbol alone; `public/favicon.svg` is the same symbol on the brand field.
- **Series and campaign titles:** short, bold, uppercase, forward-leaning. Use a licensed
  brush display face for occasional BREATHING or LEADING headings when available.
  Until then, use a heavy italic sans-serif fallback. Reserve texture for these titles
  and campaign assets.
- **Model names and page headings:** strong sans-serif, generally medium or bold.
  Use uppercase for model codes and short catalogue labels; sentence case for longer
  explanatory headings. Remove the Georgia/serif headline emphasis from the target UI.
- **Body and controls:** clean sans-serif with a system fallback stack. Use 16px body
  text with roughly 1.5 line height, 14px labels, and at least 12px supporting metadata.
  Increase the brochure's small print to suit mobile reading.
- **Specifications:** use the same sans-serif with `font-variant-numeric: tabular-nums`.
  Values get weight and alignment rather than a different typeface. Update `.tnum`
  accordingly; retain monospace only for actual code or debugging content.

Suggested web scale: hero 40–72px using fluid sizing, page title 32–48px, section title
24–32px, product name 18–24px, table values 14–16px. Keep display headings compact
(1.0–1.1 line height) and tables easy to scan. Self-host only licensed font subsets if
needed; the PDF's embedded fonts are evidence, not deployable font assets.

## Composition, imagery, and surfaces

Build on a consistent grid: approximately 1200px maximum content width, 16–20px mobile
gutters, 24–40px desktop gutters, and 48–80px between major sections. These are web
layout recommendations derived from the brochure's generous margins.

Catalogue surfaces are flat and crisp. Favor white space, fine horizontal rules, and
square or subtly rounded corners (0–4px). Use compact rectangular buttons and tabs.
Reserve pills for small badges or swatches, and shadows for overlays or sticky controls.

Use existing racket assets from `src/assets/rackets` through `RacketImage`. Show the
entire racket upright with `object-fit: contain`, consistent image-stage dimensions,
and enough space to read the frame and grip. Product listings should resemble the
brochure's isolated racket photography. Align multiple variants at a common baseline.

**Asset note (verified during implementation).** The 18 files in `src/assets/rackets`
are not white-background product photographs: each is a 500×500 campaign panel in the
style of brochure pp. 10/12/14 — full-bleed artwork with elemental texture, stylised
model lettering, and the OGKILS badge printed in its own top-left corner. They are the
sanctioned "suitable campaign assets" above, not the isolated product shots on pp. 11/13.
`RacketImage` therefore renders every asset whole on a neutral stage (`--color-stage`)
and never crops into it, at every size from the 48px comparison thumbnail to the home
campaign panel. White product stages remain the rule for the *surfaces* around the
artwork. Two consequences to preserve: an overlay control must not sit on the artwork's
top-left badge (the add-to-compare button lives top-right), and any panel taller than
the square asset carries catalogue information below it rather than letterbox bands.
Replacing these assets with isolated cut-outs would let `RacketImage` fill the stage
edge to edge with no other change.

Campaign art may use close racket-head crops, diagonal strokes, dramatic light, and the
model's own colors. Keep it in bounded hero or series panels. Use an opaque or suitably
darkened text area when copy overlays art. Keep specs and interactive controls on clear
surfaces. Authentic imagery should anchor the homepage; the existing generic inline
racket illustration should give way to product photography or suitable campaign assets.

Fine racket contours, string-bed grids, and short diagonal marks can connect sections.
Use them sparingly. Let the cover's red logo border inspire an occasional campaign frame;
keep catalogue navigation and comparison tables visually quiet.

## Applying the theme to the product

| Area | Target treatment |
|---|---|
| Header and footer | OGKILS logo, white or dark neutral field, clean navigation, turquoise active indicator, thin boundary rule |
| Homepage | One prominent campaign/product composition, short athletic headline, clear finder action, then white catalogue sections for the site's existing series |
| Racket cards | Large upright product image, small teal series/category label, dark model name, compact specs separated by a rule, clear compare control |
| Product detail | Spacious image stage and variant choices, model heading, structured specs, concise playing guidance, existing outbound purchase actions |
| Filters and finder | White surfaces, readable prompts, outlined options; selected options use pale aqua plus a teal border and explicit checked state |
| Compare table | Turquoise column headers with dark ink labels, pale aqua body cells, fine light grid lines, strong row alignment, and white outer space |
| Compare tray and mobile navigation | Compact neutral surfaces, turquoise selection cues, visible racket count, clear action labels, adequate space above device safe areas |
| Tooltips and assistant | Plain sans-serif guidance in neutral panels with restrained teal cues and clear controls |

Let the brochure's BREATHING and LEADING headings inform presentation, while preserving
the application's existing series identifiers and product names. Source all displayed
specifications from the established data pipeline, including verified overrides. The
brochure is the visual reference for this rewrite; it does not silently replace data.

### Comparison behavior

Use pp. 34–38 as the strongest direct reference. Keep table text horizontal and readable;
allow horizontal scrolling on narrow screens with sticky product headers and row labels
where practical. Preserve semantic table markup and clear column associations. Do not
shrink four racket columns to fit a phone screen.

Retain the comparison components' thresholds and the `src/lib/derive.ts` helper:
balance-point differences require at least 5mm and shaft differences at least 0.2mm. Highlight qualifying extremes
with a subtle amber tint plus `▲` or `▼`, with accessible text explaining the direction.
Higher or lower is a measurement, not automatically a better racket. Missing values use
`—` with an accessible explanation and remain excluded from numeric rankings. Identical
rows may group under “same across all,” with readable text and an operable reveal control.

## Motion, accessibility, and delivery

Use brief fades and small state transitions: about 130ms for immediate feedback, 240ms
for normal changes, and up to 380ms for page transitions, with
`cubic-bezier(0.16, 1, 0.3, 1)`. Artwork provides the energy; controls stay steady.
Prefer border and background changes for card hover. Preserve stateful islands and
comparison selections across Astro View Transitions.

Respect `prefers-reduced-motion`, retain the skip link and visible focus rings, and make
every compare, variant, filter, and theme control keyboard accessible. Aim for 44px
standalone touch targets. State and classification must remain understandable without
color. Recheck WCAG AA contrast for text, focus, control boundaries, selected cells,
hover states, and both themes as the proposed tokens reach components.

Keep the existing mobile performance budgets from `product.md`: LCP under 2 seconds,
JavaScript under 120KB gzipped, and Lighthouse performance at least 90. Serve responsive
optimized images with explicit dimensions, lazy-load below the fold, and prioritize the
actual hero image. Keep the brochure PDF as a reference asset rather than a page-load
dependency.

## Implementation review criteria

- The first screen visibly connects to OGKILS through its logo, athletic typography,
  authentic product imagery, and turquoise accents.
- Catalogue pages read as white product stages with clear hierarchy and thin rules.
- Comparison surfaces visibly echo the brochure's turquoise and pale aqua tables.
- Campaign artwork retains each model's character while the interface stays consistent.
- Mobile reading, meaningful differences, saved theme choice, keyboard access, and the
  site's compare → recommend → outbound purchase flow remain usable.

Primary implementation touchpoints are `src/styles/global.css`, `src/layouts/Base.astro`,
`Header`, `Footer`, `RacketCard`, `RacketImage`, `ClassificationBadge`, `SpecRow`,
`StaticCompareTable`, the homepage, and the interactive islands. Keep these surfaces in
sync when the brochure-led design system evolves.
