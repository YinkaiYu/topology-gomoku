import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare the official IOP roundel for deterministic cover composition.")
    parser.add_argument("source", type=Path, help="High-resolution square PNG rendered from the official IOP PDF.")
    parser.add_argument("output", type=Path, help="Destination transparent PNG.")
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGBA")
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    logo = source.crop((left, top, left + side, top + side))

    mask = Image.new("L", logo.size, 0)
    draw = ImageDraw.Draw(mask)
    inset = max(2, side // 300)
    draw.ellipse((inset, inset, side - inset - 1, side - inset - 1), fill=255)
    logo.putalpha(mask)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    logo.save(args.output, format="PNG", optimize=True)
    print(f"Wrote {args.output} ({logo.width}x{logo.height})")


if __name__ == "__main__":
    main()
