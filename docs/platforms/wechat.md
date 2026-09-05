# 微信小游戏原生适配

微信发行版是 `compileType: "game"` 的微信小游戏，不是把 H5 放进 WebView。它保留共享拓扑规则、关卡、进度语义、程序化棋盘美术与视觉 token，只在平台边界使用微信原生 Canvas、触摸、生命周期、存储、字体和音频能力。

## 源码、构建与预览边界

| 路径 | 职责 | 是否为源码 |
| --- | --- | --- |
| `app/assets/` | 共享拓扑、AI、关卡、controller、复盘、曲面与棋盘美术的权威来源 | 是，进入 `dev` |
| `wechat/` | 微信小游戏入口、宿主 adapter、原生场景外壳与平台配置 | 是，进入 `wechat` |
| `dist/wechat/` | 从以上两处生成、带哈希清单的临时包 | 否，不提交 |
| `%USERPROFILE%\Documents\Codex\miniprograms\topology-gomoku` | 微信官方小游戏模板派生的开发者工具生成/预览目录 | 否，不反向开发 |

共享模块边界见 [`../development/architecture.md`](../development/architecture.md)。`wechat/game.js` 按依赖顺序加载构建生成的 `js/shared/`，再启动 `wechat/js/main.js`。宿主能力集中在 `wechat/js/platform/`，原生控件和场景绘制集中在 `wechat/js/ui/`；拓扑规则、AI 和进度语义不得散落进这些平台文件。

视觉上继续遵守 [`../design/visual-language.md`](../design/visual-language.md)：同一套比例、留白、字体层级、颜色、液态玻璃、接缝轨道、棋子和曲面表达，不为“平台感”改写核心玩法或另造美术方言。

## 连续视角原生边界

连续视角使用共享 `board-view-logic.js`、`liquid-range.js` 的纯计算部分与 `board-view-motion.js`，不在微信外壳重新定义二分切换状态。原生场景仅负责画布命中、触摸捕获、旋转阻尼和材质绘制。

- 滑块两端复用二维网格与三维圆柱图标，均为上图下字、无独立玻璃底板；与下方动作共用三列锚点和行距。
- 边界引导隐藏视角控件但保留整行占位；进入、教学、对局和终局不因按钮数量改变棋盘大小。
- 轨道点击只启动共享滑行；直接按住玻璃体才鼓起，并把透射轨道收窄。取消、失焦和前后台切换释放手势，不留下 AI 或落子的忙碌锁。
- 三维短点击按实际投影命中交点；旋转拖动、长按和按下时尚未解锁的手势不落子。终局保存最后实际绘制的姿态，复盘沿用当前连续视角。

`tests/wechat-continuous-view.test.js` 直接执行原生 Main 触摸处理和 SceneRenderer 布局，覆盖三种视口、占位、三列对齐、滑轨/玻璃体区分和按下资格。它不证明微信宿主上的视觉或真实触摸已通过。

Agent 的开发者工具操作统一遵循 [`../development/wechat-agent-workflow.md`](../development/wechat-agent-workflow.md)：以官方 `wechatide-skill` 分场景完成状态门禁、开窗、小游戏模拟器刷新、官方截图/日志和画布坐标自动化，不把小程序 selector/WXML/WXSS 路线误用于小游戏。

## 已核验的宿主约束

- 小游戏运行环境不是浏览器；平台不会自动提供完整 DOM/BOM。入口与 adapter 不依赖 `document`、`window`、Web Storage 或 WebView。参见微信官方的[小游戏运行环境](https://developers.weixin.qq.com/minigame/dev/guide/runtime/adapter.html)与[开发入门](https://developers.weixin.qq.com/minigame/dev/guide/develop/develop.html)。
- 首次调用 [`wx.createCanvas()`](https://developers.weixin.qq.com/minigame/dev/api/render/canvas/wx.createCanvas.html) 得到上屏 Canvas，后续调用才是离屏 Canvas；因此显示画布必须在任何辅助画布之前创建。当前版本保持单一显示 Canvas，由场景 renderer 统一绘制。
- 视口优先读取 [`wx.getWindowInfo()`](https://developers.weixin.qq.com/minigame/dev/api/base/system/wx.getWindowInfo.html)，用 `pixelRatio` 设置物理像素，并把触摸映射回逻辑坐标。手机视口最高使用 3×，大视口按每张全尺寸 Canvas 3,750,000 物理像素预算平滑降低倍率，避免主画布、设置快照和转场快照叠加放大内存。Canvas 的 `shadowBlur`、阴影偏移与 `filter: blur()` 在微信运行时按物理像素计算，原生 renderer 必须用当前倍率补偿逻辑半径；3× 图鉴资产保留权威 SVG 的原始宽高比，不能先强制成方形再二次 `contain`。
- 顶部布局同时避让 `safeArea` 与 [`wx.getMenuButtonBoundingClientRect()`](https://developers.weixin.qq.com/minigame/dev/api/ui/menu/wx.getMenuButtonBoundingClientRect.html) 返回的胶囊实际矩形。有效胶囊必须满足 `0 < top < bottom <= viewportHeight`；有有效矩形时基础 `topInset = max(68, menu.bottom + 22)`，无有效矩形时保守回退为 `max(68, safeTop + clamp(24, 3.6vh, 32) + 22)`。22 个逻辑像素是留给品牌图形呼吸/旋转和顶栏控件的视觉缓冲，不能在 API 可用时用设备型号估算替代实际 `menu.bottom`；低基础库兼容只收敛在 adapter 内。
- 输入使用 [`wx.onTouchStart`](https://developers.weixin.qq.com/minigame/dev/api/device/touch-event/wx.onTouchStart.html)、[`wx.onTouchMove`](https://developers.weixin.qq.com/minigame/dev/api/device/touch-event/wx.onTouchMove.html) 和 [`wx.onTouchEnd`](https://developers.weixin.qq.com/minigame/dev/api/device/touch-event/wx.onTouchEnd.html)，统一处理点击、拖动棋盘提示、设置控件和曲面旋转。
- [`wx.onHide`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.onHide.html) 时暂停共享 controller、帧循环和音频，[`wx.onShow`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.onShow.html) 时重新测量并恢复。AI、教学和自动切关使用逻辑截止时间，不能在后台继续推进。
- 偏好和进度通过 [`wx.setStorageSync`](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorageSync.html) 持久化；只保存小型版本化 JSON，不在每帧或拖动过程中同步写入。
- 字体只从代码包本地 TTF 路径通过 [`wx.loadFont`](https://developers.weixin.qq.com/minigame/dev/api/render/font/wx.loadFont.html) 加载；加载失败必须保留可读的回退，而不是假定某台设备一定有苹方等系统字体。`npm run fonts:subset:wechat` 同时扫描 `app/` 与 `wechat/`，生成与 H5 WOFF2 隔离的 400/600/700 TTF 子集。Canvas 文案同样受仓库字体覆盖测试约束；字体文件内容变化由构建清单 SHA-256 管理，不借用 H5 URL 缓存键，也不触发平台单独升版。
- 程序化提示音优先使用 [`wx.createWebAudioContext`](https://developers.weixin.qq.com/minigame/dev/api/media/audio/wx.createWebAudioContext.html)；不可用时静默降级，不能因此阻断对局。音频启动、前后台恢复和静音开关必须在真机检查。
- `project.config.json` 以微信官方[项目配置文件](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)为准。仓库仅提供可复现的小游戏配置基线；本地 AppID 与开发者私有配置由预览目录持有，不进入同步托管范围。

## 构建与同步

日常实现先运行源包校验；交付前运行完整共享检查和微信构建：

```powershell
npm run prepare:wechat-agent
```

- `validate:wechat` 检查必需入口、JSON、路径大小写、离线约束与平台配置。
- `check:wechat` 运行共享测试、H5 校验、文档检查，再生成并验证微信包。
- `build:wechat` 只替换带有有效旧清单、哈希未被修改且不含未托管文件的 `dist/wechat/`，再从 `app/assets/` 注入权威共享脚本、256px 平台图标与三个本地字体字重，逐文件校验 SHA-256 并写入 `.topology-gomoku-manifest.json`。
- `sync:wechat` 为避免陈旧产物会再次执行全新构建，然后更新默认预览目录 `%USERPROFILE%\Documents\Codex\miniprograms\topology-gomoku`。因此“构建后同步”是固定流程，不能用手工复制替代。
- `prepare:wechat-agent` 执行共享检查后调用 `sync:wechat`；后者内部先做一次 fresh build 再同步，因此不会为同一源码重复构建。它是进入官方 WeChatIDE skill 场景链的统一仓库入口；单项命令仍可用于局部诊断。

首次同步只接受脚本精确识别的微信官方示例小游戏模板，并用拓扑五子棋托管文件替换飞机示例。后续同步依据上一次清单增删托管文件；若目标中的托管文件被手工修改，会拒绝覆盖并报告冲突。同步始终保护：

- `project.config.json`，包括本地 AppID 和开发者工具设置；
- `project.private.config.json`；
- 未进入托管清单的本地文件。

需要另一处官方模板作为预览目录时显式指定，而不是修改脚本默认值：

```powershell
npm run sync:wechat -- -TargetRoot D:\path\to\wechat-game-preview
```

预览目录不是 Git 权威源。任何应该长期保留的修复都先回到任务 worktree 中正确的 `app/assets/` 或 `wechat/`，通过构建和同步重新生成。

共享回流尚待预览确认时，可用 `build-wechat.ps1` / `sync-wechat.ps1` 的 `-SharedAssetsRoot` 指向独立共享任务的 `app/assets`，以验证两侧候选契约；这不是发行同步，也不能绕过 `dev → main → wechat`。此时清单仍使用平台候选自己的版本，正式发行必须在接收稳定 `main` 后不带覆盖参数重新构建、同步和验证。

浏览器原生校准入口 `tools/wechat-native-preview/server.cjs` 支持 `TOPOLOGY_PREVIEW_PORT` 与同义的 `TOPOLOGY_SHARED_ASSETS` 路径覆盖，预览通过原生 Main 处理指针输入。它只是开发校准工具，不接入微信存储、声音和生命周期，也不替代官方模拟器。

## 开发者工具验收

同步成功后，在微信开发者工具中以“小游戏”打开预览目录。Agent 只通过 PATH 注册的 `wechatide` 命令使用官方 skill，不以 Windows 8.3 短路径或安装目录绝对入口执行任何业务工具；随后按 `initializer → compiler → debugger → automator` 链路验收。小游戏交互只用截图/画布坐标，不用 selector、页面导航、page data 或 WXML/WXSS 单文件编译。至少完成以下模拟器检查，并把版本、基础库、设备档位和结果写入任务 QA/PR：

- 项目以 `compileType: "game"` 启动，无模块、资源、网络或运行时错误；飞机示例资源已被托管清单替换。
- 首屏只使用一个上屏 Canvas；胶囊、安全区、刘海和不同宽高比下没有遮挡或裁切。顶部证据必须包含完整宿主胶囊与首个内容层，记录实际 `menu.bottom`、`topInset` 和视觉缓冲；只截取 Canvas 内容不能证明通过。
- 七关入口、锁定状态、教学、落子、边界演示、AI、悔棋、胜负/封锁/和棋、复盘、曲面拖动和下一关路径可完成。
- 触摸点击与拖动不串手势；棋盘边缘、滑块、开关、设置浮层和曲面旋转的按下/移动/释放反馈一致。
- 切后台后 AI、教学和自动切关不偷跑；回前台尺寸、帧循环和声音正确恢复。
- 重新编译或重启后，偏好与解锁进度恢复；当前对局沿用既有产品语义，不做跨启动持久化。离线和断网条件下完整可玩。
- 字体 400/600/700 字重、中文标点、Canvas 文案与程序化提示音无明显缺失或回退异常。
- 用与 H5 基线相同的视口、内容和交互状态保存视觉对比证据，并记录到 [`../design/qa.md`](../design/qa.md)。

本地 UI 验收不包含发布权限：未经用户对具体动作另行明确授权，不调用手机自动预览、预览二维码或上传体验版。

## 真机验收

模拟器通过不等于平台完成。平台任务至少记录一台目标真机；发布前应尽量各覆盖一台 iOS 与 Android 设备。无法获得真机时，把这一项明确标记为未完成，不能写成已验证。

- 首次启动、冷启动、长时间前后台切换与锁屏恢复；
- 高 DPR、全面屏、刘海/灵动岛类安全区和胶囊避让；记录实际 `menu.bottom`、计算后的 `topInset` 与可见分隔，不能把模拟器结论冒充真机结论；
- 连续快速落子、棋盘边缘命中、设置拖动和三维曲面长拖；
- 字体实际加载、音频首次解锁、静音、系统打断与恢复；
- 至少完整通关一局，并检查持久化、发热、帧率、内存和异常日志；
- 断网启动与全流程离线运行。

## 版本与发布边界

微信原生 adapter、构建脚本、开发者工具配置或宿主兼容修复不修改游戏 SemVer。`dist/wechat/` 的清单继承当前 `package.json` 版本；只有维护者把稳定核心沿 `dev → main` 提升时确定新版本，再由同一个 `main` 与同一个 SemVer 同步到三个发行分支。微信要求的构建号或审核批次可以单独记录，但不得改写游戏版本。
