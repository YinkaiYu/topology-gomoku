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
