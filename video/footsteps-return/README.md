# 《拓扑五子棋》章节预告 PV—「足迹回环」

> 归档状态（2026-08-31）：本工程保留为早期 HyperFrames 探索，不再继续制作，也未产出通过最终媒体门的完整成片。正式交付由 `codex/chapter-teaser-pv` 分支接替。曾用于中断帧续渲染的实验脚本因后段帧一致性不足而未纳入归档；现有 176.1 秒原生 4K/60fps 半成品仅保存在本机归档目录，不进入 Git。

本目录是独立的 HyperFrames 预告片工程。画面直接驱动仓库现有游戏的真实 HTML/Canvas 渲染层，以一条可回拖、可逐帧检查的主时间线串联片头、七张章节牌、七段规则演示与曲面形变、七流形汇聚、片尾旁白和品牌落版。制作逻辑不进入玩家运行时。

本分支只作为可复查的历史探索保留，不合并到 `dev`，也不提升到任何发行分支。

## 可复现命令

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
