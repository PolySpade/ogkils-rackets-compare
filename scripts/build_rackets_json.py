#!/usr/bin/env python3
"""
Normalize Product_Database_Racket_Specs.xlsx -> data/rackets.json

Usage:
    python build_rackets_json.py <input.xlsx> <output.json>

The source sheet stores several specs as free text with per-weight-class
prefixes ("3U: <=31, 4U: <=30"). This script explodes those into a
`variants` array so the site can filter/sort numerically.
"""

import json
import re
import sys
import unicodedata

import pandas as pd

WEIGHT_CLASS_RANGES = {
    "2U": [90.0, 94.9],
    "3U": [85.0, 89.9],
    "4U": [80.0, 84.9],
    "5U": [75.0, 79.9],
    "6U": [70.0, 74.9],
}

BALANCE_MAP = {
    "head-heavy": "Head-Heavy",
    "head heavy": "Head-Heavy",
    "head-light": "Head-Light",
    "head light": "Head-Light",
    "even balance": "Even Balance",
}

STIFFNESS_ORDER = ["Soft", "Slightly Soft", "Medium", "Slightly Stiff", "Stiff", "Extra Stiff"]


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = unicodedata.normalize("NFKC", str(v)).replace("\u2264", "<=")
    s = re.sub(r"\s+", " ", s).strip()
    if s == "" or s.lower() in {"not specified", "n/a", "na", "-"}:
        return None
    return s


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def split_by_class(value):
    """'3U: <=31, 4U: <=30' -> {'3U': '<=31', '4U': '<=30'}; plain value -> {'*': value}"""
    v = clean(value)
    if v is None:
        return {}
    if not re.search(r"\d\s*U\s*:", v):
        return {"*": v}
    out = {}
    parts = re.split(r",(?=\s*\d\s*U\s*:)", v)
    for part in parts:
        m = re.match(r"\s*(\d\s*U)\s*:?\s*(.*)", part)
        if m:
            out[re.sub(r"\s+", "", m.group(1)).upper()] = m.group(2).strip()
    return out


def first_float(s):
    if s is None:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else None


def parse_pm(s):
    """'296+/-3mm' -> (296.0, 3.0)"""
    if s is None:
        return None, None
    s = s.replace("\u00b1", "+-")
    m = re.search(r"(\d+(?:\.\d+)?)\s*\+-\s*(\d+(?:\.\d+)?)", s)
    if m:
        return float(m.group(1)), float(m.group(2))
    return first_float(s), None


def parse_stiffness(raw):
    """'8.2-8.5 (Stiff)' -> (8.2, 8.5, 8.35, 'Stiff')"""
    v = clean(raw)
    if v is None:
        return None, None, None, None
    v = re.sub(r"^\s*\d\s*U(?:/\d\s*U)*\s*:\s*", "", v)
    word = None
    wm = re.search(r"\(([^)]+)\)", v)
    if wm:
        word = wm.group(1).strip().title()
    rm = re.search(r"(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)", v)
    if rm:
        lo, hi = float(rm.group(1)), float(rm.group(2))
        return lo, hi, round((lo + hi) / 2, 2), word
    if word is None and re.search(r"[A-Za-z]", v):
        word = v.title()
    return None, None, None, word


def grips_for_class(grip_spec, wc):
    """'3UG5, 4UG5, 4UG6' + '4U' -> ['G5','G6']"""
    v = clean(grip_spec) or ""
    grips = []
    for token in re.split(r"[,/]", v):
        token = token.strip().upper().replace(" ", "")
        if re.match(rf"^{wc}(G\d)$", token):
            grips.append(re.match(rf"^{wc}(G\d)$", token).group(1))
        elif re.match(r"^G\d$", token) and grips:
            grips.append(token)
    seen, out = set(), []
    for g in grips:
        if g not in seen:
            seen.add(g)
            out.append(g)
    return out


def detect_classes(row):
    """Weight classes this model ships in, from the grip-spec / weight columns."""
    found = set()
    for col in ["Weight / Grip Size (Specs)", "Weight (g)", "Balance Point",
                "Maximum Tension (LBS)", "Swing Weight (kg/cm\u00b2)"]:
        v = clean(row.get(col)) or ""
        for m in re.finditer(r"\b(\d)\s*U\b", v):
            found.add(f"{m.group(1)}U")
    return sorted(found, key=lambda c: int(c[0]))


def build(xlsx_path):
    df = pd.read_excel(xlsx_path, sheet_name=0)
    rackets = []

    for _, r in df.iterrows():
        row = {c: r[c] for c in df.columns}
        name = clean(row["Model Name"])
        if not name:
            continue
        code = clean(row["Model"]) or name.upper()

        balance_raw = (clean(row["Weight Class"]) or "").lower()
        balance = BALANCE_MAP.get(balance_raw, clean(row["Weight Class"]))
        classification = (clean(row["Performance Classification"]) or "").upper().replace("ALL-AROUND", "ALL-AROUND")

        s_lo, s_hi, s_mid, s_word_inline = parse_stiffness(row["Stiffness"])
        stiffness_word = clean(row["Stiffness (in words)"]) or s_word_inline

        materials_raw = clean(row["Materials"]) or ""
        materials = [m.strip() for m in re.split(r"\+", materials_raw) if m.strip()]

        tension_by_class = split_by_class(row["Maximum Tension (LBS)"])
        weight_by_class = split_by_class(row["Weight (g)"])
        swing_by_class = split_by_class(row["Swing Weight (kg/cm\u00b2)"])
        balance_by_class = split_by_class(row["Balance Point"])

        classes = detect_classes(row)
        variants = []
        for wc in classes:
            tension = first_float(tension_by_class.get(wc) or tension_by_class.get("*"))
            wtxt = weight_by_class.get(wc) or weight_by_class.get("*")
            wrange = None
            if wtxt:
                nums = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)", wtxt)]
                if len(nums) >= 2:
                    wrange = [nums[0], nums[1]]
            if wrange is None:
                wrange = WEIGHT_CLASS_RANGES.get(wc)

            bp_txt = balance_by_class.get(wc) or balance_by_class.get("*")
            bp, bp_tol = parse_pm(bp_txt)

            sw_txt = swing_by_class.get(wc) or swing_by_class.get("*")
            sw, sw_tol = parse_pm(sw_txt)
            # Data-quality guard: a few rows repeat the balance point in the
            # swing-weight column. Swing weight is ~80-95; balance point ~290-315.
            sw_suspect = sw is not None and sw > 150
            if sw_suspect:
                sw, sw_tol = None, None

            variants.append({
                "weightClass": wc,
                "weightRangeG": wrange,
                "weightMidG": round(sum(wrange) / 2, 1) if wrange else None,
                "gripSizes": grips_for_class(row["Weight / Grip Size (Specs)"], wc),
                "maxTensionLbs": tension,
                "balancePointMm": bp,
                "balancePointToleranceMm": bp_tol,
                "swingWeight": sw,
                "swingWeightTolerance": sw_tol,
                "swingWeightMissing": sw is None,
            })

        rackets.append({
            "id": slugify(name),
            "name": name,
            "modelCode": code,
            "series": "Breathing" if "BREATHING" in code.upper() else ("LD" if code.upper().startswith("LD") else "Other"),
            "classification": classification or None,
            "balance": balance,
            "materials": materials,
            "materialsRaw": materials_raw or None,
            "shaftDiameterMm": first_float(clean(row["Shaft Specifications (Diameter)"])),
            "shaftNote": clean(row["Shaft Specifications (Diameter)"]),
            "stiffness": {
                "word": stiffness_word,
                "rangeLow": s_lo,
                "rangeHigh": s_hi,
                "value": s_mid,
                "raw": clean(row["Stiffness"]),
            },
            "frameHoleCount": int(first_float(clean(row["Hole Count"])) or 0) or None,
            "frameHoleType": clean(row["Hole Count"]),
            "frameAreaCm2": first_float(clean(row["Frame Area (cm\u00b2)"])),
            "gripLengthMm": first_float(clean(row["Grip Length (mm)"])),
            "racketLengthMm": first_float(clean(row["Racket Length (mm)"])),
            "variants": variants,
            # --- fields to be filled in manually / from Shopify ---
            "tagline": None,
            "description": None,
            "pricePhp": None,
            "images": [],
            "inStock": True,
            "links": {
                "shopify": None,
                "shopee": None,
                "lazada": None,
                "tiktok": None,
            },
        })

    return {
        "schemaVersion": 1,
        "source": "Product_Database_Racket_Specs.xlsx",
        "count": len(rackets),
        "rackets": rackets,
    }


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "Product_Database_Racket_Specs.xlsx"
    dst = sys.argv[2] if len(sys.argv) > 2 else "rackets.json"
    data = build(src)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote {data['count']} rackets -> {dst}")
