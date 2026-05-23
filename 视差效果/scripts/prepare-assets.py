from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

ALBEDO_SRC = ROOT / "lroc_color_16bit_srgb_4k.tif"
HEIGHT_SRC = ROOT / "ldem_4_uint.tif"

ALBEDO_OUT = ASSETS / "moon-albedo-4k.jpg"
HEIGHT_OUT = ASSETS / "moon-height-2k.png"
HEIGHT_PACKED_OUT = ASSETS / "moon-height-2k-packed.png"
NORMAL_OUT = ASSETS / "moon-normal-2k.png"

HEIGHT_SIZE = (2048, 1024)
HEIGHT_LOW_PERCENTILE = 1.0
HEIGHT_HIGH_PERCENTILE = 99.0
NORMAL_STRENGTH = 5.0


def save_albedo():
    image = Image.open(ALBEDO_SRC)
    if image.mode != "RGB":
        image = image.convert("RGB")
    ImageOps.exif_transpose(image).save(ALBEDO_OUT, quality=92, optimize=True, progressive=True)
    print(f"saved {ALBEDO_OUT.relative_to(ROOT)} {image.size}")


def load_normalized_height():
    image = Image.open(HEIGHT_SRC)
    height = np.asarray(image, dtype=np.float32)
    height = np.asarray(
        Image.fromarray(height, mode="F").resize(HEIGHT_SIZE, Image.Resampling.BICUBIC),
        dtype=np.float32,
    )

    low = np.percentile(height, HEIGHT_LOW_PERCENTILE)
    high = np.percentile(height, HEIGHT_HIGH_PERCENTILE)
    height = np.clip((height - low) / (high - low), 0.0, 1.0)
    return height


def save_height(height):
    height_8 = np.round(height * 255.0).astype(np.uint8)
    Image.fromarray(height_8, mode="L").save(HEIGHT_OUT, optimize=True)
    print(f"saved {HEIGHT_OUT.relative_to(ROOT)} {HEIGHT_SIZE}")

    height_16 = np.round(height * 65535.0).astype(np.uint16)
    packed = np.dstack([
        (height_16 >> 8).astype(np.uint8),
        (height_16 & 255).astype(np.uint8),
        height_8,
    ])
    Image.fromarray(packed, mode="RGB").save(HEIGHT_PACKED_OUT, optimize=True)
    print(f"saved {HEIGHT_PACKED_OUT.relative_to(ROOT)} {HEIGHT_SIZE}")


def save_normal(height):
    # Equirectangular wrap horizontally; clamp vertically. The height field is used
    # as visual relief rather than physically exact lunar radius displacement.
    left = np.roll(height, 1, axis=1)
    right = np.roll(height, -1, axis=1)
    up = np.vstack([height[:1, :], height[:-1, :]])
    down = np.vstack([height[1:, :], height[-1:, :]])

    dx = (right - left) * NORMAL_STRENGTH
    dy = (down - up) * NORMAL_STRENGTH

    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    normal = (normal * 0.5 + 0.5) * 255.0
    normal_8 = np.clip(np.round(normal), 0, 255).astype(np.uint8)

    Image.fromarray(normal_8, mode="RGB").save(NORMAL_OUT, optimize=True)
    print(f"saved {NORMAL_OUT.relative_to(ROOT)} {HEIGHT_SIZE}")


def main():
    save_albedo()
    height = load_normalized_height()
    save_height(height)
    save_normal(height)


if __name__ == "__main__":
    main()
