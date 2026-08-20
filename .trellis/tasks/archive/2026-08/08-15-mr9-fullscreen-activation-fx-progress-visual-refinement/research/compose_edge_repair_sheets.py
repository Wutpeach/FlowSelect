# MR9 edge-repair comparison sheets.
# Composes labeled PNG contact sheets from the archived baseline evidence and
# the new repaired captures:
#   1) repair-contact-sheet.png          — repaired chronological 6-frame sheet
#   2) baseline-vs-repaired.png          — archived baseline (top) vs repaired (bottom)
#   3) failed-vs-repaired.png            — literal/latent-carrier (top) vs repaired (bottom)
#   4) paper-vs-repaired.png             — Paper material reference vs repaired (material-only)
from PIL import Image, ImageDraw, ImageFont

TASK = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement"
RES = f"{TASK}/research"
EVID = f"{RES}/mr9-edge-repair/evidence"
OUT = f"{RES}/mr9-edge-repair"
import os
os.makedirs(OUT, exist_ok=True)

FONT = "C:/Windows/Fonts/arial.ttf"
def font(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()

def label(draw, text, at, fill=(255, 220, 120)):
    draw.text(at, text, fill=fill, font=font(16))

PHASES = [
    ("pre-contact", "pre-contact (k≈0.03)"),
    ("first-contact", "first-contact (k≈0.10)"),
    ("developed", "developed (k≈0.25)"),
    ("developed-later", "developed-later (k≈0.35)"),
    ("late-sweep", "late-sweep (k≈0.50)"),
    ("reduced", "reduced (k=0.42)"),
]

def sheet1():
    # repaired chronological contact sheet (2 rows x 3 cols)
    cols, rows = 3, 2
    cell = 210
    pad, lab = 12, 30
    W = cols * (cell + pad) + pad
    H = rows * (cell + pad + lab) + pad
    img = Image.new("RGB", (W, H), (14, 14, 18))
    d = ImageDraw.Draw(img)
    for i, (name, label_text) in enumerate(PHASES):
        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = pad + r * (cell + pad + lab)
        try:
            frame = Image.open(f"{EVID}/repair-{name}.png").resize((cell, cell))
        except FileNotFoundError:
            frame = Image.new("RGB", (cell, cell), (60, 60, 70))
        img.paste(frame, (x, y))
        label(d, label_text, (x + 2, y + cell + 4))
    d.text((pad, 2), "MR9 edge repair - chronological phases (repaired)", fill=(230, 230, 235), font=font(18))
    img.save(f"{OUT}/repair-contact-sheet.png")
    print("saved repair-contact-sheet.png")

def sheet2():
    # baseline (archived) vs repaired
    cols, rows = 3, 2
    cell = 210
    pad, lab = 12, 30
    W = cols * (cell + pad) + pad
    H = 2 * rows * (cell + pad + lab) + pad
    img = Image.new("RGB", (W, H), (14, 14, 18))
    d = ImageDraw.Draw(img)
    for i, (name, label_text) in enumerate(PHASES):
        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y_b = pad + r * (cell + pad + lab)          # baseline row
        y_r = pad + rows * (cell + pad + lab) + r * (cell + pad + lab)  # repaired row
        try:
            b = Image.open(f"{RES}/mr9-edge-{name}.png").resize((cell, cell))
            img.paste(b, (x, y_b))
        except FileNotFoundError:
            pass
        try:
            rp = Image.open(f"{EVID}/repair-{name}.png").resize((cell, cell))
            img.paste(rp, (x, y_r))
        except FileNotFoundError:
            pass
        label(d, label_text, (x + 2, y_b + cell + 4))
        label(d, label_text, (x + 2, y_r + cell + 4))
    d.text((pad, 2), "TOP: archived baseline (Checkpoint C + edge capture)   BOTTOM: repaired", fill=(230, 230, 235), font=font(18))
    img.save(f"{OUT}/baseline-vs-repaired.png")
    print("saved baseline-vs-repaired.png")

def sheet3():
    # failed literal/latent-carrier (top) vs repaired (bottom) at matched p
    pairs = [
        ("mr9-literal-fidelity", "f2.png", "repair-first-contact.png", "literal-fidelity F2 vs repaired first-contact"),
        ("mr9-core-removal", "f4.png", "repair-developed.png", "core-removal F4 vs repaired developed"),
        ("mr9-latent-carrier", "f4.png", "repair-developed.png", "latent-carrier F4 vs repaired developed"),
        ("mr9-latent-carrier", "reduced.png", "repair-reduced.png", "latent-carrier reduced vs repaired reduced"),
    ]
    cell = 220
    pad, lab = 12, 30
    W = 2 * (cell + pad) + pad
    H = len(pairs) * (cell + pad + lab) + pad + 26
    img = Image.new("RGB", (W, H), (14, 14, 18))
    d = ImageDraw.Draw(img)
    for i, (folder, file, repair_file, title) in enumerate(pairs):
        y = pad + 26 + i * (cell + pad + lab)
        try:
            a = Image.open(f"{RES}/{folder}/{file}").resize((cell, cell))
        except FileNotFoundError:
            a = Image.new("RGB", (cell, cell), (70, 40, 40))
        try:
            b = Image.open(f"{EVID}/{repair_file}").resize((cell, cell))
        except FileNotFoundError:
            b = Image.new("RGB", (cell, cell), (40, 70, 40))
        img.paste(a, (pad, y))
        img.paste(b, (pad + cell + pad, y))
        label(d, "FAILED (literal/latent-carrier)", (pad, y + cell + 4), fill=(255, 150, 150))
        label(d, "REPAIRED", (pad + cell + pad, y + cell + 4), fill=(150, 255, 170))
        d.text((pad, y - 20), title, fill=(230, 230, 235), font=font(15))
    img.save(f"{OUT}/failed-vs-repaired.png")
    print("saved failed-vs-repaired.png")

def sheet4():
    # Paper reference vs repaired (material-only comparison)
    cols = 7
    cell = 190
    pad, lab = 12, 30
    W = cols * (cell + pad) + pad
    H = 2 * (cell + pad + lab) + pad + 26
    img = Image.new("RGB", (W, H), (14, 14, 18))
    d = ImageDraw.Draw(img)
    # Paper 7-frame reference
    for i in range(1, 8):
        x = pad + (i - 1) * (cell + pad)
        try:
            f = Image.open(f"{RES}/ref-frame{i}.png").resize((cell, cell))
        except FileNotFoundError:
            f = Image.new("RGB", (cell, cell), (50, 50, 60))
        img.paste(f, (x, pad + 26))
        d.text((x + 2, pad + 26 + cell + 4), f"Paper ref F{i}", fill=(200, 200, 230), font=font(14))
    # Repaired frames at approx matched material positions (best effort, non-identical grammar)
    repaired = ["repair-pre-contact.png", "repair-first-contact.png", "repair-developed.png",
                "repair-developed-later.png", "repair-late-sweep.png", "repair-reduced.png"]
    y2 = pad + 26 + (cell + pad + lab)
    for i in range(6):
        x = pad + i * (cell + pad)
        try:
            f = Image.open(f"{EVID}/{repaired[i]}").resize((cell, cell))
        except FileNotFoundError:
            f = Image.new("RGB", (cell, cell), (50, 50, 60))
        img.paste(f, (x, y2))
        d.text((x + 2, y2 + cell + 4), repaired[i].replace("repair-", "").replace(".png", ""), fill=(230, 230, 235), font=font(14))
    d.text((pad, 2), "Paper Shaders material reference (diamond = geometry NOT copied) vs Ameow repaired field (material/color reference only)", fill=(230, 230, 235), font=font(16))
    img.save(f"{OUT}/paper-vs-repaired.png")
    print("saved paper-vs-repaired.png")

sheet1()
sheet2()
sheet3()
sheet4()
