(function attachTopologyGomoku(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyGomoku = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyFactory() {
  "use strict";

  var EMPTY = 0;
  var HUMAN = 1;
  var AI = -1;
  var SEAM_X = 1;
  var SEAM_Y = 2;
  var SEAM_TWIST = 4;
  var WIN_SCORE = 100000000;

  var DIRECTIONS = [
    { dx: 1, dy: 0, name: "E" },
    { dx: 1, dy: 1, name: "SE" },
    { dx: 0, dy: 1, name: "S" },
    { dx: -1, dy: 1, name: "SW" },
    { dx: -1, dy: 0, name: "W" },
    { dx: -1, dy: -1, name: "NW" },
    { dx: 0, dy: -1, name: "N" },
    { dx: 1, dy: -1, name: "NE" }
  ];

  var WIN_DIRECTIONS = [0, 1, 2, 3];
  var LINE_WEIGHTS = [0, 2, 14, 120, 2600, WIN_SCORE];

  function mod(value, size) {
    return ((value % size) + size) % size;
  }

  function directionIndex(dx, dy) {
    var index;
    for (index = 0; index < DIRECTIONS.length; index += 1) {
      if (DIRECTIONS[index].dx === dx && DIRECTIONS[index].dy === dy) {
        return index;
      }
    }
    return -1;
  }

  function transition(type, width, height, x, y, direction) {
    var vector = DIRECTIONS[direction];
    var rawX = x + vector.dx;
    var rawY = y + vector.dy;
    var nextX = rawX;
    var nextY = rawY;
    var nextDx = vector.dx;
    var nextDy = vector.dy;
    var crossesX = rawX < 0 || rawX >= width;
    var crossesY = rawY < 0 || rawY >= height;
    var seam = 0;

    if (type === "plane") {
      if (crossesX || crossesY) {
        return null;
      }
    } else if (type === "cylinder") {
      if (crossesY) {
        return null;
      }
      if (crossesX) {
        seam |= SEAM_X;
        nextX = mod(rawX, width);
      }
    } else if (type === "torus") {
      if (crossesX) {
        seam |= SEAM_X;
      }
      if (crossesY) {
        seam |= SEAM_Y;
      }
      nextX = mod(rawX, width);
      nextY = mod(rawY, height);
    } else if (type === "mobius") {
      if (crossesX) {
        seam |= SEAM_X | SEAM_TWIST;
        nextX = mod(rawX, width);
        nextY = height - 1 - rawY;
        nextDy = -nextDy;
      }
      if (nextY < 0 || nextY >= height) {
        return null;
      }
    } else if (type === "klein") {
      if (crossesX) {
        seam |= SEAM_X | SEAM_TWIST;
      }
      if (crossesY) {
        seam |= SEAM_Y;
      }
      nextX = mod(rawX, width);
      nextY = mod(rawY, height);
      if (crossesX) {
        nextY = height - 1 - nextY;
        nextDy = -nextDy;
      }
    } else if (type === "projective") {
      if (crossesX) {
        seam |= SEAM_X | SEAM_TWIST;
      }
      if (crossesY) {
        seam |= SEAM_Y | SEAM_TWIST;
      }
      nextX = mod(rawX, width);
      nextY = mod(rawY, height);
      if (crossesX) {
        nextY = height - 1 - nextY;
        nextDy = -nextDy;
      }
      if (crossesY) {
        nextX = width - 1 - nextX;
        nextDx = -nextDx;
      }
    } else {
      throw new Error("Unknown topology: " + type);
    }

    return {
      x: nextX,
      y: nextY,
      direction: directionIndex(nextDx, nextDy),
      seam: seam
    };
  }

  function createRules(options) {
    var width = options.width;
    var height = options.height;
    var type = options.type;
    var target = options.target || 5;
    var cellCount = width * height;
    var nextCell = new Int16Array(cellCount * 8);
    var nextDirection = new Int8Array(cellCount * 8);
    var seamByStep = new Uint8Array(cellCount * 8);
    var cell;
    var direction;

    nextCell.fill(-1);

    for (cell = 0; cell < cellCount; cell += 1) {
      var x = cell % width;
      var y = Math.floor(cell / width);
      for (direction = 0; direction < DIRECTIONS.length; direction += 1) {
        var result = transition(type, width, height, x, y, direction);
        var offset = cell * 8 + direction;
        if (result) {
          nextCell[offset] = result.y * width + result.x;
          nextDirection[offset] = result.direction;
          seamByStep[offset] = result.seam;
        }
      }
    }

    var rules = {
      type: type,
      width: width,
      height: height,
      target: target,
      cellCount: cellCount,
      nextCell: nextCell,
      nextDirection: nextDirection,
      seamByStep: seamByStep,
      winMasks: [],
      masksByCell: []
    };

    buildWinMasks(rules);
    return rules;
  }

  function buildWinMasks(rules) {
    var seen = Object.create(null);
    var masksByCell = [];
    var cell;
    var startDirectionIndex;

    for (cell = 0; cell < rules.cellCount; cell += 1) {
      masksByCell[cell] = [];
    }

    for (cell = 0; cell < rules.cellCount; cell += 1) {
      for (startDirectionIndex = 0; startDirectionIndex < WIN_DIRECTIONS.length; startDirectionIndex += 1) {
        var currentCell = cell;
        var currentDirection = WIN_DIRECTIONS[startDirectionIndex];
        var cells = [cell];
        var visited = Object.create(null);
        var seam = 0;
        var valid = true;
        var stepIndex;
        visited[cell] = true;

        for (stepIndex = 1; stepIndex < rules.target; stepIndex += 1) {
          var offset = currentCell * 8 + currentDirection;
          var steppedCell = rules.nextCell[offset];
          if (steppedCell < 0 || visited[steppedCell]) {
            valid = false;
            break;
          }
          seam |= rules.seamByStep[offset];
          currentDirection = rules.nextDirection[offset];
          currentCell = steppedCell;
          visited[currentCell] = true;
          cells.push(currentCell);
        }

        if (valid) {
          var key = cells.slice().sort(function numericSort(a, b) { return a - b; }).join(",");
          if (!seen[key]) {
            var maskIndex = rules.winMasks.length;
            var mask = {
              cells: new Uint16Array(cells),
              seam: seam,
              direction: WIN_DIRECTIONS[startDirectionIndex]
            };
            seen[key] = true;
            rules.winMasks.push(mask);
            cells.forEach(function addMaskIndex(maskCell) {
              masksByCell[maskCell].push(maskIndex);
            });
          }
        }
      }
    }

    rules.masksByCell = masksByCell.map(function compactMaskList(list) {
      return new Uint16Array(list);
    });
  }

  function createBoard(rules) {
    return new Int8Array(rules.cellCount);
  }

  function toCell(rules, x, y) {
    if (x < 0 || x >= rules.width || y < 0 || y >= rules.height) {
      return -1;
    }
    return y * rules.width + x;
  }

  function toPoint(rules, cell) {
    return {
      x: cell % rules.width,
      y: Math.floor(cell / rules.width)
    };
  }

  function step(rules, cell, direction) {
    var offset = cell * 8 + direction;
    var next = rules.nextCell[offset];
    if (next < 0) {
      return null;
    }
    return {
      cell: next,
      direction: rules.nextDirection[offset],
      seam: rules.seamByStep[offset]
    };
  }

  function countMask(board, mask, player) {
    var count = 0;
    var index;
    for (index = 0; index < mask.cells.length; index += 1) {
      if (board[mask.cells[index]] === player) {
        count += 1;
      }
    }
    return count;
  }

  function checkWin(board, rules, lastCell, player) {
    var relatedMasks = rules.masksByCell[lastCell];
    var index;
    for (index = 0; index < relatedMasks.length; index += 1) {
      var mask = rules.winMasks[relatedMasks[index]];
      if (countMask(board, mask, player) === rules.target) {
        return mask;
      }
    }
    return null;
  }

  function boardIsFull(board) {
    var index;
    for (index = 0; index < board.length; index += 1) {
      if (board[index] === EMPTY) {
        return false;
      }
    }
    return true;
  }

  function hasLiveLine(board, rules, player) {
    var opponent = -player;
    var maskIndex;
    for (maskIndex = 0; maskIndex < rules.winMasks.length; maskIndex += 1) {
      if (countMask(board, rules.winMasks[maskIndex], opponent) === 0) {
        return true;
      }
    }
    return false;
  }

  function boardIsDraw(board, rules) {
    return boardIsFull(board) || (!hasLiveLine(board, rules, HUMAN) && !hasLiveLine(board, rules, AI));
  }

  function immediateMoves(board, rules, player) {
    var found = Object.create(null);
    var moves = [];
    var maskIndex;
    for (maskIndex = 0; maskIndex < rules.winMasks.length; maskIndex += 1) {
      var mask = rules.winMasks[maskIndex];
      var own = 0;
      var opponent = 0;
      var emptyCell = -1;
      var cellIndex;
      for (cellIndex = 0; cellIndex < mask.cells.length; cellIndex += 1) {
        var value = board[mask.cells[cellIndex]];
        if (value === player) {
          own += 1;
        } else if (value === -player) {
          opponent += 1;
        } else {
          emptyCell = mask.cells[cellIndex];
        }
      }
      if (own === rules.target - 1 && opponent === 0 && emptyCell >= 0 && !found[emptyCell]) {
        found[emptyCell] = true;
        moves.push(emptyCell);
      }
    }
    return moves;
  }

  function centerBias(rules, cell) {
    if (rules.type !== "plane" && rules.type !== "mobius") {
      return 0;
    }
    var point = toPoint(rules, cell);
    var centerX = (rules.width - 1) / 2;
    var centerY = (rules.height - 1) / 2;
    var distance = Math.abs(point.x - centerX) + Math.abs(point.y - centerY);
    return Math.max(0, 12 - distance * 2);
  }

  function scoreMove(board, rules, cell, player) {
    if (board[cell] !== EMPTY) {
      return -Infinity;
    }

    var masks = rules.masksByCell[cell];
    var attack = 0;
    var defense = 0;
    var threats = 0;
    var index;

    for (index = 0; index < masks.length; index += 1) {
      var mask = rules.winMasks[masks[index]];
      var own = 0;
      var opponent = 0;
      var cellIndex;
      for (cellIndex = 0; cellIndex < mask.cells.length; cellIndex += 1) {
        var value = board[mask.cells[cellIndex]];
        if (value === player) {
          own += 1;
        } else if (value === -player) {
          opponent += 1;
        }
      }

      if (opponent === 0) {
        attack += LINE_WEIGHTS[Math.min(rules.target, own + 1)];
        if (own + 1 >= rules.target - 1) {
          threats += 1;
        }
      }
      if (own === 0) {
        defense += LINE_WEIGHTS[Math.min(rules.target, opponent + 1)];
      }
    }

    var forkBonus = threats > 1 ? 9000 * threats : 0;
    return attack + defense * 1.08 + forkBonus + centerBias(rules, cell);
  }

  function rankMoves(board, rules, player, limit) {
    var ranked = [];
    var cell;
    for (cell = 0; cell < board.length; cell += 1) {
      if (board[cell] === EMPTY) {
        ranked.push({
          cell: cell,
          score: scoreMove(board, rules, cell, player)
        });
      }
    }
    ranked.sort(function sortMoves(a, b) {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.cell - b.cell;
    });
    return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
  }

  function evaluateBoard(board, rules) {
    var score = 0;
    var maskIndex;
    for (maskIndex = 0; maskIndex < rules.winMasks.length; maskIndex += 1) {
      var mask = rules.winMasks[maskIndex];
      var aiCount = 0;
      var humanCount = 0;
      var index;
      for (index = 0; index < mask.cells.length; index += 1) {
        if (board[mask.cells[index]] === AI) {
          aiCount += 1;
        } else if (board[mask.cells[index]] === HUMAN) {
          humanCount += 1;
        }
      }
      if (aiCount && humanCount) {
        continue;
      }
      if (aiCount) {
        score += LINE_WEIGHTS[aiCount];
      } else if (humanCount) {
        score -= LINE_WEIGHTS[humanCount] * 1.07;
      }
    }
    return score;
  }

  function pickWeighted(ranked, random) {
    var usable = ranked.slice(0, Math.min(6, ranked.length));
    var total = 0;
    var weights = usable.map(function weightMove(move, index) {
      var weight = (usable.length - index) * (usable.length - index);
      total += weight;
      return weight;
    });
    var pick = random() * total;
    var index;
    for (index = 0; index < usable.length; index += 1) {
      pick -= weights[index];
      if (pick <= 0) {
        return usable[index].cell;
      }
    }
    return usable[0].cell;
  }

  function minimax(board, rules, depth, player, alpha, beta, lastCell, lastPlayer, context) {
    context.nodes += 1;
    if ((context.nodes & 63) === 0 && Date.now() > context.deadline) {
      context.timedOut = true;
      return evaluateBoard(board, rules);
    }

    if (lastCell >= 0) {
      var winningMask = checkWin(board, rules, lastCell, lastPlayer);
      if (winningMask) {
        return lastPlayer === AI ? WIN_SCORE + depth : -WIN_SCORE - depth;
      }
    }

    if (depth === 0 || boardIsDraw(board, rules)) {
      return evaluateBoard(board, rules);
    }

    var branch = depth >= 3 ? 9 : 11;
    var moves = rankMoves(board, rules, player, branch);
    if (!moves.length) {
      return evaluateBoard(board, rules);
    }

    var index;
    if (player === AI) {
      var bestMax = -Infinity;
      for (index = 0; index < moves.length; index += 1) {
        var aiCell = moves[index].cell;
        board[aiCell] = AI;
        var maxValue = minimax(board, rules, depth - 1, HUMAN, alpha, beta, aiCell, AI, context);
        board[aiCell] = EMPTY;
        bestMax = Math.max(bestMax, maxValue);
        alpha = Math.max(alpha, bestMax);
        if (beta <= alpha || context.timedOut) {
          break;
        }
      }
      return bestMax;
    }

    var bestMin = Infinity;
    for (index = 0; index < moves.length; index += 1) {
      var humanCell = moves[index].cell;
      board[humanCell] = HUMAN;
      var minValue = minimax(board, rules, depth - 1, AI, alpha, beta, humanCell, HUMAN, context);
      board[humanCell] = EMPTY;
      bestMin = Math.min(bestMin, minValue);
      beta = Math.min(beta, bestMin);
      if (beta <= alpha || context.timedOut) {
        break;
      }
    }
    return bestMin;
  }

  function chooseMove(board, rules, difficulty, random) {
    var rng = random || Math.random;
    var winning = immediateMoves(board, rules, AI);
    if (winning.length) {
      return winning[Math.floor(rng() * winning.length)];
    }

    var mustBlock = immediateMoves(board, rules, HUMAN);
    if (mustBlock.length && (difficulty !== "easy" || rng() < 0.82)) {
      var blockRanking = rankMoves(board, rules, AI);
      var blockSet = Object.create(null);
      mustBlock.forEach(function rememberBlock(cell) { blockSet[cell] = true; });
      var rankedBlock = blockRanking.find(function findBlock(move) { return blockSet[move.cell]; });
      return rankedBlock ? rankedBlock.cell : mustBlock[0];
    }

    var emptyCount = 0;
    var index;
    for (index = 0; index < board.length; index += 1) {
      if (board[index] === EMPTY) {
        emptyCount += 1;
      }
    }
    if (!emptyCount) {
      return -1;
    }

    var ranked = rankMoves(board, rules, AI);
    if (difficulty === "easy") {
      return pickWeighted(ranked, rng);
    }

    var depth = difficulty === "hard" ? 3 : 2;
    var rootLimit = difficulty === "hard" ? 11 : 9;
    var budget = difficulty === "hard" ? 220 : 70;
    var context = {
      deadline: Date.now() + budget,
      nodes: 0,
      timedOut: false
    };
    var rootMoves = ranked.slice(0, rootLimit);
    var bestCell = rootMoves[0].cell;
    var bestValue = -Infinity;

    for (index = 0; index < rootMoves.length; index += 1) {
      var cell = rootMoves[index].cell;
      board[cell] = AI;
      var value = minimax(board, rules, depth - 1, HUMAN, -Infinity, Infinity, cell, AI, context);
      board[cell] = EMPTY;
      value += rootMoves[index].score * 0.015;
      if (difficulty === "normal") {
        value += rng() * 4;
      }
      if (value > bestValue) {
        bestValue = value;
        bestCell = cell;
      }
      if (context.timedOut) {
        break;
      }
    }

    return bestCell;
  }

  return {
    EMPTY: EMPTY,
    HUMAN: HUMAN,
    AI: AI,
    SEAM_X: SEAM_X,
    SEAM_Y: SEAM_Y,
    SEAM_TWIST: SEAM_TWIST,
    DIRECTIONS: DIRECTIONS,
    mod: mod,
    createRules: createRules,
    createBoard: createBoard,
    toCell: toCell,
    toPoint: toPoint,
    step: step,
    checkWin: checkWin,
    boardIsFull: boardIsFull,
    boardIsDraw: boardIsDraw,
    immediateMoves: immediateMoves,
    scoreMove: scoreMove,
    rankMoves: rankMoves,
    evaluateBoard: evaluateBoard,
    chooseMove: chooseMove
  };
});
