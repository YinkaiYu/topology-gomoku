# Design QA — Reversible Liquid Glass Motion

**Source visual truth**

- Full liquid-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-7408dca3-a499-46c7-920f-f4b32fbf37d6.jpg` (1170 × 2532 px, normalized to 390 × 844 px).
- Static switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-cceea952-0fe3-4952-acd6-a618405301a9.jpg`.
- Pressed switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-579c1a54-363f-4caf-a307-f735422b56f0.jpg`.
- Enlarged pressed-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-871c210e-6cf1-4b34-9be7-282c6b17a24c.jpg`.

**Implementation evidence**

- Settings on: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-v132-390x844.jpg` (390 × 843 px).
- Settings off: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-toggle-off-v131-390x844.jpg` (390 × 843 px).
- Game: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-game-v132-390x844.jpg` (390 × 843 px).
- Home: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-home-v132-390x844.jpg` (390 × 843 px).
- Full comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-glass-full-comparison.jpg`.
- Focused switch comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-switch-focused-comparison.jpg`.

**Viewport and state**

- Browser: Codex in-app Browser.
- CSS viewport override: 390 × 844; captured implementation bitmap: 390 × 843; device density normalized to one screenshot pixel per captured CSS pixel.
- States: settings fully open, difficulty set to 深思, switches on and off, game screen, home collection screen.

**Findings**

- No remaining P0/P1/P2 finding.
- P3: the in-app Browser capture surface does not retain a pointer-down frame long enough to save a direct pressed-state screenshot. The pressed deformation is covered by the implemented pointer path and regression checks: both axes expand, the glass can exceed the stable track, and the track remains stationary.

**Required fidelity surfaces**

- Fonts and typography: embedded Topo Serif remains active; title, labels, control text, line height, and hierarchy remain legible through the more transparent material.
- Spacing and layout rhythm: settings rows, segmented control, switches, close button, and completion button remain aligned at 390 × 844. No overflow or clipped persistent control was observed.
- Colors and visual tokens: blur and white reflection were reduced; background transmission remains visible; refractive edge colors are restricted to narrow rims. Teal remains the only strong semantic accent.
- Image quality and assets: existing brand and topology assets remain unchanged and sharp. No visual asset was replaced with a placeholder.
- Copy and content: settings labels and all game copy are unchanged.

**Full-view comparison evidence**

- `qa-liquid-glass-full-comparison.jpg` shows the source and implementation at the same normalized phone width. The implementation preserves the source hierarchy of transparent panel, restrained blur, narrow edge rim, stable tracks, and floating glass controls without importing the source's unrelated system layout.

**Focused region comparison evidence**

- `qa-switch-focused-comparison.jpg` compares source static/pressed references with implementation on/off states. The implementation knob is visually distinct from its stable track and uses a translucent rim rather than a solid white plastic appearance.

**Comparison history**

1. Baseline — `qa-liquid-glass-baseline-comparison.jpg`
   - Earlier finding P1: settings read as a mostly opaque frosted white card rather than transparent glass.
   - Earlier finding P2: the frame and control tracks deformed together with the thumb, weakening the layered material model.
   - Earlier finding P2: highlights, blur, and edge color were too strong and drifted toward 3D skeuomorphism.
2. Fixes made
   - Reduced panel blur and fill opacity, narrowed edge reflections, and retained more background information.
   - Kept segmented and switch tracks stationary; deformation and settlement now belong only to the glass thumb/knob.
   - Unified settings open/close and card/board enter/return to the same 460 ms time-reversal-symmetric curve.
   - Added a shared soft-body layer so the panel edge texture, text, sliders, switches, and buttons deform with the same tapered geometry.
   - Removed collection breathing entirely after return-flow testing showed animation-phase resets could create a visible handoff flash.
   - Made active glass thumbs expand on both axes, float beyond their stationary tracks, and transmit/refract the track beneath them.
   - Added the same restrained liquid-glass material to the game turn-status capsule.
3. Post-fix evidence
   - Full and focused final comparisons listed above show no remaining P0/P1/P2 mismatch.

**Primary interactions tested**

- Open settings; close with ×; close with 完成; select opponent difficulty; toggle hint on/off; return between game and journey.
- Pointer-drag logic for difficulty, switches, and sheet dismissal is covered by regression assertions; direct hold-frame capture remains the P3 gap noted above.
- No uncaught failure surfaced during the browser flow; the current Browser surface does not expose a console-message stream for archival.

**Implementation checklist**

- [x] Transparent, restrained liquid-glass material.
- [x] Stable tracks with Q-elastic glass thumbs.
- [x] Reversible tapered sheet open/close.
- [x] Matched 460 ms card-to-board and board-to-card motion.
- [x] Soft-body deformation shared by panel edge and internal UI.
- [x] Top-region drag-to-dismiss behavior.
- [x] Static collection art with no return-transition phase jump.
- [x] Liquid-glass turn-status capsule.
- [x] Responsive 390 × 844 visual check.

final result: passed
