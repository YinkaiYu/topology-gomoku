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

  // On orientable boards four directions are enough because every path has a
  // canonical reverse. A twisted seam can flip a diagonal, though, leaving
  // both endpoint directions in the other half of the compass. Generate from
  // all eight directions and let the cell-set key remove true reversals.
  var WIN_DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7];
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
    } else if (type === "sphere") {
      // A square becomes a sphere when adjacent edge pairs are identified:
      // north with west, and south with east. Crossing a seam therefore
      // rotates the direction by a quarter turn instead of translating or
      // reflecting it. The four outward corner diagonals pass through a
      // chart vertex and are intentionally omitted from this discrete grid.
      if (crossesX && crossesY) {
        return null;
      }
      if (rawY < 0) {
        seam |= SEAM_X;
        nextX = 0;
        nextY = rawX;
        nextDx = -vector.dy;
        nextDy = vector.dx;
      } else if (rawX < 0) {
        seam |= SEAM_X;
        nextX = rawY;
        nextY = 0;
        nextDx = vector.dy;
        nextDy = -vector.dx;
      } else if (rawY >= height) {
        seam |= SEAM_Y;
        nextX = width - 1;
        nextY = rawX;
        nextDx = -vector.dy;
        nextDy = vector.dx;
      } else if (rawX >= width) {
        seam |= SEAM_Y;
        nextX = rawY;
        nextY = height - 1;
        nextDx = vector.dy;
        nextDy = -vector.dx;
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

    if (type === "sphere" && width !== height) {
      throw new Error("Sphere topology requires a square board");
    }

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

  function tracePath(rules, startCell, direction, length) {
    if (startCell < 0 || startCell >= rules.cellCount || direction < 0 || direction >= DIRECTIONS.length || length < 1) {
      return null;
    }
    var cells = [startCell];
    var seams = [];
    var directions = [direction];
    var visited = Object.create(null);
    var currentCell = startCell;
    var currentDirection = direction;
    visited[startCell] = true;

    for (var index = 1; index < length; index += 1) {
      var result = step(rules, currentCell, currentDirection);
      if (!result || visited[result.cell]) {
        return null;
      }
      seams.push(result.seam);
      currentCell = result.cell;
      currentDirection = result.direction;
      visited[currentCell] = true;
      cells.push(currentCell);
      directions.push(currentDirection);
    }

    return {
      cells: cells,
      seams: seams,
      directions: directions
    };
  }

  function findLineHints(board, rules, player) {
    var hintsByCell = Object.create(null);
    var startCell;
    var directionIndexValue;

    function rememberHint(cell, kind) {
      var current = hintsByCell[cell];
      if (!current || (current.kind === "three" && kind === "four")) {
        hintsByCell[cell] = { cell: cell, kind: kind };
      }
    }

    for (startCell = 0; startCell < rules.cellCount; startCell += 1) {
      for (directionIndexValue = 0; directionIndexValue < WIN_DIRECTIONS.length; directionIndexValue += 1) {
        var path = tracePath(rules, startCell, WIN_DIRECTIONS[directionIndexValue], rules.target);
        if (!path) {
          continue;
        }
        var cells = path.cells;
        var first = board[cells[0]];
        var last = board[cells[cells.length - 1]];
        var middleThree = board[cells[1]] === player && board[cells[2]] === player && board[cells[3]] === player;
        var ownCount = 0;
        var opponentCount = 0;
        var emptyCells = [];
        for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
          var value = board[cells[cellIndex]];
          if (value === player) {
            ownCount += 1;
          } else if (value === -player) {
            opponentCount += 1;
          } else {
            emptyCells.push(cells[cellIndex]);
          }
        }

        if (first === EMPTY && last === EMPTY && middleThree) {
          rememberHint(cells[0], "three");
          rememberHint(cells[4], "three");
        }
        if (ownCount === rules.target - 1 && opponentCount === 0 && emptyCells.length === 1) {
          rememberHint(emptyCells[0], "four");
        }
      }
    }

    return Object.keys(hintsByCell).map(function toHint(cell) {
      return hintsByCell[cell];
    }).sort(function sortHints(a, b) {
      return a.cell - b.cell;
    });
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
    return countLiveLines(board, rules, player) > 0;
  }

  function countLiveLines(board, rules, player) {
    var opponent = -player;
    var count = 0;
    var maskIndex;
    for (maskIndex = 0; maskIndex < rules.winMasks.length; maskIndex += 1) {
      if (countMask(board, rules.winMasks[maskIndex], opponent) === 0) {
        count += 1;
      }
    }
    return count;
  }

  function boardIsDraw(board, rules) {
    return boardIsFull(board) && hasLiveLine(board, rules, HUMAN) && hasLiveLine(board, rules, AI);
  }

  function playerWinsByBlockingAi(board, rules) {
    return !hasLiveLine(board, rules, AI);
  }

  function playerHasNoWinningPath(board, rules) {
    return !hasLiveLine(board, rules, HUMAN);
  }

  function playerWinsBySettledPosition(board, rules) {
    return playerWinsByBlockingAi(board, rules) || playerHasNoWinningPath(board, rules);
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

  function isLikelyDraw(board, rules) {
    var occupied = 0;
    for (var cell = 0; cell < board.length; cell += 1) {
      if (board[cell] !== EMPTY) {
        occupied += 1;
      }
    }
    if (occupied / Math.max(1, rules.cellCount) < 0.58) {
      return false;
    }
    if (immediateMoves(board, rules, HUMAN).length || immediateMoves(board, rules, AI).length) {
      return false;
    }
    var totalLines = Math.max(1, rules.winMasks.length);
    var humanLive = countLiveLines(board, rules, HUMAN);
    var aiLive = countLiveLines(board, rules, AI);
    if (!humanLive || !aiLive) {
      return false;
    }
    return humanLive / totalLines <= 0.2 && aiLive / totalLines <= 0.2;
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

  function suggestTutorialMove(board, rules, lastCell) {
    var centerX = Math.floor((rules.width - 1) / 2);
    var centerY = Math.floor((rules.height - 1) / 2);
    if (lastCell < 0 || board[lastCell] !== HUMAN) {
      var centerCell = toCell(rules, centerX, centerY);
      if (board[centerCell] === EMPTY) {
        return centerCell;
      }
    }

    var lastPoint = lastCell >= 0 ? toPoint(rules, lastCell) : { x: centerX, y: centerY };
    var bestCell = -1;
    var bestScore = -Infinity;
    var maskIndex;
    for (maskIndex = 0; maskIndex < rules.winMasks.length; maskIndex += 1) {
      var mask = rules.winMasks[maskIndex];
      var own = countMask(board, mask, HUMAN);
      var blocked = countMask(board, mask, AI) > 0;
      if (blocked) {
        continue;
      }
      var containsLast = Array.prototype.indexOf.call(mask.cells, lastCell) >= 0;
      for (var index = 0; index < mask.cells.length; index += 1) {
        var cell = mask.cells[index];
        if (board[cell] !== EMPTY) {
          continue;
        }
        var point = toPoint(rules, cell);
        var distance = Math.abs(point.x - lastPoint.x) + Math.abs(point.y - lastPoint.y);
        var horizontal = point.y === lastPoint.y ? 8 : 0;
        var forward = point.x > lastPoint.x ? 1.5 : 0;
        var score = own * 100 + (containsLast ? 24 : 0) + horizontal + forward - distance * 4;
        if (score > bestScore || (score === bestScore && cell < bestCell)) {
          bestScore = score;
          bestCell = cell;
        }
      }
    }
    return bestCell;
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

  function pickEasyMove(ranked, random, excluded) {
    var candidates = ranked.filter(function keepNonCritical(move) {
      return !excluded[move.cell];
    });
    if (!candidates.length) {
      candidates = ranked;
    }
    var weakerStart = Math.floor(candidates.length * 0.42);
    var weakerMoves = candidates.slice(weakerStart);
    return weakerMoves[Math.floor(random() * weakerMoves.length)].cell;
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

    if (playerWinsBySettledPosition(board, rules)) {
      return -WIN_SCORE / 2 - depth;
    }

    if (depth === 0 || boardIsFull(board)) {
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
    var takeWinChance = difficulty === "normal" ? 0.9 : 0.18;
    if (winning.length && (difficulty === "hard" || rng() < takeWinChance)) {
      return winning[Math.floor(rng() * winning.length)];
    }

    var mustBlock = immediateMoves(board, rules, HUMAN);
    var blockChance = difficulty === "normal" ? 0.78 : 0.16;
    if (mustBlock.length && (difficulty === "hard" || rng() < blockChance)) {
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
    var skippedCritical = Object.create(null);
    winning.forEach(function skipWinningCell(cell) { skippedCritical[cell] = true; });
    mustBlock.forEach(function skipBlockingCell(cell) { skippedCritical[cell] = true; });
    if (difficulty === "easy") {
      return pickEasyMove(ranked, rng, skippedCritical);
    }

    var searchMoves = ranked;
    if (difficulty === "normal") {
      var normalMoves = ranked.filter(function keepNonCritical(move) {
        return !skippedCritical[move.cell];
      });
      searchMoves = normalMoves.length ? normalMoves : ranked;
    }

    var depth = difficulty === "hard" ? 3 : 2;
    var rootLimit = difficulty === "hard" ? 11 : 7;
    var budget = difficulty === "hard" ? 220 : 42;
    var context = {
      deadline: Date.now() + budget,
      nodes: 0,
      timedOut: false
    };
    var rootMoves = searchMoves.slice(0, rootLimit);
    var bestCell = rootMoves[0].cell;
    var bestValue = -Infinity;
    var evaluatedMoves = [];

    for (index = 0; index < rootMoves.length; index += 1) {
      var cell = rootMoves[index].cell;
      board[cell] = AI;
      var value = minimax(board, rules, depth - 1, HUMAN, -Infinity, Infinity, cell, AI, context);
      board[cell] = EMPTY;
      value += rootMoves[index].score * 0.015;
      evaluatedMoves.push({ cell: cell, score: value });
      if (value > bestValue) {
        bestValue = value;
        bestCell = cell;
      }
      if (context.timedOut) {
        break;
      }
    }

    if (difficulty === "normal") {
      evaluatedMoves.sort(function sortEvaluated(a, b) {
        return b.score - a.score;
      });
      return pickWeighted(evaluatedMoves, rng);
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
    tracePath: tracePath,
    findLineHints: findLineHints,
    checkWin: checkWin,
    boardIsFull: boardIsFull,
    boardIsDraw: boardIsDraw,
    hasLiveLine: hasLiveLine,
    countLiveLines: countLiveLines,
    isLikelyDraw: isLikelyDraw,
    playerWinsByBlockingAi: playerWinsByBlockingAi,
    playerHasNoWinningPath: playerHasNoWinningPath,
    playerWinsBySettledPosition: playerWinsBySettledPosition,
    immediateMoves: immediateMoves,
    scoreMove: scoreMove,
    rankMoves: rankMoves,
    suggestTutorialMove: suggestTutorialMove,
    evaluateBoard: evaluateBoard,
    chooseMove: chooseMove
  };
});
