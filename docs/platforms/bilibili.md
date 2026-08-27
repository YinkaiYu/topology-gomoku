# Bilibili Toy 原生适配与响应式审视

全平台游戏版本：1.37.1

审视日期：2026-08-28
平台范围：Bilibili Toy

## 设计原则

拓扑五子棋保留原有简约、典雅、克制的视觉语言和完整玩法。多设备适配不增加廉价的网页式面板，也不为宽屏机械铺满内容，而是保持棋盘作为视觉中心，通过留白、尺寸约束与输入增强让同一套构图在不同设备上自然成立。

- 手机保持竖向旅程与拇指可达的操作区。
- 平板适度扩大容器和棋盘，避免把平板当作放大的手机或缩小的 PC。
- PC 维持居中、克制的最大宽度，并提供 hover 与键盘操作。
- 短横屏把首页改为主视觉与旅程双区布局，棋局压缩非核心垂直间距。
- App 默认保留 Toy 详情页的 UP 主信息、评论等互动区域；用户可在设置中主动开启沉浸模式。

## 已发现并修复的问题

### 布局

- 原 `.app-shell` 使用 `height: 100%` 和 `min-height: 520px`，短横屏会发生视口外裁切。现改为 `100dvh`，并以 `visualViewport` 写入的实时高度作为增强值。
- 原有宽屏规则只有单一 `700px` 断点且固定为 `520px`。现区分手机、`700–1099px` 平板、`1100px+` PC 三档，最大宽度分别保持流式、`600px`、`640px`。
- 新增短横屏布局：首页主视觉与关卡旅程并排；棋局收紧顶栏、回合条和工具区，不改变棋盘与规则内容。
- 继续限制最大内容宽度，避免超宽屏把卡片、字体和棋盘拉散。

### 输入

- 原有 Pointer Events 已同时覆盖触摸、鼠标和笔，并保留 pointer capture。
- hover 现在只在 `(hover: hover) and (pointer: fine)` 环境启用，触摸端不依赖悬浮态。
- 棋盘加入键盘焦点：方向键移动落点，空格或回车落子，Esc 返回旅程。键盘与指针共用同一 `performMove` 游戏逻辑，没有另写一套规则。
- 原有按钮触摸尺寸保持不变；短横屏工具按钮仍不小于 40px，并保留完整的可见文字和图标。

### 动态视口、安全区与 App WebView

- 页面保留 `viewport-fit=cover`，补齐 top/right/bottom/left 四向安全区。
- 新增 `bilibili-adapter.js` 作为唯一平台边界，游戏规则代码不直接判断宿主。
- adapter 使用 Toy SDK `onContainerChange` 接收设备、方向、视口、沉浸状态与安全区，并在变化后触发画布重排。
- adapter 不接管屏幕方向，只在用户操作设置开关时调用 `setContainerMode({ immersive })`。沉浸模式默认关闭，实际状态仍以 `onContainerChange` 回调为准。
- 非沉浸状态继承共享基线的宿主顶栏避让；进入沉浸状态后，Toy 宿主状态会把顶部间距收敛为安全区加小幅留白。左右安全区与宿主报告的动态视口高度始终保留。
- Web 或不支持 SDK 的环境自动回退到浏览器视口、CSS media query 和标准 `env(safe-area-inset-*)`。

## 验证结果

- `npm test`：88/88 通过，其中包含 Toy adapter、沉浸模式、动态视口、复盘和三字重内嵌字体覆盖。
- `npm run validate`：通过，25 个包内文件，约 1.89 MB 未压缩。
- `npm run docs:check`：通过，19 份 Markdown 文档全部进入导航且相对链接有效。
- `npm run build:bilibili`：通过，ZIP 根目录包含 `index.html`，资源路径和官方 SDK 白名单有效；压缩包约 1.27 MB。
- `git diff --check`：通过，仅有 Git 对 PowerShell 文件行尾转换的提示。
- Toy SDK 外部资源白名单只允许官方 `//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js`。
- 自动化测试覆盖三档断点、`100dvh`、四向安全区、短横屏、hover/pointer、键盘和容器变化重排。

## 仍需在发布预览中确认

本机 in-app browser 的本地 URL 安全策略阻止了本次 Bilibili 适配构建的最终截图采集，因此没有把错误工作目录中的基础版截图作为证据。提交审核前必须在 Toy CLI 生成的预览链接中检查：

1. B站 App 手机竖屏与横屏。
2. iPad 或安卓平板横竖屏。
3. PC 浏览器键盘落子、hover 与焦点环。
4. App 沉浸切换后的顶部/底部/左右安全区。
5. 设置弹层、通关曲面拖动、返回旅程和刷新后进度。

## 参考资料

- Bilibili Toy 发布指南：<https://www.bilibili.com/toy/publish/guide>
- Bilibili Toy SDK：<https://www.bilibili.com/toy/publish/sdk>
- Bilibili Toy 响应式演示：<https://www.bilibili.com/toy/toy-responsive-demo/index.html>
- 仓库保存的响应式指南：[`bilibili-responsive-guide.md`](bilibili-responsive-guide.md)
- 官方示例实际引用的响应式指南：<https://s1.hdslb.com/bfs/static/toy/app/toy-responsive-demo/v2/toy-responsive-guide.md>
