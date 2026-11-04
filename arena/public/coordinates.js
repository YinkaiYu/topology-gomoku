(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ArenaCoordinates = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function label(cell, width, height) {
    return String.fromCharCode(65 + cell % width) + (height - Math.floor(cell / width));
  }
  function cell(value, width, height) {
    if (typeof value === "string") {
      const match = /^([A-S])([1-9]|1[0-9])$/i.exec(value);
      if (!match) return null;
      const x = match[1].toUpperCase().charCodeAt(0) - 65, row = Number(match[2]);
      if (x >= width || row > height) return null;
      return (height - row) * width + x;
    }
    return Number.isInteger(value) && value >= 0 && value < width * height ? value : null;
  }
  return { label, cell };
});
