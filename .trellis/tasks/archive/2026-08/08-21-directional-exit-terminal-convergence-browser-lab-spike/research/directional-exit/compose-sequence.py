from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).parent / "evidence"
items = [
    ("developed", "Developed"),
    ("convergence-onset", "Convergence onset"),
    ("exit-early", "Exit early"),
    ("exit-middle", "Exit middle"),
    ("exit-late", "Exit late"),
    ("upper-right-terminal", "Upper-right terminal"),
    ("terminal-just-before-zero", "Just before zero"),
    ("zero", "Zero"),
]
frames = [(Image.open(root / f"{name}.png").convert("RGB"), label) for name, label in items]
width, height = frames[0][0].size
label_height = 34
sheet = Image.new("RGB", (width * 4, (height + label_height) * 2), (24, 22, 28))
draw = ImageDraw.Draw(sheet)
for index, (frame, label) in enumerate(frames):
    x = (index % 4) * width
    y = (index // 4) * (height + label_height)
    sheet.paste(frame, (x, y))
    draw.text((x + 10, y + height + 9), label, fill=(238, 232, 244))
sheet.save(root / "directional-exit-sequence.png")
