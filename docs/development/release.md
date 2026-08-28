# 稳定提升与全平台发布

本文只适用于仓库所有者明确授权的维护者（包括维护者 Agent）。外部贡献者和普通开发 Agent 的职责终点是 `dev`，不执行本流程。开始稳定提升或发行整合前，还必须完整阅读 [`merging.md`](merging.md)；本文定义发布门禁，合并方向、冲突分类和安全清理由该手册定义。

## 发布模型

```text
日常任务分支
      │ 预览确认
      ▼
     dev
      │ 维护者选择稳定提交
      ▼
 main  vX.Y.Z
      │ 同一提交基线、同一版本号
      ├──▶ xiaohongshu  vX.Y.Z
      ├──▶ bilibili     vX.Y.Z
      └──▶ wechat       vX.Y.Z
```

- `dev` 可以持续前进；维护者只提升已经完成预览、测试和文档审查的稳定边界。
- `main` 表示当前稳定产品基线，不承载日常开发。
- 三个发行分支只从 `main` 更新共享基线，并保留各自 adapter、宿主配置和发布资产。
- 不从 `dev` 直接同步某个平台，也不在平台之间互相合并。

## 统一版本规则

- 拓扑五子棋只有一个跨平台游戏 SemVer。版本号只由核心功能沿 `dev → main` 提升时确定，每轮稳定发布以 `main/package.json` 的 `X.Y.Z` 为唯一来源。
- `xiaohongshu`、`bilibili`、`wechat` 的 `package.json`、平台清单、缓存键和发布标签必须映射到同一个 `X.Y.Z`。
- 平台原生适配、adapter 修复和宿主配置变化不修改游戏 SemVer，也不触发一次核心版本提升；发行分支在下一轮 `main` 同步时接收新的统一版本号。
- 宿主强制要求的构建号、审核批次或渠道修订号可以按平台规则独立维护，但它们不是游戏 SemVer，不能写回共享版本字段。
- 三个平台可以因审核或宿主限制在不同日期上线，但不能因此产生三个 SemVer。
- 发布标签带平台前缀但共享数字，例如 `xiaohongshu-v1.37.2`、`bilibili-v1.37.2`、`wechat-v1.37.2`。

## 发布步骤

### 1. 选择稳定 dev

- 确认目标 `dev` 提交不包含未预览、未确认或仍在进行的任务。
- 运行 `npm run check`，复核用户可见行为、视觉证据和文档影响。
- 在核心 `dev` 中确认本轮唯一 SemVer，并检查包版本、字体/样式缓存键和发布说明一致。平台分支不能在此步骤之外决定新版本号。

### 2. 提升到 main

- 通过可审查的提升分支或 Pull Request 将目标 `dev` 提交同步到 `main`。
- 在 `main` 上再次运行 `npm run check`；不得在 `main` 临时开发修复。
- 记录来源 `dev` 提交、统一版本、验证结果和已知限制。

### 3. 更新三个发行分支

- 分别为 `xiaohongshu`、`bilibili`、`wechat` 创建独立的发行整合分支/worktree。
- 将同一个 `main` 提交同步到每个发行整合分支，只在 adapter/boundary 中解决宿主差异。
- 检查每个平台的包版本、清单、缓存键和发布标签都使用本轮统一 SemVer。
- 运行共享检查、对应平台构建、模拟器和真机验收；构建产物不提交 Git。
- 每个平台确认后再合入对应长期发行分支。

微信发行整合分支还要执行：

```powershell
npm run check:wechat
npm run build:wechat
npm run sync:wechat
```

`sync:wechat` 把新构建同步至 `%USERPROFILE%\Documents\Codex\miniprograms\topology-gomoku`，该目录只用于微信官方模板派生的开发者工具预览，不是发行分支源码。确认同步没有改变目标的 AppID、`project.config.json` 或 `project.private.config.json`，随后完成小游戏模拟器与至少一台目标真机验收。平台 adapter 的本次变更不得单独递增游戏 SemVer；构建清单必须沿用本轮 `main` 确认的版本。完整清单见 [`../platforms/wechat.md`](../platforms/wechat.md)。

### 4. 一致性检查与发布记录

三个长期发行分支同步完成后运行：

```powershell
npm run release:check-versions -- X.Y.Z
```

该命令检查 `main` 和三个发行分支的 `package.json`。平台清单或宿主后台中的额外版本字段仍需在发布记录中逐项确认。

## Bilibili 发行分支补充要求

Bilibili 同样遵守 [`merging.md`](merging.md) 的通用发行整合流程。整合分支必须从长期 `bilibili` 分支新建，再把本轮稳定 `main` 合入；在这个合并方向中，`ours` 是既有 Bilibili 发行实现，`theirs` 是本轮 `main` 共享基线，但最终选择仍以文件职责为准。

| 冲突内容 | 处理原则 |
| --- | --- |
| 游戏规则、通用 UI、共享资源、共享测试 | 接收 `main` 的稳定实现；若 Bilibili 也需要差异，差异只能进入明确的 adapter/boundary |
| Toy API、生命周期、宿主资源路径、Toy 清单与平台构建配置 | 保留 Bilibili 平台语义，再手工适配 `main` 的最新共享契约 |
| `package.json`、缓存键与游戏 SemVer | 接收本轮 `main` 的统一版本号，同时保留 Bilibili 专属命令和平台依赖 |
| 同时包含共享逻辑与 Toy 适配的混合文件 | 逐段手工合并；先恢复共享行为，再重新接上 adapter，不能整文件覆盖 |
| 共享发布文档与 Bilibili 平台文档 | 通用流程留在共享文档，Toy 宿主事实留在 `bilibili` 分支的平台文档，并保证两边链接和版本口径一致 |

解决后先检查 `git diff --check` 和 `git status --short`，再运行共享检查、Bilibili 构建及 Toy 平台诊断。用 `toy` skill 生成预览并完成真机验收；用户明确确认前不得提交审核，也不得合入长期 `bilibili` 分支。

如果冲突暴露的是共享缺陷、共享契约不完整或三个平台都需要的修复，按合并手册中止当前整合，从 `dev` 新建共享任务，验证并重新完成稳定提升后，再重做本次发行整合。无法确定文件职责时同样先暂停，查阅对应 adapter 和平台文档，而不是凭 `ours` / `theirs` 猜测。

## 受阻与修复

- 某个平台受阻时，保留同一版本号并记录阻塞原因；不要给已通过的平台另造游戏版本号。
- 共享缺陷：停止发行整合，从 `dev` 建独立修复任务，确认后重新走稳定提升。
- 平台专属缺陷或适配：维护者从对应发行分支建独立任务 worktree，验证后合回原发行分支；保持当前游戏 SemVer 不变。平台要求的构建号或审核批次按宿主规则处理。
- 平台分支中的通用修复必须回流 `dev`，不得复制到另外两个发行分支。

## 发布交接

每轮发布至少记录：

```text
统一版本：
来源 dev 提交：
main 提交：
小红书发行提交 / 验证：
Bilibili 发行提交 / 验证：
微信发行提交 / 验证：
版本一致性检查：
已知限制或审核阻塞：
```
