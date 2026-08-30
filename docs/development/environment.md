# 开发环境与依赖

仓库以 Node.js 运行测试与 H5 校验，以 PowerShell 执行 Windows 构建脚本；Python 用于确定性生成拓扑 SVG、内嵌字体子集、PV 的本地节奏配音与 Qwen3-TTS 配音试听。

## 基础工具

| 工具 | 用途 | 约束 |
| --- | --- | --- |
| Node.js | 测试、npm 任务与 PV 工具链 | `package.json` 要求 Node.js 22 或更高版本 |
| PowerShell | H5 校验、构建与字体命令入口 | 使用仓库脚本，不复制临时命令 |
| uv | Python 版本、虚拟环境与依赖锁定 | 以 `.python-version`、`pyproject.toml`、`uv.lock` 为准 |

游戏运行时没有 npm 依赖；测试使用 Node.js 内置测试运行器。PV 制作工具链锁定在 `package-lock.json`：HyperFrames、shader transitions、Playwright、Three.js、Tone 与 MIDI 解析库均由本地 npm 依赖提供。Python 环境由 `uv` 隔离在 `.venv/`，缓存放在 `.uv-cache/`，两者都不提交 Git。

## 常用命令

```powershell
npm test
npm run validate
npm run check
npm run build:xiaohongshu
npm run fonts:subset
npm run release:check-versions -- X.Y.Z
npm run pv:doctor
npm run pv:lint
npm run pv:validate
npm run pv:inspect
npm run pv:preview
npm run pv:voice
npm run pv:voice:auditions
npm run pv:score
node ./video/footsteps-return/scripts/capture-caption-evidence.mjs
```

- `npm run check` 同时执行逻辑测试、H5 包校验和文档检查。
- `npm run fonts:subset` 通过 `uv run --locked` 自动创建或同步 `.venv`，无需激活虚拟环境。
- `npm run release:check-versions -- X.Y.Z` 仅供维护者在稳定同步后检查 `main` 与三个发行分支的统一游戏版本。
- `npm run pv:doctor` 检查 PV 所需的 Node.js 22、FFmpeg、eSpeak NG、MuseScore 4 与仓库字体/拓扑资产；`pv:lint`、`pv:validate`、`pv:inspect` 依次执行合成静态、综合运行时质量门与布局检查。
- `npm run pv:game-render:verify` 在 Chromium 中验证 PV 专用的透明真实游戏渲染层：四角 alpha、教学文字抑制、纸张纹理禁用、相同状态像素哈希、形变与旋转差异。HyperFrames 通过同源 `render-game.html` 的 `gameRender.selectShot()` 与显式 `gameRender.render(state)` 驱动同一个持久 iframe/Canvas；它不会按墙钟自行播放，也不生成逐帧图片或中间视频。
- `npm run pv:voice` 读取锁定的 `audio/voiceover/script.json`，以 Kokoro-82M `zm_yunyang` / speed 0.88 生成 21 个可替换 cue WAV，归一化为 48kHz 单声道 16-bit PCM，再按实际采样时长重建字幕与 183.352 秒弹性时间线；`npm run pv:voice -- <文字或文本文件>` 仍保留单条 TTS 包装器，并强制写入被忽略的 PV 采集目录。
- `npm run pv:voice:auditions` 仅用锁定 revision `85e237c12c027371202489a0ec509ded67b5e4b5` 的官方 `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` 与内置普通话男声 `Uncle_Fu`，在 CPU 上生成同一开场原文的 documentary / adventure / contemplative 三条试听；它不生成或替换 21 条正式 cue。WAV 固定写入被忽略的 `captures/voice-auditions/`，归一化为 48kHz 单声道 PCM-16；加 `-- --verify` 可据已提交 manifest 复核本地 WAV 的格式、响度与 SHA-256。
- `node ./video/footsteps-return/scripts/capture-caption-evidence.mjs` 在真实 Chromium 中重放字幕，输出 6 张原生 4K 长期证据和本地忽略的 1920×1080 / 30fps / 69 秒字幕专审视频。
- `npm run pv:score` 从可审查的 `audio/score/score-plan.json` 确定性生成 11 声部 MusicXML / MIDI、逐声部 stem 与 5 类原创合成 SFX；doctor 必须把 MuseScore 4 / FFmpeg 解析为真实存在的绝对路径。MuseScore Basic 先真实渲染每条 stem，`score-audio.mjs` 再在这些 PCM 上消费静态声场和 Cylinder 横向自动化，FFmpeg 由同一批 stem 求和生成 48kHz 立体声母带。WAV 与低码率 Opus 审听件本地忽略；提交的 `render-metadata.json`、`review.json` 与 SVG 联系表记录时长、SHA-256、峰值、RMS、真实干声对比、MIDI 密度、章节 stem 主导配器、跨章连续性、声像迁移、波形 / 频谱及未完成的人类主观审听边界。完整视频渲染只使用 `pv:render:draft` 与 `pv:render:4k`，输出固定为 4K/60fps。
- 首次同步需要下载 `uv.lock` 中的依赖；之后会复用锁定环境与本地缓存。

## Python 环境

不要直接调用系统 `python`：WindowsApps 启动器可能不可执行，其他预装 Python 也不保证带有字体工具。

- Python 小版本由 `.python-version` 选择。
- 直接依赖声明在 `pyproject.toml`。
- 精确解析结果记录在 `uv.lock`，必须提交。
- 调整依赖使用 `uv add` 或 `uv remove`；不得直接向 `.venv` 执行 `pip install`。
- CI 或只读验证优先使用 `uv sync --locked` / `uv run --locked`，锁文件过期时应失败而不是静默更新。
- HyperFrames 的 Windows TTS 子进程通过 `HYPERFRAMES_PYTHON=.venv/Scripts/python.exe` 使用同一受控环境；不要向系统 Python 或用户级 site-packages 安装依赖。
- PV TTS 的直接依赖为 `kokoro-onnx==0.6.1`（MIT）、`qwen-tts==0.1.1`（Apache-2.0）与 `soundfile==0.14.0`（BSD-3-Clause），依赖只通过 `uv add` / `uv remove` 和 `uv.lock` 调整。Qwen 试听把模型仓库固定到不可变 revision 并保存官方包 LICENSE、模型卡及其 SHA-256 证据；模型快照进入 Hugging Face 本机缓存，`.venv`、模型权重与 WAV 都不提交。Kokoro-82M 模型与 voice pack 为 Apache-2.0，HyperFrames 首次生成时从 `thewh1teagle/kokoro-onnx` 的 `model-files-v1.0` release 下载到 `%USERPROFILE%\.cache\hyperframes\tts\`。

## 字体子集

`scripts/subset_display_fonts.py` 会收集 `app/` 内 HTML、CSS、JavaScript 与 JSON 的字符，并为 400/600/700 三个字重生成 WOFF2 子集。

默认 Windows 源字体是 `C:\Windows\Fonts\NotoSerifSC-VF.ttf`。其他环境通过 `TOPO_SERIF_SOURCE` 或脚本 `--source` 参数指定合法的完整 Noto Serif SC 可变字体；完整源字体不提交仓库。

文案改动流程：

1. 修改所有静态与动态文案及相关回归测试。
2. 运行 `npm test`，读取缺失字形报告。
3. 如有缺字，运行 `npm run fonts:subset`。
4. 同步更新三个字体 URL、`style.css` URL 与 `package.json` 版本缓存键。
5. 再运行 `npm run check`，并在目标视口确认字形、字重与排版。

字体许可见 [`licenses/OFL.txt`](../../licenses/OFL.txt)。

## 依赖变更原则

- 只安装完成当前仓库目标所需的依赖，优先使用已有标准库和仓库工具。
- 依赖变更必须包含用途说明、锁文件、验证结果和可回滚提交。
- 不提交全局环境、账号、令牌、机器私有配置、`.venv/`、缓存或下载产物。
- 新工具要提供稳定的仓库命令入口，避免要求协作者记忆解释器绝对路径。

## PV 制作工具链

《足音回归》PV 位于 `video/footsteps-return/`，母版为 3840×2160、60fps。先运行 `npm install` 安装锁定的本地依赖，再运行 `npm run pv:doctor`。

Windows 上缺少系统制作工具时，使用以下命令安装：

```powershell
winget install Gyan.FFmpeg
winget install eSpeak-NG.eSpeak-NG
winget install Musescore.Musescore
```

安装完成后重新打开终端，再运行 `npm run pv:doctor`。PV 的 `captures/`、`renders/`、`.hyperframes/`、生成的 WAV、低码率审听件与帧序列均被 Git 忽略；MusicXML / MIDI 作曲源、渲染元数据、制作说明、源代码、配置、依赖锁文件与 UTF-8/LF 归一化的实际 LICENSE / COPYING / 模型卡证据进入版本控制。配乐渲染固定为安装随附且许可文件可核验的 `MS Basic.sf3`（MIT）；不得静默换用 Muse Sounds、VST 或未登记 SoundFont。`assets/audio-licenses.json` 同时记录证据文件哈希与本机实际音频输入资产哈希，并把 MuseScore、FFmpeg、运行时和 phonemizer 准确标为仅构建工具。
