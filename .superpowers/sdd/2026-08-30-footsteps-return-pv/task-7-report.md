# Task 7 report: seven-world gallery and cinematic transitions

## Outcome

- Added `runtime/transitions.js` with one explicit contract for every adjacent pair in the 18-scene master timeline. Every contract uses the same four-stage cinematic grammar: real-geometry occlusion, controlled focus pull, short black color dip, and silhouette match-cut. The runtime animates only opacity, filter, and scale; no page movement or decorative connector layer is introduced.
- Wired the contracts into `runtime/master-timeline.js`, preserving the existing chapter exits from Task 6. Chapter exit geometry is used as the outgoing match source where available, while chapter cards and the gallery use their real silhouette targets. The transition veil is fixed to the stage and does not alter scene bounds.
- Added `compositions/seven-worlds.js`. The gallery mounts exactly seven unique surfaces in chapter order, with the existing Task 3/6 demo paths as the only illuminated paths. Klein keeps its two real demos as separate paths; no synthetic multi-boundary path or extra gallery copy is created. Surfaces reveal in a restrained stagger, then the camera withdraws once over a finite timeline.
- Added gallery/veil styling and updated the PV design contract plus long-lived QA evidence. The gallery keyframe contact sheet is [`artifacts/pv-seven-world-gallery-task7-contact-sheet.png`](../../../artifacts/pv-seven-world-gallery-task7-contact-sheet.png).

## Transition contracts

| Boundary | Contracted match |
| --- | --- |
| Cylinder → Torus | cylinder section → torus inner ring |
| Torus → Möbius | torus inner ring → Möbius twist center |
| Möbius → Klein | Möbius grazing mirror → Klein crossing |
| All other adjacent pairs | existing chapter exit geometry / next silhouette with the same focus-pull and black-dip grammar |

The gallery has no visible title, chapter card, summary sentence, or extra label. It leaves the final outro interval intact for the later title-card cadence.

## TDD and browser evidence

- RED: `node --test tests/pv-transitions.test.js` initially failed because the transition runtime and gallery scene did not exist.
- GREEN: `node --test tests/pv-transitions.test.js` passes 3/3. It checks all 17 adjacent contracts, prohibited transition families, exact seven-shape uniqueness, exact real path IDs/source module, no gallery copy, boundary coverage, unchanged scene bounds, and deterministic reversible seeking.
- The same 3840 × 2160 Chromium page was used for the gallery middle/withdrawal keyframes. The contact sheet was visually inspected: all seven silhouettes remain distinct and once-only, the two Klein paths remain separate, and the camera withdrawal is a scale pull rather than page motion.

## Verification

- `npm test`: 126/126 passed.
- `npm run pv:lint`: 0 errors, 0 warnings.
- `npm run pv:validate` / `npm run pv:inspect`: manifest, runtime, layout (0 issues / 9 samples), motion, and contrast checks passed.
- `npm run validate`: package validation passed.
- `npm run docs:check`: documentation validation passed.
- `npm run pv:game-render:verify`: paths 8/8, crossings 10, reversible=yes, nativeMorph=6, RAF queue ≤ 1.
- `git diff --check`: passed.

## Rendering note

The low-bitrate review render was not produced because this environment does not expose FFmpeg/FFprobe on `PATH`. This is a non-blocking environment note for Task 11; Task 11 should use the paths discovered by `pv:doctor`/the local toolchain before producing the complete 4K render. No release media was added to Git.

Documentation impact: `video/footsteps-return/DESIGN.md` now records the gallery and transition contract, and `docs/design/qa.md` records the reproducible gallery evidence. No game rules, platform adapter contract, or SemVer changed.
