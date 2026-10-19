# 知乎 AI Works 发行

知乎渠道使用长期 `zhihu` 分支，与 `xiaohongshu`、`bilibili`、`wechat`、`web` 同级。它只从稳定 `main` 接收共享版本，保留 CloudBase 交付输入、iframe 宿主验证和发布记录；游戏 SemVer 与其他渠道完全一致。

## 交付边界

- 使用已安装的 `$zhihu-ai-works-deploy-helper`，并以 Skill 当前协议、生成器和 schema 为交付依据。每次准备前先执行 Skill 自带的更新检查。
- 当前项目把 `app/` 作为 build-free 静态项目根。不要把仓库根 `package.json` 或 PowerShell 小红书构建脚本误识别成 CloudBase 的 Node 构建输入。
- 静态交付包含 `_tmp/deploy-plan.json`、`_tmp/frontend.deploy.json` 和 `app.zip`。Skill 1.2.0 还会生成前端埋点桥接、票据物化脚本及仅含 `build:track` 的构建 manifest；这些只在隔离的 `app/` 交付副本中生成，不写回共享游戏源码，不构成 Node 后端。不得生成 `backend.deploy.json`、`cloudbaserc.json`、`scf_bootstrap` 或后端运行时文件。
- 在隔离交付副本的 HTML 根节点声明 `data-host-platform="zhihu"` 后再从头探测；共享外壳也识别 `aiworks.site` 域名，覆盖知乎用顶层 WebView 打开游戏的情况，避免误用小红书顶部预留。验证同时覆盖 iframe 与顶层页面。
- `_tmp/` 与 `app.zip` 是本地交付产物，不提交 Git。Skill 只准备可上传 ZIP，不创建或修改 CloudBase 资源，也不执行知乎发布。
- 知乎 AI Works 支持部署的项目需要可以被 iframe 内嵌。任何有效的 `frame-ancestors`、`X-Frame-Options`、frameguard 或 JS 防内嵌命中都是硬门禁，必须按 Skill 的授权与复检流程处理，不能带阻断继续打包。

## 准备流程

1. 从长期 `zhihu` 建立 `codex/release-zhihu-X.Y.Z` 任务分支与 worktree，再合入本轮稳定 `MAIN_SHA`。确认 `package.json` 的游戏版本与 `main` 一致，不为知乎适配单独提升 SemVer。
2. 运行 `npm run check`，确认共享 H5、字体覆盖、资源路径和文档门禁通过。
3. 要求 Agent 使用 `$zhihu-ai-works-deploy-helper` 对本轮 `app/` 从头探测。为隔离 Skill 的埋点注入，先复制最新的 `app/` 为交付副本，再对副本完整执行探测、生成和校验，不复用原目录的旧计划。计划必须是 `frontend-static`、`DeliveryMode: static-files`、入口 `index.html`，且没有 error finding 或 `E_IFRAME_EMBEDDING_FORBIDDEN`。
4. 仅在计划非 blocked 后生成前端描述符、执行完整输出校验并创建项目 ZIP。确认 ZIP CRC、排除项和唯一目录前缀检查通过。
5. 本地以静态服务器打开 `app/`，至少检查一个桌面视口和一个移动视口；另用跨源 iframe 页面复核首页、设置、关卡进入、落子和本地进度。宿主内最终表现仍需在知乎 AI Works 预览中复验。
6. 交付 `app/app.zip` 供平台上传，并明确记录“只完成交付准备，尚未部署”。用户确认本地与宿主预览后，才把任务分支合入长期 `zhihu` 并继续平台发布。

项目源码、manifest、路由或生成文件发生变化后，旧计划、描述符和 ZIP 全部失效，必须删除已确认属于 Skill 的旧产物并从探测重新开始。

## 发布记录

### 1.40.0 固定首页交付与上线（2026-10-20）

- 基线 `main@53d0bdb`，共享修复 `4457bd2`；高度不足时使用横向关卡卡片，两行文字整体居中，首页和对局不开放页面滚动。共享布局与 Web 构建保持一致。
- `npm run check`：127 项测试、H5 与文档校验通过。修正了旧预览分支测试文件遗留的冲突标记；旧 Skill 产物移至任务临时目录保留，不再混入源码验证。
- Skill 更新检查为 `current`（1.2.0）；从干净 `app/` 复制隔离输入、标记知乎平台并重新探测，计划 `frontend-static / static-files`，无阻断项；事件桥、描述符与 ZIP CRC 校验通过，共 35 个文件。
- 交付 `release/topology-gomoku-zhihu-v1.40.0-fixed-home.zip`，SHA-256 `97DDDE1FE01C7CF780FF3F239B89ACFDF49D673C06BDB54AE490AB3A6FA507FF`。用户已明确确认手动上传并上线；本次状态来自用户确认。Agent 未创建云资源。代码已经稳定 `main@776de09` 同步到发行分支。

```text
统一版本：
MAIN_SHA：
zhihu 整合前提交 / 整合提交：
Skill 版本 / 更新检查：
计划类型 / Findings：
描述符校验：
ZIP 路径 / SHA-256 / CRC：
桌面 / 移动 / 跨源 iframe 预览：
知乎 AI Works 宿主预览：
用户确认：
线上地址与检查：
已知限制：
```

## 最新上传记录（2026-10-20）

- 用户确认已手动上传 1.41.1；交付包哈希、验证与证据边界见[发行记录](../releases/1.41.1.md)。此次反馈只证明上传完成，尚未独立核实最新线上版本，不能沿用下面的历史核验结果证明 1.41.1 上线。

## 1.40.0 线上核验（2026-10-20）

- 用户确认已手动上传 1.40.0 ZIP。独立访问[作品页](https://www.zhihu.com/project/detail/180488)，页面标明“可运行 V 1.40.0”，内嵌应用呈现新版两行左对齐标题且旧口号已移除。
- 本轮已确认 1.40.0 上线；证据及交付校验见[发行记录](../releases/1.40.0.md)。这次网页检查不替代 Android/iOS 真机验收。
- Agent 只准备交付包并核查公开页面，没有操作 CloudBase 资源或代为上传。

## 历史上线记录（2026-09-19）

- 上线状态：维护者确认已成功上线，项目地址为 [知乎 AI Works 项目](https://www.zhihu.com/project/detail/180488)。
- 证据边界：本次未独立完成线上页面、移动端或宿主 iframe 验收；成功上线不用于推断上传包的具体版本。
- 原准备任务交付版本：`1.38.0`，来源 `main@917d59b`；Skill v1.1.2，静态描述符、ZIP CRC、桌面和 390×844 跨源 iframe 本地预览通过。
- 留存包：长期知乎工作区的 `release/topology-gomoku-zhihu-v1.38.0.zip`，1,307,228 字节；SHA-256：`ECBED9B06ADBEF4A5ABCFEBBA1F92FECA1508D3569F685777C155679B306D7A8`。
- 当时 Git 发行基线：`1.39.0`，`5ea0b8d`（`zhihu-v1.39.0`）；该标签不证明线上运行此版本。
- 交付边界：准备任务未创建云资源或执行平台发布；此次依据维护者反馈登记上线结果。
- 原准备任务临时分支与 worktree 已清理；留存 ZIP 不提交 Git。其他任务的预览工作区不属于此次清理范围。
- 后续版本仍须从新源码重新生成输入与 ZIP，并完成宿主验收。
