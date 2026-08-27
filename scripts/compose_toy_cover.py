from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "promo" / "assets" / "toy-cover-background-v1.png"
BRAND = ROOT / "app" / "assets" / "brand-icon.png"
IOP_LOGO = ROOT / "promo" / "assets" / "iop-logo.png"
OUTPUT = ROOT / "promo" / "exports" / "topology-gomoku-toy-cover-4x3.png"
TITLE_FONT = Path("C:/Windows/Fonts/STZHONGS.TTF")
BOLD_FONT = Path("C:/Windows/Fonts/msyhbd.ttc")

SIZE = (1200, 900)
INK = "#21302c"
MUTED = "#6f746d"
TEAL = "#3f8c87"
GOLD = "#c79244"
RED = "#d95b4f"


def main() -> None:
    background = Image.open(BACKGROUND).convert("RGB")
    background = ImageOps.fit(background, SIZE, method=Image.Resampling.LANCZOS)

    brand = Image.open(BRAND).convert("RGBA")
    brand.thumbnail((470, 470), Image.Resampling.LANCZOS)
    brand_x = 700 + (470 - brand.width) // 2
    brand_y = 270 + (470 - brand.height) // 2
    background.paste(brand, (brand_x, brand_y), brand)

    iop_logo = Image.open(IOP_LOGO).convert("RGBA")
    iop_logo.thumbnail((170, 170), Image.Resampling.LANCZOS)
    background.paste(iop_logo, (55, 690), iop_logo)

    draw = ImageDraw.Draw(background)
    title_font = ImageFont.truetype(str(TITLE_FONT), 174)
    subtitle_font = ImageFont.truetype(str(BOLD_FONT), 66)
    institution_font = ImageFont.truetype(str(BOLD_FONT), 58)

    draw.text((52, 30), "拓扑五子棋", font=title_font, fill=INK, stroke_width=2, stroke_fill=INK)
    draw.text((58, 328), "世界之外，", font=subtitle_font, fill=MUTED)
    draw.text((58, 414), "也能连成一线。", font=subtitle_font, fill=MUTED)

    line_y = 519
    draw.line((60, line_y, 182, line_y), fill=TEAL, width=7)
    draw.line((182, line_y, 230, line_y), fill=GOLD, width=7)
    draw.line((230, line_y, 266, line_y), fill=RED, width=7)

    draw.text((250, 748), "中国科学院物理研究所", font=institution_font, fill="#4f5953")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    background.save(OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({background.width}x{background.height})")


if __name__ == "__main__":
    main()
