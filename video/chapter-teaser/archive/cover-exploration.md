# 《足迹回环》封面探索归档

封面设计环节已于 2026-09-01 收尾。当前工作树只保留最终字标、最终三比例封面、交付清单与最终生成链路；探索期的大体积候选、旧生成器和旧 QA 图片不再保留在 `HEAD`，避免误用，也减少约 50 MB 的当前树冗余。

## 历史锚点

| 提交 | 阶段 | 可恢复内容 |
| --- | --- | --- |
| `c40d034` | 初版投稿封面 | 球面主视觉与最早的 4:3、16:9、3:4 封面 |
| `42405e7` | 六方向拓扑探索 | 莫比乌斯、克莱因、射影、环面、边界粘合与自制矢量字标 |
| `d62d70f` | 图片生成与材质探索 | 手绘、水墨、二次元、瓷器、几何流形、游戏图鉴等候选 |
| `1525fd6` | v4 反馈收敛 | 环游棋盘、七流形、真实游戏 Logo、08 / 09 字标修正候选 |
| `df9204a` | v5 字标修复 | 08G–08I 与 09G–09I、实机环游棋盘、三比例缩略图验证 |
| `f0469b9` | 最终封面落盘 | 用户指定字标、较高不透明度棋盘、阴影与三比例原生排版 |
| `0471287` | 最终视觉微调 | 连续发光、标题节奏、4:3 与 3:4 独立间距定版 |

需要回看某一阶段时，请在临时 worktree 中检出对应提交；不要把历史生成命令重新接回当前 `package.json`。例如：

```powershell
git show 1525fd6:video/chapter-teaser/scripts/render-cover-selection-exploration.mjs
git show df9204a:artifacts/qa-chapter-teaser-cover-wordmarks-v5-4x3.png > candidate.png
```

## 已确认的取舍

- 放弃把普通 Windows 字体加少量装饰当作字标，也放弃简陋等宽 SVG 自制字形。
- 放弃水墨、俗套二次元笔触、过度透明流形和难以在缩略图识别的复杂群像。
- 主视觉确定为实机环游规则生成的 4 × 4 正方形格棋盘、5 × 5 交点、真实跨双边界五连路径与五枚黑子。
- 主字标确定为用户提供的透明 PNG；当前生成器只裁切透明留白、添加连续中性辉光与向下投影，不重绘字形。
- 横版允许字标压住棋盘形成前后层次；3:4 竖版字标必须与棋盘分离，左下角棋子保持完整可见。
- 副标题固定为“足迹回环”，无短横线；三种比例分别控制字号与纵向节奏。

## 当前唯一正式链路

- 字标：`video/chapter-teaser/assets/cover-final/wordmark.png`
- 生成器：`video/chapter-teaser/scripts/render-covers.mjs`
- 棋盘绘制模块：`video/chapter-teaser/scripts/render-cover-board.mjs`
- 命令：`npm run pv:covers`
- 成品：`video/chapter-teaser/deliverables/covers/`
- QA：`artifacts/qa-chapter-teaser-covers-final.png` 与 `artifacts/qa-chapter-teaser-covers-final-thumbnail.png`
