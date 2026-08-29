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

All light colors reuse the existing design tokens. The decorative Three.js meshes sample the copied real `TopologyMorph.surfacePoint` mapping at 96 × 72 subdivisions; local Three 0.185.1 runtime copies and all seven topology SVG copies are registered in the unified asset manifest with provenance.

## TDD and browser evidence

- RED: `node --test tests/pv-chapters.test.js` failed 4/4 because chapter modules, live controllers, and occlusion outlets did not exist.
- GREEN: the same file passes 5/5 after implementation, including one additional RED→GREEN cycle for the reproducible 14-frame capture plan.
- Real Chromium covers seven chapters / eight helper paths, every drop 1–5, all declared crossing breaths, fifth-stone handoff, morph endpoints, formed hold, rotation, same-instance rewind, centered / uncropped layout, zero helper prompt text, and GSAP-driven terminal seek.
- `tests/pv-composition.test.js` now verifies the seven copied topology assets byte-for-byte against their repository sources.

## Visual QA

- Baseline: `artifacts/pv-chapter-scenes-task6-baseline-1920x1080.png`, SHA-256 `ab7e700fd99e37d8d07ea80a6a5736d593492395b6aaaedcfeb95450fcebf7d1`.
- Contact sheet: `artifacts/pv-chapter-scenes-task6-contact-sheet.png`, SHA-256 `84f0bbab35e9651b93dd5349fa21deac33496363acd01b80d7e2203e486eb0f6`.
- `node ./video/footsteps-return/scripts/capture-chapter-evidence.mjs` recreates all fourteen 1920 × 1080 review frames plus the contact sheet from deterministic timeline seeks. Task 11 remains responsible for uniform final 4K evidence.
- Manual inspection found every real board centered and complete, crossing guides legible without text, all five stones retained through hero morphs, no device shell, and restrained background effects subordinate to the board.

## Verification

- `npm run check`: 121/121 tests, package validation, and documentation validation pass.
- `npm run pv:lint`: 0 errors, 0 warnings.
- `npm run pv:validate` and `npm run pv:inspect`: manifest, runtime, layout (0 issues / 9 samples), motion, and contrast all pass.
- `npm run pv:doctor`: Node.js, FFmpeg, eSpeak NG, MuseScore 4, fonts, and topology assets ready.
- `git diff --check`: pass.
- Supplementary HyperFrames animation-map generation was attempted but its installed skill script lacks the private `@hyperframes/producer` package; the repository-supported `hyperframes check` motion inspection passed with 0 errors and 0 warnings.

Documentation impact: `video/footsteps-return/DESIGN.md` now records the persistent real-Canvas chapter contract, and `docs/design/qa.md` records reproducible baseline / contact-sheet evidence. No product rules, platform contract, release flow, or public user copy changed.
