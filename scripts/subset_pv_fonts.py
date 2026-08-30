"""Build deterministic serif and subtitle-sans subsets for the teaser PV.

The application and the PV intentionally keep separate subsets: adding trailer
copy must not silently change the shipped game package. Both WOFF2 (browser
preview) and static TTF (offline Canvas renderer) are generated from licensed
Noto Serif SC and Noto Sans SC variable sources. The serif family keeps all
three display weights; subtitles use the dedicated sans-serif 600 weight.
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
SERIF_WEIGHTS = (400, 600, 700)
SANS_WEIGHTS = (600,)
DEFAULT_WINDOWS_SERIF_SOURCE = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")
DEFAULT_WINDOWS_SANS_SOURCE = Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")


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


def rename_family(font: TTFont, family_name: str, weight: int) -> None:
    """Give each subset a stable project-local family name.

    CSS and node-canvas can alias a font file externally, but libass resolves the
    family stored in the TTF name table. Keeping both names aligned prevents a
    silent fallback to a system CJK font during the final subtitle burn.
    """

    subfamily = {400: "Regular", 600: "SemiBold", 700: "Bold"}[weight]
    postscript_family = family_name.replace(" ", "")
    replacements = {
        1: family_name,
        2: subfamily,
        3: f"{family_name} {subfamily} 1.0",
        4: f"{family_name} {subfamily}",
        6: f"{postscript_family}-{subfamily}",
        16: family_name,
        17: subfamily,
    }
    name_table = font["name"]
    platforms = {
        (record.platformID, record.platEncID, record.langID)
        for record in name_table.names
    }
    for name_id, value in replacements.items():
        for platform_id, encoding_id, language_id in platforms:
            name_table.setName(value, name_id, platform_id, encoding_id, language_id)


def static_font(
    source: Path,
    family_name: str,
    weight: int,
    codepoints: set[int],
    flavor: str | None,
) -> TTFont:
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
    rename_family(font, family_name, weight)
    font.flavor = flavor
    return font


def save_font(
    source: Path,
    family_slug: str,
    family_name: str,
    weight: int,
    codepoints: set[int],
    flavor: str | None,
) -> Path:
    suffix = "woff2" if flavor == "woff2" else "ttf"
    output = FONT_ROOT / f"topo-{family_slug}-pv-{weight}.{suffix}"
    font = static_font(source, family_name, weight, codepoints, flavor)
    font.save(output, reorderTables=False)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(os.environ.get("TOPO_SERIF_SOURCE", DEFAULT_WINDOWS_SERIF_SOURCE)),
        help="path to the full NotoSerifSC variable TTF",
    )
    parser.add_argument(
        "--sans-source",
        type=Path,
        default=Path(os.environ.get("TOPO_SANS_SOURCE", DEFAULT_WINDOWS_SANS_SOURCE)),
        help="path to the full NotoSansSC variable TTF",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    serif_source = args.source.expanduser().resolve()
    sans_source = args.sans_source.expanduser().resolve()
    if not serif_source.is_file():
        raise FileNotFoundError(f"Full Noto Serif SC source font not found: {serif_source}")
    if not sans_source.is_file():
        raise FileNotFoundError(f"Full Noto Sans SC source font not found: {sans_source}")
    FONT_ROOT.mkdir(parents=True, exist_ok=True)
    codepoints = required_codepoints()
    families = (
        ("serif", "Topo Serif PV", serif_source, SERIF_WEIGHTS),
        ("sans", "Topo Sans PV", sans_source, SANS_WEIGHTS),
    )
    for family_slug, family_name, source, weights in families:
        for weight in weights:
            for flavor in ("woff2", None):
                output = save_font(source, family_slug, family_name, weight, codepoints, flavor)
                print(f"generated {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")
    print(f"covered {len(codepoints)} codepoints")


if __name__ == "__main__":
    main()
