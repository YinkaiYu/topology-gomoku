(function attachTopologyReplay(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyReplay = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyReplayFactory() {
  "use strict";

  function clampStep(step, total) {
    var safeTotal = Math.max(0, Number(total) || 0);
    return Math.max(0, Math.min(safeTotal, Math.round(Number(step) || 0)));
  }

  function boardAt(moves, cellCount, step, emptyValue) {
    var safeMoves = Array.isArray(moves) ? moves : [];
    var safeCellCount = Math.max(0, Math.round(Number(cellCount) || 0));
    var visibleMoves = clampStep(step, safeMoves.length);
    var empty = Number.isFinite(emptyValue) ? emptyValue : 0;
    var board = new Int8Array(safeCellCount);
    if (empty !== 0) {
      board.fill(empty);
    }
    for (var index = 0; index < visibleMoves; index += 1) {
      var move = safeMoves[index];
      if (!move) {
        continue;
      }
      var cell = Math.round(Number(move.cell));
      var player = Number(move.player);
      if (cell >= 0 && cell < safeCellCount && Number.isFinite(player)) {
        board[cell] = player;
      }
    }
    return board;
  }

  function progressTitle(step) {
    var safeStep = Math.max(0, Math.round(Number(step) || 0));
    return safeStep === 0 ? "开局" : "第 " + safeStep + " 手";
  }

  function progressText(step, total) {
    var safeTotal = Math.max(0, Math.round(Number(total) || 0));
    return clampStep(step, safeTotal) + " / " + safeTotal + " 手";
  }

  function resultText(outcome, total) {
    var safeTotal = Math.max(0, Math.round(Number(total) || 0));
    if (outcome === "win") {
      return safeTotal + " 手通关";
    }
    if (outcome === "lose") {
      return safeTotal + " 手惜败";
    }
    return safeTotal + " 手和局通关";
  }

  return {
    clampStep: clampStep,
    boardAt: boardAt,
    progressTitle: progressTitle,
    progressText: progressText,
    resultText: resultText
  };
});
