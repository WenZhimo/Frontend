#!/usr/bin/env python3
"""Compose the final demo covers from the open-license source textures.

The result is a set of 1024x1024 RGBA WebP images plus opaque 160x160 thumbnails.
Typography and vector overlays are original to this project. Source credits live
in assets/CREDITS.md.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
COVERS = ROOT / "assets" / "covers"
SOURCE = COVERS / "source-textures"
SIZE = 1024


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    for candidate in [
        "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def open_source(name: str) -> Image.Image:
    img = Image.open(SOURCE / name).convert("RGB")
    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def grain(img: Image.Image, amount: int = 5) -> Image.Image:
    arr = np.asarray(img.convert("RGB")).astype(np.int16)
    noise = np.random.default_rng(11).integers(-amount, amount + 1, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    out = Image.fromarray(arr, "RGB").convert("RGBA")
    out.putalpha(img.getchannel("A"))
    return out


def text_with_shadow(draw, xy, text, fnt, fill, shadow=(0, 0, 0, 170), offset=4, anchor="mm"):
    x, y = xy
    draw.text((x + offset, y + offset), text, font=fnt, fill=shadow, anchor=anchor)
    draw.text((x, y), text, font=fnt, fill=fill, anchor=anchor)


def feather_mask(size: int, radius: float, centre=(512, 512), blur=10) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    cx, cy = centre
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def holo() -> Image.Image:
    img = open_source("source-holo.webp").convert("RGBA")
    wash = Image.new("RGBA", (SIZE, SIZE), (8, 10, 28, 0))
    wd = ImageDraw.Draw(wash)
    for y in range(SIZE):
        a = int(40 + 105 * (y / SIZE) ** 2)
        wd.line((0, y, SIZE, y), fill=(6, 8, 22, a))
    img.alpha_composite(wash)

    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((250, 250, 774, 774), outline=(170, 225, 255, 150), width=3)
    d.ellipse((264, 264, 760, 760), outline=(255, 255, 255, 50), width=1)
    d.text((250, 186), "HOLO / 01", font=font(24), fill=(200, 235, 255, 230))
    d.text((250, 228), "SIGNAL SERIES", font=font(18, False), fill=(180, 210, 235, 190))

    text_with_shadow(d, (512, 752), "SIGNAL", font(124), (255, 255, 255, 245), offset=5)
    text_with_shadow(d, (512, 866), "BLOOM", font(124), (255, 214, 76, 245), offset=5)
    d.text((512, 944), "A SIDE / 33⅓", font=font(22), fill=(225, 235, 248, 210), anchor="mm")

    # Soft "sticker gaps": these become rainbow data-side windows in the shader.
    alpha = img.getchannel("A")
    ad = ImageDraw.Draw(alpha)
    for cx, cy, r in [(220, 640, 18), (806, 590, 15), (700, 236, 16)]:
        ad.ellipse((cx - r, cy - r, cx + r, cy + r), fill=35)
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    img.putalpha(alpha)
    return grain(img, 4)


def gold() -> Image.Image:
    img = open_source("source-gold.webp").convert("RGBA")

    # The record itself is the engraved area; the type sits outside that mask.
    img.putalpha(feather_mask(SIZE, 492, blur=12))
    d = ImageDraw.Draw(img, "RGBA")

    plate = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    pd.rounded_rectangle((150, 636, 874, 890), radius=10, fill=(9, 6, 3, 196))
    img.alpha_composite(plate)

    text_with_shadow(d, (512, 706), "VOYAGER", font(100), (255, 243, 214, 255),
                     shadow=(12, 7, 2, 210), offset=3)
    text_with_shadow(d, (512, 812), "GOLD", font(100), (255, 243, 214, 255),
                     shadow=(12, 7, 2, 210), offset=3)
    d.text((512, 872), "A SIDE / 1977", font=font(22), fill=(245, 220, 175, 240), anchor="mm")
    return grain(img, 4)


def rose() -> Image.Image:
    img = open_source("source-rose.webp").convert("RGBA")

    # Keep the photographic print inside a circular label; the rim stays vinyl.
    img.putalpha(feather_mask(SIZE, 412, blur=16))
    d = ImageDraw.Draw(img, "RGBA")

    vin = Image.new("RGBA", (SIZE, SIZE), (8, 3, 6, 0))
    vd = ImageDraw.Draw(vin)
    for r in range(512, 120, -2):
        a = int(100 * ((512 - r) / 392) ** 1.5)
        vd.ellipse((512 - r, 512 - r, 512 + r, 512 + r), outline=(8, 3, 6, a), width=3)
    img.alpha_composite(vin)

    text_with_shadow(d, (512, 700), "NIGHT", font(96), (250, 238, 232, 245), offset=5)
    text_with_shadow(d, (512, 806), "ROSE", font(96), (250, 238, 232, 245), offset=5)
    d.text((512, 872), "B SIDE / 45 RPM", font=font(21), fill=(245, 225, 220, 220), anchor="mm")
    return grain(img, 5)


def swirl() -> Image.Image:
    img = open_source("source-swirl.webp").convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")

    panel = Image.new("RGBA", (720, 220), (247, 243, 232, 238))
    pd = ImageDraw.Draw(panel)
    pd.rectangle((0, 0, 720, 220), outline=(17, 17, 20, 80), width=1)
    img.alpha_composite(panel, (152, 704))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((512, 772), "LIQUID", font=font(82), fill=(18, 32, 45, 245), anchor="mm")
    d.text((512, 856), "SKY", font=font(82), fill=(18, 32, 45, 245), anchor="mm")
    d.text((512, 968), "PRINT / 02", font=font(22), fill=(247, 240, 226, 235), anchor="mm")
    d.text((512, 120), "MARBLED LIGHT", font=font(19, False), fill=(250, 244, 232, 225), anchor="mm")
    return grain(img, 5)


def save(img: Image.Image, name: str, thumb_bg: tuple[int, int, int]) -> None:
    img = img.convert("RGBA")
    img.save(COVERS / f"{name}.webp", "WEBP", quality=92, method=6)

    thumb = img.resize((160, 160), Image.Resampling.LANCZOS)
    bg = Image.new("RGB", (160, 160), thumb_bg)
    bg.paste(thumb, (0, 0), thumb)
    bg.save(COVERS / f"{name}-thumb.webp", "WEBP", quality=90, method=6)
    print(name, img.size, "thumb", bg.size)


def main() -> None:
    save(holo(), "cover-holo", (14, 18, 36))
    save(gold(), "cover-gold", (168, 126, 58))
    save(rose(), "cover-rose", (18, 8, 10))
    save(swirl(), "cover-swirl", (246, 241, 226))


if __name__ == "__main__":
    main()
