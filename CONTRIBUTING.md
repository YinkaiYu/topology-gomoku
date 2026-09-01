# 贡献指南

感谢你愿意让拓扑五子棋变得更有趣。玩法、数学规则、视觉、声音、性能、无障碍、测试、文档和平台适配都属于有价值的贡献。

## 开始之前

1. 完整阅读 `AGENTS.md`，运行 `git status --short --branch` 与 `git worktree list`。
2. 从最新 `dev` 创建独立的短期分支与 worktree；所有外部贡献和普通开发任务都以 `dev` 为唯一集成目标。
3. 不要直接在 `main`、`dev` 或长期发行 worktree 中开发，也不要从平台发行分支开始普通贡献。
4. 只处理本任务范围内的文件；发现其他 worktree 的未提交内容时，不删除、不覆盖、不清理。

完整分支与 worktree 操作见 [docs/development/repository.md](docs/development/repository.md)，文档总入口见 [docs/README.md](docs/README.md)。

## 必经流程

每项任务都遵循同一门禁：

```text
独立分支/worktree
        ↓
实现与自动验证
        ↓
任务 worktree 本地预览
        ↓
用户或评审者明确确认
        ↓
合并到目标集成分支
```

预览或评审阶段不得提前合并。外部贡献者确认后的 Pull Request 只以 `dev` 为目标，不负责 `dev → main`、平台原生分支或发行同步。涉及平台需求的外部贡献应先在 `dev` 收敛共享行为、adapter 契约、测试向量或可复用资源；维护者的平台专属适配流程见 [docs/development/repository.md](docs/development/repository.md)。

## 分支模型

| 分支 | 用途 | 接受的改动 |
| --- | --- | --- |
| `dev` | 外部贡献与日常开发的唯一集成目标 | 经预览确认的玩法、测试、设计、文档与可复用平台抽象 |
| `main` | 稳定的跨平台基线 | 只由维护者从稳定 `dev` 提升 |
| `xiaohongshu` | 小红书发行版 | 维护者从 `main` 同步；仅承载容器、JSBridge、ZIP 等宿主专属改动 |
| `bilibili` | Bilibili Toy 发行版 | 维护者从 `main` 同步，并承载 Toy 专属 adapter 与平台任务 |
| `wechat` | 微信小游戏发行版 | 维护者从 `main` 同步，并承载小游戏原生 adapter 与平台任务 |

贡献者的职责边界是 `任务分支 → dev`。后续 `dev → main → 三个发行分支` 属于仓库维护流程，见 [docs/development/release.md](docs/development/release.md)。平台分支中发现的通用问题由维护者另建 `dev` 任务回流，再沿正常路径传播。

## 视觉与交互

整体设计语言是**简约、典雅、克制**，液态玻璃是贯穿卡片、按钮、滑块、开关、状态胶囊与浮层的统一材质语言。完整原则见 [docs/design/visual-language.md](docs/design/visual-language.md)。

- 复用现有颜色、圆角、描边、阴影、间距、字体层级和运动节奏。
- 液态玻璃保持通透、受控折射、克制边缘光与连续形变；避免乳白厚雾、硬色带、过强彩边和无意义高光。
- 没有清晰交互或层级意义时，不增加颜色、阴影、动画、材质或特殊组件。
- 视觉修改用同一视口、同一内容和同一状态做前后对比；证据以仓库相对路径记录到 `docs/design/qa.md`。
- 不把本机临时路径、聊天附件路径或不可复现截图写入长期文档。

## 文本与内嵌字体

应用不应依赖系统中文字体回退。新增或修改 HTML 文本、JavaScript 动态文案、Canvas 文字、JSON 文案或 CSS `content` 后：

1. 运行 `npm test`；字体覆盖测试会扫描应用文本，并检查 400/600/700 三个 WOFF2 字重的 `cmap`。
2. 如报告缺字，运行 `npm run fonts:subset` 重建三个子集。该命令通过 `uv run --locked` 自动创建或同步仓库 `.venv`，不要直接依赖系统或 WindowsApps 的 `python` 启动器。
3. Python 版本与依赖分别由 `.python-version`、`pyproject.toml` 和 `uv.lock` 管理。调整依赖时使用 `uv add` / `uv remove` 并提交锁文件，不手改 `.venv`。
4. 字体二进制变化后，确认字体 URL 与 `style.css` URL 仍直接引用无查询参数或片段的包内真实文件名；缓存失效由统一 `package.json` 版本和平台发布清单管理。
5. 再次运行 `npm test`，并在目标视口确认字形、字重和排版一致。

完整源字体不提交到仓库；环境与依赖说明见 [docs/development/environment.md](docs/development/environment.md)，当前字体许可见 `licenses/OFL.txt`。

## 验证矩阵

| 改动 | 最低要求 |
| --- | --- |
| 共享逻辑、用户文案 | `npm test` |
| 小红书 H5 或包结构 | `npm run validate` |
| 同时涉及共享逻辑与 H5 | `npm run check` |
| 文档新增、移动或链接修改 | `npm run docs:check` |
| 小红书发布与构建 | `npm run build:xiaohongshu` |
| 新拓扑规则 | 确定性测试 |
| 视觉或交互 | 同视口前后证据 + 任务 worktree 本地预览 |
| 平台原生适配 | 对应模拟器；具备条件时补至少一台真机记录 |

提交前还要运行 `git diff --check` 和 `git status --short`，确认只包含本任务文件。

## 文档影响

任务开始和交付前都要按 [docs/development/documentation.md](docs/development/documentation.md) 检查文档影响。行为、命令、依赖、架构、设计语言或平台事实发生变化时，对应文档必须与实现同分支更新。确实无影响时，在 Pull Request 中写明理由；不能把空白视作“无需更新”。

## Agent-first 协作

- 人类提交者对代码、素材授权、测试结果与外部副作用负责。
- Prompt 不是验证证据；Pull Request 要列出实际运行的命令、结果和人工检查。
- 不提交聊天记录、思维过程、访问令牌、本机绝对路径或本地构建 ZIP。
- 大改动写清楚决策、约束与未完成项，让下一位协作者无需猜测上下文。

建议在 Pull Request 中留下简短交接：

```text
目标：
范围：共享 / 小红书 / Bilibili Toy / 微信 / 文档
验证：
预览确认：
文档影响：
视觉或真机检查：
已知限制：
```

## 提交风格

使用简洁的 Conventional Commit 前缀：`feat:`、`fix:`、`refactor:`、`test:`、`docs:`、`build:` 或 `chore:`。一次提交尽量只表达一个意图，不把格式化、生成产物和业务逻辑混成难以审查的大提交。

## 素材与许可证

只提交你有权再分发的代码、字体、图片和声音，并在需要时附上来源与许可证。项目源代码使用 MIT License；内嵌字体单独适用 `licenses/OFL.txt`。
