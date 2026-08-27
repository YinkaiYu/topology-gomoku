from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "promo" / "assets" / "toy-cover-background-v1.png"
BRAND = ROOT / "app" / "assets" / "brand-icon.png"
OUTPUT = ROOT / "promo" / "exports" / "topology-gomoku-toy-cover-4x3.png"
TITLE_FONT = Path("C:/Windows/Fonts/STZHONGS.TTF")

SIZE = (1200, 900)
INK = "#21302c"


def assert_inside_canvas(bounds: tuple[int, int, int, int], label: str) -> None:
    left, top, right, bottom = bounds
    if left < 0 or top < 0 or right > SIZE[0] or bottom > SIZE[1]:
        raise ValueError(f"{label} escapes the 4:3 canvas: {bounds}")


def main() -> None:
    background = Image.open(BACKGROUND).convert("RGB")
    background = ImageOps.fit(background, SIZE, method=Image.Resampling.LANCZOS)

    brand = Image.open(BRAND).convert("RGBA")
    brand.thumbnail((650, 650), Image.Resampling.LANCZOS)
    brand_x = (SIZE[0] - brand.width) // 2
    brand_y = -8
    alpha_bounds = brand.getchannel("A").getbbox() or (0, 0, brand.width, brand.height)
    brand_bounds = (
        brand_x + alpha_bounds[0],
        brand_y + alpha_bounds[1],
        brand_x + alpha_bounds[2],
        brand_y + alpha_bounds[3],
    )
    assert_inside_canvas(brand_bounds, "brand mark")
    background.paste(brand, (brand_x, brand_y), brand)

    draw = ImageDraw.Draw(background)
    title = "拓扑五子棋"
    title_font = ImageFont.truetype(str(TITLE_FONT), 172)
    title_bbox = draw.textbbox((0, 0), title, font=title_font, stroke_width=2)
    title_x = round(SIZE[0] / 2 - (title_bbox[0] + title_bbox[2]) / 2)
    title_y = 624
    title_bounds = (
        title_x + title_bbox[0],
        title_y + title_bbox[1],
        title_x + title_bbox[2],
        title_y + title_bbox[3],
    )
    assert_inside_canvas(title_bounds, "title")
    draw.text((title_x, title_y), title, font=title_font, fill=INK, stroke_width=2, stroke_fill=INK)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    background.save(OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({background.width}x{background.height})")


if __name__ == "__main__":
    main()
