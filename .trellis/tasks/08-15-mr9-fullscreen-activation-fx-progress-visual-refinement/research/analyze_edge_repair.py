# MR9 edge-repair capture analysis: pixel buckets + boundary-contact metrics.
# Mirrors the archived baseline analysis approach (mr9-rounded-boundary-edge-
# capture-spike.md): warm/core/cool/dark buckets and the boundary-band lit
# fraction, so the repaired field can be compared to the archived numbers
# (pre-contact boundary-lit 0.0%; post-contact 20.6-26.6% = localized patches,
# never a full perimeter ring).
import glob
import json
import os

from PIL import Image

TASK = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement"
EVID = f"{TASK}/research/mr9-edge-repair/evidence"
R = 0.08
H = 0.5 - R


def rounded_bd(x, y, w, h):
    # pixel -> normalized uv
    ux = (x + 0.5) / w
    uy = (y + 0.5) / h
    qx = abs(ux - 0.5) - H
    qy = abs(uy - 0.5) - H
    import math
    d = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - R
    return d


def classify(px):
    r, g, b = px[0] / 255.0, px[1] / 255.0, px[2] / 255.0
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    # dark void / navy (measured void pixel ~ (19,18,24) -> lum ~0.073)
    if lum < 0.10:
        return "dark"
    # hot red-orange
    if r > 0.55 and g < 0.62 and b < 0.45 and r > g:
        return "hot"
    # warm yellow/orange
    if r > 0.45 and g > 0.28 and b < 0.55 and r > b and g > b * 0.6:
        return "warm"
    # cool blue/cyan (blue dominant)
    if b > r and b > 0.12:
        return "cool"
    return "other"


def analyze(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    buckets = {"dark": 0, "hot": 0, "warm": 0, "cool": 0, "other": 0}
    total = 0
    boundary_lit = 0
    boundary_warm = 0
    boundary_total = 0
    maxbright = 0
    for y in range(h):
        for x in range(w):
            bd = rounded_bd(x, y, w, h)
            if bd > 0.0:
                continue  # outside rounded window (rounded corners)
            total += 1
            p = px[x, y]
            lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255.0
            maxbright = max(maxbright, lum)
            buckets[classify(p)] += 1
            # boundary band: 0 >= bd >= -0.05 (inward ~10px of the shell)
            if bd >= -0.05:
                boundary_total += 1
                # lit = clearly above the navy void (~lum 0.073), i.e. the
                # localized contact capture / field, not the dark boundary.
                if lum > 0.15:
                    boundary_lit += 1
                # warm capture only (hot or warm classification): this is the
                # localized contact capture, distinct from the cool body.
                if classify(p) in ("hot", "warm"):
                    boundary_warm += 1
    n = max(total, 1)
    return {
        "file": os.path.basename(path),
        "size": f"{w}x{h}",
        "total_inside": total,
        "dark_frac": round(buckets["dark"] / n, 4),
        "cool_frac": round(buckets["cool"] / n, 4),
        "warm_frac": round(buckets["warm"] / n, 4),
        "hot_frac": round(buckets["hot"] / n, 4),
        "other_frac": round(buckets["other"] / n, 4),
        "boundary_lit_frac": round(boundary_lit / max(boundary_total, 1), 4),
        "boundary_warm_frac": round(boundary_warm / max(boundary_total, 1), 4),
        "boundary_total": boundary_total,
        "boundary_lit": boundary_lit,
        "boundary_warm": boundary_warm,
        "max_brightness": round(maxbright, 1),
    }


results = []
for path in sorted(glob.glob(f"{EVID}/*.png")):
    results.append(analyze(path))

print(json.dumps(results, indent=2))
with open(f"{EVID}/analysis.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
