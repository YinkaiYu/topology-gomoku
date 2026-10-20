# 跨平台运行时边界

Arena 独立渠道在 `arena/` 包装本节的共享规则与 controller，增加本地权威棋局、角色凭证、持久化事件、MCP/CLI 和浏览器观战；不修改其他发行版的入口。其分支例外、单人首关适配和角色信息边界见 [arena.md](arena.md)。

本项目保留一套拓扑规则、关卡内容和程序化棋盘美术，再由各平台 adapter 接入宿主。平台适配不得通过复制后改写规则或视觉常量形成第二套游戏。

## 当前源码层次

`app/` 仍是可直接运行的小红书 H5 基线。下列经典脚本不依赖 DOM、Web Storage 或任一平台 API，也是原生平台构建时的共享源码：

| 模块 | 职责 |
| --- | --- |
| `app/assets/topology.js` | 七种拓扑步进、胜利掩码、提示、封锁判定与 AI |
| `app/assets/topology-morph.js` | 二维到三维曲面的参数化、投影与接缝几何 |
| `app/assets/game-replay.js` | 按手数重建棋盘与复盘文案 |
| `app/assets/board-view-logic.js` | 松手落子资格、投影命中、连续视角和终局姿态计算 |
| `app/assets/board-view-motion.js` | 原生 controller 的连续进度、滑行、终局和输入互斥状态 |
| `app/assets/level-config.js` | 七关尺寸、教学路径、难度和固定节奏 |
| `app/assets/game-controller.js` | 无宿主计时器的对局、教学、AI / 离线双人、悔棋、复盘与进度状态机 |
| `app/assets/board-art.js` | Canvas 2D 棋盘、接缝轨道、棋子、提示与三维曲面绘制 |

共享模块使用 UMD 形式：浏览器通过全局对象加载，Node 测试通过 CommonJS 加载，原生平台构建可原样复制后由入口按依赖顺序执行。共享层禁止访问 `document`、`localStorage`、`wx` 或其他宿主对象。

`liquid-range.js` 另提供共享的纯计算 `duration` / `glide`，用于两种渲染方式的距离感知滑行。它的 `bind` 是 H5 DOM 适配入口，原生平台不调用；材质绘制仍由各自渲染边界承担。

H5 外壳默认保留小红书小工具上方宿主栏所需的顶部留白。`host-layout.js` 在首屏绘制前识别 iframe、Bilibili Toy、知乎 `aiworks.site` 域名，以及根节点显式声明的 `data-host-platform="web"` / `"zhihu"`，应用仅保留安全区的紧凑布局。Web 构建在生成入口中声明平台；知乎顶层 WebView 不依赖 iframe 判断。宽而矮的窗口在 560px 以上宽度时收窄并居中，窄屏使用完整可用宽度。Bilibili adapter 的 `toycontainerchange` 事件重新应用同一判断。

棋盘 Canvas 绝对定位填充面板，不参与 Grid 固有尺寸计算，避免 WebKit 在 Flex 压缩面板后仍保留旧画布高度而裁切底部。绘图读取未受转场缩放影响的 `clientWidth/clientHeight`，通过 `ResizeObserver` 同步元素尺寸变化，保留 window/visualViewport resize 作为补充。面板允许纵向收缩，网格按实际画布尺寸等比居中，不能通过禁用收缩把操作行推到窗口外。

H5 的网格尺寸由共享 `board-art.js#computeLayout` 计算。默认边距随面板短边连续变化：矮面板最低 22px，仍容纳最大 15px 边界轨道偏移与 4.5px 箭头；短边约 360px 起恢复原有比例。显式传入的边距配置继续生效。紧凑宿主高度不超过 600px 时，行间距从 10px 收到 6px，触摸区域与教学/复盘占位不缩小。知乎、Toy 与 Web 均消费同一份布局规则。

H5 当前已直接读取共享关卡内容；现有页面状态与成熟的 DOM 动效仍保留在 `app/assets/game.js`，作为分阶段迁移期间的稳定基线。新增平台必须使用共享 controller 与 board art，不得从这份 H5 外壳复制一套状态机。共享模块的关键行为由 `tests/shared-game-controller.test.js` 与既有拓扑、曲面、复盘测试共同约束。

这些内容、controller 与 Canvas 美术模块由微信基线提交 `1a325fe` 回流至共享开发任务，再补齐连续视角能力。H5 已复用关卡定义、交互资格和姿态计算，但尚未整体改为共享 controller / board art；不能把此次回流表述为已经消除所有历史渲染重复。

## 连续视角契约

- `view.progress` 是当前实际进度，`target` 只是目标；重新抓取、终局和复盘不能用目标值或二维/三维二分状态代替实际进度。
- adapter 用 `setViewScrubbing` 标记手势，用 `setViewProgress` 更新目标。取消、失焦、离开时必须释放手势；共享 controller 在滑行、拖动滑块和自动终局期间暂停落子及 AI 调度。
- 空白滑轨点击只滑行；直接按住玻璃体才挤压折射。材质状态不改变上述落子权限。
- 终局记录最后显示的旋转与晃动、实际进度和展示姿态；渲染器在绘制后保存 `displayedOrientation`。不得用下一帧时钟重算上一帧的起点。
- 投影命中使用实际曲面坐标；按下时没有落子资格的手势，即使松手前 AI 解锁，也不能落子。拖动和长按旋转不应意外落子。
- 在引导隐藏视角控件时仍保留布局占位；二维 / 上一步 / 旅程与三维 / 下一步 / 下一关分别共用列锚点，行距一致。

`tests/shared-continuous-view.test.js` 覆盖六曲面、五档进度的所有交点首帧连续性、重新抓取、AI 延迟、取消与后台暂停。H5 的实际外壳连续性由 `tests/board-view-continuity.test.js` 单独约束；平台仍须验证真实输入、材质和宿主生命周期，不能用纯函数测试替代模拟器或真机验收。

## Adapter 职责

平台 adapter 只负责宿主边界：

- 创建显示画布、测量视口与安全区；
- 把平台输入转换为统一逻辑坐标；
- 提供帧循环、前后台暂停与恢复；
- 读写偏好和通关进度；
- 播放共享事件定义的音效提示；
- 加载内嵌字体与已授权资源；
- 绘制平台原生场景外壳，并把棋盘区域交给 `board-art.js`。

controller 自身不调用宿主定时器。AI、教学续播和自动切关以逻辑截止时间排队；adapter 在每帧调用 `tick()`，并在前后台切换时调用 `pause()` / `resume()`，从而避免后台时间导致回到前台立即跳步。

对局状态的 `mode` 取 `ai` 或 `duel`，缺省为 `ai`。adapter 用 `startLevel(index, { mode: "duel" })` 进入双人局。`duel` 沿用 `HUMAN`（黑方）与 `AI`（白方）棋子值，黑方先行，每次合法落子后切换回合；`AI` 在此仅表示白子，不代表电脑对手。共享 controller 的 `performMove` 可省略玩家参数以使用当前回合；输入 adapter 应在按下时保存棋局、手数和执棋方，松手时核对未变化并传入该棋色，避免双指或过期手势跨回合落子。

双人局不自动教学，不排队或执行 AI 调度；主动边界教学保留 `mode`、棋盘、历史与回合，教学中仍按黑子指引练习，结束后恢复原局。悔棋撤回最后一手，重开清盘并恢复黑方先行，切换下一关保留模式。双方以现有拓扑五连掩码获胜，满盘无五连为和局；单人专有的封锁 / 无可胜路径通关不在双人局触发。`outcome` 为 `win` 或 `draw`，`winner` 为获胜棋色或 `null`。胜局和和局保留旅程完成与解锁逻辑，但不写入 `bestDifficulty`。首关终局不自动跳关，保留复盘和再来。

`tests/offline-duel-controller.test.js` 对七种拓扑分别执行黑胜和白胜棋谱，并验证满盘和局、无 AI 调用、非法输入、悔棋、暂停和教学往返；`tests/h5-duel.test.js` 直接执行 H5 外壳函数，约束回合文案、终局工具、设置、预览棋色及手势。平台验收仍须在共享版本经 `dev → main` 同步后完成，不能把共享层测试等同于各宿主已离线验收。

## 变更规则

双人首页直接展示并允许选择全部七关，不以 `preferences.unlocked` 限制入口；切回单人后恢复其进度锁定与图鉴显示。切换模式和进入关卡本身不修改存档。共享 controller 的 `selectLevel(index, time, { mode: "duel" })` 同样跳过进度锁定，仍检查关卡范围；平台 adapter 的卡片展示与命中判断应遵循此契约。

- 拓扑、AI、教学、进度语义、棋盘美术或 adapter 契约的通用变化从 `dev` 建任务实现，并补确定性测试。
- 平台分支只保留真实宿主差异；不得直接修改共享模块的生成副本。
- 原生构建必须从上述权威源复制共享文件，并校验清单或哈希，不能手工双向同步。
- 若宿主不支持某种资源格式，可在构建期生成平台派生物；源素材、字体覆盖和视觉 token 仍以共享仓库内容为准。
