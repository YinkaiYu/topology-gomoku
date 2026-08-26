# 拓扑五子棋

一款为小红书小工具容器设计的离线小游戏。玩家在平面、圆柱、莫比乌斯带、环面、克莱因瓶等拓扑棋盘上与本地 AI 对弈，逐关解锁新的边界规则。

## 技术方案

- 原生 HTML / CSS / JavaScript
- Canvas 2D 棋盘与动效
- Web Audio 即时合成音效
- 本地 AI 与 `localStorage` 进度存档
- 无运行时依赖、无网络请求

## 开发与验证

直接打开 `app/index.html` 可以预览。建议通过本地静态服务器预览，以贴近 WebView 行为。

```powershell
npm test
npm run validate
npm run build
```

构建产物输出到 `release/topology-gomoku.zip`，其中 `index.html` 位于压缩包根目录，可直接交给小红书小工具模拟器。

