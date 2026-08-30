# Task 7 修复报告：七流形汇聚与电影化转场

日期：2026-08-30
分支：`codex/seven-realms-pv`
范围：Task 7 Fix round 1；未启动完整 FFmpeg render。

## 收敛结果

- 17 对相邻 scene 保持显式 transition contract；runtime 现在从当前出口与下一 scene 查询真实 `data-occlusion` / `data-match-shape` 节点，并消费各自的 clip/mask、shape、opacity 与 focus pull 参数。不存在 fallback geometry；cylinder 出口使用真实 `cylinder-section`，并与 torus `torus-inner-ring` 对接。
- Task 6 七章出口补齐真实几何查询接口；章节牌为同一节点集合提供 entry/outgoing match geometry，Klein、Möbius、projective 等拓扑使用不同轮廓参数。outro 与 end-card 增加 dark aperture / closing-light 节点，gallery→outro→end-card 不跳过 silhouette 阶段。
- gallery 移除 SVG/polyline 路径 overlay，挂载七个独立的 `GameRenderAdapter` 实例与透明 Canvas；每个实例只使用一个真实 Task 3/6 demo/path ID，完成 final-five / morph / rotation 映射后按章节顺序点亮。
- gallery duration 调整为 9.2s；camera withdrawal 由 142.8s 延续至 149.2s，与 147s 首条 outro narration 重叠，并保留 161s end-card 的尾音空间。

## 可复现视觉证据

运行 `node video/footsteps-return/scripts/capture-transition-evidence.mjs` 会在 `artifacts/pv-transition-scenes-task7/` 输出 7 张原生 3840×2160、deviceScaleFactor 1 的静帧，并生成联系表与 manifest：

- cylinder→torus：49.30s / 49.69s / 50.02s（前 / 中 / 后）
- torus→Möbius：66.69s 中段
- Möbius→Klein：82.69s 中段
- gallery withdrawal：146.90s 与 148.40s（后者覆盖 147s outro narration）

manifest 同时保存 transition selector、occlusion geometry、消费状态、source/target bbox 与 camera transform；联系表仅作导航，独立原帧均已落盘。完整成片交由 Task 11。

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
