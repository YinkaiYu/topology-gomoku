---
license: apache-2.0
pipeline_tag: text-to-speech
language:
- zh
- en
- ja
- ko
- de
- fr
- ru
- pt
- es
- it
tags:
- tts
- qwen
- audio
arxiv: 2601.15621
---

# Qwen3-TTS-12Hz-0.6B-CustomVoice

[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) is a series of advanced multilingual, controllable, robust, and streaming text-to-speech models developed by the Qwen team.

This specific checkpoint is the **0.6B CustomVoice** variant, based on the **12Hz** tokenizer. It supports 9 premium timbres and allows for fine-grained style control over target voices via natural language instructions across 10 major languages.

- **Paper:** [Qwen3-TTS Technical Report](https://huggingface.co/papers/2601.15621)
- **GitHub:** [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
- **Demo:** [Hugging Face Spaces](https://huggingface.co/spaces/Qwen/Qwen3-TTS)

## Key Features
* **Multilingual Synthesis**: Supports Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, and Italian.
* **Intelligent Control**: Adapts tone, rhythm, and emotional expression based on natural language instructions (e.g., "Speak in a very happy tone").
* **Low Latency**: Optimized for streaming generation with the Qwen3-TTS-Tokenizer-12Hz, achieving end-to-end synthesis latency as low as 97ms.

## Quickstart

To use Qwen3-TTS, you can install the `qwen-tts` package:

```bash
pip install -U qwen-tts
```

### Sample Usage

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

# Load the model
model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
)

# Generate speech with specific instructions
wavs, sr = model.generate_custom_voice(
    text="其实我真的有发现，我是一个特别善于观察别人情绪的人。",
    language="Chinese",
    speaker="Vivian",
    instruct="用特别愤怒的语气说",
)

# Save the generated audio
sf.write("output_custom_voice.wav", wavs[0], sr)
```

## Supported Speakers

For `Qwen3-TTS-12Hz-0.6B-CustomVoice`, the following speakers are supported. We recommend using each speaker’s native language for the best results:

| Speaker | Voice Description | Native Language |
| --- | --- | --- |
| Vivian | Bright young female voice. | Chinese |
| Serena | Warm, gentle young female voice. | Chinese |
| Uncle_Fu | Seasoned male voice, mellow timbre. | Chinese |
| Dylan | Youthful Beijing male voice. | Chinese (Beijing) |
| Eric | Lively Chengdu male voice. | Chinese (Sichuan) |
| Ryan | Dynamic male voice with rhythm. | English |
| Aiden | Sunny American male voice. | English |
| Ono_Anna | Playful Japanese female voice. | Japanese |
| Sohee | Warm Korean female voice. | Korean |

## Citation
If you find Qwen3-TTS useful for your research, please consider citing:

```bibtex
@article{Qwen3-TTS,
  title={Qwen3-TTS Technical Report},
  author={Hangrui Hu and Xinfa Zhu and Ting He and Dake Guo and Bin Zhang and Xiong Wang and Zhifang Guo and Ziyue Jiang and Hongkun Hao and Zishan Guo and Xinyu Zhang and Pei Zhang and Baosong Yang and Jin Xu and Jingren Zhou and Junyang Lin},
  journal={arXiv preprint arXiv:2601.15621},
  year={2026}
}
```
