# Pixel perimeter analysis: prove no frame has a contiguous 100% hot rounded
# perimeter, and report center coolness per frame.
from PIL import Image
import os

D = r"D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx\.trellis\tasks\08-15-mr9-fullscreen-activation-fx-progress-visual-refinement\research\mr9-mechanics-adaptation"
NAMES = ["f1-onset", "f2-growth", "f3-shell", "f4-cavity", "f5-perimeter", "f6-peak", "f7-contract", "reduced"]


def hot(p):
    return p[0] > 180 and p[1] > 80 and p[0] > p[2] + 60


for n in NAMES:
    im = Image.open(os.path.join(D, n + ".png")).convert("RGB")
    w, h = im.size
    px = im.load()
    hh = 0.42 * w
    r = 0.08 * w
    total = 0
    hotc = 0
    for j in range(0, h, 2):
        for i in range(0, w, 2):
            qx = abs(i + 0.5 - 0.5 * w) - hh
            qy = abs(j + 0.5 - 0.5 * h) - hh
            bd = (max(qx, 0.0) ** 2 + max(qy, 0.0) ** 2) ** 0.5 + min(max(qx, qy), 0.0) - r
            if -14 <= bd <= -4:
                total += 1
                if hot(px[i, j]):
                    hotc += 1
    ctot = 0
    chot = 0
    for j in range(0, h, 2):
        for i in range(0, w, 2):
            dx = i + 0.5 - 0.5 * w
            dy = j + 0.5 - 0.5 * h
            if dx * dx + dy * dy < 34 * 34:
                ctot += 1
                if hot(px[i, j]):
                    chot += 1
    print(
        f"{n:12s} boundaryHotRing {hotc}/{total} = {100*hotc/max(total,1):.1f}%   "
        f"centerHot {100*chot/max(ctot,1):.1f}%"
    )
