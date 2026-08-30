# 章节预告 PV「七界足迹」

本目录保存可复现的章节预告 PV 源工程。画面由真实拓扑规则、参数曲面、内嵌字体和确定性 Canvas 合成器生成；MuseScore 负责渲染原创管弦配乐，FFmpeg 负责编码与封装。大体积语音、音乐分轨、临时帧和视频全部写入仓库根目录的 `.tmp/chapter-teaser/`，不会提交 Git。

设计与内容约束见 [`DESIGN.md`](DESIGN.md)，旁白和七章数据见 [`story.json`](story.json)，素材与许可来源见 [`provenance.json`](provenance.json)。

## 环境准备

- Node.js 18 或更高版本，并已运行 `npm install`。
- FFmpeg 与 FFprobe 可从命令行直接调用。音频构建可用 `FFMPEG_PATH` 指定 FFmpeg 可执行文件，视频验证也可通过 `--ffprobe` 指定 FFprobe。
- MuseScore 4 与 MuseScore Basic 音色库，用于从仓库内的原创乐谱源渲染配乐；非默认安装位置用 `MUSESCORE_PATH` 指定 `MuseScore4.exe`。
- Windows PowerShell。当前本地审阅旁白使用系统的 Microsoft Kangkang 男声，只用于节奏、字幕和混音审阅；公开成片应换成已授权的正式配音。
- 完整 Noto Serif SC 可变字体。默认读取 `C:\Windows\Fonts\NotoSerifSC-VF.ttf`，其他位置可用 `TOPO_SERIF_SOURCE` 指定。

所有视频都是 16:9、60 fps、BT.709，声音为 48 kHz 双声道：

| 用途 | 规格 | 默认输出 |
| --- | --- | --- |
| 审阅版 | 1920 × 1080，H.264 / AAC | `.tmp/chapter-teaser/review/seven-realms-review.mp4` |
| 4K 母版 | 3840 × 2160，ProRes 422 HQ / 24-bit PCM | `.tmp/chapter-teaser/master/seven-realms-master.mov` |

## 审阅流程

先生成字体、音轨和确定性时间线，再输出 4K 关键帧：

```powershell
npm run pv:fonts
npm run pv:audio
npm run pv:keyframes
```

- `pv:fonts` 重建 PV 专用 400/600/700 字重子集。
- `pv:audio` 通过 MuseScore Basic 渲染 11 份原创 MusicXML 分谱，再归一为 48 kHz 双声道并汇成钢琴、弦乐、低音/铜管、合唱、音效/打击五条总线；随后与本地审阅旁白混音，并同步生成 `manifest.json`、`captions.srt` 和 `captions.ass`。乐谱渲染缓存位于 `.tmp/`，源文件哈希变化时会自动失效。
- `pv:keyframes` 输出 3840 × 2160 关键帧、`frames.json` 和联系表到 `.tmp/chapter-teaser/keyframes-4k/`，用于同一视口的视觉 QA。

浏览器逐帧预览不会生成视频；加 `--open` 会用本机 Edge 打开预览页：

```powershell
npm run pv:serve -- --open
```

确认构图、字幕安全区和章节牌后，渲染 1080p60 完整审阅版并验证帧数、色彩、音频与封装规格：

```powershell
npm run pv:preview
npm run pv:verify
```

渲染器默认拒绝覆盖已存在的文件。确实要替换旧审阅版时显式传入 `--overwrite`：

```powershell
npm run pv:preview -- --overwrite
```

若输出到自定义路径，验证时传入同一路径；额外参数位于 npm 的 `--` 之后：

```powershell
npm run pv:preview -- --output .tmp/chapter-teaser/review/seven-realms-review-final.mp4
npm run pv:verify -- .tmp/chapter-teaser/review/seven-realms-review-final.mp4 --profile review
```

## 4K 母版

只有在 1080p60 审阅版获得用户明确确认后，才生成和验证 4K60 母版：

```powershell
npm run pv:master
npm run pv:verify -- --profile master
```

渲染、预览和验证都不会自动提交、更不会合并或更新任何长期分支。用户确认前，本任务始终留在独立 worktree 的 `codex/chapter-teaser-pv` 分支。

## 完成前检查

```powershell
npm test
npm run validate
npm run docs:check
git diff --check
git status --short
```

视觉联系表只能确认构图与静态状态，不能代替完整成片的转场、旁白可懂度、配乐层次、字幕时序和响度审听。
