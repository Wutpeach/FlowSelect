"""Fast Python simulator of the Paper-informed Ameow heatmap field model.
Renders 7 phase frames to PNG for rapid iteration before porting to GLSL.

Paper heatmap.ts anchors (packages/shaders/src/shaders/heatmap.ts):
- inner/outer composition L229-232; contour L231
- shadow subtraction L235-242 (3 phase offsets t, t+1/3, t+2/3 at L223-225)
- inner substrate .8 + .8*innerBlur L234; *= (1-shape) L245
- outer animated band L250-262 (y-modulated mask at ~3x speed)
- heat = clamp(inner+outer) L265; palette mixer heat*count L266+
"""
import math
import os

from PIL import Image

OUT = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-mech-sim"
os.makedirs(OUT, exist_ok=True)

R = 0.08  # corner radius 16/200
H = 0.5 - R


def clamp01(x):
    return min(max(x, 0.0), 1.0)


def smoothstep(e0, e1, x):
    t = clamp01((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def rounded_boundary(uv):
    qb = (abs(uv[0] - 0.5) - H, abs(uv[1] - 0.5) - H)
    out = math.hypot(max(qb[0], 0.0), max(qb[1], 0.0))
    out += min(max(qb[0], qb[1]), 0.0)
    return out - R


def noise2(p):
    # sine-free value noise (same as Ameow heatmapNoise)
    def h(ix, iy):
        v = math.fmod(math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123, 1.0)
        return abs(v)
    i = (math.floor(p[0]), math.floor(p[1]))
    f = (p[0] - i[0], p[1] - i[1])
    u = (f[0] * f[0] * (3 - 2 * f[0]), f[1] * f[1] * (3 - 2 * f[1]))
    a = h(i[0], i[1])
    b = h(i[0] + 1, i[1])
    c = h(i[0], i[1] + 1)
    d = h(i[0] + 1, i[1] + 1)
    return a + (b - a) * u[0] + (c - a) * u[1] + (a - b - c + d) * u[0] * u[1]


def cool_mask(uv, tau, instance):
    """Smooth anisotropic moving subtractive eraser (Paper shadowShape analog).
    Very large at the cycle ends (union covers the whole window -> only small
    warm gaps at onset/exit), small mid-cycle (reveals interior growth).
    Each instance has its own lateral drift/rotation so the three masks stay
    asymmetric and intersect rather than stack."""
    t = clamp01(tau)
    # path: cycles bottom -> center -> top -> center -> bottom over its own
    # phase, so at any time the three offset copies are spread around the
    # window; at mid-cycle they hug the centre (carving the cool cavity) while
    # leaving the top/bottom and sides revealed (onset at top, exit at bottom).
    cy = 0.5 + 0.42 * math.cos(tau * 2 * math.pi + instance * 0.35)
    cx = 0.5 + 0.24 * math.sin(tau * 2 * math.pi + instance * 2.094)
    grow = math.sin(t * math.pi)
    r = 0.12 + 0.34 * math.pow(1.0 - grow, 1.5)
    a = 0.4 * math.sin(tau * 2 * math.pi + instance * 2.094)
    dx = uv[0] - cx
    dy = uv[1] - cy
    rx = dx * math.cos(a) - dy * math.sin(a)
    ry = dx * math.sin(a) + dy * math.cos(a)
    sx = 1.0 + 0.6 * math.sin(tau * 2 * math.pi + instance * 2.094)
    sy = 1.0 - 0.6 * math.sin(tau * 2 * math.pi + instance * 2.094)
    e = math.hypot(rx / sx, ry / sy)
    return 1.0 - smoothstep(r * 0.6, r * 1.4, e)


def heatmap_render(p, time, size=256):
    w = h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    energy = smoothstep(0.0, 0.09, p) * (1.0 - smoothstep(0.86, 0.97, p))
    for j in range(h):
        for i in range(w):
            uv = (i / w, j / h)
            bd = rounded_boundary(uv)
            if bd > 0.0:
                px[i, j] = (4, 6, 14)
                continue
            depth = -bd
            # broad interior energy field (Paper innerBlur-near-shape-edge analog):
            # a warm ring sits mid-interior, cooling toward both the boundary
            # (no hot frame) and the center (a soft caldera void, Paper's shape-
            # interior void analog). The erasers below morph it asymmetrically.
            ring = math.exp(-pow((depth - 0.24) * 5.0, 2.0))
            swell = 0.5 + 0.5 * noise2((uv[0] * 1.6 + time * 0.03, uv[1] * 1.6 - time * 0.02))
            substrate = 0.15 + 0.62 * ring * (0.72 + 0.28 * swell)
            substrate = clamp01(substrate)
            # three phase-offset subtractive masks (Paper L235-242 analog)
            m0 = cool_mask(uv, math.fmod(p, 1.0), 0)
            m1 = cool_mask(uv, math.fmod(p + 1.0 / 3.0, 1.0), 1)
            m2 = cool_mask(uv, math.fmod(p + 2.0 / 3.0, 1.0), 2)
            heat = substrate
            heat = heat * (1.0 - m0)
            heat = heat * (1.0 - m1)
            heat = heat * (1.0 - m2)
            # boundary/halo relation: thin inward band, lit ONLY where a narrow
            # arc passes (Paper outer animatedMask analog) -> a localized glow
            # that starts at the top edge (onset), sweeps down and widens
            # (shell growth), then settles at the bottom (exit). Never a frame.
            band = smoothstep(-0.05, 0.0, bd) if bd <= 0 else 0.0
            uvf = 1.0 - uv[1]
            bandPos = p
            halfW = 0.03 + 0.12 * (smoothstep(0.10, 0.50, p) * (1.0 - smoothstep(0.50, 0.90, p)))
            yb = math.fmod(uvf - bandPos, 1.0)
            dband = abs(math.fmod(yb + 0.5, 1.0) - 0.5)
            animated = 1.0 - smoothstep(halfW * 0.5, halfW, dband)
            halo = band * animated * 0.55 * (0.35 + 0.65 * ring)
            # contour relation: crisp boundary emphasis, only where the masks
            # do not cover it (partial by construction)
            contour = band * (1.0 - m0 * m1 * m2) * 0.22
            heat = clamp01(heat + halo + contour)
            heat *= energy
            # palette: navy -> deep blue -> vivid blue -> light blue/cyan ->
            # yellow -> orange -> red-orange
            stops = [0.0, 0.13, 0.27, 0.41, 0.55, 0.69, 0.84, 1.0]
            colors = [
                (2, 3, 10),
                (10, 26, 102),
                (23, 66, 204),
                (46, 148, 235),
                (250, 214, 77),
                (255, 140, 41),
                (255, 97, 28),
                (255, 66, 20),
            ]
            idx = 0
            c = colors[0]
            for k in range(len(stops) - 1):
                if heat > stops[k]:
                    idx = k
            c = colors[idx]
            t = 0.0
            if idx < len(stops) - 1:
                t = clamp01((heat - stops[idx]) / (stops[idx + 1] - stops[idx]))
                c = tuple(round(colors[idx][q] + (colors[idx + 1][q] - colors[idx][q]) * t) for q in range(3))
            px[i, j] = c
    return img


if __name__ == "__main__":
    phases = [(0.05, "f1"), (0.18, "f2"), (0.30, "f3"), (0.44, "f4"), (0.58, "f5"), (0.70, "f6"), (0.86, "f7")]
    for p, name in phases:
        img = heatmap_render(p, p * 10.0)
        img.save(os.path.join(OUT, name + ".png"))
        print("saved", name, "p=", p)
