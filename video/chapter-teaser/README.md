# 章节预告 PV「七界足迹」

本目录保存可复现的章节预告 PV 源工程。画面由真实拓扑规则、参数曲面、内嵌字体和确定性 Canvas 合成器生成。小游戏与 PV 通过 `app/assets/topology-art.js` 真正共用配色、纸纹、网格、棋子、边界轨道和通关曲面材质；小游戏的 DOM/CSS 背景与液态玻璃棋盘舞台，以及游戏内教学引导，则由 PV 在 Canvas 中做视觉等效复刻。正式旁白完整录音是全片唯一主时钟，古典音乐资源按章节剪辑，FFmpeg 负责音频规范化、字幕封装与视频编码。大体积旁白、音乐资源、分轨、临时帧和视频全部写入仓库根目录的 `.tmp/chapter-teaser/`，不会提交 Git。

设计与内容约束见 [`DESIGN.md`](DESIGN.md)，新版逐帧旁白时轴见 [`narration-timing.json`](narration-timing.json)，字幕文稿见 [`narration-script.txt`](narration-script.txt)，音乐选曲与剪辑见 [`music-plan.json`](music-plan.json)，素材来源见 [`provenance.json`](provenance.json)。

## 环境准备

- Node.js 18 或更高版本，并已运行 `npm install`。
- FFmpeg 与 FFprobe 可从命令行直接调用。音频构建可用 `FFMPEG_PATH` 指定 FFmpeg 可执行文件，视频验证也可通过 `--ffprobe` 指定 FFprobe。
- 用户提供的完整旁白 MP3。构建时通过 `--voice` 指定；脚本会校验 SHA-256，禁止误用旧旁白或逐句重排。
- 十一份已审计的配乐音源缓存。按 `music-plan.json` 中的文件名与 SHA-256 放入 `.tmp/chapter-teaser/source/music/curated/`，再用 `--no-download` 离线构建；来源页与音质限制见 `assets/licenses/audio/curated-music-sources.md`。
- 完整 Noto Serif SC 与 Noto Sans SC 可变字体。默认读取 `C:\Windows\Fonts\NotoSerifSC-VF.ttf` 和 `C:\Windows\Fonts\NotoSansSC-VF.ttf`；其他位置可用 `TOPO_SERIF_SOURCE`、`TOPO_SANS_SOURCE` 指定。

所有视频都是 16:9、60 fps、BT.709，声音为 48 kHz 双声道：

| 用途 | 规格 | 默认输出 |
| --- | --- | --- |
| 审阅净画面 | 1920 × 1080，H.264，无字幕无声音 | `.tmp/chapter-teaser/review/chapter-teaser-clean.mp4` |
| 审阅成片 | 1920 × 1080，H.264 / AAC | `.tmp/chapter-teaser/delivery/topology-gomoku-chapter-teaser-final-1080p.mp4` |
| 4K 母版 | 3840 × 2160，ProRes 422 HQ / 24-bit PCM | `.tmp/chapter-teaser/master/seven-realms-master.mov` |

## 审阅流程

先生成字体、正式旁白、剪辑配乐、音效和确定性时间线：

```powershell
npm run pv:fonts
npm run pv:audio -- --voice "C:\path\to\余荫铠旁白配音.mp3"
```

- `pv:fonts` 重建标题用衬线 400/600/700 和字幕用无衬线 600 子集。
- `pv:audio` 保留原始旁白 MP3，并一次性解码为与 12897 帧严格对齐的 48 kHz 双声道；随后按 `music-plan.json` 剪辑十一段配乐、生成实机语义音效、侧链压低配乐，并同步生成 `manifest.json`、`captions.srt` 和 `captions.ass`。配乐以古典作品为主骨架，回廊与归圆分别使用一段完整的 HOYO-MiX 章节声音；相邻片段以 84 帧 `qsin` 曲线交接，Saint-Saëns 管风琴在最后一句挑战的 9.85 秒内由管弦推进抵达全乐团终止式，并于第 12474 帧结束，源录音随后 7.05 秒的静谧独奏不进入成片。《足迹》伴奏只用于结构与动态参考，不进入最终全频音乐轨。
- 音频分轨位于 `.tmp/chapter-teaser/audio/`：`music.wav`、`sfx.wav`、`music-and-sfx.wav`、`voice.wav`、`voice-original.mp3` 和 `master.wav`。
- Logo 片尾 `[12474,12897)` 共 7.05 秒；`music.wav`、`sfx.wav` 与 `voice.wav` 在该区间均为数字静音，不另加 Logo 到达声或氛围底噪。
- 1080p 字幕使用 72 px `Topo Sans PV` 无衬线字体和 4.2 px 纯黑描边；画面序幕让两侧边界实体直接贴合，不绘制上方绿色连接弧，并让棋盘面、经纬线、虚线路径和棋子始终共用同一曲面映射，虚线路径与运动棋子全程显现；2D 与 3D 五连辅助动画不绘制边界粘合位置的细线空心圆，完成拼合的三维章节画面与终章七流形则隐藏边界缝合线并保留金色五子连珠。

浏览器逐帧预览不会生成视频；加 `--open` 会用本机 Edge 打开预览页：

```powershell
npm run pv:serve -- --open
```

确认构图、字幕安全区和章节牌后，只渲染一次无字幕无声音的 1080p60 净画面，再烧录无衬线字幕、封装最终混音并汇总全部分轨：

```powershell
npm run pv:review-clean
npm run pv:package
npm run pv:verify -- .tmp/chapter-teaser/delivery/topology-gomoku-chapter-teaser-final-1080p.mp4 --profile review
```

`pv:package` 的交付目录包含：成片、无字幕无声音视频、SRT、ASS、纯配乐、配乐+音效、音效、原始 MP3 旁白、48 kHz 旁白和最终混音，并为全部文件写入 SHA-256 清单。

渲染器默认拒绝覆盖已存在的文件。确实要替换其他审阅版时显式传入 `--overwrite`：

```powershell
npm run pv:preview -- --overwrite
```

若输出到自定义路径，验证时传入同一路径；额外参数位于 npm 的 `--` 之后：

```powershell
npm run pv:review-clean -- --output .tmp/chapter-teaser/review/custom-clean.mp4
npm run pv:package -- --clean-video .tmp/chapter-teaser/review/custom-clean.mp4
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
