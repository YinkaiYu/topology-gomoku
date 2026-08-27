# 视觉设计与 QA

本文记录拓扑五子棋长期有效的视觉原则、验收方式和可复现证据。版本化实现细节应留在提交与 Pull Request 中，不再把本机临时路径或逐次调参历史堆进长期文档。

## 设计基线

整体气质是**简约、典雅、克制**。

- 以留白、比例、字体、清晰层级和少量语义色建立秩序。
- 避免装饰堆叠、无意义渐变、过多强调色、厚重阴影和与既有界面无关的新风格。
- 同类控件复用颜色、圆角、描边、阴影、间距、字体层级和动效节奏。
- 每个视觉效果都要服务于状态、层级或交互反馈；不能解释其作用时，优先删除。

## 液态玻璃语言

液态玻璃是卡片、按钮、滑块、开关、状态胶囊和浮层共享的材质系统，而不是单个组件的特效。

- 静止态：底色通透，保留背景信息，以轻微边缘光和克制阴影区分层级。
- 按下态：控件向外鼓起，折射增强但文字仍可辨；不通过整体缩小模拟按压。
- 拖动态：形变、位移和折射连续，轨道与内容层关系稳定，不出现跳帧、重影或硬切。
- 释放态：回到准确停靠点，允许短促且受控的回弹；不能残留高光、错位或重复图像。
- 禁止样式：大面积乳白磨砂、硬色带、过强彩边、镜面高亮、塑料质感和孤立的拟物组件。

## 字体与文案

- 应用中文统一使用内嵌 `Topo Serif`，不得把系统字体回退当作正常结果。
- HTML、JavaScript、Canvas、JSON 与 CSS `content` 中的用户可见文本都属于字体覆盖范围。
- 修改文案后运行 `npm test`。缺字时运行 `npm run fonts:subset`，再更新字体、样式表缓存键和包版本。
- 字体二进制由仓库 `uv` 环境确定性生成；Python 版本和依赖以 `.python-version`、`pyproject.toml`、`uv.lock` 为准。

## 视觉验收流程

1. 在独立任务 worktree 中确定基线视口、内容和交互状态。
2. 修改前后使用同一视口、同一数据和同一状态截图；移动端 H5 默认至少覆盖 390 × 844，涉及宿主顶栏或紧凑布局时补 360 × 770。
3. 检查字体、层级、间距、对齐、颜色、材质、动效首尾、裁切、滚动与安全区。
4. 把最终有效证据存入 `artifacts/`，文件名包含功能、状态和版本或任务标识。
5. 在任务 worktree 提供本地预览，等待用户或评审者明确确认；确认前不合并。

截图不能代替交互检查。拖动、弹性、跨状态切换、键盘/触摸反馈和宿主安全区必须在可操作预览中验证。

## 当前有效回归证据

以下仓库相对路径可作为现有视觉语言的回归参考：

| 范围 | 证据 |
| --- | --- |
| 内嵌字体与终章标题 | `artifacts/qa-font-gui-v1351.png` |
| 拓扑图鉴线条与字形层级 | `artifacts/qa-topology-glyph-lines-v1352.png` |
| 液态玻璃总体对比 | `artifacts/qa-liquid-glass-full-comparison.jpg` |
| 液态玻璃与 iOS 参考的同状态对比 | `artifacts/qa-liquid-ios-comparison-v134-final.jpg` |
| 难度滑块按下态 | `artifacts/qa-liquid-slider-pressed-v134-final.png` |
| 开关越界拖动态 | `artifacts/qa-liquid-switch-overdrag-v134-final.png` |
| 液态控件停靠点 | `artifacts/qa-liquid-detents-v1360.png` |
| 棋子按下与释放 | `artifacts/qa-stone-pressed-v134-final.png`、`artifacts/qa-stone-released-v134-final.png` |
| Android/HarmonyOS 顶部避让 | `artifacts/qa-host-top-inset-android-360x770-v1361.png` |
| iOS 安全区护栏 | `artifacts/qa-host-top-inset-ios-game-v1361.png` |

较早截图只用于回归和问题溯源，不自动成为新设计的视觉真相。出现冲突时，以最新已确认实现、本文设计原则和同状态实机/预览证据为准。

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
