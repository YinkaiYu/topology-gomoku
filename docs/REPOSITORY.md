# 仓库、分支与 worktree 指南

这份文档描述拓扑五子棋的长期 Git 结构。目标是让共享玩法保持一个清晰主干，同时允许三个平台采用真正原生的工程形态。

## 分支流

```text
短期功能 / 修复
       │
       ▼
      dev  ───────── 日常集成、自动化测试、设计验证
       │  稳定提升
       ▼
     main  ───────── 稳定的跨平台产品基线
       │
       ├──────────▶ xiaohongshu  ── 小红书发行与原生适配
       ├──────────▶ bilibili     ── Bilibili Toy 发行与原生适配
       └──────────▶ wechat       ── 微信小程序发行与原生适配
```

`main` 不直接合并平台专属文件到其他平台。共享变更从 `main` 向发行分支合并；冲突应在发行分支解决，并保留 adapter 的平台语义。

紧急发布修复可以先落到相应发行分支，但若问题影响共享逻辑，必须尽快把最小通用修复回流 `dev`，随后再按正常路径同步。

## 本地 worktree 布局

主工作目录检出 `main`，其余长期分支位于被 Git 忽略的 `.worktrees/`：

```text
xiaohongshu-tools/               main
└─ .worktrees/
   ├─ dev/                       dev
   ├─ xiaohongshu/               xiaohongshu
   ├─ bilibili/                  bilibili
   └─ wechat/                    wechat
```

查看所有工作区：

```powershell
git worktree list
```

长期 worktree 不等于允许同时修改同一文件。切换任务前先确认目标分支；并行 Agent 应各自使用短期分支或独立 worktree，完成后通过提交合并，不共享脏工作区。

## 什么放在哪里

| 内容 | 首选位置 |
| --- | --- |
| 拓扑规则、AI、共享资源、通用测试 | `dev`，稳定后提升到 `main` |
| 小红书宿主能力、校验和 ZIP | `xiaohongshu` |
| Bilibili Toy 生命周期、API 与配置 | `bilibili` |
| 微信小程序生命周期、组件与配置 | `wechat` |
| 可复用 adapter 接口与兼容层 | `dev` |
| 面向公众的说明、架构与贡献约定 | `dev` 与 `main` |

当前 `app/` 同时承担共享游戏与小红书 H5 基线。第一轮平台适配应先识别稳定边界，再逐步抽取共享核心；不要在平台需求尚未确认前一次性重写目录。

## 提升与发布

1. 在 `dev` 完成共享改动，测试与视觉 QA 全部通过。
2. 通过 Pull Request 把 `dev` 提升到 `main`，保持 `main` 可随时作为稳定基线。
3. 分别把 `main` 合入三个发行分支，并在各平台解决 adapter 冲突。
4. 在对应模拟器与真机验收；构建产物不提交到 Git。
5. 使用平台前缀标签标记发布，例如 `xiaohongshu-v1.36.0`、`bilibili-v1.0.0`、`wechat-v1.0.0`。

在 GitHub 上建议保护 `main` 和 `dev`：要求 Pull Request、CI 通过且禁止强推。发行分支可设置相同保护，并要求对应平台验收后再合并。

## 命名约定

- Agent 或短期开发分支：`codex/<topic>`、`feat/<topic>`、`fix/<topic>`。
- 平台专属短期分支可加平台前缀，例如 `fix/wechat-safe-area`。
- tag 使用 `<platform>-v<semver>`，不使用含糊的全局 `v1.0.0`。

分支名描述集成责任，目录名描述代码责任。未来即使某个平台迁移到完全不同的项目结构，也应优先保持共享规则的测试向量与行为契约一致。

## 设计规范

- [液态玻璃共享元素转场规范](LIQUID-GLASS-SHARED-TRANSITIONS.md)：定义共享元素开合动效的设计原则、分层模型、交接时序、失败模式与逐帧验收清单。
