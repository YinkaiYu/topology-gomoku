# 知乎 AI Works 发行

知乎渠道使用长期 `zhihu` 分支，与 `xiaohongshu`、`bilibili`、`wechat`、`web` 同级。它只从稳定 `main` 接收共享版本，保留 CloudBase 交付输入、iframe 宿主验证和发布记录；游戏 SemVer 与其他渠道完全一致。

## 交付边界

- 使用已安装的 `$zhihu-ai-works-deploy-helper`，并以 Skill 当前协议、生成器和 schema 为交付依据。每次准备前先执行 Skill 自带的更新检查。
- 当前项目把 `app/` 作为 build-free 静态项目根。不要把仓库根 `package.json` 或 PowerShell 小红书构建脚本误识别成 CloudBase 的 Node 构建输入。
- 静态交付只生成 `app/_tmp/deploy-plan.json`、`app/_tmp/frontend.deploy.json` 和 `app/app.zip`；不得生成 `backend.deploy.json`、`cloudbaserc.json`、`scf_bootstrap` 或后端运行时文件。
- `_tmp/` 与 `app.zip` 是本地交付产物，不提交 Git。Skill 只准备可上传 ZIP，不创建或修改 CloudBase 资源，也不执行知乎发布。
- 知乎 AI Works 支持部署的项目需要可以被 iframe 内嵌。任何有效的 `frame-ancestors`、`X-Frame-Options`、frameguard 或 JS 防内嵌命中都是硬门禁，必须按 Skill 的授权与复检流程处理，不能带阻断继续打包。

## 准备流程

1. 从长期 `zhihu` 建立 `codex/release-zhihu-X.Y.Z` 任务分支与 worktree，再合入本轮稳定 `MAIN_SHA`。确认 `package.json` 的游戏版本与 `main` 一致，不为知乎适配单独提升 SemVer。
2. 运行 `npm run check`，确认共享 H5、字体覆盖、资源路径和文档门禁通过。
3. 要求 Agent 使用 `$zhihu-ai-works-deploy-helper` 对 `app/` 从头探测。计划必须是 `frontend-static`、`DeliveryMode: static-files`、入口 `index.html`，且没有 error finding 或 `E_IFRAME_EMBEDDING_FORBIDDEN`。
4. 仅在计划非 blocked 后生成前端描述符、执行完整输出校验并创建项目 ZIP。确认 ZIP CRC、排除项和唯一目录前缀检查通过。
5. 本地以静态服务器打开 `app/`，至少检查一个桌面视口和一个移动视口；另用跨源 iframe 页面复核首页、设置、关卡进入、落子和本地进度。宿主内最终表现仍需在知乎 AI Works 预览中复验。
6. 交付 `app/app.zip` 供平台上传，并明确记录“只完成交付准备，尚未部署”。用户确认本地与宿主预览后，才把任务分支合入长期 `zhihu` 并继续平台发布。

项目源码、manifest、路由或生成文件发生变化后，旧计划、描述符和 ZIP 全部失效，必须删除已确认属于 Skill 的旧产物并从探测重新开始。

## 发布记录

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
