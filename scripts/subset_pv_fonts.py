"""Build deterministic Topo Serif subsets for the chapter teaser PV.

The application and the PV intentionally keep separate subsets: adding trailer
copy must not silently change the shipped game package. Both WOFF2 (browser
preview) and static TTF (offline Canvas renderer) are generated from the same
licensed Noto Serif SC variable source.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
PV_ROOT = ROOT / "video" / "chapter-teaser"
FONT_ROOT = PV_ROOT / "assets" / "fonts"
TEXT_EXTENSIONS = {".html", ".css", ".js", ".json", ".md", ".srt", ".ass"}
WEIGHTS = (400, 600, 700)
DEFAULT_WINDOWS_SOURCE = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")


def required_codepoints() -> set[int]:
    codepoints = set(range(0x20, 0x7F))
    for path in PV_ROOT.rglob("*"):
        if (
            not path.is_file()
            or path.suffix.lower() not in TEXT_EXTENSIONS
            or FONT_ROOT in path.parents
        ):
            continue
        codepoints.update(
            ord(character)
            for character in path.read_text(encoding="utf-8")
            if ord(character) > 0x7F
        )
    return codepoints


def static_font(source: Path, weight: int, codepoints: set[int], flavor: str | None) -> TTFont:
    font = TTFont(source, recalcTimestamp=False)
    if "fvar" not in font:
        raise ValueError(f"Expected a variable font with a wght axis: {source}")
    font = instantiateVariableFont(font, {"wght": weight}, inplace=False, optimize=True)
    font.recalcTimestamp = False

    options = subset.Options()
    options.flavor = flavor
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.flavor = flavor
    return font


def save_font(source: Path, weight: int, codepoints: set[int], flavor: str | None) -> Path:
    suffix = "woff2" if flavor == "woff2" else "ttf"
    output = FONT_ROOT / f"topo-serif-pv-{weight}.{suffix}"
    font = static_font(source, weight, codepoints, flavor)
    font.save(output, reorderTables=False)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(os.environ.get("TOPO_SERIF_SOURCE", DEFAULT_WINDOWS_SOURCE)),
        help="path to the full NotoSerifSC variable TTF",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Full Noto Serif SC source font not found: {source}")
    FONT_ROOT.mkdir(parents=True, exist_ok=True)
    codepoints = required_codepoints()
    for weight in WEIGHTS:
        for flavor in ("woff2", None):
            output = save_font(source, weight, codepoints, flavor)
            print(f"generated {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")
    print(f"covered {len(codepoints)} codepoints")


if __name__ == "__main__":
    main()
