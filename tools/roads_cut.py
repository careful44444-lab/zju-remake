"""把「道路与桥梁素材图集」切成独立模块并抠掉背景/草地/水面。

图集没有透明通道：周围是浅绿背景，路面是蓝灰，水面是青色。
思路不是「删背景」，而是**只保留蓝灰结构**（沥青、护栏、灯杆、桥面、桥墩），
闭运算 + 填洞补齐标线，最后把水面挖掉（环形桥、十字桥内部的湖）。

用法：python tools/roads_cut.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "shots", "roads-sheet.png")
OUT = os.path.join(ROOT, "assets", "finale", "roads")
PREVIEW = os.path.join(ROOT, "shots", "roads-cut-preview.png")

ROAD_BOXES = [
    ("road_straight_s", (30, 60, 300, 300)),
    ("road_straight_l", (380, 60, 660, 320)),
    ("road_curve_r", (690, 70, 910, 320)),
    ("road_curve_l", (980, 60, 1200, 320)),
    ("road_cross_x", (1230, 60, 1500, 300)),
    ("road_cross", (20, 290, 300, 520)),
    ("road_roundabout", (310, 290, 590, 520)),
    ("road_y", (600, 290, 860, 520)),
    ("road_layby", (860, 330, 1090, 520)),
    ("road_dual_a", (1080, 330, 1300, 520)),
    ("road_dual_b", (1290, 330, 1520, 520)),
]
BRIDGE_BOXES = [
    ("bridge_straight_a", (20, 590, 440, 790)),
    ("bridge_straight_b", (450, 590, 870, 790)),
    ("bridge_arch", (880, 590, 1215, 790)),
    ("bridge_ramp", (1225, 590, 1530, 790)),
    ("bridge_t", (20, 790, 440, 1010)),
    ("bridge_cross", (450, 790, 870, 1010)),
    ("bridge_ring", (880, 790, 1190, 1010)),
    ("bridge_stone", (1200, 790, 1530, 1010)),
]


def channels(arr):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    mx = arr[:, :, :3].max(axis=2).astype(np.int16)
    return r, g, b, mx


def water_mask(arr):
    """青色水面：红通道明显低于绿/蓝。灰蓝混凝土的 r 与 g 很接近，不会被误伤。"""
    r, g, b, _ = channels(arr)
    return ((g - r) > 28) & ((b - r) > 30) & (b > 165)


def struct_mask(arr):
    """蓝灰结构色：沥青、护栏、灯杆、桥面、桥墩。"""
    r, g, b, mx = channels(arr)
    gray = (b >= g - 10) & (g >= r - 6) & (b > 100) & (mx < 236)
    return gray & ~water_mask(arr)


def close_and_fill(mask_img, size=9):
    m = mask_img.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    w, h = m.size
    flood = m.copy()
    for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood.getpixel(pt) == 0:
            ImageDraw.floodfill(flood, pt, 128)
    arr = np.array(flood)
    return Image.fromarray(np.where(arr == 128, 0, 255).astype(np.uint8), "L")


def matte(crop):
    arr = np.array(crop.convert("RGB"))
    water = Image.fromarray(water_mask(arr).astype(np.uint8) * 255, "L").filter(
        ImageFilter.MaxFilter(5))          # 外扩 2px，连水边一起挖

    m = struct_mask(arr).astype(np.uint8) * 255
    mask = close_and_fill(Image.fromarray(m, "L"))
    mask = Image.fromarray(np.minimum(np.array(mask), 255 - np.array(water)).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MedianFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))

    out = crop.convert("RGBA")
    out.putalpha(mask)
    return out


def tight(img, pad=3):
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def build():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGBA")
    saved = []
    for name, box in ROAD_BOXES + BRIDGE_BOXES:
        out = tight(matte(sheet.crop(box)))
        out.save(os.path.join(OUT, name + ".png"))
        saved.append((name, out))
        print(f"  {name:20s} {out.width}x{out.height}")
    return saved


def preview(saved):
    cw, ch = 380, 260
    cols = 4
    rows = (len(saved) + cols - 1) // cols
    board = Image.new("RGBA", (cols * cw, rows * ch), (255, 255, 255, 255))
    px = board.load()
    for y in range(board.height):
        for x in range(board.width):
            if ((x // 18) + (y // 18)) % 2 == 0:
                px[x, y] = (236, 241, 247, 255)
    for i, (name, img) in enumerate(saved):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        th = img.copy()
        s = min((cw - 26) / th.width, (ch - 26) / th.height, 1.0)
        th = th.resize((max(1, int(th.width * s)), max(1, int(th.height * s))), Image.LANCZOS)
        board.alpha_composite(th, (cx + (cw - th.width) // 2, cy + (ch - th.height) // 2))
    p1 = PREVIEW.replace(".png", "-checker.png")
    board.save(p1)
    print("棋盘预览:", p1)

    lake_path = os.path.join(ROOT, "assets", "finale", "lake4.png")
    if os.path.exists(lake_path):
        lake = Image.open(lake_path).convert("RGBA").resize((1000, 803), Image.LANCZOS)
        on = lake.copy()
        for i, (name, img) in enumerate(saved):
            th = img.copy()
            s = 0.5
            th = th.resize((max(1, int(th.width * s)), max(1, int(th.height * s))), Image.LANCZOS)
            x = 30 + (i % 3) * 320
            y = 30 + (i // 3) * 210
            if x + th.width < on.width and y + th.height < on.height:
                on.alpha_composite(th, (x, y))
        p2 = PREVIEW.replace(".png", "-onlake.png")
        on.save(p2)
        print("湖面预览:", p2)


if __name__ == "__main__":
    preview(build())
