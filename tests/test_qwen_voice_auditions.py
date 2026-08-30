import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = ROOT / "video" / "footsteps-return" / "scripts" / "generate_voice_auditions.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_voice_auditions", GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeSpeechTokenizer:
    def decode(self, encoded):
        return [[0.2, -0.2, 0.1, -0.1]], 24000


class FakeOfficialCoreModel:
    tts_model_type = "custom_voice"
    tts_model_size = "0b6"
    speech_tokenizer = FakeSpeechTokenizer()

    def __init__(self):
        self.request = None

    def generate(self, **kwargs):
        if not kwargs["instruct_ids"] or kwargs["instruct_ids"][0] is None:
            raise AssertionError("0.6B performance instruction was discarded")
        self.request = kwargs
        return [[11, 12, 13]], None


class FakeOfficialWrapper:
    def __init__(self):
        self.model = FakeOfficialCoreModel()

    @staticmethod
    def _ensure_list(value):
        return value if isinstance(value, list) else [value]

    @staticmethod
    def _build_assistant_text(value):
        return f"assistant:{value}"

    @staticmethod
    def _build_instruct_text(value):
        return f"instruct:{value}"

    @staticmethod
    def _tokenize_texts(values):
        return [f"tokens:{value}" for value in values]

    @staticmethod
    def _merge_generate_kwargs(**kwargs):
        return kwargs

    @staticmethod
    def _validate_languages(languages):
        if languages != ["Chinese"]:
            raise AssertionError(languages)

    @staticmethod
    def _validate_speakers(speakers):
        if speakers != ["Uncle_Fu"]:
            raise AssertionError(speakers)


class QwenVoiceAuditionTests(unittest.TestCase):
    def test_pinned_snapshot_download_avoids_windows_symlink_probe_race(self):
        self.assertTrue(GENERATOR_PATH.exists(), "Qwen audition generator must exist")
        generator = load_generator()
        self.assertTrue(hasattr(generator, "download_pinned_snapshot"), "pinned snapshot helper must exist")
        observed = None

        def fake_download(model_id, **kwargs):
            nonlocal observed
            observed = (model_id, kwargs)
            return f"C:/cache/snapshots/{kwargs['revision']}"

        snapshot = generator.download_pinned_snapshot(
            fake_download,
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            "85e237c12c027371202489a0ec509ded67b5e4b5",
        )

        self.assertEqual(snapshot.name, "85e237c12c027371202489a0ec509ded67b5e4b5")
        self.assertEqual(observed[1]["revision"], "85e237c12c027371202489a0ec509ded67b5e4b5")
        self.assertEqual(observed[1]["max_workers"], 1)

    def test_0b6_instruction_reaches_official_core_generation(self):
        self.assertTrue(GENERATOR_PATH.exists(), "Qwen audition generator must exist")
        generator = load_generator()
        wrapper = FakeOfficialWrapper()

        waves, sample_rate = generator.generate_custom_voice_with_instruction(
            wrapper,
            text="人们总把棋盘的边缘视作尽头。",
            instruction="用成熟清晰、克制庄重的标准普通话朗读。",
            speaker="Uncle_Fu",
            language="Chinese",
            max_new_tokens=128,
        )

        self.assertEqual(sample_rate, 24000)
        self.assertEqual(waves, [[0.2, -0.2, 0.1, -0.1]])
        self.assertEqual(wrapper.model.request["instruct_ids"], ["tokens:instruct:用成熟清晰、克制庄重的标准普通话朗读。"])
        self.assertEqual(wrapper.model.request["speakers"], ["Uncle_Fu"])
        self.assertEqual(wrapper.model.request["languages"], ["Chinese"])


if __name__ == "__main__":
    unittest.main()
