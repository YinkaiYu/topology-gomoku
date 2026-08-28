# 维护者合并与冲突处理手册

本文供得到仓库所有者明确授权的维护者使用，覆盖 `dev → main → xiaohongshu / bilibili / wechat` 的稳定提升与发行整合。日常任务合入 `dev` 的基本流程仍以 [`repository.md`](repository.md) 为准，版本与发布门禁以 [`release.md`](release.md) 为准。

合并的目标不是让 Git 不再报冲突，而是保证每一处最终实现仍属于正确的代码层：共享产品行为来自本轮稳定 `main`，宿主差异留在各自 adapter/boundary，三个发行版接收同一个版本号。

## 不可破坏的方向

```text
codex/<shared-task> ──▶ dev ──▶ main
                                  │
                                  ├──▶ xiaohongshu
                                  ├──▶ bilibili
                                  └──▶ wechat

codex/<platform-task> ──▶ 对应平台发行分支
```

- 共享功能、规则、AI、UI、资源、测试、文档和 adapter 契约只沿 `dev → main → 各平台` 单向传播。
- 平台分支不互相合并，也不从 `dev` 跳过 `main` 接收改动。
- 平台分支发现共享缺陷时，停止当前发行整合，从 `dev` 建共享修复任务；不能把同一补丁复制到三个平台。
- `main` 和长期发行 worktree 只用于整合与复验，不直接承载临时修复。
- 平台整合本身不改变游戏 SemVer；版本只在稳定 `dev → main` 提升时确定。

## 合并前先固定四个事实

不要在移动中的分支名上凭感觉解决冲突。先记录不可变的提交和工作位置：

```powershell
git status --short --branch
git worktree list
git fetch --all --prune
git rev-parse dev
git rev-parse main
git rev-parse xiaohongshu
git rev-parse bilibili
git rev-parse wechat
```

必须确认：

1. 来源提交是已预览、已确认且验证通过的稳定边界；不要默认使用不断前进的最新 `dev`。
2. 目标长期分支和 worktree 没有未提交内容。
3. 本轮唯一 SemVer 已在目标 `main` 内容中确定。
4. 整合发生在从目标长期分支新建的独立 `codex/release-...` worktree 中。

把本轮提交记入交接记录，例如 `DEV_SHA`、`MAIN_SHA` 和三个平台整合前提交。后续命令和验证记录优先引用提交 SHA，而不是只写“最新 main”。

## 第一段：从 dev 提升到 main

从长期 `main` 新建提升分支，再把选定的稳定 `dev` 提交合入：

```powershell
git worktree add -b codex/promote-X.Y.Z .worktrees/promote-X.Y.Z main
Set-Location .worktrees/promote-X.Y.Z
git merge --no-commit --no-ff <DEV_SHA>
```

正常情况下，`main` 只包含较早的稳定 `dev`，这一步应当简单。若出现共享代码冲突，通常说明 `main` 曾有未回流 `dev` 的直接修改，或所选稳定边界不完整。不要在提升分支里临时拼出第四套实现：

1. 用 `git log --left-right --cherry-pick main...<DEV_SHA>` 查明两侧独有提交。
2. 判断 `main` 独有改动是否仍有效；有效的共享修复先建 `dev` 任务回流，无效内容通过可审查的维护任务移除。
3. 运行 `git merge --abort`，等待 `dev` 重新形成稳定边界后再提升。

只有版本元数据或同一文档的正常演进冲突可以在提升分支中逐段解决。解决完成后运行完整 `npm run check`，完成预览和维护者确认，再提交提升分支，并让长期 `main` 快进到它。不要在未验证的冲突状态下直接更新 `main`。

## 第二段：从 main 更新发行分支

每个平台单独建立整合分支。整合分支必须从对应长期发行分支出发，因此在下面的合并方向中：

- `ours` / stage 2：当前平台已有实现；
- `theirs` / stage 3：本轮稳定 `main`；
- 若改用 rebase，含义会变化，因此发行整合禁止用 rebase 代替 merge。

```powershell
git worktree add -b codex/release-wechat-X.Y.Z .worktrees/release-wechat-X.Y.Z wechat
Set-Location .worktrees/release-wechat-X.Y.Z
git merge-base HEAD <MAIN_SHA>
git log --left-right --cherry-pick --oneline HEAD...<MAIN_SHA>
git merge --no-commit --no-ff <MAIN_SHA>
git status --short
git diff --name-only --diff-filter=U
```

`git merge --no-commit` 让维护者在生成合并提交前完成检查。没有冲突也不等于已经正确：仍要审查平台相对 `main` 保留下来的差异是否都属于宿主边界。

## 按职责解决，不按文件数量解决

先给每个冲突文件归类，再编辑。禁止对目录或整批冲突机械执行 `ours` / `theirs`。

| 文件职责 | 默认基线 | 处理方式 |
| --- | --- | --- |
| 游戏规则、AI、共享 UI、共享资源、共享测试 | `main` | 恢复本轮稳定共享行为；平台差异必须移入已有或新建的 adapter/boundary |
| 宿主 API、生命周期、权限、平台清单、资源路径和发布配置 | 平台分支 | 保留平台语义，再手工适配 `main` 的最新共享契约 |
| 原生渲染器或平台组件实现的共享 UI | `main` 的视觉与交互契约 | 保留平台原生实现方式，但重新校准到 `main` 的布局、素材、状态、动效和输入语义；不能把“原生适配”变成重新设计 |
| 同时混合共享逻辑和平台调用的文件 | 无整文件默认值 | 逐段合并；先恢复共享逻辑，再重新接入最小平台边界，并补契约测试 |
| `package.json`、缓存键和版本字段 | `main` 的 SemVer | 保留平台专属脚本和依赖，但游戏版本必须等于本轮 `main` |
| 生成资源、构建清单、字体子集 | 权威源文件 | 合并源文件后用仓库命令重新生成；不手改二进制或构建产物来“消冲突” |
| 共享文档与平台文档 | 各自职责 | 通用流程进入共享文档；宿主事实进入对应平台文档，避免复制两套规则 |

检查冲突两侧时使用 Git 的冲突阶段，先看内容再决定：

```powershell
git show :2:path/to/file
git show :3:path/to/file
```

只在已经确认整份文件职责单一时，才可以对单个文件使用 `git restore --ours -- <file>` 或 `git restore --theirs -- <file>`。任何包含共享逻辑与宿主代码的混合文件都必须手工合并。

每解决一个冲突文件就立即 `git add <file>`，并在冲突清单中记录选择依据。不要等到最后一次性暂存整棵目录，否则很难审计某个文件是经过判断还是被顺手覆盖。

### 删除、移动与重命名冲突

- `main` 删除了旧共享模块，而平台仍在引用时，不要无条件恢复旧文件；先把平台调用迁到新契约。
- 平台移动了宿主入口，而 `main` 修改了原路径时，以当前平台入口为落点，手工移植共享变化，并更新引用和测试。
- 两侧新增同名文件时，先判断是否重复实现同一职责；能共享的回流 `dev`，纯平台版本改为明确的平台命名或目录。

### 冲突暴露架构问题时

出现以下任一情况应中止本轮平台合并，运行 `git merge --abort`：

- 为三个平台重复修补同一规则或 UI；
- 平台实现必须复制一大段 `main` 才能工作；
- 共享模块直接依赖某个宿主全局对象；
- 无法说清一个冲突文件属于共享核心还是平台边界；
- 修复会改变另外两个平台也应遵守的行为契约。

此时从 `dev` 建独立共享任务，补齐 adapter 契约和确定性测试，重新完成 `dev → main` 后再做平台整合。多走一轮稳定提升，比在三个发行分支制造长期漂移更便宜。

## 解决完成后的三层审查

### 1. Git 完整性

```powershell
git diff --name-only --diff-filter=U
git diff --check
git diff --cached --check
git status --short
git diff --cached --stat
```

- 未解决冲突列表必须为空。
- 不提交 `dist/`、`release/*.zip`、依赖目录、密钥、签名或私有项目配置。
- 检查意外删除、整文件重写、换行符噪音和不属于本轮的文件。

### 2. 共享基线完整性

```powershell
git diff --name-status <MAIN_SHA> -- app tests docs package.json
```

逐项解释发行分支相对 `main` 的共享目录差异。无法用“宿主边界、平台构建或已记录限制”解释的差异，视为漂移，不能带入发行分支。

规则、UI 或资源冲突解决后，必须重新运行共享测试；不要因为两侧各自曾通过测试，就假设合并结果也通过。

### 3. 平台行为完整性

- 运行 `npm run check` 和对应平台的校验、构建、模拟器及真机流程。
- 视觉冲突使用同视口、同内容、同状态对照；确认平台适配没有重做 UI 或改变美术语言。
- 生命周期、输入、音频、存储、安全区和宿主悬浮 UI 必须在真实宿主中复核。
- 同步到外部平台模板的项目必须从新构建产物重新同步，不能依赖整合前目录的残留文件。

平台文档列出的命令和证据要求优先于本手册的通用清单。

## 提交、确认与快进长期分支

完成冲突解决和自动验证后，在整合分支生成合并提交。随后提供预览与验证记录，等待用户或维护者明确确认。确认后才更新长期发行分支：

```powershell
git log --oneline <PLATFORM_BEFORE>..<INTEGRATION_SHA>
git diff --stat <PLATFORM_BEFORE>..<INTEGRATION_SHA>
git -C <platform-worktree> merge --ff-only codex/release-<platform>-X.Y.Z
git -C <platform-worktree> status --short --branch
git merge-base --is-ancestor <INTEGRATION_SHA> <platform-branch>
```

先审查整合分支相对平台原起点的完整提交和文件范围，确认前置共享提交都在预期内，也没有夹带其他未确认任务。使用 `--ff-only` 可以保证长期分支没有在确认期间产生未审查的分叉。若失败，停止并重新检查长期分支，不使用强推、硬重置或新的临时冲突提交绕过。

长期分支更新后再次运行对应平台的发布前命令，并从整合后的长期分支重建、同步和刷新模拟器。任务 worktree 只有在以下条件全部满足后才能关闭：

- 工作区干净；
- 任务提交是目标长期分支的祖先；
- 验证记录已保存；
- 没有仍占用该目录的预览或构建进程。

删除 worktree 不等于删除分支。分支是否删除由仓库维护策略另行决定，不要在清理 worktree 时顺手删除未确认的分支。

## 本仓库实践形成的经验

微信原生适配的整合验证了以下做法：

- 可共享的游戏控制、美术和契约先形成共享提交，平台任务只叠加宿主边界与原生渲染适配。
- 最终任务分支包含已验证的前置共享提交后，长期 `wechat` 可以用 `--ff-only` 接收，避免在长期分支现场解决第二轮冲突。
- 合并后必须在长期 `wechat` 上重新执行微信检查、构建、固定目标同步和开发者工具刷新；任务分支通过不代表发行 worktree 与外部模板仍一致。
- 清理时先验证 ancestry 和工作区状态；若预览服务占用目录，只停止该任务专属进程，不影响其他 worktree。

这些经验同样适用于另外两个平台：提前收敛共享职责，平台冲突就会集中在少量、可解释的 adapter/boundary 中。

## 合并交接模板

```text
统一版本：
稳定 DEV_SHA：
提升 MAIN_SHA：
目标平台 / 整合前提交：
整合分支 / 合并提交：
冲突文件清单：
每个冲突的职责分类与处理结论：
相对 main 保留的平台差异：
共享验证：
平台构建 / 模拟器 / 真机验证：
视觉证据：
用户或维护者确认：
长期分支 ancestry 检查：
外部模板同步：
已知限制或审核阻塞：
```
