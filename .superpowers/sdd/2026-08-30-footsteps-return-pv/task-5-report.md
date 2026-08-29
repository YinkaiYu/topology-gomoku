# Task 5 report: PV opening, final identity, and provenance

## Outcome

- Added deterministic scene factories for the 19-second opening and four-second final card and registered them on the existing paused GSAP master timeline.
- The opening contains no text, game mark, chapter label, or IOP mark. It now crops the real `render-game.html` / `GameRenderAdapter` plane Canvas in a dark field; only light, fog, crop, and camera transforms create the disappearing and returning hidden-adjacency image. No CSS grid or stone facsimile remains.
- The final card contains one text title (`拓扑五子棋`), one subtitle (`章节预告 PV—「足迹回环」`), and one substantial but subordinate IOP image. It does not render the copied game graphic mark and contains no QR code, store badge, platform name, or version.
- Copied `brand-icon.png` and the user-provided `iop-logo.png` byte-for-byte into the PV brand directory. `assets/provenance.json` records `IOP.pdf` as the source document and `iop-logo.png` as its derived copy, alongside rights basis, copy date, SHA-256, and repository-relative destinations without a machine path.
- The real game renderer is self-contained under `assets/game-source/` with byte-identical repository copies registered in the unified asset manifest; the copied game graphic logo is never rendered on the final card.

## TDD evidence

- RED: `node --test tests/pv-brand.test.js` failed three tests because the two scene modules and provenance did not exist.
- GREEN: the same command passes 3/3 tests after the minimal scene, asset, and provenance implementation.
- Browser assertions cover brand absence/uniqueness, copy exactness, 4K IOP visual weight, and reversible seek from hidden adjacency to reveal and back.

### Fix round 1

- RED: the new real-browser opening contract failed because the intro had no render-adapter iframe/Canvas and still contained synthetic CSS board parts; the temporal final-card contract reproduced fully visible content at 160.50–161.17s before it reset; manifest and provenance assertions also failed.
- GREEN: `node --test tests/pv-brand.test.js tests/pv-composition.test.js tests/pv-game-render.test.js` passes 23/23 tests. It proves one ready, frozen plane Canvas; no CSS grid/stone facsimile; offline project-local resources; authored-hidden final identity across pre-roll; ordered reveal at formal start/mid/end; and exact state after backward seek.
- The HyperFrames runtime initially reported 14 missing game-HTML preload assets. A follow-up RED provenance assertion was added, the byte-identical repository assets were registered, and `npm run pv:validate` then passed with zero runtime, layout, motion, or contrast issues.

## Visual QA

- Delivery target: 3840 × 2160 at 60fps only.
- Opening hero: `artifacts/pv-intro-hero-4k.png` at 14.20s, SHA-256 `e6336431978a9a4e4d0b1869ec4e1141bff6d1cb69278ec4339eca89cce7393e`.
- Final-card hero: `artifacts/pv-end-card-hero-4k.png` at 163.65s, SHA-256 `333c63fbe9cefa05d93e3959c6f7e2535454a2412152ab50d972b4340c27a28f`.
- Direct Playwright 4K PNG encoding blocked on this Windows Chromium build. The two frames were captured as nine unscaled 1280 × 720 native-pixel tiles from the same 3840 × 2160 viewport and losslessly stitched; the temporary tiles were removed.
- Visual inspection found no text/logo leakage in the opening, no clipping, and no repeated game graphic mark on the final card. The IOP mark remains clearly legible while subordinate to the title.

## Verification

- `node --test tests/pv-composition.test.js tests/pv-brand.test.js`
- `node --test tests/pv-brand.test.js tests/pv-composition.test.js tests/pv-game-render.test.js`
- `npm run pv:lint`
- `npm run pv:validate`
- `npm run pv:inspect`
- `npm run pv:doctor`
- `npm test`
- `npm run docs:check`
- `git diff --check`

Documentation impact: `docs/design/qa.md` records the reproducible 4K opening and final-card evidence, while the task brief and implementation plan now name the sole 4K/60fps target. No product, platform, release, or command documentation changed.
