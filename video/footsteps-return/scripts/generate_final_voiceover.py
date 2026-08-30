from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
import pathlib
import shutil
import time
import unicodedata
from typing import Any, Callable


ROOT = pathlib.Path(__file__).resolve().parents[3]
PV_ROOT = ROOT / "video" / "footsteps-return"
VOICE_ROOT = PV_ROOT / "audio" / "voiceover"
FINAL_CONFIG_PATH = VOICE_ROOT / "final-voice.json"
SCRIPT_PATH = VOICE_ROOT / "script.json"
TIMING_PATH = VOICE_ROOT / "timing.json"
REVIEW_PATH = VOICE_ROOT / "review.json"
ASR_REVIEW_CONFIG_PATH = VOICE_ROOT / "asr-review.json"
AUDITION_CONFIG_PATH = VOICE_ROOT / "auditions.json"
AUDITION_MANIFEST_PATH = VOICE_ROOT / "audition-manifest.json"
AUDITION_GENERATOR_PATH = PV_ROOT / "scripts" / "generate_voice_auditions.py"

SELECTED_AUDITION_ID = "F"
SELECTED_VOICE_ID = "cold-witness"
SELECTED_AUDITION_CONFIG_SHA256 = "2d94820de25d99ffe4f25a66e83833f27e90b0c0ff2c8928676fc511402c3f95"
SELECTED_AUDITION_WAV_SHA256 = "b2c5fc6282a462c30e7d558870e7bff855a0102c8f42cb7810c0182b37a368b5"
APPROVED_CUE_ORDER_TEXT_SHA256 = "835b617b3058e74e95b3245fda8c82cfedb65f4f0b2e8f161a69210ba955075d"
VOICE_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
VOICE_MODEL_REVISION = "0e711a1c0aa5aad30654426e0d11f67716c1211e"


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_json_atomic(path: pathlib.Path, value: dict[str, Any]) -> None:
    pending = path.with_name(f".{path.name}.pending")
    pending.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(pending, path)


def load_audition_generator() -> Any:
    spec = importlib.util.spec_from_file_location("task8c_voice_auditions", AUDITION_GENERATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {AUDITION_GENERATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_cue_hash(script: dict[str, Any]) -> str:
    payload = [[cue["id"], cue["text"]] for cue in script["cues"]]
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(encoded)


def derive_cue_seed(base_seed: int, zero_based_index: int, cue_id: str) -> int:
    payload = f"{base_seed}\\0{zero_based_index}\\0{cue_id}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(payload).digest()[:4], "big") & 0x7FFFFFFF


def _contains_key(value: Any, prohibited: set[str]) -> bool:
    if isinstance(value, dict):
        return any(str(key).lower() in prohibited or _contains_key(child, prohibited) for key, child in value.items())
    if isinstance(value, list):
        return any(_contains_key(child, prohibited) for child in value)
    return False


def validate_contract(
    config: dict[str, Any],
    script: dict[str, Any],
    auditions: dict[str, Any],
    manifest: dict[str, Any],
) -> None:
    helper = load_audition_generator()
    selection = config.get("selection", {})
    expected_selection = {
        "auditionId": SELECTED_AUDITION_ID,
        "voiceId": SELECTED_VOICE_ID,
        "auditionConfigPath": "video/footsteps-return/audio/voiceover/auditions.json",
        "auditionConfigSha256": SELECTED_AUDITION_CONFIG_SHA256,
        "auditionManifestPath": "video/footsteps-return/audio/voiceover/audition-manifest.json",
        "auditionWavPath": "video/footsteps-return/captures/voice-auditions/cold-witness.wav",
        "auditionWavSha256": SELECTED_AUDITION_WAV_SHA256,
    }
    if selection != expected_selection:
        raise ValueError("selected audition F/cold-witness binding is not exact")
    if sha256_file(AUDITION_CONFIG_PATH) != SELECTED_AUDITION_CONFIG_SHA256:
        raise ValueError("selected audition config hash is stale")
    if manifest.get("configSha256") != SELECTED_AUDITION_CONFIG_SHA256:
        raise ValueError("audition manifest is not bound to the approved config hash")
    approved_voice = next((voice for voice in auditions["voiceDesign"]["voices"] if voice["auditionId"] == "F"), None)
    approved_output = next((output for output in manifest["outputs"] if output.get("auditionId") == "F"), None)
    if approved_voice is None or approved_output is None or approved_output.get("sha256") != SELECTED_AUDITION_WAV_SHA256:
        raise ValueError("approved audition F metadata or WAV hash is missing")
    audition_wav = ROOT / selection["auditionWavPath"]
    if not audition_wav.is_file() or sha256_file(audition_wav) != SELECTED_AUDITION_WAV_SHA256:
        raise ValueError("approved audition F WAV is missing or its hash changed")

    voice_design = config.get("voiceDesign", {})
    expected_voice_design = {
        "timbreClause": approved_voice["timbreClause"],
        "sharedDeliveryClause": auditions["voiceDesign"]["sharedDeliveryClause"],
        "instruction": approved_voice["instruction"],
    }
    if voice_design != expected_voice_design:
        raise ValueError("final VoiceDesign timbre or shared delivery clause drifted from audition F")
    helper.reject_identity_or_clone_language(*voice_design.values())
    if voice_design["instruction"] != voice_design["timbreClause"] + voice_design["sharedDeliveryClause"]:
        raise ValueError("VoiceDesign instruction must be the exact timbre plus shared delivery clauses")
    if config.get("model") != auditions["voiceDesign"]["model"]:
        raise ValueError("final VoiceDesign model must equal the approved audition model")
    model = config["model"]
    if (
        model.get("id") != VOICE_MODEL_ID
        or model.get("revision") != VOICE_MODEL_REVISION
        or model.get("generationMethod") != "generate_voice_design"
        or model.get("device") != "cpu"
        or model.get("language") != "Chinese"
        or model.get("referenceAudio") is not None
        or model.get("referenceText") is not None
        or "speaker" in model
    ):
        raise ValueError("VoiceDesign must use the pinned official CPU path without speaker or reference audio")
    if _contains_key(config, {"fallback", "voicecloneprompt", "cloneprompt", "refaudio", "speaker"}):
        raise ValueError("final VoiceDesign config cannot contain a clone, speaker, reference or fallback path")
    generation = config.get("generation", {})
    audition_generation = auditions["voiceDesign"]["generation"]
    for config_key, audition_key in (
        ("maxNewTokens", "maxNewTokens"),
        ("doSample", "doSample"),
        ("topK", "topK"),
        ("temperature", "temperature"),
        ("repetitionPenalty", "repetitionPenalty"),
    ):
        if generation.get(config_key) != audition_generation.get(audition_key):
            raise ValueError("final VoiceDesign sampling parameters drifted from audition F")
    if generation.get("baseSeed") != 83001 or generation.get("seedDerivation") != "sha256-u32be-v1":
        raise ValueError("final cue seeds must derive from the committed base seed")

    text_source = config.get("textSource", {})
    if text_source.get("scriptPath") != "video/footsteps-return/audio/voiceover/script.json":
        raise ValueError("final voice text must come from script.json")
    if len(script.get("cues", [])) != 21 or text_source.get("cueCount") != 21:
        raise ValueError("final voice script must contain exactly 21 cues")
    if canonical_cue_hash(script) != APPROVED_CUE_ORDER_TEXT_SHA256 or text_source.get("approvedCueOrderTextSha256") != APPROVED_CUE_ORDER_TEXT_SHA256:
        raise ValueError("final voice script cue order or text changed")
    ids = [cue.get("id") for cue in script["cues"]]
    if len(set(ids)) != 21:
        raise ValueError("final voice cue IDs must be unique")
    expected_script_voice = {
        "engine": "Qwen3-TTS VoiceDesign",
        "configFile": "video/footsteps-return/audio/voiceover/final-voice.json",
        "selectedAuditionId": "F",
        "selectedVoiceId": "cold-witness",
        "modelId": VOICE_MODEL_ID,
        "modelRevision": VOICE_MODEL_REVISION,
        "generationMethod": "generate_voice_design",
        "referenceAudio": None,
        "referenceText": None,
    }
    if script.get("purpose") != "final-release-narration" or script.get("voice") != expected_script_voice:
        raise ValueError("script voice metadata must describe only the selected final VoiceDesign path")
    if any(cue.get("outputFile") != f"video/footsteps-return/captures/voiceover/{cue['id']}.wav" for cue in script["cues"]):
        raise ValueError("every final cue must keep its one-for-one replacement output path")
    output = config.get("output", {})
    output_directory = (ROOT / output.get("directory", "")).resolve()
    captures_root = (PV_ROOT / "captures").resolve()
    if not output_directory.is_relative_to(captures_root):
        raise ValueError("final voice output directory must stay inside ignored captures")
    if (output.get("sampleRateHz"), output.get("channels"), output.get("subtype")) != (48000, 1, "PCM_16"):
        raise ValueError("final voice output must be 48 kHz mono PCM-16")


def validate_all_contracts() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    config = read_json(FINAL_CONFIG_PATH)
    script = read_json(SCRIPT_PATH)
    auditions = read_json(AUDITION_CONFIG_PATH)
    manifest = read_json(AUDITION_MANIFEST_PATH)
    validate_contract(config, script, auditions, manifest)
    load_audition_generator().validate_license_evidence(auditions)
    return config, script, auditions, manifest


def measure_wave(path: pathlib.Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    samples, sample_rate = sf.read(path, dtype="int16", always_2d=True)
    info = sf.info(path)
    if samples.shape[1] != 1 or samples.shape[0] == 0:
        raise ValueError(f"{path} must be non-empty mono audio")
    if int(sample_rate) != 48000 or info.subtype != "PCM_16":
        raise ValueError(f"{path} must be 48 kHz PCM-16")
    mono = samples[:, 0].astype(np.float64)
    absolute = np.abs(mono)
    peak = float(np.max(absolute))
    rms = float(np.sqrt(np.mean(np.square(mono))))
    if peak <= 0 or rms <= 0:
        raise ValueError(f"{path} is silent")
    active = np.flatnonzero(absolute >= 328)
    sample_count = len(mono)
    return {
        "durationSeconds": round(sample_count / sample_rate, 6),
        "sampleRateHz": int(sample_rate),
        "channels": int(info.channels),
        "bitsPerSample": 16,
        "subtype": info.subtype,
        "peakDbfs": round(20 * math.log10(peak / 32768), 4),
        "rmsDbfs": round(20 * math.log10(rms / 32768), 4),
        "activeRatio": round(len(active) / sample_count, 6),
        "leadingSilenceSeconds": round((active[0] if len(active) else sample_count) / sample_rate, 6),
        "trailingSilenceSeconds": round((sample_count - active[-1] - 1 if len(active) else sample_count) / sample_rate, 6),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def atomic_write_wav(
    destination: pathlib.Path,
    samples: Any,
    sample_rate: int,
    *,
    validator: Callable[[pathlib.Path], dict[str, Any]] = measure_wave,
) -> dict[str, Any]:
    import soundfile as sf

    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    pending = destination.with_name(f".{destination.stem}.pending.wav")
    pending.unlink(missing_ok=True)
    try:
        sf.write(pending, samples, sample_rate, subtype="PCM_16", format="WAV")
        measurement = validator(pending)
        os.replace(pending, destination)
        return measurement
    finally:
        pending.unlink(missing_ok=True)


def validate_final_measurement(path: pathlib.Path, output: dict[str, Any]) -> dict[str, Any]:
    measurement = measure_wave(path)
    if (
        measurement["sampleRateHz"] != output["sampleRateHz"]
        or measurement["channels"] != output["channels"]
        or measurement["subtype"] != output["subtype"]
    ):
        raise ValueError(f"{path} has the wrong final PCM format")
    if measurement["peakDbfs"] > output["peakCeilingDbfs"] + 0.1 or measurement["peakDbfs"] < output["peakCeilingDbfs"] - 3:
        raise ValueError(f"{path} violates the conservative final peak window")
    if abs(measurement["rmsDbfs"] - output["targetRmsDbfs"]) > 0.15:
        raise ValueError(f"{path} violates matched final dry-voice RMS")
    return measurement


def prepare_staging_directory(output_directory: pathlib.Path) -> pathlib.Path:
    staging = (output_directory / ".final-voice-staging").resolve()
    if staging.parent != output_directory.resolve():
        raise ValueError(f"unsafe final voice staging directory {staging}")
    if staging.exists():
        for child in staging.iterdir():
            if not child.is_file() or child.suffix.lower() != ".wav":
                raise ValueError(f"unexpected item in final voice staging directory: {child}")
            child.unlink()
        staging.rmdir()
    staging.mkdir(parents=True)
    return staging


def transactional_replace_batch(
    replacements: list[tuple[pathlib.Path, pathlib.Path]],
    *,
    replace_operation: Callable[[pathlib.Path, pathlib.Path], None] = os.replace,
) -> None:
    """Replace a complete cue set or restore every original destination."""
    normalized = [(candidate.resolve(), destination.resolve()) for candidate, destination in replacements]
    if not normalized:
        raise ValueError("transactional replacement requires at least one file")
    candidates = [candidate for candidate, _destination in normalized]
    destinations = [destination for _candidate, destination in normalized]
    if len(set(candidates)) != len(candidates) or len(set(destinations)) != len(destinations):
        raise ValueError("transactional replacement paths must be unique")
    if any(not candidate.is_file() for candidate in candidates):
        raise ValueError("every transactional replacement candidate must exist before commit")

    backups: list[tuple[pathlib.Path, pathlib.Path, bool]] = []
    preserve_backups = False
    try:
        for index, (candidate, destination) in enumerate(normalized):
            destination.parent.mkdir(parents=True, exist_ok=True)
            backup = candidate.parent / f".rollback-{index:02d}-{destination.name}"
            backup.unlink(missing_ok=True)
            existed = destination.is_file()
            if destination.exists() and not existed:
                raise ValueError(f"transaction destination is not a file: {destination}")
            if existed:
                shutil.copy2(destination, backup)
            backups.append((destination, backup, existed))

        for candidate, destination in normalized:
            replace_operation(candidate, destination)
    except Exception as error:
        rollback_errors: list[str] = []
        for destination, backup, existed in reversed(backups):
            try:
                if existed:
                    os.replace(backup, destination)
                else:
                    destination.unlink(missing_ok=True)
            except Exception as rollback_error:
                rollback_errors.append(f"{destination}: {rollback_error}")
        if rollback_errors:
            preserve_backups = True
            raise RuntimeError(
                "final voice commit failed and rollback was incomplete; recoverable backups remain in staging: "
                f"{'; '.join(rollback_errors)}"
            ) from error
        raise
    finally:
        if not preserve_backups:
            for _destination, backup, _existed in backups:
                backup.unlink(missing_ok=True)


def generate_batch() -> dict[str, Any]:
    import numpy as np
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    config, script, _auditions, _manifest = validate_all_contracts()
    helper = load_audition_generator()
    output = config["output"]
    output_directory = (ROOT / output["directory"]).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    staging = prepare_staging_directory(output_directory)

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    torch.use_deterministic_algorithms(True, warn_only=True)
    snapshot = helper.download_pinned_snapshot(snapshot_download, config["model"]["id"], config["model"]["revision"])
    model_started = time.perf_counter()
    tts = Qwen3TTSModel.from_pretrained(
        str(snapshot),
        device_map="cpu",
        dtype=torch.float32,
        attn_implementation="eager",
        low_cpu_mem_usage=True,
    )
    model_load_seconds = round(time.perf_counter() - model_started, 3)
    print(json.dumps({"event": "final-voice-model-loaded", "seconds": model_load_seconds}))

    generated: list[dict[str, Any]] = []
    generation_started = time.perf_counter()
    try:
        for index, cue in enumerate(script["cues"]):
            seed = derive_cue_seed(config["generation"]["baseSeed"], index, cue["id"])
            helper.seed_everything(seed, torch, np)
            cue_started = time.perf_counter()
            with torch.inference_mode():
                waves, source_sample_rate = helper.generate_voice_design(
                    tts,
                    text=cue["text"],
                    instruction=config["voiceDesign"]["instruction"],
                    language=config["model"]["language"],
                    max_new_tokens=config["generation"]["maxNewTokens"],
                    do_sample=config["generation"]["doSample"],
                    top_k=config["generation"]["topK"],
                    temperature=config["generation"]["temperature"],
                    repetition_penalty=config["generation"]["repetitionPenalty"],
                )
            if len(waves) != 1:
                raise ValueError(f"{cue['id']} generated {len(waves)} waveforms instead of one")
            normalized = helper.mono_resample_and_normalize(
                waves[0],
                source_sample_rate,
                target_sample_rate=output["sampleRateHz"],
                target_rms_dbfs=output["targetRmsDbfs"],
                peak_ceiling_dbfs=output["peakCeilingDbfs"],
            )
            staged_path = staging / f"{cue['id']}.wav"
            measurement = atomic_write_wav(
                staged_path,
                normalized,
                output["sampleRateHz"],
                validator=lambda candidate: validate_final_measurement(candidate, output),
            )
            cue_seconds = round(time.perf_counter() - cue_started, 3)
            record = {
                "id": cue["id"],
                "replacementId": cue["id"],
                "textSha256": sha256_bytes(cue["text"].encode("utf-8")),
                "seed": seed,
                "outputFile": cue["outputFile"],
                "sourceSampleRateHz": int(source_sample_rate),
                "timeCompressionFactor": 1,
                "generationSeconds": cue_seconds,
                **measurement,
            }
            generated.append(record)
            print(json.dumps({"event": "final-cue-generated", "index": index + 1, "count": 21, **record}, ensure_ascii=False))

        replacements: list[tuple[pathlib.Path, pathlib.Path]] = []
        for cue in script["cues"]:
            staged_path = staging / f"{cue['id']}.wav"
            destination = (ROOT / cue["outputFile"]).resolve()
            if destination.parent != output_directory:
                raise ValueError(f"unsafe final cue destination {destination}")
            replacements.append((staged_path, destination))
        transactional_replace_batch(replacements)
        staging.rmdir()
    except Exception:
        if staging.exists():
            retained_backups = [child for child in staging.iterdir() if child.name.startswith(".rollback-")]
            if retained_backups:
                raise RuntimeError(
                    f"final voice rollback needs manual recovery; retained {len(retained_backups)} backups in {staging}"
                )
            for child in staging.iterdir():
                if child.is_file() and child.suffix.lower() == ".wav":
                    child.unlink()
            staging.rmdir()
        raise

    total_seconds = round(time.perf_counter() - generation_started, 3)
    timing = {
        "schemaVersion": 2,
        "measurement": "normalized PCM WAV sample count and SHA-256",
        "finalConfigSha256": sha256_file(FINAL_CONFIG_PATH),
        "selectedAudition": config["selection"],
        "voice": {
            "engine": "Qwen3-TTS VoiceDesign",
            "selectedAuditionId": "F",
            "selectedVoiceId": "cold-witness",
            "modelId": config["model"]["id"],
            "modelRevision": config["model"]["revision"],
            "package": config["model"]["package"],
            "language": config["model"]["language"],
            "device": "cpu",
            "generationMethod": "generate_voice_design",
        },
        "normalization": output,
        "generationRuntime": {
            "modelLoadSeconds": model_load_seconds,
            "cueInferenceAndNormalizationSeconds": total_seconds,
        },
        "cues": generated,
    }
    write_json_atomic(TIMING_PATH, timing)
    return timing


def normalize_asr_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(
        character
        for character in normalized
        if not character.isspace() and unicodedata.category(character)[0] not in {"P", "Z"}
    )


# Diagnostic-only fold for the script-variant bias observed in local Whisper output.
# Raw transcript/CER stays authoritative and is never replaced by this value.
SCRIPT_VARIANT_TRANSLATION = str.maketrans({
    "邊": "边", "並": "并", "斷": "断", "們": "们", "處": "处", "縫": "缝", "後": "后",
    "續": "续", "將": "将", "遙": "遥", "遠": "远", "鄰": "邻", "現": "现", "種": "种",
    "顯": "显", "連": "连", "開": "开", "橫": "横", "繞": "绕", "擁": "拥", "環": "环",
    "織": "织", "視": "视", "轉": "转", "顏": "颜", "歸": "归", "經": "经", "換": "换",
    "雙": "双", "裡": "里", "見": "见", "齊": "齐", "鄉": "乡", "徑": "径", "擇": "择",
    "讓": "让", "虧": "亏", "該": "该", "與": "与", "從": "从", "離": "离", "條": "条",
    "會": "会", "為": "为", "張": "张", "圖": "图", "謂": "谓", "觀": "观", "時": "时",
    "痕": "痕", "義": "义", "顆": "颗", "樣": "样", "長": "长", "隱": "隐", "尋": "寻",
    "這": "这", "個": "个", "兩": "两", "點": "点", "應": "应", "帶": "带", "變": "变",
    "達": "达", "閉": "闭", "隨": "随", "盤": "盘", "聲": "声", "讀": "读", "體": "体",
    "選": "选", "記": "记", "過": "过", "縱": "纵", "卻": "却", "終": "终", "靈": "灵",
})


def fold_script_variant(text: str) -> tuple[str, int]:
    folded = text.translate(SCRIPT_VARIANT_TRANSLATION)
    return folded, sum(left != right for left, right in zip(text, folded))


def character_error_rate(reference: str, transcript: str) -> tuple[int, float]:
    previous = list(range(len(transcript) + 1))
    for reference_index, reference_character in enumerate(reference, start=1):
        current = [reference_index]
        for transcript_index, transcript_character in enumerate(transcript, start=1):
            current.append(min(
                current[-1] + 1,
                previous[transcript_index] + 1,
                previous[transcript_index - 1] + (reference_character != transcript_character),
            ))
        previous = current
    distance = previous[-1]
    return distance, distance / max(1, len(reference))


def run_asr(config: dict[str, Any], script: dict[str, Any], timing: dict[str, Any]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    review_policy = read_json(ASR_REVIEW_CONFIG_PATH)
    requested = {**config["asr"], **review_policy}
    cue_ids = {cue["id"] for cue in script["cues"]}
    focus_ids = [entry.get("cueId") for entry in requested.get("manualReviewFocus", [])]
    if len(focus_ids) != len(set(focus_ids)) or not set(focus_ids).issubset(cue_ids):
        raise ValueError("ASR manual-review focus IDs must be unique approved cue IDs")
    attempt = {
        "engine": requested["engine"],
        "modelId": requested["model"]["id"],
        "modelRevision": requested["model"]["revision"],
        "device": requested["device"],
    }
    started = time.perf_counter()
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from huggingface_hub import snapshot_download
        from scipy.signal import resample_poly
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        allow_patterns = [
            "config.json", "generation_config.json", "model.safetensors",
            "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
            "special_tokens_map.json", "added_tokens.json", "merges.txt", "normalizer.json", "vocab.json",
        ]

        def load_model(model_spec: dict[str, str], license_evidence: dict[str, str]) -> tuple[Any, Any, Any]:
            evidence_path = PV_ROOT / license_evidence["repositoryPath"]
            if sha256_file(evidence_path) != license_evidence["sha256"]:
                raise ValueError(f"ASR license evidence hash is stale for {model_spec['id']}")
            snapshot = pathlib.Path(snapshot_download(
                model_spec["id"],
                revision=model_spec["revision"],
                allow_patterns=allow_patterns,
                max_workers=1,
            ))
            if snapshot.name != model_spec["revision"]:
                raise ValueError(f"ASR snapshot is not the pinned immutable revision for {model_spec['id']}")
            loaded_processor = WhisperProcessor.from_pretrained(str(snapshot), local_files_only=True)
            loaded_model = WhisperForConditionalGeneration.from_pretrained(
                str(snapshot),
                local_files_only=True,
                dtype=torch.float32,
                low_cpu_mem_usage=True,
            ).to("cpu")
            loaded_model.eval()
            decoder_ids = loaded_processor.get_decoder_prompt_ids(language=requested["language"], task=requested["task"])
            return loaded_processor, loaded_model, decoder_ids

        def transcribe_cue(cue: dict[str, Any], loaded_processor: Any, loaded_model: Any, decoder_ids: Any) -> str:
            samples, sample_rate = sf.read(ROOT / cue["outputFile"], dtype="float32", always_2d=True)
            mono = samples.mean(axis=1)
            if sample_rate != 16000:
                divisor = math.gcd(int(sample_rate), 16000)
                mono = resample_poly(mono, 16000 // divisor, int(sample_rate) // divisor).astype(np.float32)
            inputs = loaded_processor(
                mono,
                sampling_rate=16000,
                return_tensors="pt",
                return_attention_mask=True,
            )
            with torch.inference_mode():
                predicted = loaded_model.generate(
                    inputs.input_features,
                    attention_mask=inputs.attention_mask,
                    forced_decoder_ids=decoder_ids,
                    do_sample=False,
                    max_new_tokens=192,
                )
            return loaded_processor.batch_decode(predicted, skip_special_tokens=True)[0].strip()

        processor, model, forced_decoder_ids = load_model(requested["model"], requested["licenseEvidence"])
        script_by_id = {cue["id"]: cue for cue in script["cues"]}
        cue_evidence: dict[str, dict[str, Any]] = {}
        total_distance = 0
        total_characters = 0
        total_folded_distance = 0
        manual_focus_by_id = {entry["cueId"]: entry for entry in requested.get("manualReviewFocus", [])}
        for cue in timing["cues"]:
            transcript = transcribe_cue(cue, processor, model, forced_decoder_ids)
            reference = script_by_id[cue["id"]]["text"]
            normalized_reference = normalize_asr_text(reference)
            normalized_transcript = normalize_asr_text(transcript)
            edit_distance, cer = character_error_rate(normalized_reference, normalized_transcript)
            folded_reference, _ = fold_script_variant(normalized_reference)
            folded_transcript, folded_characters = fold_script_variant(normalized_transcript)
            folded_distance, folded_cer = character_error_rate(folded_reference, folded_transcript)
            total_distance += edit_distance
            total_folded_distance += folded_distance
            total_characters += len(normalized_reference)
            cue_evidence[cue["id"]] = {
                "status": "completed",
                "transcript": transcript,
                "normalizedReference": normalized_reference,
                "normalizedTranscript": normalized_transcript,
                "referenceCharacters": len(normalized_reference),
                "editDistance": edit_distance,
                "cer": round(cer, 6),
                "diagnosticScriptVariantFold": {
                    "policy": "Documented Simplified/Traditional character fold for diagnosis only; raw transcript and raw CER above remain unchanged.",
                    "foldedTranscript": folded_transcript,
                    "foldedCharacters": folded_characters,
                    "editDistance": folded_distance,
                    "cer": round(folded_cer, 6),
                },
            }
            if cue["id"] in manual_focus_by_id:
                cue_evidence[cue["id"]]["manualReviewFocus"] = manual_focus_by_id[cue["id"]]
            print(json.dumps({"event": "asr-cue", "id": cue["id"], **cue_evidence[cue["id"]]}, ensure_ascii=False))
        attempt.update({"status": "completed", "seconds": round(time.perf_counter() - started, 3)})
        attempts = [attempt]

        focused = requested.get("focusedCrossCheck", {})
        threshold = float(focused.get("threshold", 1))
        focused_cue_ids = [cue_id for cue_id, evidence in cue_evidence.items() if evidence["cer"] >= threshold]
        cross_check_summary: dict[str, Any] = {
            "status": "not-needed" if not focused_cue_ids else "pending",
            "selection": focused.get("selection"),
            "threshold": threshold,
            "cueIds": focused_cue_ids,
            "cueCount": len(focused_cue_ids),
            "model": focused.get("model"),
            "license": focused.get("license"),
            "licenseEvidence": focused.get("licenseEvidence"),
        }
        if focused_cue_ids:
            del model, processor
            gc.collect()
            cross_started = time.perf_counter()
            cross_attempt = {
                "engine": requested["engine"],
                "modelId": focused["model"]["id"],
                "modelRevision": focused["model"]["revision"],
                "device": requested["device"],
                "scope": "focused-high-raw-CER-cues-only",
                "cueIds": focused_cue_ids,
            }
            try:
                cross_processor, cross_model, cross_decoder_ids = load_model(
                    focused["model"], focused["licenseEvidence"]
                )
                timing_by_id = {cue["id"]: cue for cue in timing["cues"]}
                for cue_id in focused_cue_ids:
                    transcript = transcribe_cue(
                        timing_by_id[cue_id], cross_processor, cross_model, cross_decoder_ids
                    )
                    normalized_transcript = normalize_asr_text(transcript)
                    normalized_reference = cue_evidence[cue_id]["normalizedReference"]
                    edit_distance, cer = character_error_rate(normalized_reference, normalized_transcript)
                    folded_reference, _ = fold_script_variant(normalized_reference)
                    folded_transcript, folded_characters = fold_script_variant(normalized_transcript)
                    folded_distance, folded_cer = character_error_rate(folded_reference, folded_transcript)
                    cue_evidence[cue_id]["focusedCrossCheck"] = {
                        "status": "completed",
                        "model": focused["model"],
                        "transcript": transcript,
                        "normalizedTranscript": normalized_transcript,
                        "editDistance": edit_distance,
                        "cer": round(cer, 6),
                        "diagnosticScriptVariantFold": {
                            "policy": "Diagnosis only; cross-check raw transcript and raw CER remain unchanged.",
                            "foldedTranscript": folded_transcript,
                            "foldedCharacters": folded_characters,
                            "editDistance": folded_distance,
                            "cer": round(folded_cer, 6),
                        },
                    }
                    print(json.dumps({
                        "event": "asr-focused-cross-check",
                        "id": cue_id,
                        **cue_evidence[cue_id]["focusedCrossCheck"],
                    }, ensure_ascii=False))
                cross_attempt.update({
                    "status": "completed",
                    "seconds": round(time.perf_counter() - cross_started, 3),
                })
                cross_check_summary["status"] = "completed"
                cross_check_summary["cuesCompleted"] = len(focused_cue_ids)
                del cross_model, cross_processor
                gc.collect()
            except Exception as cross_error:
                diagnostic = f"{type(cross_error).__name__}: {cross_error}"
                cross_attempt.update({
                    "status": "blocked",
                    "seconds": round(time.perf_counter() - cross_started, 3),
                    "diagnostic": diagnostic,
                })
                cross_check_summary.update({"status": "blocked", "blocker": diagnostic})
            attempts.append(cross_attempt)

        manual_review_focus = []
        for focus in requested.get("manualReviewFocus", []):
            evidence = cue_evidence[focus["cueId"]]
            manual_review_focus.append({
                **focus,
                "primaryTranscript": evidence["transcript"],
                "primaryRawCer": evidence["cer"],
                "primaryDiagnosticScriptVariantFoldCer": evidence["diagnosticScriptVariantFold"]["cer"],
                "focusedCrossCheck": evidence.get("focusedCrossCheck", {
                    "status": "not-selected",
                    "reason": f"primary raw CER {evidence['cer']:.6f} is below focused threshold {threshold:.6f}",
                }),
                "requiredAction": "Native Mandarin reviewer must hear this cue in the continuous timeline; ASR agreement or disagreement is not an intelligibility pass.",
            })
        return ({
            "enabled": True,
            "status": "completed",
            "engine": requested["engine"],
            "model": {
                "id": requested["model"]["id"],
                "revision": requested["model"]["revision"],
                "runtime": f"transformers=={importlib.metadata.version('transformers')}",
                "device": "cpu",
                "language": requested["language"],
                "task": requested["task"],
            },
            "license": requested["license"],
            "licenseEvidence": requested["licenseEvidence"],
            "normalization": requested["normalization"],
            "reviewPolicy": {
                "file": "video/footsteps-return/audio/voiceover/asr-review.json",
                "sha256": sha256_file(ASR_REVIEW_CONFIG_PATH),
            },
            "corpusReferenceCharacters": total_characters,
            "corpusEditDistance": total_distance,
            "corpusCer": round(total_distance / max(1, total_characters), 6),
            "diagnosticCorpusCerAfterScriptVariantFold": round(total_folded_distance / max(1, total_characters), 6),
            "diagnosticScriptVariantFoldPolicy": "This diagnostic separates Whisper Simplified/Traditional output bias; it never overwrites raw CER and never repairs topology terms, synonyms or homophones.",
            "focusedCrossCheck": cross_check_summary,
            "manualReview": {
                "status": "required",
                "focusCues": manual_review_focus,
                "continuousReviewFile": config["output"]["continuousReviewFile"],
                "conclusion": "Corpus CER is not an intelligibility pass. Ordinary-word and topology-term disagreements remain explicit native-listening targets.",
            },
            "attempts": attempts,
            "totalSeconds": round(time.perf_counter() - started, 3),
            "limitation": "ASR is an objective aid only and does not replace native Mandarin listening; no cue is accepted solely from CER.",
        }, cue_evidence)
    except Exception as error:
        attempt.update({
            "status": "blocked",
            "seconds": round(time.perf_counter() - started, 3),
            "diagnostic": f"{type(error).__name__}: {error}",
        })
        return ({
            "enabled": False,
            "status": "blocked",
            "engine": requested["engine"],
            "model": requested["model"],
            "license": requested["license"],
            "licenseEvidence": requested["licenseEvidence"],
            "normalization": requested["normalization"],
            "reviewPolicy": {
                "file": "video/footsteps-return/audio/voiceover/asr-review.json",
                "sha256": sha256_file(ASR_REVIEW_CONFIG_PATH),
            },
            "blocker": attempt["diagnostic"],
            "attempts": [attempt],
            "limitation": "No transcript or CER is reported because the pinned local ASR path did not complete.",
        }, {})


def build_continuous_review(
    timing: dict[str, Any],
    destination: pathlib.Path,
    *,
    root: pathlib.Path = ROOT,
) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    sample_rate = 48000
    master_duration = float(timing["masterDurationSeconds"])
    master = np.zeros(round(master_duration * sample_rate), dtype=np.float32)
    occupied_until = 0
    for cue in timing["cues"]:
        samples, cue_rate = sf.read(root / cue["outputFile"], dtype="float32", always_2d=True)
        if cue_rate != sample_rate or samples.shape[1] != 1:
            raise ValueError(f"{cue['id']} is not 48 kHz mono for the continuous review")
        start = round(float(cue["timelineStartSeconds"]) * sample_rate)
        end = start + len(samples)
        if start < occupied_until:
            raise ValueError(f"continuous review overlap before {cue['id']}")
        if end > len(master):
            raise ValueError(f"continuous review cue {cue['id']} exceeds master duration")
        master[start:end] = samples[:, 0]
        occupied_until = end
    measured = atomic_write_wav(destination, master, sample_rate, validator=measure_wave)
    return {
        "file": destination.resolve().relative_to(ROOT).as_posix() if destination.resolve().is_relative_to(ROOT) else destination.name,
        "format": "WAV PCM-16",
        "sampleRateHz": 48000,
        "channels": 1,
        "bitsPerSample": 16,
        "durationSeconds": master_duration,
        "bytes": measured["bytes"],
        "sha256": measured["sha256"],
        "alignment": "Each dry cue begins at timing.json timelineStartSeconds; all other samples are digital silence.",
    }


def verify_cue_files(timing: dict[str, Any]) -> None:
    previous_end = -math.inf
    for cue in timing["cues"]:
        path = ROOT / cue["outputFile"]
        actual = measure_wave(path)
        for field in (
            "durationSeconds", "sampleRateHz", "channels", "bitsPerSample", "subtype",
            "peakDbfs", "rmsDbfs", "activeRatio", "leadingSilenceSeconds", "trailingSilenceSeconds", "bytes", "sha256",
        ):
            if cue.get(field) != actual[field]:
                raise ValueError(f"stale {field} for {cue['id']}: {cue.get(field)} != {actual[field]}")
        if cue.get("timeCompressionFactor") != 1:
            raise ValueError(f"unapproved time compression for {cue['id']}")
        if "timelineStartSeconds" in cue:
            if cue["timelineStartSeconds"] < previous_end - 1e-6:
                raise ValueError(f"narration overlap before {cue['id']}")
            previous_end = cue["timelineEndSeconds"]


def build_review(config: dict[str, Any], script: dict[str, Any], timing: dict[str, Any], asr: dict[str, Any], cue_asr: dict[str, dict[str, Any]]) -> dict[str, Any]:
    review_cues = []
    for cue in timing["cues"]:
        entry = {
            "id": cue["id"],
            "replacementId": cue["replacementId"],
            "textSha256": cue["textSha256"],
            "seed": cue["seed"],
            "status": "automated-structure-and-signal-review-passed",
            "pronunciation": "user-review-required",
            "timeCompressionFactor": cue["timeCompressionFactor"],
            "timelineStartSeconds": cue["timelineStartSeconds"],
            "timelineEndSeconds": cue["timelineEndSeconds"],
            "signal": {key: cue[key] for key in (
                "durationSeconds", "sampleRateHz", "channels", "bitsPerSample", "subtype", "peakDbfs", "rmsDbfs",
                "activeRatio", "leadingSilenceSeconds", "trailingSilenceSeconds", "bytes", "sha256",
            )},
        }
        if cue["id"] in cue_asr:
            entry["asr"] = cue_asr[cue["id"]]
        review_cues.append(entry)
    return {
        "schemaVersion": 2,
        "trackPurpose": script["purpose"],
        "finalConfigSha256": timing["finalConfigSha256"],
        "selectedVoice": {
            "auditionId": "F",
            "voiceId": "cold-witness",
            "auditionConfigSha256": SELECTED_AUDITION_CONFIG_SHA256,
            "auditionWavSha256": SELECTED_AUDITION_WAV_SHA256,
            "modelId": config["model"]["id"],
            "modelRevision": config["model"]["revision"],
            **config["voiceDesign"],
        },
        "replacementContract": "Replace captures/voiceover/<cue-id>.wav one-for-one without changing cue IDs or approved text.",
        "synthesisRuntime": {
            "path": "official qwen-tts generate_voice_design only",
            "package": "qwen-tts==0.1.1 (Apache-2.0)",
            "device": "CPU FP32 eager attention",
            **timing["generationRuntime"],
        },
        "normalization": timing["normalization"],
        "auditionMethod": "peak/RMS, active-sample ratio, leading/trailing silence, duration, file hash, timeline non-overlap, local ASR when available, and 4K caption sync",
        "asr": asr,
        "continuousReview": timing["continuousReview"],
        "nativeListening": {
            "status": "user-review-required",
            "reviewFile": timing["continuousReview"]["file"],
            "reason": "Automated signal and ASR evidence cannot establish native Mandarin diction, timbre continuity or dramatic restraint.",
        },
        "trackDisposition": "final-voiceover-generated; user review required before final mix",
        "unacceptableCues": [],
        "cues": review_cues,
    }


def finalize() -> tuple[dict[str, Any], dict[str, Any]]:
    config, script, _auditions, _manifest = validate_all_contracts()
    timing = read_json(TIMING_PATH)
    if timing.get("schemaVersion") != 2 or timing.get("finalConfigSha256") != sha256_file(FINAL_CONFIG_PATH):
        raise ValueError("generated timing metadata is missing or stale")
    if not all("timelineStartSeconds" in cue and "timelineEndSeconds" in cue for cue in timing["cues"]):
        raise ValueError("caption timing must be rebuilt before final voice review")
    verify_cue_files(timing)
    review_path = ROOT / config["output"]["continuousReviewFile"]
    timing["continuousReview"] = build_continuous_review(timing, review_path)
    asr, cue_asr = run_asr(config, script, timing)
    timing["asr"] = asr
    if cue_asr:
        timing["cues"] = [{**cue, "asr": cue_asr[cue["id"]]} for cue in timing["cues"]]
    else:
        timing["cues"] = [{key: value for key, value in cue.items() if key != "asr"} for cue in timing["cues"]]
    review = build_review(config, script, timing, asr, cue_asr)
    write_json_atomic(TIMING_PATH, timing)
    write_json_atomic(REVIEW_PATH, review)
    return timing, review


def verify_existing() -> None:
    config, script, _auditions, _manifest = validate_all_contracts()
    timing = read_json(TIMING_PATH)
    review = read_json(REVIEW_PATH)
    if timing.get("schemaVersion") != 2 or timing.get("finalConfigSha256") != sha256_file(FINAL_CONFIG_PATH):
        raise ValueError("final timing config hash is stale")
    if len(timing.get("cues", [])) != 21:
        raise ValueError("final timing must contain 21 cues")
    verify_cue_files(timing)
    continuous = timing.get("continuousReview", {})
    continuous_path = ROOT / continuous.get("file", "")
    continuous_measurement = measure_wave(continuous_path)
    if continuous_measurement["sha256"] != continuous.get("sha256") or continuous_measurement["bytes"] != continuous.get("bytes"):
        raise ValueError("continuous review WAV metadata is stale")
    if abs(continuous_measurement["durationSeconds"] - timing["masterDurationSeconds"]) >= 1 / 48000:
        raise ValueError("continuous review WAV duration is not aligned to the master timeline")
    if review.get("finalConfigSha256") != timing["finalConfigSha256"] or review.get("nativeListening", {}).get("status") != "user-review-required":
        raise ValueError("final review metadata is stale")
    if review.get("asr", {}).get("status") == "completed":
        if len(review.get("cues", [])) != 21 or any(cue.get("asr", {}).get("status") != "completed" for cue in review["cues"]):
            raise ValueError("completed ASR evidence must include all 21 cue transcripts and CER values")
    elif review.get("asr", {}).get("status") == "blocked":
        if any("asr" in cue for cue in review.get("cues", [])) or not review["asr"].get("blocker"):
            raise ValueError("blocked ASR evidence cannot contain fabricated cue transcripts")
    else:
        raise ValueError("ASR status must be completed or honestly blocked")
    if canonical_cue_hash(script) != APPROVED_CUE_ORDER_TEXT_SHA256:
        raise ValueError("final script changed after generation")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the selected F cold-witness final narration with pinned Qwen VoiceDesign")
    parser.add_argument("--finalize", action="store_true", help="build the aligned review WAV and local ASR/CER evidence after caption timing")
    parser.add_argument("--verify", action="store_true", help="verify committed metadata against ignored final WAVs")
    args = parser.parse_args()
    if args.verify:
        verify_existing()
        print(json.dumps({"event": "final-voiceover-verified", "count": 21}))
        return 0
    if args.finalize:
        timing, review = finalize()
        print(json.dumps({"event": "final-voiceover-finalized", "count": len(timing["cues"]), "asr": review["asr"]["status"]}))
        return 0
    timing = generate_batch()
    print(json.dumps({"event": "final-voiceover-generated", "count": len(timing["cues"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
