# 视觉 QA

## 2026-11-10：Arena 三维透视与旋转（已确认）

- 基线 `97b6a00`，共享绘制来自独立 `dev` 任务，包含透视、半透明正反面层次、同几何轮廓与棋子局部遮挡。Arena 在开始切换时调用共享等价角度处理，半展开拖动不改写角度分支。此前复制反馈修复一并保留，服务协议、比赛数据及棋手提示未变。
- [复现脚本](../../scripts/qa-arena-perspective.cjs)使用隔离服务与固定八手暂停棋谱。六曲面 × 1280×720 / 1024×768，共 12 组；二维前后及展开再收回的像素哈希完全一致。真实指针转过 360°、720° 后，四个展开进度与等价朝向的投影偏差小于 0.001px；旧版复现约 400px 的多余转动。半展开跨 ±π 拖动和按钮动画中途反向均连续。
- 实际 Canvas 圆弧记录检查 50% 与 100% 进度下的棋子完整轮廓；全部位于画布内，最小留白为 30.55px。目视复查环游、扭带和双生：曲面与网格贴合，棋子随曲面自然局部遮挡，无内部细缝、异常缺口或画布截断，孔洞与背面、自交结构仍可辨。
- 同状态证据：[环游修改前](../../artifacts/arena-perspective/before-torus-100-1280x720.png) / [修改后](../../artifacts/arena-perspective/after-torus-100-1280x720.png)，[扭带修改前](../../artifacts/arena-perspective/before-mobius-100-1280x720.png) / [修改后](../../artifacts/arena-perspective/after-mobius-100-1280x720.png)，[双生修改前](../../artifacts/arena-perspective/before-projective-100-1024x768.png) / [修改后](../../artifacts/arena-perspective/after-projective-100-1024x768.png)。[完整结果](../../artifacts/arena-perspective/results.json)记录检查值与全部截图，无页面错误。
- 303 项测试、资源及文档校验通过；2026-11-10 用户确认预览并授权合回、推送 `arena`，一并发布此前已合入的 DeepSeek Harness 内嵌面板与插件；共享基线同步至 `dev@a18ed73`。本任务预览独立运行，页面刷新即可接收前端更新，无需配置 MCP。

## 2026-11-10：Arena 复制反馈的模态层级

- 基线 `3221f53`。设置及邀请面板通过 `showModal()` 进入浏览器顶层，原页面中的 toast 会被面板和 backdrop 覆盖，普通 `z-index` 无法跨越这一层级。
- 反馈显示前将同一个 toast 节点移入当前焦点所在的已打开 dialog；无面板时放回 body。保留既有位置、尺寸、材质、文案与 3.2 秒消失时间，反馈也留在当前模态的可访问子树中。
- [复现脚本](../../scripts/qa-arena-toast-layer.cjs)启动独立服务和临时棋局，在 1280×720、1024×768 下以相同内容和状态对比。`elementFromPoint` 确认旧提示被遮挡、修复后提示位于最前，边界矩形保持一致；点击/键盘重复复制、拒绝剪贴板后的选中文本与提示、自动消失、设置中的导出反馈及回到页面后的删除反馈均通过，无页面异常。
- [检查结果](../../artifacts/arena-toast-layer/results.json)、[修复前](../../artifacts/arena-toast-layer/before-1280x720.png)、[修复后](../../artifacts/arena-toast-layer/after-1280x720.png)。截图邀请词是固定示例，不含实际比赛凭证。260 项测试通过；未修改服务、MCP、棋局规则或棋手提示。

## 2026-11-05 追加棋手头像与精简接口的观战回归

任务分支 `codex/arena-lean-protocol` 从 `arena@bd7b447` 开始。棋手资料新增 Doubao、Hy、MiniMax，继续使用既有四列头像网格与液态玻璃面板；新增图标沿用 Lobe Icons 的同一固定提交与 MIT 许可，来源见 `arena/public/avatars/source.json`。Hy 对应腾讯混元（Tencent HY），显示名称使用用户指定的 Hy。

提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-arena-lean-avatars.cjs` 可复现。脚本读取 `bd7b447` 前端作为历史基线，在隔离服务中使用相同默认资料、同一视口和同一黑方资料弹窗状态比较；不会读取真实棋局。

| 视口 | 头像选择前 / 后 | 观战回归 |
| --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-lean-avatars/picker-before-1280x720.png) / [现在](../../artifacts/arena-lean-avatars/picker-1280x720.png) | [棋局](../../artifacts/arena-lean-avatars/match-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-lean-avatars/picker-before-1920x1080.png) / [现在](../../artifacts/arena-lean-avatars/picker-1920x1080.png) | [棋局](../../artifacts/arena-lean-avatars/match-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-lean-avatars/picker-before-1024x768.png) / [现在](../../artifacts/arena-lean-avatars/picker-1024x768.png) | [棋局](../../artifacts/arena-lean-avatars/match-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-lean-avatars/picker-before-1440x1080.png) / [现在](../../artifacts/arena-lean-avatars/picker-1440x1080.png) | [棋局](../../artifacts/arena-lean-avatars/match-1440x1080.png) |

四视口均验证 11 个头像选项完整显示、资源成功加载、面板不溢出、选择新头像自动填入对应名称、刷新后资料保留、创建棋局与赛中改名换头像保存成功。上传示例图片后保留用户填写的名称；正常入席、就绪、落子与随想仍同步到观战页面，气泡旁显示新头像。截图中的随想明确标注为界面验收示例。[结构化结果](../../artifacts/arena-lean-avatars/results.json)记录各项结果，页面无运行错误。

2026-11-06 用户确认预览并授权合并推送；本轮与归圆边线修复一起整合进 `arena`，整合后 250 项测试、资源与文档检查通过，归圆浏览器对照及滑块交互复验通过。原有半格网格延伸和棋手提示完整保留。

## 2026-11-05 参赛模式与限时准备

任务分支 `codex/arena-play-policy` 从 `arena@60f8de0` 开始。首页复用液态换挡控件选择“仅允许推理”或“允许自制工具/引擎”，分别标明准备 1 分钟与 5 分钟。准备倒计时放在棋盘下方原有状态行，按服务端余时和浏览器单调时钟更新；棋盘、状态行与两条滑块的位置保持稳定。低于 800 px 的窗口收紧配置区间距，保留 AI 难度选择和完整创建按钮。

提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-arena-play-policy.cjs` 可复现。脚本启动隔离服务，用 Git 只读加载 `60f8de0` 的前端作为基线；前后首页使用同一默认资料、视口与控件状态，准备画面使用同一合成空棋盘和已入席的双方。证据不含真实对局、凭证或模型发言。

| 视口 | 首页前 / 后 | 准备阶段前 / 后 | AI 配置 |
| --- | --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-play-policy/home-before-1280x720.png) / [现在](../../artifacts/arena-play-policy/home-1280x720.png) | [之前](../../artifacts/arena-play-policy/preparation-before-1280x720.png) / [现在](../../artifacts/arena-play-policy/preparation-1280x720.png) | [AI](../../artifacts/arena-play-policy/ai-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-play-policy/home-before-1920x1080.png) / [现在](../../artifacts/arena-play-policy/home-1920x1080.png) | [之前](../../artifacts/arena-play-policy/preparation-before-1920x1080.png) / [现在](../../artifacts/arena-play-policy/preparation-1920x1080.png) | [AI](../../artifacts/arena-play-policy/ai-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-play-policy/home-before-1024x768.png) / [现在](../../artifacts/arena-play-policy/home-1024x768.png) | [之前](../../artifacts/arena-play-policy/preparation-before-1024x768.png) / [现在](../../artifacts/arena-play-policy/preparation-1024x768.png) | [AI](../../artifacts/arena-play-policy/ai-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-play-policy/home-before-1440x1080.png) / [现在](../../artifacts/arena-play-policy/home-1440x1080.png) | [之前](../../artifacts/arena-play-policy/preparation-before-1440x1080.png) / [现在](../../artifacts/arena-play-policy/preparation-1440x1080.png) | [AI](../../artifacts/arena-play-policy/ai-1440x1080.png) |

四视口覆盖两种参赛模式与双 Agent / 内置 AI 的交叉创建、入席规则、单方入席保持等待、双方入席后启动准备倒计时、提前就绪开赛和到时自动开赛。测试推进隔离服务时钟，确认倒计时使用服务端快照且棋钟从准备截止时刻开始扣时；不限时棋局同样执行准备时限。每个组合完成黑方首着，另测键盘换挡、无焦点外框、无默认悬停提示、长模式名称完整显示、切档面板尺寸稳定和页面无运行错误。

违规判负入口收在设置里，按方选择后显示[确认弹窗](../../artifacts/arena-play-policy/adjudication-confirm.png)。浏览器实测取消保持棋局阶段及事件序号，确认后相应棋手判负，另一方获胜，终局收起入口，并在[记录列表](../../artifacts/arena-play-policy/adjudication-record.png)呈现结果。覆盖黑方比赛中和白方准备中两种情况。[结构化结果](../../artifacts/arena-play-policy/results.json)记录每个视口的通过项。该入口由房主人工裁定，浏览器验证不代表对客户端本地工具行为的自动检测。

## 2026-11-05 邀请面板与状态文字间距

`node scripts/qa-arena-dialog-copy.cjs` 以 `a85716a` 为基线，在同一 1280×720 棋局与邀请弹窗比较删除注释后的布局。截图中的邀请统一替换为固定示例参数，真实复制校验在内存完成。测试覆盖邀请全选、键盘复制、复制按钮、键盘导航、名字和棋盘尺寸编辑、结束棋局及删除确认。邀请框与复制按钮在基线和当前版本均得到 `outline: none`，指针和键盘聚焦的边框、阴影测量一致。当前版本另测聊天区、文字棋盘展开按钮和输入框的焦点样式。

真实溢出的邀请文本已验证可滚动，当前样式为细滚动条与透明轨道。Headless Chromium 的覆盖式滚动条会自动淡出，结果同时记录 `scrollbar-width`、`scrollbar-color` 与滚动位置。[邀请面板之前](../../artifacts/arena-clock-options/invitation-before.png)、[邀请面板现在](../../artifacts/arena-clock-options/invitation-after.png)及[结构化结果](../../artifacts/arena-clock-options/dialog-copy-results.json)可复核。

棋盘底部状态、记录标题与结果、时间线元信息使用分段文字和间距。专项检查各组可见文字的分隔符、计算样式间距及实际元素间隙，并确认结束棋局后棋盘位置稳定。[底部状态](../../artifacts/arena-clock-options/status-spacing.png)、[记录](../../artifacts/arena-clock-options/records-spacing.png)和[时间线](../../artifacts/arena-clock-options/timeline-spacing.png)保留本轮结果。`qa-arena-flow.cjs` 的四视口回归通过，其他既有 QA 的当前页面文案断言已同步更新，历史基线断言保留原文。

## 2026-11-05 焦点提示清理

按用户要求统一取消控件的额外焦点外框，选择结果继续由选中状态表达。`node scripts/qa-arena-liquid-controls.cjs` 增加以 `60bc785` 为基线的聚焦回归，通过真实 Tab 和方向键进入控件后再点击、拖动和取消指针操作。基线中的棋钟选择器、视角滑块和复盘滑块均复现鼠标操作后遗留外框，当前版本均通过外框消失断言，同时验证实际焦点、原地方向键换档、Tab 重入和棋盘尺寸编辑。

同一 1280×720 首页、相同 30 分钟档及“键盘后鼠标”操作的[修改前](../../artifacts/arena-clock-options/focus-pointer-before.png)与[修改后](../../artifacts/arena-clock-options/focus-pointer-after.png)，以及[结构化结果](../../artifacts/arena-clock-options/focus-results.json)，由隔离服务重现。原有液态控件点击滑行、拖动回弹、取消、切页和长面板滚动回归一并通过。

## 2026-11-05 棋钟选择、记录结果与面板材质

任务分支 `codex/arena-clock-options` 从 `arena@18caf06` 开始。首页直接选择 5 分钟加 5 秒、15 分钟加 15 秒、30 分钟加 30 秒或不限时，四档切换保持卡片布局固定。对弈方式、棋钟和 AI 难度复用可拖动的液态选择器，视角与复盘使用同源玻璃滑块。棋盘尺寸保留直接编辑和键盘操作，使用自有错误提示。棋局记录显示胜方、和棋或房主结束，页面通过可见标签和无障碍名称表达控件含义。

首页与设置面板参照 `main@3977ba0` 的 `app/assets/style.css` 中 `.settings-sheet` 双层玻璃和 `.scrim` 参数，复用轮廓、边缘光与透明度。脚本通过 Git 只读加载 main 资源，在 1280×720 捕获[原游戏设置参考](../../artifacts/arena-clock-options/main-settings-reference-1280x720.png)。Arena 前后对比使用相同视口、默认资料、同一准备局以及同四盘合成终局，基线前端由隔离服务拦截加载。

| 视口 | 首页前 / 后 | 对局设置前 / 后 | 棋局记录前 / 后 |
| --- | --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-clock-options/home-before-1280x720.png) / [现在](../../artifacts/arena-clock-options/home-1280x720.png) | [之前](../../artifacts/arena-clock-options/settings-before-1280x720.png) / [现在](../../artifacts/arena-clock-options/settings-1280x720.png) | [之前](../../artifacts/arena-clock-options/records-before-1280x720.png) / [现在](../../artifacts/arena-clock-options/records-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-clock-options/home-before-1920x1080.png) / [现在](../../artifacts/arena-clock-options/home-1920x1080.png) | [之前](../../artifacts/arena-clock-options/settings-before-1920x1080.png) / [现在](../../artifacts/arena-clock-options/settings-1920x1080.png) | [之前](../../artifacts/arena-clock-options/records-before-1920x1080.png) / [现在](../../artifacts/arena-clock-options/records-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-clock-options/home-before-1024x768.png) / [现在](../../artifacts/arena-clock-options/home-1024x768.png) | [之前](../../artifacts/arena-clock-options/settings-before-1024x768.png) / [现在](../../artifacts/arena-clock-options/settings-1024x768.png) | [之前](../../artifacts/arena-clock-options/records-before-1024x768.png) / [现在](../../artifacts/arena-clock-options/records-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-clock-options/home-before-1440x1080.png) / [现在](../../artifacts/arena-clock-options/home-1440x1080.png) | [之前](../../artifacts/arena-clock-options/settings-before-1440x1080.png) / [现在](../../artifacts/arena-clock-options/settings-1440x1080.png) | [之前](../../artifacts/arena-clock-options/records-before-1440x1080.png) / [现在](../../artifacts/arena-clock-options/records-1440x1080.png) |

提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-arena-clock-options.cjs` 可复现。四视口均通过四档创建、入席计时规则、准备阶段停钟、无效尺寸拦截、键盘切换、棋局结果和页面错误检查。几何断言覆盖首页左右边线、四档等宽、切档卡片位置固定、设置列中心、底部状态与两条滑块等距、轨道端点及图标中心对齐。四枚底部图标路径与 main 参考逐一核对。[结构化结果](../../artifacts/arena-clock-options/results.json)记录实际通过项。[1280×720 AI 模式](../../artifacts/arena-clock-options/ai-1280x720.png)和[1024×768 AI 模式](../../artifacts/arena-clock-options/ai-1024x768.png)覆盖展开难度选择的状态。

坐标轴使用 Canvas 实际绘制位置与字形边界测量，四视口覆盖平面、莫比乌斯和环面。开放边的坐标更靠近棋盘，连接边为辅助线保留间距，边缘棋子与坐标文字之间有留白。[平面前](../../artifacts/arena-clock-options/axis-plane-before.png) / [后](../../artifacts/arena-clock-options/axis-plane.png)、[莫比乌斯前](../../artifacts/arena-clock-options/axis-mobius-before.png) / [后](../../artifacts/arena-clock-options/axis-mobius.png)、[环面前](../../artifacts/arena-clock-options/axis-torus-before.png) / [后](../../artifacts/arena-clock-options/axis-torus.png)均为同一 1280×720 视口和 A1/G1 边缘落子。

`node scripts/qa-arena-liquid-controls.cjs` 验证普通动效下的点击滑行、快速切换目标、键盘换档、拖拽吸附、禁用状态、离散复盘取消后的对齐、滑行中回首页和切局的收束，以及减少动态效果。[按压拖动中的玻璃滑块](../../artifacts/arena-clock-options/liquid-thumb-dragging.png)对应实际按压缩放大于 1、释放后恢复 1 的断言。[控件结果](../../artifacts/arena-clock-options/liquid-controls-results.json)和[长时间线滚动后的玻璃面板](../../artifacts/arena-clock-options/timeline-scrolled-glass.png)保留实际验收记录。

设置 `ARENA_QA_BASE=18caf06`、`ARENA_QA_EVIDENCE=.tmp/clock-options-regression` 运行 `npm run arena:qa`，以及设置 `ARENA_FLOW_BASE=18caf06`、`ARENA_FLOW_EVIDENCE=.tmp/clock-options-flow` 运行 `node scripts/qa-arena-flow.cjs`，四视口完整流程与观战回归通过。此轮证据来自桌面 Chromium，用户预览确认待完成。

`node scripts/qa-arena-chat-motion.cjs` 在 1280×720 对实际消息流逐帧取样，验证旧气泡平移中的中间位置、新气泡渐入、70 ms 间隔连续消息的动画接续、阅读历史时的滚动锚点、减少动态效果及棋盘位置稳定。实际行棋时，既有等待气泡在新随想到来时保持位置，动画中滚轮进入历史后终止位移动效，下一条消息仍保留阅读锚点。[消息到来前](../../artifacts/arena-clock-options/chat-motion-before.png)、[运动中](../../artifacts/arena-clock-options/chat-motion-middle.png)、[运动结束](../../artifacts/arena-clock-options/chat-motion-after.png)和[逐帧结果](../../artifacts/arena-clock-options/chat-motion-results.json)可用于复核。

## 2026-11-04：入席、准备与自动开赛

本轮在任务分支预览，尚未合入 `arena`。准备状态使用既有底部状态行；设置只在开赛前显示各棋手是否入席、准备中或已就绪。移除手动开始按钮，双方通过客户端确认就绪后自动开始；暂停与继续保留。开赛不改变棋盘几何，也不把准备事件显示成棋手随想。

以 `302ffff` 为前端基线，使用相同的空 7×7 莫比乌斯棋盘、相同已入席但未就绪的合成席位和同一视口截图；基线前端仅在隔离测试服务中拦截加载。运行 `NODE_PATH` 指向 Playwright 后执行 `node scripts/qa-arena-ready.cjs` 可重现。合成席位不代表真实模型行为。

| 视口 | 准备状态之前 / 现在 | 设置内单方就绪 |
| --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-ready/preparing-before-1280x720.png) / [现在](../../artifacts/arena-ready/preparing-1280x720.png) | [设置](../../artifacts/arena-ready/ready-settings-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-ready/preparing-before-1920x1080.png) / [现在](../../artifacts/arena-ready/preparing-1920x1080.png) | [设置](../../artifacts/arena-ready/ready-settings-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-ready/preparing-before-1024x768.png) / [现在](../../artifacts/arena-ready/preparing-1024x768.png) | [设置](../../artifacts/arena-ready/ready-settings-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-ready/preparing-before-1440x1080.png) / [现在](../../artifacts/arena-ready/preparing-1440x1080.png) | [设置](../../artifacts/arena-ready/ready-settings-1440x1080.png) |

[结构化结果](../../artifacts/arena-ready/results.json)覆盖入席后不走钟、单方就绪仍不走钟、双方就绪自动开赛、准备状态收起、时间线就绪事件、暂停继续、内置 AI 已就绪，无页面错误；[自动开赛](../../artifacts/arena-ready/automatic-start.png)展示现有行棋提示自然接续。实际模型阅读规则与准备耗时另待对局验证。

Arena 发布状态：2026-11-04 用户已确认本轮预览并授权合并、推送，产品提交为 `a679944`；见[渠道发布记录](../development/arena.md#渠道发布记录)。以下各轮验收的待确认、未发布描述保留当时状态。

## 2026-11-04：气泡一体轮廓与回合反馈

继续在本轮任务分支预览，尚未合回 `arena`。底部状态字号调整为 15 px，视角与复盘图标统一为 28 px；状态行及两条滑块均占 44 px 行高、4 px 行间距。气泡的玻璃底色与描边采用同一条含曲线尾角的闭合轮廓，左右镜像，不再叠加独立的菱形尖角。

正在等待落子的棋手显示一条短三点气泡，只表示当前回合，不代表客户端实际推理状态，也不写入消息历史。它随换手切换，在暂停、终局、复盘或观战连接中断时收起。走钟方数字清晰、冒号轻微呼吸；停钟方数字变浅，换钟有一次短促缩放强调。减少动态效果时保留静态提示与明暗区分。

提供 Playwright 到 `NODE_PATH`，设置 `ARENA_FLOW_BASE=a6c154d`、`ARENA_FLOW_EVIDENCE=artifacts/arena-turn-feedback` 后运行 `node scripts/qa-arena-flow.cjs`。前后使用同一暂停棋局和样例发言；另外通过实际开赛、落子、暂停及复盘检查回合反馈。测试文字均为合成样例，不代表模型对话。保留与本轮相关的前后、双边行棋和终局截图。

| 视口 | 前 / 后 | 黑方行棋 / 白方行棋 |
| --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-turn-feedback/conversation-before-1280x720.png) / [现在](../../artifacts/arena-turn-feedback/conversation-1280x720.png) | [黑方](../../artifacts/arena-turn-feedback/active-black-1280x720.png) / [白方](../../artifacts/arena-turn-feedback/active-white-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-turn-feedback/conversation-before-1920x1080.png) / [现在](../../artifacts/arena-turn-feedback/conversation-1920x1080.png) | [黑方](../../artifacts/arena-turn-feedback/active-black-1920x1080.png) / [白方](../../artifacts/arena-turn-feedback/active-white-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-turn-feedback/conversation-before-1024x768.png) / [现在](../../artifacts/arena-turn-feedback/conversation-1024x768.png) | [黑方](../../artifacts/arena-turn-feedback/active-black-1024x768.png) / [白方](../../artifacts/arena-turn-feedback/active-white-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-turn-feedback/conversation-before-1440x1080.png) / [现在](../../artifacts/arena-turn-feedback/conversation-1440x1080.png) | [黑方](../../artifacts/arena-turn-feedback/active-black-1440x1080.png) / [白方](../../artifacts/arena-turn-feedback/active-white-1440x1080.png) |

[结构化检查](../../artifacts/arena-turn-feedback/results.json)记录四视口的等距排版、字号与图标、真实换手时的气泡归属、走钟动效、停钟明暗、暂停/复盘/终局清理、减少动态效果和消息事件数不变；原有滚动、长消息、头像及复盘几何检查通过，无浏览器错误。以相同基线运行 `npm run arena:qa` 的四视口回归也通过。216 项测试、资源与文档检查通过；此次不改变计时裁判。

## 2026-11-04：气泡手数与底部控件整理

本轮为独立任务分支预览，尚未合回 `arena`。每条气泡上方显示关联局面的“第 N 手”，未落子时显示“开局”；悬停显示实际发送时间。底部状态与手数合成一行，放在两条滑块上方；回看手数与返回操作复用这行，终局结果也在此显示，不再放在设置中。两条轨道加长并保持同宽、端点列对齐、滑块尺寸一致。

提供 Playwright 到 `NODE_PATH`，设置 `ARENA_FLOW_BASE=7abbb79`、`ARENA_FLOW_EVIDENCE=artifacts/arena-message-context` 后运行 `node scripts/qa-arena-flow.cjs`。前后使用同一暂停的 7×7 莫比乌斯棋局、D4/E4 两手及同一组样例随想，样例不代表真实模型发言。本轮只保留聊天、底部、复盘及终局相关截图；其余回归截图可由脚本再生成。

| 视口 | 同状态前 / 后 | 滑轨宽度前 / 后 |
| --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-message-context/conversation-before-1280x720.png) / [现在](../../artifacts/arena-message-context/conversation-1280x720.png) | 224 / 380 px |
| 1920×1080 | [之前](../../artifacts/arena-message-context/conversation-before-1920x1080.png) / [现在](../../artifacts/arena-message-context/conversation-1920x1080.png) | 224 / 448 px |
| 1024×768 | [之前](../../artifacts/arena-message-context/conversation-before-1024x768.png) / [现在](../../artifacts/arena-message-context/conversation-1024x768.png) | 224 / 255 px |
| 1440×1080 | [之前](../../artifacts/arena-message-context/conversation-before-1440x1080.png) / [现在](../../artifacts/arena-message-context/conversation-1440x1080.png) | 224 / 441 px |

- [回看手数与返回操作](../../artifacts/arena-message-context/replay-1024x768.png)、[底部终局结果](../../artifacts/arena-message-context/timeout-1024x768.png)、[结构化检查](../../artifacts/arena-message-context/results.json)。
- 四视口通过消息手数关联、实际时间提示、共同滚动及阅读锚点、上下整条透明度、状态位于滑块上方、轨道对齐与加长、复盘前后棋盘几何不变、长状态不溢出，以及原有棋钟和资料操作检查；无浏览器错误。
- 原有 `npm run arena:qa` 以 `ARENA_QA_BASE=7abbb79`、`ARENA_QA_EVIDENCE=.tmp/arena-regression` 通过四视口回归。216 项测试、资源及文档校验通过。本轮不改变规则、棋钟或 MCP 协议。

## 2026-11-04：共同聊天时间轴、坐标与棋钟

本轮已于 2026-11-04 经用户预览确认，合入本地 `arena` 并更新本地服务；尚未推送远端。观战界面移除气泡内部滚动区域，双方消息按事件顺序交错、共同滚动；靠近上下边缘时整条消息与头像统一降低透明度，气泡内部不施加渐变。棋钟移到顶部左右两侧，棋色只在棋钟旁标示，坐标放大为 14–16 px。棋盘下方只保留视角与复盘操作，终局结果在设置中查看。

提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-arena-flow.cjs`。脚本启动隔离服务，以 `38b9a8d` 为前版页面，前后使用同一暂停的 7×7 莫比乌斯棋局、D4/E4 两手、相同样例随想及一条旧长消息。所有文字均为测试样例，不代表真实模型发言或棋力。四种视口覆盖 16:9、4:3。

| 视口 | 旧长消息前 / 后 | 新随想 |
| --- | --- | --- |
| 1280×720 | [之前](../../artifacts/arena-flow/long-before-1280x720.png) / [现在](../../artifacts/arena-flow/long-after-1280x720.png) | [对局](../../artifacts/arena-flow/conversation-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-flow/long-before-1920x1080.png) / [现在](../../artifacts/arena-flow/long-after-1920x1080.png) | [对局](../../artifacts/arena-flow/conversation-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-flow/long-before-1024x768.png) / [现在](../../artifacts/arena-flow/long-after-1024x768.png) | [对局](../../artifacts/arena-flow/conversation-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-flow/long-before-1440x1080.png) / [现在](../../artifacts/arena-flow/long-after-1440x1080.png) | [对局](../../artifacts/arena-flow/conversation-1440x1080.png) |

- [上端透明度](../../artifacts/arena-flow/fade-top-1280x720.png)、[下端透明度](../../artifacts/arena-flow/fade-bottom-1280x720.png)、[棋钟设置](../../artifacts/arena-flow/settings-1280x720.png)、[超时后棋盘](../../artifacts/arena-flow/timeout-1280x720.png)、[设置内结果](../../artifacts/arena-flow/result-1280x720.png)。
- [结构化结果](../../artifacts/arena-flow/results.json)：四视口均通过单一时间轴、共同位移、历史阅读锚点、长消息完整换行、上下两端整条透明度、坐标、复盘几何、重复头像编辑、棋钟输入校验、服务超时及结果入口检查，无页面溢出或浏览器错误。
- 以 `ARENA_QA_BASE=38b9a8d`、`ARENA_QA_EVIDENCE=.tmp/arena-regression` 运行原有 `npm run arena:qa`，四视口的首页、资料、邀请、棋局管理、SSE、暂停恢复、2D/3D、和棋、复盘与导出回归通过。临时回归产物不作为本轮长期证据。
- 当时半格网格延伸由 Arena 主动开启共享绘图的可选能力；1.41.2 已推广为共享默认行为，并移除调用选项，当前验证见本页末尾。此处保留历史验收：不改裁判连接规则，隔离验收不改写原棋谱；用户确认后曾重启原服务，旧棋局仍不计时。当时真实客户端的完整限时对局仍待用户试玩。

## 2026-10-22：棋子默认头像与 AI 名称联动

- 未配置的头像直接使用对应黑白棋子，复用既有棋子材质；对局中不再叠加重复的小棋色徽标。选择内置 AI 头像即填入对应名称，可继续手动改成昵称；切回默认或上传图片保留名字。头像列表用 Grok 替换 OpenCode，已有 OpenCode 头像记录仍可显示，客户端接入支持不变。
- 设置 `ARENA_QA_BASE=09a0bea`、`ARENA_QA_EVIDENCE=artifacts/arena-avatars`，提供 Playwright 到 `NODE_PATH` 后运行 `npm run arena:qa`。基线和当前页面使用相同视口、默认资料与交互，棋局仍为同一四手测试局；只保留本轮相关截图。

| 视口 | 默认首页前 / 后 |
| --- | --- |
| 1280×720 | [之前](../../artifacts/arena-avatars/before-home-1280x720.png) / [现在](../../artifacts/arena-avatars/home-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-avatars/before-home-1920x1080.png) / [现在](../../artifacts/arena-avatars/home-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-avatars/before-home-1024x768.png) / [现在](../../artifacts/arena-avatars/home-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-avatars/before-home-1440x1080.png) / [现在](../../artifacts/arena-avatars/home-1440x1080.png) |

- 选择 DeepSeek 后：[之前](../../artifacts/arena-avatars/before-profile-1280x720.png) / [自动填名](../../artifacts/arena-avatars/profile-1280x720.png)；[Grok 选项](../../artifacts/arena-avatars/grok-1024x768.png)、[对局默认头像](../../artifacts/arena-avatars/default-room-1280x720.png)。
- [结构化结果](../../artifacts/arena-avatars/verification.json)：四视口均通过七种 AI 头像的名称联动、黑白棋默认图形、自定义名字与上传保留、Grok 保存刷新以及原有邀请、观战和管理回归；无页面溢出或浏览器错误。201 项仓库测试、资源与文档检查通过。

## 2026-10-22：随想工具与接入流程回归

- 棋手文字统一为随想，保留自下而上的悬浮气泡、左右头像及固定复盘控件。MCP 接入提示放在 README，邀请窗口只传递席位信息，不增加配置步骤或说明面板。
- 设置 `ARENA_QA_BASE=e82016b`、`ARENA_QA_EVIDENCE=artifacts/arena-notes`，提供 Playwright 到 `NODE_PATH` 后运行 `npm run arena:qa`。隔离服务使用相同四手环面棋谱与样例文字，样例不代表真实模型对话。此次保留下列对比及终局/复盘截图。

| 视口 | 四手棋局前 / 后 |
| --- | --- |
| 1280×720 | [之前](../../artifacts/arena-notes/before-live-1280x720.png) / [现在](../../artifacts/arena-notes/live-1280x720.png) |
| 1920×1080 | [之前](../../artifacts/arena-notes/before-live-1920x1080.png) / [现在](../../artifacts/arena-notes/live-1920x1080.png) |
| 1024×768 | [之前](../../artifacts/arena-notes/before-live-1024x768.png) / [现在](../../artifacts/arena-notes/live-1024x768.png) |
| 1440×1080 | [之前](../../artifacts/arena-notes/before-live-1440x1080.png) / [现在](../../artifacts/arena-notes/live-1440x1080.png) |

- [新随想](../../artifacts/arena-notes/chat-1024x768.png)、[和棋终局](../../artifacts/arena-notes/ended-1024x768.png)、[复盘](../../artifacts/arena-notes/replay-1024x768.png)；[结构化检查结果](../../artifacts/arena-notes/verification.json)。四种视口均无溢出或浏览器错误，邀请、资料、记录、SSE、暂停恢复、解说开关与导出通过；复盘前后棋盘和头像位置完全一致。
- 201 项测试通过，其中 49 项 Arena 测试包含真实 MCP HTTP/stdio、CLI 随想及重试、其他席位过滤和旧棋谱恢复。资源、文档与 Skill 格式校验通过。未逐一实测五种客户端完整对弈，未发布远端 `arena` 分支。

## 2026-10-21：Arena 聊天布局、棋手资料与统一入口

- 首页采用大 logo 与单行标题，上下排列并整体垂直居中。设置使用原游戏滑杆图标，放在创建面板右上角；对局放在居中的关卡名旁。删除左上品牌、棋局名称、绿色连接/回合指示点与底部设置栏。
- 棋手头像和名称位于气泡外侧，黑方在左、白方在右，靠近最新发言；消息从底部向上推进，历史内容可滚动。复盘按钮与手数共用固定行，棋盘及双方头像的位置不跳动。
- 浏览器统一入口，设置包含邀请、对局管理、资料与记录。支持七家内置 AI 图标、自定义名称和本地头像上传；创建时配置 5–19 棋盘尺寸（球面正方形）。记录显示时间，结束/删除/清空均需确认，清空保留未结束棋局。
- 自动复现：提供 Playwright 到 `NODE_PATH` 后运行 `npm run arena:qa`。使用隔离服务与数据，以提交 `7ccacf6` 的 HTML/CSS/JS 为基线，同一环面 7×6、同一前四手 `[0, 7, 1, 8]` 与同一发言数据比较。样例发言用于布局验收，不是模型实际对话或棋力证明。

| 桌面视口 | 首页前 / 后 | 四手棋局前 / 后 |
| --- | --- | --- |
| 1280×720，16:9 | [之前](../../artifacts/arena-room/before-home-1280x720.png) / [现在](../../artifacts/arena-room/home-1280x720.png) | [之前](../../artifacts/arena-room/before-live-1280x720.png) / [现在](../../artifacts/arena-room/live-1280x720.png) |
| 1920×1080，16:9 | [之前](../../artifacts/arena-room/before-home-1920x1080.png) / [现在](../../artifacts/arena-room/home-1920x1080.png) | [之前](../../artifacts/arena-room/before-live-1920x1080.png) / [现在](../../artifacts/arena-room/live-1920x1080.png) |
| 1024×768，4:3 | [之前](../../artifacts/arena-room/before-home-1024x768.png) / [现在](../../artifacts/arena-room/home-1024x768.png) | [之前](../../artifacts/arena-room/before-live-1024x768.png) / [现在](../../artifacts/arena-room/live-1024x768.png) |
| 1440×1080，4:3 | [之前](../../artifacts/arena-room/before-home-1440x1080.png) / [现在](../../artifacts/arena-room/home-1440x1080.png) | [之前](../../artifacts/arena-room/before-live-1440x1080.png) / [现在](../../artifacts/arena-room/live-1440x1080.png) |

- 其他状态：[头像设置](../../artifacts/arena-room/profile-1024x768.png)、[新发言向上推进](../../artifacts/arena-room/chat-1280x720.png)、[设置](../../artifacts/arena-room/settings-1280x720.png)、[记录](../../artifacts/arena-room/records-1024x768.png)、[三维](../../artifacts/arena-room/surface-1920x1080.png)、[主动开启解说](../../artifacts/arena-room/commentary-1440x1080.png)、[终局](../../artifacts/arena-room/ended-1024x768.png) / [复盘](../../artifacts/arena-room/replay-1024x768.png)。
- [结构化结果](../../artifacts/arena-room/verification.json)：四视口无页面溢出或浏览器错误。验证首次进入、内置/上传头像及名称刷新保留、自定义 9×8 与球面联动、SSE、暂停恢复、和棋、导出、记录结束/删除/清空与当前棋局被删除后的返回；复盘前后棋盘和身份几何位置完全一致。
- 198 项仓库测试通过，其中 46 项 Arena 测试覆盖实际 HTTP/stdio MCP、尺寸与资料持久化、统一本地入口、删除流清理和原有对弈不变量。桌面 Chromium 实测；移动端不属于本轮范围，尚未逐一实测五种 agent 客户端完整会话。当前保持独立任务分支，等待预览确认。

## 2026-10-21：Arena 观战精简、默认关闭解说（历史基线）

- 保留棋盘与双方发言的视觉重心，删除重复状态、说明文字和空发言占位；发言改为悬浮玻璃气泡。解说默认关闭，主动邀请后开启，关闭时不留布局占位。新增认输、提和提示与协商终局。
- 历史复现：使用提交 `7ccacf6` 的脚本，提供 Playwright 到 `NODE_PATH` 后运行 `npm run arena:qa`。脚本使用隔离服务与数据；以 `756d52d` 的原 HTML/CSS/JS 为基线，在同一环面 7×6、同一前四手 `[0, 7, 1, 8]` 与同一发言数据上比较。
- 所有发言均为明确的测试样例，不是实际模型对局，不证明模型棋力。本轮仅面向横屏电脑浏览器，不再适配窄屏/移动端。

| 视口 | 修改前 | 修改后（开启解说） | 关闭解说 |
| --- | --- | --- | --- |
| 1280×720，16:9 | [基线](../../artifacts/arena-refinement/before-live-1280x720.png) | [气泡](../../artifacts/arena-refinement/live-1280x720.png) | [默认布局](../../artifacts/arena-refinement/no-commentary-1280x720.png) |
| 1920×1080，16:9 | [基线](../../artifacts/arena-refinement/before-live-1920x1080.png) | [气泡](../../artifacts/arena-refinement/live-1920x1080.png) | [默认布局](../../artifacts/arena-refinement/no-commentary-1920x1080.png) |
| 1024×768，4:3 | [基线](../../artifacts/arena-refinement/before-live-1024x768.png) | [气泡](../../artifacts/arena-refinement/live-1024x768.png) | [默认布局](../../artifacts/arena-refinement/no-commentary-1024x768.png) |
| 1440×1080，4:3 | [基线](../../artifacts/arena-refinement/before-live-1440x1080.png) | [气泡](../../artifacts/arena-refinement/live-1440x1080.png) | [默认布局](../../artifacts/arena-refinement/no-commentary-1440x1080.png) |

- 其他状态：[创建](../../artifacts/arena-refinement/home-1280x720.png)、[空房间前](../../artifacts/arena-refinement/before-empty-1024x768.png) / [空房间后](../../artifacts/arena-refinement/empty-1024x768.png)、[三维](../../artifacts/arena-refinement/surface-1920x1080.png)、[提议和棋](../../artifacts/arena-refinement/draw-offer-1024x768.png)、[双方和棋](../../artifacts/arena-refinement/draw-1024x768.png)、[认输](../../artifacts/arena-refinement/resign-1024x768.png)、[回看](../../artifacts/arena-refinement/replay-1024x768.png)。
- [结构化结果](../../artifacts/arena-refinement/verification.json)：四个视口无横向溢出、棋盘/解说/页脚重叠或浏览器错误；检查默认关闭、关闭后释放空间、刷新保留开关、邀请从提示词文件生成、SSE、三维切换、暂停恢复、认输、提和接受、连五、回看与无凭证导出。
- 193 项仓库测试通过，其中 41 项 Arena 测试覆盖两种真实 MCP 传输、决策幂等与重启恢复。本轮仍在独立任务分支，等待用户预览确认。

## 2026-10-21：Arena 本地 Agent 对弈室首版（历史基线）

以下为首版的历史证据；当前布局、视口与复现脚本以上一节为准，窄屏不再属于本产品验收范围。

- 独立 `arena` 渠道首版，基于 `dev@76bef39`。新界面沿用原作内嵌衬线字体、暖纸色/青绿、轻玻璃控件与共享棋盘绘制，不修改原 H5 页面。
- 历史复现使用提交 `756d52d` 中的 `npm run arena:qa`。脚本启动隔离数据目录和随机 loopback 端口，不读取正在使用的房主凭证、不改用户棋局。
- 同视口对比使用 1440×900 和 390×844，同为环面 7×6、双人模式、二维棋盘。对比空盘与相同前四手 `[0, 7, 1, 8]`；原产品没有观战界面，因此原版仅作棋盘、字体与材质基线，不声称是同一页面改版。
- 桌面：[原版空盘](../../artifacts/arena/original-empty-1440x900.png) / [对弈室空盘](../../artifacts/arena/empty-1440x900.png)，[原版四手](../../artifacts/arena/original-live-1440x900.png) / [对弈室四手](../../artifacts/arena/live-1440x900.png)。
- 窄屏：[原版空盘](../../artifacts/arena/original-empty-390x844.png) / [对弈室空盘](../../artifacts/arena/empty-390x844.png)，[原版四手](../../artifacts/arena/original-live-390x844.png) / [对弈室四手](../../artifacts/arena/live-390x844.png)。
- 其他状态：[创建](../../artifacts/arena/home-1440x900.png)、[三维](../../artifacts/arena/surface-1440x900.png)、[终局](../../artifacts/arena/ended-1440x900.png)、[复盘](../../artifacts/arena/replay-1440x900.png)、[窄屏三维](../../artifacts/arena/surface-390x844.png)、[窄屏复盘](../../artifacts/arena/replay-390x844.png)。
- [结构化结果](../../artifacts/arena/verification.json)记录邀请不含房主凭证、地址栏凭证移除、SSE 更新、暂停恢复、终局、复盘、下载、刷新恢复和无横向溢出检查。两视口均无浏览器异常。截图使用明确的脚本棋谱与公开示例发言，不作为模型棋力证明。
- 新发言区域可滚动，长历史收进时间线；棋盘不被发言覆盖。动态中文采用源字体完整字符集的三字重本地 WOFF2，字体测试覆盖静态文案与开放中文发言。
- 本次为桌面 Chromium 的窄屏模拟，不冒充真机验收；MCP 协议客户端测试也不等同于五个产品客户端都完成了人工实测。用户预览确认仍待完成。

## 2026-11-04：可选的半格拓扑辅助线

此阶段共享绘图通过 `extendGridToRails` 选项启用半格延伸；1.41.2 已改为共享默认行为并移除调用选项，当前验证见本页末尾 Issue #8 记录。以下保留初期同一 800×600 视口、7×7 棋盘、相同两颗棋子的历史对照，旧绘图基线为 `76bef39`：

- 莫比乌斯：[之前](../../artifacts/boundary-guides/mobius-before.png) / [之后](../../artifacts/boundary-guides/mobius-after.png)，只有左右网格延长，保留扭转箭头。
- 环面：[之前](../../artifacts/boundary-guides/torus-before.png) / [之后](../../artifacts/boundary-guides/torus-after.png)，两组连接边均延长。
- 球面：[之前](../../artifacts/boundary-guides/sphere-before.png) / [之后](../../artifacts/boundary-guides/sphere-after.png)，保留相邻边配对颜色。

通过 `npm run check`（152 项测试、资源和文档检查），新增绘制测试覆盖七种拓扑的端点与辅助线位置，以及关闭选项时原有绘图不变。配置 Playwright 后运行 `node scripts/qa-boundary-guides.cjs` 可复现浏览器证据。仅在独立共享任务分支验证，尚未合入 `dev`，未发布其他渠道；Arena 预览通过该可选参数启用。

## 2026-10-20：1.41.1 发行复验

- 以已确认的共享修改为基线，五渠道同版本整合，未产生样式冲突。Bilibili WebKit 双人九种视口检查通过（离线 SDK 桩）；[390×674 结果](../../artifacts/qa-release-1.41.1-bilibili-390x674.png)。真实 Toy 审核预览和状态见[发行记录](../releases/1.41.1.md)。
- Web 从网站仓库根目录访问固定子路径，验证首页、设置、落子、返回和偏好存储，无脚本异常：[移动](../../artifacts/qa-release-1.41.1-web-390x674.png)、[桌面](../../artifacts/qa-release-1.41.1-web-1440x900.png)。
- 知乎新交付副本同样验证以上交互：[移动顶层](../../artifacts/qa-release-1.41.1-zhihu-390x674.png)、[桌面顶层](../../artifacts/qa-release-1.41.1-zhihu-1440x900.png)、[跨源 iframe](../../artifacts/qa-release-1.41.1-zhihu-390x674-iframe.png)。本轮尚未代为上传知乎，宿主真机验收仍由维护者完成。
- 微信从长期发行分支重新构建并同步固定模板，官方开发者工具刷新成功；[原生首页截图](../../artifacts/qa-release-1.41.1-wechat.jpg)。本次 H5 CSS 不改变原生 Canvas，上传成功不代表已审核上线。

## 2026-10-20：关卡图案与标签比例修复（已确认）

- 从最新 `dev@ce74f9c` 新建 `codex/card-proportions` 独立任务；仅修改共享 H5 卡片样式和验证工具，预览基线为 1.41.0；用户于 2026-10-20 确认预览并授权以 1.41.1 合并发行；微信原生 Canvas 不在本次 H5 样式变更范围内。
- 原因：矮窗口沿用 46px 固定图案与 8px 小字，归圆也被普通卡片规则覆盖；竖排卡片在模式行占用空间后，较大的内边距与图案高度限制进一步压缩内容。
- 调整：图案填充实际网格区域并保留上限；普通图案最高 80px，归圆最高 100px。普通小字/关卡名提高到 11/17px，极矮窗口为 10/15px；缩减内边距，保留横排文字整体居中及足够的长标签宽度。颜色、材质、标题、玩法和模式操作不变。
- 同状态比较：WebKit、DPR 2、字体与图片加载完成，双人模式显示所有拓扑；基线固定 `ce74f9c`。

| 视口与布局 | 修改前 | 修改后 |
| --- | --- | --- |
| 390×674 嵌入窗口 | [基线](../../artifacts/qa-home-before-cards-duel-webkit-390x674-iframe.png) | [结果](../../artifacts/qa-home-after-cards-duel-webkit-390x674-iframe.png) |
| 390×844 小红书布局 | [基线](../../artifacts/qa-home-before-cards-duel-webkit-390x844-default.png) | [结果](../../artifacts/qa-home-after-cards-duel-webkit-390x844-default.png) |
| 700×320 极矮窗口 | [基线](../../artifacts/qa-home-before-cards-duel-webkit-700x320-iframe.png) | [结果](../../artifacts/qa-home-after-cards-duel-webkit-700x320-iframe.png) |

- 嵌入窗口普通图案区域高度 46→80px，归圆 46→94.25px；小红书布局普通图案区域 53.5→65.23px。数值指图片元素区域，实际轮廓还取决于 SVG 自带留白。
- 回归：Chromium 人机模式和 WebKit 双人模式各九种视口，共 18 个场景通过，覆盖 320×568、390×480/674/760/844、700×320/480、1440×900。检查七张卡片完整、可见图案与文字不重叠、长标签单行、文字居中、滚轮/触摸/键盘不移动首页，以及进入末关并返回。验证隐藏转场图案时不将其旋转包围盒误当成可见内容。
- 复现：`npm run build:web` 后，运行 `node scripts/qa-board-viewport.cjs --home --card-sizes --label=after`；双人 WebKit 附加 `--duel --webkit`。基线使用 `--label=before --baseline=ce74f9c --duel --webkit`。环境需提供 Playwright 与两种浏览器。
- 预览：运行同一脚本的 `--serve`，打开 `/scripts/preview-card-layout.html`，可切换嵌入窗口、小红书、小屏、极矮窗口和桌面模拟。预览容器仅缩放展示，不改变 iframe 内部布局尺寸；平台工具栏、真实安全区及真机效果仍需宿主复验。
- 151 项测试、H5 校验、Web 构建通过；视觉语言和 QA 文档同步更新。用户已确认该任务预览，按仓库流程合入 dev 并进行 1.41.1 统一发行同步。

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
| 终局二维/三维视角与 3 × 2 操作区 | [`二维终局`](../../artifacts/qa-board-view-endgame-2d-2216x1242.png)、[`三维终局`](../../artifacts/qa-board-view-endgame-3d-2216x1242.png)、[`边界合拢`](../../artifacts/qa-board-view-endgame-transition-2216x1242.png) |
| 对局视角修复交互录制 | [`教程进场`](../../artifacts/qa-board-view-tutorial-entry.mp4)、[`视角转换锁定落子`](../../artifacts/qa-board-view-view-interaction-guard.mp4)、[`玩家胜利`](../../artifacts/qa-board-view-player-win.mp4)、[`AI 胜利`](../../artifacts/qa-board-view-ai-win.mp4) |
| Issue #9 嵌入式宿主棋盘高度 | [`修改前 390 × 560`](../../artifacts/qa-issue-9-before-390x560.png)、[`修改后 390 × 560`](../../artifacts/qa-issue-9-after-390x560.png) |

较早截图只用于回归和问题溯源，不自动成为新设计的视觉真相。出现冲突时，以最新已确认实现、视觉设计语言和同状态实机/预览证据为准。

## Issue #9：固定首页与矮屏卡片（2026-10-20，已确认）

- 当前修复分支同步 `dev@38ae19a`，平台预览同步稳定 `main@53d0bdb`，统一版本为 `1.40.0`；保留新标题行距与删除口号的修改。用户于 2026-10-20 确认知乎已手动上传上线，并授权 Bilibili 提交审核、Web 发布与 issue 收尾；本节最终预览 `4457bd2` 已确认。
- 首页与对局不开放页面滚动，移除旧的矮窗口外层滚动兜底。高度不超过 700px 时，卡片改为左图标、右文字；两行文字作为一个整体居中。进一步降低窗口高度时缩减主视觉与卡片内边距，七关仍在同一屏内。充裕高度保留上下排布。
- 同状态基线为 `763d7c7`（包含 1.40.0，尚无本节修改），均设置首关已完成、第二关可进入、其余关卡锁定。证据：[466×620 修改前](../../artifacts/qa-home-before-webkit-466x620-web-build.png) / [修改后](../../artifacts/qa-home-after-webkit-466x620-web-build.png)、[700×480 修改前](../../artifacts/qa-home-before-webkit-700x480-iframe.png) / [修改后](../../artifacts/qa-home-after-webkit-700x480-iframe.png)、[700×320 修改前](../../artifacts/qa-home-before-webkit-700x320-iframe.png) / [修改后](../../artifacts/qa-home-after-webkit-700x320-iframe.png)、[390×844 修改前](../../artifacts/qa-home-before-webkit-390x844-web-build.png) / [修改后](../../artifacts/qa-home-after-webkit-390x844-web-build.png)。
- 复现：先 `npm run build:web`，再运行 `node scripts/qa-board-viewport.cjs --home --label=after`，附加 `--webkit` 覆盖 WebKit；基线使用 `--home --label=before --baseline=763d7c7 --webkit`。需要安装 Playwright 及两个浏览器。
- 校验包含九种视口/宿主组合、全部卡片边界与图文间距、文字组居中、鼠标滚轮、键盘逐卡片焦点、末关进入与返回；Chromium 另发送触摸滑动，断言页面位置不变。用 `--short-panel` 复验对局画布与底部按钮。平台预览复用共享实现，Bilibili 本地检查使用 `--offline-sdk`；本地浏览器验证不替代真实知乎/Bilibili 宿主验收。

关卡卡片共享转场已在 390 × 844 视口完成双向验收：进入采用 300 ms 的统一等比低阻尼回弹，返回采用 240 ms 的合成器变换；真实卡片与过渡外壳交叠交接，棋盘内容保持等比，最终边界、29 px 圆角和静态可见性均准确，无裁切、闪烁或控制台异常。长期实现约束见 [`shared-transitions.md`](shared-transitions.md)。

液态滑块与开关惯性在 390 × 844 视口完成点击、连续拖动和释放验收：拖动保持柔性追随，直接点击采用独立的距离感知节奏；桌面跨两档点击为 740 ms，修改前同一操作在 220 ms 已越过目标停靠点，优化后仍保留可见滑行并最终准确停靠。触摸与手写笔使用更重的跟随和停靠节奏；点击轨道或目标档位只产生惯性位移，只有直接按住可移动玻璃体才出现挤压与折射。桌面本地预览与 Bilibili Toy 手机预览均于 2026-08-28 获得明确确认，自动检查、包结构校验和控制台检查均通过。

难度滑块的连续拖动在 390 × 844 H5 预览中完成回归：指针按住玻璃滑块时，位移逐帧直接跟随输入，只对液态形变保留缓动；释放后再恢复距离感知的吸附与单次回弹。这样避免移动 WebView 在每个指针帧中断并重启位移动画造成抖动，同时保持点击跳档和释放停靠的原有质感。

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

## Issue #2：离线双人候选验证（2026-09-19）

任务分支 `codex/issue-2-offline-duel` 从 `dev` 的 `45900d9` 开始。首页新增两种对弈模式，复用无底板工具按钮的字号、颜色和按压反馈，命中区至少 44 px 高；卡片图形随可用网格行高收缩，图形和文字保留间隔。以下截图来自 Headless Chromium 的触摸视口模拟，基线和结果均为全新进度、同一尺寸与静止状态，未使用开发者模式。

| 状态 | 390 × 844 | 360 × 770 |
| --- | --- | --- |
| 首页基线 | [修改前](../../artifacts/issue-2/home-before-390x844.png) | [修改前](../../artifacts/issue-2/home-before-360x770.png) |
| 首页候选 | [修改后](../../artifacts/issue-2/home-after-390x844.png) | [修改后](../../artifacts/issue-2/home-after-360x770.png) |
| 白方回合 | [回合与棋盘](../../artifacts/issue-2/duel-white-turn-390x844.png) | [回合与棋盘](../../artifacts/issue-2/duel-white-turn-360x770.png) |
| 双人设置 | [提示与声音](../../artifacts/issue-2/duel-settings-390x844.png) | [提示与声音](../../artifacts/issue-2/duel-settings-360x770.png) |
| 黑方胜 | [终局与再来](../../artifacts/issue-2/duel-black-win-390x844.png) | [终局与再来](../../artifacts/issue-2/duel-black-win-360x770.png) |
| 白方胜 | [终局与复盘](../../artifacts/issue-2/duel-white-win-390x844.png) | [终局与复盘](../../artifacts/issue-2/duel-white-win-360x770.png) |
| 满盘和局 | [和局](../../artifacts/issue-2/duel-draw-390x844.png) | [和局](../../artifacts/issue-2/duel-draw-360x770.png) |

自动验证：`npm run check` 通过 141 项逻辑 / H5 行为 / 字体测试及包、文档校验。`npm run qa:duel` 在首页资源加载后关闭网络，以真实触摸事件验证模式入口、黑白交替、占用拒绝、设置、悔棋、重开、双方胜利、满盘和局、复盘和退出；AI 调用、外部请求、资源失败及页面错误均为 0。终局可见性在状态更新后的绘制帧核对，避免把尚未应用样式的一帧误判为按钮隐藏。规则测试还覆盖七拓扑双方获胜及教学返回，多指与过期松手由 H5 行为测试覆盖。复现命令见[开发环境](../development/environment.md#离线双人浏览器回归)。

预览确认：待用户确认，尚未合回 `dev`。桌面手动浏览器检查因工具无法可靠识别当前网址而停止，未计为通过；本次结论来自本地自动化和截图检查。五个平台宿主的模拟器 / 真机离线验收与稳定发行同步尚未完成，Issue #2 保持开放。

### 2026-10-20：首页标题简化（用户已确认）

- 分支：`codex/home-title-spacing`；基于远端 `dev` 的 `b8c0e82`，在独立任务 worktree 中完成。
- 状态：新浏览器上下文、初始进度 0 / 7、首页静止态；截图统一使用 Chromium、DPR 1、减少动态效果，等待内嵌字体及品牌图片加载完成。
- 同视口对比：

| 视口 | 修改前 | 修改后 |
| --- | --- | --- |
| 390 × 844 | [基线](../../artifacts/qa-home-title-before-390x844.png) | [结果](../../artifacts/qa-home-title-after-390x844.png) |
| 360 × 770 | [基线](../../artifacts/qa-home-title-before-360x770.png) | [结果](../../artifacts/qa-home-title-after-360x770.png) |
| 360 × 740 | [基线](../../artifacts/qa-home-title-before-360x740.png) | [结果](../../artifacts/qa-home-title-after-360x740.png) |
| 320 × 568 | [基线](../../artifacts/qa-home-title-before-320x568.png) | [结果](../../artifacts/qa-home-title-after-320x568.png) |
| 1280 × 900 | [基线](../../artifacts/qa-home-title-before-1280x900.png) | [结果](../../artifacts/qa-home-title-after-1280x900.png) |

- 删除首页口号及其样式，标题保留两行左对齐，行高由 0.94 调整为 1.2，字号比基线增大约 8%：常规视口为 46–62 px，紧凑高度为 40–52 px；品牌图标尺寸沿用基线。标题整体与品牌图标垂直居中后向下微调 4 px，五种视口的关卡列表上下边界均与基线一致。结果截图为加大字号并下移的两行左对齐方案，基线仍为任务开始前的双行标题与口号。
- 浏览器自动检查：五种视口均无横向溢出或页面脚本异常，内嵌标题字体加载成功；390 × 844 下点击第一关并返回首页通过。截图用于检查排版，不等同于手机宿主真机验收。
- 仓库自动验证：`npm run check` 通过（119 项测试、29 个离线包文件、23 份 Markdown），包括三个内嵌字体字重的文字覆盖检查；`git diff --check` 通过。
- 用户预览确认：2026-10-20 已确认加大字号、两行左对齐并下移 4 px 的本地预览，授权提交 PR、提升稳定版本并同步五个发行分支。渠道发行状态见对应版本发布记录。

### 2026-10-20：离线双人同步最新 dev

双人任务分支合入 `dev` 的 `38ae19a`，接收首页标题简化及统一版本 `1.40.0`，保留双人入口与交互。两侧 QA 记录均保留。上方 Issue #2 的候选截图已按合并结果重新生成，首页基线仍为 `45900d9`；此前候选图可从 `6f09eba` 回溯。390 × 844 和 360 × 770 的断网对局回归通过，首页图文间距检查通过，141 项测试、包校验与 24 份 Markdown 校验通过。此次仅把 `dev` 同步到任务分支，双人功能仍待用户预览确认后合回 `dev`。

### 2026-10-20：首页仅保留模式行

按用户反馈删除首页“旅程 / 进度计数”一行，标题与关卡列表之间只保留模式选择，首页网格恢复三行结构；解锁与完成状态继续由关卡卡片表示。模式按钮保留 44 px 触摸高度。相同初始进度、静止状态的对比：[390 × 844 两行](../../artifacts/issue-2/home-two-rows-390x844.png) → [单行](../../artifacts/issue-2/home-after-390x844.png)，[360 × 770 两行](../../artifacts/issue-2/home-two-rows-360x770.png) → [单行](../../artifacts/issue-2/home-after-360x770.png)。141 项测试及包、文档校验通过；两种视口重新执行离线双人浏览器回归。最新首页候选以本节单行截图为准，仍待用户预览确认。

### 2026-10-20：模式行字号与双人全部关卡

模式标签调整为 15 px、常规字重，两项选择为 16 px、600 字重；按钮高 48 px，选项间隔 12 px，行高 52 px。保留已有无底板按钮与细下划线，扩大文字和留白。相同初始单人状态对比：[390 × 844 修改前](../../artifacts/issue-2/home-small-mode-390x844.png) → [修改后](../../artifacts/issue-2/home-after-390x844.png)，[360 × 770 修改前](../../artifacts/issue-2/home-small-mode-360x770.png) → [修改后](../../artifacts/issue-2/home-after-360x770.png)。

双人模式直接展示全部拓扑图形并开放七关：[390 × 844](../../artifacts/issue-2/home-duel-all-levels-390x844.png)、[360 × 770](../../artifacts/issue-2/home-duel-all-levels-360x770.png)。浏览器回归从全新进度逐一进入六个高阶关卡，再切回单人确认恢复六个锁定关卡，随后执行原有断网对局流程。切换模式不写解锁进度；共享 controller 与 H5 行为测试覆盖同一约定。新版入口取代前文“仅已解锁关卡”的候选行为，待用户预览确认。

### 2026-10-20：对弈选项与标题左对齐

删除可见“模式”标签，保留分组的无障碍名称“对弈模式”。“人机对弈 / 离线双人”置于标题下方，首项文字与标题共用左边界；移除按钮水平内边距，选项之间留 28 px，按钮保留 48 px 高触摸区，关卡上方留 8 px。字号仍为 16 px。[390 × 844 原布局](../../artifacts/issue-2/home-labeled-mode-390x844.png) → [新布局](../../artifacts/issue-2/home-after-390x844.png)，[360 × 770 原布局](../../artifacts/issue-2/home-labeled-mode-360x770.png) → [新布局](../../artifacts/issue-2/home-after-360x770.png)；原布局图片沿用上轮保存的入口文案。143 项测试、包与文档校验通过，最新布局仍待用户预览确认。

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

### 2026-09-19：Issue #9 嵌入式宿主顶部留白（历史初验）

- 分支：`codex/fix-issue-9`，从 `dev` 建立；复现状态为第二关进入棋局并完成边界演示后的正常对局，视口为 390 × 560，用同一内容分别切换默认顶部留白与紧凑宿主布局。
- [修改前](../../artifacts/qa-issue-9-before-390x560.png) 中共享的小红书宿主留白继续占用嵌入式页面高度，棋盘 flex 项被压扁；[修改后](../../artifacts/qa-issue-9-after-390x560.png) 仅保留真实安全区，棋盘恢复完整方形比例，底部行列可见。
- 宽而矮的嵌入窗口追加按可用高度限制游戏列宽并居中的布局，窄屏不改变原有横向占用，避免通过压缩按钮和状态行换取棋盘宽度。
- 自动验证：`npm run check`、`npm run build:xiaohongshu`、`git diff --check` 均通过；本地静态预览已确认 `index.html`、`host-layout.js` 和 `style.css` 返回 200，暂未完成 Bilibili 真机与知乎宿主内预览。
- 预览确认：此为初验记录；最终方案已于 2026-10-20 获得用户确认并发行，见本页最终预览与发行记录。
## Issue #9：面板裁切复检（2026-10-20）

- 根因：WebKit 中 Grid 内 Canvas 的固有高度会在 Flex 面板缩短后保留旧值；此外仅监听窗口 resize 无法覆盖元素尺寸变化。知乎顶层页面与独立 Web 站点还会误用小红书的 68px 顶部预留。
- 修复：Canvas 脱离 Grid 固有尺寸计算，填满面板并观察元素尺寸；按未缩放的布局尺寸重绘。知乎域名/显式平台标记启用紧凑布局，Web 构建写入平台标记；宽屏面板允许收缩以保留工具行。
- 可复现脚本：`scripts/qa-board-viewport.cjs`，需要环境可解析 `playwright` 并安装 Chromium/WebKit。先 `npm run build:web`；分别运行 `node scripts/qa-board-viewport.cjs --label=after` 和附加 `--webkit` 的同一命令。历史基线使用 `--label=before --baseline=33fd8ca --webkit`，脚本通过 Git 只读加载历史资源，不回退工作区。
- 场景：390×674、390×560 的跨源 iframe，390×674 / 390×844 的默认小红书布局，900×560 的宽浅 iframe，390×674 / 1440×900 的 Web 构建。内容固定为环游首段教学；另将面板高度改成 220px，不触发窗口 resize。脚本断言画布边界和位图尺寸、底部按钮可见性，并点击教学下方交点确认下一条提示。
- [同视口面板缩短前的旧实现](../../artifacts/qa-board-viewport-before-webkit-390x674-iframe-panel-resize.png) 与 [同视口修复后](../../artifacts/qa-board-viewport-after-webkit-390x674-iframe-panel-resize.png) 展示相同 390×674 窗口、相同环游首段教学、相同 220px 面板；旧实现裁掉下半盘，新实现完整居中。
- [390×560 窄屏修复](../../artifacts/qa-board-viewport-after-webkit-390x560-iframe.png)、[独立 Web 手机布局](../../artifacts/qa-board-viewport-after-webkit-390x674-web-build.png)、[独立 Web 桌面布局](../../artifacts/qa-board-viewport-after-webkit-1440x900-web-build.png)。
- Chromium / WebKit 共 14 个页面场景通过，4 次元素尺寸变化后的落子通过；`npm run check`（125 tests）与 `npm run build:web` 通过。本轮为中间复检记录，本地 WebKit 不等于真机验收；最终预览已获用户确认并进入 Issue #9 发行收尾。

## Issue #9：矮面板棋盘占比（2026-10-20）

- 同一回廊对局，497×561 独立 Web 与 700×480 iframe；脚本附加 `--short-panel`，历史基线为 `--label=before --baseline=52f1196 --webkit`，新实现为 `--label=after --webkit`。进入已学关卡并跳过演示，保持二维空盘。
- [700×480 调整前](../../artifacts/qa-board-viewport-before-webkit-700x480-iframe.png) / [调整后](../../artifacts/qa-board-viewport-after-webkit-700x480-iframe.png)：同一窗口内画布高度从 190px 增至 210px，网格高度从 122px 增至 166px（约 36%），轨道、箭头和底部工具完整可见。
- [497×561 调整前](../../artifacts/qa-board-viewport-before-webkit-497x561-web-build.png) / [调整后](../../artifacts/qa-board-viewport-after-webkit-497x561-web-build.png)。
- 共享几何测试覆盖七关在四种面板尺寸下的居中、边界轨道空间、末端交点，以及充裕尺寸和显式边距的兼容性。三端预览使用相同共享实现；最终平台预览已获用户确认，发行状态见 1.40.0 发布记录。

### 2026-10-20：双人任务再次同步 dev 的窗口适配

合入 `dev` 的 `4bd2b6d`，接收宿主留白、画布尺寸观察和矮屏卡片布局，保留左对齐的“人机对弈 / 离线双人”与双人全部关卡开放。卡片常规图文间距采用新版 4 px；高度不超过 440 px 时行间距收为 1 px，确保新增对弈选择行之后，卡片内容仍有内部留白。点击验证脚本改用共享棋盘几何，避免旧固定边距造成测试误点。

同一初始进度首页：[390 × 844 同步前](../../artifacts/issue-2/home-before-viewport-sync-390x844.png) / [同步后](../../artifacts/issue-2/home-after-390x844.png)，[360 × 770 同步前](../../artifacts/issue-2/home-before-viewport-sync-360x770.png) / [同步后](../../artifacts/issue-2/home-after-360x770.png)。补充检查：[700 × 320 嵌入首页](../../artifacts/qa-home-duel-dev-sync-chromium-700x320-iframe.png)、[390 × 674 面板缩短后的棋盘](../../artifacts/qa-board-viewport-duel-dev-sync-chromium-390x674-iframe-panel-resize.png)。

验证：151 项测试、离线包与文档校验、Web 构建通过；390 × 844 与 360 × 770 离线双人流程通过，Chromium 首页九种窗口与棋盘七种窗口及元素尺寸变化后的落子检查通过。此轮未重做真机宿主验收。仅同步到任务分支，未合回 dev 或发布。

### 2026-10-20：1.41.0 预览确认

用户确认当前离线双人预览，授权收尾与发布，版本指定为 1.41.0。此前各段候选状态由本次确认替代；渠道实际上传、审核与上线结果分别记录在 [1.41.0 发布记录](../releases/1.41.0.md)。

## 2026-11-05：归圆形变中的邻边颜色

- 分支：`codex/sphere-seam-colors`，从 `dev@76bef39` 建立；共享绘制修复，产品提交 `9eaf057`。
- 原因：二维轨道按上 / 左、下 / 右分组，三维形变的彩色边线却按左右、上下分组，导致上边与右边在过渡中换色。现在球面两种绘制共用邻边分组；形变几何、透明度、线宽和非球面分组保持不变。
- 条件：Chromium，1280 × 720，像素比 1；同一空 7 × 7 归圆棋盘、默认视角、固定绘制时间 2000 ms。独立预览直接调用共享 `drawBoard` / `drawCompletion`，使用游戏原有二维 / 三维图标、液态玻璃滑块及其交互模块。

| 形变进度 | 修改前 | 修改后 |
| --- | --- | --- |
| 0 | [二维](../../artifacts/sphere-seam-colors/before-sphere-0-1280x720.png) | [二维](../../artifacts/sphere-seam-colors/after-sphere-0-1280x720.png) |
| 0.25 | [过渡](../../artifacts/sphere-seam-colors/before-sphere-0-25-1280x720.png) | [过渡](../../artifacts/sphere-seam-colors/after-sphere-0-25-1280x720.png) |
| 0.5 | [过渡](../../artifacts/sphere-seam-colors/before-sphere-0-5-1280x720.png) | [过渡](../../artifacts/sphere-seam-colors/after-sphere-0-5-1280x720.png) |
| 0.7 | [过渡](../../artifacts/sphere-seam-colors/before-sphere-0-7-1280x720.png) | [过渡](../../artifacts/sphere-seam-colors/after-sphere-0-7-1280x720.png) |
| 1 | [球面](../../artifacts/sphere-seam-colors/before-sphere-1-1280x720.png) | [球面](../../artifacts/sphere-seam-colors/after-sphere-1-1280x720.png) |

- 可复现命令：让环境可解析 Playwright 后运行 `node scripts/qa-sphere-seam-colors.cjs`。脚本固定重放配色前 `76bef39` 与配色后 `9eaf057`，不回退工作区，也不把后续几何更新混入历史对照；附加 `--serve --port=4328` 可启动独立交互预览，`?revision=before` 查看基线，`?progress=0.5` 固定初始进度。当前半格边界行为用下文 `qa-shared-boundary-guides.cjs` 复验。
- 自动验证：10 张截图、球面二维与完整球面画布逐字节一致；平面、圆柱、环面、莫比乌斯带、克莱因瓶和射影平面在 0.5 进度的前后画布逐字节一致；二维 / 三维按钮动画和滑块拖至 0.5 通过。每对邻边各采样 129 点，球面上 / 左与下 / 右对应点最大距离为 `8.9e-16`。[完整结果](../../artifacts/sphere-seam-colors/results.json) 保存条件与画布摘要。
- 视觉检查：过渡中上 / 左始终为绿色，下 / 右始终为黄色；外侧辅助轨道与曲面边线分组一致。未更改投影形状，也未改动对弈室独有界面。本轮为本地 Chromium 验证，未重复宿主真机验证。
- 预览确认：2026-11-06 用户确认预览无问题，授权将共享修复合入并推送 `dev`，同时同步到 `arena`。154 项测试、资源与文档检查通过。

## 2026-11-06：共享棋盘的半格拓扑边界（Issue #8）

- 任务分支：`codex/shared-boundary-guides`，从 `dev@b234185` 建立。将对弈室中的半格延伸推广到共享绘制模块和游戏本体入口；有拓扑连接的边延伸半格到彩色辅助线，开放边保留原有终点。归圆保持上 / 左青绿、下 / 右金黄。
- 同状态条件：Chromium，像素比 1，桌面 1280×720、手机视口 390×844 和矮视口 390×560；前后均从真实首页进入离线双人同一关卡，依次在四角落黑白棋，等待落子效果稳定。七关共 42 组前后页面检查，记录真实 Canvas 绘制路径；不是为截图重画一套棋盘。移动结果是浏览器触屏与视口模拟，未作真机宿主验证。
- 自动检查：最外排落子点与辅助线相距严格半格，延伸网格的端点与辅助线重合，所有默认关卡前后的落子点布局完全相同；每个页面四角触屏落子均到达正确格点，辅助线和箭头完整位于画布中。六种曲面在 `0.002 / 0.25 / 0.5 / 1 / 0` 各进度往返，共 180 个状态检查，回到二维后网格与辅助线重新对齐。固定进度截图用减少动态效果获得一致状态，不把这些检查当作逐帧性能测量。

| 同一棋局与视口 | 修改前 | 修改后 |
| --- | --- | --- |
| 环游，1280×720 | [四角落子](../../artifacts/shared-boundary-guides/before-torus-edges-1280x720.png) | [半格延伸](../../artifacts/shared-boundary-guides/after-torus-edges-1280x720.png) |
| 环游，390×844 | [四角落子](../../artifacts/shared-boundary-guides/before-torus-edges-390x844.png) | [半格延伸](../../artifacts/shared-boundary-guides/after-torus-edges-390x844.png) |
| 扭带，390×560 | [开放边与接合边](../../artifacts/shared-boundary-guides/before-mobius-edges-390x560.png) | [只延伸接合边](../../artifacts/shared-boundary-guides/after-mobius-edges-390x560.png) |
| 归圆，390×560 | [四角落子](../../artifacts/shared-boundary-guides/before-sphere-edges-390x560.png) | [相邻同色边](../../artifacts/shared-boundary-guides/after-sphere-edges-390x560.png) |
| 方庭，390×844 | [平面](../../artifacts/shared-boundary-guides/before-plane-edges-390x844.png) | [开放边保持](../../artifacts/shared-boundary-guides/after-plane-edges-390x844.png) |
| 环游，形变 0.25 | [原来的网格起点](../../artifacts/shared-boundary-guides/before-torus-morph-0.25-1280x720.png) | [与棋子对齐的起点](../../artifacts/shared-boundary-guides/after-torus-morph-0.25-1280x720.png) |
| 归圆，形变 0.002 | [原来的边界起点](../../artifacts/shared-boundary-guides/before-sphere-morph-0.002-1280x720.png) | [接续半格边界](../../artifacts/shared-boundary-guides/after-sphere-morph-0.002-1280x720.png) |

- 共享模块单独验证七拓扑 × 5 / 7 / 19 路 × 800×600 / 300×220 画布，共 42 组。全部交点中心点击返回原格点，网格与彩轨对齐且留有箭头空间；只有空间不足时才缩小网格，默认七关的上述真实页面未改变棋子间距。
- 跨边界实战检查：真实触屏操作在环游以黑方 `26 → 27 → 21 → 22 → 23` 跨左右边界连五，裁判判黑胜；[五连前一手](../../artifacts/shared-boundary-guides/after-torus-cross-boundary-1280x720.png)保留边缘棋子与半格间隔的可视证据。
- 可复现命令：提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-shared-boundary-guides.cjs`。追加 `--serve --port=4329` 提供实际游戏预览，`/before/` 是只读 Git 基线；[完整结果](../../artifacts/shared-boundary-guides/results.json)保存各组布局、触屏落子、视角状态与证据路径。共保存 37 张截图。
- 验证：160 项测试、资源与文档校验通过，浏览器检查无运行错误。目视检查桌面、手机和矮视口的彩轨、扩线、开放边及动画首段无裁切或明显错位。2026-11-06 用户确认预览无问题，授权合入 `dev`、关闭 Issue #8、提升 `main` 并完成各渠道发行；统一版本为 1.41.2，渠道结果见[发布记录](../releases/1.41.2.md)。

## 2026-11-06：Arena 采用共享默认半格边界

- 基线 `arena@7a191cd`，整合 `main@ba8e3ab`，游戏版本 1.41.2。观战入口移除旧的显式开关，直接使用共享棋盘默认行为；二维视觉保持原样，曲面形变接收已确认的共享网格修复。
- 同状态条件：Chromium、像素比 1、1280×720 与 1024×768，覆盖 16:9 和 4:3；相同暂停的 7×7 棋局、四角四手、无样例发言。基线仅从 Git 读取页面脚本与共享棋盘模块，不回退工作区。平面、莫比乌斯、球面共六组，每组前后二维画布逐字节一致；非平面检查 `0 → 0.002 → 0.25 → 1 → 0` 往返后画布恢复一致，复盘与设置前后棋盘位置不变。
- 目视检查：[莫比乌斯之前](../../artifacts/arena-shared-1.41.2/before-mobius-0-1024x768.png) / [之后](../../artifacts/arena-shared-1.41.2/after-mobius-0-1024x768.png)、[球面形变之前](../../artifacts/arena-shared-1.41.2/before-sphere-25-1280x720.png) / [之后](../../artifacts/arena-shared-1.41.2/after-sphere-25-1280x720.png)。开放边不延伸、接合边保留半格；归圆上 / 左青绿，下 / 右金黄，棋子与网格贴合，无裁切或页面溢出。
- 复现：提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-arena-shared-boundaries.cjs`；[专项结果](../../artifacts/arena-shared-1.41.2/results.json)与 16 张截图保存。另以 `ARENA_QA_BASE=7a191cd`、`ARENA_QA_EVIDENCE=.tmp/arena-1.41.2-regression` 运行 `node scripts/qa-arena.cjs`，四种桌面视口的首页、资料与头像、邀请、SSE 落子/随想、2D/3D、暂停/恢复、和棋、复盘、导出和记录管理通过，[回归摘要](../../artifacts/arena-shared-1.41.2/regression-verification.json)保留。
- 255 项测试、资源和文档校验通过；棋手提示未修改。所有检查都在随机端口与临时棋局完成，未连接或重启原服务，也不作为真实模型参赛表现的证据。

## 2026-11-10：三维透视、半透明层次与等价旋转（已确认）

- 从 `dev@1d6a488` 建立独立任务；共享投影、H5 与 Canvas renderer 同步调整。棋盘和棋子一起表现近大远小，正面清晰、背面淡显；二维及目录图案保持原样。视角切换消去整圈，保留最终朝向与中途反向的连续性。
- 曲面填充、深度判断和网格共用精细几何。填充前消去内部共享边，仅将轮廓和折叠边交给 Canvas，避免降低精度造成贴合偏差，也避免重复填充使透明度累加。棋子以圆润体积进行连续局部遮挡，清晰部分与淡显部分共存；裁切碎片合并成外轮廓后统一抗锯齿，避免内部细缝。透视取景按固定包围范围预留棋子空间，旋转时不自动缩放。
- 同状态证据采用 Chromium、DPR 1、固定八手棋谱与帧时钟；桌面 1280×720、移动 H5 390×844。六种曲面覆盖二维、半展开及完整三维，共 72 个实际页面状态；12 组二维像素完全一致，12 次三维可见交点实际点击正确。

| 同一内容 | 修改前 | 修改后 |
| --- | --- | --- |
| 环游，桌面三维 | [基线](../../artifacts/board-perspective/before-game-torus-1-1280x720.png) | [透视与局部遮挡](../../artifacts/board-perspective/after-game-torus-1-1280x720.png) |
| 扭带，桌面三维 | [基线](../../artifacts/board-perspective/before-game-mobius-1-1280x720.png) | [曲面与网格贴合](../../artifacts/board-perspective/after-game-mobius-1-1280x720.png) |
| 六曲面，同一朝向 | [基线](../../artifacts/board-perspective/before-module-gallery-1.png) | [正反面层次](../../artifacts/board-perspective/after-module-gallery-1.png) |
| 六曲面，拖动后朝向 | [基线](../../artifacts/board-perspective/before-module-gallery-1-rotated.png) | [背面与自交结构](../../artifacts/board-perspective/after-module-gallery-1-rotated.png) |

- 轮廓回归逐点比较原始密集三角形覆盖与合并轮廓，包含孔洞、自交、退化面及反向重叠。浏览器再以实际 Canvas 路径核对六曲面三组姿态，共 63,500 个非退化三角形中心，零缺失。单元测试还覆盖三轴整圈旋转、半展开跨越 ±π、命中排除背面以及棋子局部遮挡的连续变化。
- 画布边界回归采用真实绘制圆弧及当前变换，覆盖六曲面 × 5 / 7 / 19 路 × 三种画布尺寸 × 两组朝向，共 108 组。15,660 颗棋子的完整圆面和描边均在画布内，最小留白 15.49px；特别复查了扭带近侧棋子和双生自交处。
- 性能使用 600×600 画布，分别记录绘制调用、强制像素读回和实际动画帧间隔；典型 7 路八子与 19 路满盘分别测量，不以调用耗时代替帧率。[完整结果](../../artifacts/board-perspective/results.json)保存本机测量值；这不是所有设备的帧率保证。未做原生小游戏宿主或真机验收。
- 复现：提供 Playwright 到 `NODE_PATH` 后运行 `node scripts/qa-board-perspective.cjs`；`--module-only` 只更新共享 renderer 图库和性能，`--serve --port=4330` 提供实际游戏，`/before/` 为只读基线。203 项测试、资源与文档校验通过。2026-11-10 用户确认预览并授权合并、推送；共享实现归入 dev，Arena 接收同一修复，游戏版本未变。

## 2026-11-10：轮廓网格连续性与棋子部分遮挡（已确认）

- 复现了拖动时的断续网格、边缘棋子跳变以及整颗棋子统一变淡。深度改为屏幕三角形精确查询；网格略加粗，相近深度优先保留线条。棋子按圆润体积与前方曲面相交，保留清晰区和淡影区，阴影单独处理。
- 用户复测发现环游上沿仍有短虚线：根因是平滑网格路径与绘制曲面的三角面片不重合。网格、边界路径现沿实际面片插值，在所有面片交点分段，避免后方路径反复穿出轮廓。300px 七路环游原先最多出现 14 个小段，现在只有正常的两个前后可见区间。
- 同视口、同内容证据：Chromium / DPR 1；六曲面使用 600×600 画布和固定八子，另外用 300×300 空环游复现用户指出的上沿。

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| 六曲面、相同朝向 | [基线](../../artifacts/board-occlusion/before-six-surfaces.png) | [轮廓与遮挡](../../artifacts/board-occlusion/after-six-surfaces.png) |
| 小画布环游上沿，三组微旋转 | [断续网格](../../artifacts/board-occlusion/before-torus-300-silhouette.png) | [连续网格](../../artifacts/board-occlusion/after-torus-300-silhouette.png) |
| 环游局部棋子 | [基线旋转](../../artifacts/board-occlusion/before-torus-drag-sequence.png) | [同颗棋子的部分遮挡](../../artifacts/board-occlusion/after-torus-partial-stone.png) |
| 双生自交处 | [基线旋转](../../artifacts/board-occlusion/before-projective-drag-sequence.png) | [局部遮挡](../../artifacts/board-occlusion/after-projective-partial-stone.png) |

- 自动检查六种棋子的 126 帧微旋转：单颗棋子同时出现清晰与淡显像素；连续帧无整颗跳变，内部孤立白缝为零。小环游另检查 41 帧旋转，外圈最多两个可见区间、没有短于 5px 的碎岛。几何回归覆盖精确深度、重叠面片、孔洞、T 形接点、局部遮挡、三角面路径和拓扑接缝。
- 性能记录包含真实动画帧与强制读回。八子场景约 16.7ms/帧；19 路满盘的精确局部遮挡仍有明显开销，约 50–83ms/帧，不能据八子结果声称所有盘面都流畅。未进行原生宿主或低性能设备验证。
- 复现：提供 Playwright 到 NODE_PATH 后运行 node scripts/qa-board-occlusion.cjs；--after-only 仅更新修改后证据，--profile 分析满盘耗时。图片与源码摘要、连续性和性能数据见[完整结果](../../artifacts/board-occlusion/results.json)。

## 2026-11-10：曲面相交线与两组边界错峰粘合（已确认）

- 独立任务 `codex/board-intersections` 从 `dev@81b7b0b` 开始，动效对照为上轮预览 `0d6a981`。维持 1.42.0；用户于 2026-11-10 确认完整预览，授权合入 `dev` 并推送。最终渲染提交为 `d9f76ae`，共享 239 项测试、资源与文档校验通过。
- 曲面自交处采用更清楚的暖白亮芯和宽光晕，棋子接触线则保留清晰亮度、适度收敛线宽与光晕，取消深色描边与阴影。轮廓仍来自真实三角面片与圆润棋子体积，遵循遮挡，不把普通接缝或投影重叠画成相交线。
- 边界先向外舒展，再沿较长的弧线收拢。环游先把金黄边卷成筒，再弯曲长轴、粘合青绿边；圆筒沿单弧卷合，扭带逐步完成半扭转。归圆的两个图册分开弯曲闭合，避免中途穿插。瓶界与双生保留本身需要的自交结构。
- 方向箭头跟随真实边界移动，扭转边保留原有虚线；已闭合的一组淡出时，另一组仍可追踪。自动切换为两段动作多留观察时间，手动滑动保持直接跟手，半展开拖动与中途反向连续。
- 归圆额外检查角点和终局展示形变：细分六个全边界三角片，网格插值、路径分段、曲面填充和遮挡共用同一细分。独立三维检测同时区分真实穿越、共面面积重叠和仅沿边相接，避免靠终态特判漏掉几何问题。
- 对比条件：桌面 Chromium、DPR 1、固定八子、600×600 Canvas；粘合序列按从左到右、从上到下排列，进度为 0%、12%、30%、50%、72%、90%、100%。H5 使用相同内容、状态和 1280×720 / 390×844 视口。

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| 六曲面默认姿态 | [上轮预览](../../artifacts/board-seam-motion/before-six-surfaces.png) | [更清楚的相交光线](../../artifacts/board-seam-motion/after-six-surfaces.png) |
| 环游展开 | [上轮预览](../../artifacts/board-seam-motion/before-torus-morph.png) | [先卷筒再成环](../../artifacts/board-seam-motion/after-torus-morph.png) |
| 扭带展开 | [上轮预览](../../artifacts/board-seam-motion/before-mobius-morph.png) | [方向随半扭转移动](../../artifacts/board-seam-motion/after-mobius-morph.png) |
| 归圆展开 | [中途穿插](../../artifacts/board-seam-motion/before-sphere-morph.png) | [分开弯曲、逐步闭合](../../artifacts/board-seam-motion/after-sphere-morph.png) |
| 双生与棋子相交 | [上轮预览](../../artifacts/board-seam-motion/before-projective-stone-contact.png) | [加宽光晕](../../artifacts/board-seam-motion/after-projective-stone-contact.png) |
| H5 双生三维对局 | [上轮预览](../../artifacts/board-seam-motion-h5/before-game-projective-1-1280x720.png) | [结果](../../artifacts/board-seam-motion-h5/after-game-projective-1-1280x720.png) |

- 共享 Canvas 检查 378 个旋转与中间状态、162 个画布边界状态；六类二维棋盘像素不变，归圆以外五类的完整三维棋子位置不变。归圆的六种姿态合计 600 帧中，旧预览 426 帧存在交线，新路线为零；正式独立三维检测另覆盖 72 个归圆状态与 126 个圆筒、环游、扭带状态，均无穿越或共面面积重叠。
- 归圆保留原网格质量门禁：八个面积样点范围由 8.03–14.81 收敛为 11.41–13.83，最大格线转角 0.575→0.583 弧度（门槛 0.65 不变）。600px 曲面采样平均移动 0.142px，最大 9.85px 位于原先折返的角部；七路棋子平均移动 0.48px，规则与命中始终共用修正后的曲面。
- H5 实际页面覆盖 168 个前后状态，12 组二维棋盘像素一致，12 次三维点击落子命中正确；归圆另保存两个视口的全过程截图。共享代码通过 232 项自动测试、包规范校验和文档校验。
- 完整绘制数据、源码摘要、二维一致性、画布边界与性能记录见[共享 Canvas 结果](../../artifacts/board-seam-motion/results.json)；实际页面与三维点击命中见[H5 结果](../../artifacts/board-seam-motion-h5/results.json)。本机普通复杂八子场景约 30–60fps；361 子双生约 83ms/帧（约 12fps），高密度满盘仍有明显开销，不能把八子结果推广到所有盘面。
- 复现共享绘制：`node scripts/qa-board-intersections.cjs --baseline=0d6a981 --out=artifacts/board-seam-motion --seam-motion`。H5：`node scripts/qa-board-perspective.cjs --h5-only --seam-motion --baseline=0d6a981 --out=artifacts/board-seam-motion-h5`。环境需提供 Playwright；桌面浏览器检查不能替代原生宿主或真机验收。

### Arena 观战接入（已确认）

- 独立 `codex/arena-intersections` 从 `arena@b308922` 建立，同状态基线为上轮 Arena 预览 `6937a37`，最终预览为 `75676da`。用户于 2026-11-10 确认并授权合并、推送；整合分支从 `arena@d72ee63` 建立，保留并行的内嵌面板复制修复。维持游戏版本 1.42.0，观战直接复用共享绘制和切换时长，CLI/MCP 与参赛规则不变。
- 隔离八子暂停对局，Chromium / DPR 1、1280×720 与 1024×768，六拓扑共 128 个前后状态；12 组二维像素相同，无页面错误或整页溢出。六拓扑的整圈旋转与中途反转通过，整圈后再展开的最大位置偏差为 0.000194px。
- 归圆在两个视口检查 12%、30%、50%、72%、90%、100% 进度，全部没有自交线；相同基线在两组中段各有四帧穿插。瓶界与双生终态分别保有一条与六条连续分支，其余四种曲面终态没有自交线。333 项测试、资源与文档校验通过。
- 棋局记录由服务端按 `createdAt` 从新到旧排序，同一时间以稳定键排序，重启不改变次序；自动测试包含乱序载入与同时间记录。实际浏览器检查了棋局列表、瓶界完整三维和归圆半展开；重启隔离预览后保留六局暂停棋谱与原链接。用户已确认合并。

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| 双生，1280×720 | [基线](../../artifacts/arena-seam-motion/before-projective-100-1280x720.png) | [暖白相交线](../../artifacts/arena-seam-motion/after-projective-100-1280x720.png) |
| 瓶界，1024×768 | [基线](../../artifacts/arena-seam-motion/before-klein-100-1024x768.png) | [穿插轮廓](../../artifacts/arena-seam-motion/after-klein-100-1024x768.png) |
| 环游半展开，1280×720 | [基线](../../artifacts/arena-seam-motion/before-torus-50-1280x720.png) | [先卷筒再成环](../../artifacts/arena-seam-motion/after-torus-50-1280x720.png) |
| 归圆半展开，1280×720 | [中途穿插](../../artifacts/arena-seam-motion/before-sphere-50-1280x720.png) | [分开闭合](../../artifacts/arena-seam-motion/after-sphere-50-1280x720.png) |

- 36 张同状态截图与[完整结果](../../artifacts/arena-seam-motion/results.json)保存。复现：提供 Playwright 后运行 `node scripts/qa-arena-intersections.cjs --baseline=6937a37 --out=artifacts/arena-seam-motion`；追加 `--serve --port=4321` 启动仅含合成棋局的可操作预览，地址记录在忽略目录 `.arena/intersections-preview/preview-fixtures.json`，再次启动复用已有合成棋局。

### 二维边界四角补齐

- 以上轮预览 `a2f05bd` 为基线。环游、瓶界、双生和归圆的二维辅助线延伸到共同角点，消除切换首帧才补齐半格缺口的跳变。箭头、网格、落点及规则保持原位，圆筒、扭带的开放边与平面不增加彩色外框。
- 同内容、同时间、DPR 1，每块 Canvas 为 480×360；对照图从左到右为归圆、环游、瓶界、双生，上行为二维，下行为动画进度 0.00001：[修改前](../../artifacts/board-corner-rails/before-paired-first-frame.png)、[修改后](../../artifacts/board-corner-rails/after-paired-first-frame.png)。开放边对照：[修改前](../../artifacts/board-corner-rails/before-open-first-frame.png)、[修改后](../../artifacts/board-corner-rails/after-open-first-frame.png)。
- 84 个前后状态覆盖七类拓扑及 5×5、7×6、19×19 棋盘（归圆中间尺寸为 7×7）。新辅助线与动画首帧角点误差小于 0.01px；圆筒、扭带、平面的九组二维画面像素不变，落子命中全部通过。H5 与共享 Canvas 的实际绘制入口均通过端点回归检查；共享 232 项测试、包规范和文档校验通过。
- 对弈室任务预览已刷新，归圆二维四角完整，用户已确认。复现：提供 Playwright 到 NODE_PATH 后运行 `node scripts/qa-board-corner-rails.cjs`。源码摘要和逐状态数据见[完整结果](../../artifacts/board-corner-rails/results.json)。

### 二维与展开首帧一致

- 基线为四角补齐后的 `50fdb3b`。零进度复用二维画面，近零进度直接绘制真实曲面；曲面材质和边缘光从透明渐入，网格墨色、线宽及棋子样式连续接续。网格点随曲面移动后淡出，最近落子标记保留，反向收回时恢复二维画面。
- 归圆的曲面采样在展开初段对齐二维映射的分段位置，消除首末排网格约 1.56px 的首帧偏移。点插值、路径分段、填充与深度检测共用非均匀参数轴，完整三维恢复原采样；没有用切换阈值隐藏几何误差。
- Canvas 对照使用 DPR 1、360×360、固定八子与最近落点，六类曲面各检查空盘和含子盘。从左到右为二维、动画进度 0、0.00000001、0.001、0.01，上排空盘，下排含子：[归圆修改前](../../artifacts/board-first-frame/before-sphere-first-frame.png)、[修改后](../../artifacts/board-first-frame/after-sphere-first-frame.png)；[环游修改前](../../artifacts/board-first-frame/before-torus-first-frame.png)、[修改后](../../artifacts/board-first-frame/after-torus-first-frame.png)。
- 12 组零进度画面与二维严格逐像素相同，原二维画面与基线也全部相同；极近零的网格点、格内材质、最近落点采样区域没有像素差异。48 次反向检查与相同进度的正向画面一致，误差随进度趋零而收敛。正式回归同时覆盖 5/7/19 路、落子命中、方向箭头与非均匀网格的真实面片贴合。
- 复现：提供 Playwright 到 NODE_PATH 后运行 `node scripts/qa-board-first-frame.cjs`；`--after-only` 保留既有基线、只复验当前代码。源码摘要、区域像素误差和正反向记录见[完整结果](../../artifacts/board-first-frame/results.json)。
- 实际 H5 页面另覆盖六曲面、1280×720 / 390×844、空盘／静止棋子／正在落子／按压回弹，共 48 组。原二维与往返二维画面全部逐像素一致；进度 0.0000001 的 42 组无像素差，其余仅 1–8 个像素出现约一级色阶差，最大平均 RGB 差 0.000052/255。旧切换阈值附近的最大平均差从 8.07 降到 0.055 以下。网格路径只精简真正共线的绘制分段，保留深度转折、回折和真实遮挡。
- H5 复现：`node scripts/qa-board-first-frame-h5.cjs`。保留[桌面首步画面](../../artifacts/board-first-frame-h5/after-sphere-first-step-1280x720.png)、[手机首步画面](../../artifacts/board-first-frame-h5/after-sphere-first-step-390x844.png)和[逐状态结果](../../artifacts/board-first-frame-h5/results.json)。此处手机检查针对共享游戏页面，对弈室仍按桌面横屏设计；尚未进行原生宿主真机检查。
- Arena 预览接入同一修复，视图从任意正进度直接进入连续绘制，坐标标签随展开渐隐；不再等到固定阈值整批隐藏。实际浏览器在刷新后检查归圆 1% 进度，交点、棋子与末手标记保持，材质没有突然切换。整合通过 340 项测试、资源与文档校验，用户已确认合并。
