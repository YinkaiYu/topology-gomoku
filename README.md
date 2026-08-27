<div align="center">
  <img src="release/topology-gomoku-icon.png" width="112" alt="拓扑五子棋图标" />
  <h1>拓扑五子棋</h1>
  <p><strong>边界之外，也能连成一线。</strong></p>
  <p>
    <img alt="Vanilla JavaScript" src="https://img.shields.io/badge/Vanilla-JavaScript-F4DF4E?style=flat-square&logo=javascript&logoColor=111" />
    <img alt="Offline first" src="https://img.shields.io/badge/offline-first-27241F?style=flat-square" />
    <img alt="7 topologies" src="https://img.shields.io/badge/topologies-7-B85C38?style=flat-square" />
    <img alt="3 platforms" src="https://img.shields.io/badge/platforms-3-5A7D6A?style=flat-square" />
  </p>
  <p>一个把五子棋放进圆柱、莫比乌斯带、环面与克莱因瓶的离线小游戏。</p>
  <img src="promo/exports/topology-gomoku-cover-3x4.png" width="420" alt="拓扑五子棋封面" />
</div>

## 游戏不止有四条边

棋盘的边界会依照当前拓扑重新粘合：棋子可以从右侧走回左侧，也可能在穿越接缝时翻转方向。玩家不仅能以传统五连获胜；当对手已经不存在任何可完成的五连路径时，对局也会立即结束。

七段旅程从熟悉的平面出发，依次展开圆柱、环面、莫比乌斯带、克莱因瓶、实射影平面与球面。通关后，二维棋盘会连续弯曲成对应的三维曲面，获胜路径与棋子仍附着在真实拓扑坐标上。

## 平台路线

| 平台 | 分支 | 当前状态 | 发布目标 |
| --- | --- | --- | --- |
| 小红书小工具 | `xiaohongshu` | 已有可运行的离线 H5 版本 | 原生小工具 ZIP |
| B 站 Toy | `bilibili` | 分支与环境已就绪，待适配 | Bilibili Toy |
| 微信小程序 | `wechat` | 分支与环境已就绪，待适配 | 微信小程序 |

`dev` 是日常集成分支，`main` 是稳定的跨平台基线。三个发行分支只承载各平台所需的原生适配与发布配置；共享玩法先进入 `dev`，稳定后同步到 `main`，再合入各发行分支。

## 本地运行

当前共享实现是无运行时依赖的 HTML / CSS / JavaScript。直接打开 `app/index.html` 即可预览，也可以用任意本地静态服务器获得更接近 WebView 的行为。

```powershell
npm test
npm run validate
npm run build:xiaohongshu
```

小红书构建产物位于 `release/topology-gomoku.zip`。开发者模式可通过 `app/index.html?dev=1` 或 `app/index.html#dev` 开启。

## 仓库地图

```text
app/          当前共享游戏与小红书 H5 基线
tests/        拓扑规则、动效与包结构测试
scripts/      校验、构建与图形生成脚本
release/      品牌图标与本地发布产物
promo/        宣传封面及其可复现素材
artifacts/    视觉回归与设计 QA 证据
docs/         分支、worktree 与发布协作约定
.codex/       小红书小工具平台规范 skill
```

详细的分支流、worktree 布局和发布规则见 [仓库与分支指南](docs/REPOSITORY.md)。

## 一起创造奇怪的棋盘

我们欢迎新的拓扑规则、关卡叙事、AI 策略、动效、无障碍改进，以及对新平台的原生实现。AI 辅助贡献完全欢迎，但提交者仍需要理解并验证最终改动。

开始之前请阅读 [贡献指南](CONTRIBUTING.md)；协作 Agent 还应阅读根目录的 [AGENTS.md](AGENTS.md)。

字体文件遵循 [SIL Open Font License](licenses/OFL.txt)。项目源代码许可证将在首次正式开源发行前单独确定。

<div align="center">
  <sub>Made for people who look at an edge and wonder what happens on the other side.</sub>
</div>
