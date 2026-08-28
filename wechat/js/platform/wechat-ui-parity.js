export function beginReplayPreservingView(controller, game) {
  if (!controller || !game) {
    return false;
  }
  const viewMode = game.viewMode;
  const started = controller.beginReplay();
  if (started) {
    game.viewMode = viewMode;
  }
  return started;
}

export function gameForReviewFrame(game) {
  if (!game || !game.review || game.review.step >= game.review.total) {
    return game;
  }
  return Object.assign({}, game, { winningMask: null });
}

export function chooseCompletionView(game, presentation, width, height, morphApi) {
  const Morph = morphApi || GameGlobal.TopologyMorph;
  const winningMask = game && game.winningMask;
  if (!game || !winningMask || !winningMask.cells || !winningMask.cells.length || !Morph) {
    return { x: 0, y: 0, z: 0, shapeX: 1, shapeY: 1, shapeZ: 1 };
  }

  const cells = Array.prototype.slice.call(winningMask.cells);
  const renderWidth = Math.max(1, Number(width) || 1);
  const renderHeight = Math.max(1, Number(height) || 1);
  const size = Math.max(1, Math.min(renderWidth, renderHeight));
  const targetLength = size * 0.34;
  let best = { x: 0, y: 0, z: 0, shapeX: 1, shapeY: 1, shapeZ: 1 };
  let bestScore = -Infinity;
  const pitchSteps = [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66];
  const rollSteps = [-0.36, -0.18, 0, 0.18, 0.36];
  const shapeSteps = game.level.topology === 'sphere'
    ? [{ x: 1, y: 1, z: 1 }]
    : [
        { x: 1, y: 1, z: 1 },
        { x: 0.92, y: 1.06, z: 1.04 },
        { x: 1.07, y: 0.93, z: 1.02 },
        { x: 0.96, y: 1.02, z: 1.09 },
      ];

  pitchSteps.forEach((pitch) => {
    for (let yawIndex = 0; yawIndex < 41; yawIndex += 1) {
      const yaw = -Math.PI + yawIndex / 40 * Math.PI * 2;
      rollSteps.forEach((roll) => {
        shapeSteps.forEach((shape) => {
          const points = cells.map((cell) => {
            const uv = Morph.stoneUV(game.rules, cell);
            return Morph.project(
              game.level.topology,
              uv.u,
              uv.v,
              renderWidth,
              renderHeight,
              {
                x: pitch,
                y: yaw,
                z: roll,
                shapeX: shape.x,
                shapeY: shape.y,
                shapeZ: shape.z,
                presentation,
              },
            );
          });
          let pathLength = 0;
          const segmentLengths = [];
          let depthTotal = 0;
          let minDepth = Infinity;
          let maxDepth = -Infinity;
          let centerX = 0;
          let centerY = 0;
          points.forEach((point, index) => {
            depthTotal += point.depth;
            minDepth = Math.min(minDepth, point.depth);
            maxDepth = Math.max(maxDepth, point.depth);
            centerX += point.x;
            centerY += point.y;
            if (index > 0) {
              const segmentLength = Math.hypot(
                point.x - points[index - 1].x,
                point.y - points[index - 1].y,
              );
              segmentLengths.push(segmentLength);
              pathLength += segmentLength;
            }
          });
          centerX /= points.length;
          centerY /= points.length;
          const meanSegment = pathLength / Math.max(1, segmentLengths.length);
          const segmentVariance = segmentLengths.reduce((total, length) => (
            total + Math.pow(length - meanSegment, 2)
          ), 0) / Math.max(1, segmentLengths.length);
          const segmentVariation = Math.sqrt(segmentVariance) / Math.max(1, meanSegment);
          const shortestSegment = Math.min.apply(Math, segmentLengths);
          const longestSegment = Math.max.apply(Math, segmentLengths);
          const extremeStretch = longestSegment / Math.max(1, shortestSegment);
          const averageDepth = depthTotal / points.length;
          const centerDistance = Math.hypot(
            centerX - renderWidth * 0.5,
            centerY - renderHeight * 0.5,
          );
          const shapeCost = Math.abs(shape.x - 1)
            + Math.abs(shape.y - 1)
            + Math.abs(shape.z - 1);
          let lineDeviation = 0;
          let turnPenalty = 0;
          let sphereSingularityDepth = 0;
          if (game.level.topology === 'sphere' && points.length > 2) {
            const lineStart = points[0];
            const lineEnd = points[points.length - 1];
            const lineX = lineEnd.x - lineStart.x;
            const lineY = lineEnd.y - lineStart.y;
            const lineLength = Math.hypot(lineX, lineY) || 1;
            for (let bendIndex = 1; bendIndex < points.length - 1; bendIndex += 1) {
              lineDeviation += Math.abs(
                lineX * (points[bendIndex].y - lineStart.y)
                  - lineY * (points[bendIndex].x - lineStart.x),
              ) / lineLength / size;
              const incomingX = points[bendIndex].x - points[bendIndex - 1].x;
              const incomingY = points[bendIndex].y - points[bendIndex - 1].y;
              const outgoingX = points[bendIndex + 1].x - points[bendIndex].x;
              const outgoingY = points[bendIndex + 1].y - points[bendIndex].y;
              turnPenalty += 1 - (
                incomingX * outgoingX + incomingY * outgoingY
              ) / Math.max(
                1,
                Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY),
              );
            }
            const sphereView = {
              x: pitch,
              y: yaw,
              z: roll,
              shapeX: 1,
              shapeY: 1,
              shapeZ: 1,
              presentation,
            };
            const upperPole = Morph.project(
              'sphere', 2 / 3, 1 / 3, renderWidth, renderHeight, sphereView,
            );
            const lowerPole = Morph.project(
              'sphere', 1 / 3, 2 / 3, renderWidth, renderHeight, sphereView,
            );
            sphereSingularityDepth = Math.max(
              Math.abs(upperPole.depth),
              Math.abs(lowerPole.depth),
            );
          }

          let score = averageDepth * 5.4 + minDepth * 4.8;
          score -= Math.abs(pathLength - targetLength) / size * 1.35;
          score -= (maxDepth - minDepth) * 0.8;
          score -= segmentVariation * 2.1;
          score -= Math.max(0, extremeStretch - 2.15) * 2.8;
          score -= shortestSegment < size * 0.026 ? 2.8 : 0;
          score -= centerDistance / size * 0.2;
          score -= Math.abs(roll) * 0.06;
          score -= shapeCost * 0.28;
          score -= lineDeviation * 5.6;
          score -= turnPenalty * 0.72;
          score -= sphereSingularityDepth * 1.15;
          if (score > bestScore) {
            bestScore = score;
            best = {
              x: pitch,
              y: yaw,
              z: roll,
              shapeX: shape.x,
              shapeY: shape.y,
              shapeZ: shape.z,
            };
          }
        });
      });
    }
  });
  return best;
}
