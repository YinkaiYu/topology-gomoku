# 贡献指南

感谢你愿意让拓扑五子棋变得更有趣。玩法、数学规则、视觉、声音、性能、无障碍、测试、文档和平台适配都属于有价值的贡献。

## 开始之前

1. 完整阅读 `AGENTS.md`，运行 `git status --short --branch` 与 `git worktree list`。
2. 判断任务属于共享玩法还是平台专属适配。共享任务以 `dev` 为基线；平台任务以 `xiaohongshu`、`bilibili` 或 `wechat` 对应分支为基线。
3. 从正确基线创建独立的短期分支与 worktree。不要直接在 `main`、`dev` 或长期发行 worktree 中开发，也不要与另一项任务共享脏工作区。
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

预览或评审阶段不得提前合并。共享任务合回 `dev`；平台专属任务合回对应发行分支。一个改动同时涉及共享玩法和平台桥接时，尽量拆成两个可独立预览、审查和回滚的提交或 Pull Request。

## 分支模型

| 分支 | 用途 | 接受的改动 |
| --- | --- | --- |
| `dev` | 共享集成与下一版本基线 | 经预览确认的共享玩法、测试、设计、文档与可复用平台抽象 |
| `main` | 稳定的跨平台基线 | 从 `dev` 提升的已验证改动；紧急修复除外不直接开发 |
| `xiaohongshu` | 小红书发行版 | 小红书容器、JSBridge、离线 ZIP 与发布配置 |
| `bilibili` | Bilibili Toy 发行版 | Toy API、生命周期、资源与发布配置 |
| `wechat` | 微信小程序发行版 | 小程序生命周期、组件、资源与发布配置 |

共享能力的常规流向是 `任务分支 → dev → main → 三个发行分支`。平台分支中发现的通用修复应先提炼回 `dev`，再沿正常路径传播，避免长期漂移。

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
4. 字体二进制变化后，同步更新字体 URL、`style.css` URL 与 `package.json` 版本，确保离线容器不复用旧缓存。
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
