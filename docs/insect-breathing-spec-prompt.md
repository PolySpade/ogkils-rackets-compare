# ChatGPT prompt — extract Insect Breathing specs from product photos

Paste everything below the line into ChatGPT **together with the Insect Breathing
photos** (the spec-sheet / decal / packaging shots, not just the beauty renders).

The output maps 1:1 onto the columns of `Product_Database_Racket_Specs.xlsx`, which
`scripts/build_rackets_json.py` reads. Paste the returned table row into the sheet,
then:

```bash
python3 scripts/build_rackets_json.py <path-to>/Product_Database_Racket_Specs.xlsx data/rackets.generated.json
node scripts/import-commerce.mjs --snapshot   # picks up price, stock, buy link, image
pnpm validate && pnpm test && pnpm build
```

You'll also want an `aliases` line in `data/rackets.overrides.json`
(`"insect-breathing": { "aliases": ["insect", "bug"] }`) so the site assistant matches it.

---

You are helping me transcribe badminton racket specifications from product photos
into a spreadsheet. Accuracy matters far more than completeness — this data goes on
a public spec-comparison site, so a wrong number is much worse than a blank.

**The racket:** OGKILS "Insect Breathing" (虫之呼吸), part of our Breathing series.

**What I already know from our Shopify listing — treat these as fixed, do not change them:**
- Model Name: `Insect Breathing`
- Model code: `INSECT BREATHING`
- Performance Classification: `SPEED`
- Ships in weight classes 5U and 6U, grip size G6 only
- Colourways: Purple-White, Green-White, Blue-White
- Price: ₱5,500

**Your job:** read the attached photos and fill in the remaining specs. The photos
are Chinese-market spec decals, shaft/frame printing, and packaging inserts —
translate any Chinese labels. Units are mm, grams, lbs, and kg/cm².

## Rules

1. **Never guess or infer a number.** If a value isn't legibly printed in a photo,
   write exactly `NOT SPECIFIED`. Do not estimate from the racket's appearance, do
   not copy typical values for similar rackets, do not interpolate.
2. If a value is legible but you're under ~90% sure of a digit, still write
   `NOT SPECIFIED` and mention it in the confidence notes.
3. Some specs differ per weight class. When they do, use the prefixed format
   `5U: <value>, 6U: <value>`. When one value covers both, just write the value.
4. Reproduce the printed format, including the `±` tolerances and the word in
   parentheses — don't normalise or round.

## Formatting conventions (match these exactly)

| Field | Example | Notes |
|---|---|---|
| Weight (g) | `5U: 75-79.9, 6U: 70-74.9` | printed range per class |
| Balance Point | `5U: 296±3mm, 6U: 299±3mm` | keep the `±` tolerance |
| Swing Weight (kg/cm²) | `5U: 87±2, 6U: 85±2` | keep the `±` tolerance |
| Maximum Tension (LBS) | `5U: ≤30, 6U: ≤28` | keep `≤` |
| Stiffness | `8.2-8.5 (Stiff)` | numeric range then the printed word |
| Stiffness (in words) | `Stiff` | one of: Soft, Slightly Soft, Medium, Slightly Stiff, Stiff, Extra Stiff |
| Hole Count | `76 Slanted Hole` | count plus the hole-type wording |
| Shaft Specifications (Diameter) | `6.6mm` | |
| Frame Area (cm²) | `351.34` | number only |
| Grip Length (mm) | `209` | number only |
| Racket Length (mm) | `675` | number only |
| Weight Class | `Head-Light` | balance label — exactly one of: Head-Heavy, Head-Light, Even Balance |
| Materials | `VIBRANIUM + M46X High Modulus Carbon Fiber` | as printed, joined with ` + ` |
| Weight / Grip Size (Specs) | `5U: G6, 6U: G6` | |

> Note: the column is confusingly called **"Weight Class"** but it holds the
> *balance* label (Head-Heavy / Head-Light / Even Balance), not 5U/6U.

## Output

Give me three things:

**1. A markdown table** with exactly these 16 columns, in this order, one data row:

`Model Name | Model | Performance Classification | Weight Class | Materials | Shaft Specifications (Diameter) | Stiffness | Stiffness (in words) | Hole Count | Frame Area (cm²) | Grip Length (mm) | Racket Length (mm) | Weight (g) | Weight / Grip Size (Specs) | Balance Point | Maximum Tension (LBS) | Swing Weight (kg/cm²)`

**2. The same data as JSON**, keys exactly as above, `null` for anything you marked
`NOT SPECIFIED`.

**3. Confidence notes** — a short bullet per field you filled in, saying which photo
you read it from and how legible it was. Then list every field you left blank and
what photo would let me fill it (e.g. "need a clear shot of the shaft decal").

Do not add any field I didn't ask for, and do not write marketing copy.
