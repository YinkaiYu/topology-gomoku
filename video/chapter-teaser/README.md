# 章节预告 PV「七界足迹」

本目录保存可复现的章节预告 PV 源工程。画面由真实拓扑规则、参数曲面、内嵌字体和确定性 Canvas 合成器生成；FFmpeg 负责编码、混音与验证。大体积语音、音乐分轨、临时帧和视频全部写入仓库根目录的 `.tmp/`，不会提交 Git。

设计与内容约束见 [`DESIGN.md`](DESIGN.md)，旁白和七章数据见 [`story.json`](story.json)，素材来源见 [`provenance.json`](provenance.json)。

## 预期命令

实现完成后由以下仓库命令驱动：

```powershell
npm run pv:audio
npm run pv:keyframes
npm run pv:preview
npm run pv:verify
```

- `pv:audio`：生成本地审阅旁白、原创配乐、音效、字幕和帧清单。
- `pv:keyframes`：输出 4K 关键帧与联系表，供视觉 QA。
- `pv:preview`：流式渲染 1080p 审阅版，不保留完整 PNG 序列。
- `pv:verify`：检查清单、规则路径、字体、音视频规格与 QA 文件。

4K60 母版只在审阅版获得明确确认后渲染。渲染不会自动合并分支或更新任何发行分支。
