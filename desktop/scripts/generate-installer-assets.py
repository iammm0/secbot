#!/usr/bin/env python3
"""Generate installer/DMG branding assets from the transparent desktop master.

产出：
  - desktop/src-tauri/nsis/header-image.bmp   (150x57,  NSIS MUI2 头图，24-bit BMP)
  - desktop/src-tauri/nsis/sidebar-image.bmp  (164x314, NSIS MUI2 欢迎/完成页侧栏图)
  - assets/secbot-dmg-background.png          (660x400, macOS DMG 窗口背景)
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / "assets" / "secbot-desktop-icon.png"
OUT_NSIS_DIR = ROOT / "desktop" / "src-tauri" / "nsis"
OUT_HEADER = OUT_NSIS_DIR / "header-image.bmp"
OUT_SIDEBAR = OUT_NSIS_DIR / "sidebar-image.bmp"
OUT_DMG_BG = ROOT / "assets" / "secbot-dmg-background.png"

# 品牌色（与 web 深色主题 primary 一致）
GREEN = (0, 255, 136)
GREEN_DARK = (5, 150, 105)
INK = (10, 10, 10)
LIGHT = (244, 245, 247)
WHITE = (255, 255, 255)


def load_font(size: int, *, cjk: bool = False) -> ImageFont.ImageFont:
    candidates = []
    if cjk:
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/Supplemental/Songti.ttc",
        ]
    candidates += [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def _logo_thumb(size: int) -> Image.Image:
    img = Image.open(LOGO).convert("RGBA")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    return img


def make_header_bmp() -> Image.Image:
    """150x57 顶部条：白底 + 绿色 "Secbot" 字样（MUI2 头图，24-bit BMP）。"""
    w, h = 150, 57
    img = Image.new("RGB", (w, h), WHITE)
    d = ImageDraw.Draw(img)
    # 左侧绿色竖条
    d.rectangle((0, 0, 4, h), fill=GREEN_DARK)
    # 品牌字
    font = load_font(20)
    d.text((14, (h - 20) // 2 - 2), "Secbot", font=font, fill=INK)
    # 右上小 logo
    logo = _logo_thumb(38)
    img.paste(logo, (w - 8 - logo.width, (h - logo.height) // 2), logo)
    return img


def make_sidebar_bmp() -> Image.Image:
    """164x314 侧栏：白底 + 顶部 logo + 底部品牌字（MUI2 欢迎/完成页侧图）。"""
    w, h = 164, 314
    img = Image.new("RGB", (w, h), WHITE)
    logo = _logo_thumb(96)
    img.paste(logo, ((w - logo.width) // 2, 52), logo)
    d = ImageDraw.Draw(img)
    font = load_font(24)
    text = "Secbot"
    bb = d.textbbox((0, 0), text, font=font)
    d.text(((w - (bb[2] - bb[0])) // 2 - bb[0], 175 - bb[1]), text, font=font, fill=GREEN_DARK)
    sub = "AI Security"
    fsub = load_font(13)
    bbs = d.textbbox((0, 0), sub, font=fsub)
    d.text(((w - (bbs[2] - bbs[0])) // 2 - bbs[0], 208 - bbs[1]), sub, font=fsub, fill=(120, 120, 120))
    return img


def make_dmg_background() -> Image.Image:
    """660x400 DMG 背景：浅色渐变 + 左 logo + 右侧安装提示（appPosition 170,170）。"""
    w, h = 660, 400
    img = Image.new("RGB", (w, h), LIGHT)
    # 浅色垂直渐变
    top = (244, 245, 247)
    bot = (232, 236, 238)
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        ImageDraw.Draw(img).line((0, y, w, y), fill=row)
    # 左上细绿条点缀
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 6, h), fill=GREEN_DARK)

    # 左：logo（对应 appPosition x170,y170，居左）
    logo = _logo_thumb(140)
    img.paste(logo, (90, (h - logo.height) // 2), logo)

    # 右：安装提示文案
    lines = ["拖拽 Secbot 到", "Applications 文件夹", "完成安装"]
    font = load_font(26, cjk=True)
    fdim = load_font(17, cjk=True)
    y0 = 132
    for i, line in enumerate(lines):
        f = font if i == 0 else fdim
        bb = d.textbbox((0, 0), line, font=f)
        color = GREEN_DARK if i == 0 else (90, 96, 102)
        d.text((330 - bb[0], y0 - bb[1]), line, font=f, fill=color)
        y0 += 38 if i == 0 else 30
    return img


def main() -> int:
    OUT_NSIS_DIR.mkdir(parents=True, exist_ok=True)
    make_header_bmp().save(OUT_HEADER, "BMP")
    print(f"wrote {OUT_HEADER}")
    make_sidebar_bmp().save(OUT_SIDEBAR, "BMP")
    print(f"wrote {OUT_SIDEBAR}")
    make_dmg_background().save(OUT_DMG_BG, "PNG")
    print(f"wrote {OUT_DMG_BG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
