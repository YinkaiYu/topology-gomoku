# Task 9 报告：原创作曲、配器与音效工程

基线：`aaddb836ae7319853b9ec3d39518f92eace44bdc`；分支 / worktree：`codex/seven-realms-pv` / `seven-realms-pv`。

## 结果

- `score-plan.json` 是可审查的原创作曲源，明确声明没有导入、描摹、转录或变形参考 PV 音乐。全曲以 D–F–G–A–C（D minor pentatonic）五音 cell 为唯一核心材料，共编写 50 个具名 gesture，实际时间从 Task 8 的 `compositionTiming` 读取并锁定为 183.352 秒。
- 结构按 intro、七章、gallery、outro、end card 连续重写：intro 逐音发现主题；Plane 稳定原题；Cylinder 是带横向声像的单循环拨弦；Torus 是 5.10 / 4.65 秒两套错位循环；Mobius 使用 C–A–G–F–D retrograde 与反向包络；Klein 让低音单簧管原题和大提琴倒影错位对位；Projective 用 celesta 与 violin I 做 1.5 秒错位镜像 canon；Sphere 将主题交给钢琴和完整弦乐，并以克制圆号、轻合唱收束到 D minor；gallery / outro 回忆各章但继续推进；180.300 秒后保留尾音，最后 3.052 秒为真实静默。
- 各章结束处都有明确的停顿、终止音或 D/A 解决，不以机械循环或硬 fade 切断未解决乐句。MusicXML 为保证 MuseScore 4.7.4 稳定导入，使用 1/32 音符网格记谱至 183.250 秒；MIDI 保留 1000 PPQ 精确毫秒排程，真实 WAV 再补 102 ms 静默并精确裁到 183.352 秒。
- 配器包括 piano、celesta、violin I/II、viola、cello、double bass、French horn、bass clarinet、choir aahs 与 restrained percussion。所有事件均在声明的可演奏音域内；合唱仅弱音 `aah`，圆号只在结构铰点出现，打击乐共不超过 18 个事件，旁白区避免持续中频铺底。

## 确定性乐谱、真实渲染与分轨

- `build-score.mjs` 校验时间、重叠、音域与声部后，确定性生成 11 声部 master MusicXML / MIDI，以及 11 份单声部分轨 MusicXML / MIDI；两次生成的全部文件逐字节 SHA-256 一致。测试实际解析 MusicXML 的 part、measure、note、tie、duration 与 MIDI 的 track、note、tempo、pan CC，不只检查 JSON 字段。
- `render-score.ps1` 通过 doctor 返回的绝对路径调用 MuseScore 4.7.4 和 FFmpeg 9.0.1，不依赖 shell PATH；强制 `MuseScore Basic` profile，真实渲染 master 与 11 stems，再统一为 48 kHz / stereo / 24-bit PCM / 183.352 秒。WAV 和低码率试听 Opus 留在忽略目录，乐谱源、元数据和审查证据提交。
- master：SHA-256 `f38cab2e682708ec4651bb9842799ae1a369ed69cb5021475076ac1b9e6bba7e`，peak -13.643 dBFS，RMS -35.144 dBFS。11/11 stems 均有信号且时长、采样率、声道、位深一致；stem peak -30.505 至 -17.922 dBFS，RMS -57.917 至 -40.424 dBFS。
- 源哈希：score plan `7d696bb8df6677e35e235a52860ea8a6afc539c9470d9ffcfc6fa3899013129f`，master MusicXML `ba6fa7d83801c8dd7e5c1a41a273ab1dce167e97083b8fb1398b8f458e70d275`，master MIDI `435c557de13d019ae3dfb255ada8dec8ff38a78bee81b727476dd726bb7d5c07`；渲染元数据测试会拒绝任何陈旧哈希。

## SFX 与许可

- `sfx-plan.json` 只安排落子、跨缝、曲面弯曲、镜头遮蔽、换章低频五类，共 21 个稀疏 cue；由固定种子和明确参数确定性合成 5 个 48 kHz stereo WAV，不使用外部 sample，也没有持续轰鸣。每个生成文件的时长、peak、RMS 与 SHA-256 写入 `audio/sfx/render-metadata.json`。
- 实际渲染声源锁定 `C:\Program Files\MuseScore 4\sound\MS Basic.sf3`，SHA-256 `5ea2375e8bd7d8e71def1036978c1621e85b66934169b6a2744b27b9b3c2d99c`；配套 `MS Basic_License.md` SHA-256 `5ad8d737e13c7f01f5b9674872a82a92b4ba253603e8ed14b9db12293550b4b9`，许可为 MIT。`audio-licenses.json` 逐项记录原创乐曲 / SFX、MS Basic、MuseScore Studio GPL-3.0、FFmpeg GPL-3.0-or-later，以及 Task 8 旁白运行时与模型许可；所有外部音频资源均明确标记可用于商业视频发行。

## 客观审查与边界

- `review-evidence.svg` 将 183.352 秒 form、PCM 波形和九频带指纹对齐成联系表，SHA-256 `0820e4ffb8f26e1ef94d2b817ea4dfb882fc6eade81384ab6a7bf26b2ad6cab5`；已将 SVG 渲染为本地预览并检查可读性、章节密度变化、Sphere 展开与片尾静默尾巴。
- 客观检查为：无静音 / 缺失文件、无削波、11 stems 全有信号、时长一致；全旁白 cue window 的最小 score RMS 余量为 14.42 dB。低码率试听文件为 Opus 48 kbps VBR，1,252,049 bytes，SHA-256 `c1955de495c7bade5db2afd2eac6ce5b2e4d90399d2c0a3fad3bcf39ed6b009c`。
- 当前代理无法可信地替代人类评价管弦乐平衡、音乐情感或中文旁白可懂度，因此 `review.json` 如实记录 `subjectiveListening.status = not-completed`。最终混音前仍需在监听音箱和普通手机扬声器上人工审听；没有虚构“已试听”。

## TDD、诊断与验证

- RED：最初针对性测试因缺少 score plan、builder、SFX plan、许可和渲染元数据为 0/6；后续分别以 MusicXML 可计算时长、源哈希 freshness、试听文件哈希 / 大小断言先失败，再实现转绿。
- MuseScore 首次导入失败的根因是任意毫秒 duration 不能表示为合法记谱时值；改为 1/32 网格与标准时值拆分 / tie 后，11 声部 master 可真实导入。另修正 Windows PowerShell 5.1 缺少 `Path.IsPathFullyQualified`、GUI 进程未等待完成、MuseScore 4.7.4 不支持 `--no-webview`，以及 FFmpeg 24-bit WAVE_FORMAT_EXTENSIBLE PCM 解析。
- `npm run pv:score`：真实生成 / 渲染 / 分析 11 声部、50 gestures、183.352 秒 master 与 11 stems，通过。
- `node --test tests/pv-score.test.js`：6/6；`npm test`：151/151。
- `npm run pv:doctor`、`npm run pv:lint`、`npm run pv:validate`、`npm run pv:inspect`：通过；HyperFrames 0 errors / 0 warnings、0 layout issues、5/5 contrast。
- `npm run validate`：23 package files / 1980.3 KB；`npm run docs:check`：40 Markdown files；`git diff --check`：通过（仅既有 Windows LF→CRLF 提示，无 whitespace error）。

文档影响：更新 `video/footsteps-return/DESIGN.md` 的原创音乐 / SFX 契约与忽略边界，更新 `docs/development/environment.md` 的受控 MuseScore Basic 渲染、审查资产和许可要求。

## Rewrite / fix round 1（2026-08-30）

本节取代上方初版音乐结论；上方保留为被用户试听否决版本的历史记录。用户确认的重写要求是：不再用同一旋律做七次变奏，不以悲凉弦乐和琶音感主导，不把沉默当作默认衔接；七章分别拥有独立动机、调式、节奏、主导配器与内部弧线，仅在边界共享极短音响。

### 乐谱本体重写

- `score-plan.json` 已从 50 个旧 gesture 替换为 103 个原创 gesture，仍锁定 Task 8 的 183.352 秒时间线。D–F–G–A–C 以短促节奏细胞在 intro 出现并在 gallery / outro 可追踪回归；`cohesion.sharedChapterMelody = false`，七章只共享不超过 625 ms 的 D/A 边界音响。
- 七章材料分别为：Plane / D Lydian / 钢琴清亮主题；Cylinder / B-flat Mixolydian / bass clarinet 与移动拨弦的 3+3 周期；Torus / E Mixolydian–G Lydian / piano 4.75 秒与 celesta 5.25 秒错位周期；Mobius / C octatonic / viola、bass clarinet 与 3+2+3/8 折返；Klein / D Phrygian dominant / violin I 高声部与 bass clarinet、cello、double bass 低声部对答及金属推进；Projective / E Lydian / celesta、玻璃点、冷弦和弱合唱；Sphere / D major / piano、全弦、克制 horn、choir 完整展开并释放到 D6/9。
- 八个章节结构边界都写入跨线 outgoing phrase 和提前进入的 pickup，并各有和声枢纽、节奏或音色接力。生成 MIDI 测试逐个定位双方 note-on，验证 outgoing note 真正越过边界；真实 master 的 500 ms 边界窗口全部有信号，最低为 -51.30 dBFS，不再以长沉默代替转场。
- MusicXML 现在把章节调号、Mobius 的 3+2+3/8、pizz./arco 播放切换和声场声明写入 MuseScore 实际输入；MIDI 同步写入 3 个拍号和 8 个真实 FF 59 调号事件。所有 11 声部继续通过音域、时值、46 小节覆盖和可计算 tie 检查。
- 真实 stem 的章节主导音色依次为 piano、bass clarinet、celesta、viola、violin I、celesta、French horn，共出现 6 种主导音色；Sphere 的 11/11 声部均实际发声。该 PCM 结果与独立动机测试共同防止章节再次坍缩为一种音色或同一旋律。

### 上轮四项审查修复

1. **绝对工具路径**：先复现 doctor 输出裸 `ffmpeg`，随后 `render-score.ps1` 因非绝对路径中止。`resolveCommandPath()` 现在通过 `where.exe` / `which` 把可调用命令解析为真实存在的绝对文件；端到端测试直接执行 doctor JSON 中的 MuseScore / FFmpeg 路径并核验版本。当前 doctor 返回 `C:\Program Files\MuseScore 4\bin\MuseScore4.exe` 与 WinGet Gyan.FFmpeg 的绝对 `ffmpeg.exe`，`npm run pv:score` 已完整通过。
2. **真实 Cylinder 声像**：确认 MuseScore 4.7.4 忽略导入 MusicXML 的动态 pan，旧 cello WAV 在早窗仅 -1.74 dB，未发生左到右迁移。新增 `score-audio.mjs`，对 MuseScore Basic 真实渲染后的 PCM 消费 plan 的等功率声场与 5 点自动化，并以 250 ms 边缘过渡避免首尾单采样跳变，再从同一批 spatialized stems 求和 master。新 cello stem 38–42.5 秒为左重 +6.33 dB、52–56 秒为右重 -5.71 dB，真实摆幅 12.04 dB；测试对同一 WAV 和 metadata SHA-256 计算并核对。
3. **实际许可文件**：`assets/licenses/audio/` 保存实际 MS Basic license、匹配 MuseScore 4.7.4 的 LICENSE、安装的 Gyan.FFmpeg LICENSE、eSpeak COPYING、Kokoro Apache-2.0、Kokoro-82M 原始模型卡、安装的 kokoro-onnx MIT 与 python-soundfile BSD 文件。`audio-licenses.json` 逐项记录仓库证据路径 / SHA-256 / 来源；只把 `ms-basic-sf3` 与 `kokoro-82m-zm-yunyang` 分类为 `release-audio-input`，MuseScore、FFmpeg、运行时与 phonemizer 均准确分类为 `build-tool-only` / `releasedWithVideo: false`。实际输入资产哈希为 MS Basic `5ea2375e…d99c`、Kokoro ONNX `7d5df8ec…a6c5`、voice pack `bca610b8…bf7d`。
4. **真实旁白比较**：删除误导性的 `narrationBandHeadroomDb`。分析器读取并逐条 hash 验证 21 个 Task 8 干声 WAV，将每条真实 voice PCM 与 master 的精确时间窗比较；最小 voice-minus-score 宽带 RMS 为 7.07 dB，180–4500 Hz presence-band 为 6.81 dB。另从生成的 `master.mid` 计算旁白窗密度，最大 7.14 note-on/s、最大 16 个同时音高；字段名称、算法说明和数值含义一致。

### 真实渲染与证据

- `npm run pv:score`：MuseScore Studio 4.7.4 / MuseScore Basic 真实渲染 11 stems，经确定性 PCM 声场、FFmpeg stem sum 与格式归一化生成 48 kHz / stereo / 24-bit / 183.352 s master，成功。master SHA-256 `747dd5559e6e53991d842cd8fd1f76acb4ab2146d58c34cf13e6cf6d3ae3fe4e`，peak -18.616 dBFS，RMS -40.755 dBFS；11 stems peak -21.715 至 -8.389 dBFS、RMS -46.726 至 -35.130 dBFS。
- 当前源哈希：score plan `6db9d640cd3adbb22f4230bc5706f86c398ca7d954312166340e07bd9bfae9fa`、master MusicXML `3e92e3c43d079a62737086f98aa4ce066490d38bce5236888476a4451aeb9cd8`、master MIDI `c9e49b4d56944da1f48105668ea507fb52d32aa715a93df36bc6ed10a2a84b64`。
- 新审听件 `audio/score/review/score-review.opus` 为忽略的 Opus 48 kbps VBR，1,326,651 bytes，SHA-256 `84c0bd9071f3d683dd991eb26cac1b386b3838f4312708f158573dcc3ea529ce`。`review-evidence.svg` SHA-256 `41187a49221031ac90c42f8dfc3c5c8aeeac6067a0164b4ec586525c0a3a1911`；已渲染为本地 PNG 并目视确认 form、波形、Sphere 展开、outro 收束、最终静默及文本没有裁切。
- `subjectiveListening.status` 继续如实为 `not-completed`：自动证据证明文件、音符、声部、声像、密度、干声相对电平和跨章连续性，但不冒充人类对情绪、音色审美与旁白最终可懂度的听审。新版仍需用户用审听件确认音乐方向。

### TDD 与完整验证

- 审查复现 RED：`npm run pv:score` 因裸 FFmpeg 路径中止；新 score tests 为 2 pass / 6 fail，分别暴露旧章节材料、静默衔接、无真实许可证据、误名旁白指标和旧 stem 无声像迁移；新增 PCM spatializer 单测先以 module-not-found 失败，首尾平滑断言随后也先暴露单采样跳变再转绿。
- `node --test tests/pv-score.test.js tests/pv-score-audio.test.js tests/pv-toolchain.test.js`：17/17。
- `npm test`：155/155；`npm run validate`：23 package files / 1980.3 KB；`npm run docs:check`：42 Markdown files。
- `npm run pv:doctor`、`npm run pv:lint`、`npm run pv:validate`：通过；HyperFrames 0 errors / 0 warnings、0 layout issues、5/5 contrast。

文档影响：同步改写 `video/footsteps-return/DESIGN.md` 的七个独立音乐世界、连续转场、真实干声 / stem 证据和许可契约；更新 `docs/development/environment.md` 的绝对工具路径、真实 PCM spatialization、stem-sum master 与保存 LICENSE / COPYING / 模型卡要求。
