# 仓库、分支与 worktree 指南

这份文档描述拓扑五子棋的长期 Git 结构、贡献者边界和维护者职责。核心原则是：日常贡献统一进入 `dev`，稳定版本由维护者单向提升，三个发行分支共享同一产品版本。

## 分支流

```text
外部贡献者 / 普通开发 Agent                仓库维护者

dev ──▶ codex/<task> worktree
 ▲            │
 └── 预览确认 ┘
              │
              │ 定期选择稳定提交
              ▼
            main  vX.Y.Z
              │
              ├──▶ xiaohongshu  vX.Y.Z
              ├──▶ bilibili     vX.Y.Z
              └──▶ wechat       vX.Y.Z
```

- `dev` 是所有外部贡献与普通任务的唯一集成目标，但不是直接修改的工作目录。
- `main` 是稳定跨平台基线，只由维护者从已验证的 `dev` 提升。
- `xiaohongshu`、`bilibili`、`wechat` 是维护者管理的发行分支，只从 `main` 接收同一稳定版本，再保留各自 adapter 和宿主配置。
- 外部贡献者的职责终点是 `dev`；稳定选择、版本提升和三个发行分支同步属于维护者职责。
- 平台分支里发现的通用问题必须另建 `dev` 任务回流，不在三个发行版复制修复。

维护者还有一条独立的平台适配支线：

```text
bilibili ──▶ codex/bilibili-<task> worktree ──预览确认──▶ bilibili
wechat   ──▶ codex/wechat-<task> worktree   ──预览确认──▶ wechat
```

这条支线只处理无法进入共享基线的宿主 API、生命周期、组件、资源和发布配置。`dev/main` 当前天然对标小红书 H5，因此小红书工作通常仍从 `dev` 开始；只有容器、JSBridge、ZIP 和发布配置等纯宿主内容才从 `xiaohongshu` 建平台任务。

## 长期与短期 worktree

主工作目录检出 `main`，长期分支位于 Git 忽略的 `.worktrees/`：

```text
xiaohongshu-tools/               main
└─ .worktrees/
   ├─ dev/                       dev
   ├─ xiaohongshu/               xiaohongshu
   ├─ bilibili/                  bilibili
   └─ wechat/                    wechat
```

长期 worktree 用来查看、集成和同步，不承载具体任务的未提交修改。每项任务另建短期分支和 worktree：

```powershell
# 所有日常功能、修复、设计、测试与文档任务
git worktree add -b codex/<task> .worktrees/<task> dev
```

开始前始终运行：

```powershell
git status --short --branch
git worktree list
```

如果目标分支或 worktree 有未提交内容，先确认归属；不要清理、覆盖或借用它继续另一项任务。

## 一项任务的完整生命周期

1. 选择正确基线并创建独立分支/worktree。
2. 在任务 worktree 实现，只修改任务范围内的文件。
3. 按改动类型运行测试、校验、构建和视觉/真机 QA。
4. 在同一个任务 worktree 启动本地预览，向用户或评审者展示可操作结果及必要证据。
5. 等待明确确认；确认前不得合并到 `dev`。
6. 确认后提交并合入 `dev`；再次运行相称的验证。普通任务到此结束，不继续操作 `main` 或发行分支。
7. 合并和交接完成后才清理短期 worktree。删除前确认工作树干净且提交已可从目标分支访问。

文档、测试和小文案也遵循相同隔离原则；是否需要图形预览按产物判断，但仍须把变更内容交给用户或评审者确认后再合并。

## 平台适配任务

平台任务只由维护者或得到明确平台维护授权的 Agent 执行：

1. 确认改动只能存在于特定宿主；可复用部分先拆成 `dev` 任务。
2. 从 `bilibili`、`wechat` 或必要时 `xiaohongshu` 建立独立任务分支/worktree。
3. 使用对应平台官方约束、模拟器和真机验证；Bilibili 任务使用仓库安装的 `toy` skill。
4. 提供平台预览并获得明确确认后，合回原发行分支。
5. 不修改游戏 SemVer。游戏版本只由核心 `dev → main` 稳定提升控制；平台宿主自己的构建号或审核批次不属于游戏版本。

## 什么放在哪里

| 内容 | 集成目标 |
| --- | --- |
| 拓扑规则、AI、共享 UI、共享资源、通用测试 | `dev` |
| 小红书容器能力、JSBridge、校验、ZIP 与发布配置 | 维护者发行同步时进入 `xiaohongshu` |
| Bilibili Toy 生命周期、API、资源与发布配置 | 维护者发行同步时进入 `bilibili` |
| 微信小程序生命周期、组件、资源与发布配置 | 维护者发行同步时进入 `wechat` |
| 可复用 adapter 接口与跨平台行为契约 | `dev` |
| 面向公众的说明、架构与贡献约定 | `dev`，稳定后提升到 `main` |

当前 `app/` 同时承担共享游戏与小红书 H5 基线。平台边界应逐步收敛到 adapter；在真实宿主要求尚未确认前，不为目录整齐一次性重写共享核心。

## 提升与发布

维护者定期从 `dev` 选择稳定版本，经复验后提升到 `main`，再以同一 `main` 提交和同一 SemVer 更新三个发行分支。已有平台适配提交保留在各自发行分支，由本轮 `main` 同步更新共享基线。详细门禁、统一版本规则和平台检查见 [`release.md`](release.md)。

执行稳定提升或发行分支整合前，必须完整阅读 [`merging.md`](merging.md)。冲突只能在独立提升/整合 worktree 中按文件职责解决；长期分支在确认后通过 `--ff-only` 接收已验证结果，不在长期 worktree 现场拼接冲突。

建议保护 `main`、`dev` 和发行分支：要求 Pull Request、验证通过、预览或平台验收记录，并禁止强推。普通贡献者只需要面向 `dev` 发起 Pull Request。

## 命名约定

- Agent 任务分支：`codex/<topic>`。
- 人工短期分支：`feat/<topic>`、`fix/<topic>`、`docs/<topic>` 等。
- 维护者发行整合分支可使用 `codex/release-<platform>-<semver>`。
- 三个平台 tag 使用相同 SemVer，例如 `xiaohongshu-v1.37.2`、`bilibili-v1.37.2`、`wechat-v1.37.2`；不得各自使用不同产品版本。

分支名描述集成责任，目录名描述代码责任。即使未来平台迁移到不同工程形态，共享规则的测试向量、视觉原则和行为契约仍应保持一致。
