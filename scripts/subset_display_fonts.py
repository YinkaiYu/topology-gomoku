"""Build deterministic static subsets for every display-font weight.

Requires fontTools (and Brotli when generating WOFF2). Pass a full Noto Serif SC
variable font with --source or set TOPO_SERIF_SOURCE. By default the generated
WOFF2 subsets include printable ASCII plus every non-ASCII character present in
app text sources. Platform builds can supply repeated --text-root arguments, a
dedicated --output-dir and --format ttf without changing the H5 defaults.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Sequence

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
FONT_ROOT = APP_ROOT / "assets" / "fonts"
TEXT_EXTENSIONS = {".html", ".css", ".js", ".json"}
WEIGHTS = (400, 600, 700)
OUTPUT_FORMATS = ("woff2", "ttf")
DEFAULT_WINDOWS_SOURCE = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")


def resolve_repo_path(path: Path) -> Path:
    """Resolve user-facing paths relative to the repository root."""
    expanded = path.expanduser()
    return (ROOT / expanded).resolve() if not expanded.is_absolute() else expanded.resolve()


def required_codepoints(text_roots: Sequence[Path]) -> set[int]:
    codepoints = set(range(0x20, 0x7F))
    for text_root in text_roots:
        for path in text_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            codepoints.update(
                ord(character)
                for character in path.read_text(encoding="utf-8")
                if ord(character) > 0x7F
            )
    return codepoints


def output_path(output_dir: Path, weight: int, output_format: str) -> Path:
    return output_dir / f"noto-serif-sc-{weight}.{output_format}"


def build_subset(
    source: Path,
    weight: int,
    codepoints: set[int],
    output_dir: Path,
    output_format: str,
) -> Path:
    font = TTFont(source, recalcTimestamp=False)
    if "fvar" not in font:
        raise ValueError(f"Expected a variable font with a wght axis: {source}")
    font = instantiateVariableFont(font, {"wght": weight}, inplace=False, optimize=True)
    font.recalcTimestamp = False

    options = subset.Options()
    options.flavor = output_format if output_format == "woff2" else None
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.flavor = output_format if output_format == "woff2" else None

    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_path(output_dir, weight, output_format)
    font.save(output, reorderTables=False)
    return output


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build deterministic Noto Serif SC subsets for the game runtime."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(os.environ.get("TOPO_SERIF_SOURCE", DEFAULT_WINDOWS_SOURCE)),
        help="path to the full NotoSerifSC variable TTF",
    )
    parser.add_argument(
        "--text-root",
        action="append",
        type=Path,
        dest="text_roots",
        metavar="PATH",
        help="text source directory relative to the repository root; repeat to combine roots",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=FONT_ROOT,
        metavar="PATH",
        help="output directory relative to the repository root (default: app/assets/fonts)",
    )
    parser.add_argument(
        "--format",
        choices=OUTPUT_FORMATS,
        default="woff2",
        help="generated font format (default: woff2)",
    )
    return parser.parse_args(argv)


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def main() -> None:
    args = parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Full Noto Serif SC source font not found: {source}")
    text_roots = [resolve_repo_path(path) for path in (args.text_roots or [APP_ROOT])]
    for text_root in text_roots:
        if not text_root.is_dir():
            raise NotADirectoryError(f"Text root not found or not a directory: {text_root}")
    output_dir = resolve_repo_path(args.output_dir)
    codepoints = required_codepoints(text_roots)
    for weight in WEIGHTS:
        output = build_subset(source, weight, codepoints, output_dir, args.format)
        print(f"generated {display_path(output)} ({output.stat().st_size} bytes)")
    print(f"covered {len(codepoints)} codepoints")


if __name__ == "__main__":
    main()
