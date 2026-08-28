# 微信小游戏 Agent 开发工作流

本流程把仓库任务 worktree、可复现构建、官方模板同步与微信开发者工具验证串成同一条交付链。它只适用于 `compileType: "game"` 的微信小游戏；宿主和构建边界仍以 [`../platforms/wechat.md`](../platforms/wechat.md) 为准。

Agent 操作微信开发者工具时以当前安装的官方 `wechatide-skill` 为入口，并按它的 `initializer`、`compiler`、`debugger`、`automator` scene 路由。工具名称、参数和权限以已加载 skill 及 `wechatide <toolName> --help` 为准，不能根据旧记忆编造。微信官方参考：[开发者工具 CLI](https://developers.weixin.qq.com/minigame/dev/devtools/cli.html)、[开发者工具 HTTP 接口](https://developers.weixin.qq.com/minigame/dev/devtools/http.html)。

## 固定交付链

```text
任务 worktree
  → 自动检查
  → sync:wechat 内置 fresh build 并同步到官方模板派生目录
  → initializer：门禁、登录、开项目窗口
  → compiler：simulator_refresh
  → debugger：官方模拟器截图与 console
  → automator：按截图像素坐标操作小游戏画布
  → 同视口、同状态证据
  → 用户明确确认
```

不得跳过同步后直接验证旧包，也不得把开发者工具目标目录当作源码反向修改。用户确认前停在任务分支/worktree，不合回长期 `wechat` 分支。

## 1. 在任务 worktree 完成源码与自动检查

开始时先运行 `git status --short --branch` 与 `git worktree list`，确认当前位于从 `wechat` 建立的独立任务 worktree，并保护其他 worktree 的未提交改动。长期源码只改 `app/assets/`、`wechat/` 及本任务对应的测试和文档。

交给开发者工具前运行：

```powershell
npm run prepare:wechat-agent
```

该入口先执行共享检查，再调用 `sync:wechat`。同步脚本会先完成一次 fresh build，再把该次产物同步到目标，因此这里不额外调用 `build:wechat`，避免对同一源码无意义地连续构建两次。需要单独检查构建产物时仍可运行 `build:wechat`。默认目标固定为：

```text
%USERPROFILE%\Documents\Codex\miniprograms\topology-gomoku
```

它在 Newton 的开发机上解析为用户指定的官方模板目录。目标目录只接受 `sync:wechat` 更新：不得手工修改清单托管文件，不得把其中内容复制回源码；AppID、`project.config.json`、`project.private.config.json` 与未托管本地文件继续由同步脚本保护。

## 2. initializer：完成会话门禁并打开项目

本机调用 `wechatide` 必须在可访问桌面的非沙箱环境中进行；同一会话固定使用 `clientName = Codex`。仓库业务工作流只调用已注册到 PATH、可直接解析的 `wechatide` 命令。安装诊断即使返回安装目录中的绝对入口，也只把它当作诊断信息；不得为业务调用改用 Windows 8.3 短路径或直接执行安装目录内的 `wechatide.cmd`。PATH 尚未就绪时停在 installer/CLI 路径修复步骤，修复后重新从 PATH 门禁开始。

1. 若是 skill 首次安装/导入，先按官方 skill 的安装诊断通过后再调用业务工具。日常会话不要无故重复安装检查。
2. 本会话首次业务调用前，用当前 `wechatide-skill/SKILL.md` frontmatter 的版本执行一次 `check_wechatide_status`。如果 status 或 `wechatide auth` 返回 `pending + taskId`，说明 client 授权尚未完成；先提醒用户在开发者工具内确认，再按 auth 阻塞任务每 10 秒用原 taskId 调用 `wechatide -c Codex polling_task_result --task-id <taskId>`，最多 10 次。只有旧任务返回 `success` 后才重新执行一次 status 取得最终门禁结果，pending 期间不得重发 status/auth。
3. 按 `versionRelation` 恢复或继续：
   - `skip_check`：从当前已加载的 `wechatide-skill/SKILL.md` frontmatter 顶层读取版本，补传 `--skill-version` 后重查；不得把 `skip_check` 当作就绪。
   - `agent_behind`：只从 status 返回的 `skillPath` 把整个 skill 目录单向导入 Agent skills 目录，不只改版本号，也不反向写入微信开发者工具安装目录；完成后重载 skill 或新开会话，再用新加载的 frontmatter 版本重查 status。
   - `equal` 或 `agent_ahead`：仅在 `loginExpired: false` 且 `tokenRequired` 已按官方 skill 处理后继续；`agent_ahead` 需记录兼容性风险。
4. `loginExpired: true` 时进入 `login`；扫码成功前不能声称已登录。`tokenRequired: true` 时只复用 Agent 私有存储中已有 token，缺失时向用户索取“设置 → 安全”中的 CLI 访问令牌；token 不得写入仓库、日志或 QA 证据。
5. 以绝对路径打开同步后的目标目录。需要截图和 console 时使用 `fullMode`；只看模拟器时可用 `liteMode`。`open_project_window` 返回 `reuse` 只表示工具尝试复用已有窗口，不能替代可见模拟器确认；若随后 `simulator_screenshot` 报“项目窗口不存在”，允许用相同项目和窗口模式重试一次 `open_project_window`。重试后仍失败则记录 blocker 并停止，不进入无差别开窗循环。

初始化后的 scene 移交至少保留：

| 字段 | 内容 |
| --- | --- |
| `nextScene` | `compiler` |
| `project` | 已解析的官方模板目标绝对路径 |
| `confirmed` | PATH 中的 `wechatide` 可用、`versionRelation`、登录态、token 是否已处理、项目窗口已打开 |
| `blocker` | 版本、登录、token、项目配置等未决项；无则省略 |
| `pendingTask` | 如存在，记录 taskId、原工具和非敏感参数摘要；不得记录 token |

后续 scene 复用这份上下文，不重复状态检查或无故重新开窗。

## 3. compiler：只刷新小游戏模拟器

同步完成且项目窗口打开后调用 `simulator_refresh`。成功只表示刷新已触发，不代表编译或运行时已经通过；随后必须交给 debugger 取证。

这是小游戏项目，禁止使用以下小程序页面路线：

- `compile_wxml`、`compile_wxss`；
- `simulator_open_page` 跳转页面；
- 把单文件编译成功当作整包通过。

小游戏需要 npm 构建时才按项目类型显式调用 `build_npm`，不得把它当作每次调试的默认步骤。

## 4. debugger：采集最小官方证据集

刷新后用 `simulator_screenshot` 截取模拟器画面；小游戏没有 WXML selector，因此截图不使用 `waitForSelector`。涉及顶部布局时截图必须保留完整宿主胶囊，不能裁成仅有 Canvas 内容的证据。同时至少检查一次错误日志：

```text
get_simulator_console --command "grep -i error"
```

需要完整上下文时使用 `grep -n .`。空结果只表示没有匹配行，不等于 console 系统为空。发生异常时保留截图、关键日志、复现步骤和 `issueClass`，不要连续无差别刷新；网络问题才按需读取 network。

若 `automation_game_action`、`automation_evaluate` 的返回状态与当前可见模拟器或随后截图不一致，归类为 `automation-mismatch`：丢弃不一致截图，不把工具返回的 `success` 冒充界面通过，也不写入长期证据。允许先重新绑定可见项目窗口并刷新一次，再按“可见状态 → 官方截图”顺序复核；仍不一致时记录 blocker。为构造结算或复盘状态而做的运行时注入只能用于临时诊断，验收后必须恢复原有 storage 并刷新，不能把注入返回值当作视觉证据。

用于长期视觉验收的截图写入任务 worktree 下的 `artifacts/ui-parity/`，文件名包含平台、状态、视口和版本，例如：

```text
artifacts/ui-parity/after-wechat-native-home-390x844-v2.png
```

## 5. automator：只按画布或截图坐标交互

小游戏自动化固定执行：

1. 先用 `simulator_screenshot` 看清目标并记录返回的 `imageWidth`、`imageHeight`；
2. 用 `automation_game_action` 执行 `tap`、`swipe` 或 `touch*`；
3. 坐标来自截图时使用 `coordinateSpace=image`，并原样传入同一张截图返回的宽高；Agent 不自行换算比例；
4. 操作后再次截图，记录 pass/fail 和关键坐标；无反馈时先核对坐标空间，再移交 debugger 查 console。

小游戏禁止使用：

- `automation_navigate`；
- `automation_element_action` 与任何 selector；
- `automation_page_action`、page data、页面栈；
- `automation_runtime_info`、`automation_generate_script`；
- WXML/WXSS 等待条件。

等待只使用 `automation_game_action` 支持的可选 `wait`。需执行运行时表达式时只能使用不依赖 Page/WXML 的 `automation_evaluate`；该工具只用于诊断，不构成视觉证据，也不能用返回对象、状态字符串或内部标志代替截图。小游戏的视觉状态必须与当前可见模拟器交叉核对，并最终以操作后、且与可见窗口一致的 `simulator_screenshot` 作为平台视觉证据。

## 6. 同视口视觉证据与用户确认

每个用户可见 UI 变更至少覆盖首页、对局、设置和结算/复盘中的受影响状态。H5 基线与微信模拟器证据必须保持：

- 相同逻辑视口和设备方向；
- 相同关卡、棋局、解锁进度和设置值；
- 相同交互阶段，例如静止、按下、拖动、释放或结算；
- 可复现的仓库相对路径。

证据索引和结论更新到 [`../design/qa.md`](../design/qa.md)。浏览器 Canvas 预览可用于快速迭代，但不能替代 `simulator_screenshot` 形成的平台证据。只有自动检查、官方模拟器运行、console、关键交互和同视口视觉对比都完成后，才把预览交给用户；用户明确确认前不得合并。

## 异步任务、授权与发布边界

任何工具返回 `pending + taskId` 时，当前步骤尚未成功：

- `login`、`wechatide auth`，以及 status 调用派生出的 auth pending 会阻塞全部后续步骤；先提醒用户在开发者工具内扫码/授权，再每 10 秒调用 `wechatide -c Codex polling_task_result --task-id <taskId>` 查询原任务，最多 10 次，只有 `success` 才继续。status 派生授权成功后还需重新检查一次 status。
- 其他 pending 不主动轮询。保留 `pendingTask`，用户继续时先查询旧 taskId；状态未明前不得重发可能有副作用的操作。
- `failed`、`cancelled`、`expired` 都不能冒充成功；按官方 skill 的恢复规则处理。

本工作流只授权本地构建、同步、模拟器刷新、只读截图/日志和画布自动化。不得调用 `auto_preview`、`create_preview_qrcode`、`upload`，不得推送手机预览、生成二维码或发布体验版，除非用户对该具体动作另行明确授权。即使后来获得授权，也应切换到官方 `previewer` scene，不能把发布动作混入本地 UI 验收流程。

## 完成交接清单

- 任务分支/worktree 与变更范围已确认；
- `npm run prepare:wechat-agent` 通过，`sync:wechat` 已完成一次 fresh build 并把最新包同步到固定官方模板目录；
- PATH 注册的 `wechatide` 可用；WeChatIDE 版本、登录、token 门禁通过，项目窗口打开的是同步目标；
- `simulator_refresh` 已触发，官方截图和 console 证据已采集；
- 小游戏交互只使用 `automation_game_action` 的画布/截图坐标；
- `automation_evaluate` 结果只作诊断，所有视觉结论均已与可见模拟器截图交叉核对；
- 同视口、同状态对比已写入 `artifacts/ui-parity/` 与 `docs/design/qa.md`；
- 未上传、未发布、未推送手机预览；
- 已向用户展示结果并等待明确确认，尚未提前合并。
