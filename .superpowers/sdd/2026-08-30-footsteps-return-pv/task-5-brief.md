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
- [ ] Run brand tests and render the intro/end-card hero frames at the sole 3840×2160, 60fps output target.
- [ ] Commit as `feat: create pv opening and final identity`.
