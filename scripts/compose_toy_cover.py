from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "promo" / "assets" / "toy-cover-background-v1.png"
BRAND = ROOT / "app" / "assets" / "brand-icon.png"
OUTPUT = ROOT / "promo" / "exports" / "topology-gomoku-toy-cover-4x3.png"
TITLE_FONT = Path("C:/Windows/Fonts/STSONG.TTF")
INSTITUTION_FONT = ROOT / "promo" / "assets" / "noto-serif-sc-institution-400.ttf"

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
    brand.thumbnail((500, 500), Image.Resampling.LANCZOS)
    brand_x = 650 + (500 - brand.width) // 2
    brand_y = 174 + (500 - brand.height) // 2
    background.paste(brand, (brand_x, brand_y), brand)

    draw = ImageDraw.Draw(background)
    title_font = ImageFont.truetype(str(TITLE_FONT), 168)
    subtitle_font = ImageFont.truetype(str(TITLE_FONT), 34)
    institution_font = ImageFont.truetype(str(INSTITUTION_FONT), 22)

    draw.text((55, 66), "拓扑", font=title_font, fill=INK, stroke_width=2, stroke_fill=INK)
    draw.text((55, 232), "五子棋", font=title_font, fill=INK, stroke_width=2, stroke_fill=INK)
    draw.text((63, 466), "边界之外，也能连成一线。", font=subtitle_font, fill=MUTED)

    line_y = 529
    draw.line((64, line_y, 146, line_y), fill=TEAL, width=4)
    draw.line((146, line_y, 178, line_y), fill=GOLD, width=4)
    draw.line((178, line_y, 201, line_y), fill=RED, width=4)

    draw.text((64, 806), "中国科学院物理研究所", font=institution_font, fill="#767970")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    background.save(OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({background.width}x{background.height})")


if __name__ == "__main__":
    main()
