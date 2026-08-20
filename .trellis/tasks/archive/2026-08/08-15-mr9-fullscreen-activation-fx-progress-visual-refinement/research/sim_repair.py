# MR9 core-removal repair — GLSL cross-check simulator (repair mode only).
# Mirrors the exact GLSL of ExpandedPresentationSurface.tsx heatmapOutput after
# the synthetic-core removal: full rounded-window surface texture (R=shape,
# G=big blur, B=small blur, A=255), three phase-offset subtractive shadows,
# weight-0 outer/contour, rimEdgeFade, 8-stop premultiplied palette. Renders
# Frame 2-5 + reduced into mr9-core-removal/simrep-*.png and prints the same
# warm/maxbright stats the real browser captures use. "Before" evidence comes
# from the real browser literal captures (research/mr9-literal-fidelity/), not
# this sim; no literal mode is kept here.
import math
import os
import sys

RES = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RES, "mr9-core-removal")
os.makedirs(OUT, exist_ok=True)

SIZE = 256
CORNER = 0.08          # 16/200 normalized Main Window corner radius
BIG_FRAC = 0.12        # HEATMAP_BIG_BLUR_FRAC
BIG_PASSES = 3
SMALL_FRAC = 0.12      # smallRadius = round(0.12 * bigRadius)

def clamp(x, a, b): return max(a, min(b, x))
def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
def lst(e0, e1, x): return clamp((x - e0) / (e1 - e0), 0, 1)
def fract(x): return x - math.floor(x)
def mix(a, b, t): return a * (1 - t) + b * t
def sst(e0, e1, x): return smoothstep(e0, e1, x)

def rasterize_window_surface():
    """FULL rounded Main Window surface: the only legal Ameow geometry."""
    gray = [0] * (SIZE * SIZE)
    hx = 0.5 - CORNER
    for y in range(SIZE):
        for x in range(SIZE):
            px = (x + 0.5) / SIZE - 0.5
            py = (y + 0.5) / SIZE - 0.5
            qx = abs(px) - hx
            qy = abs(py) - hx
            bd = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - CORNER
            gray[y * SIZE + x] = int(round(255 * clamp(0.5 - bd * SIZE, 0, 1)))
    return gray

def box_blur(gray, radius):
    if radius <= 0:
        return gray[:]
    out = [0] * (SIZE * SIZE)
    integ = [0] * (SIZE * SIZE)
    for y in range(SIZE):
        row = 0
        for x in range(SIZE):
            row += gray[y * SIZE + x]
            integ[y * SIZE + x] = row + (integ[(y - 1) * SIZE + x] if y > 0 else 0)
    for y in range(SIZE):
        y1 = max(0, y - radius)
        y2 = min(SIZE - 1, y + radius)
        for x in range(SIZE):
            x1 = max(0, x - radius)
            x2 = min(SIZE - 1, x + radius)
            A = integ[y2 * SIZE + x2]
            B = integ[y2 * SIZE + (x1 - 1)] if x1 > 0 else 0
            C = integ[(y1 - 1) * SIZE + x2] if y1 > 0 else 0
            D = integ[(y1 - 1) * SIZE + (x1 - 1)] if (x1 > 0 and y1 > 0) else 0
            area = (x2 - x1 + 1) * (y2 - y1 + 1)
            out[y * SIZE + x] = int(round((A - B - C + D) / area))
    return out

def multi(gray, radius, passes):
    inp = gray[:]
    for _ in range(passes):
        inp = box_blur(inp, radius)
    return inp

core = rasterize_window_surface()
bigR = max(1, round(BIG_FRAC * SIZE))
smallR = max(1, round(SMALL_FRAC * bigR))
shape = multi(core, 5, 1)
big = multi(core, bigR, BIG_PASSES)
small = multi(core, smallR, BIG_PASSES)

def tex(uv, channel):
    t = (uv[0] * (SIZE - 1), uv[1] * (SIZE - 1))
    x0 = int(t[0]); y0 = int(t[1])
    fx = t[0] - x0; fy = t[1] - y0
    x0 = clamp(x0, 0, SIZE - 1); y0 = clamp(y0, 0, SIZE - 1)
    x1 = clamp(x0 + 1, 0, SIZE - 1); y1 = clamp(y0 + 1, 0, SIZE - 1)
    arr = [shape, big, small][channel]
    def g(x, y): return arr[y * SIZE + x] / 255.0
    return mix(mix(g(x0, y0), g(x1, y0), fx), mix(g(x0, y1), g(x1, y1), fx), fy)

def circle(uv, c, r):
    return 1.0 - smoothstep(r[0], r[1], math.dist(uv, c))

def heatmapShadow(uv, t, contour):
    scaledUV = [uv[0], uv[1]]
    posY = mix(-1.0, 2.0, t)
    scaledUV[1] -= 0.5
    mainCircleScale = sst(0.0, 0.8, posY) * lst(1.4, 0.9, posY)
    scaledUV[1] *= (1.0 + 1.5 * mainCircleScale)
    scaledUV[1] += 0.5
    innerR = 0.4
    outerR = 1.0 - 0.3 * (sst(0.1, 0.2, t) * (1.0 - sst(0.2, 0.5, t)))
    s = circle(scaledUV, [0.5, posY - 0.2], [innerR, outerR])
    s = pow(s, 1.4)
    s *= 1.2
    pos = posY - uv[1]
    edge = 1.2
    topFlattener = lst(-0.4, 0.0, pos) * (1.0 - sst(0.0, edge, pos))
    topFlattener = pow(topFlattener, 3.0)
    topFlattenerMixer = 1.0 - sst(0.0, 0.3, pos)
    s = mix(topFlattener, s, topFlattenerMixer)
    return clamp(s, 0.0, 1.0)

def rounded_boundary(uv):
    halfSize = 0.5 - CORNER
    qb0 = abs(uv[0] - 0.5) - halfSize
    qb1 = abs(uv[1] - 0.5) - halfSize
    return math.hypot(max(qb0, 0), max(qb1, 0)) + min(max(qb0, qb1), 0) - CORNER

def rim_edge_fade(uv):
    return smoothstep(0.0, 0.10, -rounded_boundary(uv))

HEAT_ALPHA = [0.00, 0.65, 0.90, 1.00, 1.00, 1.00, 1.00, 1.00]
HEAT_COLOR = [
    (0.008, 0.012, 0.038), (0.040, 0.100, 0.400), (0.090, 0.260, 0.800),
    (0.180, 0.580, 0.920), (0.980, 0.840, 0.300), (1.000, 0.550, 0.160),
    (1.000, 0.380, 0.110), (1.000, 0.260, 0.080)]

def hash1(uv):
    return fract(math.sin(uv[0] * 12.9898 + uv[1] * 78.233) * 43758.5453123)

def heatmap_output(uv, p):
    """Repair composition: window-as-shape, contour/outer at weight 0."""
    img = [tex(uv, 0), tex(uv, 1), tex(uv, 2)]
    shape_v = img[0]
    innerBlur = mix(img[1], 0.0, shape_v)
    shadow = heatmapShadow(uv, p, innerBlur)
    shadowCopy = heatmapShadow(uv, fract(p + 1 / 3), innerBlur)
    shadowCopy2 = heatmapShadow(uv, fract(p + 2 / 3), innerBlur)
    inner = 0.8 + 0.8 * innerBlur
    inner = mix(inner, 0.0, shadow)
    inner = mix(inner, 0.0, shadowCopy)
    inner = mix(inner, 0.0, shadowCopy2)
    inner = min(1.0, inner)
    inner *= rim_edge_fade(uv)
    outer = 0.0
    inner = pow(inner, 1.2)
    heat = clamp(inner + outer, 0.0, 1.0)
    heat += (0.005 + 0.35 * 0.03) * (hash1(uv) - 0.5)
    mixer = heat * 8.0
    grad = list(HEAT_COLOR[0]) + [HEAT_ALPHA[0]]
    grad[0] *= grad[3]; grad[1] *= grad[3]; grad[2] *= grad[3]
    outerShape = 0.0
    for i in range(1, 9):
        m = clamp(mixer - (i - 1), 0.0, 1.0)
        if i == 1:
            outerShape = m
        c = list(HEAT_COLOR[i - 1]) + [HEAT_ALPHA[i - 1]]
        c[0] *= c[3]; c[1] *= c[3]; c[2] *= c[3]
        grad = [mix(grad[j], c[j], m) for j in range(4)]
    heatColor = [grad[0] * outerShape, grad[1] * outerShape, grad[2] * outerShape]
    heatAlpha = grad[3] * outerShape
    bg = (0.008, 0.012, 0.038)
    heatColor = [heatColor[0] + bg[0] * (1 - heatAlpha),
                 heatColor[1] + bg[1] * (1 - heatAlpha),
                 heatColor[2] + bg[2] * (1 - heatAlpha)]
    h2 = hash1((uv[0] + 1, uv[1]))
    heatColor = [heatColor[0] + 0.02 * (h2 - 0.5),
                 heatColor[1] + 0.02 * (h2 - 0.5),
                 heatColor[2] + 0.02 * (h2 - 0.5)]
    return tuple(max(0, min(255, int(round(c * 255)))) for c in heatColor)

if __name__ == "__main__":
    from PIL import Image
    for pname, p in [('f2', 0.10), ('f3', 0.18), ('f4', 0.26), ('f5', 0.34), ('red', 0.28)]:
        im = Image.new('RGB', (201, 201))
        px = im.load()
        for y in range(201):
            for x in range(201):
                px[x, y] = heatmap_output((x / 201, y / 201), p)
        path = os.path.join(OUT, f'simrep-{pname}.png')
        im.save(path)
        warm = tot = 0
        mx = 0
        for y in range(201):
            for x in range(201):
                r, g, b = px[x, y]
                mx = max(mx, (r + g + b) / 3)
                tot += 1
                if r > 150 and r > g * 0.9:
                    warm += 1
        print(pname, 'maxbright:', round(mx, 1), 'warmfrac:', round(100 * warm / tot, 1), '%', '->', path)
