<div align="center">
  <img src="release/topology-gomoku-icon.png" width="112" alt="拓扑五子棋图标" />
  <h1>拓扑五子棋</h1>
  <p><strong>边界之外，也能连成一线。</strong></p>
  <p>
    <img alt="离线游戏" src="https://img.shields.io/badge/完全离线-27241F?style=flat-square" />
    <img alt="七种拓扑" src="https://img.shields.io/badge/拓扑世界-7-B85C38?style=flat-square" />
    <img alt="五个发行渠道" src="https://img.shields.io/badge/发行渠道-5-5A7D6A?style=flat-square" />
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-4A6484?style=flat-square" />
  </p>
  <p>一个把五子棋放进圆柱、莫比乌斯带、环面与克莱因瓶的小游戏。</p>
  <img src="promo/exports/topology-gomoku-cover-3x4.png" width="420" alt="拓扑五子棋封面" />
</div>

## 熟悉的五子棋，陌生的世界

在这里，棋盘的边缘不是尽头。

棋子可以从右侧走回左侧，沿着莫比乌斯带翻转方向，或绕过环面的背面重新出现。第一关每次进入都会请你亲手逐颗完成基础五连；其余关卡首次游玩时，也会请你亲手下出一至两条跨界五连，重玩时再用短动画温习。从第二关起，对局中还可以随时轻触“边界演示”，重新体验本关的全部指引线路，或拖动二维/三维视角进度，在对局中慢慢观察拓扑变化；这些查看操作不会改变棋局，结束后继续原来的棋局。

但胜利不只属于先连成五颗的人。当你已经截断对手全部可能的五连路径，对局也会立即结束。小棋盘不再需要无意义地填满，每一步都在改变整个空间的可能性。

## 七个世界，一段旅程

| 世界 | 拓扑 | 边界之外 |
| --- | --- | --- |
| 方庭 | 平面 | 从最熟悉的五子棋开始 |
| 回廊 | 圆柱 | 左右两侧首尾相接 |
| 环游 | 环面 | 横向与纵向都没有尽头 |
| 扭带 | 莫比乌斯带 | 穿过接缝后，世界翻转 |
| 瓶界 | 克莱因瓶 | 一次环绕会改变前进的方向 |
| 双生 | 实射影平面 | 对面的边与倒影相连 |
| 归圆 | 球面 | 所有边界最终消失 |

通关时，棋盘会从当前的展开程度与观察角度，带着真实落子与获胜路径连续进入三维展示；球面的网格调整也保持连续。你可以拖动它、让它旋转，从另一个角度看见刚才那条不可能的五连。棋盘下方的细轨道支持连续拖动，两端“二维”“三维”可一键切换；键盘方向键微调，Home / End 直达两端。

## 一册可以游玩的拓扑图鉴

尚未通关的世界只留下神秘剪影。真正赢下一局之后，完整的几何体才会显现。七个关卡既是一段逐渐离开平面的旅程，也是一册由你亲手解锁的拓扑图鉴。

游戏完全离线运行，没有账号、广告或联网请求。进度保存在设备上，内置三档本地对手，也可以在第一关自由落子，先找回最普通的五子棋手感。

## 多渠道发行

- 小红书小工具：已发布，以共享 H5 基线生成完全离线的 ZIP 包
- Bilibili Toy：已发布，使用专属 adapter，并完成手机、平板与 PC 的响应式适配
- 微信小游戏：已发布，使用原生单 Canvas、宿主 adapter 与可复现的构建同步链路
- 个人网站：通过 `web` 发行分支生成静态目录，部署到网站的 `show/topology-gomoku/` 子路径
- 知乎 AI Works：已建立 `zhihu` 发行分支，以共享 `app/` 生成 CloudBase 静态交付输入；宿主发布与线上验证进行中

五个发行渠道共享同一套拓扑规则、关卡内容、视觉语言与游戏版本，并分别接入各自宿主或静态站点的生命周期、输入、安全区和发布边界。每次稳定版本仍需在各渠道分别完成构建、预览与发布验证。

微信版本沿用同一套拓扑规则、关卡内容与克制的液态玻璃美术，只把输入、生命周期、存储、音频和安全区接入微信小游戏原生 `wx` 能力。源码、构建、同步和验收边界见 [微信小游戏平台规范](docs/platforms/wechat.md)。

## 开发与文档

项目的设计语言、环境管理、分支/worktree 流程和视觉 QA 均从 [docs/README.md](docs/README.md) 进入。参与开发前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；Agent 还必须遵守 [AGENTS.md](AGENTS.md)。

## 把你的想法放上棋盘

想参与贡献？把下面这段话发给你的 Agent 就好：

```text
请帮我参与开源项目“拓扑五子棋”：https://github.com/YinkaiYu/topology-gomoku 。请先完整读取仓库里的 AGENTS.md 和贡献约定，确认当前分支与 worktree；从最新 dev 创建独立的 codex/<task> 分支和 worktree，选择一个范围清晰的 Issue 或小创意。完成实现、必要测试和自检后，在该任务 worktree 拉起本地预览交给我确认；得到我的明确确认前不要合并，确认后只向 dev 提交贡献。不要直接修改 main、dev 或长期发行 worktree，也不要提交密钥、构建产物或与任务无关的改动。dev 到 main 以及五个发行渠道的发布同步由仓库维护者负责。
```

<div align="center">
  <p>以 MIT License 开放。</p>
  <sub>Made for people who look at an edge and wonder what happens on the other side.</sub>
</div>
