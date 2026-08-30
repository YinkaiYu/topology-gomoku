from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest

import numpy as np
import soundfile as sf


ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = ROOT / "video" / "footsteps-return" / "scripts" / "generate_final_voiceover.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_final_voiceover", GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FinalVoiceoverContractTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(GENERATOR_PATH.is_file(), "the final VoiceDesign generator must exist")
        self.generator = load_generator()

    def load_contract(self):
        generator = self.generator
        return (
            generator.read_json(generator.FINAL_CONFIG_PATH),
            generator.read_json(generator.SCRIPT_PATH),
            generator.read_json(generator.AUDITION_CONFIG_PATH),
            generator.read_json(generator.AUDITION_MANIFEST_PATH),
        )

    def test_seed_derivation_is_bound_to_base_index_and_cue_id(self):
        expected = [
            ("intro-boundary", 1803012708),
            ("intro-roads", 1279274001),
            ("intro-invitation", 1799362060),
            ("plane-order", 1569261575),
            ("cylinder-cycle", 1792442127),
            ("cylinder-distance", 273778121),
            ("torus-cycles", 1622475403),
            ("torus-shortest-path", 497495445),
            ("mobius-turn", 1804224669),
            ("mobius-one-side", 965176795),
            ("klein-two-returns", 1855326299),
            ("klein-memory", 545355154),
            ("projective-reflection", 982094031),
            ("projective-twin", 2061565332),
            ("sphere-closure", 10234720),
            ("sphere-map", 591676504),
            ("sphere-boundary", 1463021511),
            ("outro-invocation", 1165219178),
            ("outro-connection", 315395075),
            ("outro-stone", 769022107),
            ("outro-world", 1699742640),
        ]
        actual = [
            (cue_id, self.generator.derive_cue_seed(83001, index, cue_id))
            for index, (cue_id, _seed) in enumerate(expected)
        ]
        self.assertEqual(actual, expected)

    def test_contract_rejects_clone_fallback_identity_drift_and_script_mutation(self):
        config, script, auditions, manifest = self.load_contract()
        self.generator.validate_contract(config, script, auditions, manifest)
        mutations = {
            "reference-audio": lambda value: value[0]["model"].__setitem__("referenceAudio", "reference.wav"),
            "speaker": lambda value: value[0]["model"].__setitem__("speaker", "named-speaker"),
            "clone-method": lambda value: value[0]["model"].__setitem__("generationMethod", "generate_voice_clone"),
            "fallback": lambda value: value[0].__setitem__("fallback", {"engine": "espeak"}),
            "timbre-drift": lambda value: value[0]["voiceDesign"].__setitem__("timbreClause", "不同声线。"),
            "script-text": lambda value: value[1]["cues"][0].__setitem__("text", "改写台词。"),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                values = [copy.deepcopy(value) for value in (config, script, auditions, manifest)]
                mutate(values)
                with self.assertRaisesRegex(ValueError, "VoiceDesign|audition|fallback|reference|speaker|clone|timbre|script|cue|text"):
                    self.generator.validate_contract(*values)

    def test_atomic_replacement_preserves_the_old_cue_until_candidate_validation_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = pathlib.Path(directory) / "intro-boundary.wav"
            destination.write_bytes(b"preserve-old-cue")
            samples = np.tile(np.array([0.2, -0.2], dtype=np.float32), 2400)

            def reject(candidate):
                self.assertTrue(candidate.is_file())
                raise ValueError("candidate rejected")

            with self.assertRaisesRegex(ValueError, "candidate rejected"):
                self.generator.atomic_write_wav(destination, samples, 48000, validator=reject)
            self.assertEqual(destination.read_bytes(), b"preserve-old-cue")
            self.assertEqual(list(destination.parent.glob(".*.pending.wav")), [])

            measurement = self.generator.atomic_write_wav(
                destination,
                samples,
                48000,
                validator=self.generator.measure_wave,
            )
            self.assertEqual(destination.read_bytes()[:4], b"RIFF")
            self.assertEqual(measurement["sampleRateHz"], 48000)
            self.assertEqual(measurement["channels"], 1)
            self.assertEqual(measurement["subtype"], "PCM_16")

    def test_asr_normalization_removes_only_declared_punctuation_and_never_repairs_topology_names(self):
        self.assertEqual(self.generator.normalize_asr_text(" 莫比乌斯，边界！\n"), "莫比乌斯边界")
        self.assertEqual(self.generator.normalize_asr_text("方庭。克莱因瓶？"), "方庭克莱因瓶")
        self.assertNotEqual(self.generator.normalize_asr_text("莫比欧斯边界"), "莫比乌斯边界")
        distance, cer = self.generator.character_error_rate("莫比乌斯边界", "莫比欧斯边界")
        self.assertEqual(distance, 1)
        self.assertAlmostEqual(cer, 1 / 6)

    def test_continuous_review_places_each_dry_cue_at_its_measured_timeline_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            first = root / "first.wav"
            second = root / "second.wav"
            sf.write(first, np.full(4800, 0.125, dtype=np.float32), 48000, subtype="PCM_16")
            sf.write(second, np.full(4800, -0.125, dtype=np.float32), 48000, subtype="PCM_16")
            timing = {
                "masterDurationSeconds": 1.0,
                "cues": [
                    {"id": "first", "outputFile": "first.wav", "timelineStartSeconds": 0.1, "timelineEndSeconds": 0.2},
                    {"id": "second", "outputFile": "second.wav", "timelineStartSeconds": 0.5, "timelineEndSeconds": 0.6},
                ],
            }
            destination = root / "review.wav"
            metadata = self.generator.build_continuous_review(timing, destination, root=root)
            samples, sample_rate = sf.read(destination, dtype="float64")
            self.assertEqual(sample_rate, 48000)
            self.assertEqual(len(samples), 48000)
            self.assertTrue(np.allclose(samples[:4800], 0))
            self.assertTrue(np.all(samples[4800:9600] > 0))
            self.assertTrue(np.allclose(samples[9600:24000], 0))
            self.assertTrue(np.all(samples[24000:28800] < 0))
            self.assertTrue(np.allclose(samples[28800:], 0))
            self.assertEqual(metadata["durationSeconds"], 1.0)
            self.assertRegex(metadata["sha256"], r"^[a-f0-9]{64}$")


if __name__ == "__main__":
    unittest.main()
