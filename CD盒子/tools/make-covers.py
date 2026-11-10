#!/usr/bin/env python3
"""Generate the four original CC0 cover artworks used by the demo.

This is intentionally a small, readable asset pipeline: no external images, no
stock photography, no album art. Run it from the repository root:

    python tools/make-covers.py

Requires Pillow and numpy.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "covers"
SIZE = 1024
rng = random.Random(7)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def gradient(size: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    y = np.linspace(0, 1, size)[:, None]
    x = np.linspace(0, 1, size)[None, :]
    t = np.clip(0.55 * y + 0.45 * x, 0, 1)
    arr = np.zeros((size, size, 3), dtype=np.float32)
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1)
        local = (t[m] - p0) / max(1e-6, p1 - p0)
        for k in range(3):
            arr[..., k][m] = c0[k] * (1 - local) + c1[k] * local
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def grain(img: Image.Image, amount: int = 7) -> Image.Image:
    arr = np.asarray(img).astype(np.int16)
    noise = np.random.default_rng(4).integers(-amount, amount + 1, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, img.mode)


def holo() -> Image.Image:
    img = gradient(SIZE, [(0, (10, 12, 32)), (0.45, (28, 20, 66)), (1, (8, 34, 60))]).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    palette = [(255, 96, 180), (84, 214, 255), (255, 212, 90), (156, 120, 255), (90, 255, 180)]
    for i in range(26):
        x = rng.randint(-160, 900)
        y = rng.randint(-100, 900)
        w = rng.randint(120, 310)
        h = rng.randint(60, 160)
        col = palette[i % len(palette)] + (rng.randint(70, 150),)
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle((4, 4, w - 4, h - 4), radius=22, fill=col, outline=(255, 255, 255, 150), width=3)
        ld.text((w // 2, h // 2), rng.choice(["PLAY", "AI", "★", "LOOP", "01", "OK"]), font=font(28), fill=(255, 255, 255, 220), anchor="mm")
        layer = layer.rotate(rng.uniform(-24, 24), expand=True, resample=Image.Resampling.BICUBIC)
        img.alpha_composite(layer, (x, y))

    # Holographic foil bands.
    foil = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(foil)
    for k in range(9):
        x = k * 150 - 120
        fd.polygon([(x, 0), (x + 180, 0), (x + 40, SIZE), (x - 140, SIZE)], fill=(palette[k % 5][0], palette[k % 5][1], palette[k % 5][2], 38))
    img.alpha_composite(foil)

    # Central disc + type.
    d.ellipse((315, 315, 709, 709), fill=(9, 10, 18, 235), outline=(255, 255, 255, 170), width=3)
    d.ellipse((456, 456, 568, 568), fill=(240, 240, 245, 230), outline=(20, 20, 24, 255), width=4)
    d.ellipse((498, 498, 526, 526), fill=(8, 8, 12, 255))
    d.text((512, 760), "SIGNAL", font=font(92), fill=(255, 255, 255, 245), anchor="mm")
    d.text((512, 850), "BLOOM", font=font(92), fill=(255, 220, 90, 245), anchor="mm")
    d.text((512, 930), "HOLO / 01", font=font(28), fill=(180, 220, 255, 220), anchor="mm")
    return grain(img, 5)


def gold() -> Image.Image:
    img = gradient(SIZE, [(0, (82, 44, 10)), (0.35, (190, 127, 36)), (0.62, (247, 196, 92)), (1, (96, 51, 12))]).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # Brushed concentric rings.
    for r in range(40, 700, 6):
        shade = int(80 + 80 * math.sin(r * 0.09))
        d.arc((512 - r, 512 - r, 512 + r, 512 + r), 0, 360, fill=(255, 235, 170, 20 + (r % 30)))
        d.arc((512 - r, 512 - r, 512 + r, 512 + r), 0, 360, fill=(shade, 60, 10, 18))

    # Voyager-like line diagram and inscription.
    d.ellipse((250, 250, 774, 774), outline=(255, 232, 160, 150), width=2)
    d.ellipse((330, 330, 694, 694), outline=(255, 232, 160, 90), width=1)
    for k in range(12):
        a = k * math.pi / 6
        d.line((512 + math.cos(a) * 160, 512 + math.sin(a) * 160, 512 + math.cos(a) * 250, 512 + math.sin(a) * 250), fill=(255, 242, 190, 120), width=2)
    d.text((512, 780), "VOYAGER", font=font(86), fill=(45, 26, 8, 235), anchor="mm")
    d.text((512, 862), "GOLD", font=font(86), fill=(45, 26, 8, 235), anchor="mm")
    d.text((512, 930), "A SIDE / 1977", font=font(26), fill=(70, 42, 12, 220), anchor="mm")

    alpha = Image.new("L", (SIZE, SIZE), 0)
    ad = ImageDraw.Draw(alpha)
    ad.ellipse((250, 250, 774, 774), outline=255, width=4)
    ad.ellipse((330, 330, 694, 694), outline=190, width=2)
    ad.text((512, 780), "VOYAGER", font=font(86), fill=255, anchor="mm")
    ad.text((512, 862), "GOLD", font=font(86), fill=255, anchor="mm")
    ad.text((512, 930), "A SIDE / 1977", font=font(26), fill=255, anchor="mm")
    img.putalpha(alpha)
    return grain(img, 4)


def rose() -> Image.Image:
    img = gradient(SIZE, [(0, (12, 6, 9)), (0.55, (30, 8, 14)), (1, (6, 3, 5))]).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # A stylised rose: layered petal polygons around a dark centre.
    for layer in range(5, 0, -1):
        radius = 150 + layer * 62
        for k in range(9 + layer):
            a = k * (math.tau / (9 + layer)) + layer * 0.22
            cx = 512 + math.cos(a) * (90 + layer * 18)
            cy = 512 + math.sin(a) * (90 + layer * 18)
            points = []
            for t in range(20):
                ang = t / 20 * math.tau
                rr = radius * (0.42 + 0.58 * abs(math.sin(ang * 2 + layer)))
                points.append((cx + math.cos(ang + a) * rr, cy + math.sin(ang + a) * rr * 0.72))
            fill = (120 + layer * 16, 8 + layer * 5, 20 + layer * 4, 190)
            d.polygon(points, fill=fill, outline=(230, 50 + layer * 4, 70, 160))

    # Highlights and stem/leaves.
    for k in range(14):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(30, 250)
        x = 512 + math.cos(a) * r
        y = 512 + math.sin(a) * r
        d.arc((x - 55, y - 30, x + 55, y + 30), 190, 340, fill=(255, 150, 160, 80), width=2)
    for k in range(3):
        a = -0.9 + k * 0.55
        d.line((512, 760, 512 + math.cos(a) * 240, 980), fill=(28, 70, 38, 230), width=10)
        d.polygon([(512 + math.cos(a) * 80, 800), (512 + math.cos(a) * 180, 760), (512 + math.cos(a) * 150, 850)], fill=(28, 80, 42, 220))

    d.text((512, 80), "NIGHT", font=font(50), fill=(245, 220, 210, 220), anchor="mm")
    d.text((512, 940), "ROSE", font=font(72), fill=(245, 220, 210, 235), anchor="mm")
    d.text((512, 990), "B SIDE / 45 RPM", font=font(22), fill=(220, 170, 170, 200), anchor="mm")

    alpha = Image.new("L", (SIZE, SIZE), 0)
    ad = ImageDraw.Draw(alpha)
    # Only the flower and type are printed; the vinyl remains visible elsewhere.
    ad.ellipse((150, 150, 874, 874), fill=255)
    ad.rectangle((0, 0, SIZE, 130), fill=255)
    ad.rectangle((0, 900, SIZE, SIZE), fill=255)
    img.putalpha(alpha)
    return grain(img, 8)


def swirl() -> Image.Image:
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    nx = (x - SIZE / 2) / (SIZE / 2)
    ny = (y - SIZE / 2) / (SIZE / 2)
    r = np.sqrt(nx * nx + ny * ny)
    a = np.arctan2(ny, nx)
    v = np.sin(a * 5 + r * 9) * 0.5 + 0.5
    v2 = np.sin(a * 3 - r * 13 + 1.7) * 0.5 + 0.5
    c1 = np.array([246, 241, 226], dtype=np.float32)
    c2 = np.array([26, 88, 165], dtype=np.float32)
    c3 = np.array([255, 105, 45], dtype=np.float32)
    arr = c1[None, None, :] * (1 - v[..., None]) + c2[None, None, :] * v[..., None]
    arr = arr * (1 - 0.65 * (v2[..., None] ** 3)) + c3[None, None, :] * (0.65 * (v2[..., None] ** 3))
    arr *= (1 - 0.18 * r[..., None])
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    for k in range(4):
        rr = 180 + k * 70
        d.arc((512 - rr, 512 - rr, 512 + rr, 512 + rr), 20 + k * 30, 320 + k * 20, fill=(255, 255, 255, 90), width=2)
    d.text((512, 120), "LIQUID", font=font(78), fill=(16, 32, 48, 235), anchor="mm")
    d.text((512, 205), "SKY", font=font(78), fill=(16, 32, 48, 235), anchor="mm")
    d.text((512, 940), "PRINT / 02", font=font(26), fill=(16, 32, 48, 200), anchor="mm")
    return grain(img, 5)


def save(img: Image.Image, name: str) -> None:
    img = img.convert("RGBA")
    img.save(OUT / f"{name}.webp", "WEBP", quality=92, method=6)
    thumb = img.resize((160, 160), Image.Resampling.LANCZOS)
    thumb.save(OUT / f"{name}-thumb.webp", "WEBP", quality=90, method=6)
    print(name, img.size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save(holo(), "cover-holo")
    save(gold(), "cover-gold")
    save(rose(), "cover-rose")
    save(swirl(), "cover-swirl")


if __name__ == "__main__":
    main()
