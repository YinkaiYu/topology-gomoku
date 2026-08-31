# 视觉 QA

本文记录拓扑五子棋长期有效的视觉验收方式、可复现证据和记录格式。视觉原则见 [`visual-language.md`](visual-language.md)；版本化实现细节应留在提交与 Pull Request 中。

## 验收流程

1. 在独立任务 worktree 中确定基线视口、内容和交互状态。
2. 修改前后使用同一视口、同一数据和同一状态截图；移动端 H5 默认至少覆盖 390 × 844，涉及宿主顶栏或紧凑布局时补 360 × 770。
3. 检查字体、层级、间距、对齐、颜色、材质、动效首尾、裁切、滚动与安全区。
4. 把最终有效证据存入 `artifacts/`，文件名包含功能、状态和版本或任务标识。
5. 在任务 worktree 提供本地预览，等待用户或评审者明确确认；确认前不合并。

截图不能代替交互检查。拖动、弹性、跨状态切换、键盘/触摸反馈和宿主安全区必须在可操作预览中验证。

## 检查清单

### 视觉一致性

- 符合简约、典雅、克制的整体气质。
- 新组件复用既有设计 token 与交互状态，不形成孤立风格。
- 液态玻璃保持通透、克制和连续，不出现乳白厚雾、硬色带、重影或过强彩边。
- 强调色数量和对比层级受控，玩法内容仍是视觉主体。

### 排版与字体

- 目标视口内无裁切、溢出、意外换行或层级混乱。
- 用户可见文本由内嵌字体覆盖，字形、字重和行高一致。
- 文案修改后 `npm test` 的字体覆盖测试通过。

### 动效与交互

- 静止、按下、拖动、释放、禁用状态首尾准确。
- 位移、形变与折射连续，无跳帧、闪烁、重复图像或残留状态。
- 触摸目标、滚动、安全区与宿主浮层在目标设备上可用。

### 证据质量

- 前后证据使用相同视口、内容和交互状态。
- 证据路径相对于仓库，文件真实存在且可由评审者打开。
- 不记录本机绝对路径、临时剪贴板路径或聊天附件路径。

## 当前有效回归证据

| 范围 | 证据 |
| --- | --- |
| 内嵌字体与终章标题 | [`artifacts/qa-font-gui-v1351.png`](../../artifacts/qa-font-gui-v1351.png) |
| 拓扑图鉴线条与字形层级 | [`artifacts/qa-topology-glyph-lines-v1352.png`](../../artifacts/qa-topology-glyph-lines-v1352.png) |
| 液态玻璃总体对比 | [`artifacts/qa-liquid-glass-full-comparison.jpg`](../../artifacts/qa-liquid-glass-full-comparison.jpg) |
| 液态玻璃与 iOS 参考的同状态对比 | [`artifacts/qa-liquid-ios-comparison-v134-final.jpg`](../../artifacts/qa-liquid-ios-comparison-v134-final.jpg) |
| 难度滑块按下态 | [`artifacts/qa-liquid-slider-pressed-v134-final.png`](../../artifacts/qa-liquid-slider-pressed-v134-final.png) |
| 开关越界拖动态 | [`artifacts/qa-liquid-switch-overdrag-v134-final.png`](../../artifacts/qa-liquid-switch-overdrag-v134-final.png) |
| 液态控件停靠点 | [`artifacts/qa-liquid-detents-v1360.png`](../../artifacts/qa-liquid-detents-v1360.png) |
| 液态滑块惯性点击 | [`修改前 220 ms`](../../artifacts/qa-liquid-inertia-before-220ms.png)、[`优化后 220 ms`](../../artifacts/qa-liquid-inertia-after-220ms.png)、[`稳定态`](../../artifacts/qa-liquid-inertia-after-settled.png) |
| 难度滑块连续拖动 | [`artifacts/qa-difficulty-slider-drag-stable-390x844.png`](../../artifacts/qa-difficulty-slider-drag-stable-390x844.png) |
| 棋子按下与释放 | [`按下`](../../artifacts/qa-stone-pressed-v134-final.png)、[`释放`](../../artifacts/qa-stone-released-v134-final.png) |
| Android/HarmonyOS 顶部避让 | [`artifacts/qa-host-top-inset-android-360x770-v1361.png`](../../artifacts/qa-host-top-inset-android-360x770-v1361.png) |
| iOS 安全区护栏 | [`artifacts/qa-host-top-inset-ios-game-v1361.png`](../../artifacts/qa-host-top-inset-ios-game-v1361.png) |
| 关卡卡片进入棋盘 | [`进入前`](../../artifacts/qa-level-card-entry-before-v1361.png)、[`回弹中`](../../artifacts/qa-level-card-entry-mid-v1361.png)、[`稳定态`](../../artifacts/qa-level-card-entry-settled-v1361.png) |
| 棋盘返回关卡卡片 | [`收束中`](../../artifacts/qa-level-card-return-mid-v1361.png)、[`稳定态`](../../artifacts/qa-level-card-return-settled-v1361.png) |
| AI 难度文案与内嵌字体 | [`artifacts/qa-ai-difficulty-labels-v1363.png`](../../artifacts/qa-ai-difficulty-labels-v1363.png) |
| 章节预告 PV「七界足迹」旧黑底基线 | [`artifacts/qa-chapter-teaser-pv-4k-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-4k-contact-sheet.png) |
| 章节预告 PV「七界足迹」实机美术统一结果 | [`artifacts/qa-chapter-teaser-pv-game-art-4k-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-game-art-4k-contact-sheet.png) |
| 章节预告 PV「七界足迹」正式旁白重校与双标志片尾 | [`artifacts/qa-chapter-teaser-pv-retimed-1080p-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-retimed-1080p-contact-sheet.png) |
| 章节预告 PV「七界足迹」古典 / HOYO-MiX 配乐定版时轴 | [`artifacts/qa-chapter-teaser-pv-classical-hoyo-1080p-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-classical-hoyo-1080p-contact-sheet.png) |
| 章节预告 PV「七界足迹」片头共面、无辅助圆环、缝线退场与大字幕定版 | [`artifacts/qa-chapter-teaser-pv-final-polish-1080p-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-final-polish-1080p-contact-sheet.png) |
| 章节预告 PV「七界足迹」片头机构 Logo 去除外加装饰环（左为修改前、右为修改后） | [`artifacts/qa-chapter-teaser-pv-institution-logo-ring-comparison-1080p.png`](../../artifacts/qa-chapter-teaser-pv-institution-logo-ring-comparison-1080p.png) |
| 章节预告 PV「七界足迹」最终 4K ProRes 母版抽帧 | [`artifacts/qa-chapter-teaser-pv-master-4k-final-contact-sheet.png`](../../artifacts/qa-chapter-teaser-pv-master-4k-final-contact-sheet.png) |

较早截图只用于回归和问题溯源，不自动成为新设计的视觉真相。出现冲突时，以最新已确认实现、视觉设计语言和同状态实机/预览证据为准。

关卡卡片共享转场已在 390 × 844 视口完成双向验收：进入采用 300 ms 的统一等比低阻尼回弹，返回采用 240 ms 的合成器变换；真实卡片与过渡外壳交叠交接，棋盘内容保持等比，最终边界、29 px 圆角和静态可见性均准确，无裁切、闪烁或控制台异常。长期实现约束见 [`shared-transitions.md`](shared-transitions.md)。

液态滑块与开关惯性在 390 × 844 视口完成点击、连续拖动和释放验收：拖动保持柔性追随，直接点击采用独立的距离感知节奏；桌面跨两档点击为 740 ms，修改前同一操作在 220 ms 已越过目标停靠点，优化后仍保留可见滑行并最终准确停靠。触摸与手写笔使用更重的跟随和停靠节奏；点击轨道或目标档位只产生惯性位移，只有直接按住可移动玻璃体才出现挤压与折射。桌面本地预览与 Bilibili Toy 手机预览均于 2026-08-28 获得明确确认，自动检查、包结构校验和控制台检查均通过。

难度滑块的连续拖动在 390 × 844 H5 预览中完成回归：指针按住玻璃滑块时，位移逐帧直接跟随输入，只对液态形变保留缓动；释放后再恢复距离感知的吸附与单次回弹。这样避免移动 WebView 在每个指针帧中断并重启位移动画造成抖动，同时保持点击跳档和释放停靠的原有质感。

章节预告 PV「七界足迹」于 2026-08-30 在 `codex/chapter-teaser-pv` 独立 worktree 中完成首轮 4K 静态 QA。`dev` 基线没有章节预告 PV，结果证据以 3840 × 2160、60 fps 的确定性时间线生成；联系表覆盖序章、七组两阶段章节牌、七章真实棋路与拓扑曲面、七界回望、终章和片尾，共 32 个关键状态。可用 `npm run pv:keyframes` 在 `.tmp/chapter-teaser/keyframes-4k/` 重建相同视口的关键帧和联系表。

2026-08-31 按实机视觉统一要求，在完全相同的 3840 × 2160 视口、时间线和 32 个关键帧位置完成前后对比。旧证据保留为黑底几何语言基线；新证据改为与小游戏一致的暖纸背景、液态玻璃棋盘、纸纹与中性网格、黑白实体棋子、青/金边界轨道、呼吸落点、跨缝旅行点、金色五连，以及棋盘、胜线和棋子共同参与的二维转三维。`app/assets/topology-art.js` 中由小游戏与 PV 真正共同调用的是配色、纸纹、网格、棋子、边界轨道和通关曲面材质；实机的 DOM/CSS 背景、液态玻璃棋盘舞台与教学引导由 PV 以 Canvas 做等效复刻，实机不调用这些 PV Canvas 函数。方庭保持二维，其余六章连续弯曲为真实参数流形。

该联系表只验证构图、留白、章节色、两行标题变换、棋路到曲面的视觉递进、单行字幕安全区与片尾品牌层级；转场连续性、60 fps 运动、旁白可懂度、各章配乐辨识度和音画同步必须以完整 1080p60 审阅版复核。当前预览确认状态为“待用户审阅”，用户明确确认前不得把任务分支合回 `dev`，也不得提前生成作为发行交付的 4K 母版。

2026-08-31 使用余荫铠正式旁白把全片重校为 12897 帧 / 214.95 秒，并在 1920 × 1080 同一视口生成 34 个代表状态的新联系表。证据覆盖抽象有限网格与边界接续片头、`[1225,1466)` 无字幕物理所 Logo 留白、七种流形苏醒、七张章节牌、实机棋盘与五子连珠路径、二维转三维、七界回望、终局和双 Logo 片尾；字幕使用专用无衬线字族，片尾同时验证“拓扑五子棋”和“制作：余荫铠”。联系表通过静态构图与字体安全区检查；最终成片仍须逐段审听十一段精剪配乐的交接、旁白压混、落子/接缝/形变音效，以及 60 fps 转场连续性。用户明确确认前仍不合回 `dev`，也不生成发行 4K 母版。

同日按最终古典 / HOYO-MiX 配乐计划重新生成上述 34 帧联系表，确认音频清单重建没有改变画面时钟、字幕位置或品牌片尾。最终音乐轨在第 12474 帧前连续覆盖各章；将 Saint-Saëns 源窗口重定为 `146.762125–156.612125` 后，整轨实测为 -23.44 LUFS / 7.80 LU LRA / -7.15 dBTP，总混为 -18.84 LUFS / 4.10 LU LRA / -2.38 dBTP。该 9.85 秒窗口沿用旧 16.9 秒版的前段对轴，让全乐团终止式从第 12306 帧开始、在第 12474 帧收束，并完全排除源录音随后 `156.612125–163.662125` 的静谧独奏；最后 4 帧约 67 毫秒仅做防爆音微淡出。随后 `[12474,12897)` 的 7.05 秒双 Logo 片尾在纯配乐、音效、旁白、配乐+音效和总混五轨均为逐样本数字静音。该静态证据仍不替代完整审听，尤其需要用户确认回廊与归圆的两段 HOYO-MiX、双生的正形 / 逆形接管，以及全乐团终止后进入沉寂的节奏。

同日最终精修在相同 1920 × 1080、60 fps 时间线上增加 12 状态联系表：前四格覆盖片头折叠前、折叠中、接触前和完全闭合，确认棋盘纸面、经纬线、虚线路径与棋子共用 48 × 36 参数曲面，不再悬空；为保持教学辨识度，虚线路径与运动棋子不做前后面遮挡而全程显现。中四格覆盖圆柱和射影平面的 2D / 3D 五连过程，确认边界粘合位置不再绘制细线空心辅助圆；后三格验证完成三维与七流形回望隐藏青绿 / 橙色边界缝线并保留金色五连，末格验证双 Logo、联名乘号、游戏名和制作人层级。1080p 字幕为 72 px 无衬线体与 4.2 px 纯黑描边，最长 19 字字幕仍在单行安全区内。当前预览确认状态仍为“待用户审阅”，确认前不合回 `dev`，也不生成发行 4K 母版。

同日片头机构 Logo 在相同第 1330 帧、1920 × 1080 视口完成前后对比：保留中国科学院物理研究所 Logo 原图、尺寸、位置和淡入淡出，只移除其外侧由合成器额外绘制的低透明度青绿色圆环；片尾双 Logo 构图不受影响。

用户明确确认 1080p 审阅版后，同日生成最终 4K60 母版 `.tmp/chapter-teaser/master/seven-realms-master.mov`。成片为 15,036,824,170 字节，SHA-256 为 `41539cc3c67123e13d65f903f7de5abfc4d11989ac7ad73910bea94de84aac30`；完整解码验证得到 12897 帧、3840 × 2160、60 fps、ProRes 422 HQ、`yuv422p10le`、BT.709，以及 48 kHz 双声道 24-bit PCM，时长 214.95 秒。六格证据直接从编码后的 ProRes 母版抽取，覆盖片头边界粘合、无外加圆环的机构 Logo、双生与归圆曲面五连、终章和双 Logo 片尾；`[12474,12897)` 片尾音频另以 24-bit PCM 原始字节复核，共 2,030,400 字节全部为零。母版目录同时保留 `delivery-manifest.json` 与 `.sha256` 校验文件。4K 生成不代表自动合并，任务分支仍等待用户另行给出合回 `dev` 的明确指令。

## 新证据记录模板

```text
日期与任务：
分支 / worktree：
视口 / 设备 / 宿主：
基线证据：
结果证据：
交互状态：
自动验证：
发现与限制：
预览确认：
最终结果：passed / blocked
```
