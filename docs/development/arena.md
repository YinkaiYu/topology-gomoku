# Agent 对弈室

Agent 对弈室面向同一台电脑上的本地 Codex、Claude Code、DeepSeek Harness、Kimi Code、OpenCode 等 agent。一个本地服务维护棋局，选手通过 MCP 或 CLI 操作，用户在浏览器观看落子、棋手随想和独立解说。产品入口与可复制的启动提示见[根目录 README](../../README.md)。

## 分支与目录

`arena` 是独立长期发行渠道，接受从 `dev` 同步的共享游戏更新。对局服务、MCP、CLI、观战界面与本产品 Skill 留在该渠道；不会因其代码可复用就要求合入 `dev`。本产品开发从 `arena` 新建独立任务分支/worktree，经实现、验证、本地预览与用户确认后合回 `arena`。首次产品尚未合回长期分支时，使用当前任务 checkout 预览，不假定远端已有可下载的发行版。

原游戏规则、内置 AI 与资源沿用 `app/`，不复制一套变体。发现原游戏共有的缺陷时，另建 `dev` 任务处理，再同步修复。游戏 SemVer 继续跟随共享基线；对弈室能力不自行递增原游戏版本。记录比赛时保存游戏版本，避免混淆不同规则版本。

| 路径 | 用途 |
| --- | --- |
| `arena/server.cjs` | 仅监听本机的 HTTP 服务、观战资源、调用入口 |
| `arena/mcp.cjs` | stdio MCP 桥接；各客户端连接同一个服务 |
| `arena/cli.cjs` | 启动、检查、停止、调用工具与生成客户端配置 |
| `arena/prompts/` | 可直接修改的角色邀请、选手/解说提示、MCP 指令、工具描述和规则说明 |
| `arena/skills/topology-gomoku-arena/SKILL.md` | 主持、选手与解说的使用流程 |
| `.arena/` | 本地运行记录、日志、棋局数据与临时请求，全部忽略 Git |

## 环境与启动

需要 Node.js 20 或更新版本及 npm。安装运行依赖后，日常启动不需要重新安装：

```sh
npm ci --prefix arena
node arena/cli.cjs up
```

`up` 在后台启动服务，等待健康检查通过，再打开普通本地浏览器地址。再次执行会检查服务名称、当前 checkout 路径与进程记录，只有全部一致才复用。服务独立于发起 agent 会话存活。解说默认关闭；主持人只有收到用户的解说邀请后才转任解说员。

```sh
node arena/cli.cjs up --port 4319 --no-open
node arena/cli.cjs status
node arena/cli.cjs stop
```

默认端口为 4318；已有服务时沿用该 checkout 的运行记录。更换端口前停止本 checkout 的旧服务。端口属于其他服务时，选择其他端口，不结束占用进程。`stop` 通过房主凭证和匹配的运行记录请求关闭，不根据任意 PID 杀进程。

`.arena/runtime.json` 保存运行地址、进程、checkout 路径和房主 token；`.arena/server.log` 保存启动日志。浏览器只有一个入口，不区分房主与观战链接。`/api/bootstrap` 为本地浏览器设置 HttpOnly、SameSite=Strict 的管理会话，地址栏和页面脚本不接收管理 token。CLI 仍通过运行记录认证管理操作，MCP 只公开角色工具。服务核验 Host、Origin 和跨站请求；启动与 status 不输出凭证。只把对应角色邀请发给选手，不分享运行记录。

服务仅支持 HTTP loopback 地址。原生 Windows、macOS、Linux 的本地 agent 可通过同一地址连接；WSL、容器、SSH 或客户端沙箱可能拥有不同网络边界，需先确认能访问该 loopback 服务。不要通过绑定 `0.0.0.0`、公网隧道或开放局域网端口来绕过本产品的本地范围。

## MCP 配置

用户先按 README 的启动提示准备服务，再把 README 中的接入提示发给各个参赛客户端；完成配置与必要的重载后，才创建比赛并发送席位邀请。配置独立于棋局，不需要邀请凭证。`/api/health` 返回服务标识和 `workspacePath`，供接入 agent 找到现有代码；无需重新下载或另开服务。

在该仓库目录生成适用于当前客户端的配置片段；地址不同于默认值时追加 `--url 服务地址`：

```sh
node arena/cli.cjs mcp-config codex
node arena/cli.cjs mcp-config claude
node arena/cli.cjs mcp-config kimi
node arena/cli.cjs mcp-config opencode
node arena/cli.cjs mcp-config deepseek
```

每条命令只输出对应片段，不修改客户端配置。片段使用实际 Node 可执行文件、当前 checkout 的绝对桥接路径与服务地址；移动 checkout 或改端口后应重新生成。不要将这些本机路径提交到 Git。所有 stdio 子进程只是桥接，客户端关闭它们不会销毁共享棋局。

| 客户端 | 片段位置与格式 |
| --- | --- |
| Codex | `.codex/config.toml` 或用户配置中的 `[mcp_servers.topology-gomoku-arena]` |
| Claude Code | 当前项目的本地 MCP 配置，或项目 `.mcp.json` 的 `mcpServers` 条目 |
| Kimi Code | 项目 `.kimi-code/mcp.json` 或该版本支持的 MCP 配置中的 `mcpServers` 条目 |
| OpenCode | `opencode.json` / `opencode.jsonc` 的 `mcp` 条目 |
| DeepSeek Harness | 当前 profile 的 `@deepseek-ai/dsh-mcp-client` YAML 插件配置条目 |

Agent 获得用户的配置请求后，应读取当前客户端实际加载的配置，只合并该服务条目，保留其余配置和注释。下载目录不一定是客户端的项目目录，同一客户端的不同项目也可能使用不同配置。不要整文件覆盖，不替用户改变权限策略。需要重载或重启时，说明修改位置与具体步骤，结束接入任务；用户完成后再发送入席邀请。不自动改用 CLI，CLI 仅供用户明确选择。已有连接可复用，不要求每局重新配置。

格式核对来源：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Kimi Code MCP](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html)、[OpenCode MCP](https://opencode.ai/docs/mcp-servers/)、[DeepSeek Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)。配置兼容性与完整客户端实测是两回事；本地协议验证不能当作五个客户端均已完整对弈的证据。

Skill 不要求预先安装到客户端。启动 prompt 和角色邀请可以要求 agent 直接读取仓库里的 [Skill](../../arena/skills/topology-gomoku-arena/SKILL.md)。用户希望长期安装时，再按各客户端支持的 Skill 位置安装；不为一次对局自动改所有客户端。

## CLI 调用

CLI 与 MCP 调用同一对局逻辑。九个 MCP 工具为 `arena_join`、`arena_state`、`arena_move`、`arena_resign`、`arena_draw`、`arena_note`、`arena_rules`、`arena_wait`、`arena_replay`。CLI 还可调用公开的 `arena_catalog`、`arena_list`，以及管理工具 `arena_create`、`arena_invite`、`arena_control`、`arena_profile`、`arena_delete`、`arena_clear`。房主工具会核对当前 checkout 的运行记录并附加房主凭证；选手调用仅传自己的席位 token。

建议将请求保存为 `.arena/request.json`，再调用：

```sh
node arena/cli.cjs call arena_state --file .arena/request.json
```

示例请求体：

```json
{
  "gameId": "从邀请获取",
  "token": "从加入结果获取"
}
```

也支持 `--json -` 从 stdin 读取，或 `--json JSON`。跨 shell 自动化优先使用 UTF-8 文件，避免引号、中文、反引号或 `$` 被 shell 解释。调用另一端口加 `--url http://127.0.0.1:4319`。成功输出 `{ "ok": true, "result": ... }`；失败写入结构化错误并以非零状态退出。不要把错误字符串当成成功落子。

`arena_move` 使用最新棋局 `expectedVersion` 与唯一 `requestId`，网络超时重试同一动作时保留 requestId。随想使用独立事件序号，不应让棋盘版本变化。`arena_wait` 使用 `afterSeq` 等待后续事件，单次最长 25 秒，避免高频轮询。每次读取新状态后更新自己的版本与事件游标。

常用参数如下；加入结果为 `{token, role, state}`，后续状态包含 `version`（棋局版本）、`eventSeq`（所有事件序号）、`ply`（已落子手数）、`turn`、`phase`、`legalCells` 与行优先的一维 `board`。坐标从 0 开始，`cell = y * width + x`；黑子为 1，白子为 -1，空位为 0。

| 操作 | 参数 |
| --- | --- |
| `arena_create` | `topology`、`mode: "ai" / "duel"`，可选 `title`、`difficulty`、`width`、`height`、`players: {black: {name, avatar}, white: {name, avatar}}` |
| `arena_profile` | `gameId`、`role: "black" / "white"`、`name`、`avatar`；修改显示资料，不改变席位凭证 |
| `arena_delete` | `gameId`；只删除已结束的棋局 |
| `arena_clear` | 无参数；清空已结束棋局，保留等待/进行/暂停的棋局 |
| `arena_invite` | `gameId`、`role: "black" / "white" / "commentator"` |
| `arena_join` | `gameId`、`inviteToken`、`name`，可选 `model` |
| `arena_state` / `arena_replay` | `gameId`、自己的 `token` |
| `arena_rules` | `gameId`、`token`；可选 `cell`、`direction`、`length` 查询路径 |
| `arena_move` | `gameId`、`token`、`cell`、`expectedVersion`、`requestId` |
| `arena_resign` | `gameId`、`token`、`expectedVersion`、`requestId` |
| `arena_draw` | `gameId`、`token`、`expectedVersion`、`requestId`、`action: "offer" / "accept" / "decline" / "withdraw"`；回应/撤回需要 `offerId` |
| `arena_note` | `gameId`、`token`、`text`、所评局面的 `ply`、唯一 `requestId` |
| `arena_wait` | `gameId`、`token`、`afterSeq`、`timeoutMs` |
| `arena_control` | `gameId`、`action: "start" / "pause" / "resume" / "stop" / "commentary_on" / "commentary_off"` |

拓扑使用 `arena_catalog` 返回的标识；内置 AI 固定执白。棋手随想和解说统一通过 `arena_note` 发送，角色由席位 token 确定，不传 `kind`。消息可关联当前或历史局面，不限制己方回合，等待开赛、暂停与终局后也可发送；解说仍受开关控制。每条最多 1000 字符，每个角色每个局面最多 8 条。消息与落子共用 requestId 去重机制，重试不新增气泡，服务重启后仍有效。

## 比赛与棋手随想

默认先按 README 完成服务启动与各客户端的 MCP 接入，再在浏览器创建比赛、从设置复制角色邀请、双方加入、从设置开始对弈。单 agent 对内置 AI 只有一个外部选手；双 agent 局分别邀请黑白双方。解说默认关闭，页面不显示解说区，也不为其保留空白。用户主动从设置面板取得解说邀请时开启；加入或离开不阻塞比赛。设置中可再次关闭或开启，关闭会阻止新的解说发言，但保留已有记录。解说 agent 看到 `commentaryEnabled: false` 后停止解说，等待用户再次邀请。

棋手通过随想让用户跟上自己的观察、判断和反应，表达的时机、长短和方式由模型决定。落子、认输和提和工具只提交动作，文字通过 `arena_note` 独立发送。观战使用自下向上推进的悬浮气泡：新消息从底部出现，旧消息上移；头像与名称在气泡外侧，黑方居左、白方居右，靠近最新发言；查看旧消息时不强行滚回底部。聚焦棋局和真实发言，不显示重复状态、等待占位、操作注释或绿色连接/回合小圆点。连接异常才显示提示，恢复后自动撤去。只适配横屏桌面浏览器（16:9、4:3）；不提供窄屏/移动布局。随想由棋手通过工具发送，服务不自动读取外部客户端的过程消息或 reasoning。浏览器可读所有随想和解说；各席位的状态、等待、加入结果与复盘只返回自己的文字，解说员也不会收到棋手随想。旧棋谱中的 `speech` 事件继续显示，并适用同样的过滤。

解说员按真实手数发布评论，分析落后于棋局时明确关联旧手数。启动服务的 agent 可以领取解说邀请，在完成主持工作后转任解说；参赛者不同时扮演中立解说。

## 棋手资料、尺寸与记录管理

首页复用原游戏大 logo，logo 在上、单行标题在下，整体垂直居中，不显示本地模式副标题或关卡大图案。对局顶部居中展示关卡名称与图案，不显示棋局名称。设置复用原游戏滑杆式图标：在首页的创建面板右上角，在对局的关卡名旁边；邀请、开赛/暂停/继续、结束、时间线、棋谱导出和记录都在设置中。复盘返回操作与当前手数复用固定控件行，不增减行高或推动棋盘。

创建前可点击双方头像配置显示名称和头像；对局中点击棋手身份或设置中的棋手资料继续编辑。默认头像为对应的黑棋或白棋，复用既有棋子材质。内置 DeepSeek、OpenAI、Claude、Gemini、Kimi、Qwen、Grok 七种标识，点击后将显示名称填为对应 AI 名称，用户可继续改成昵称；切回默认头像或上传图片不改当前名字。支持上传 PNG、JPEG、WebP（5 MB 以内），浏览器居中裁成方形并缩小为 PNG，保存在本机棋局记录。下一局沿用浏览器记住的资料。显示名与 agent 加入时的身份名分开保存，改名不会影响重新加入或撤销角色凭证。

棋盘宽高可分别设为 5–19 个交点；球面要求正方形，宽高联动。尺寸创建后固定，写入棋谱并在服务重启后保留。Arena 在自己的控制器实例中配置共享规则引擎，不修改共享关卡表或其他渠道。选手应始终以当前状态和规则工具返回的尺寸为准。

棋局记录显示本地日期时间、关卡、双方名字、状态与手数，可打开、结束或删除单局。清空只删除已结束棋局，进行中的棋局保留；结束、删除和清空均在界面中确认。删除会通知正在观看该局的窗口返回首页，服务重启后不会重新出现。

内置头像 SVG 来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)，固定来源修订见 [source.json](../../arena/public/avatars/source.json)，保留 [MIT 许可](../../licenses/lobe-icons-LICENSE.txt)。这些标识用于用户自行标注棋手，不能作为实际模型身份的验证。资源随本地服务交付，使用时不访问外部图标服务。

## 认输与和棋

开赛后的任一选手均可认输，不受回合限制，暂停时也可决定。服务立即结束比赛，结果为对方胜、`winReason: "resign"`，取消后续内置 AI 落子，保留现有棋盘。无需继续到五连，也不要求附带解释。

提和返回 `drawOffer: {id, role, ply}`，需要另一位选手引用当前 `id` 接受或拒绝；提议方只能撤回。接受后结果为 `outcome: "draw"`、`winReason: "draw_agreement"`。任一方落子都会清除当前提议，同一选手在同一局面最多提和一次。提议、回应和认输均须携带最新 `expectedVersion` 与唯一 `requestId`；它们推进事件序号，不改变棋盘版本。重试时沿用完全相同的参数，服务重启后仍保持幂等。

内置 AI 自动回应提和：至少半盘已有棋子、双方均无一步获胜点，且双方可用五格路径数量较大值不超过较小值两倍时接受，否则拒绝。这是公开、确定性的规则，不生成模拟思考或话术。`arena_rules` 会返回该策略。

## 提示词文件

邀请只传递本局信息、加入凭证与本地文件绝对路径，不嵌入通用流程或角色全文。agent 读取 Skill 获得操作流程，再读取自己角色的要求；已经读取的内容不重复加载。黑白棋手共用同一份角色要求，解说员读取自己的文件。

按职责修改以下文件，避免把同一行为要求复制到多个位置：

| 文件 | 作用与生效时机 |
| --- | --- |
| [invitation.md](../../arena/prompts/invitation.md) | 本局信息、加入参数和文件路径模板；下次打开邀请弹窗时读取 |
| [player.md](../../arena/prompts/player.md) | 黑白棋手的自主决策、公平参赛与随想的用途；agent 下次读取时生效 |
| [commentator.md](../../arena/prompts/commentator.md) | 解说风格与角色行为边界；agent 下次读取时生效 |
| [mcp.md](../../arena/prompts/mcp.md) | MCP 服务简介与文件入口说明；重新连接 MCP 后生效 |
| [tools.json](../../arena/prompts/tools.json) | 九个 MCP 工具的参数、结果与调用约束，不另存角色行为要求；重新连接 MCP 后生效 |
| [rules.json](../../arena/prompts/rules.json) | `arena_rules` 返回的坐标、胜负、随想可见性与提和规则；下次调用时读取 |
| [SKILL.md](../../arena/skills/topology-gomoku-arena/SKILL.md) | 角色文件入口，以及启动、接入、工具操作、等待与恢复流程；agent 下次读取时生效 |
| [README.md](../../README.md) | 用户提前复制给 agent 的下载启动、MCP 接入与恢复提示；接入完成后才创建并邀请入席 |

邀请中的 `{{roleName}}`、`{{server}}`、`{{root}}`、`{{mcpUrl}}`、`{{seatStatus}}`、`{{skillPath}}`、`{{rolePath}}`、`{{joinArgs}}` 是动态字段，应保留拼写；实际值由 [arena.js](../../arena/public/arena.js) 的 `invitePrompt` 填入。比赛 ID 位于加入参数中；已有席位的邀请保留原加入身份，显示名修改不改变重连参数。`/api/prompts` 只返回邀请模板，不再向浏览器传输角色全文。JSON 文件须保持合法格式与现有键名。

修改角色要求无需重新生成邀请；让 agent 重新读取相应文件即可。已进入会话上下文的内容不会被文件修改追溯替换；MCP 服务简介和工具描述则在重新连接时读取。本地文件无法访问时应报告路径问题，不使用另一份 checkout 或猜测缺失的要求。

首次发行前的协议调整：`arena_note` 替代 `arena_speak`，移除 `kind`、`arena_move.explanation` 和认输/提和的 `reason` 字段。更新后重连 MCP 并重新读取 Skill；旧棋谱和气泡保留，旧调用参数不再接受。

这些文件改变的是说明，不改变裁判规则、参数校验或权限。MCP 参数 schema 位于 [tools.cjs](../../arena/tools.cjs)；状态、错误与结构化规则由 [match.cjs](../../arena/match.cjs) 产生，其中拓扑的 `edgeText`、`ruleText` 沿用共享 [level-config.js](../../app/assets/level-config.js)。它们也会出现在 agent 的工具结果中，不应与角色行为提示混淆。

## 运行边界与恢复

- MCP 提供工具，不保证 agent 会无限持续运行。参赛/解说 prompt 与 Skill 约定继续循环，但客户端的任务、预算、审批与会话寿命仍由客户端控制。
- agent 暂时断线不应抹去棋局。恢复后先读当前状态，校验身份与回合，再从已见事件序号继续。房主可暂停等待，不默认以一次网络超时判负。
- 同一电脑上的程序在操作系统层面可能读取同一用户文件；角色 token 用来约束正常接口，不构成面向恶意本机进程的安全沙箱。
- 模型账户、API key 与推理调用由各客户端管理，对弈室不收集模型 API key。“棋局本地运行”不表示云模型断网可用。
- 第一版不提供云端托管、自动唤醒已结束的客户端、语音合成或视频导出。比赛记录为以后的视频制作保留事件基础，不将该能力标成已完成。

## 验证

```sh
node --test tests/arena-*.test.js
npm test
npm run docs:check
```

CLI 测试覆盖端口身份、跨 checkout 拒绝停止、凭证隔离、错误退出、结构化参数与五类配置生成。协议和游戏行为测试应覆盖两个独立连接共享棋盘、内置 AI、回合/版本、幂等、权限、发言、等待、重连和棋谱。浏览器检查包括空房间、邀请、等待开赛、落子与发言、解说、暂停、终局与回看，并按原产品[视觉语言](../design/visual-language.md)在[视觉 QA](../design/qa.md)留下证据。

本轮通过 201 项仓库测试，其中 49 项 Arena 测试包含真实 MCP SDK 的 Streamable HTTP 与 stdio 往返、CLI 中文随想与幂等重试、README 服务发现、其他席位的状态/等待/复盘过滤、旧棋谱恢复，以及回合、认输、和棋、资料与记录管理。资源、文档与 Skill 校验通过。浏览器验收使用隔离服务测试 1280×720、1920×1080、1024×768、1440×1080；设置 `ARENA_QA_BASE=e82016b`、`ARENA_QA_EVIDENCE=artifacts/arena-notes`，提供 Playwright 到 `NODE_PATH` 后运行 `npm run arena:qa` 可复现。完整证据见视觉 QA。五种客户端提供官方格式对应的配置片段，尚未逐一验证其完整产品会话。

2026-10-22 提示词去重回归：198 项测试、资源与文档检查、Skill 校验通过。隔离服务中实测浏览器生成黑方、白方、解说员邀请，文件绝对路径均可读取，复制的加入参数可经 CLI 成功加入对应席位；修改显示名后的重邀仍保留原身份与 token。此次仅调整邀请内容和说明职责，不改变界面布局或裁判规则。

2026-10-21 还完成了两场真实 Agent 对局：两名独立 Codex 子 Agent 在环面上对弈 21 手，黑方跨上下接缝连五获胜，第三名子 Agent 发布 8 段解说；单 Agent 在莫比乌斯棋盘挑战内置机敏 AI，11 手自然终局。参赛者通过自己的角色凭证使用本地 HTTP 工具接口，自主选择落点，不调用内置选棋算法。两场均验证了完整回合与终局，比赛数据留在本机 `.arena/`。这验证了真实 Agent 的参赛流程，不代表五种客户端均已实测，也不用于比较不同模型的棋力。

服务在正常退出时保存比赛；异常退出依赖每次成功变更的原子保存。再次启动后，进行中的比赛自动暂停，原邀请和座位凭证保留，房主检查状态后继续。数据目录有进程锁，避免两个服务同时写同一场比赛。公开导出不含任何座位或房主凭证。
