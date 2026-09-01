# 开发环境与依赖

仓库以 Node.js 运行测试与 H5 校验，以 PowerShell 执行 Windows 构建脚本；Python 只用于确定性生成拓扑 SVG 和内嵌字体子集。

## 基础工具

| 工具 | 用途 | 约束 |
| --- | --- | --- |
| Node.js | 测试与 npm 任务 | `package.json` 要求 Node.js 18 或更高版本 |
| PowerShell | H5 与微信小游戏校验、构建、同步及字体命令入口 | 使用仓库脚本，不复制临时命令 |
| uv | Python 版本、虚拟环境与依赖锁定 | 以 `.python-version`、`pyproject.toml`、`uv.lock` 为准 |
| 微信开发者工具 | 微信小游戏模拟器、调试、预览与真机联调 | 导入同步后的生成目录，不直接打开仓库源码目录 |

仓库没有运行时 npm 依赖；测试使用 Node.js 内置测试运行器。Python 环境由 `uv` 隔离在 `.venv/`，缓存放在 `.uv-cache/`，两者都不提交 Git。

## 常用命令

```powershell
npm test
npm run validate
npm run check
npm run build:xiaohongshu
npm run validate:wechat
npm run check:wechat
npm run build:wechat
npm run sync:wechat
npm run prepare:wechat-agent
npm run fonts:subset
npm run fonts:subset:wechat
npm run release:check-versions -- X.Y.Z
```

- `npm run check` 同时执行逻辑测试、H5 包校验和文档检查。
- `npm run validate:wechat` 检查 `wechat/` 的小游戏入口、JSON、离线约束和包内路径；`npm run check:wechat` 在共享总检查后生成并验证微信包。
- `npm run build:wechat` 从 `wechat/` 构建到 `dist/wechat/`，同时从 `app/assets/` 注入权威共享逻辑、美术与字体，生成带 SHA-256 的托管清单；构建产物不提交 Git。
- `npm run sync:wechat` 会先执行一次全新构建，再把托管文件同步至 `%USERPROFILE%\Documents\Codex\miniprograms\topology-gomoku`。目标是微信官方小游戏模板派生的开发者工具生成/预览目录，不是源码；同步保留 AppID、`project.config.json`、`project.private.config.json` 及其他未托管文件。
- `npm run prepare:wechat-agent` 先执行共享检查，再调用自带 fresh build 的 `sync:wechat` 更新默认目录；它不会在同步前重复执行一次相同构建。同步后仍须完成模拟器刷新、截图、console 与画布交互验证。
- `npm run fonts:subset` 重建 H5 WOFF2；`npm run fonts:subset:wechat` 同时扫描 `app/` 与 `wechat/`，重建隔离的微信本地 TTF。两者都通过 `uv run --locked` 自动创建或同步 `.venv`，无需激活虚拟环境。
- `npm run release:check-versions -- X.Y.Z` 仅供维护者在稳定同步后检查 `main` 与三个发行分支的统一游戏版本。
- 首次同步需要下载 `uv.lock` 中的依赖；之后会复用锁定环境与本地缓存。

## 微信小游戏本地预览

微信适配任务交给开发者工具前运行：

```powershell
npm run prepare:wechat-agent
```

该入口的仓库顺序是 `check → sync:wechat`；`sync:wechat` 内部固定执行 `fresh build → sync`，所以最终交给开发者工具的总是同一次新构建，同时不会无意义地双构建。首次同步只接受脚本精确识别的微信官方示例小游戏模板；后续同步只替换清单托管文件，检测到目标中手工改动的托管文件时会拒绝覆盖。需要使用另一处模板时可显式传入目标：

```powershell
npm run sync:wechat -- -TargetRoot D:\path\to\wechat-game-preview
```

同步成功后用微信开发者工具以“小游戏”项目打开目标目录。Agent 应按 [`wechat-agent-workflow.md`](wechat-agent-workflow.md) 使用官方 `wechatide-skill` 完成 initializer、compiler、debugger 和 automator 链路；业务工具只通过 PATH 中的 `wechatide` 调用，不使用 8.3 短路径或安装目录绝对入口。真机验收清单见 [`../platforms/wechat.md`](../platforms/wechat.md)。不要把开发者工具生成的私有配置、预览文件或目标目录内容复制回仓库。

## Python 环境

不要直接调用系统 `python`：WindowsApps 启动器可能不可执行，其他预装 Python 也不保证带有字体工具。

- Python 小版本由 `.python-version` 选择。
- 直接依赖声明在 `pyproject.toml`。
- 精确解析结果记录在 `uv.lock`，必须提交。
- 调整依赖使用 `uv add` 或 `uv remove`；不得直接向 `.venv` 执行 `pip install`。
- CI 或只读验证优先使用 `uv sync --locked` / `uv run --locked`，锁文件过期时应失败而不是静默更新。

## 字体子集

`scripts/subset_display_fonts.py` 默认收集 `app/` 内 HTML、CSS、JavaScript 与 JSON 的字符，并为 400/600/700 三个字重生成 WOFF2 子集。平台构建可以重复传入 `--text-root` 合并多个文本目录，通过 `--output-dir` 隔离产物，并用 `--format ttf` 生成宿主需要的 TTF；只要不传这些参数，H5 的扫描范围、目录和格式保持不变。相对路径均按仓库根目录解析。

微信小游戏专用 TTF 同时扫描 `app/` 与 `wechat/`，并与共享 H5 字体隔离：

```powershell
npm run fonts:subset:wechat
```

默认 Windows 源字体是 `C:\Windows\Fonts\NotoSerifSC-VF.ttf`。其他环境通过 `TOPO_SERIF_SOURCE` 或脚本 `--source` 参数指定合法的完整 Noto Serif SC 可变字体；完整源字体不提交仓库。

文案改动流程：

1. 修改所有静态与动态文案及相关回归测试。
2. 运行 `npm test`，读取缺失字形报告。
3. 如有缺字，运行 `npm run fonts:subset`。
4. 确认 H5 的三个字体 URL 与 `style.css` URL 仍直接引用离线包真实文件名，不添加查询参数或片段；微信小游戏从代码包本地路径加载字体，以构建清单 SHA-256 识别变化。包版本由发布流程统一管理，不为平台适配单独升版。
5. H5 运行 `npm run check`，微信小游戏运行 `npm run check:wechat`，并在各目标视口确认字形、字重与排版。

字体许可见 [`licenses/OFL.txt`](../../licenses/OFL.txt)。

## 依赖变更原则

- 只安装完成当前仓库目标所需的依赖，优先使用已有标准库和仓库工具。
- 依赖变更必须包含用途说明、锁文件、验证结果和可回滚提交。
- 不提交全局环境、账号、令牌、机器私有配置、`.venv/`、缓存或下载产物。
- 新工具要提供稳定的仓库命令入口，避免要求协作者记忆解释器绝对路径。
