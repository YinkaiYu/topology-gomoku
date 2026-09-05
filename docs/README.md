# 文档导航

本目录保存跨任务、可长期维护的产品与工程文档。根目录只保留项目入口和协作治理文件，具体设计、开发环境与仓库流程统一从这里进入。

## 根目录入口

| 文件 | 用途 |
| --- | --- |
| [`README.md`](../README.md) | 产品介绍、当前平台状态和参与入口 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 面向贡献者的完整交付流程与验证矩阵 |
| [`AGENTS.md`](../AGENTS.md) | Agent 必须遵守的仓库级硬约束 |

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [共享运行时边界](development/architecture.md) | 关卡、对局控制、连续视角与原生棋盘绘制的权威源码 |
| [`development/repository.md`](development/repository.md) | 分支职责、worktree、预览门禁、提升与发布流 |
| [`development/pr-review.md`](development/pr-review.md) | PR 接收、证据化审查、复审、接手修复、贡献署名与收尾 |
| [`development/environment.md`](development/environment.md) | Node、PowerShell、uv、Python 字体工具与依赖维护 |
| [`development/documentation.md`](development/documentation.md) | 文档信息归属、变更触发矩阵与自动门禁 |
| [`development/merging.md`](development/merging.md) | 维护者合并方向、冲突分类、平台整合验证与安全清理 |
| [`development/release.md`](development/release.md) | 维护者专属的 `dev → main → 五渠道` 与统一版本流程 |
| [`development/web.md`](development/web.md) | 个人网站静态构建、子路径预览与部署流程 |
| [`development/zhihu.md`](development/zhihu.md) | 知乎 AI Works、CloudBase 静态输入、iframe 验证与发布流程 |

## 发布说明

- [`releases/1.39.0.md`](releases/1.39.0.md)：连续棋盘视角、液态控件与 PR 协作规范；核心验证和渠道门禁。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [`design/visual-language.md`](design/visual-language.md) | 简约、典雅、克制的整体气质与统一液态玻璃语言 |
| [`design/shared-transitions.md`](design/shared-transitions.md) | 液态玻璃共享元素转场的分层、生命周期与动效基线 |
| [`design/qa.md`](design/qa.md) | 同视口视觉验收、证据索引和记录模板 |

## 平台规范

- 小红书小工具：已发布 H5 与完全离线 ZIP；执行入口为 [`.codex/SKILL.md`](../.codex/SKILL.md)，具体约束位于 `.codex/references/`。
- Bilibili Toy：已发布专属 adapter 与多设备适配；平台规范随 `bilibili` 分支的 `docs/platforms/bilibili.md` 和 `docs/platforms/bilibili-responsive-guide.md` 维护，并以官方 Toy 约束和仓库安装的 `toy` skill 为准。
- 微信小游戏：已发布原生单 Canvas 版本；平台规范随 `wechat` 分支的 `docs/platforms/wechat.md` 维护，构建、同步与 WeChatIDE 验收流程见该分支的 `docs/development/wechat-agent-workflow.md`。
- 个人网站：使用 `web` 发行分支与 `npm run build:web`，固定部署目录及双视口验收见 [`development/web.md`](development/web.md)。
- 知乎 AI Works：使用 `zhihu` 发行分支与 `$zhihu-ai-works-deploy-helper`，CloudBase 静态输入和 iframe 验收见 [`development/zhihu.md`](development/zhihu.md)。

根文档只记录全平台共享状态与入口。宿主 API、构建、模拟器、真机和发布约束继续保留在对应发行分支，不能因为已有渠道已经发布而跳过每一版本的平台复验。

## 维护规则

- 原则、架构和操作流程写入 `docs/`；单次实现细节留在提交和 Pull Request。
- QA 文档只保留当前方法、有效证据和必要回归基线，不累积逐次调参日志。
- 所有仓库内引用使用相对路径；不记录本机绝对路径、临时附件路径或不可复现资源。
- 文档移动或重命名时，在同一提交中更新所有引用并检查链接目标存在。
