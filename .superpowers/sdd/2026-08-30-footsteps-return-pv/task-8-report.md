# Task 8 报告：旁白节奏轨与单行字幕

基线：`81032bcb630ed95f9bbc9bc2131803984f4a118d`；分支 / worktree：`codex/seven-realms-pv` / `seven-realms-pv`。

## 结果

- `script.json` 锁定 Task 2 的 21 条旁白原文与稳定 replacement ID；章节牌标题不报幕，正文“方庭”保留。`assets/transcript.txt` 与其逐条一致。
- 实际运行 `npm run pv:voice`，使用 Kokoro-82M 中文男声 `zm_yunyang`、speed 0.88、eSpeak NG phonemizer 生成 21 个 cue WAV。全部归一化为 48kHz / mono / 16-bit PCM，并按采样数记录 duration、SHA-256、peak、RMS、active ratio 与首尾静音。
- 21 cue 的实测 peak 为 -7.220 至 -2.767 dBFS、RMS 为 -27.442 至 -25.916 dBFS、active ratio 为 0.499543 至 0.540211；`timing.json` 的 resolved voice 为 `zm_yunyang`，`fallback=null`。
- 实际 WAV 时长驱动章节、旁白和字幕排程，母版由 165 秒参考弹性扩展为 183.352 秒；没有加速句子。gallery 仍比 outro 早 7 秒开始、持续 9.2 秒，与第一条片尾旁白保持退镜重叠。
- 21 条旁白拆为 46 个完整语义字幕 cue：白字、4px 黑描边、Topo Serif 88px、底边 180px、整行 7 帧淡入 / 淡出、cue 结束 hard clear；无底板、投影、发光、逐字与两行回退。句号省略，2 个语义问号保留。
- 真实 Chromium 在 3840×2160 逐条测量 46 cue；全部单行、同一基线、最多一个可见 caption group。最宽 `cylinder-distance-01` 与 `sphere-boundary-01` 均为 1672 / 3456px，无需缩字或压字距。

计数澄清：`script.json` 的 21 个旁白 cue 合计定义 46 个 caption cue，生成的 `captionCues` 与 review render 都是 46 / 46。早期进度中出现的“47”是误计；`index.html` 另有 1 个无文本的静态 `<p data-caption-text>` 启动占位，运行时会由 `replaceChildren()` 移除，不是字幕定义。合法零字幕区为 7 个章节牌、无旁白 gallery 与 end card；21 个旁白 cue 均至少映射 1 个字幕 cue，没有遗漏。

## Kokoro 运行时诊断

首次 HyperFrames TTS 真实错误为：`Python 3 is required ... pip install kokoro-onnx soundfile (or point HYPERFRAMES_PYTHON at a venv python...)`。根因是 CLI 在 Windows 只探测 `HYPERFRAMES_PYTHON`、`python3`、`python`，PATH 命中不可用的 WindowsApps launcher，未发现仓库 `.venv`。

使用 `uv add kokoro-onnx soundfile` 把 `kokoro-onnx==0.6.1` 与 `soundfile==0.14.0` 纳入 `pyproject.toml` / `uv.lock`，并让 TTS 子进程通过 `HYPERFRAMES_PYTHON=.venv/Scripts/python.exe` 使用受控环境。许可记录：kokoro-onnx MIT、SoundFile BSD-3-Clause、Kokoro-82M 模型与 voice pack Apache-2.0；模型缓存位于 `%USERPROFILE%\.cache\hyperframes\tts\`，不提交。

首 3 cue 的 0.84 / 0.88 / 0.92 speed 实测合计约 20.35 / 19.56 / 18.77 秒；选择 0.88 保留成熟、沉静、克制的参考节奏，没有为命中 165 秒追速。早期 eSpeak `cmn+m3` / 154 参数产生 356.081 秒，已明确拒绝作为成片节奏，也未写入最终 resolved voice；仅作故障兜底的 eSpeak `-s 300` 已按 21 个独立 cue 校准为 145.855283 秒纯语音，可把含停顿母版维持在合理审片范围，且 fallback metadata 会记录真实参数。

## 审阅边界与证据

`review.json` 记录逐 cue 信号检查、运行时 / 许可、三档校准与一对一替换契约。HyperFrames Whisper small/zh 辅助转写真实返回 `whisper_unavailable`；当前代理也无法对返回音频作可信的中文主观听审，因此没有虚构“已试听”。节奏轨可供剪辑，最终混音前仍需中文母语者逐 cue 复核发音与听感，且不得擅自改词。

`capture-caption-evidence.mjs` 生成 6 张原生 4K 代表帧、manifest 与联系表；联系表 SHA-256 为 `bea7256645f776f227905407424e79bd12d23a722a2382c4c8c74c433702b8e5`。同时用 doctor 找到的 FFmpeg 9.0.1 生成本地忽略的 46-cue 字幕专审视频：1920×1080、30fps、69 秒、451491 bytes、SHA-256 `ec8a153f20d8302a1cbb43618061aff1823d08cf3b229dd6ca464ac424ab7552`。

时间轴改变后，旧 Task 7 绝对时刻断言已改为读取生成场景 / cue 时间，并重录 7 张原生 4K 过场证据；当前 gallery / outro 重叠证据为 162.90 与 164.82 秒，联系表 SHA-256 `197c9d499b0e3b6fd858bfe4c5f8e2e4f28771be0039d1e67b7a03d4706efe61`。

## 验证

- TDD RED：初始 `node --test tests/pv-captions.test.js` 因缺少 script / caption implementation 为 0/5；实现中可逆 seek 测试先暴露单个可变 text node 的倒放串词，改为同一 group 内的固定 cue nodes 后转绿。caption review 证据测试也先以缺少生成脚本 / manifest metadata 失败，再实现。
- `npm run pv:voice`：21/21 cue 成功；183.352 秒；最宽字幕 1672 / 3456px。
- `node --test tests/pv-captions.test.js`：6/6 通过。
- `npm test`：143/143 通过。
- `npm run pv:doctor`、`npm run pv:lint`、`npm run pv:validate`、`npm run pv:inspect`：通过；HyperFrames 0 errors / 0 warnings、0 layout issues、5/5 contrast。
- `npm run validate`：23 package files 通过；`npm run docs:check`：37 Markdown files 通过；`git diff --check`：通过。

文档影响：更新 `video/footsteps-return/DESIGN.md` 的字幕 / 旁白契约、`docs/development/environment.md` 的受控 Kokoro 环境与许可、`docs/design/qa.md` 的 Task 7 动态时间证据及 Task 8 字幕证据。
