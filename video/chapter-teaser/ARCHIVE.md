# 《足迹回环》PV 归档说明

## 状态

本工程已于 2026-09-01 完成最终交付，后续作为长期保留但不再活跃的制作归档维护。归档分支为 `legacy/chapter-teaser-pv`，不计划合入 `dev`、`main` 或平台发行分支。

最终画面、竖屏适配、封面和 A4 片尾配乐均已由用户确认。最后一次内容定版提交为 `bd56ce3`（`fix: lock approved A4 finale tail`）。

## 最终投稿文件

| 平台 | 文件名 | SHA-256 |
|---|---|---|
| B 站 | `《拓扑五子棋》章节预告PV-「足迹回环」_B站_4K60.mp4` | `e874d30de2b06a0777da4db5e07b72b86f9debf131c71bf789d33b9676918b0c` |
| 抖音 | `《拓扑五子棋》章节预告PV-「足迹回环」_抖音_1080x1920_60fps.mp4` | `ac21fdc34941f543296ea2242b839985d0bfde637715bc53d8fbd27af14bbcb1` |
| 小红书 | `《拓扑五子棋》章节预告PV-「足迹回环」_小红书_1080x1440_60fps.mp4` | `d7d9966c930bff27dc71821b7d573355ffbc60b601439193274dec468160f014` |

三版均为 12897 帧、214.95 秒、60 fps、H.264 / AAC；平台原生画面码流逐比特保留，只替换最终 A4 混音。未保留或归档约 14 GB 的 ProRes 4K 母版。

## 可恢复内容

- 最终封面和封面生成器保留在 `video/chapter-teaser/deliverables/covers/` 与 `video/chapter-teaser/scripts/`。
- 分轨交付包括无字幕无声音画面、SRT、ASS、纯配乐、纯音效、配乐与音效、原始旁白、48 kHz 旁白和最终混音。
- 最终实际使用的 11 个配乐源文件按 `music-plan.json` 的文件名与 SHA-256 单独归档；候选配乐不保留。
- 所有可重建的关键帧、预览、封面探索和中间编码均不进入 Git，归档收尾时从 worktree 清除。

## 最终片尾

Saint-Saëns 终止式采用用户确认的 A4 包络：余响跨入双 Logo 36 帧、0.60 秒，第 12510 帧起至片尾为数字静音。精确源窗口、双层淡出与逐样本验证记录见 `music-plan.json`、`manifest.json` 和 `docs/design/qa.md`。

## 如需恢复制作

从 `legacy/chapter-teaser-pv` 建新的独立 worktree，将已归档的 11 个精选配乐源文件放回 `.tmp/chapter-teaser/source/music/curated/`，再按 `README.md` 的命令重建。不要直接在本归档分支继续开发；需要重新启动项目时应从归档分支新建任务分支。
