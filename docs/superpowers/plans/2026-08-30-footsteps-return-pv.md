# 《拓扑五子棋》章节预告 PV—「足迹回环」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作可复现、可逐帧检查的 16:9 章节预告 PV，以真实游戏规则演示串联七种拓扑流形，并交付 4K/60fps 成片、原创配乐和完整工程。

**Architecture:** 在 `video/footsteps-return/` 建立独立 HyperFrames 工程。真实游戏由 PV-only 同源 HTML adapter 挂载现有 `app/`，以透明、持久的 iframe/Canvas 和显式逐帧状态 API 直接参与合成；章节、字幕和片尾在 HyperFrames 中编排。制作控制逻辑不进入玩家版本。

**Tech Stack:** HyperFrames 0.8.18、GSAP 3.14.2、Three.js 0.185.1、Playwright 1.62.1、Tone.js 15.1.22、`@tonejs/midi` 2.0.28、Node.js 24、FFmpeg 9、eSpeak NG 1.52、MuseScore 4、Node 内置测试运行器。

**Source Spec:** [`../specs/2026-08-30-seven-realms-pv-design.md`](../specs/2026-08-30-seven-realms-pv-design.md)

## Implementation constraints

- [ ] Keep game SemVer at `1.37.2`; this production task does not create a game release.
- [ ] Use only the real game render adapter for rule evidence. Do not redraw the board in the PV layer.
- [ ] Keep all captions single-line, white with black outline, without a full stop, card, shadow, glow, or word-by-word animation.
- [ ] Never narrate chapter cards. Each card must show `ACT.` line, chapter name, and topology name.
- [ ] Use camera occlusion, surface morphs, short black, and match cuts for transitions; do not use wipes, cross-screen connector lines, or slide transitions.
- [ ] Keep the opening free of the Institute of Physics mark; show the game title and a prominent IOP logo only on the final card.
- [ ] Commit source, manifests, score source, captions, tests, and provenance. Ignore frame sequences, caches, rendered WAV intermediates, and final videos.

## Task 1: Lock the production toolchain and scaffold the composition

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `.gitignore`
- Modify: `docs/development/environment.md`
- Create: `video/footsteps-return/DESIGN.md`
- Create: `video/footsteps-return/index.html`
- Create: `video/footsteps-return/src/bootstrap.js`
- Create: `video/footsteps-return/src/styles.css`
- Create: `video/footsteps-return/hyperframes.config.json`
- Create: `video/footsteps-return/scripts/doctor.mjs`
- Test: `tests/pv-toolchain.test.js`

- [ ] Write `tests/pv-toolchain.test.js` first. Assert exact npm dependency versions, required PV scripts, the presence of `DESIGN.md`, a 3840×2160/60fps composition configuration, and ignored generated directories.
- [ ] Run `node --test tests/pv-toolchain.test.js` and confirm it fails because the scaffold is absent.
- [ ] Install local packages with exact versions: `hyperframes@0.8.18`, `@hyperframes/shader-transitions@0.8.18`, `playwright@1.62.1`, `three@0.185.1`, `tone@15.1.22`, and `@tonejs/midi@2.0.28`. Commit the resulting lock file.
- [ ] Add repository commands: `pv:doctor`, `pv:lint`, `pv:validate`, `pv:inspect`, `pv:preview`, `pv:game-render:verify`, `pv:voice`, `pv:score`, `pv:render:draft`, and `pv:render:4k`.
- [ ] Add `captures/`, `renders/`, `.hyperframes/`, generated narration WAVs, generated score WAVs, and frame sequences below `video/footsteps-return/` to `.gitignore`.
- [ ] Write `DESIGN.md` before adding visual composition code. Inherit the existing visual-language document and fix the palette, typography, safe areas, chapter light colors, camera rules, motion rules, subtitle style, and prohibited effects.
- [ ] Implement `doctor.mjs` to fail with actionable messages unless Node ≥22, FFmpeg, eSpeak NG, and MuseScore 4 are callable and required fonts/assets exist.
- [ ] Document installation through `winget install Gyan.FFmpeg`, `winget install eSpeak-NG.eSpeak-NG`, and `winget install Musescore.Musescore`; document that generated media stays out of Git.
- [ ] Run `npm install`, `npm run pv:doctor`, `node --test tests/pv-toolchain.test.js`, and `npm test`.
- [ ] Commit as `build: scaffold footsteps return pv toolchain`.

## Task 2: Define the typed narrative, timeline, and asset contract

**Files:**
- Create: `video/footsteps-return/src/data/chapters.js`
- Create: `video/footsteps-return/src/data/narration.js`
- Create: `video/footsteps-return/src/data/timeline.js`
- Create: `video/footsteps-return/src/data/assets.js`
- Create: `video/footsteps-return/scripts/validate-manifest.mjs`
- Test: `tests/pv-manifest.test.js`

- [ ] Write manifest tests first. Assert one intro, exactly seven ordered chapters, one seven-world gallery, and one end card; assert chapter IDs `plane`, `cylinder`, `torus`, `mobius`, `klein`, `projective`, `sphere`.
- [ ] Assert exact visible title triples: `ACT. PROLOGUE / 方庭 / 平面` through `ACT. VI / 归圆 / 球面`.
- [ ] Assert the approved narration verbatim, while keeping punctuation metadata separate from visible subtitle text.
- [ ] Assert every narration cue has a stable ID, speaker role, semantic group, and estimated duration; every scene has non-negative duration and a transition contract; chapter cards have no narration IDs.
- [ ] Assert asset references are repository-relative and reject drive-letter paths, URLs without provenance, missing files, and generated-output paths.
- [ ] Run `node --test tests/pv-manifest.test.js` and confirm the initial failure.
- [ ] Implement frozen data modules and `validate-manifest.mjs`. Treat the timing table as editable duration data, not hard-coded CSS delays.
- [ ] Add a validation rule that the master timeline cannot be shorter than the last narration/audio cue and that no two subtitle groups overlap.
- [ ] Run `node --test tests/pv-manifest.test.js` and `npm run pv:validate`.
- [ ] Commit as `feat: define pv narrative and timeline contract`.

## Task 3: Build deterministic real-game render adapter

**Files:**
- Create: `video/footsteps-return/scripts/serve-app.mjs`
- Create: `video/footsteps-return/render-game.html`
- Create: `video/footsteps-return/src/game-render/adapter.js`
- Create: `video/footsteps-return/src/game-render/hook.js`
- Create: `video/footsteps-return/src/data/game-render-shots.js`
- Create: `video/footsteps-return/scripts/verify-game-render.mjs`
- Test: `tests/pv-game-render.test.js`

- [ ] Write tests for seven shot definitions and their deterministic topology paths. Reuse the same start cell and direction semantics already verified by `tests/topology.test.js`.
- [ ] Require the plane shot to show an ordinary five, cylinder one horizontal wrap, torus a two-seam diagonal, Möbius one reflected crossing, Klein one preserved and one reflected crossing, projective two mirrored crossings, and sphere an adjacent-edge turn.
- [ ] Run `node --test tests/pv-game-render.test.js` and confirm it fails before the adapter exists.
- [ ] Inject a PV-only hook while loading the unchanged app source. Disable Canvas paper dots and only the known lesson prompt `fillText`/`strokeText`; preserve the real grid, stones, winning line, lesson connections and topology morph.
- [ ] Expose `selectShot`, `render(state)` and `renderReady`. No wall clock or iframe autoplay may advance pixels after readiness.
- [ ] Drive one persistent iframe/Canvas per chapter through a monotonic timeline: board establish → drops 1–5 → winning-five hold → morph 0–1 → settled hold → rotation reveal. Every `render(state)` must also be reversible from explicit state without reloading. Do not stitch clips or reset at phase boundaries; Klein switches both native lesson paths inside the same instance.
- [ ] Before every declared seam crossing, hold the interactive lesson's extended breathing cue, then place the crossing stone; finish all five moves. Klein's preserved and reflected paths each run 1→5 independently.
- [ ] Keep the fifth-stone/win/morph-0 and morph-1/rotation-0 handoffs continuous. Morph and rotation are independent explicit parameters.
- [ ] Chromium verification must prove all seven chapters/eight native lesson paths and every declared seam cue, four-corner alpha 0, no prompt draws, bounded RAF state, arbitrary-order pixel determinism, and idle pixels frozen. The plane's app morph is intentionally identity; the other six require distinct morph 0/.5/1 and rotation states.
- [ ] Run `npm run pv:game-render:verify`, `npm test`, and `npm run docs:check`.
- [ ] Commit as `feat: add deterministic real-game render adapter`.

## Task 4: Implement the composition shell and chapter-card system

**Files:**
- Modify: `video/footsteps-return/index.html`
- Modify: `video/footsteps-return/src/bootstrap.js`
- Modify: `video/footsteps-return/src/styles.css`
- Create: `video/footsteps-return/src/runtime/master-timeline.js`
- Create: `video/footsteps-return/src/runtime/fit-text.js`
- Create: `video/footsteps-return/compositions/chapter-titles.js`
- Create: `video/footsteps-return/compositions/shared/scene.js`
- Test: `tests/pv-composition.test.js`

- [ ] Write DOM-contract tests for one master stage, one paused GSAP master timeline, scene registration, safe-area tokens, and a single visible caption group.
- [ ] Add chapter-card snapshot tests for all seven title triples and verify the `ACT.` line remains single-line.
- [ ] Run `node --test tests/pv-composition.test.js` and confirm failure.
- [ ] Build the composition at 3840×2160/60fps, authored and reviewed for the sole 4K delivery target.
- [ ] Load local `Topo Serif` 400/600/700 assets and wait for `document.fonts.ready` before exposing render readiness.
- [ ] Implement chapter cards as near-black spaces with low-contrast topology silhouettes, fixed type hierarchy, restrained volumetric reveal, and per-chapter light colors from `DESIGN.md`.
- [ ] Keep timelines paused and deterministic. Construct every scene synchronously and register it before playback; do not use infinite repeats or async timeline mutation.
- [ ] Run `npm run pv:lint`, `npm run pv:validate`, `npm run pv:inspect`, and the composition tests.
- [ ] Commit as `feat: build pv composition and chapter cards`.

## Task 5: Build the intro, end card, and brand provenance

**Files:**
- Create: `video/footsteps-return/compositions/intro.js`
- Create: `video/footsteps-return/compositions/end-card.js`
- Create: `video/footsteps-return/assets/brand/topology-gomoku.png`
- Create: `video/footsteps-return/assets/brand/iop-logo.png`
- Create: `video/footsteps-return/assets/provenance.json`
- Test: `tests/pv-brand.test.js`

- [ ] Write tests that the intro references no IOP mark and the end card includes exactly one game-title mark plus one prominent IOP mark.
- [ ] Assert provenance entries contain source type, original filename, rights basis, copied date, checksum, and repository-relative destination.
- [ ] Run `node --test tests/pv-brand.test.js` and confirm failure.
- [ ] Copy the existing game brand icon and the user-provided IOP logo into the PV asset directory without altering the originals. Record the user-provided origin in `provenance.json` without storing a machine-local absolute path.
- [ ] Build the intro around a dark board edge, a disappearing auxiliary path, and a slow reveal of hidden adjacency. Do not show title, logo, chapter label, or institute identity.
- [ ] Build the final card with the title `拓扑五子棋`, subtitle `章节预告 PV—「足迹回环」`, and a visually substantial but subordinate IOP logo lockup. Do not add a QR code, store badge, platform name, or version.
- [ ] Run brand tests and render intro/end-card hero frames at both output sizes.
- [ ] Commit as `feat: create pv opening and final identity`.

## Task 6: Implement the seven differentiated chapter scenes

**Files:**
- Create: `video/footsteps-return/compositions/chapters/plane.js`
- Create: `video/footsteps-return/compositions/chapters/cylinder.js`
- Create: `video/footsteps-return/compositions/chapters/torus.js`
- Create: `video/footsteps-return/compositions/chapters/mobius.js`
- Create: `video/footsteps-return/compositions/chapters/klein.js`
- Create: `video/footsteps-return/compositions/chapters/projective.js`
- Create: `video/footsteps-return/compositions/chapters/sphere.js`
- Create: `video/footsteps-return/src/runtime/topology-surfaces.js`
- Create: `video/footsteps-return/assets/topology/` copies of required SVGs
- Test: `tests/pv-chapters.test.js`

- [ ] Write chapter tests first. Assert every chapter binds one approved live render definition, one color identity, one camera path, one entry transition, and one exit occlusion.
- [ ] Encode differentiating evidence as testable metadata: finite plane, one cylinder cycle, two torus cycles, Möbius half-twist, Klein preserved/reflected pair, projective all-edge reflection, sphere adjacent-edge continuation.
- [ ] Run `node --test tests/pv-chapters.test.js` and confirm failure.
- [ ] Reuse the game topology definitions and existing topology SVGs. Copy only required visual assets; record them in provenance.
- [ ] Mount `render-game.html` full-frame within a consistent cinematic stage and drive its single continuous chapter progress. Do not splice helper/morph clips, introduce device frames, crop the board, or overlay explanatory microcopy.
- [ ] Build high-density Three.js surfaces for the six non-plane morphs with offline-quality antialiasing, depth of field, motion blur, volumetric light, and restrained particles. The plane remains the real flat app board and receives only HyperFrames camera lift/tilt; effects must remain subordinate to the rule evidence.
- [ ] Implement: plane suspension; cylinder side closure; torus second closure; Möbius half-turn; Klein dual preserved/reflected paths; projective mirrored edge convergence; sphere adjacent-edge closure.
- [ ] End every chapter on the representative five. For six non-plane chapters, morph the board into its native surface; for plane, preserve the identity board and lift/tilt it with the HyperFrames camera. Then occlude with geometry or shadow and begin the next title card after a short black/match cut.
- [ ] Render one rule-evidence frame and one morph hero frame per chapter; inspect all fourteen frames in a single contact sheet.
- [ ] Run chapter tests plus `npm run pv:inspect` and correct timeline overlaps, dead zones, off-canvas objects, and invisible animated elements.
- [ ] Commit as `feat: animate seven topology chapters`.

## Task 7: Build the seven-world gallery and cinematic transitions

**Files:**
- Create: `video/footsteps-return/compositions/seven-worlds.js`
- Create: `video/footsteps-return/src/runtime/transitions.js`
- Modify: `video/footsteps-return/src/runtime/master-timeline.js`
- Test: `tests/pv-transitions.test.js`

- [ ] Write tests that every adjacent scene pair has an explicit transition and that no transition uses wipe, slide, persistent connector-line, or page-like movement.
- [ ] Assert the gallery contains all seven shapes exactly once and contains no extra chapter title or explanatory summary sentence.
- [ ] Run `node --test tests/pv-transitions.test.js` and confirm failure.
- [ ] Implement one coherent transition family: spatial occlusion, controlled focus pull, brief color dip to black, and silhouette match cut. Do not mix unrelated shader and CSS transition grammars.
- [ ] Arrange seven topology surfaces in dark space and illuminate their previously demonstrated cross-boundary paths in chapter order. The paths may coexist after illumination, but must not collapse into an invented multi-boundary five-in-a-row.
- [ ] Let the camera withdraw slowly while the end narration begins; reserve the final musical cadence and silence for the title card.
- [ ] Run transition tests, lint, validate, and inspect; export a low-bitrate transition review render.
- [ ] Commit as `feat: compose seven-world gallery and transitions`.

## Task 8: Generate narration timing and single-line captions

**Files:**
- Create: `video/footsteps-return/audio/voiceover/script.json`
- Create: `video/footsteps-return/scripts/build-voiceover.mjs`
- Create: `video/footsteps-return/scripts/build-captions.mjs`
- Create: `video/footsteps-return/src/data/captions.js`
- Create: `video/footsteps-return/assets/transcript.txt`
- Test: `tests/pv-captions.test.js`

- [ ] Write tests for verbatim narration order, zero narration on chapter cards, semantic caption splitting, and omission of visible full stops.
- [ ] At 3840×2160, measure every cue with the actual font. Fail if a cue exceeds the caption safe width at 84–96px or occupies more than one line.
- [ ] Assert caption groups do not overlap and are hard-cleared after their cue; preserve meaningful question marks.
- [ ] Run `node --test tests/pv-captions.test.js` and confirm failure.
- [ ] Generate a rhythm-track narration with the Mandarin male eSpeak voice `zm_yunyang`, starting near 0.88× speed. Generate cue-level WAVs so pauses can be edited without time-stretching sentences.
- [ ] Measure produced audio durations and rebuild the flexible timeline from actual cue lengths, protected pauses, and chapter-card reading time. Never accelerate narration merely to hit the 165-second reference.
- [ ] Build single-line caption cues using semantic clauses; use 6–8 frame whole-line fades, white text, and black stroke only.
- [ ] Audition every cue for pronunciation and cadence. Record unacceptable cues in `audio/voiceover/review.json`; if synthetic quality is insufficient, preserve timing IDs so a later human recording can replace files one-for-one.
- [ ] Run `npm run pv:voice`, caption tests, and a caption-only review render.
- [ ] Commit as `feat: add timed narration and captions`.

## Task 9: Compose, orchestrate, and render the original score

**Files:**
- Create: `video/footsteps-return/audio/score/score-plan.json`
- Create: `video/footsteps-return/audio/score/master.musicxml`
- Create: `video/footsteps-return/scripts/build-score.mjs`
- Create: `video/footsteps-return/scripts/render-score.ps1`
- Create: `video/footsteps-return/audio/sfx/sfx-plan.json`
- Create: `video/footsteps-return/assets/audio-licenses.json`
- Test: `tests/pv-score.test.js`

- [ ] Write score tests around the original five-note cell D–F–G–A–C. Assert seven chapter identities: stable statement, one-cycle ostinato, two interlocked cycles, inversion/retrograde, original-plus-mirror counterpoint, mirrored canon, and full harmonic resolution.
- [ ] Assert the orchestration manifest includes piano, celesta, violin I/II, viola, cello, double bass, French horn, bass clarinet, choir aahs, and restrained percussion; every external sound or soundfont must have an explicit commercial-video license entry.
- [ ] Run `node --test tests/pv-score.test.js` and confirm failure.
- [ ] Implement `build-score.mjs` to generate a deterministic MusicXML master and separable stem scores from `score-plan.json`; do not import or transcribe music from the reference PV.
- [ ] Compose the sequence from the fixed motif: sparse piano/bass harmonics intro; clear chamber statement; horizontal ostinato; second offset cycle; mirrored contour and reverse textures; original/mirror counterpoint with low reeds; glass/celesta mirrored canon with weak choir; full strings, restrained horn, choir, and resolved piano cadence.
- [ ] Render master and stems through MuseScore at 48kHz, then normalize file format with FFmpeg. Keep generated WAVs ignored while committing the score source and orchestration plan.
- [ ] Design only necessary SFX: stone placement, seam crossing, surface bend, camera occlusion, and chapter low-frequency punctuation. Synthesize or use explicitly licensed sources and document provenance.
- [ ] Review musical form against actual narration timing. Rewrite phrases at chapter boundaries; do not mechanically cut loops or fade unfinished cadences.
- [ ] Run `npm run pv:score`, score tests, and inspect stem duration/sample-rate consistency.
- [ ] Commit as `feat: compose original footsteps return score`.

## Task 10: Mix audio and integrate the complete master timeline

**Files:**
- Create: `video/footsteps-return/scripts/mix-audio.ps1`
- Create: `video/footsteps-return/audio/mix.json`
- Modify: `video/footsteps-return/src/runtime/master-timeline.js`
- Modify: `video/footsteps-return/index.html`
- Test: `tests/pv-audio.test.js`

- [ ] Write tests that all voice, score, and SFX cues resolve to files; every file is 48kHz; the final cue ends before or with the composition; and the end-card tail retains intentional silence/resonance.
- [ ] Run `node --test tests/pv-audio.test.js` and confirm failure.
- [ ] Integrate measured cue durations, chapter cards, seven scenes, gallery, and final card into one deterministic master timeline.
- [ ] Mix narration in the center, keep score width controlled under speech, and automate SFX rather than leaving a continuous low-frequency bed. Use FFmpeg loudness analysis and true-peak limiting; record measured integrated loudness and peak in `mix.json`.
- [ ] Target clear speech and a distribution-safe master near −14 LUFS integrated with true peak no higher than −1 dBTP; adjust by listening if the sparse score makes the numerical target inappropriate, and document the final measured choice.
- [ ] Add explicit render-readiness checks for fonts, the live game adapter, narration, score, SFX, and WebGL surfaces.
- [ ] Run audio tests, `npm run pv:lint`, `npm run pv:validate`, `npm run pv:inspect`, and export the draft master.
- [ ] Commit as `feat: integrate pv picture and final mix`.

## Task 11: Render, inspect, document, and present the preview

**Files:**
- Create: `video/footsteps-return/scripts/render-contact-sheet.mjs`
- Modify: `docs/design/qa.md`
- Modify: `docs/development/environment.md`
- Modify: `docs/README.md`
- Create: `video/footsteps-return/README.md`
- Create: `video/footsteps-return/QA.md`
- Test: `tests/pv-output.test.js`

- [ ] Write output tests for 3840×2160/60fps, 48kHz stereo audio, expected duration tolerance, required streams, and absence of unintended transparency.
- [ ] Run `node --test tests/pv-output.test.js` and confirm failure before final renders exist.
- [ ] Generate an animation map and contact sheet covering intro, seven chapter cards, fourteen chapter evidence/morph frames, seven-world gallery, and end card.
- [ ] Render the full 4K/60fps output. Run `ffprobe` checks, full-frame decode checks, black-frame detection, freeze-frame detection, and audio clipping/loudness analysis.
- [ ] Watch the 4K/60fps output from start to finish. Record results for single-line captions, punctuation, font rendering, sync, reading time, black-frame breathing, match cuts, motion blur, banding, topology correctness, narration intelligibility, music form, SFX masking, and final logo hierarchy.
- [ ] Run the complete gate: `npm test`, `npm run validate`, `npm run docs:check`, `npm run pv:lint`, `npm run pv:validate`, `npm run pv:inspect`, and `git diff --check`.
- [ ] Update `video/footsteps-return/README.md` with reproducible preview/render commands and generated-output locations. Update `docs/design/qa.md` using repository-relative evidence paths only.
- [ ] Open the HyperFrames Studio preview and the 4K/60fps draft for user review. Do not merge to `dev` until the user explicitly confirms the preview.
- [ ] After user approval, use the repository’s branch-finishing workflow to prepare the verified branch for a fast-forward merge into `dev`; do not promote to `main` or platform release branches.

## Final acceptance checklist

- [ ] The title is exactly `《拓扑五子棋》章节预告 PV—「足迹回环」` in documentation and release metadata.
- [ ] All seven chapter identities are legible without narration explaining the chapter card.
- [ ] Every rule demonstration matches the actual game and visibly uses its helper line.
- [ ] The seven topologies have differentiated rule evidence, geometry, light, camera, musical variation, and philosophical line.
- [ ] No chapter-transition treatment resembles a slide deck or a persistent cross-screen line.
- [ ] All captions are one line, large, white with black outline, and omit full stops.
- [ ] The opening is immersive and unbranded; the ending gives the IOP logo meaningful visual weight without duplicating the game logo.
- [ ] The score is original, source-backed, stemmed, licensed, and structurally synchronized with the chapters.
- [ ] Both video masters pass technical validation and complete human review.
- [ ] The branch remains isolated and unmerged until explicit user approval.
