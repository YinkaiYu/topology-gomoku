# Design QA — Stateful Liquid Glass and Magnetic Stone Drag

**Source visual truth**

- Full liquid-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-7408dca3-a499-46c7-920f-f4b32fbf37d6.jpg` (1170 × 2532 px, normalized to 390 × 844 px).
- Static switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-cceea952-0fe3-4952-acd6-a618405301a9.jpg`.
- Pressed switch reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-579c1a54-363f-4caf-a307-f735422b56f0.jpg`.
- Enlarged pressed-glass reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-871c210e-6cf1-4b34-9be7-282c6b17a24c.jpg`.
- High-refraction pressed reference: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-5783ecfc-cfac-4d5c-ac1a-032d82c21819.jpg`.
- Clean iOS pressed-glass reference used for the final same-state comparison: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-0d8c8ddb-4662-4d3b-858a-da164c6b6f92.jpg`.
- Rejected opaque-band implementation supplied by the user: `C:\Users\Newton\AppData\Local\Temp\codex-clipboard-992a6433-17a9-44bb-9d7f-e5e3a2b0d907.png`.
- Earlier implementation references for clipping, insufficient vertical expansion, and excessive reflection: `codex-clipboard-b5971cfe-2ace-4112-9e1f-b4102db176be.png`, `codex-clipboard-68ac8c48-fd3e-4f82-98fb-c9f86a110e8d.png`, and `codex-clipboard-8fbac19c-0564-47b9-8bbe-3736c69fb50f.png`.

**Implementation evidence**

- Embedded-font coverage for the finale card at 390 × 844: `artifacts/qa-font-gui-v1351.png`; “归圆” renders as one consistent local serif face.
- Sharper hand-drawn topology outlines at the same 390 × 844 viewport: `artifacts/qa-topology-glyph-lines-v1351.png`; all seven retain their original geometry, cel shading, and irregular ink treatment.
- Settings at rest after the state split: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-release-v135.png`.
- Difficulty held with one reduced refracted image: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-pressed-v135.png`.
- Difficulty after release with clear, unrefracted type: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-released-after-press-v135.png`.
- Stone held during a cross-cell drag and after magnetic settlement: `qa-stone-drag-snap-v135.png`, `qa-stone-drag-mid-v135.png`, and `qa-stone-drag-release-v135.png`.
- Settings at rest: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-settings-v134-final.png` (390 × 844 px).
- Direct difficulty pointer-down frame: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-slider-pressed-v134-final.png` (390 × 844 px).
- Direct switch overdrag frame: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-switch-overdrag-v134-final.png` (390 × 844 px).
- Same-state iOS/implementation comparison: `C:\Users\Newton\Documents\Codex\xiaohongshu-tools\artifacts\qa-liquid-ios-comparison-v134-final.jpg`.
- Stone pressed and released states: `qa-stone-pressed-v134-final.png` and `qa-stone-released-v134-final.png`.

**Viewport and state**

- Browser: Codex in-app Browser.
- CSS viewport: 390 × 844; captured implementation bitmap: 390 × 844.
- States: settings fully open, difficulty held, difficulty released, switches on/off, elastic right overdrag, stone pressed, stone crossing an inter-cell gap, and stone released.

**Findings**

- No remaining P0/P1/P2 finding.
- Direct pointer-down frames confirm a single transmitted track image, an outward glass rim, and elastic travel beyond the stationary track. The unrefracted source is locally occluded only while strong refraction is active.
- Release frames confirm the internal lens image fades out and the original label returns to a clear, undistorted resting state; only the restrained edge material remains.
- The enabled switches now settle at the actual right endpoint of the widened 66 px track.
- The stone remains continuously visible across cell gaps, travels toward the next valid intersection with a fast non-overshooting magnetic easing, and does not restart its landing animation at every crossed cell. It reaches the new intersection in roughly 100 ms at 60 fps, so it follows the finger without visible oscillation.

**Required fidelity surfaces**

- Fonts and typography: embedded Topo Serif remains active; title, labels, control text, line height, and hierarchy remain legible through the more transparent material.
- Spacing and layout rhythm: settings rows, segmented control, switches, close button, and completion button remain aligned at 390 × 844. No overflow or clipped persistent control was observed.
- Colors and visual tokens: white reflection and chromatic dispersion stay restrained. The dominant optical cue is one horizontally and vertically reduced transmission image of the track plus a directional edge rim; the earlier hard green stripe and duplicate label image are absent. Teal remains the only strong semantic accent.
- Image quality and assets: existing brand and topology assets remain unchanged and sharp. No visual asset was replaced with a placeholder.
- Copy and content: the redundant black opponent-level toast was removed; the segmented slider itself is the only difficulty feedback.

**Focused region comparison evidence**

- `qa-liquid-ios-comparison-v134-final.jpg` places the supplied iOS pressed switch and the implementation in the same comparison image. Both retain the stationary colored track, enlarge the clear control beyond it, compress the transmitted track inside the lens, and concentrate optical emphasis at the rim rather than in a broad highlight.
- The v1.35 pressed and released captures reuse that same calibrated 390 × 844 implementation state. A new three-panel local comparison page was prepared, but the chosen in-app Browser correctly blocked direct `file:` navigation; the existing combined comparison plus the new state captures were used without switching browser surfaces.

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
   - Replaced the rejected opaque white slab and hard horizontal color band with a dynamically aligned, clipped copy of the real track.
   - Removed duplicated refracted label text so the difficulty control has one readable transmitted image rather than a ghosted pair.
   - Corrected the widened switches from the obsolete 22 px endpoint to a 34 px endpoint, then reduced overdrag resistance and allowed the glass to travel visibly past the track.
   - Rebalanced switch press deformation from a tall bubble to a wider clear oval; reduced fill/blur and strengthened only the directional edge refraction.
   - Changed board placement so pointer-down performs the soft landing and uniform planar expansion; pointer release now restores the stone with a damped circular rebound.
   - Split glass optics by interaction state: strong, single-image refraction exists only under the finger; the resting thumb/knob is transparent and internally unrefracted with a restrained edge.
   - Preserved one pressed-stone render instance while dragging and moved it between valid intersections with a fast frame-rate-independent magnetic easing, so crossing cell gaps no longer causes disappear/reappear, repeated landing animation, laggy settlement, or conspicuous overshoot.
3. Post-fix evidence
   - Full and focused final comparisons listed above show no remaining P0/P1/P2 mismatch.

**Primary interactions tested**

- Open settings; close with ×; select opponent difficulty; drag beyond both switch endpoints; toggle hint/sound; press and release a legal board intersection.
- Pointer-drag logic for difficulty, switches, sheet dismissal, and continuous stone snapping is covered by 68 regression assertions and direct hold/mid-drag/release captures.
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
- [x] Single transmitted image with no duplicate label or hard color band.
- [x] Wider switch tracks with exact right-end settlement and lower-resistance overdrag.
- [x] Circular, board-plane stone compression on pointer-down and damped recovery on pointer-up.
- [x] Continuous release with no glint flash or double-scale overshoot.
- [x] Strong internal refraction only while pressed; clear undistorted label after release.
- [x] One continuous stone instance with damped magnetic snapping between empty intersections.
- [x] Responsive 390 × 844 visual check.

final result: passed

## 2026-08-28 — v1.36 liquid-control detents

**Evidence**

- Final settings state: `artifacts/qa-liquid-detents-v1360.png` at a 390 × 844 CSS viewport.
- Browser: Codex in-app Browser, using the same local offline H5 files that are packaged for the mini-tool.

**Interactions tested**

- Clicked directly from the middle difficulty to both outer difficulty stops.
- Dragged the difficulty thumb a partial step away from the active stop and released it.
- Clicked the hint switch from on to off and observed the complete travel and settlement.
- Checked the final settings layout, active labels, switch states, and browser console.

**Findings**

- Direct difficulty selection now travels continuously from the previous stop for about 540 ms instead of appearing at the destination in the pointer-up frame.
- The selected thumb makes one controlled positional overshoot and returns to its exact resting stop; the switch uses the same two-stop motion language.
- At the 390 px viewport, the strengthened curve maps a 27 px quarter-step pointer offset to about 13 px of target visual travel before the short drag transition, confirming stronger nonlinear detent attraction rather than one-to-one pointer tracking.
- No clipping, alignment regression, unreadable state, or browser warning/error was observed at 390 × 844.

final result: passed

## 2026-08-28 — v1.36.1 host chrome safe-area fallback

**Evidence**

- Before: `artifacts/qa-host-top-inset-before-360x770-v1360.png` at a 360 × 770 CSS viewport with a zero top safe area.
- After: `artifacts/qa-host-top-inset-android-360x770-v1361.png` at the same 360 × 770 viewport and zero top safe area.
- iOS guardrail: `artifacts/qa-host-top-inset-ios-game-v1361.png` at 390 × 844 with a simulated 59 px top safe area.

**Findings**

- At the Android/HarmonyOS-sized viewport, the previous combined padding was 35.7 px and the 42 px back/settings controls occupied y=41–83. The fallback raises padding to 76 px and moves both controls to y=81–123, clearing the host's floating-button row by 40 px.
- The 360 × 770 viewport remains exactly one viewport high with no document overflow. The board remains 328 × 328 and the action deck ends at y=656.
- With a 59 px iOS safe area, the existing additive safe-area behavior remains active: controls occupy y=102–144, the board remains 358 × 358, the action deck ends at y=708, and the document remains exactly 844 px high.
- Settings opened and closed successfully at 360 × 770, returning to the collection also succeeded, and no browser warning or error was recorded.

final result: passed

## 2026-08-28 — v1.36.1 level-card liquid entry

**Evidence**

- Before entry: `artifacts/qa-level-card-entry-before-v1361.png` at a 390 × 844 CSS viewport.
- Liquid overshoot: `artifacts/qa-level-card-entry-mid-v1361.png` at the same viewport.
- Settled board: `artifacts/qa-level-card-entry-settled-v1361.png` at the same viewport.
- Browser: Codex in-app Browser, using the local H5 files from the feature worktree.

**Interactions tested**

- Opened the first unlocked level from the directory and sampled the shared-element transition before, during, and after settlement.
- Compared the hero and level-grid bounds before entry and while the home screen was fading.
- Inspected the liquid shell's mid-transition transform, asymmetric radius, optical filter, final geometry, and browser console.

**Findings**

- The hero remained at `(20, 37.375)` and the level grid at `(20, 254.238)` before and during navigation; the directory now fades in place without the former 12 px downward motion.
- The overshoot frame reached directional scale `(1.034, 0.976)`, asymmetric `33 / 27 / 31 / 26 px` corners, and a restrained saturation/brightness lift before the damped recoil.
- The board settled exactly at unit transform, full opacity, and the authored 29 px radius.
- No clipping, alignment regression, browser warning, or browser error was observed.

final result: passed
