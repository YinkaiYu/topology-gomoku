# 《拓扑五子棋》章节预告 PV—「足迹回环」

> 归档状态（2026-08-31）：本工程保留为早期 HyperFrames 探索，不再继续制作，也未产出通过最终媒体门的完整成片。正式交付方案由 [`legacy/chapter-teaser-pv`](https://github.com/YinkaiYu/topology-gomoku/tree/legacy/chapter-teaser-pv) 保存。曾用于中断帧续渲染的实验脚本因后段帧一致性不足而未纳入归档；现有 176.1 秒原生 4K/60fps 半成品仅保存在原制作机的本地归档目录，不进入 Git。

本目录是独立的 HyperFrames 预告片工程。画面直接驱动仓库现有游戏的真实 HTML/Canvas 渲染层，以一条可回拖、可逐帧检查的主时间线串联片头、七张章节牌、七段规则演示与曲面形变、七流形汇聚、片尾旁白和品牌落版。制作逻辑不进入玩家运行时。

本分支只作为可复查的历史探索保留，不合并到 `dev`，也不提升到任何发行分支。

## 从这里开始

- 分支定位与维护边界：仓库根目录的 [`README.md`](../../README.md) 与 [`AGENTS.md`](../../AGENTS.md#legacyseven-realms-pv-归档规则)。
- 创意、画面和音频设计：[`DESIGN.md`](DESIGN.md)。
- 已完成的静态证据与未完成的验收项：[`QA.md`](QA.md)。
- 原始设计规格：[`../../docs/superpowers/specs/2026-08-30-seven-realms-pv-design.md`](../../docs/superpowers/specs/2026-08-30-seven-realms-pv-design.md)。
- 实施历史与任务边界：[`../../docs/superpowers/plans/2026-08-30-footsteps-return-pv.md`](../../docs/superpowers/plans/2026-08-30-footsteps-return-pv.md)。
- 素材与音频来源：[`assets/provenance.json`](assets/provenance.json) 与 [`assets/audio-licenses.json`](assets/audio-licenses.json)。
- 长期视觉证据：仓库根目录 [`artifacts/`](../../artifacts/)。

## 归档中保留了什么

- 直接驱动真实游戏 HTML/Canvas 的确定性逐帧 adapter，以及完整落子、辅助线、五连、二维到三维形变和旋转的连续状态契约。
- 七种拓扑流形的章节动画、两阶段章节牌、转场、七流形群像、单行字幕和 4K 布局检查。
- F「冷峻见证者」VoiceDesign 的文字、时序、模型 revision、来源和验证元数据；生成的旁白 WAV 与模型权重不在 Git 中。
- 十一声部原创配乐的 MusicXML/MIDI、编曲规划、渲染元数据、SFX 语义事件和最终混音认证契约；大体积 WAV 不在 Git 中。
- 24 个原生 4K 代表帧的联系表、动画图和机器可读 evidence。它们证明静态状态与源码绑定，不证明完整成片已经验收。

## 没有保留什么

- 没有 `footsteps-return-4k.mp4` 正式成片，也没有通过 `REQUIRE_PV_FINAL_OUTPUT=1` 的最终媒体报告。
- 没有逐帧缓存、渲染 transaction、中断恢复目录、Qwen/Kokoro 模型、`.venv`、`node_modules`、旁白/配乐/混音 WAV 或审片截图目录；这些资源在归档时被释放。
- 中断续渲染实验没有被保留。已采集前段与新进程后段在部分画面上无法达到生产级像素一致性，拼接会留下不可接受的视觉跳变。
- 本地半成品文件名为 `footsteps-return-partial-preview.mp4`，规格为 3840×2160、60fps、H.264 + AAC、176.100 秒、108,720,012 bytes，SHA-256 为 `8eb8a205ef58d591ba09ec0210d6fa4a1b2939e487bc6a64885fcc227907c487`。文件保存在仓库外，不属于 Git 归档；迁移时以文件名、规格与哈希共同确认身份。

## 如果需要复用成果

不要直接恢复本分支的活跃开发。先从最新 `dev` 创建新的 `codex/<task>` 分支和 worktree，再按最小范围移植需要的文件或提交，并重新验证当前游戏资产、依赖、许可证和视觉证据。原创配乐源也已作为 legacy source 保存在 `legacy/chapter-teaser-pv`，无需复制生成 WAV。

## 仅用于历史复现的命令

以下命令会重新下载约数 GiB 的依赖和模型；普通归档阅读不需要执行。

先在仓库根目录安装锁定依赖并检查本机工具：

```powershell
npm install
npm run pv:doctor
npm run pv:lint
npm run pv:validate
npm run pv:inspect
```

生成当前时间线的 24 帧原生 4K 联系表与动画图：

```powershell
node ./video/footsteps-return/scripts/render-contact-sheet.mjs
```

启动本地 Studio 预览，或渲染唯一的发布尺寸：

```powershell
npm run pv:preview
npm run pv:render:4k
```

`pv:render:4k` 先认证 Task 10 PCM-24 的完整字节数与流式 SHA-256，并分别锁定 75 个画面输入文件的 visual contract 与证据生成器/本地服务器的 2 文件 tooling contract；随后以两个 worker 强制走 Chrome `captureScreenshot`，并配合硬件浏览器、GPU 编码器、`--experimental-fast-capture=false`、`--no-best-effort` 与 strict lint 执行原生 3840×2160/60fps HyperFrames 渲染。严格模式会拒绝未完成的字体、真实游戏 adapter、旁白、配乐、SFX、WebGL 或最终音频认证。长渲染结束后脚本重新认证音频、两项 contract 与证据未变，再把同一母带一次编码为 48kHz stereo AAC 192k。测得的 `-0.35 dB` 交付余量只用于吸收 AAC 真峰值上冲，不改写 Task 10 母带或其 manifest。探测通过的临时 MP4 与其 SHA-256 sidecar 才会按同卷原子发布；没有 sidecar 的旧成片不能冒充当前输出。

`214.040 × 60 = 12,842.4` 不是整数帧，因此画面采用向上取整的 12,843 帧，容器画面时长为 214.050 秒。完整的 214.040 秒母带和片尾衰减不被裁切，只在末尾补 0.010 秒，误差小于一帧。

最终输出通过下列强制门复核：

```powershell
$env:REQUIRE_PV_FINAL_OUTPUT = "1"
node --test ./tests/pv-output.test.js
Remove-Item Env:REQUIRE_PV_FINAL_OUTPUT
```

该测试读取真实 MP4，核对 12,843 个 CFR 视频帧、唯一 H.264 视频流、唯一 48kHz stereo AAC 流、画面/音频时长、像素格式、全帧解码、长黑场、意外冻结、响度、真峰值与完整片尾衰减。

## 输入、证据与生成输出

- 画面与时间线源码：`index.html`、`compositions/`、`src/`、`hyperframes.config.json`。
- 最终混音契约：`audio/mix.json`；本地 PCM-24 母带为 `audio/mix/footsteps-return-draft.wav`，其字节与 SHA-256 必须和 manifest 一致。
- 制作与许可来源：`DESIGN.md`、`assets/provenance.json`、`assets/audio-licenses.json`。
- 可提交证据：仓库根目录的 `artifacts/pv-footsteps-return-task11-contact-sheet.png`、`artifacts/pv-footsteps-return-task11-animation-map.svg`、`artifacts/pv-footsteps-return-task11-evidence.json`。
- 本地生成并忽略：`captures/task11-contact-sheet/`、音频 WAV、渲染中间件、`renders/footsteps-return-4k.mp4` 与匹配的 `renders/footsteps-return-4k.manifest.json`。最终 MP4 不进入 Git。

完整技术与视觉边界见 [`QA.md`](QA.md)。自动化测量和代表帧检查不能替代连续播放审片；普通话可懂度、音乐平衡、SFX 遮蔽、运动质感和下游设备播放仍需用户确认。
