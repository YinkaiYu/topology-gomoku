# Design QA — Outward High-Refraction Liquid Glass

**Source visual truth**

- Full liquid-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-7408dca3-a499-46c7-920f-f4b32fbf37d6.jpg` (1170 × 2532 px, normalized to 390 × 844 px).
- Static switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-cceea952-0fe3-4952-acd6-a618405301a9.jpg`.
- Pressed switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-579c1a54-363f-4caf-a307-f735422b56f0.jpg`.
- Enlarged pressed-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-871c210e-6cf1-4b34-9be7-282c6b17a24c.jpg`.
- High-refraction pressed reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-5783ecfc-cfac-4d5c-ac1a-032d82c21819.jpg`.
- Earlier implementation references for clipping, insufficient vertical expansion, and excessive reflection: `codex-clipboard-b5971cfe-2ace-4112-9e1f-b4102db176be.png`, `codex-clipboard-68ac8c48-fd3e-4f82-98fb-c9f86a110e8d.png`, and `codex-clipboard-8fbac19c-0564-47b9-8bbe-3736c69fb50f.png`.

**Implementation evidence**

- Settings on: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-v133-390x844.jpg` (390 × 844 px).
- Direct pointer-down frame: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-lens-pressed-v133.jpg` (390 × 844 px).
- Release frames: `qa-liquid-release-0ms-v133.jpg`, `qa-liquid-release-120ms-v133.jpg`, and `qa-liquid-release-380ms-v133.jpg`.
- Refraction comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-refraction-comparison-v133.jpg`.
- Settings off: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-toggle-off-v131-390x844.jpg` (390 × 843 px).
- Game: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-game-v132-390x844.jpg` (390 × 843 px).
- Home: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-home-v132-390x844.jpg` (390 × 843 px).
- Full comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-glass-full-comparison.jpg`.
- Focused switch comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-switch-focused-comparison.jpg`.

**Viewport and state**

- Browser: Codex in-app Browser.
- CSS viewport override: 390 × 844; captured implementation bitmap: 390 × 843; device density normalized to one screenshot pixel per captured CSS pixel.
- States: settings fully open, difficulty set to 深思, switches on and off, direct pointer-down drag, immediate release, 120 ms release, 380 ms settlement, game screen, and home collection screen.

**Findings**

- No remaining P0/P1/P2 finding.
- Direct pointer-down frames now confirm that the glass expands on both axes while the track remains stationary and visible beneath it.

**Required fidelity surfaces**

- Fonts and typography: embedded Topo Serif remains active; title, labels, control text, line height, and hierarchy remain legible through the more transparent material.
- Spacing and layout rhythm: settings rows, segmented control, switches, close button, and completion button remain aligned at 390 × 844. No overflow or clipped persistent control was observed.
- Colors and visual tokens: white reflection and chromatic dispersion stay restrained. The dominant optical cue is one horizontally and vertically reduced transmission image of the track; the unrefracted track is suppressed beneath the lens so no double image remains. Teal remains the only strong semantic accent.
- Image quality and assets: existing brand and topology assets remain unchanged and sharp. No visual asset was replaced with a placeholder.
- Copy and content: the redundant black opponent-level toast was removed; the segmented slider itself is the only difficulty feedback.

**Full-view comparison evidence**

- `qa-liquid-glass-full-comparison.jpg` shows the source and implementation at the same normalized phone width. The implementation preserves the source hierarchy of transparent panel, restrained blur, narrow edge rim, stable tracks, and floating glass controls without importing the source's unrelated system layout.

**Focused region comparison evidence**

- `qa-liquid-refraction-comparison-v133.jpg` compares the earlier flat overlay, the iOS reference, and the direct pointer-down implementation. The final control visibly expands beyond its stationary track while a single transmitted image becomes smaller inside the lens.

**Comparison history**

1. Baseline — `qa-liquid-glass-baseline-comparison.jpg`
   - Earlier finding P1: settings read as a mostly opaque frosted white card rather than transparent glass.
   - Earlier finding P2: the frame and control tracks deformed together with the thumb, weakening the layered material model.
   - Earlier finding P2: highlights, blur, and edge color were too strong and drifted toward 3D skeuomorphism.
2. Fixes made
   - Reduced panel blur and fill opacity, narrowed edge reflections, and retained more background information.
   - Kept segmented and switch tracks stationary; deformation and settlement now belong only to the glass thumb/knob.
   - Unified settings open/close and card/board enter/return to the same 380 ms time-reversal-symmetric curve.
   - Added a shared soft-body layer so the panel edge texture, text, sliders, switches, and buttons deform with the same tapered geometry.
   - Removed collection breathing entirely after return-flow testing showed animation-phase resets could create a visible handoff flash.
   - Made active glass thumbs expand on both axes, float beyond their stationary tracks, and transmit/refract the track beneath them.
   - Separated translation from scale so release does not double-apply enlargement; removed the obsolete release glint animation and its final brightness jump.
   - Added a compressed lens image of the track for stronger refraction while reducing cyan/amber dispersion and mirror highlights.
   - Removed the layered transmission simulation that produced a double image; the lens now masks the original track locally and shows one reduced transmission image.
   - Removed the redundant opponent-level toast above the game.
   - Added the same restrained liquid-glass material to the game turn-status capsule.
3. Post-fix evidence
   - Full and focused final comparisons listed above show no remaining P0/P1/P2 mismatch.

**Primary interactions tested**

- Open settings; close with ×; close with 完成; select opponent difficulty; toggle hint on/off; return between game and journey.
- Pointer-drag logic for difficulty, switches, and sheet dismissal is covered by regression assertions and direct hold-frame captures.
- No uncaught failure surfaced during the browser flow; the current Browser surface does not expose a console-message stream for archival.

**Implementation checklist**

- [x] Transparent, restrained liquid-glass material.
- [x] Stable tracks with Q-elastic glass thumbs.
- [x] Reversible tapered sheet open/close.
- [x] Matched 380 ms card-to-board and board-to-card motion.
- [x] Soft-body deformation shared by panel edge and internal UI.
- [x] Top-region drag-to-dismiss behavior.
- [x] Static collection art with no return-transition phase jump.
- [x] Liquid-glass turn-status capsule.
- [x] Outward press growth for cards, icon buttons, regular buttons, thumbs, and knobs.
- [x] High-refraction compressed track image with restrained color dispersion.
- [x] Continuous release with no glint flash or double-scale overshoot.
- [x] Responsive 390 × 844 visual check.

final result: passed
