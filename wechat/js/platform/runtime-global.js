// WeChat guarantees GameGlobal across its JSCore and V8 runtimes. Expose the
// standardized name for shared UMD modules on older bases that do not yet
// provide globalThis themselves.
if (typeof GameGlobal.globalThis === 'undefined') {
  GameGlobal.globalThis = GameGlobal;
}
