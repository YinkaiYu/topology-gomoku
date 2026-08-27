from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "promo" / "assets" / "toy-cover-background-v1.png"
BRAND = ROOT / "app" / "assets" / "brand-icon.png"
IOP_LOGO = ROOT / "promo" / "assets" / "iop-logo.png"
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

    iop_logo = Image.open(IOP_LOGO).convert("RGBA")
    iop_logo.thumbnail((150, 150), Image.Resampling.LANCZOS)
    background.paste(iop_logo, (53, 720), iop_logo)

    draw = ImageDraw.Draw(background)
    title_font = ImageFont.truetype(str(TITLE_FONT), 205)
    subtitle_font = ImageFont.truetype(str(TITLE_FONT), 52)
    institution_font = ImageFont.truetype(str(INSTITUTION_FONT), 52)

    draw.text((42, 18), "拓扑", font=title_font, fill=INK, stroke_width=3, stroke_fill=INK)
    draw.text((42, 211), "五子棋", font=title_font, fill=INK, stroke_width=3, stroke_fill=INK)
    draw.text((53, 461), "世界之外，", font=subtitle_font, fill=MUTED, stroke_width=1, stroke_fill=MUTED)
    draw.text((53, 521), "也能连成一线。", font=subtitle_font, fill=MUTED, stroke_width=1, stroke_fill=MUTED)

    line_y = 603
    draw.line((54, line_y, 154, line_y), fill=TEAL, width=5)
    draw.line((154, line_y, 194, line_y), fill=GOLD, width=5)
    draw.line((194, line_y, 223, line_y), fill=RED, width=5)

    draw.text((225, 770), "中国科学院物理研究所", font=institution_font, fill="#58605a")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    background.save(OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({background.width}x{background.height})")


if __name__ == "__main__":
    main()
