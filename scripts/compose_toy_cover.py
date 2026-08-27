from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = ROOT / "promo" / "assets" / "toy-cover-background-v1.png"
BRAND = ROOT / "app" / "assets" / "brand-icon.png"
OUTPUT = ROOT / "promo" / "exports" / "topology-gomoku-toy-cover-4x3.png"
QA_SQUARE_CROP = ROOT / "artifacts" / "qa-toy-cover-square-safe-v2.png"
TITLE_FONT = Path("C:/Windows/Fonts/STZHONGS.TTF")

SIZE = (1200, 900)
SAFE_BOX = (150, 0, 1050, 900)
INK = "#21302c"


def assert_inside_safe_box(bounds: tuple[int, int, int, int], label: str) -> None:
    left, top, right, bottom = bounds
    safe_left, safe_top, safe_right, safe_bottom = SAFE_BOX
    if left < safe_left or top < safe_top or right > safe_right or bottom > safe_bottom:
        raise ValueError(f"{label} escapes the centered 1:1 safe area: {bounds}")


def main() -> None:
    background = Image.open(BACKGROUND).convert("RGB")
    background = ImageOps.fit(background, SIZE, method=Image.Resampling.LANCZOS)

    draw = ImageDraw.Draw(background)
    title = "拓扑五子棋"
    title_font = ImageFont.truetype(str(TITLE_FONT), 168)
    title_bbox = draw.textbbox((0, 0), title, font=title_font, stroke_width=2)
    title_x = round(SIZE[0] / 2 - (title_bbox[0] + title_bbox[2]) / 2)
    title_y = 42
    title_bounds = (
        title_x + title_bbox[0],
        title_y + title_bbox[1],
        title_x + title_bbox[2],
        title_y + title_bbox[3],
    )
    assert_inside_safe_box(title_bounds, "title")
    draw.text((title_x, title_y), title, font=title_font, fill=INK, stroke_width=2, stroke_fill=INK)

    brand = Image.open(BRAND).convert("RGBA")
    brand.thumbnail((530, 530), Image.Resampling.LANCZOS)
    brand_x = (SIZE[0] - brand.width) // 2
    brand_y = 286
    alpha_bounds = brand.getchannel("A").getbbox() or (0, 0, brand.width, brand.height)
    brand_bounds = (
        brand_x + alpha_bounds[0],
        brand_y + alpha_bounds[1],
        brand_x + alpha_bounds[2],
        brand_y + alpha_bounds[3],
    )
    assert_inside_safe_box(brand_bounds, "brand mark")
    background.paste(brand, (brand_x, brand_y), brand)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    background.save(OUTPUT, format="PNG", optimize=True)
    QA_SQUARE_CROP.parent.mkdir(parents=True, exist_ok=True)
    background.crop(SAFE_BOX).save(QA_SQUARE_CROP, format="PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({background.width}x{background.height})")
    print(f"Wrote {QA_SQUARE_CROP} (centered 1:1 safety crop)")


if __name__ == "__main__":
    main()
