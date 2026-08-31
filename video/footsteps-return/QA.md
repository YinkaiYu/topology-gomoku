# 《拓扑五子棋》章节预告 PV—「足迹回环」QA

> 本记录随 `legacy/seven-realms-pv` 冻结。最终 4K 媒体未完成，下列自动化与联系表只证明已覆盖的静态和源工程契约，不构成成片验收。

本文件记录当前 3840×2160、60fps 技术预览的可复现证据、自动检查和明确的人审边界。最终视频、逐帧缓存、母带 WAV 和本地独立截图位于被忽略目录；长期证据只使用仓库相对路径。

## 证据覆盖

| 范围 | 当前证据 | 可证明内容 |
| --- | --- | --- |
| 完整动画结构 | `../../artifacts/pv-footsteps-return-task11-animation-map.svg` | 18 个主场景、46 条字幕、21 个稀疏 SFX、214.040 秒语义时间线与 24 个审片采样点 |
| 原生 4K 代表帧 | `../../artifacts/pv-footsteps-return-task11-contact-sheet.png` | 片头 1 帧、七张章节牌、七章规则证据、七章 morph hero、gallery 与 end card，共 24 帧 |
| 机器可读绑定 | `../../artifacts/pv-footsteps-return-task11-evidence.json` | 3840×2160 viewport、60fps 整帧 seek、每帧 SHA-256/可见场景/章节状态、当前母带字节与 SHA-256、75 文件画面 contract 与 2 文件证据工具 contract |
| 最终媒体 | `renders/footsteps-return-4k.mp4`（忽略） | 由 `tests/pv-output.test.js` 对实际 MP4 执行流、帧、解码、黑场、冻结、响度、真峰值和尾音检查 |

联系表在原生 4K viewport 下生成；另以原始分辨率载入并检查 `01-intro-hidden-adjacency.png`、`03-chapter-evidence-plane.png`、`15-chapter-evidence-klein.png`、`23-seven-world-gallery.png` 与 `24-end-card-identity.png` 五张独立 3840×2160 源帧。片头无品牌且暗部层次仍可辨；Plane 五连和 Klein 保持/翻转 helper 清楚；gallery 同时出现七个可区分流形；end card 只有一个游戏文字标识和一个从属但清晰的 IOP 标识；可见字幕保持单行、无标点、无裁切。证据生成器与输出测试共同拒绝多于一个可见字幕组、字幕换行、Unicode 标点、未完成 render readiness 或非 4K 画布。这是内部静帧检查，不等同于用户对动态 banding、motion blur 或整片节奏的确认。

## 技术门

- 源母带：214.040 秒、48kHz stereo PCM-24；渲染前同时核对 manifest 字节数与完整 SHA-256。
- 画面包络：12,843 个 CFR 帧，214.050 秒；保留全部源音频并追加 0.010 秒静音，不裁切片尾共振。
- 交付音频：从已认证 PCM 单次编码 AAC 192k；编码前应用测得的 `-0.35 dB` 余量以约束 AAC 真峰值上冲。
- 严格 readiness：浏览器布尔门在认证和全部六项依赖完成前保持 `false`；同长但字节不同的替换音频必须失败。
- 最终媒体测试必须在 `REQUIRE_PV_FINAL_OUTPUT=1` 下执行；普通 CI 没有被忽略的 MP4 时只跳过三个真实输出检查，不把缺少成片误报为通过。

最终 ffprobe、完整解码、黑场/冻结、响度、真峰值与尾音数值在渲染结束后写入本节；不得从源码或预期值冒充实测结果。

## 视觉与听审边界

自动化和 24 帧联系表覆盖字幕单行/零标点、字体就绪、章节状态、几何来源、画面尺寸和身份层级。它们不能完整判断连续播放中的旁白与画面同步、阅读节奏、黑场呼吸、match cut、motion blur、banding、转场速度或曲面运动质感。

没有作出主观普通话听审声明。普通话可懂度、音乐结构与章节情绪、旁白下配乐 ducking、SFX 遮蔽、片尾共振、连续 4K 播放和下游设备兼容均保留给用户审片。用户明确确认前，本分支不得合并。
