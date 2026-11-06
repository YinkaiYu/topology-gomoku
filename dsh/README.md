# arena · DeepSeek Harness 插件

这是 arena 仓库自带的 DSH（DeepSeek Harness）接入层：把本地对弈室的对局工具注册成原生工具，并在 DSH 里提供一个**内嵌观战面板**。其他客户端仍然走 MCP，两边服务同一个 `arena/server.cjs`。

## 它做什么

- **对局工具**：启动时（以及 `arena_service refresh` 时）读取本机服务的 `POST /mcp` → `tools/list`，把服务端当前的工具按同样的名字、说明、参数注册成 DSH 原生工具。上游加工具、改参数，这里自动跟上。
- **主持工具**：`arena_host` 开局并生成可转发的邀请；`arena_service` 查看 / 启动 / 停止 / 刷新 / 打开服务。
- **席位绑定**：`arena_join` 之后 `gameId`、席位 token、`ply`、`requestId` 都由插件补全，模型不用反复传；凭证只写在本机 `~/.dsh/topology-gomoku-arena/seats.json`。
- **内嵌观战**：侧栏“对弈室”打开的是服务端的 `?embed=1` 页面，也就是浏览器里的同一个渲染器、同一条 SSE。DSH 不复制棋盘实现。
- **不做**：不生成随想、不镜像棋盘、不改写棋局数据。随想仍然由棋手按 `arena/prompts/player.md` 自己发。

## 安装

```text
plugin_manager install_bundle  target: <本目录的绝对路径>
```

插件在 `<仓库>/dsh` 下，`repoPath` 默认取它所在的 checkout，所以不需要在本机路径上做配置；只有想指向另一份 checkout 时才在 profile 的 patch 里覆盖 `repoPath`。

配置项（`cordis.patch.yml`，也可在 profile patch 里覆盖）：

```yaml
config:
  port: 4318            # 本地服务端口
  repoPath: ...          # 可选，默认是本插件所在的 checkout
  nodePath: ...          # 可选，默认自动探测
  autoStart: true        # 服务未运行时由工具调用自动拉起
```

依赖：`<仓库>/arena/node_modules` 已安装（`npm ci --prefix arena`）。

## 观战面板

- 侧栏图标“对弈室” → 主区面板，iframe 指向 `http://127.0.0.1:<port>/?game=<gameId>&embed=1`。
- 面板每 5 秒刷新一次棋局目录；棋局切换、刷新和“在浏览器打开”都在面板头部。
- 嵌入页隐藏了开局页、设置、棋手资料和邀请/结束入口；棋盘、棋钟、随想、解说、二维/三维、复盘都保留。
- 服务端只为带 `embed` 的请求放开 `frame-ancestors http://127.0.0.1:* http://localhost:* dsh-app:`；`dsh-app:` 是 DSH 桌面外壳的文档来源，普通浏览器里的 `dsh-app` 之外来源仍然不可嵌入。
- 桌面外壳对 loopback 算跨站，因此服务只对 `embed` 页面导航放行 `Sec-Fetch-Site: cross-site`；观战页自己的 API 请求同源，其他页面的跨站 API 调用仍被拒。

## 更新上游

`arena` 改了工具名、参数或说明时，插件不需要改代码：重启服务后再调用一次 `arena_service { "action": "refresh" }` 即可。只有宿主侧操作（`arena_catalog` / `arena_create` / `arena_invite` / `arena_control` / `arena_delete` / `arena_list`）或观战嵌入协议变了，才需要动这里。

## 与 MCP 并存

MCP 客户端（Codex、Claude Code 等）继续用 `/mcp` 接入，不受影响。DSH profile 里如果同时启用了旧的 MCP 行，会看到两份同名能力（`mcp__topology-gomoku-arena__*` 与原生 `arena_*`），建议在原生插件可用后停用那条 MCP 行——它只影响 DSH 自己。

## 结构

```text
dsh/
  package.json       # bundle + dsh.client 声明
  cordis.patch.yml   # 默认行配置
  host.js            # Host 半：服务桥、工具镜像、主持工具、面板数据路由
  client.js          # 浏览器半：侧栏入口 + 主区内嵌观战面板
  locale/            # 插件标题与描述
  icon.svg
```
