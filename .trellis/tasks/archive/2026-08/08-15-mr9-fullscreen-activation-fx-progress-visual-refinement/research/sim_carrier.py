# MR9 Latent Thermal Carrier + Boundary Anchoring — GLSL cross-check simulator.
# Mirrors the exact GLSL of ExpandedPresentationSurface.tsx heatmapOutput after
# the latent-carrier spike: full rounded-window boundary texture (unchanged
# channels), SDF depth anchoring, latentCarrier warped-sin field with three
# phase-offset soft subtractive carves + fine contour modulation, low-amplitude
# cool rim halo, 8-stop premultiplied palette. Renders F2-5 + reduced into
# mr9-latent-carrier/simcar-*.png and prints the same warm/cool/maxbright stats
# the real browser captures use.
import math
import os

RES = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RES, "mr9-latent-carrier")
os.makedirs(OUT, exist_ok=True)

SIZE = 256
CORNER = 0.08
BIG_FRAC = 0.12
BIG_PASSES = 3
SMALL_FRAC = 0.12
TAU = 6.283185307179586

def clamp(x, a, b): return max(a, min(b, x))
def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
def fract(x): return x - math.floor(x)
def mix(a, b, t): return a * (1 - t) + b * t

def rasterize_window_surface():
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

def tex_shape(uv):
    t = (uv[0] * (SIZE - 1), uv[1] * (SIZE - 1))
    x0 = int(t[0]); y0 = int(t[1])
    fx = t[0] - x0; fy = t[1] - y0
    x0 = clamp(x0, 0, SIZE - 1); y0 = clamp(y0, 0, SIZE - 1)
    x1 = clamp(x0 + 1, 0, SIZE - 1); y1 = clamp(y0 + 1, 0, SIZE - 1)
    def g(x, y): return shape[y * SIZE + x] / 255.0
    return mix(mix(g(x0, y0), g(x1, y0), fx), mix(g(x0, y1), g(x1, y1), fx), fy)

def rounded_boundary(uv):
    halfSize = 0.5 - CORNER
    qb0 = abs(uv[0] - 0.5) - halfSize
    qb1 = abs(uv[1] - 0.5) - halfSize
    return math.hypot(max(qb0, 0), max(qb1, 0)) + min(max(qb0, qb1), 0) - CORNER

def rim_edge_fade(uv):
    return smoothstep(0.0, 0.10, -rounded_boundary(uv))

def latent_carrier(uv, p):
    w = (uv[0] + 0.09 * math.sin(uv[1] * 3.3 + p * TAU * 0.7),
         uv[1] + 0.09 * math.cos(uv[0] * 2.7 - p * TAU * 0.5))
    c = (0.55 * math.sin(w[0] * 4.1 + p * TAU * 0.45)
         + 0.35 * math.sin(w[1] * 3.6 - p * TAU * 0.35)
         + 0.20 * math.sin((w[0] + w[1]) * 2.2 + p * TAU * 0.30)
         + 0.12 * math.sin((w[0] - w[1]) * 5.4 - p * TAU * 0.25))
    return clamp(c * 0.5 + 0.5, 0.0, 1.0)

HEAT_ALPHA = [0.00, 0.65, 0.90, 1.00, 1.00, 1.00, 1.00, 1.00]
HEAT_COLOR = [
    (0.008, 0.012, 0.038), (0.040, 0.100, 0.400), (0.090, 0.260, 0.800),
    (0.180, 0.580, 0.920), (0.980, 0.840, 0.300), (1.000, 0.550, 0.160),
    (1.000, 0.380, 0.110), (1.000, 0.260, 0.080)]

def hash1(uv):
    return fract(math.sin(uv[0] * 12.9898 + uv[1] * 78.233) * 43758.5453123)

def heatmap_output(uv, p):
    shape_v = tex_shape(uv)
    depth = smoothstep(0.0, 0.28, -rounded_boundary(uv))
    carrierA = latent_carrier(uv, p)
    carrierB = latent_carrier((uv[0] + 0.11, uv[1] + 0.05), fract(p + 1 / 3))
    carrierC = latent_carrier((uv[0] - 0.06, uv[1] - 0.10), fract(p + 2 / 3))
    fine = 0.5 + 0.5 * math.sin((uv[0] + uv[1]) * 9.0 + p * TAU * 0.6)
    carveA = smoothstep(0.52, 0.92, carrierA) * mix(0.75, 1.25, fine)
    carveB = smoothstep(0.50, 0.94, carrierB) * mix(0.75, 1.25, 1.0 - fine)
    carveC = smoothstep(0.54, 0.96, carrierC)
    inner = 0.34 + 0.62 * depth
    inner = mix(inner, 0.0, carveA)
    inner = mix(inner, 0.0, carveB)
    inner = mix(inner, 0.0, carveC)
    inner = clamp(inner, 0.0, 1.0)
    inner *= rim_edge_fade(uv)
    shellLine = smoothstep(0.25, 0.85, shape_v)
    rimHalo = (1.0 - smoothstep(0.0, 0.22, depth)) * shellLine
    outer = 0.10 * rimHalo * (1.0 - carrierA)
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
        im.save(os.path.join(OUT, f'simcar-{pname}.png'))
        warm = cool = tot = 0
        mx = 0
        for y in range(201):
            for x in range(201):
                r, g, b = px[x, y]
                mx = max(mx, (r + g + b) / 3)
                tot += 1
                if r > 150 and r > g * 0.9:
                    warm += 1
                if b > 90 and b > r * 1.4 and g < b:
                    cool += 1
        print(pname, 'maxbright:', round(mx, 1), 'warmfrac:', round(100 * warm / tot, 1), '%',
              'coolfrac:', round(100 * cool / tot, 1), '%', '->', os.path.join(OUT, f'simcar-{pname}.png'))
