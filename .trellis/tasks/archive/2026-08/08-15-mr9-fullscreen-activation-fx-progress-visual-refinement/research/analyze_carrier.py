# MR9 Latent Thermal Carrier + Boundary Anchoring spike — capture analysis.
# Run AFTER capture-mr9-carrier.mjs has produced research/mr9-latent-carrier/*.png.
# Builds: chronological contact sheet, three-way Paper vs core-removal vs
# latent-carrier comparison, boundary-reach and morphology checks.
import os
from PIL import Image, ImageDraw, ImageFont

RES = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research"
NEW = f"{RES}/mr9-latent-carrier"
PREV = f"{RES}/mr9-core-removal"

def is_hot(r, g, b):
    return r > 150 and r > g * 1.3 and r > b * 1.8

def is_cool_blue(r, g, b):
    return b > 90 and b > r * 1.4 and g < b

def frame_stats(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    warm = cool = tot = 0
    mx = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            v = (r + g + b) / 3
            mx = max(mx, v)
            tot += 1
            if r > 150 and r > g * 0.9:
                warm += 1
            if is_cool_blue(r, g, b):
                cool += 1
    band_hot = 0
    for y in range(10, h - 10, 2):
        for x in range(10, w - 10, 2):
            r, g, b = px[x, y]
            if is_hot(r, g, b):
                band_hot += 1
    # boundary reach: mean brightness in the outer 12% ring (edges + corners)
    reach = tot_edge = 0
    for y in range(h):
        for x in range(w):
            if x < 0.12 * w or x > 0.88 * w or y < 0.12 * h or y > 0.88 * h:
                r, g, b = px[x, y]
                reach += (r + g + b) / 3
                tot_edge += 1
    return dict(warm_frac=round(100 * warm / tot, 2), cool_frac=round(100 * cool / tot, 2),
                maxbright=round(mx, 1), band_hot_frac=round(band_hot / ((h - 20) * (w - 20) / 4), 4),
                edge_mean=round(reach / tot_edge, 1))

def contact_sheet():
    names = ["f2", "in-between-a", "f3", "in-between-b", "f4", "in-between-c", "f5", "reduced"]
    labels = ["F2 (p=0.10)", "0.14", "F3 (0.18)", "0.22", "F4 (0.26)", "0.30", "F5 (0.34)", "Reduced (0.28)"]
    n = len(names)
    cw, ch, pad, label_h = 220, 220, 14, 34
    W = cw * n + pad * (n + 1)
    H = label_h + ch + pad * 2
    sheet = Image.new("RGB", (W, H), (15, 15, 20))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for i, (nm, lb) in enumerate(zip(names, labels)):
        im = Image.open(f"{NEW}/{nm}.png").convert("RGB")
        x = pad + i * (cw + pad)
        sheet.paste(im, (x, pad))
        d.text((x + 2, pad + ch + 4), lb, fill=(235, 235, 240), font=font)
    sheet.save(f"{NEW}/carrier-contact-sheet.png")
    print("contact sheet:", sheet.size)

def three_way():
    ref = Image.open(f"{RES}/mr9-paper-heatmap-reference-7frame.png").convert("RGB")
    W, H = ref.size
    cw, ch = W / 4, H / 2
    def crop(idx):
        r = (idx - 1) // 4
        c = (idx - 1) % 4
        return ref.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
    paper = [crop(i) for i in [2, 3, 4, 5]]
    prevf = [Image.open(f"{PREV}/f{i}.png").convert("RGB") for i in [2, 3, 4, 5]]
    newf = [Image.open(f"{NEW}/f{i}.png").convert("RGB") for i in [2, 3, 4, 5]]
    pw, ph = 360, 270
    aw = 201
    cell = max(pw, aw)
    pad = 12
    label_h = 40
    Wtot = cell * 4 + pad * 5
    Htot = pad + label_h * 3 + ph + aw * 2 + pad * 2
    sheet = Image.new("RGB", (Wtot, Htot), (15, 15, 20))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    y = pad
    d.text((pad, y - 22), "Paper heatmap reference F2-F5 (diamond)", fill=(255, 255, 255), font=font)
    for i in range(4):
        sheet.paste(paper[i].resize((pw, ph), Image.LANCZOS), (pad + i * (cell + pad), y))
    y += ph + label_h
    d.text((pad, y - 22), "Ameow core-removal repair F2-F5 (window surface only)", fill=(255, 255, 255), font=font)
    for i in range(4):
        sheet.paste(prevf[i], (pad + i * (cell + pad), y))
    y += aw + label_h
    d.text((pad, y - 22), "Ameow latent-carrier + boundary anchoring F2-F5", fill=(255, 255, 255), font=font)
    for i in range(4):
        sheet.paste(newf[i], (pad + i * (cell + pad), y))
    sheet.save(f"{NEW}/paper-vs-repair-vs-carrier.png")
    print("three-way sheet:", sheet.size)

def morph_evidence():
    a = Image.open(f"{NEW}/f2.png").convert("RGB").load()
    b = Image.open(f"{NEW}/f3.png").convert("RGB").load()
    c = Image.open(f"{NEW}/f4.png").convert("RGB").load()
    d = Image.open(f"{NEW}/f5.png").convert("RGB").load()
    w = h = 201
    def diff(p, q):
        tot = n = 0
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r1, g1, b1 = p[x, y]
                r2, g2, b2 = q[x, y]
                tot += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
                n += 1
        return round(tot / n, 1)
    print("f2->f3 mean diff:", diff(a, b), "| f3->f4:", diff(b, c), "| f4->f5:", diff(c, d))

if __name__ == "__main__":
    names = ["f2", "f3", "f4", "f5", "in-between-a", "in-between-b", "in-between-c", "reduced"]
    print("=== latent-carrier frame stats ===")
    stats = {}
    for nm in names:
        s = frame_stats(f"{NEW}/{nm}.png")
        stats[nm] = s
        print(nm, s)
    contact_sheet()
    three_way()
    morph_evidence()
