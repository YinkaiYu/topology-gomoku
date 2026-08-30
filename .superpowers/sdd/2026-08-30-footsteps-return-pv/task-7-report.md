# Task 7 修复报告：七流形汇聚与电影化转场

日期：2026-08-30
分支：`codex/seven-realms-pv`
范围：Task 7 基础实现与 Fix round 1–3；未启动完整 FFmpeg render。

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

## Fix round 3：独立解码 PNG 与实时几何复核

### 根因与实现

- 旧证据测试只检查 PNG 签名与 IHDR 尺寸，随后直接相信 manifest 中的 `pixels` 与 `observation.geometry`；替换实际 PNG 或篡改 geometry 记录都不会被真实内容门禁捕获。
- 测试现在把 7 张实际 artifact PNG 逐张载入 Chromium `Image`，绘制到 480 × 270 canvas 并从 `getImageData()` 独立重算 mean、variance、non-pure-color ratio，以及相对四角背景色的 content bbox / pixel ratio。实际重算值既要通过非平坦、非纯色与有效 bbox 门槛，也必须在明确容差内匹配 manifest 记录。
- manifest 的像素记录补入 background 与 `contentBbox`。7 帧实际 content bbox 均有效：三张 cylinder→torus 为 `113×145`、`76×131`、`109×78`；torus→Möbius 为 `114×117`；Möbius→Klein 为 `119×97`；gallery 两帧为 `348×172`、`317×159`（均为 480 × 270 测量坐标）。联系表内容与 SHA-256 保持不变：`87a076df04c7bbc800206fa9dc83eb14cf1106c13e4ffb223ab495342191515a`。
- 对 manifest 的每个 seek，测试重新驱动真实 composition timeline，读取指定 contract 的 `occlusion` / `outgoing-match` / `incoming-match` 三层 side、geometry、opacity 与 bbox；geometry 逐项匹配 `expectedGeometry`，同时将 opacity/bbox 与记录值做容差复核。50.02s 额外要求 live incoming `torus-inner-ring` opacity > 0、bbox 有效，且实际 PNG 像素非黑。

### RED / GREEN

- RED：新增两个负例后，`node --test tests/pv-transitions.test.js` 得到 7 pass / 2 fail。纯黑 3840 × 2160 PNG 替换 fixture 因缺少独立像素门禁失败；把 50.02s manifest incoming geometry 篡改为 `tampered-inner-ring` 因缺少 live-runtime 对照失败。
- GREEN：实现独立 PNG 解码、content bbox 门禁与 live geometry 比较后，focused transitions 得到 9/9 pass；两个负例均由目标校验错误拒绝，实际 7 帧均通过像素与实时几何复核。

### Fix round 3 验证

- `node --test tests/pv-transitions.test.js`：通过（9/9，包含实际 PNG 解码、实时 runtime seek 与两个负例）。
- `npm test`：通过（132/132）。
- `npm run pv:validate`：通过（manifest valid；Lint / Runtime / Layout / Motion 均 0 issue；Contrast 2/2）。
- `node video/footsteps-return/scripts/capture-transition-evidence.mjs`：通过（7 张原生 4K 图像保持确定性，manifest 新增 content bbox）。
- `npm run docs:check` 与 `git diff --check`：通过。
- 按要求未启动完整 FFmpeg render。

## Fix round 4：background 与三层几何记录成为强制证据

### 根因与实现

- PNG 独立解码已重算四角背景色，但旧 helper 未读取 `pixels.background`，所以删除或篡改 manifest 背景记录都不会影响门禁。现在背景记录必须是恰含 `red`、`green`、`blue` 的 8-bit 整数结构，三个通道均需在 ±1 容差内匹配实际 PNG 解码值。
- `assertLiveGeometryMatches()` 过去把 recorded geometry 默认成 `null`，并把记录侧的 side、geometry、opacity、bbox 比较整体放在条件分支中；删除整个 `observation.geometry` 会静默跳过。现在记录必须按 `occlusion`、`outgoing-match`、`incoming-match` 的明确顺序恰含三层；每层强制提供非空 geometry、0–1 的有限 opacity，以及恰含 x / y / width / height 的有效 bbox。
- 三层记录无条件与同一 seek 的 live runtime 比较，并分别与 `expectedGeometry` 对照；live opacity 与 bbox 继续使用原有 0.02 / 2 px 容差。直接 PNG 解码、runtime seek、50.02s torus inner-ring 与非黑像素断言均保留。
- 新增五个负例，覆盖 background 整体删除与通道篡改，以及 observation.geometry 整体删除、单层删除与 geometry 篡改。现有 7 张 PNG、capture plan、manifest 数据与运行时均无需重生成或修改。

### RED / GREEN

- RED：加入负例后运行 `node --test tests/pv-transitions.test.js`，得到 11 pass / 3 fail；缺失 background、篡改 background、删除整个 observation.geometry 三项均因旧 helper 未消费记录而出现 `Missing expected exception`。单层删除与 geometry 篡改负例在旧比较下已通过，证明这两条既有路径未回退。
- GREEN：收紧 helper 后 focused transitions 得到 14/14 pass；五个负例全部由对应 schema 或 live-runtime 比较拒绝，7 个真实 manifest 帧继续通过独立 PNG 解码、三层 runtime seek 与 50.02s 专项门禁。

### Fix round 4 验证

- `node --test tests/pv-transitions.test.js`：通过（14/14）。
- `npm test`：通过（137/137）。
- `npm run pv:validate`：通过（manifest valid；Lint / Runtime / Layout / Motion 均 0 issue；Contrast 2/2）。
- 未修改运行时、视觉资产或 capture manifest，按要求未重抓图片、未启动 FFmpeg render。
