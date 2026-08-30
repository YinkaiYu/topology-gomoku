# Task 7 修复报告：七流形汇聚与电影化转场

日期：2026-08-30
分支：`codex/seven-realms-pv`
范围：Task 7 基础实现与 Fix round 1–2；未启动完整 FFmpeg render。

## 收敛结果

- 17 对相邻 scene 保持显式 transition contract；runtime 现在从当前出口与下一 scene 查询真实 `data-occlusion` / `data-match-shape` 节点，并消费各自的 clip/mask、shape、opacity 与 focus pull 参数。不存在 fallback geometry；cylinder 出口使用真实 `cylinder-section`，并与 torus `torus-inner-ring` 对接。
- Task 6 七章出口补齐真实几何查询接口；章节牌为同一节点集合提供 entry/outgoing match geometry，Klein、Möbius、projective 等拓扑使用不同轮廓参数。outro 与 end-card 增加 dark aperture / closing-light 节点，gallery→outro→end-card 不跳过 silhouette 阶段。
- gallery 移除 SVG/polyline 路径 overlay，挂载七个独立的 `GameRenderAdapter` 实例与透明 Canvas；每个实例只使用一个真实 Task 3/6 demo/path ID，完成 final-five / morph / rotation 映射后按章节顺序点亮。
- gallery duration 调整为 9.2s；camera withdrawal 由 142.8s 延续至 149.2s，与 147s 首条 outro narration 重叠，并保留 161s end-card 的尾音空间。

## 可复现视觉证据

运行 `node video/footsteps-return/scripts/capture-transition-evidence.mjs` 会在 `artifacts/pv-transition-scenes-task7/` 输出 7 张原生 3840×2160、deviceScaleFactor 1 的静帧，并生成联系表与 manifest：

- cylinder→torus：49.55s / 49.69s / 50.02s（前 / 中 / 后）
- torus→Möbius：66.69s 中段
- Möbius→Klein：82.69s 中段
- gallery withdrawal：146.90s 与 148.40s（后者覆盖 147s outro narration）

manifest 同时保存 transition selector、occlusion geometry、消费状态、source/target bbox 与 camera transform；Fix round 2 进一步加入 contractId、phase、seek、expectedGeometry、独立 runtime bbox 与像素内容指标。联系表仅作导航，独立原帧均已落盘。完整成片交由 Task 11。

## 验证

- `node --test tests/pv-transitions.test.js`：通过（4/4）
- `node --test tests/pv-chapters.test.js`：通过（7/7）
- `npm test`：通过（127/127）
- `npm run pv:lint`、`npm run pv:validate`、`npm run pv:inspect`：通过（0 errors / 0 warnings）
- `npm run pv:game-render:verify`：通过（paths 8/8、crossings 10、可逆）
- `npm run pv:doctor`：通过（可通过 doctor discovery 找到 FFmpeg / FFprobe 工具链）
- `npm run docs:check` 与 `git diff --check`：通过
- `node video/footsteps-return/scripts/capture-transition-evidence.mjs`：通过（7 帧、联系表、manifest）
- FFmpeg/FFprobe：当前 shell 未提供直接 callable 路径，未启动 draft/full render；记录为非阻塞关注点，Task 11 使用 `pv:doctor` 发现的路径处理。

## 自查

未引入 wipe / slide / translate 页面移动、持续跨屏连接线、额外 gallery 标题或总结句；timeline 仍为 165s、60fps、可逆 seek、无无限循环。变更与视觉证据已写入 `docs/design/qa.md`。

## Fix round 2：独立几何层、可见退镜与非黑证据

### 根因与实现

- 旧 runtime 直接在 selector 命中的场景源节点上依次写入 occlusion 与 match clip/mask；两种角色命中同一节点时，后写入的 match geometry 覆盖 occlusion。现在每个 contract 都创建独立的 `occlusion`、`outgoing-match`、`incoming-match` runtime 节点，源/目标 selector 只用于验证真实几何来源，不再被动画样式改写。
- `contract.matchId` 过去只落在 dataset。现在 `TRANSITION_MATCH_GEOMETRIES` 以 17 个 matchId 为唯一键，runtime 必须通过 matchId 解析 outgoing / incoming geometry；不同 matchId 会得到不同 clip、mask 或 shape。
- 删除 fallback span。`validateTransitionGeometryBindings()` 在 master timeline 建立前一次性解析 17 对 contract；selector 或 registry geometry 缺失时，错误同时包含 contract ID、selector 与 side。三层真实应用完成后才写入 `occlusionConsumed=true`，全部通过后 stage 才标记 `data-transition-geometry-ready=true` 与 `count=17`。
- gallery→outro 改为透明叠层的长交接：gallery 自 147s 起缓慢沉黑至约 149.28s，camera 原有 142.8–149.2s withdrawal 持续可见；outro 不透明度与暗场同时缓慢接管。真 Chromium 在 146.8 / 147.2 / 148.4 / 149.2s 读取 gallery opacity、camera transform 和整屏像素，148.4s 保持可辨空间内容。
- incoming match runtime 对延迟显影的章节牌延长至边界后；cylinder→torus 的 50.02s post 仍保留 torus inner-ring。证据脚本现在为每帧写入 `contractId`、`phase`、`seek`、`expectedGeometry`、三层 bbox/clip/mask/opacity 与像素均值、方差、非纯色比例。

### RED / GREEN

- RED：`node --test tests/pv-transitions.test.js` 得到 2 pass / 5 fail。失败分别证明 matchId registry/解析不存在、fail-fast validator 不存在、源节点仍被覆盖、146.8s gallery 已过早淡出，以及旧 manifest 缺少 geometry/pixel 证据。
- GREEN（focused）：`node --test tests/pv-transitions.test.js tests/pv-composition.test.js` 得到 17/17 pass；其中 transition focused 为 7/7 pass，包含真实 Chromium 四时刻采样与 7 张 4K PNG 内容门禁。
- 重新生成证据后，关键像素方差分别为：49.55s pre `8.22`、49.69s mid `10.71`、50.02s post `6.13`、66.69s `13.05`、82.69s `47.22`、146.90s `1199.71`、148.40s `61.68`；均超过非平坦阈值。联系表 SHA-256 为 `87a076df04c7bbc800206fa9dc83eb14cf1106c13e4ffb223ab495342191515a`。

### Fix round 2 验证

- `node --test tests/pv-transitions.test.js`：通过（7/7，真实 Chromium 3840 × 2160）。
- `node --test tests/pv-transitions.test.js tests/pv-composition.test.js`：通过（17/17）。
- `npm test`：通过（130/130）。
- `npm run pv:lint`：通过（0 errors / 0 warnings）。
- `npm run pv:validate`：通过（manifest valid；Lint / Runtime / Layout / Motion 均 0 issue；Contrast 2/2）。
- `npm run pv:inspect`：通过（0 errors / 0 warnings，0 layout issues）。
- `npm run pv:game-render:verify`：通过（paths 8/8、crossings 10、可逆、原生 morph 6）。
- `node video/footsteps-return/scripts/capture-transition-evidence.mjs`：通过（7 张原生 4K、联系表、manifest）。
- `npm run docs:check` 与 `git diff --check`：通过。
- 按要求未启动完整 FFmpeg render。
