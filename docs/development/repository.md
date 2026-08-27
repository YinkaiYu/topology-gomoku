# 仓库、分支与 worktree 指南

这份文档描述拓扑五子棋的长期 Git 结构和任务交付流程。核心原则是：集成分支保持干净，每项工作相互隔离，先预览确认再合并。

## 分支流

```text
共享任务 worktree                 平台任务 worktree
codex/<task>                      codex/<platform-task>
      │ 预览确认                         │ 预览确认
      ▼                                  ▼
     dev                         对应发行分支
      │ 稳定提升                  xiaohongshu / bilibili / wechat
      ▼                                  ▲
    main ────────────────────────────────┘
             共享基线同步
```

- `dev` 是共享代码的集成基线，不是日常直接修改的工作目录。
- `main` 是稳定跨平台基线，只接收从 `dev` 提升的已验证改动或明确的紧急修复。
- `xiaohongshu`、`bilibili`、`wechat` 只接收对应平台专属改动，以及从 `main` 同步的共享基线。
- 平台分支里发现的通用问题应提炼回独立共享任务，进入 `dev` 后再正常传播，不复制三份实现。

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
# 共享任务
git worktree add -b codex/<task> .worktrees/<task> dev

# 平台专属任务；将 <platform> 替换为实际发行分支
git worktree add -b codex/<platform-task> .worktrees/<platform-task> <platform>
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
5. 等待明确确认；确认前不得合并到 `dev`、`main` 或发行分支。
6. 确认后提交并合入目标集成分支；再次运行相称的验证。
7. 合并和交接完成后才清理短期 worktree。删除前确认工作树干净且提交已可从目标分支访问。

文档、测试和小文案也遵循相同隔离原则；是否需要图形预览按产物判断，但仍须把变更内容交给用户或评审者确认后再合并。

## 什么放在哪里

| 内容 | 集成目标 |
| --- | --- |
| 拓扑规则、AI、共享 UI、共享资源、通用测试 | `dev` |
| 小红书容器能力、JSBridge、校验、ZIP 与发布配置 | `xiaohongshu` |
| Bilibili Toy 生命周期、API、资源与发布配置 | `bilibili` |
| 微信小程序生命周期、组件、资源与发布配置 | `wechat` |
| 可复用 adapter 接口与跨平台行为契约 | `dev` |
| 面向公众的说明、架构与贡献约定 | `dev`，稳定后提升到 `main` |

当前 `app/` 同时承担共享游戏与小红书 H5 基线。平台边界应逐步收敛到 adapter；在真实宿主要求尚未确认前，不为目录整齐一次性重写共享核心。

## 提升与发布

1. 经确认的共享任务合入 `dev`，保持测试与设计验证持续通过。
2. 通过 Pull Request 将稳定的 `dev` 提升到 `main`。
3. 分别把 `main` 合入三个发行分支，在发行分支解决 adapter 冲突。
4. 在对应模拟器和真机验收；构建产物不提交 Git。
5. 使用平台前缀标签，例如 `xiaohongshu-v1.36.0`、`bilibili-v1.0.0`、`wechat-v1.0.0`。

建议保护 `main`、`dev` 和发行分支：要求 Pull Request、验证通过、预览或平台验收记录，并禁止强推。

## 命名约定

- Agent 任务分支：`codex/<topic>`。
- 人工短期分支：`feat/<topic>`、`fix/<topic>`、`docs/<topic>` 等。
- 平台任务可在主题中带平台名，例如 `codex/wechat-safe-area`。
- tag 使用 `<platform>-v<semver>`，不使用含糊的全局 `v1.0.0`。

分支名描述集成责任，目录名描述代码责任。即使未来平台迁移到不同工程形态，共享规则的测试向量、视觉原则和行为契约仍应保持一致。
