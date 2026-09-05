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
- 涉及微信宿主顶栏时，证据包含完整胶囊与首个内容层，并记录实际 `menu.bottom`、基础 `topInset` 和视觉缓冲；裁掉宿主栏的 Canvas 截图不能作为胶囊避让证据。

### 证据质量

- 前后证据使用相同视口、内容和交互状态。
- 证据路径相对于仓库，文件真实存在且可由评审者打开。
- 不记录本机绝对路径、临时剪贴板路径或聊天附件路径。

## 连续交互的回归矩阵

涉及可拖动进度、自动动画或跨模式交接时，在普通静止态之外按风险覆盖以下组合。复验应标记提交、视口、内容和输入类型，不把鼠标模拟或自动测试等同于手机实测。

| 维度 | 关键样本 | 观察或断言 |
| --- | --- | --- |
| 进度与姿态 | 两端、中点两侧、中途反向、非零旋转和弹性 | 画面与控件同源；交接首帧投影连续，不只检查进度变量 |
| 进入与退出 | 首次教学、普通进入、自动演示、取消和离开 | 首次可见状态正确；邻近操作区位置稳定；无旧回调残留 |
| 结果与回合 | 玩家胜利、AI 胜利、平局、AI 等待时切换 | 视角不改棋局；异步回合延后且只恢复一次 |
| 输入顺序 | 锁定时按下、解锁后松手；拖出范围、重新抓取 | 无意外落子；捕获、忙碌状态与形变正确释放 |
| 材质 | 静止、直接按住玻璃体、点击轨道、拖动、释放、禁用 | 按压与滑行有区别；折射层对齐且无双轨；最终准确停靠 |
| 布局与可达性 | 常规、窄屏、紧凑高度；键盘；减少动态效果 | 跨行列中心与间距一致；无溢出；命中区和焦点可用 |

截图用于比较层级和几何，短录制或逐帧采样用于观察交接、按压和拖动。短暂布局跳动应记录相邻帧的边界与可见性；不要只拍正常对局的最后一帧。更新实现后说明哪些旧证据被替代，保留历史图片不代表仍认可其中的设计。

验收记录应分开写自动通过、浏览器人工通过、用户预览确认和未覆盖设备。复现不了的问题先保留条件与不确定性，不用“看起来正常”关闭。如何将这些证据组织成 PR 反馈见 [`pr-review.md`](../development/pr-review.md)。

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
| 微信原生首页、宿主胶囊与图鉴间距 | [`H5 / WeChatIDE 同视口对照`](../../artifacts/ui-parity/comparison-h5-wechatide-home-capsule-annotation-fixed-780x843-final.png) |
| 微信原生对局与宿主胶囊 | [`H5 / WeChatIDE 同视口对照`](../../artifacts/ui-parity/comparison-h5-wechatide-game-playing-capsule-780x843-final.png) |
| 微信原生设置液态玻璃 | [`H5 / WeChatIDE 同视口对照`](../../artifacts/ui-parity/comparison-h5-wechatide-settings-capsule-780x843-final.png) |
| 微信原生边界辅助线 | [`圆柱边界演示`](../../artifacts/ui-parity/wechatide-boundary-helper-capsule-390x844-final.jpg) |
| 终局二维/三维视角与 3 × 2 操作区 | [`二维终局`](../../artifacts/qa-board-view-endgame-2d-2216x1242.png)、[`三维终局`](../../artifacts/qa-board-view-endgame-3d-2216x1242.png)、[`边界合拢`](../../artifacts/qa-board-view-endgame-transition-2216x1242.png) |
| 对局视角修复交互录制 | [`教程进场`](../../artifacts/qa-board-view-tutorial-entry.mp4)、[`视角转换锁定落子`](../../artifacts/qa-board-view-view-interaction-guard.mp4)、[`玩家胜利`](../../artifacts/qa-board-view-player-win.mp4)、[`AI 胜利`](../../artifacts/qa-board-view-ai-win.mp4) |

较早截图只用于回归和问题溯源，不自动成为新设计的视觉真相。出现冲突时，以最新已确认实现、视觉设计语言和同状态实机/预览证据为准。

关卡卡片共享转场已在 390 × 844 视口完成双向验收：进入采用 300 ms 的统一等比低阻尼回弹，返回采用 240 ms 的合成器变换；真实卡片与过渡外壳交叠交接，棋盘内容保持等比，最终边界、29 px 圆角和静态可见性均准确，无裁切、闪烁或控制台异常。长期实现约束见 [`shared-transitions.md`](shared-transitions.md)。

液态滑块与开关惯性在 390 × 844 视口完成点击、连续拖动和释放验收：拖动保持柔性追随，直接点击采用独立的距离感知节奏；桌面跨两档点击为 740 ms，修改前同一操作在 220 ms 已越过目标停靠点，优化后仍保留可见滑行并最终准确停靠。触摸与手写笔使用更重的跟随和停靠节奏；点击轨道或目标档位只产生惯性位移，只有直接按住可移动玻璃体才出现挤压与折射。桌面本地预览与 Bilibili Toy 手机预览均于 2026-08-28 获得明确确认，自动检查、包结构校验和控制台检查均通过。

难度滑块的连续拖动在 390 × 844 H5 预览中完成回归：指针按住玻璃滑块时，位移逐帧直接跟随输入，只对液态形变保留缓动；释放后再恢复距离感知的吸附与单次回弹。这样避免移动 WebView 在每个指针帧中断并重启位移动画造成抖动，同时保持点击跳档和释放停靠的原有质感。

微信小游戏原生适配于 2026-08-28 使用 WeChatIDE skill 0.3.10、iPhone 12/13 模拟档、390 × 844 逻辑视口和 3× 画布完成复核。运行时 `safeArea` 为 `top=47`、`bottom=810`；该模拟器会话返回的胶囊矩形为非有限值，因此 adapter 使用 `topInset=99.384`、`bottomInset=46` 的保守回退。完整宿主截图中胶囊可见底边约为 76 个逻辑像素，内容起点仍保留约 23 个逻辑像素分隔。图鉴在宿主安全区压缩后保持原版图案尺度，并为图案/剪影、类型注释和关卡名划分独立空间；“瓶界”“双生”等高轮廓图案及其地影均不再压住注释。可见模拟器同时验证了等比关卡转场、禁用悔棋静默忽略、圆柱边界辅助线和设置面板；此结论只代表官方模拟器，不替代 iOS/Android 真机胶囊检查。

对局二维/三维视角切换从第二关起可用，终局继续保留。视角独立于棋谱和当前回合；滑行或按住滑块时暂停落子与 AI，稳定后恢复；三维短点击按按下瞬间的资格落子，超过 7 px 的拖动只旋转棋盘。教学和自动演示隐藏控制内容但保留占位。终局工具仍为复盘、前后步、再来、下一关和旅程组成的 3 × 2 布局。自动终局期间锁定输入；完成后可继续拖动滑块，收回二维时同步清除终局曲面。

### 2026-09-05：PR #7 后续修复（用户已确认）

- 分支：`codex/board-view-polish`，从最新 `dev` 建立，接入 PR #7 的贡献提交后修复；用户于 2026-09-05 确认本地预览并明确批准合入 `dev`，不涉及 `main` 或平台发行分支。
- 390 × 844 同状态基线：[PR #7 的空圆柱棋盘](../../artifacts/qa-board-view-polish-before-flat-390x844.png)；结果：[重做后的同一棋盘](../../artifacts/qa-board-view-polish-after-flat-390x844.png)。两端直接复用 `dev` 的井字格和圆柱路径，沿用下排工具按钮的上图下字结构，无玻璃底板、边框或选中底色。中央只有 4 px 细轨道与独立玻璃滑块，实际触摸区域高 44 px。
- [引导占位](../../artifacts/qa-board-view-polish-intro-reserved-390x844.png)：该视口下进入引导前后下排操作区顶部均为 692.4 px，未发生布局跳动。[初版中间视角](../../artifacts/qa-board-view-polish-half-390x844.png)仅保留为拖动功能回溯，该图早于两端图标及折射强度的后续调整，不作为最终材质基线。
- 位移和棋盘共用逐帧进度；鼠标全程点击滑行为 740 ms、触摸为 940 ms，遵循设置控件的距离感知节奏与同一曲线。只有直接按住玻璃体时鼓起、增强轨道折射，点击轨道不伪造挤压；可中途重新抓住滑块。按压折射层纵向压缩至 0.34 倍，抵消玻璃鼓起后轨道仍约为原宽的一半；真实轨道仅在玻璃核心下方局部遮掉，避免未折射层叠加，并保持两端位置正确。取消手势、丢失捕获、离开窗口、隐藏页面和切换关卡均解除忙碌状态。键盘方向键、Home / End 与原生读屏增减保留；减少动态效果模式下直接到达准确端点。
- 终局上排顺序调整为“上一步 — 复盘／定局 — 下一步”，直接调整 DOM，使键盘焦点与视觉顺序保持一致。
- 球面终局将共形调整从恒等映射连续过渡至选定映射，并继承当前旋转和弹性。自动回归执行实际绘图入口：六种曲面、五档展开程度、非零旋转与弹性下，终局第一帧所有 49 个交点投影误差小于 `1e-9`；球面非零映射逐毫秒检查连续性、单位球约束和接缝重合，另验证终局自动进度与滑块同步以及终局回到二维。
- 验证与限制：`npm run check` 通过（103 项测试、25 个离线包文件、20 份 Markdown），`git diff --check` 通过。自动测试包含鼠标、触摸/手写笔分支、键盘、取消路径和减少动态效果；浏览器预览用于实际点击、拖动与布局检查，不能替代手机宿主真机验收。最终效果（含下述三排对齐）已获用户预览确认。

同日补充三排对齐：在相同的球面五子通关、二维静止状态与 390 × 844 视口下保存[调整前](../../artifacts/qa-view-columns-before-390x844.png)、[调整后](../../artifacts/qa-view-columns-after-390x844.png)。三排共用等宽三列、8 px 列间距、52 px 行高及 10 px 行间距；左列为“二维／上一步／旅程”，右列为“三维／下一步／下一关”，左右中心线分别约为 73.06 px 和 317.33 px，两段纵向中心间距均为 62 px。上述早期截图的布局仅供回溯，以本次对齐结果为准。

[360 × 770 窄屏复验](../../artifacts/qa-view-columns-after-360x770.png)左右中心线分别为 68 px 和 292 px，纵向中心间距同为 62 px，无横向溢出。另在 360 × 740 紧凑断点实测：三排行高均为 44 px，纵向中心间距同为 54 px，滑轨仍保留 44 px 高的交互区域。列中心的子像素舍入差异均小于 0.01 px。此轮只调整布局，不改变图标、材质、棋谱或按钮行为。

## 新证据记录模板

### 2026-09-05 连续视角适配候选（本地预览确认）

- 共享候选：`codex/shared-continuous-view`；微信候选：`codex/release-wechat-1.39.0`。前者尚待合入 `dev`，后者尚未接收本轮稳定 `main`，不能视为正式 1.39.0 微信包。
- 自动验证：共享检查 119 项测试通过，包结构与文档通过；微信运行时、终局与连续视角 37 项定向测试通过；使用共享候选覆盖参数的构建与预览目录同步通过。
- 浏览器 Canvas 校准中可操作圆柱视角，但它不包含微信宿主，不构成平台验收证据。
- 官方工具返回的刷新、点击成功与可见画面不一致，归类为 `automation-mismatch`。重新绑定并刷新一次未恢复；用户手动重开后可以看到首页，但自动化仍未取得游戏对象，点击也未产生预期画面。相关诊断截图不列入长期通过证据。
- 按 WeChatIDE 技能及仓库工作流停止盲目刷新后，由用户操作最新本地包并确认“OK了”。随后[官方截图](../../artifacts/ui-parity/wechat-continuous-view-user-confirmed-20260905.png)显示球面终局、连续视角滑块及三行对齐按钮，证明已加载新版界面。截图保留完整宿主胶囊，图像尺寸为 607 × 809；自动化未能读取可靠的逻辑视口与胶囊几何，因此不额外声称安全区量化验证通过。
- 当前结果：用户本地预览确认通过；自动化交互连接异常仍记录为工具限制，不写成已恢复。此截图不是同状态前后对照；材质按下态、完整交互自动化和真机验收仍未完成。
- 未上传微信版本，未进行手机预览。正式发行整合后仍须从稳定来源重新构建同步。

```text
日期与任务：
分支 / worktree：
视口 / 设备 / 宿主：
基线证据：
结果证据：
交互状态：
宿主几何（如适用）：menu.bottom / topInset / visual buffer
自动验证：
发现与限制：
预览确认：
最终结果：passed / blocked
```
