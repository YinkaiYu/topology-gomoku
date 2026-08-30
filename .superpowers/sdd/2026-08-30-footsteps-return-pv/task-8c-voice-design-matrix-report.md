# Task 8C VoiceDesign matrix report

## Outcome and safety boundary

The audition manifest now contains A–I. Existing A/B/C files and every pre-existing metadata value remain unchanged; only the additive `auditionId` labels A/B/C were introduced. D–I are six original synthetic Mandarin male voices generated without a named speaker, reference audio, reference text, clone prompt, performer name, character name or fallback model. The generated WAVs remain ignored local review artifacts under `video/footsteps-return/captures/voice-auditions/` and require human review.

## RED evidence

The first clean focused RED run was made before adding production configuration, evidence, verifier behavior or WAVs:

- `node --test tests/pv-voice-auditions.test.js`: 4 passed and 3 failed because `voiceDesign`, immutable VoiceDesign evidence and A–I manifest entries were absent.
- `uv run --locked python -m unittest tests/test_qwen_voice_auditions.py -v`: 5 passed and 3 failed because the official VoiceDesign helper, nine-output manifest and D static contract were absent.
- After the static implementation, `uv run --locked python video/footsteps-return/scripts/generate_voice_auditions.py --verify` failed on the first missing real artifact, `deep-baritone.wav`, after static config/license/manifest validation. This prevented placeholder metadata from satisfying the public verifier.

## Model and license evidence

- Package: `qwen-tts==0.1.1`, Apache-2.0, distribution SHA-256 `11a290d8dabc7ef91a90c54478c8ab19b3edb1d85c0882313721892bdc4af15d`.
- Official model: `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`.
- Immutable revision: `0e711a1c0aa5aad30654426e0d11f67716c1211e`.
- Revision URL: <https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/tree/0e711a1c0aa5aad30654426e0d11f67716c1211e>.
- Raw model-card URL: <https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/raw/0e711a1c0aa5aad30654426e0d11f67716c1211e/README.md>.
- Raw model-card SHA-256: `621b7e88f1867bc03d817176fc1f7f55f4b5a70654b2a07fdcda1e169efb024b`.
- Saved line-trimmed, LF-normalized model-card SHA-256: `cef0ef3f5366898466254afaebddb4ba1cd2e9d6dad376a3705b55cfcc8e0f92`.
- Saved evidence: `video/footsteps-return/assets/licenses/audio/qwen3-tts-license-evidence.json` and `video/footsteps-return/assets/licenses/audio/qwen3-tts-voice-design-model-card-0e711a1.md`.

The saved official model card declares `license: apache-2.0`, identifies the 1.7B VoiceDesign checkpoint, and documents `generate_voice_design`. Generation used that public method directly. It did not call CustomVoice, Base, `generate_voice_clone`, `create_voice_clone_prompt` or any reference-audio path for D–I.

## Controlled generation

- CPU: AMD Ryzen 5 9600X, `device_map="cpu"`, FP32, eager attention.
- Fixed seed: `83001` for every D–I sample.
- Shared sampling: `max_new_tokens=512`, `do_sample=true`, `top_k=50`, `temperature=1.0`, `repetition_penalty=1.05`.
- Exact shared text: `人们总把棋盘的边缘视作尽头。可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻。`
- Each instruction is the distinct committed `timbreClause` immediately followed by the same committed UTF-8 `sharedDeliveryClause` bytes.
- Normalization: 48 kHz, mono, PCM-16, target RMS −22 dBFS, peak ceiling −7 dBFS.

The initial immutable snapshot download took about 175 seconds for the 3.83 GB main model and 682 MB speech tokenizer. Model loading took 4.720 seconds. D–I inference totaled 487.042 seconds; download + load + inference was about 666.762 seconds before small file/validation overhead.

| Audition | Local ignored WAV | Inference | Duration | Peak dBFS | RMS dBFS | SHA-256 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| D `deep-baritone` | `video/footsteps-return/captures/voice-auditions/deep-baritone.wav` | 84.059 s | 12.64 s | −7.0000 | −22.0000 | `74bf906ce67f509e6896421e191fbf5a3e1858ce1525f4350781b3d5ac4f40b3` |
| E `epic-narrator` | `video/footsteps-return/captures/voice-auditions/epic-narrator.wav` | 77.724 s | 12.24 s | −7.0000 | −22.0000 | `95c71ea27fc3cd2e331a4d54f55a4961f2ea3583cbfe9945b41224743a552646` |
| F `cold-witness` | `video/footsteps-return/captures/voice-auditions/cold-witness.wav` | 91.713 s | 13.92 s | −7.0000 | −22.0000 | `b2c5fc6282a462c30e7d558870e7bff855a0102c8f42cb7810c0182b37a368b5` |
| G `warm-scholar` | `video/footsteps-return/captures/voice-auditions/warm-scholar.wav` | 76.939 s | 12.32 s | −7.0006 | −22.0000 | `d96af3e73b229ea56cbdb54d983c3eedff3a346d32b5c1e85ff6977a4d3b0f82` |
| H `weathered-traveler` | `video/footsteps-return/captures/voice-auditions/weathered-traveler.wav` | 85.810 s | 13.28 s | −7.0000 | −22.0000 | `2824193a0eb56ebe25bbffa19d530956db462551dc31b6798996cfdc3655e7a0` |
| I `resolute-guide` | `video/footsteps-return/captures/voice-auditions/resolute-guide.wav` | 70.797 s | 11.36 s | −7.0006 | −22.0000 | `2b0ecde791fea44d0ef0d12abcff584188210d68e118831d0476a5c1b39bd8b6` |

A/B/C retained their previous hashes `ae6a9ee2c7d7f78eea40708ac668c55adbe53f726975748e26dac9be8e4dde7d`, `ac8ab5118d19e4f127b9d4bc5590c6254d57a01f72c5721efad133c101d85e6b` and `9a87dcfd69ce94d474cd86bd76abdc0dabe3f78af7e82c9a62a6a4bc239e52c8` respectively. A comparison against base `794d9bcc92880e76dac457bc325474802774a40f` confirmed all prior A/B/C metadata values and local WAV bytes are unchanged.

## GREEN evidence

- Required-artifact Node run with `REQUIRE_PV_VOICE_AUDITIONS=1`: 7/7 passed, no skips.
- Focused Python run: 8/8 passed.
- Public verifier: `{"event": "auditions-verified", "count": 9}`.
- Full `npm test`: 163/163 passed, no failures or skips.
- `npm run docs:check`: passed for 48 Markdown files.
- `git diff --check`: exited 0.
- Every A–I WAV decoded as non-silent 48 kHz mono PCM-16 and matched the committed duration, peak, RMS and SHA-256. D–I RMS spread is 0 dB and peak spread is 0.0006 dB.

## Subjective limits

Automated checks establish provenance, path safety, deterministic controls, audio validity and level matching; they do not establish that a timbre sounds sufficiently low, weighty, cold, solemn, restrained, cinematic or distinct in human perception. No audition is approved by this task. A human must listen to D–I, compare diction, phrase endings, identity separation and emotional restraint, and explicitly select or reject a voice before any later full-batch narration work. The rejected C remains in this audition-only manifest for matrix completeness and is not made a dependency of later full-batch generation.
