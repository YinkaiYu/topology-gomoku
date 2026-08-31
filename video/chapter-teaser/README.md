# 章节预告 PV「七界足迹」

本目录保存可复现的章节预告 PV 源工程。画面由真实拓扑规则、参数曲面、内嵌字体和确定性 Canvas 合成器生成。小游戏与 PV 通过 `app/assets/topology-art.js` 真正共用配色、纸纹、网格、棋子、边界轨道和通关曲面材质；小游戏的 DOM/CSS 背景与液态玻璃棋盘舞台，以及游戏内教学引导，则由 PV 在 Canvas 中做视觉等效复刻。正式旁白完整录音是全片唯一主时钟，古典音乐资源按章节剪辑，FFmpeg 负责音频规范化、字幕封装与视频编码。大体积旁白、音乐资源、分轨、临时帧和视频全部写入仓库根目录的 `.tmp/chapter-teaser/`，不会提交 Git。

设计与内容约束见 [`DESIGN.md`](DESIGN.md)，新版逐帧旁白时轴见 [`narration-timing.json`](narration-timing.json)，字幕文稿见 [`narration-script.txt`](narration-script.txt)，音乐选曲与剪辑见 [`music-plan.json`](music-plan.json)，素材来源见 [`provenance.json`](provenance.json)。

## 环境准备

- Node.js 18 或更高版本，并已运行 `npm install`。
- FFmpeg 与 FFprobe 可从命令行直接调用。音频构建可用 `FFMPEG_PATH` 指定 FFmpeg 可执行文件，视频验证也可通过 `--ffprobe` 指定 FFprobe。
- 用户提供的完整旁白 MP3。构建时通过 `--voice` 指定；脚本会校验 SHA-256，禁止误用旧旁白或逐句重排。
- 十一份已审计的配乐音源缓存。按 `music-plan.json` 中的文件名与 SHA-256 放入 `.tmp/chapter-teaser/source/music/curated/`，再用 `--no-download` 离线构建；来源页与音质限制见 `assets/licenses/audio/curated-music-sources.md`。
- 完整 Noto Serif SC 与 Noto Sans SC 可变字体。默认读取 `C:\Windows\Fonts\NotoSerifSC-VF.ttf` 和 `C:\Windows\Fonts\NotoSansSC-VF.ttf`；其他位置可用 `TOPO_SERIF_SOURCE`、`TOPO_SANS_SOURCE` 指定。

所有视频均为 60 fps、BT.709，声音为 48 kHz 双声道；横屏母版与平台版保持 16:9，竖屏平台版使用专门的原生竖屏构图：

| 用途 | 规格 | 默认输出 |
| --- | --- | --- |
| 审阅净画面 | 1920 × 1080，H.264，无字幕无声音 | `.tmp/chapter-teaser/review/chapter-teaser-clean.mp4` |
| 审阅成片 | 1920 × 1080，H.264 / AAC | `.tmp/chapter-teaser/delivery/topology-gomoku-chapter-teaser-final-1080p.mp4` |
| 4K 母版 | 3840 × 2160，ProRes 422 HQ / 24-bit PCM | `.tmp/chapter-teaser/master/seven-realms-master.mov` |
| B 站投稿版 | 3840 × 2160，H.264 / AAC | `.tmp/chapter-teaser/bilibili/seven-realms-bilibili-4k60.mp4` |
| 抖音投稿版 | 1080 × 1920，H.264 / AAC，原生 9:16 构图 | `.tmp/chapter-teaser/social/douyin/topology-gomoku-douyin-1080x1920-60fps.mp4` |
| 小红书投稿版 | 1080 × 1440，H.264 / AAC，原生 3:4 构图 | `.tmp/chapter-teaser/social/xiaohongshu/topology-gomoku-xiaohongshu-1080x1440-60fps.mp4` |

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

生成结果位于 `.tmp/chapter-teaser/master/`：`seven-realms-master.mov` 为 3840 × 2160、60 fps、ProRes 422 HQ、10-bit 4:2:2、BT.709 与 48 kHz / 24-bit PCM 母版。4K 渲染关闭 Canvas 字幕，并在编码阶段用与 1080p 定版相同的 `captions.ass` 和内嵌 `Topo Sans PV` 字体烧录，保证字号、位置和纯黑描边按画幅等比例一致；`delivery-manifest.json` 记录帧数、媒体探测、片尾数字静音与来源清单哈希，`seven-realms-master.mov.sha256` 用于文件完整性校验。

## 竖屏平台版

抖音与小红书版本不读取横屏成片，也不使用裁切、模糊补边或上下留白来伪造竖屏。两版均由共享 Canvas 合成器直接在目标画布上逐帧重绘：片头棋盘透视、七种手绘拓扑苏醒、章节牌、实机棋盘到参数曲面的形变、七界群像、终章与双 Logo 片尾都具有独立的纵向布局；棋路、棋子、曲面和图鉴仍复用 `app/assets/` 的真实游戏资产。9:16 与 3:4 分别调整内容密度、主舞台高度、字幕安全区和片尾层级。

先生成原生竖屏关键帧并检查构图，再覆盖输出完整平台成片：

```powershell
npm run pv:social:douyin -- --keyframes
npm run pv:social:xiaohongshu -- --keyframes
npm run pv:social:douyin -- --overwrite
npm run pv:social:xiaohongshu -- --overwrite
```

两个交付目录都包含成片、平台专用 ASS、内嵌字幕字体、SHA-256 校验和 `delivery-manifest.json`。平台字幕使用 68 px 无衬线 `Topo Sans PV` 与 5.8 px 纯黑描边，允许长句自然换为两行，时间点完全继承已确认的 60 fps 整数帧时轴。片头竖屏参数面在闭合前保持等距正方形网格，闭合后使用恒定半径圆柱与正交投影；七图鉴采用单—双—单—双—单纵向节奏，七流形群像采用 2—3—2 编队，终章中心球与六个环绕流形分别留出独立空间，双 Logo 使用更宽松的联名锁定关系。

## 投稿封面与文案

投稿标题和简介的唯一来源为 [`publishing-copy.json`](publishing-copy.json)，导出时不会改写标点、章节名或顺序。三版封面复用暖纸背景、手绘球面与金色五连，只保留“拓扑五子棋”和“足迹回环”两级大标题，不加入小字或章节清单：

```powershell
npm run pv:covers
```

最终封面输出位于 `video/chapter-teaser/deliverables/covers/`：4:3 为 1600 × 1200，16:9 为 1920 × 1080，3:4 为 1080 × 1440。字标固定使用用户确认的 `assets/cover-final/wordmark.png`，渲染器只裁切透明留白并添加覆盖全画布、连续衰减的中性光晕与向下投影，不重绘字形，也不以矩形裁切光晕。主视觉使用实机环游 4 × 4 格棋盘与真实跨界五连路径，在纸玻璃棋盘下增加较高不透明度的承托层、接触阴影和柔和投影。横版允许字标覆盖棋盘以形成前后层次；3:4 竖版将字标完整排在棋盘下方并保留明显间隔，确保左下角棋子不被遮挡。“足迹回环”使用更大的内嵌衬线字体、浅色轮廓与投影，不再带短横线；4:3 单独上移以靠近主字标，3:4 则下移并拉开两级标题间距。同目录保存发布文案、来源哈希、三比例审阅图、真实缩略图及交付清单。

封面方向探索另用下列命令生成，不覆盖上述已交付封面：

```powershell
npm run pv:covers:directions
```

输出位于 `.tmp/chapter-teaser/cover-directions/`，含 A–F 六套方向及每套 4:3、16:9、3:4 三个比例：莫比乌斯连续体、克莱因内外通道、射影交汇、环面双周期轨道、边界粘合之门和字成流形。前五套的金色棋路与五枚棋子不是屏幕空间贴图，而是由 `topology.js` 的真实五连和 `topology-morph.js` 的参数曲面投影共同生成；F 套把五子路径、末着红点和青色粘合边界直接收进“拓扑五子棋”五字专属展示字标。六套都只保留“拓扑五子棋”和“足迹回环”两级大字，并使用内侧 9% 安全区。方向获选后再把字标收敛为独立 display / mini 两级矢量资产。

针对缩略图辨识度和原生字标的第二轮重构使用：

```powershell
npm run pv:covers:redesign
```

输出位于 `.tmp/chapter-teaser/cover-redesign/`，包含 A–D 四套少而精的方向及三个比例：克莱因玄瓷、莫比乌斯漆刃、射影徽章和图鉴墨刻。主视觉均以不透明大色面、强剪影和少量结构线替代透明网格，并额外生成 160 × 90、160 × 120、135 × 180 的真实缩略图证据。“拓扑五子棋”不再由字体排版或字面装饰生成，而是由脚本中逐笔重画的共享带状骨架、中央上下穿越和“棋”末笔全词回环组成；同目录交付彩色、纯黑、反白三套 SVG 矢量母版，以及 240 px 与 4 px 模糊轮廓测试。`足迹回环`继续使用内嵌字体，作为克制的次级标题。

图片生成模型的独立探索不会覆盖上述矢量候选。已核验的透明字标与流形主视觉保存在 `assets/cover-exploration/`，真实游戏 Logo 仍直接读取 `app/assets/brand-icon.png`；运行：

```powershell
npm run pv:covers:imagegen
```

输出位于 `.tmp/chapter-teaser/cover-imagegen-exploration/`，把真实 Logo 主视觉、《足迹》式深浅双体、游戏图鉴手绘、水墨回环、克制二次元、实体材质、几何构成和更大胆的图鉴幻想分为 A–J 十个方向；其中 G、I、J 是同一品牌语法下的几何折叠、几何克莱因与几何双体三件套。每个可用方向同时生成 4:3、16:9、3:4 和对应比例的对比总览。脚本只组合仓库中已经落盘的生成资产，不把文字再次交给模型重绘；缺少某个方向的字标或主视觉时会跳过该方向，少于四个完整方向则明确失败。

根据缩略图实测与逐字反馈收敛后的候选集使用：

```powershell
npm run pv:covers:selection
```

当前命令输出 `.tmp/chapter-teaser/cover-wordmark-exploration-v5/`。主视觉固定为由实机 `topology-art.js` 与 `topology.js` 重建的环游棋盘：4 × 4 正方形格、5 × 5 交点、同向周期边界、真实跨两组边界的五连路径与五枚黑子，不含辅助圆。字标只比较普通内嵌字体基准、08「足迹」修复组三版和 09B 几何修复组三版；“五”恢复与其他字一致的比例，“棋”保持完整的“木 + 其”结构。4:3、16:9、3:4 均独立重排，超大标题覆盖棋盘约 18–25%，目录同时保存全尺寸单图、对比总览、真实缩略图、字标板和哈希清单。旧的 v4 探索仍可用 `npm run pv:covers:selection:v4` 复现。

只检查棋盘材质与三比例布局时可运行 `npm run pv:covers:board`，预览写入 `.tmp/chapter-teaser/cover-board-v5/`。

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
