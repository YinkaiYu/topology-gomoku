"""Contract tests for the configurable font-subset command."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "subset_display_fonts.py"
SPEC = importlib.util.spec_from_file_location("subset_display_fonts", SCRIPT)
assert SPEC and SPEC.loader
FONT_TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FONT_TOOL)


class FontSubsetCommandTests(unittest.TestCase):
    def test_defaults_preserve_h5_woff2_contract(self) -> None:
        args = FONT_TOOL.parse_args([])

        self.assertIsNone(args.text_roots)
        self.assertEqual(args.output_dir, FONT_TOOL.FONT_ROOT)
        self.assertEqual(args.format, "woff2")
        self.assertEqual(
            FONT_TOOL.output_path(args.output_dir, 600, args.format),
            FONT_TOOL.FONT_ROOT / "noto-serif-sc-600.woff2",
        )

    def test_platform_roots_can_repeat_and_select_ttf_output(self) -> None:
        args = FONT_TOOL.parse_args(
            [
                "--text-root",
                "app",
                "--text-root",
                "wechat",
                "--output-dir",
                "wechat/fonts",
                "--format",
                "ttf",
            ]
        )

        self.assertEqual(args.text_roots, [Path("app"), Path("wechat")])
        self.assertEqual(FONT_TOOL.resolve_repo_path(args.output_dir), ROOT / "wechat" / "fonts")
        self.assertEqual(
            FONT_TOOL.output_path(Path("wechat/fonts"), 700, args.format),
            Path("wechat/fonts/noto-serif-sc-700.ttf"),
        )

    def test_required_codepoints_combines_all_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            first = temporary_root / "first"
            second = temporary_root / "second"
            first.mkdir()
            second.mkdir()
            (first / "copy.js").write_text("棋", encoding="utf-8")
            (second / "copy.json").write_text('"谱"', encoding="utf-8")
            (second / "ignored.txt").write_text("略", encoding="utf-8")

            codepoints = FONT_TOOL.required_codepoints([first, second])

        self.assertIn(ord("A"), codepoints)
        self.assertIn(ord("棋"), codepoints)
        self.assertIn(ord("谱"), codepoints)
        self.assertNotIn(ord("略"), codepoints)


if __name__ == "__main__":
    unittest.main()
