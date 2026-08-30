from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import pathlib
import random
import time
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[3]
PV_ROOT = ROOT / "video" / "footsteps-return"
CONFIG_PATH = PV_ROOT / "audio" / "voiceover" / "auditions.json"
MANIFEST_PATH = PV_ROOT / "audio" / "voiceover" / "audition-manifest.json"
LICENSE_EVIDENCE_PATH = PV_ROOT / "assets" / "licenses" / "audio" / "qwen3-tts-license-evidence.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    return sha256_bytes(path.read_bytes())


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def generate_custom_voice_with_instruction(
    tts: Any,
    *,
    text: str,
    instruction: str,
    speaker: str,
    language: str,
    **generation_kwargs: Any,
) -> tuple[list[Any], int]:
    """Route 0.6B CustomVoice instructions into the official core generator.

    qwen-tts 0.1.1 clears ``instruct`` for 0.6B in its public wrapper even
    though the pinned official model card documents 0.6B instruction control.
    This is the same official wrapper path after that single lossy branch.
    """
    if tts.model.tts_model_type != "custom_voice":
        raise ValueError("the pinned checkpoint must be a CustomVoice model")
    texts = tts._ensure_list(text)
    languages = tts._ensure_list(language)
    speakers = tts._ensure_list(speaker)
    instructions = tts._ensure_list(instruction)
    if not (len(texts) == len(languages) == len(speakers) == len(instructions) == 1):
        raise ValueError("auditions generate exactly one text, language, speaker and instruction at a time")
    if not instructions[0].strip():
        raise ValueError("a non-empty performance instruction is required")
    tts._validate_languages(languages)
    tts._validate_speakers(speakers)
    input_ids = tts._tokenize_texts([tts._build_assistant_text(value) for value in texts])
    instruct_ids = tts._tokenize_texts([tts._build_instruct_text(value) for value in instructions])
    generate_kwargs = tts._merge_generate_kwargs(**generation_kwargs)
    talker_codes, _ = tts.model.generate(
        input_ids=input_ids,
        instruct_ids=instruct_ids,
        languages=languages,
        speakers=speakers,
        non_streaming_mode=True,
        **generate_kwargs,
    )
    waves, sample_rate = tts.model.speech_tokenizer.decode(
        [{"audio_codes": codes} for codes in talker_codes]
    )
    return waves, sample_rate


def validate_contract(config: dict[str, Any]) -> None:
    script_path = ROOT / config["textSource"]["scriptPath"]
    script = read_json(script_path)
    cue_ids = config["textSource"]["cueIds"]
    selected = [cue["text"] for cue in script["cues"] if cue["id"] in cue_ids]
    if cue_ids != ["intro-boundary"] or selected != [config["textSource"]["text"]]:
        raise ValueError("audition text must remain the exact committed intro-boundary cue")
    model = config["model"]
    if model["id"] != "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice":
        raise ValueError("only the official 0.6B CustomVoice checkpoint is allowed")
    if model["speaker"] != "Uncle_Fu" or model["referenceAudio"] is not None:
        raise ValueError("auditions require built-in Uncle_Fu with no reference audio")
    if model["device"] != "cpu" or model["language"] != "Chinese":
        raise ValueError("this audition contract is fixed to Chinese CPU inference")
    styles = config["styles"]
    if [style["id"] for style in styles] != ["documentary", "adventure", "contemplative"]:
        raise ValueError("exactly the three approved performance styles are required")
    if any(not style["instruction"].strip() for style in styles):
        raise ValueError("every performance style requires a natural-language instruction")
    if len({style["seed"] for style in styles}) != 1:
        raise ValueError("performance instruction must be the only generation variable across styles")
    output = config["output"]
    output_directory = (ROOT / output["directory"]).resolve()
    captures_root = (PV_ROOT / "captures").resolve()
    if not output_directory.is_relative_to(captures_root):
        raise ValueError("audition WAVs must stay under the ignored PV captures directory")
    if (output["sampleRateHz"], output["channels"], output["subtype"]) != (48000, 1, "PCM_16"):
        raise ValueError("auditions must normalize to 48 kHz mono PCM-16")


def validate_license_evidence(config: dict[str, Any]) -> None:
    evidence = read_json(LICENSE_EVIDENCE_PATH)
    package = evidence["package"]
    model = evidence["model"]
    package_license = PV_ROOT / package["licenseFile"]
    model_card = PV_ROOT / model["modelCardFile"]
    if sha256_file(package_license) != package["licenseSha256"]:
        raise ValueError("saved qwen-tts package license hash does not match evidence")
    license_text = package_license.read_text(encoding="utf-8")
    if "Apache License" not in license_text or "TERMS AND CONDITIONS" not in license_text:
        raise ValueError("saved qwen-tts package license is incomplete")
    if sha256_file(model_card) != model["modelCardSha256"]:
        raise ValueError("saved Qwen model card hash does not match evidence")
    model_card_text = model_card.read_text(encoding="utf-8")
    if "license: apache-2.0" not in model_card_text or "Uncle_Fu" not in model_card_text:
        raise ValueError("saved Qwen model card does not substantiate license and speaker")
    if model["revision"] != config["model"]["revision"]:
        raise ValueError("license evidence and generation config must pin the same model revision")
    installed = importlib.metadata.version(package["name"])
    if installed != package["version"] or installed != config["model"]["package"]["version"]:
        raise ValueError(f"installed qwen-tts {installed} does not match the pinned evidence")


def download_pinned_snapshot(download: Any, model_id: str, revision: str) -> pathlib.Path:
    # huggingface_hub 0.36.2 has a Windows race while multiple workers populate
    # its symlink-support cache. One worker preserves the documented copy fallback.
    snapshot = pathlib.Path(download(model_id, revision=revision, max_workers=1))
    if snapshot.name != revision:
        raise ValueError(f"resolved model snapshot {snapshot.name} is not the pinned revision")
    return snapshot


def seed_everything(seed: int, torch: Any, numpy: Any) -> None:
    random.seed(seed)
    numpy.random.seed(seed)
    torch.manual_seed(seed)


def mono_resample_and_normalize(
    wave: Any,
    source_sample_rate: int,
    *,
    target_sample_rate: int,
    target_rms_dbfs: float,
    peak_ceiling_dbfs: float,
) -> Any:
    import numpy as np
    from scipy.signal import resample_poly

    samples = np.asarray(wave, dtype=np.float64).squeeze()
    if samples.ndim == 2:
        channel_axis = 0 if samples.shape[0] <= 8 else 1
        samples = samples.mean(axis=channel_axis)
    if samples.ndim != 1 or samples.size == 0:
        raise ValueError(f"expected a non-empty mono-compatible waveform, got {samples.shape}")
    if not np.all(np.isfinite(samples)):
        raise ValueError("generated waveform contains non-finite samples")
    samples = samples - float(np.mean(samples))
    if source_sample_rate != target_sample_rate:
        divisor = math.gcd(source_sample_rate, target_sample_rate)
        samples = resample_poly(
            samples,
            target_sample_rate // divisor,
            source_sample_rate // divisor,
        )
    target_rms = 10 ** (target_rms_dbfs / 20)
    peak_ceiling = 10 ** (peak_ceiling_dbfs / 20)
    for _ in range(8):
        rms = float(np.sqrt(np.mean(np.square(samples))))
        if rms <= 1e-8:
            raise ValueError("generated waveform is silent")
        samples *= target_rms / rms
        samples = np.clip(samples, -peak_ceiling, peak_ceiling)
    return samples.astype(np.float32)


def measure_wave(path: pathlib.Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    samples, sample_rate = sf.read(path, dtype="float64", always_2d=True)
    if samples.shape[1] != 1 or samples.size == 0:
        raise ValueError(f"{path} is not non-empty mono audio")
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(np.square(samples))))
    if peak <= 0 or rms <= 0:
        raise ValueError(f"{path} is silent")
    info = sf.info(path)
    return {
        "sampleRateHz": int(sample_rate),
        "channels": int(info.channels),
        "subtype": info.subtype,
        "durationSeconds": round(len(samples) / sample_rate, 6),
        "peakDbfs": round(20 * math.log10(peak), 4),
        "rmsDbfs": round(20 * math.log10(rms), 4),
        "sha256": sha256_file(path),
    }


def build_manifest(config: dict[str, Any], generated: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "status": "user-review-required",
        "configSha256": sha256_file(CONFIG_PATH),
        "text": config["textSource"]["text"],
        "model": {
            "id": config["model"]["id"],
            "revision": config["model"]["revision"],
            "package": config["model"]["package"],
            "language": config["model"]["language"],
            "speaker": config["model"]["speaker"],
        },
        "normalization": config["output"],
        "outputs": generated,
    }


def verify_outputs(manifest: dict[str, Any]) -> None:
    measured_rms = []
    measured_peak = []
    for output in manifest["outputs"]:
        path = ROOT / output["file"]
        if not path.is_file():
            raise FileNotFoundError(path)
        measurement = measure_wave(path)
        if measurement["sampleRateHz"] != 48000 or measurement["channels"] != 1 or measurement["subtype"] != "PCM_16":
            raise ValueError(f"{path} is not 48 kHz mono PCM-16")
        for key in ("durationSeconds", "peakDbfs", "rmsDbfs", "sha256"):
            if measurement[key] != output[key]:
                raise ValueError(f"stale {key} for {path}: {output[key]} != {measurement[key]}")
        measured_rms.append(measurement["rmsDbfs"])
        measured_peak.append(measurement["peakDbfs"])
    if max(measured_rms) - min(measured_rms) > 0.35:
        raise ValueError("audition RMS levels are not matched")
    if max(measured_peak) - min(measured_peak) > 3:
        raise ValueError("audition peak levels are not reasonably matched")


def verify_manifest(config: dict[str, Any], manifest: dict[str, Any]) -> None:
    validate_contract(config)
    expected_model = {
        "id": config["model"]["id"],
        "revision": config["model"]["revision"],
        "package": config["model"]["package"],
        "language": config["model"]["language"],
        "speaker": config["model"]["speaker"],
    }
    if manifest.get("schemaVersion") != 1:
        raise ValueError("manifest schema version is not supported")
    if manifest.get("configSha256") != sha256_file(CONFIG_PATH):
        raise ValueError("manifest config hash is stale")
    if manifest.get("status") != "user-review-required":
        raise ValueError("manifest status must remain user-review-required")
    if manifest.get("text") != config["textSource"]["text"]:
        raise ValueError("manifest text does not match the approved config text")
    if manifest.get("model") != expected_model:
        raise ValueError("manifest model does not match the pinned config model")
    if manifest.get("normalization") != config["output"]:
        raise ValueError("manifest normalization does not match the config")

    outputs = manifest.get("outputs")
    approved_style_ids = [style["id"] for style in config["styles"]]
    if not isinstance(outputs, list) or len(outputs) != 3:
        raise ValueError("manifest must contain exactly three approved styles")
    if [output.get("style") for output in outputs] != approved_style_ids:
        raise ValueError("manifest styles are missing, duplicated, unknown or out of order")
    for style, output in zip(config["styles"], outputs, strict=True):
        expected_static = {
            "style": style["id"],
            "instruction": style["instruction"],
            "seed": style["seed"],
            "file": f"{config['output']['directory']}/{style['id']}.wav",
            "normalizedSampleRateHz": config["output"]["sampleRateHz"],
            "channels": config["output"]["channels"],
            "subtype": config["output"]["subtype"],
            "status": "user-review-required",
        }
        for field, expected in expected_static.items():
            if output.get(field) != expected:
                raise ValueError(f"manifest {style['id']} {field} does not match the config contract")
    verify_outputs(manifest)


def generate() -> dict[str, Any]:
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    config = read_json(CONFIG_PATH)
    validate_contract(config)
    validate_license_evidence(config)
    if config["model"]["revision"] == "main":
        raise ValueError("model revision must be immutable")
    output_directory = ROOT / config["output"]["directory"]
    output_directory.mkdir(parents=True, exist_ok=True)

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    torch.use_deterministic_algorithms(True, warn_only=True)
    snapshot = download_pinned_snapshot(
        snapshot_download,
        config["model"]["id"],
        config["model"]["revision"],
    )
    model_started = time.perf_counter()
    tts = Qwen3TTSModel.from_pretrained(
        str(snapshot),
        device_map="cpu",
        dtype=torch.float32,
        attn_implementation="eager",
        low_cpu_mem_usage=True,
    )
    print(json.dumps({"event": "model-loaded", "seconds": round(time.perf_counter() - model_started, 3)}))

    generated = []
    for style in config["styles"]:
        seed_everything(style["seed"], torch, np)
        started = time.perf_counter()
        with torch.inference_mode():
            waves, source_sample_rate = generate_custom_voice_with_instruction(
                tts,
                text=config["textSource"]["text"],
                instruction=style["instruction"],
                speaker=config["model"]["speaker"],
                language=config["model"]["language"],
                max_new_tokens=config["generation"]["maxNewTokens"],
                do_sample=config["generation"]["doSample"],
                top_k=config["generation"]["topK"],
                temperature=config["generation"]["temperature"],
                repetition_penalty=config["generation"]["repetitionPenalty"],
            )
        if len(waves) != 1:
            raise ValueError(f"{style['id']} produced {len(waves)} waveforms instead of one")
        normalized = mono_resample_and_normalize(
            waves[0],
            source_sample_rate,
            target_sample_rate=config["output"]["sampleRateHz"],
            target_rms_dbfs=config["output"]["targetRmsDbfs"],
            peak_ceiling_dbfs=config["output"]["peakCeilingDbfs"],
        )
        output_path = output_directory / f"{style['id']}.wav"
        sf.write(
            output_path,
            normalized,
            config["output"]["sampleRateHz"],
            subtype=config["output"]["subtype"],
            format="WAV",
        )
        measurement = measure_wave(output_path)
        elapsed = round(time.perf_counter() - started, 3)
        generated.append({
            "style": style["id"],
            "instruction": style["instruction"],
            "seed": style["seed"],
            "file": output_path.relative_to(ROOT).as_posix(),
            "sourceSampleRateHz": int(source_sample_rate),
            "normalizedSampleRateHz": measurement["sampleRateHz"],
            "channels": measurement["channels"],
            "subtype": measurement["subtype"],
            "durationSeconds": measurement["durationSeconds"],
            "peakDbfs": measurement["peakDbfs"],
            "rmsDbfs": measurement["rmsDbfs"],
            "sha256": measurement["sha256"],
            "status": "user-review-required",
        })
        print(json.dumps({"event": "audition-generated", "style": style["id"], "seconds": elapsed, **measurement}))

    manifest = build_manifest(config, generated)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    verify_manifest(config, manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate three pinned Qwen3-TTS Mandarin male auditions")
    parser.add_argument("--verify", action="store_true", help="verify existing ignored WAVs against the review manifest")
    args = parser.parse_args()
    if args.verify:
        config = read_json(CONFIG_PATH)
        validate_contract(config)
        validate_license_evidence(config)
        manifest = read_json(MANIFEST_PATH)
        verify_manifest(config, manifest)
        print(json.dumps({"event": "auditions-verified", "count": len(manifest["outputs"])}))
        return 0
    generate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
