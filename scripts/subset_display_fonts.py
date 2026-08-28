"""Build deterministic static WOFF2 subsets for every display-font weight.

Requires fontTools with Brotli support. Pass a full Noto Serif SC variable font
with --source or set TOPO_SERIF_SOURCE. The generated subsets include printable
ASCII plus every non-ASCII character present in shared H5 and native WeChat
text sources.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
WECHAT_ROOT = ROOT / "wechat"
FONT_ROOT = APP_ROOT / "assets" / "fonts"
TEXT_EXTENSIONS = {".html", ".css", ".js", ".json"}
WEIGHTS = (400, 600, 700)
DEFAULT_WINDOWS_SOURCE = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")


def required_codepoints() -> set[int]:
    codepoints = set(range(0x20, 0x7F))
    for source_root in (APP_ROOT, WECHAT_ROOT):
        if not source_root.exists():
            continue
        for path in source_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            codepoints.update(ord(character) for character in path.read_text(encoding="utf-8") if ord(character) > 0x7F)
    return codepoints


def build_subset(source: Path, weight: int, codepoints: set[int]) -> Path:
    font = TTFont(source, recalcTimestamp=False)
    if "fvar" not in font:
        raise ValueError(f"Expected a variable font with a wght axis: {source}")
    font = instantiateVariableFont(font, {"wght": weight}, inplace=False, optimize=True)
    font.recalcTimestamp = False

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.flavor = "woff2"

    output = FONT_ROOT / f"noto-serif-sc-{weight}.woff2"
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
    codepoints = required_codepoints()
    for weight in WEIGHTS:
        output = build_subset(source, weight, codepoints)
        print(f"generated {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")
    print(f"covered {len(codepoints)} codepoints")


if __name__ == "__main__":
    main()
