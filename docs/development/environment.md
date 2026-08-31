# 开发环境与依赖

仓库以 Node.js 运行测试、H5 校验和确定性 PV 画面合成，以 PowerShell 执行 Windows 构建脚本；Python 只用于确定性生成拓扑 SVG 和内嵌字体子集。章节预告 PV 另外使用 MuseScore 渲染原创乐谱，并由 FFmpeg / FFprobe 编码和验证音视频。

## 基础工具

| 工具 | 用途 | 约束 |
| --- | --- | --- |
| Node.js | 测试与 npm 任务 | `package.json` 要求 Node.js 18 或更高版本 |
| PowerShell | H5 校验、构建与字体命令入口 | 使用仓库脚本，不复制临时命令 |
| uv | Python 版本、虚拟环境与依赖锁定 | 以 `.python-version`、`pyproject.toml`、`uv.lock` 为准 |
| FFmpeg / FFprobe | PV 视频编码、音频封装与媒体规格验证 | 默认从 `PATH` 查找；音频构建可用 `FFMPEG_PATH` 覆盖 |
| MuseScore 4 | 从仓库内原创 MusicXML 乐谱渲染 PV 配乐 | 安装 MuseScore Basic 音色库；非默认位置用 `MUSESCORE_PATH` 覆盖 |

游戏 H5 没有运行时 npm 依赖；测试使用 Node.js 内置测试运行器。PV 开发工具依赖 `@napi-rs/canvas`，本地浏览预览可由 `playwright-core` 打开已安装的 Edge，这些版本锁定在 `package-lock.json`。Python 环境由 `uv` 隔离在 `.venv/`，缓存放在 `.uv-cache/`，两者都不提交 Git。

## 常用命令

```powershell
npm test
npm run validate
npm run check
npm run build:xiaohongshu
npm run fonts:subset
npm run release:check-versions -- X.Y.Z
```

- `npm run check` 同时执行逻辑测试、H5 包校验和文档检查。
- `npm run fonts:subset` 通过 `uv run --locked` 自动创建或同步 `.venv`，无需激活虚拟环境。
- `npm run release:check-versions -- X.Y.Z` 仅供维护者在稳定同步后检查 `main` 与三个发行分支的统一游戏版本。
- 首次同步需要下载 `uv.lock` 中的依赖；之后会复用锁定环境与本地缓存。

## 章节预告 PV

PV 的审阅版固定为 1920 × 1080、60 fps、H.264 / AAC；4K 母版固定为 3840 × 2160、60 fps、ProRes 422 HQ / 24-bit PCM。两者均使用 BT.709 与 48 kHz 双声道音频。完整流程和参数见 [`video/chapter-teaser/README.md`](../../video/chapter-teaser/README.md)。

```powershell
npm run pv:fonts
npm run pv:audio
npm run pv:keyframes
npm run pv:serve -- --open
npm run pv:preview
npm run pv:covers:selection
npm run pv:verify
```

- `pv:audio` 调用本地 MuseScore 4 的 MuseScore Basic profile 渲染 11 份已提交的原创 MusicXML 分谱，经 FFmpeg 归一后汇成钢琴、弦乐、低音/铜管、合唱、音效/打击五条总线，再与审阅旁白混合到帧对齐的 48 kHz 立体声母带。分谱源哈希变化时，`.tmp/` 中的渲染缓存会自动失效。
- `pv:serve` 是逐帧浏览器预览；`pv:preview` 才会把完整时间线流式编码为 1080p60 审阅视频。
- `pv:keyframes` 生成 4K 关键帧与联系表，默认写入 `.tmp/chapter-teaser/keyframes-4k/`；所有大体积中间产物都留在 `.tmp/`。
- `pv:covers:selection` 先重建经逐字校验的 08D / 09F 透明字标，再把实机 Logo、游戏拓扑 SVG、环游 4 × 4 格棋盘和已落盘的图片生成底图组合为 4:3、16:9、3:4 候选及真实像素缩略图；结果与哈希清单写入 `.tmp/chapter-teaser/cover-selection-exploration-v4/`。
- 本地审阅旁白依赖 Windows 系统的 Microsoft Kangkang 男声，只用于节奏、字幕与混音审阅，公开成片必须换成已授权的正式配音。
- 渲染器默认不覆盖现有文件；需要替换时显式传入 `--overwrite`。只有审阅版获得用户明确确认后，才运行 `npm run pv:master` 生成 4K60 母版；确认前不合并任务分支。

## Python 环境

不要直接调用系统 `python`：WindowsApps 启动器可能不可执行，其他预装 Python 也不保证带有字体工具。

- Python 小版本由 `.python-version` 选择。
- 直接依赖声明在 `pyproject.toml`。
- 精确解析结果记录在 `uv.lock`，必须提交。
- 调整依赖使用 `uv add` 或 `uv remove`；不得直接向 `.venv` 执行 `pip install`。
- CI 或只读验证优先使用 `uv sync --locked` / `uv run --locked`，锁文件过期时应失败而不是静默更新。

## 字体子集

`scripts/subset_display_fonts.py` 会收集 `app/` 内 HTML、CSS、JavaScript 与 JSON 的字符，并为 400/600/700 三个字重生成 WOFF2 子集。

默认 Windows 源字体是 `C:\Windows\Fonts\NotoSerifSC-VF.ttf`。其他环境通过 `TOPO_SERIF_SOURCE` 或脚本 `--source` 参数指定合法的完整 Noto Serif SC 可变字体；完整源字体不提交仓库。

文案改动流程：

1. 修改所有静态与动态文案及相关回归测试。
2. 运行 `npm test`，读取缺失字形报告。
3. 如有缺字，运行 `npm run fonts:subset`。
4. 同步更新三个字体 URL、`style.css` URL 与 `package.json` 版本缓存键。
5. 再运行 `npm run check`，并在目标视口确认字形、字重与排版。

字体许可见 [`licenses/OFL.txt`](../../licenses/OFL.txt)。

## 依赖变更原则

- 只安装完成当前仓库目标所需的依赖，优先使用已有标准库和仓库工具。
- 依赖变更必须包含用途说明、锁文件、验证结果和可回滚提交。
- 不提交全局环境、账号、令牌、机器私有配置、`.venv/`、缓存或下载产物。
- 新工具要提供稳定的仓库命令入口，避免要求协作者记忆解释器绝对路径。
