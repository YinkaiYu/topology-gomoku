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
| [`development/repository.md`](development/repository.md) | 分支职责、worktree、预览门禁、提升与发布流 |
| [`development/environment.md`](development/environment.md) | Node、PowerShell、uv、Python 字体工具与依赖维护 |
| [`development/documentation.md`](development/documentation.md) | 文档信息归属、变更触发矩阵与自动门禁 |
| [`development/merging.md`](development/merging.md) | 维护者合并方向、冲突分类、平台整合验证与安全清理 |
| [`development/release.md`](development/release.md) | 维护者专属的 `dev → main → 三平台` 与统一版本流程 |

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [`design/visual-language.md`](design/visual-language.md) | 简约、典雅、克制的整体气质与统一液态玻璃语言 |
| [`design/shared-transitions.md`](design/shared-transitions.md) | 液态玻璃共享元素转场的分层、生命周期与动效基线 |
| [`design/qa.md`](design/qa.md) | 同视口视觉验收、证据索引和记录模板 |

## 项目规格

| 文档 | 内容 |
| --- | --- |
| [`superpowers/specs/2026-08-30-seven-realms-pv-design.md`](superpowers/specs/2026-08-30-seven-realms-pv-design.md) | 《拓扑五子棋》宣传 PV「七界足迹」的叙事、视听、工程与验收规格 |

## 平台规范

- 小红书 H5 与离线 ZIP：执行入口为 [`.codex/SKILL.md`](../.codex/SKILL.md)，具体约束位于 `.codex/references/`。
- Bilibili Toy：专属适配文档随 `bilibili` 分支维护，并以官方 Toy 约束和仓库安装的 `toy` skill 为准。
- 微信小程序：待适配开始并完成事实核验后，在 `wechat` 分支建立平台文档；不得凭记忆预写宿主 API。

## 维护规则

- 原则、架构和操作流程写入 `docs/`；单次实现细节留在提交和 Pull Request。
- QA 文档只保留当前方法、有效证据和必要回归基线，不累积逐次调参日志。
- 所有仓库内引用使用相对路径；不记录本机绝对路径、临时附件路径或不可复现资源。
- 文档移动或重命名时，在同一提交中更新所有引用并检查链接目标存在。
