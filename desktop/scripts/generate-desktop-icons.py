#!/usr/bin/env python3
"""Build transparent master icons (production + DEV-badge) from assets/secbot-main.png.

Logo 先裁剪到不透明内容边界（去掉源图自带的上/下内边距），再居中放到
透明正方形画布上，边距 ~5% —— 让桌面图标"直接展示 logo"，不再是大白底里的小图。
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "secbot-main.png"
OUT_PROD = ROOT / "assets" / "secbot-desktop-icon.png"
OUT_DEV = ROOT / "assets" / "secbot-desktop-icon-dev.png"
SIZE = 1024
MARGIN = int(SIZE * 0.05)


def load_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def opaque_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """不透明像素的外接矩形（排除透明边缘，供裁剪 logo）。"""
    w, h = image.size
    px = image.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                minx = min(minx, x)
                maxx = max(maxx, x)
                miny = min(miny, y)
                maxy = max(maxy, y)
    return minx, miny, maxx + 1, maxy + 1


def make_transparent_master(src: Image.Image) -> Image.Image:
    bbox = opaque_bbox(src)
    cropped = src.crop(bbox)
    inner = SIZE - MARGIN * 2
    fitted = cropped.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ox = (SIZE - fitted.width) // 2
    oy = (SIZE - fitted.height) // 2
    canvas.paste(fitted, (ox, oy), fitted)
    return canvas


def add_dev_badge(base: Image.Image) -> Image.Image:
    image = base.copy().convert("RGBA")
    badge_w, badge_h = 280, 96
    margin = 48
    bx1 = SIZE - margin - badge_w
    by1 = SIZE - margin - badge_h
    bx2 = SIZE - margin
    by2 = SIZE - margin

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (bx1 + 4, by1 + 6, bx2 + 4, by2 + 6),
        radius=24,
        fill=(0, 0, 0, 70),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    image = Image.alpha_composite(image, shadow)

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((bx1, by1, bx2, by2), radius=24, fill=(232, 93, 4, 255))

    font = load_font(64)
    text = "DEV"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = bx1 + (badge_w - tw) / 2 - bbox[0]
    ty = by1 + (badge_h - th) / 2 - bbox[1] - 2
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))
    return image


def main() -> int:
    if not SRC.is_file():
        print(f"missing source icon: {SRC}", file=sys.stderr)
        return 1

    src = Image.open(SRC).convert("RGBA")
    prod = make_transparent_master(src)
    prod.save(OUT_PROD, "PNG")
    print(f"wrote {OUT_PROD}")

    dev = add_dev_badge(prod)
    dev.save(OUT_DEV, "PNG")
    print(f"wrote {OUT_DEV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

