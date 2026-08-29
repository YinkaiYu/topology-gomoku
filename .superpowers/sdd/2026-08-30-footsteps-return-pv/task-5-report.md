# Task 5 report: PV opening, final identity, and provenance

## Outcome

- Added deterministic scene factories for the 19-second opening and four-second final card and registered them on the existing paused GSAP master timeline.
- The opening contains no text, game mark, chapter label, or IOP mark. Its visible language is limited to a dark board edge, five restrained stones, and a local hidden-adjacency refraction that disappears and returns.
- The final card contains one text title (`拓扑五子棋`), one subtitle (`章节预告 PV—「足迹回环」`), and one substantial but subordinate IOP image. It does not render the copied game graphic mark and contains no QR code, store badge, platform name, or version.
- Copied `brand-icon.png` and the user-provided `iop-logo.png` byte-for-byte into the PV brand directory. `assets/provenance.json` records portable origins, rights basis, copy date, SHA-256, and repository-relative destinations without a machine path.

## TDD evidence

- RED: `node --test tests/pv-brand.test.js` failed three tests because the two scene modules and provenance did not exist.
- GREEN: the same command passes 3/3 tests after the minimal scene, asset, and provenance implementation.
- Browser assertions cover brand absence/uniqueness, copy exactness, 4K IOP visual weight, and reversible seek from hidden adjacency to reveal and back.

## Visual QA

- Delivery target: 3840 × 2160 at 60fps only.
- Opening hero: `artifacts/pv-intro-hero-4k.png` at 14.20s, SHA-256 `0e401150d81ddc82f7e12816a1fb1b39d2258c68769a5195a98f4df3208a2098`.
- Final-card hero: `artifacts/pv-end-card-hero-4k.png` at 163.65s, SHA-256 `de5a90fda55a3a9947b4c3790c9db2bff29d3ddbc1f9eb7099336b6c90e2b636`.
- Direct Playwright 4K PNG encoding blocked on this Windows Chromium build. The two frames were captured as nine unscaled 1280 × 720 native-pixel tiles from the same 3840 × 2160 viewport and losslessly stitched; the temporary tiles were removed.
- Visual inspection found no text/logo leakage in the opening, no clipping, and no repeated game graphic mark on the final card. The IOP mark remains clearly legible while subordinate to the title.

## Verification

- `node --test tests/pv-composition.test.js tests/pv-brand.test.js`
- `npm run pv:lint`
- `npm run pv:validate`
- `npm run pv:inspect`
- `npm run pv:doctor`

Documentation impact: `docs/design/qa.md` now records the reproducible 4K opening and final-card evidence. No product, platform, release, or command documentation changed.
