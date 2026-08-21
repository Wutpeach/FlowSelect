from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).parent / (sys.argv[1] if len(sys.argv) > 1 else "thermal-refraction")
EVIDENCE = ROOT / "evidence"
PHASES = [("k010", "early frontier"), ("k025", "developed"), ("k035", "developed later"), ("k050", "late sweep"), ("reduced", "reduced motion")]


def mean_difference(left: Image.Image, right: Image.Image, predicate) -> tuple[float, int]:
    a = left.convert("RGB")
    b = right.convert("RGB")
    total = 0
    count = 0
    for source, target in zip(a.getdata(), b.getdata()):
        if predicate(source):
            total += sum(abs(x - y) for x, y in zip(source, target)) / 3
            count += 1
    return (total / count if count else 0.0, count)


rows = []
analysis = {}
for phase, label in PHASES:
    baseline = Image.open(EVIDENCE / f"baseline-{phase}.png").convert("RGB")
    refraction = Image.open(EVIDENCE / f"refraction-{phase}.png").convert("RGB")
    difference = ImageChops.difference(baseline, refraction).point(lambda value: min(value * 6, 255))
    rows.append((label, baseline, refraction, difference))
    analysis[phase] = {
        "warm_mean_rgb_delta": mean_difference(baseline, refraction, lambda p: p[0] > 150 and p[0] > p[2] * 1.15),
        "cool_mean_rgb_delta": mean_difference(baseline, refraction, lambda p: p[2] > 75 and p[2] > p[0] * 1.25),
        "dark_mean_rgb_delta": mean_difference(baseline, refraction, lambda p: sum(p) / 3 < 45),
    }

cell_w, cell_h = rows[0][1].size
header_h = 38
label_w = 150
sheet = Image.new("RGB", (label_w + cell_w * 3, header_h + cell_h * len(rows)), (24, 22, 29))
draw = ImageDraw.Draw(sheet)
refraction_title = "Repaired Refraction" if ROOT.name.endswith("repair") else "Thermal Refraction"
for column, title in enumerate(("Accepted baseline", refraction_title, "Difference x6")):
    draw.text((label_w + column * cell_w + 8, 12), title, fill=(235, 231, 240))
for row, (label, baseline, refraction, difference) in enumerate(rows):
    y = header_h + row * cell_h
    draw.text((10, y + 14), label, fill=(205, 198, 216))
    sheet.paste(baseline, (label_w, y))
    sheet.paste(refraction, (label_w + cell_w, y))
    sheet.paste(difference, (label_w + cell_w * 2, y))

sheet.save(ROOT / "baseline-vs-refraction.png")
(EVIDENCE / "analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")

if len(sys.argv) > 2:
    previous_name = sys.argv[2] if len(sys.argv) > 2 else "thermal-refraction"
    previous_root = ROOT.parent / previous_name / "evidence"
    repair_rows = []
    repair_analysis = {}
    for phase, label in PHASES:
        before = Image.open(previous_root / f"refraction-{phase}.png").convert("RGB")
        repaired = Image.open(EVIDENCE / f"refraction-{phase}.png").convert("RGB")
        baseline = Image.open(EVIDENCE / f"baseline-{phase}.png").convert("RGB")
        difference = ImageChops.difference(before, repaired).point(lambda value: min(value * 4, 255))
        repair_rows.append((label, before, repaired, difference))
        cool_mask = [p[2] > 75 and p[2] > p[0] * 1.25 for p in baseline.getdata()]
        before_luma = [sum(p) / 3 for p, keep in zip(before.getdata(), cool_mask) if keep]
        repaired_luma = [sum(p) / 3 for p, keep in zip(repaired.getdata(), cool_mask) if keep]
        repair_analysis[phase] = {
            "before_to_repair_warm_mean_rgb_delta": mean_difference(before, repaired, lambda p: p[0] > 150 and p[0] > p[2] * 1.15),
            "before_to_repair_cool_mean_rgb_delta": mean_difference(before, repaired, lambda p: p[2] > 75 and p[2] > p[0] * 1.25),
            "before_to_repair_dark_mean_rgb_delta": mean_difference(before, repaired, lambda p: sum(p) / 3 < 45),
            "cool_luma_stddev_before": statistics.pstdev(before_luma),
            "cool_luma_stddev_repaired": statistics.pstdev(repaired_luma),
        }

    repair_sheet = Image.new("RGB", (label_w + cell_w * 3, header_h + cell_h * len(repair_rows)), (24, 22, 29))
    repair_draw = ImageDraw.Draw(repair_sheet)
    for column, title in enumerate(("Before repair", "Repaired Refraction", "Repair delta x4")):
        repair_draw.text((label_w + column * cell_w + 8, 12), title, fill=(235, 231, 240))
    for row, (label, before, repaired, difference) in enumerate(repair_rows):
        y = header_h + row * cell_h
        repair_draw.text((10, y + 14), label, fill=(205, 198, 216))
        repair_sheet.paste(before, (label_w, y))
        repair_sheet.paste(repaired, (label_w + cell_w, y))
        repair_sheet.paste(difference, (label_w + cell_w * 2, y))
    repair_sheet.save(ROOT / "before-vs-repair.png")
    (EVIDENCE / "repair-analysis.json").write_text(json.dumps(repair_analysis, indent=2), encoding="utf-8")
