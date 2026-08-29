# Task 6 report: seven differentiated continuous chapter scenes

## Outcome

- Replaced all seven chapter placeholders with dedicated scene factories driven by the real `GameRenderAdapter` in one persistent transparent iframe / Canvas per chapter.
- Each chapter now seeks deterministically through establish → every helper breath → drops 1–5 → representative five hold → morph 0–1 → formed hold → finite rotation. Rewinding rebuilds the same state without reloading the iframe.
- Klein runs `preserved-crossing` 1–5 and then `reflected-crossing` 1–5 on the same Canvas; only the second path continues into the native morph. Torus and projective show both crossing breaths.
- Plane keeps morph identity and receives only a restrained camera lift / tilt. The six non-plane chapters retain the real game morph as evidence and add high-density local Three.js surfaces only as low-contrast photographic shadow.
- Chapter stages are centered, complete, frameless, transparent, and free of explanatory microcopy. Every scene ends with a geometry / shadow occlusion outlet for Task 7.

## Differentiation

| Realm | Rule evidence | Camera | Exit |
| --- | --- | --- | --- |
| Plane | finite bounded board | suspended plane lift | plane shadow |
| Cylinder | one preserved side cycle | axial side closure | cylinder wall |
| Torus | two preserved cycles | dual-axis orbit | torus aperture |
| Möbius | one reflected half-turn | half-roll reveal | ribbon |
| Klein | preserved / reflected pair | paired memory orbit | bottle neck |
| Projective | both edge pairs reflected | mirrored convergence | crosscap |
| Sphere | adjacent-edge continuation | adjacent polar arc | horizon |

The chapter lights use exact PV design tokens: Cylinder remains teal `#3f8c87`, while Torus now has the distinct restrained deep-blue token `#385f78`; the other five colors are unchanged. The decorative Three.js meshes sample the copied real `TopologyMorph.surfacePoint` mapping at 96 × 72 subdivisions; local Three 0.185.1 runtime copies and all seven topology SVG copies are registered in the unified asset manifest with provenance.

## TDD and browser evidence

- RED: `node --test tests/pv-chapters.test.js` failed 4/4 because chapter modules, live controllers, and occlusion outlets did not exist.
- GREEN: the same file originally passed 5/5 after implementation; fix round 1 extends it to 7/7 with adjacent-frame Canvas pixel regressions, Klein paired-memory coverage, true 4K backing checks, and a committed 17-frame evidence manifest.
- Real Chromium covers seven chapters / eight helper paths, every drop 1–5, all declared crossing breaths, fifth-stone handoff, morph endpoints, formed hold, rotation, same-instance rewind, centered / uncropped layout, zero helper prompt text, and GSAP-driven terminal seek.
- `tests/pv-composition.test.js` now verifies the seven copied topology assets byte-for-byte against their repository sources.

## Visual QA

- Baseline: `artifacts/pv-chapter-scenes-task6-baseline-1920x1080.png`, SHA-256 `ab7e700fd99e37d8d07ea80a6a5736d593492395b6aaaedcfeb95450fcebf7d1`.
- Contact sheet: `artifacts/pv-chapter-scenes-task6-contact-sheet.png`, SHA-256 `4f7a8a132a3b337588aa477dd66a1b3d3a0ec0215145934d19dc42c32065616d`.
- `node ./video/footsteps-return/scripts/capture-chapter-evidence.mjs` recreates 17 committed 1920 × 1080 frames under `artifacts/pv-chapter-scenes-task6/`: Torus and Projective each expose both crossing breaths, Klein exposes preserved and reflected path evidence separately, and every chapter has a morph hero. Task 11 remains responsible for uniform final 4K evidence.
- The regenerated 17-frame contact sheet was visually inspected in this fix round: the listed crossing guides are separately legible, the boards and hero surfaces remain centered and complete, and no device shell or explanatory microcopy appears. This statement is limited to the regenerated contact sheet rather than claiming review of unlisted frames.

## Fix round 1: renderer handoffs

- Root cause: entering `win-hold` changed the real app Canvas from its helper renderer to its completion renderer even at `morph=0`. The PV adapter now reconstructs the canonical fifth-stone helper frame into an offscreen Canvas, renders the native completion state, and deterministically interpolates those two real renders back onto the same visible Canvas. The player app is unchanged.
- Real Chromium adjacent-frame regression covers all six non-plane chapters. Fifth-stone end → first hold and last hold → morph zero are pixel-identical in the current run; the first 60fps non-zero morph changes 0.27%–1.02% of pixels, and each subsequent tested morph interval continues changing.
- Klein now reserves an explicit `paired-memory` state between its two paths: the preserved five settles, fades into a restrained memory, clears smoothly into the reflected establish frame, and only then runs reflected drops 1–5 into morph. Both paired-memory boundaries are pixel-continuous and the state exposes from/to demo metadata plus reversible progress.
- The six Three.js photographic-shadow canvases now use actual 3840 × 2160 backing stores at pixel ratio 1; tests inspect `canvas.width` / `canvas.height`, not descriptive metadata.
- Adapter offscreen buffers are recreated when `selectShot` replaces its source iframe, preserving eight-path reversible morph hashes. Buffer contexts opt into frequent readback so HyperFrames runtime inspection remains warning-free.

## Verification

- `npm test`: 123/123 tests pass after fix round 1.
- `npm run validate` and `npm run docs:check`: package and documentation validation pass.
- `npm run pv:lint`: 0 errors, 0 warnings.
- `npm run pv:validate` and `npm run pv:inspect`: manifest, runtime, layout (0 issues / 9 samples), motion, and contrast all pass.
- `npm run pv:doctor`: Node.js, FFmpeg, eSpeak NG, MuseScore 4, fonts, and topology assets ready.
- `git diff --check`: pass.
- Supplementary HyperFrames animation-map generation was attempted but its installed skill script lacks the private `@hyperframes/producer` package; the repository-supported `hyperframes check` motion inspection passed with 0 errors and 0 warnings.

Documentation impact: `video/footsteps-return/DESIGN.md` now records the persistent real-Canvas chapter contract, and `docs/design/qa.md` records reproducible baseline / contact-sheet evidence. No product rules, platform contract, release flow, or public user copy changed.
