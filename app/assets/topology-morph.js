(function attachTopologyMorph(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyMorph = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyMorphFactory() {
  "use strict";

  var TAU = Math.PI * 2;

  var CAMERAS = {
    cylinder: { rotation: [0.34, -0.56, -0.12], scale: 0.27, radius: 1.51 },
    torus: { rotation: [0.72, -0.12, -0.24], scale: 0.235, radius: 1.78 },
    mobius: { rotation: [0.96, -0.08, -0.12], scale: 0.245, radius: 1.905 },
    klein: { rotation: [0.18, -0.2, -0.08], scale: 0.29, radius: 1.46 },
    projective: { rotation: [0.66, -0.52, 0.12], scale: 0.285, radius: 1.415 },
    sphere: { rotation: [0.42, -0.58, -0.08], scale: 0.315, radius: 1 }
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function smooth(value) {
    var t = clamp01(value);
    return t * t * (3 - 2 * t);
  }

  function spring(value) {
    var t = clamp01(value);
    if (t === 0 || t === 1) {
      return t;
    }
    var damping = 0.5;
    var frequency = 9.2;
    var dampedFrequency = frequency * Math.sqrt(1 - damping * damping);
    var phase = damping / Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * frequency * t) *
      (Math.cos(dampedFrequency * t) + phase * Math.sin(dampedFrequency * t));
  }

  function cylinder(u, v) {
    var angle = TAU * u;
    return [1.05 * Math.cos(angle), (v - 0.5) * 2.15, 1.05 * Math.sin(angle)];
  }

  function torus(u, v) {
    var around = TAU * u;
    var tube = TAU * v;
    var radius = 1.32 + 0.46 * Math.cos(tube);
    return [radius * Math.cos(around), 0.46 * Math.sin(tube), radius * Math.sin(around)];
  }

  function mobius(u, v) {
    var angle = TAU * u;
    var across = (v - 0.5) * 1.25;
    var radius = 1.28 + across * Math.cos(angle / 2);
    return [radius * Math.cos(angle), across * Math.sin(angle / 2), radius * Math.sin(angle)];
  }

  function klein(u, v) {
    var theta = TAU * u;
    var phi = TAU * v + Math.PI / 2;
    var radius = 4 * (1 - 0.5 * Math.cos(theta));
    var x;
    var y;
    if (theta < Math.PI) {
      x = 6 * Math.cos(theta) * (1 + Math.sin(theta)) + radius * Math.cos(theta) * Math.cos(phi);
      y = 16 * Math.sin(theta) + radius * Math.sin(theta) * Math.cos(phi);
    } else {
      x = 6 * Math.cos(theta) * (1 + Math.sin(theta)) - radius * Math.cos(phi);
      y = 16 * Math.sin(theta);
    }
    return [x / 11.5, y / 16.5, radius * Math.sin(phi) / 5.2];
  }

  function projective(u, v) {
    var squareX = u * 2 - 1;
    var squareY = v * 2 - 1;
    var radius = Math.max(Math.abs(squareX), Math.abs(squareY));
    var length = Math.hypot(squareX, squareY);
    var diskX = length ? radius * squareX / length : 0;
    var diskY = length ? radius * squareY / length : 0;
    var sphereZ = Math.sqrt(Math.max(0, 1 - radius * radius));
    return [
      diskY * sphereZ * 2.45,
      sphereZ * diskX * 2.45,
      diskX * diskY * 2.45
    ];
  }

  function triangleHemisphere(a, b, c, sign) {
    // Send the triangular chart to a disk using a concentric-triangle map.
    // Each ray is normalised by the exact triangle boundary it reaches and
    // each boundary edge occupies one third of the equator.  This preserves
    // the original chess-grid curves while avoiding the severe centre/edge
    // crowding caused by the old 27abc radial coordinate.
    var planarX = a - (b + c) * 0.5;
    var planarY = (b - c) * Math.sqrt(3) * 0.5;
    var planarLength = Math.hypot(planarX, planarY);
    if (planarLength < 1e-10) {
      return [0, 0, sign];
    }

    var directionX = planarX / planarLength;
    var directionY = planarY / planarLength;
    var boundaryRadius = Infinity;
    var constraints = [
      2 * directionX,
      -directionX + Math.sqrt(3) * directionY,
      -directionX - Math.sqrt(3) * directionY
    ];
    constraints.forEach(function findBoundary(coefficient) {
      if (coefficient < -1e-10) {
        boundaryRadius = Math.min(boundaryRadius, -1 / coefficient);
      }
    });
    var radial = Math.max(0, Math.min(1, planarLength / boundaryRadius));
    if (radial < 1e-10) {
      return [0, 0, sign];
    }

    // Recover the point where this ray meets the triangular boundary.  Its
    // barycentric coordinate gives a perimeter-linear angle, so equal board
    // intervals stay much closer to equal intervals around the equator.
    var boundaryA = 1 / 3 + (a - 1 / 3) / radial;
    var boundaryB = 1 / 3 + (b - 1 / 3) / radial;
    var boundaryC = 1 / 3 + (c - 1 / 3) / radial;
    var angle;
    if (boundaryC <= boundaryA && boundaryC <= boundaryB) {
      angle = boundaryB * TAU / 3;
    } else if (boundaryA <= boundaryB && boundaryA <= boundaryC) {
      angle = TAU / 3 + boundaryC * TAU / 3;
    } else {
      angle = TAU * 2 / 3 + boundaryA * TAU / 3;
    }

    var z = sign * (1 - radial * radial);
    var ringRadius = Math.sqrt(Math.max(0, 1 - z * z));
    return [
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius,
      z
    ];
  }

  function sphereBase(u, v) {
    // The square is split along its diagonal.  Corresponding sides of the two
    // triangles are precisely top~left, right~bottom and the shared diagonal;
    // mapping them to opposite hemispheres therefore realizes the quotient
    // S(u,0)=S(0,u), S(u,1)=S(1,u) without a gap or self-intersection.
    var upper = v <= u;
    var a = upper ? 1 - u : 1 - v;
    var b = upper ? u - v : v - u;
    var c = upper ? v : u;
    return triangleHemisphere(a, b, c, upper ? 1 : -1);
  }

  // Six lattice intervals per board interval keep every 7x7 intersection
  // exact while leaving enough resolution for a smooth low-bend solve.
  var SPHERE_LATTICE_SIZE = 42;
  var sphereLattice = null;
  var sphereChartLattice = null;

  function sphereChartPoint(point, upper) {
    var sector = ((Math.atan2(point[1], point[0]) + TAU) % TAU) / (TAU / 3);
    var a = sector < 1 ? 1 - sector : sector < 2 ? 0 : sector - 2;
    var c = sector < 1 ? 0 : sector < 2 ? sector - 1 : 3 - sector;
    var radius = Math.sqrt(Math.max(0, 1 - Math.abs(point[2])));
    a = (1 - radius) / 3 + a * radius;
    c = (1 - radius) / 3 + c * radius;
    return upper ? [1 - a, c] : [c, 1 - a];
  }

  function preserveSphereDiagonal(points, size) {
    var step = TAU / 3 / size * 0.2;
    var limit = TAU / 3 - size * step;
    var blocks = [];
    for (var index = 0; index <= size; index += 1) {
      var p = points[index][index];
      var value = Math.max(0, Math.min(limit, -Math.atan2(p[1], p[0]) - index * step));
      blocks.push({ start: index, end: index, sum: value, count: 1 });
      while (blocks.length > 1) {
        var a = blocks[blocks.length - 2], b = blocks[blocks.length - 1];
        if (a.sum / a.count <= b.sum / b.count) { break; }
        blocks.splice(blocks.length - 2, 2, { start: a.start, end: b.end, sum: a.sum + b.sum, count: a.count + b.count });
      }
    }
    blocks.forEach(function monotoneArc(block) {
      for (var index = block.start; index <= block.end; index += 1) {
        var angle = -(block.sum / block.count + index * step);
        points[index][index] = [Math.cos(angle), Math.sin(angle), 0];
      }
    });
  }

  function buildSphereLattice() {
    var size = SPHERE_LATTICE_SIZE;
    var original = [];
    var points = [];
    for (var row = 0; row <= size; row += 1) {
      var originalRow = [];
      var pointRow = [];
      for (var column = 0; column <= size; column += 1) {
        var point = sphereBase(column / size, row / size);
        originalRow.push(point);
        pointRow.push(point.slice());
      }
      original.push(originalRow);
      points.push(pointRow);
    }

    // Minimise a discrete bending energy before the grid is ever rendered.
    // Horizontal and vertical neighbours behave like elastic rods: a point
    // is pulled toward the spherical midpoint of both opposite neighbour
    // pairs.  A light equal-area tether prevents the rods from collapsing or
    // migrating into one hemisphere.  The quotient boundary stays fixed, so
    // all original square-edge identifications remain exact.
    for (var iteration = 0; iteration < 96; iteration += 1) {
      var next = points.map(function cloneSphereRow(pointRow) {
        return pointRow.map(function cloneSpherePoint(point) { return point.slice(); });
      });
      for (row = 1; row < size; row += 1) {
        for (column = 1; column < size; column += 1) {
          var current = points[row][column];
          var horizontalMidpoint = normalize3([
            points[row][column - 1][0] + points[row][column + 1][0],
            points[row][column - 1][1] + points[row][column + 1][1],
            points[row][column - 1][2] + points[row][column + 1][2]
          ]);
          var verticalMidpoint = normalize3([
            points[row - 1][column][0] + points[row + 1][column][0],
            points[row - 1][column][1] + points[row + 1][column][1],
            points[row - 1][column][2] + points[row + 1][column][2]
          ]);
          var lowBendTarget = normalize3([
            horizontalMidpoint[0] + verticalMidpoint[0],
            horizontalMidpoint[1] + verticalMidpoint[1],
            horizontalMidpoint[2] + verticalMidpoint[2]
          ]);
          var tether = original[row][column];
          next[row][column] = normalize3([
            current[0] * 0.34 + lowBendTarget[0] * 0.56 + tether[0] * 0.1,
            current[1] * 0.34 + lowBendTarget[1] * 0.56 + tether[1] * 0.1,
            current[2] * 0.34 + lowBendTarget[2] * 0.56 + tether[2] * 0.1
          ]);
        }
      }
      // Preserve the optimized spacing while preventing the shared equator
      // from doubling back near its ends. A small minimum interval keeps
      // neighboring cells distinct instead of clamping them to one point.
      preserveSphereDiagonal(next, size);
      points = next;
    }
    sphereChartLattice = points.map(function chartRow(pointRow, row) {
      return pointRow.map(function chartVertex(point, column) {
        return sphereChartPoint(point, row <= column);
      });
    });
    return points;
  }

  function sphere(u, v) {
    prepareSphere();
    var size = SPHERE_LATTICE_SIZE;
    var scaledU = clamp01(u) * size;
    var scaledV = clamp01(v) * size;
    var left = Math.min(size - 1, Math.floor(scaledU));
    var top = Math.min(size - 1, Math.floor(scaledV));
    var amountU = scaledU - left;
    var amountV = scaledV - top;
    if (scaledU >= size) {
      left = size - 1;
      amountU = 1;
    }
    if (scaledV >= size) {
      top = size - 1;
      amountV = 1;
    }
    var topLeft = sphereLattice[top][left];
    var topRight = sphereLattice[top][left + 1];
    var bottomLeft = sphereLattice[top + 1][left];
    var bottomRight = sphereLattice[top + 1][left + 1];
    // The two hemispheres meet on the square diagonal. Interpolate inside
    // each triangular chart; a bilinear mix crosses that diagonal and can
    // reverse its optimized equator near the two ends.
    function interpolate(a, b, c, d, axis) {
      return amountU >= amountV
        ? a[axis] * (1 - amountU) + b[axis] * (amountU - amountV) + d[axis] * amountV
        : a[axis] * (1 - amountV) + c[axis] * (amountV - amountU) + d[axis] * amountU;
    }
    var relaxed = normalize3([0, 1, 2].map(function interpolateSphere(axis) {
      return interpolate(topLeft, topRight, bottomLeft, bottomRight, axis);
    }));
    var cornerDistance = Math.min(Math.hypot(u, v), Math.hypot(1 - u, v), Math.hypot(u, 1 - v), Math.hypot(1 - u, 1 - v));
    var curvature = 0.2 * (1 - smooth((cornerDistance - 0.02) / 0.03));
    if (!curvature) { return relaxed; }
    var chartA = sphereChartLattice[top][left], chartB = sphereChartLattice[top][left + 1];
    var chartC = sphereChartLattice[top + 1][left], chartD = sphereChartLattice[top + 1][left + 1];
    var chartU = interpolate(chartA, chartB, chartC, chartD, 0);
    var chartV = interpolate(chartA, chartB, chartC, chartD, 1);
    var analytic = sphereBase(chartU, chartV);
    // Corner triangles have three equator vertices. Recover a small amount
    // of their chart's true curvature so the two opposite sheets do not
    // collapse onto the same flat face; preserve the relaxed grid elsewhere.
    return normalize3(relaxed.map(function restoreCurvature(value, axis) {
      return value + (analytic[axis] - value) * curvature;
    }));
  }

  function prepareSphere() {
    if (!sphereLattice) {
      sphereLattice = buildSphereLattice();
    }
    return sphereLattice;
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function normalize3(point) {
    var length = Math.hypot(point[0], point[1], point[2]) || 1;
    return [point[0] / length, point[1] / length, point[2] / length];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function bestGreatCircleNormal(points) {
    var best = null;
    var bestScore = Infinity;
    for (var first = 0; first < points.length; first += 1) {
      for (var second = first + 1; second < points.length; second += 1) {
        var candidate = cross3(points[first], points[second]);
        if (Math.hypot(candidate[0], candidate[1], candidate[2]) < 0.08) {
          continue;
        }
        candidate = normalize3(candidate);
        var score = points.reduce(function planeError(total, point) {
          return total + Math.pow(dot3(point, candidate), 2);
        }, 0);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    return best || [0, 0, 1];
  }

  function sphereMobius(point, boost) {
    var boostLength2 = dot3(boost, boost);
    if (boostLength2 < 1e-10) {
      return point;
    }
    var pointBoost = dot3(point, boost);
    var denominator = 1 + 2 * pointBoost + boostLength2;
    return normalize3([
      ((1 - boostLength2) * point[0] + 2 * (1 + pointBoost) * boost[0]) / denominator,
      ((1 - boostLength2) * point[1] + 2 * (1 + pointBoost) * boost[1]) / denominator,
      ((1 - boostLength2) * point[2] + 2 * (1 + pointBoost) * boost[2]) / denominator
    ]);
  }

  function spherePathCost(points) {
    var normal = bestGreatCircleNormal(points);
    var planeError = points.reduce(function sumPlaneError(total, point) {
      return total + Math.pow(dot3(point, normal), 2);
    }, 0) / points.length;
    var segments = [];
    for (var index = 1; index < points.length; index += 1) {
      segments.push(Math.acos(Math.max(-1, Math.min(1, dot3(points[index - 1], points[index])))));
    }
    var mean = segments.reduce(function sumSegments(total, length) { return total + length; }, 0) / segments.length;
    var variance = segments.reduce(function sumVariance(total, length) {
      return total + Math.pow(length - mean, 2);
    }, 0) / segments.length;
    var variation = Math.sqrt(variance) / Math.max(0.01, mean);
    var shortest = Math.min.apply(Math, segments);
    var longest = Math.max.apply(Math, segments);
    return planeError * 4.2 + variation * 0.9 + Math.max(0, longest / Math.max(0.05, shortest) - 1.8) * 0.7;
  }

  function createSpherePresentation(rules, cells) {
    if (!rules || !cells || cells.length < 3) {
      return null;
    }
    var anchors = cells.map(function sphereAnchor(cell) {
      var uv = stoneUV(rules, cell);
      return sphere(uv.u, uv.v);
    });
    var bestBoost = [0, 0, 0];
    var bestCost = spherePathCost(anchors);
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    [0.04, 0.08, 0.12].forEach(function testMagnitude(magnitude) {
      for (var sample = 0; sample < 42; sample += 1) {
        var vertical = 1 - 2 * (sample + 0.5) / 42;
        var horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        var azimuth = sample * goldenAngle;
        var boost = [
          Math.cos(azimuth) * horizontal * magnitude,
          vertical * magnitude,
          Math.sin(azimuth) * horizontal * magnitude
        ];
        var transformed = anchors.map(function transformAnchor(anchor) {
          return sphereMobius(anchor, boost);
        });
        // A conformal boost helps place the winning line, but it also changes
        // the apparent grid density.  Keep that adjustment deliberately mild
        // and charge quadratically for distortion so the sphere never looks
        // crowded on one side and empty on the other.
        var cost = spherePathCost(transformed) + magnitude * 0.1 + magnitude * magnitude * 1.15;
        if (cost < bestCost) {
          bestCost = cost;
          bestBoost = boost;
        }
      }
    });
    return {
      type: "sphere-path",
      anchors: anchors,
      boost: bestBoost
    };
  }

  function applyPresentation(point, presentation) {
    if (!presentation || presentation.type !== "sphere-path") {
      return point;
    }
    return sphereMobius(point, presentation.boost);
  }

  function createPresentation(type, rules, cells) {
    return type === "sphere" ? createSpherePresentation(rules, cells) : null;
  }

  // Interpolate the conformal map itself, not the projected points. This keeps
  // every intermediate surface on the sphere and preserves its glued seams.
  function blendPresentation(presentation, progress) {
    if (!presentation || presentation.type !== "sphere-path") {
      return presentation;
    }
    var amount = clamp01(progress);
    return {
      type: presentation.type,
      anchors: presentation.anchors,
      boost: presentation.boost.map(function blendBoost(value) { return value * amount; })
    };
  }

  function surfacePoint(type, u, v) {
    if (type === "cylinder") {
      return cylinder(u, v);
    }
    if (type === "torus") {
      return torus(u, v);
    }
    if (type === "mobius") {
      return mobius(u, v);
    }
    if (type === "klein") {
      return klein(u, v);
    }
    if (type === "projective") {
      return projective(u, v);
    }
    if (type === "sphere") {
      return sphere(u, v);
    }
    return [(u - 0.5) * 2, (v - 0.5) * 2, 0];
  }

  function rotate(point, angles) {
    var x = point[0];
    var y = point[1];
    var z = point[2];
    var rx = angles[0];
    var ry = angles[1];
    var rz = angles[2];
    var nextY = y * Math.cos(rx) - z * Math.sin(rx);
    var nextZ = y * Math.sin(rx) + z * Math.cos(rx);
    y = nextY;
    z = nextZ;
    var nextX = x * Math.cos(ry) + z * Math.sin(ry);
    nextZ = -x * Math.sin(ry) + z * Math.cos(ry);
    x = nextX;
    z = nextZ;
    nextX = x * Math.cos(rz) - y * Math.sin(rz);
    nextY = x * Math.sin(rz) + y * Math.cos(rz);
    return [nextX, nextY, z];
  }

  function projectPoint(type, surface, width, height, orientation) {
    var sourceSurface = surface;
    var camera = CAMERAS[type] || CAMERAS.cylinder;
    var offsetX = 0;
    var offsetY = 0;
    var offsetZ = 0;
    var scaleFactor = 1;
    var shapeX = 1;
    var shapeY = 1;
    var shapeZ = 1;
    var wobbleX = 0;
    var wobbleY = 0;
    var presentation = null;
    if (orientation && typeof orientation === "object") {
      offsetX = Number(orientation.x) || 0;
      offsetY = Number(orientation.y) || 0;
      offsetZ = Number(orientation.z) || 0;
      scaleFactor = Number(orientation.scale) || 1;
      shapeX = Number(orientation.shapeX) || 1;
      shapeY = Number(orientation.shapeY) || 1;
      shapeZ = Number(orientation.shapeZ) || 1;
      wobbleX = Number(orientation.wobbleX) || 0;
      wobbleY = Number(orientation.wobbleY) || 0;
      presentation = orientation.presentation || null;
    } else {
      offsetY = Number(orientation) || 0;
    }
    var angles = [
      camera.rotation[0] + offsetX,
      camera.rotation[1] + offsetY,
      camera.rotation[2] + offsetZ
    ];
    surface = applyPresentation(surface, presentation);
    surface = [surface[0] * shapeX, surface[1] * shapeY, surface[2] * shapeZ];
    var localFlex = Math.sin(surface[0] * 1.35 + surface[2] * 0.72);
    var softX = surface[0] * (1 + wobbleY * (0.82 + localFlex * 0.12)) + surface[1] * wobbleX * 0.38;
    var softY = surface[1] * (1 - wobbleY * 0.31) + surface[2] * wobbleX * (0.25 + localFlex * 0.05);
    var softZ = surface[2] * (1 - wobbleY * (0.35 - localFlex * 0.08)) - surface[0] * wobbleX * 0.19;
    var point = rotate([softX, softY, softZ], angles);
    var scale = Math.min(width, height) * camera.scale * scaleFactor;
    // Board views opt in; small topology glyphs keep their original framing.
    var perspective = orientation && typeof orientation === "object" ? clamp01(Number(orientation.perspective) || 0) : 0;
    var magnification = 4.8 / Math.max(1.2, 4.8 - point[2] * perspective);
    // Reserve room for stones using a rotation-independent bounding sphere.
    // This prevents the near edge cropping without zooming during a drag.
    var extent = camera.radius / Math.sqrt(1 - Math.pow(camera.radius / 4.8, 2));
    var framing = 1 + (Math.min(1, 0.39 / (extent * camera.scale)) - 1) * perspective;
    magnification *= framing;
    var projected = {
      x: width * 0.5 + point[0] * scale * magnification,
      y: height * 0.5 - point[1] * scale * magnification,
      depth: point[2],
      scale: magnification,
      depthScale: scale * magnification
    };
    if (type === "sphere" || type === "torus" || type === "cylinder" || type === "mobius") {
      projected.sourceSurface = sourceSurface;
      projected.orientation = orientation;
      projected.width = width; projected.height = height;
    }
    return projected;
  }

  function seamProgress(type, u, v, progress) {
    var t = clamp01(progress);
    var weight = 0;
    if (type === "sphere") {
      // The top/left pair is green; bottom/right is gold. A symmetric
      // weight gives both ends of each diagonal identification one clock.
      weight = Math.sin(Math.PI * 0.5 * Math.max(-1, Math.min(1, (u + v - 1) * 2)));
    } else if (type === "torus" || type === "klein" || type === "projective") {
      // Opposite edges share a clock even when their pairing reverses.
      // At corners the two clocks meet continuously at the base progress.
      weight = Math.pow(2 * v - 1, 2) - Math.pow(2 * u - 1, 2);
      weight = Math.sin(Math.PI * 0.5 * Math.max(-1, Math.min(1, weight * 1.5)));
    } else {
      return type === "cylinder" || type === "mobius" ? smooth((t - 0.04) / 0.96) : t;
    }
    var gold = smooth((t - 0.02) / 0.63);
    var green = smooth((t - 0.34) / 0.66);
    return green + (gold - green) * (weight + 1) * 0.5;
  }

  function quaternionFromMatrix(m) {
    var trace = m[0] + m[4] + m[8], q, s;
    if (trace > 0) {
      s = Math.sqrt(trace + 1) * 2;
      q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
    } else if (m[0] > m[4] && m[0] > m[8]) {
      s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
      q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
    } else if (m[4] > m[8]) {
      s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
      q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
    } else {
      s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
      q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
    }
    return q;
  }

  function blendQuaternion(from, to, amount) {
    var dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
    if (dot < 0) { to = to.map(function negate(value) { return -value; }); dot = -dot; }
    var a = 1 - amount, b = amount;
    if (dot < 0.9995) {
      var angle = Math.acos(Math.min(1, dot)), sine = Math.sin(angle);
      a = Math.sin((1 - amount) * angle) / sine; b = Math.sin(amount * angle) / sine;
    }
    var q = from.map(function blend(value, index) { return value * a + to[index] * b; });
    var length = Math.hypot(q[0], q[1], q[2], q[3]);
    return q.map(function normalize(value) { return value / length; });
  }

  function rotateQuaternion(point, q) {
    var x = point[0], y = point[1], z = point[2];
    var tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
    return [x + q[3] * tx + q[1] * tz - q[2] * ty,
      y + q[3] * ty + q[2] * tx - q[0] * tz,
      z + q[3] * tz + q[0] * ty - q[1] * tx];
  }

  // The ball Mobius map extends the spherical presentation to the surrounding
  // volume. Unlike normalization, this is one-to-one for the opening charts.
  function presentVolume(point, presentation, amount) {
    if (!presentation || presentation.type !== "sphere-path") { return point; }
    var boost = presentation.boost.map(function scaled(value) { return value * amount; });
    var length2 = dot3(point, point), boost2 = dot3(boost, boost), product = dot3(point, boost);
    var denominator = 1 + 2 * product + boost2 * length2;
    return point.map(function transform(value, axis) {
      return ((1 - boost2) * value + (1 + 2 * product + length2) * boost[axis]) / denominator;
    });
  }

  var sphereMorphCamera = null;
  function sphereMorphPoint(flat, u, v, projected, progress, frame) {
    var t = clamp01(progress), amount = seamProgress("sphere", u, v, t);
    var width = frame && frame.width || projected.width, height = frame && frame.height || projected.height;
    if (!width || !height || !projected.sourceSurface) { return null; }
    var orientation = projected.orientation || {}, b = smooth(t), shortSide = Math.min(width, height);
    var source = projected.sourceSurface, c = Math.sqrt(3) / 2;
    var sx = (flat.x - width / 2 + flat.y - height / 2) / shortSide;
    var sy = (flat.x - width / 2 - flat.y + height / 2) / shortSide;
    var stretch = 1 + 0.05 * smooth(t / 0.1) * (1 - b);
    var canonical = [(1 - b) * sx * stretch + b * (-c * source[0] - 0.5 * source[1]),
      (1 - amount) * sy * stretch + amount * source[2], b * (-0.5 * source[0] + c * source[1])];
    // Each chart remains on its own side of canonical Y=0. Both chart
    // interiors project injectively onto XZ; only the intended seams meet.
    var surface = [-c * canonical[0] - 0.5 * canonical[2],
      -0.5 * canonical[0] + c * canonical[2], canonical[1]];
    surface = presentVolume(surface, orientation.presentation, b);
    var shapeX = 1 + ((Number(orientation.shapeX) || 1) - 1) * b;
    var shapeY = 1 + ((Number(orientation.shapeY) || 1) - 1) * b;
    var shapeZ = 1 + ((Number(orientation.shapeZ) || 1) - 1) * b;
    surface = [surface[0] * shapeX, surface[1] * shapeY, surface[2] * shapeZ];
    var wobbleX = (Number(orientation.wobbleX) || 0) * b, wobbleY = (Number(orientation.wobbleY) || 0) * b;
    var flex = Math.sin(surface[0] * 1.35 + surface[2] * 0.72);
    var soft = [surface[0] * (1 + wobbleY * (0.82 + flex * 0.12)) + surface[1] * wobbleX * 0.38,
      surface[1] * (1 - wobbleY * 0.31) + surface[2] * wobbleX * (0.25 + flex * 0.05),
      surface[2] * (1 - wobbleY * (0.35 - flex * 0.08)) - surface[0] * wobbleX * 0.19];
    canonical = [-c * soft[0] - 0.5 * soft[1], soft[2], -0.5 * soft[0] + c * soft[1]];
    var rx = Number(orientation.x) || 0, ry = typeof orientation === "number" ? orientation : Number(orientation.y) || 0, rz = Number(orientation.z) || 0;
    var cache = sphereMorphCamera;
    var pose = smooth((t - 0.12) / 0.88);
    if (!cache || cache.t !== t) {
      var target = quaternionFromMatrix([-c, 0, -0.5, -0.5, 0, c, 0, 1, 0]);
      cache = { t: t, q: blendQuaternion([0, 0, -Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)], target, pose) };
      sphereMorphCamera = cache;
    }
    // Blend only the fixed chart basis as a quaternion. User Euler angles
    // keep their continuous branch while dragging a partly closed board.
    var point = rotate(rotateQuaternion(canonical, cache.q), [
      (CAMERAS.sphere.rotation[0] + rx) * pose,
      (CAMERAS.sphere.rotation[1] + ry) * pose,
      (CAMERAS.sphere.rotation[2] + rz) * pose]);
    var scaleFactor = Number(orientation.scale) || 1;
    var scale = shortSide * (Math.SQRT1_2 + (CAMERAS.sphere.scale * scaleFactor - Math.SQRT1_2) * smooth(t / 0.75));
    var perspective = clamp01(Number(orientation.perspective) || 0) * b;
    var magnification = 4.8 / Math.max(1.2, 4.8 - point[2] * perspective);
    var extent = CAMERAS.sphere.radius / Math.sqrt(1 - Math.pow(CAMERAS.sphere.radius / 4.8, 2));
    magnification *= 1 + (Math.min(1, 0.39 / (extent * CAMERAS.sphere.scale)) - 1) * perspective;
    return { x: width / 2 + point[0] * scale * magnification, y: height / 2 - point[1] * scale * magnification,
      depth: point[2], scale: 1 + (magnification - 1) * b, depthScale: scale * magnification, u: u, v: v };
  }

  function sinc(angle) {
    return Math.abs(angle) < 1e-5 ? 1 - angle * angle / 6 : Math.sin(angle) / angle;
  }

  function cosc(angle) {
    return Math.abs(angle) < 1e-5 ? angle / 2 - angle * angle * angle / 24 : 2 * Math.pow(Math.sin(angle / 2), 2) / angle;
  }

  var rolledMorphCameras = {};
  var rolledMorphFits = {};
  function rolledMorphPoint(type, flat, u, v, projected, progress, frame) {
    var width = frame && frame.width || projected.width, height = frame && frame.height || projected.height;
    if (!width || !height || !projected.sourceSurface) { return null; }
    var t = clamp01(progress), b = smooth(t), shortSide = Math.min(width, height);
    var orientation = projected.orientation || {}, camera = CAMERAS[type];
    var initialScale = shortSide * 0.4;
    var flatX = (flat.x - width / 2) / initialScale, flatY = (flat.y - height / 2) / initialScale;
    var around = type === "torus" ? smooth((t - 0.34) / 0.66) : smooth((t - 0.04) / 0.96);
    var angle = TAU * around * (u - 0.5), radius = type === "torus" ? 1.32 : type === "mobius" ? 1.28 : 1.05;
    var along = (1 - around) * flatX + around * TAU * radius * (u - 0.5);
    var across = 0, vertical = 0;
    if (type === "torus") {
      var tube = smooth((t - 0.02) / 0.63), tubeAngle = TAU * tube * (v - 0.5);
      var tubeAlong = (1 - tube) * flatY + tube * TAU * 0.46 * (v - 0.5);
      across = tubeAlong * cosc(tubeAngle) - 0.46 * tube;
      vertical = -tubeAlong * sinc(tubeAngle);
    } else if (type === "mobius") {
      var ribbon = (1 - b) * flatY + b * 1.25 * (v - 0.5);
      var twist = Math.PI * around * u;
      across = ribbon * Math.cos(twist);
      vertical = ribbon * Math.sin(twist);
    } else {
      vertical = (1 - b) * flatY + b * 2.15 * (v - 0.5);
    }
    // Bend an open arc rather than moving its vertices through the final
    // surface. Its radial coordinate stays positive; each partial azimuth is
    // unique. The torus closes its cross-section before bending the long axis.
    var canonical = [along * sinc(angle) + across * Math.sin(angle), vertical,
      along * cosc(angle) - across * Math.cos(angle) - radius * around];
    var stretch = 1 + 0.06 * smooth(t / 0.1) * (1 - b);
    canonical = canonical.map(function stretchOpening(value) { return value * stretch; });
    // This fixed quarter-turn is precisely the existing endpoint chart.
    var surface = [canonical[2], canonical[1], -canonical[0]];
    var shapeX = 1 + ((Number(orientation.shapeX) || 1) - 1) * b;
    var shapeY = 1 + ((Number(orientation.shapeY) || 1) - 1) * b;
    var shapeZ = 1 + ((Number(orientation.shapeZ) || 1) - 1) * b;
    surface = [surface[0] * shapeX, surface[1] * shapeY, surface[2] * shapeZ];
    var wobbleX = (Number(orientation.wobbleX) || 0) * b, wobbleY = (Number(orientation.wobbleY) || 0) * b;
    var flex = Math.sin(surface[0] * 1.35 + surface[2] * 0.72);
    var soft = [surface[0] * (1 + wobbleY * (0.82 + flex * 0.12)) + surface[1] * wobbleX * 0.38,
      surface[1] * (1 - wobbleY * 0.31) + surface[2] * wobbleX * (0.25 + flex * 0.05),
      surface[2] * (1 - wobbleY * (0.35 - flex * 0.08)) - surface[0] * wobbleX * 0.19];
    canonical = [-soft[2], soft[1], soft[0]];
    var pose = smooth((t - 0.12) / 0.88), cache = rolledMorphCameras[type];
    if (!cache || cache.t !== t) {
      var start = type === "mobius" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : type === "cylinder" ? [1, 0, 0, 0] : [0, 0, 0, 1];
      cache = { t: t, q: blendQuaternion(start, [0, Math.SQRT1_2, 0, Math.SQRT1_2], pose) };
      rolledMorphCameras[type] = cache;
    }
    var point = rotateQuaternion(canonical, cache.q);
    var rx = Number(orientation.x) || 0, ry = typeof orientation === "number" ? orientation : Number(orientation.y) || 0, rz = Number(orientation.z) || 0;
    point = rotate(point, [(camera.rotation[0] + rx) * pose, (camera.rotation[1] + ry) * pose, (camera.rotation[2] + rz) * pose]);
    var scaleFactor = Number(orientation.scale) || 1;
    var scale = initialScale + (shortSide * camera.scale * scaleFactor - initialScale) * smooth(t / 0.6);
    // An open rolled arc reaches farther than its closed endpoint. Give that
    // intermediate volume room as one object, without clipping its vertices.
    var openingRoom = type === "mobius" ? 0.34 : type === "cylinder" ? 0.2 : 0.08;
    scale *= 1 - openingRoom * Math.pow(Math.sin(Math.PI * t), 2);
    var perspective = clamp01(Number(orientation.perspective) || 0) * b;
    var magnification = 4.8 / Math.max(1.2, 4.8 - point[2] * perspective);
    var extent = camera.radius / Math.sqrt(1 - Math.pow(camera.radius / 4.8, 2));
    magnification *= 1 + (Math.min(1, 0.39 / (extent * camera.scale)) - 1) * perspective;
    if (!(frame && frame.rolledFitSample)) {
      var layout = frame && (frame.layout || frame), fit = rolledMorphFits[type];
      var cell = Number(layout && layout.cell) || shortSide * 0.08;
      var spanX = layout && Number.isFinite(layout.left) ? layout.right - layout.left + (isPeriodicX(type) ? Number(layout.cell) || 0 : 0) :
        Math.abs(u - 0.5) > 1e-6 ? (flat.x - width / 2) / (u - 0.5) : fit && fit.width === width ? fit.spanX : shortSide * 0.9;
      var spanY = layout && Number.isFinite(layout.top) ? layout.bottom - layout.top + (isPeriodicY(type) ? Number(layout.cell) || 0 : 0) :
        Math.abs(v - 0.5) > 1e-6 ? (flat.y - height / 2) / (v - 0.5) : fit && fit.height === height ? fit.spanY : spanX;
      var poseValues = [rx, ry, rz, orientation.shapeX, orientation.shapeY, orientation.shapeZ,
        orientation.wobbleX, orientation.wobbleY, orientation.scale, orientation.perspective];
      if (!fit || fit.t !== t || fit.width !== width || fit.height !== height || Math.abs(fit.spanX - spanX) > 1e-6 ||
          Math.abs(fit.spanY - spanY) > 1e-6 || fit.cell !== cell || poseValues.some(function changed(value, index) { return value !== fit.pose[index]; })) {
        var maxX = 0, maxY = 0, stoneX = 0, stoneY = 0, sampleFrame = { width: width, height: height, rolledFitSample: true };
        var insetU = layout && Number.isFinite(layout.left) && isPeriodicX(type) ? cell / (2 * spanX) : 0;
        var insetV = layout && Number.isFinite(layout.top) && isPeriodicY(type) ? cell / (2 * spanY) : 0;
        for (var row = 0; row <= 10; row += 1) {
          for (var column = 0; column <= 10; column += 1) {
            var su = column / 10, sv = row / 10;
            var sample = rolledMorphPoint(type, { x: width / 2 + (su - 0.5) * spanX, y: height / 2 + (sv - 0.5) * spanY },
              su, sv, projected, t, sampleFrame);
            maxX = Math.max(maxX, Math.abs(sample.x - width / 2)); maxY = Math.max(maxY, Math.abs(sample.y - height / 2));
            su = insetU + su * (1 - 2 * insetU); sv = insetV + sv * (1 - 2 * insetV);
            sample = rolledMorphPoint(type, { x: width / 2 + (su - 0.5) * spanX, y: height / 2 + (sv - 0.5) * spanY },
              su, sv, projected, t, sampleFrame);
            stoneX = Math.max(stoneX, Math.abs(sample.x - width / 2)); stoneY = Math.max(stoneY, Math.abs(sample.y - height / 2));
          }
        }
        var margin = cell * 0.52 + 3;
        fit = { t: t, width: width, height: height, spanX: spanX, spanY: spanY, cell: cell, pose: poseValues,
          scale: Math.min(1, (width / 2 - 5) / Math.max(1, maxX), (height / 2 - 5) / Math.max(1, maxY),
            (width / 2 - margin) / Math.max(1, stoneX), (height / 2 - margin) / Math.max(1, stoneY)) };
        rolledMorphFits[type] = fit;
      }
      scale *= Math.max(0.1, fit.scale);
    }
    return { x: width / 2 + point[0] * scale * magnification, y: height / 2 - point[1] * scale * magnification,
      depth: point[2], scale: 1 + (magnification - 1) * b, depthScale: scale * magnification, u: u, v: v };
  }

  function morphPoint(type, flat, u, v, projected, progress, frame) {
    var amount = seamProgress(type, u, v, progress);
    var mapped = {
      x: flat.x + (projected.x - flat.x) * amount,
      y: flat.y + (projected.y - flat.y) * amount,
      depth: projected.depth * amount,
      scale: 1 + ((projected.scale || 1) - 1) * amount,
      depthScale: projected.depthScale,
      u: u, v: v
    };
    if (progress <= 0 || progress >= 1 || type === "plane") { return mapped; }
    if (type === "sphere") {
      var sphereMapped = sphereMorphPoint(flat, u, v, projected, progress, frame);
      if (sphereMapped) { return sphereMapped; }
    }
    if (type === "torus" || type === "cylinder" || type === "mobius") {
      var rolled = rolledMorphPoint(type, flat, u, v, projected, progress, frame);
      if (rolled) { return rolled; }
    }
    if (amount === 1) { return mapped; }
    var width = frame && frame.width, height = frame && frame.height;
    var span = width && height ? Math.min(width, height) : (projected.depthScale || 120) * 3.5;
    var pull = smooth(clamp01(progress) / 0.1);
    var outX = (u * 2 - 1) * span * 0.035;
    var outY = (v * 2 - 1) * span * 0.035;
    var dx = projected.x - flat.x, dy = projected.y - flat.y;
    var length = Math.sqrt(dx * dx + dy * dy + span * span * 0.04);
    var arcX = -dy / length * span * 0.11;
    var arcY = dx / length * span * 0.11;
    var startX = flat.x + outX * pull, startY = flat.y + outY * pull;
    var control1X = startX + (projected.x - startX) / 3 + outX * 0.6 + arcX * 0.35;
    var control1Y = startY + (projected.y - startY) / 3 + outY * 0.6 + arcY * 0.35;
    var control2X = startX + (projected.x - startX) * 2 / 3 + arcX;
    var control2Y = startY + (projected.y - startY) * 2 / 3 + arcY;
    // Control points stay in the frame; their convex hull also contains the
    // entire curved route. Keep a flat endpoint already near the edge intact.
    if (width && height) {
      var padding = span * 0.025;
      var left = Math.min(padding, flat.x, projected.x), right = Math.max(width - padding, flat.x, projected.x);
      var top = Math.min(padding, flat.y, projected.y), bottom = Math.max(height - padding, flat.y, projected.y);
      startX = Math.max(left, Math.min(right, startX)); startY = Math.max(top, Math.min(bottom, startY));
      control1X = Math.max(left, Math.min(right, control1X)); control1Y = Math.max(top, Math.min(bottom, control1Y));
      control2X = Math.max(left, Math.min(right, control2X)); control2Y = Math.max(top, Math.min(bottom, control2Y));
    }
    var remain = 1 - amount, first = 3 * remain * remain * amount, second = 3 * remain * amount * amount;
    mapped.x = remain * remain * remain * startX + first * control1X + second * control2X + amount * amount * amount * projected.x;
    mapped.y = remain * remain * remain * startY + first * control1Y + second * control2Y + amount * amount * amount * projected.y;
    mapped.depth += 3 * remain * amount * 0.28;
    return mapped;
  }

  function createSurfaceMesh(vertices, options) {
    var rows = vertices.length - 1, columns = vertices[0].length - 1;
    var fans = Object.create(null), fanEdges = [];
    function faceKey(row, column, half) { return (row * columns + column) * 2 + half; }
    // At six sphere-chart corner triangles every original vertex lies on
    // the equator. Sample the interior too, so opposite hemispheres cannot
    // collapse onto the same flat triangle when their boundary closes.
    if (options && options.topology === "sphere" && typeof options.pointAt === "function") {
      [[0, 0, 0], [0, 0, 1], [0, columns - 1, 0],
        [rows - 1, 0, 1], [rows - 1, columns - 1, 0], [rows - 1, columns - 1, 1]].forEach(function addFan(cell) {
        var row = cell[0], column = cell[1], half = cell[2], key = faceKey(row, column, half);
        if (fans[key]) { return; }
        var corners = half ? [vertices[row][column], vertices[row + 1][column + 1], vertices[row + 1][column]]
          : [vertices[row][column], vertices[row][column + 1], vertices[row + 1][column + 1]];
        var u = (column + (half ? 1 : 2) / 3) / columns;
        var v = (row + (half ? 2 : 1) / 3) / rows;
        var center = options.pointAt(u, v);
        center.u = u; center.v = v;
        fans[key] = { corners: corners, center: center };
        corners.forEach(function edge(corner) { fanEdges.push([center, corner]); });
      });
    }
    function point(u, v) {
      u = clamp01(u); v = clamp01(v);
      var column = Math.min(columns - 1, Math.floor(u * columns));
      var row = Math.min(rows - 1, Math.floor(v * rows));
      var x = u * columns - column, y = v * rows - row;
      var a = vertices[row][column], b, c, wa, wb, wc;
      // Every quad uses the same top-left to bottom-right diagonal as the
      // painted surface and its depth index.
      if (y <= x) {
        b = vertices[row][column + 1]; c = vertices[row + 1][column + 1];
        wa = 1 - x; wb = x - y; wc = y;
      } else {
        b = vertices[row + 1][column + 1]; c = vertices[row + 1][column];
        wa = 1 - y; wb = x; wc = y - x;
      }
      var mapped = { x: a.x * wa + b.x * wb + c.x * wc,
        y: a.y * wa + b.y * wb + c.y * wc,
        depth: a.depth * wa + b.depth * wb + c.depth * wc, u: u, v: v };
      if (Number.isFinite(a.scale) && Number.isFinite(b.scale) && Number.isFinite(c.scale)) {
        mapped.scale = a.scale * wa + b.scale * wb + c.scale * wc;
      }
      if (Number.isFinite(a.depthScale) && Number.isFinite(b.depthScale) && Number.isFinite(c.depthScale)) {
        mapped.depthScale = a.depthScale * wa + b.depthScale * wb + c.depthScale * wc;
      }
      var fan = fans[faceKey(row, column, y <= x ? 0 : 1)];
      if (fan) {
        // The smallest original barycentric weight selects a fan sector.
        // This correction is exactly its piecewise-linear interpolation.
        var weight = Math.max(0, Math.min(wa, wb, wc));
        ["x", "y", "depth", "scale", "depthScale"].forEach(function refine(key) {
          if (Number.isFinite(mapped[key]) && Number.isFinite(fan.center[key])) {
            mapped[key] += weight * (3 * fan.center[key] - a[key] - b[key] - c[key]);
          }
        });
      }
      return mapped;
    }
    function path(from, to) {
      var fromU = clamp01(from.u), fromV = clamp01(from.v);
      var du = clamp01(to.u) - fromU, dv = clamp01(to.v) - fromV;
      if (Math.abs(du) + Math.abs(dv) < 1e-12) { return [point(fromU, fromV)]; }
      var stops = [0, 1];
      function crossIntegers(start, change) {
        if (Math.abs(change) < 1e-12) { return; }
        var low = Math.min(start, start + change), high = Math.max(start, start + change);
        for (var boundary = Math.ceil(low); boundary <= Math.floor(high); boundary += 1) {
          var amount = (boundary - start) / change;
          if (amount > 1e-10 && amount < 1 - 1e-10) { stops.push(amount); }
        }
      }
      crossIntegers(fromU * columns, du * columns);
      crossIntegers(fromV * rows, dv * rows);
      // Within a cell its diagonal is localX=localY, equivalently
      // columns*u-rows*v is an integer. These crossings matter even when
      // both ends remain inside the same quad.
      crossIntegers(fromU * columns - fromV * rows, du * columns - dv * rows);
      fanEdges.forEach(function crossFan(edge) {
        var a = edge[0], b = edge[1], eu = b.u - a.u, ev = b.v - a.v;
        var denominator = du * ev - dv * eu;
        if (Math.abs(denominator) < 1e-14) { return; }
        var au = a.u - fromU, av = a.v - fromV;
        var along = (au * ev - av * eu) / denominator;
        var across = (au * dv - av * du) / denominator;
        if (along > 1e-10 && along < 1 - 1e-10 && across >= -1e-10 && across <= 1 + 1e-10) { stops.push(along); }
      });
      stops.sort(function alongPath(a, b) { return a - b; });
      var points = [], previous = -1;
      for (var index = 0; index < stops.length; index += 1) {
        var amount = stops[index];
        if (amount - previous < 1e-10) { continue; }
        points.push(point(fromU + du * amount, fromV + dv * amount));
        previous = amount;
      }
      return points;
    }
    function refinePatches(patches) {
      if (!fanEdges.length) { return patches; }
      var refined = [];
      patches.forEach(function refine(patch) {
        var points = patch.points;
        var row = Math.min(rows - 1, Math.floor(points[0].v * rows + 1e-8));
        var column = Math.min(columns - 1, Math.floor(points[0].u * columns + 1e-8));
        if (!fans[faceKey(row, column, 0)] && !fans[faceKey(row, column, 1)]) { refined.push(patch); return; }
        var faces = points.length === 4 ? [[points[0], points[1], points[2]], [points[0], points[2], points[3]]] : [points];
        faces.forEach(function refineFace(face) {
          var half = face[1] === vertices[row + 1][column + 1] ? 1 : 0;
          var fan = fans[faceKey(row, column, half)];
          function add(triangle) { refined.push({ points: triangle, depth: (triangle[0].depth + triangle[1].depth + triangle[2].depth) / 3 }); }
          if (!fan) { add(face); return; }
          for (var index = 0; index < 3; index += 1) { add([face[index], face[(index + 1) % 3], fan.center]); }
        });
      });
      return refined;
    }
    return { point: point, path: path, refinePatches: refinePatches, columns: columns, rows: rows };
  }

  // A DOM-free spatial index shared by H5 and Canvas hosts. Query the exact
  // projected triangles: filtering sampled depths across a silhouette mixes
  // unrelated sheets and makes grazing lines shimmer as the board rotates.
  function createDepthBuffer(width, height, patches) {
    var binSize = 24;
    var columns = Math.max(1, Math.ceil(width / binSize));
    var rows = Math.max(1, Math.ceil(height / binSize));
    var bins = new Array(columns * rows);
    var query = 0;
    var edgeTolerance = 1e-7;
    function triangle(a, b, c) {
      var area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (!Number.isFinite(area) || Math.abs(area) < 1e-10) { return; }
      if (area < 0) { var swap = b; b = c; c = swap; area = -area; }
      var dzdx = ((b.depth - a.depth) * (c.y - a.y) - (c.depth - a.depth) * (b.y - a.y)) / area;
      var dzdy = ((b.x - a.x) * (c.depth - a.depth) - (c.x - a.x) * (b.depth - a.depth)) / area;
      var facet = { a: a, b: b, c: c, dzdx: dzdx, dzdy: dzdy,
        offset: a.depth - dzdx * a.x - dzdy * a.y,
        minDepth: Math.min(a.depth, b.depth, c.depth), maxDepth: Math.max(a.depth, b.depth, c.depth),
        minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y), query: 0 };
      facet.vertices = [a, b, c];
      var left = Math.max(0, Math.floor((facet.minX - edgeTolerance) / binSize));
      var right = Math.min(columns - 1, Math.floor((facet.maxX + edgeTolerance) / binSize));
      var top = Math.max(0, Math.floor((facet.minY - edgeTolerance) / binSize));
      var bottom = Math.min(rows - 1, Math.floor((facet.maxY + edgeTolerance) / binSize));
      for (var y = top; y <= bottom; y += 1) {
        for (var x = left; x <= right; x += 1) {
          var index = y * columns + x;
          if (!bins[index]) { bins[index] = []; }
          bins[index].push(facet);
        }
      }
    }
    patches.forEach(function indexPatch(patch) {
      for (var index = 1; index < patch.points.length - 1; index += 1) {
        triangle(patch.points[0], patch.points[index], patch.points[index + 1]);
      }
    });
    // Candidates retain their original vertex objects (and any UV metadata).
    // A rectangle may touch several bins; each facet is returned only once.
    function trianglesInRect(left, top, right, bottom) {
      if (right < 0 || bottom < 0 || left > width || top > height || right < left || bottom < top) { return []; }
      var firstX = Math.max(0, Math.floor(left / binSize));
      var lastX = Math.min(columns - 1, Math.floor(right / binSize));
      var firstY = Math.max(0, Math.floor(top / binSize));
      var lastY = Math.min(rows - 1, Math.floor(bottom / binSize));
      var result = [];
      query += 1;
      for (var y = firstY; y <= lastY; y += 1) {
        for (var x = firstX; x <= lastX; x += 1) {
          var bin = bins[y * columns + x];
          if (!bin) { continue; }
          for (var index = 0; index < bin.length; index += 1) {
            var facet = bin[index];
            if (facet.query === query) { continue; }
            facet.query = query;
            if (facet.maxX + edgeTolerance >= left && facet.minX - edgeTolerance <= right &&
                facet.maxY + edgeTolerance >= top && facet.minY - edgeTolerance <= bottom) { result.push(facet); }
          }
        }
      }
      return result;
    }
    function insideEdge(a, b, x, y) {
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >=
        -edgeTolerance * Math.hypot(b.x - a.x, b.y - a.y);
    }
    function depthAt(x, y) {
      var candidates = trianglesInRect(x, y, x, y);
      var depth = -Infinity;
      for (var index = 0; index < candidates.length; index += 1) {
        var facet = candidates[index];
        if (insideEdge(facet.a, facet.b, x, y) && insideEdge(facet.b, facet.c, x, y) && insideEdge(facet.c, facet.a, x, y)) {
          depth = Math.max(depth, facet.dzdx * x + facet.dzdy * y + facet.offset);
        }
      }
      return depth;
    }
    function visible(point, bias) {
      return point.depth + (bias === undefined ? 0.035 : bias) >= depthAt(point.x, point.y);
    }
    function surfaceIntersections() {
      if (buffer.intersections) { return buffer.intersections; }
      // These completed embeddings have no self-crossings. Their polar chart
      // singularities can produce subpixel tessellation overlaps, not cuts.
      if (buffer.morph === 0 || (buffer.morph === 1 && buffer.topology !== "projective" && buffer.topology !== "klein" && buffer.topology)) {
        buffer.intersections = []; return buffer.intersections;
      }
      var result = [], unique = new Set();
      bins.forEach(function intersectBin(bin, binIndex) {
        if (!bin) { return; }
        var ordered = bin.slice().sort(function depthOrder(a, b) { return a.minDepth - b.minDepth; });
        for (var firstIndex = 0; firstIndex < ordered.length; firstIndex += 1) {
          var first = ordered[firstIndex];
          for (var secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
            var second = ordered[secondIndex];
            if (second.minDepth > first.maxDepth + 1e-8) { break; }
            var ax = first.dzdx - second.dzdx, ay = first.dzdy - second.dzdy, az = first.offset - second.offset;
            var left = Math.max(first.minX, second.minX), right = Math.min(first.maxX, second.maxX);
            var top = Math.max(first.minY, second.minY), bottom = Math.min(first.maxY, second.maxY);
            if (right < left - edgeTolerance || bottom < top - edgeTolerance) { continue; }
            // An overlap belongs to its first screen bin. This makes the sweep
            // independent of how many bins contain a large or grazing facet.
            var owner = Math.max(0, Math.floor(top / binSize)) * columns + Math.max(0, Math.floor(left / binSize));
            if (owner !== binIndex) { continue; }
            var low = ax * (ax > 0 ? left : right) + ay * (ay > 0 ? top : bottom) + az;
            var high = ax * (ax > 0 ? right : left) + ay * (ay > 0 ? bottom : top) + az;
            if (low > 1e-8 || high < -1e-8 || Math.abs(ax) + Math.abs(ay) < 1e-10) { continue; }
            var shared = 0, a = first.vertices, b = second.vertices;
            for (var i = 0; i < 3 && shared < 2; i += 1) {
              for (var j = 0; j < 3; j += 1) { if (chartNeighbors(a[i], b[j], buffer.topology)) { shared += 1; break; } }
            }
            if (shared >= 2) { continue; }
            var segment = facetIntersection(first, second);
            if (!segment) { continue; }
            var keys = segment.map(function key(p) { return Math.round(p.x * 1e6) + ":" + Math.round(p.y * 1e6) + ":" + Math.round(p.depth * 1e7); }).sort();
            var key = keys.join("/");
            if (!unique.has(key)) { unique.add(key); result.push(segment); }
          }
        }
      });
      buffer.intersections = joinIntersectionSegments(result);
      return buffer.intersections;
    }
    function occludedInterval(from, to, facet, bias) {
      var start = 0, end = 1;
      function clip(value, change) {
        if (Math.abs(change) < 1e-12) { return value >= 0; }
        var crossing = -value / change;
        if (change > 0) { start = Math.max(start, crossing); } else { end = Math.min(end, crossing); }
        return end > start;
      }
      var dx = to.x - from.x, dy = to.y - from.y;
      var vertices = [facet.a, facet.b, facet.c];
      for (var index = 0; index < 3; index += 1) {
        var a = vertices[index], b = vertices[(index + 1) % 3];
        var ex = b.x - a.x, ey = b.y - a.y;
        if (!clip(ex * (from.y - a.y) - ey * (from.x - a.x) + edgeTolerance * Math.hypot(ex, ey), ex * dy - ey * dx)) { return null; }
      }
      // On a straight screen segment both depths are affine, so the crossing
      // is exact. A small depth offset gives the grid priority on its sheet.
      var gap = facet.dzdx * from.x + facet.dzdy * from.y + facet.offset - from.depth - bias;
      if (!clip(gap, facet.dzdx * dx + facet.dzdy * dy - (to.depth - from.depth))) { return null; }
      return end > start ? [start, end] : null;
    }
    function strokePath(ctx, points, paintStroke) {
      if (points.length < 2) { return; }
      if (buffer.mesh && points.every(function hasUV(p) { return Number.isFinite(p.u) && Number.isFinite(p.v); })) {
        var mapped = [buffer.mesh.point(points[0].u, points[0].v)];
        for (var route = 1; route < points.length; route += 1) {
          var start = points[route - 1], finish = points[route];
          // A discontinuous chart jump is the explicit bridge between glued
          // edges. Preserve that bridge instead of tracing across the chart.
          if (Math.abs(start.u - finish.u) > 0.25 || Math.abs(start.v - finish.v) > 0.25) {
            mapped.push(buffer.mesh.point(finish.u, finish.v));
          } else {
            mapped.push.apply(mapped, buffer.mesh.path(start, finish).slice(1));
          }
        }
        points = mapped;
      }
      if (buffer.translucency) {
        ctx.save();
        ctx.globalAlpha *= buffer.translucency;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var back = 1; back < points.length; back += 1) { ctx.lineTo(points[back].x, points[back].y); }
        if (paintStroke) { paintStroke(ctx); } else { ctx.stroke(); }
        ctx.restore();
      }
      ctx.beginPath();
      var lastX = NaN, lastY = NaN;
      for (var index = 1; index < points.length; index += 1) {
        var from = points[index - 1], to = points[index];
        var dx = to.x - from.x, dy = to.y - from.y;
        var candidates = trianglesInRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.max(from.x, to.x), Math.max(from.y, to.y));
        var hidden = [];
        for (var candidate = 0; candidate < candidates.length; candidate += 1) {
          var interval = occludedInterval(from, to, candidates[candidate], 0.045);
          if (interval) { hidden.push(interval); }
        }
        hidden.sort(function firstInterval(a, b) { return a[0] - b[0]; });
        var cursor = 0;
        function drawInterval(start, end) {
          if (end - start < 1e-10) { return; }
          var x = from.x + dx * start, y = from.y + dy * start;
          if (Math.abs(x - lastX) > edgeTolerance || Math.abs(y - lastY) > edgeTolerance || !Number.isFinite(lastX)) { ctx.moveTo(x, y); }
          lastX = from.x + dx * end; lastY = from.y + dy * end;
          ctx.lineTo(lastX, lastY);
        }
        for (var part = 0; part < hidden.length && cursor < 1; part += 1) {
          if (hidden[part][0] > cursor) { drawInterval(cursor, hidden[part][0]); }
          cursor = Math.max(cursor, hidden[part][1]);
        }
        if (cursor < 1) { drawInterval(cursor, 1); }
      }
      if (paintStroke) { paintStroke(ctx); } else { ctx.stroke(); }
    }
    var buffer = { visible: visible, depthAt: depthAt, trianglesInRect: trianglesInRect, surfaceIntersections: surfaceIntersections,
      strokePath: strokePath, translucency: 0 };
    return buffer;
  }

  function chartNeighbors(a, b, type) {
    if (a === b) { return true; }
    if (!Number.isFinite(a.u) || !Number.isFinite(b.u)) { return false; }
    var epsilon = 1e-8;
    if (Math.abs(a.u - b.u) < epsilon && Math.abs(a.v - b.v) < epsilon) { return true; }
    // A quotient edge is a neighbor only once those two displayed points
    // coincide. During unfolding the separated sheets can genuinely cross.
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-5 || Math.abs(a.depth - b.depth) > epsilon) { return false; }
    if (type === "sphere") {
      return (a.u < epsilon && b.v < epsilon && Math.abs(a.v - b.u) < epsilon) ||
        (b.u < epsilon && a.v < epsilon && Math.abs(b.v - a.u) < epsilon) ||
        (a.u > 1 - epsilon && b.v > 1 - epsilon && Math.abs(a.v - b.u) < epsilon) ||
        (b.u > 1 - epsilon && a.v > 1 - epsilon && Math.abs(b.v - a.u) < epsilon);
    }
    if (Math.abs(a.u - b.u) > 1 - epsilon && isPeriodicX(type)) {
      if (Math.abs(a.v - (hasXTwist(type) ? 1 - b.v : b.v)) < epsilon) { return true; }
    }
    if (Math.abs(a.v - b.v) > 1 - epsilon && isPeriodicY(type)) {
      if (Math.abs(a.u - (hasYTwist(type) ? 1 - b.u : b.u)) < epsilon) { return true; }
    }
    return false;
  }

  // Two rendered facets meet where their affine depths agree. Clipping that
  // line to both triangles finds actual crossings, not projected overlaps.
  function facetIntersection(first, second) {
    var dx = first.dzdx - second.dzdx, dy = first.dzdy - second.dzdy, offset = first.offset - second.offset;
    var norm = Math.hypot(dx, dy);
    if (norm < 1e-10) { return null; }
    dx /= norm; dy /= norm; offset /= norm;
    var directionX = -dy, directionY = dx, originX = -offset * dx, originY = -offset * dy;
    var low = -Infinity, high = Infinity;
    var vertices = [[first.a, first.b, first.c], [second.a, second.b, second.c]];
    for (var polygon = 0; polygon < 2; polygon += 1) {
      for (var edge = 0; edge < 3; edge += 1) {
        var a = vertices[polygon][edge], b = vertices[polygon][(edge + 1) % 3];
        var ex = b.x - a.x, ey = b.y - a.y;
        var value = ex * (originY - a.y) - ey * (originX - a.x);
        var change = ex * directionY - ey * directionX;
        if (Math.abs(change) < 1e-10) { if (value < -1e-7) { return null; } }
        else if (change > 0) { low = Math.max(low, -value / change); }
        else { high = Math.min(high, -value / change); }
        if (high - low < 1e-5) { return null; }
      }
    }
    return [low, high].map(function point(amount) {
      var x = originX + directionX * amount, y = originY + directionY * amount;
      return { x: x, y: y, depth: first.dzdx * x + first.dzdy * y + first.offset };
    });
  }

  function joinIntersectionSegments(segments) {
    var points = [], nodes = new Map(), edges = [];
    function vertex(point) {
      var x = Math.round(point.x * 1e4), y = Math.round(point.y * 1e4), key = x + ":" + y;
      var index = nodes.get(key);
      if (index !== undefined && Math.abs(points[index].point.depth - point.depth) < 1e-5) { return index; }
      for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
          var nearby = nodes.get((x + dx) + ":" + (y + dy));
          if (nearby === undefined) { continue; }
          var p = points[nearby].point;
          if (Math.abs(p.x - point.x) < 1e-4 && Math.abs(p.y - point.y) < 1e-4 && Math.abs(p.depth - point.depth) < 1e-5) { return nearby; }
        }
      }
      index = points.length; nodes.set(key, index); points.push({ point: point, edges: [] });
      return index;
    }
    segments.forEach(function append(segment) {
      var a = vertex(segment[0]), b = vertex(segment[1]);
      if (a === b) { return; }
      var edge = { a: a, b: b, used: false };
      edges.push(edge); points[a].edges.push(edge); points[b].edges.push(edge);
    });
    var paths = [];
    function trace(first, edge) {
      var path = [points[first].point], current = first;
      while (edge && !edge.used) {
        edge.used = true; current = edge.a === current ? edge.b : edge.a;
        path.push(points[current].point);
        if (points[current].edges.length !== 2) { break; }
        edge = points[current].edges.find(function unused(candidate) { return !candidate.used; });
      }
      if (path.length > 1) { paths.push(path); }
    }
    points.forEach(function ends(node, index) {
      if (node.edges.length !== 2) { node.edges.forEach(function edge(candidate) { if (!candidate.used) { trace(index, candidate); } }); }
    });
    edges.forEach(function loops(edge) { if (!edge.used) { trace(edge.a, edge); } });
    return paths;
  }

  function strokeIntersectionLight(ctx, stoneContact) {
    // A broad white glow and brighter core distinguish the cut from the grey
    // grid. Canvas blurs in device pixels; preserve the visual radius.
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    var matrix = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    var scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    if (stoneContact) {
      ctx.strokeStyle = "rgba(255, 255, 249, 0.82)";
      ctx.lineWidth = 1.15;
      ctx.shadowColor = "rgba(255, 255, 245, 0.65)";
      ctx.shadowBlur = 5 * scale;
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = "rgba(255, 255, 249, 0.22)";
    ctx.lineWidth = 3.8;
    ctx.shadowColor = "rgba(255, 255, 245, 0.95)";
    ctx.shadowBlur = 14 * scale;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 249, 0.96)";
    ctx.lineWidth = 1.7;
    ctx.shadowBlur = 7 * scale;
    ctx.stroke();
  }

  function drawSurfaceIntersections(ctx, depth) {
    if (!depth || depth.morph === 0) { return; }
    var paths = depth.surfaceIntersections();
    if (!paths.length) { return; }
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    paths.forEach(function stroke(path) { depth.strokePath(ctx, softenIntersectionPath(path), strokeIntersectionLight); });
    ctx.restore();
  }

  function softenIntersectionPath(points) {
    if (points.length < 3) { return points; }
    // Keep geometric queries exact. For the subpixel stroke only, soften the
    // alternating diagonal facets without moving a cut more than half a pixel.
    var current = points;
    for (var pass = 0; pass < 2; pass += 1) {
      current = current.map(function soften(point, index, path) {
        if (!index || index === path.length - 1) { return point; }
        var before = path[index - 1], after = path[index + 1];
        var left = Math.hypot(point.x - before.x, point.y - before.y), right = Math.hypot(after.x - point.x, after.y - point.y);
        if (left + right < 1e-7) { return point; }
        var amount = left / (left + right);
        var x = point.x * 0.5 + (before.x + (after.x - before.x) * amount) * 0.5;
        var y = point.y * 0.5 + (before.y + (after.y - before.y) * amount) * 0.5;
        var depth = point.depth * 0.5 + (before.depth + (after.depth - before.depth) * amount) * 0.5;
        var original = points[index], drift = Math.hypot(x - original.x, y - original.y);
        var weight = drift > 0.5 ? 0.5 / drift : 1;
        return { x: original.x + (x - original.x) * weight, y: original.y + (y - original.y) * weight,
          depth: original.depth + (depth - original.depth) * weight };
      });
    }
    return current;
  }

  // Clip convex polygons in screen space. Keeping the edges as vectors lets
  // Canvas antialias one continuous silhouette, independent of pixel buckets.
  function clipPolygon(points, distance) {
    if (!points.length) { return points; }
    var positive = false, negative = false;
    for (var check = 0; check < points.length; check += 1) {
      if (distance(points[check]) >= 0) { positive = true; } else { negative = true; }
      if (positive && negative) { break; }
    }
    if (!negative) { return points; }
    if (!positive) { return []; }
    var result = [];
    var previous = points[points.length - 1], before = distance(previous);
    points.forEach(function clipEdge(current) {
      var after = distance(current);
      if ((before >= 0) !== (after >= 0)) {
        var amount = before / (before - after);
        result.push({ x: previous.x + (current.x - previous.x) * amount, y: previous.y + (current.y - previous.y) * amount });
      }
      if (after >= 0) { result.push(current); }
      previous = current; before = after;
    });
    var area = 0;
    for (var i = 0; i < result.length; i += 1) {
      var next = result[(i + 1) % result.length];
      area += (result[i].x - result[0].x) * (next.y - result[0].y) - (result[i].y - result[0].y) * (next.x - result[0].x);
    }
    if (Math.abs(area) <= 1e-7) { return []; }
    return result.length === points.length && result.every(function unchanged(p, i) { return p === points[i]; }) ? points : result;
  }

  function stoneCapPlanes(point, radius) {
    // A shallow rounded cap has depth of its own. The tangent envelope avoids
    // treating the whole face as a single centre-depth switch or a flat decal.
    var relief = radius / Math.max(1, point.depthScale || 150);
    var planes = [{ x: 0, y: 0, z: point.depth + 0.025 + relief }];
    [0.2, 0.5, 0.8, 0.96].forEach(function capRing(ring) {
      var height = Math.sqrt(1 - ring * ring);
      for (var face = 0; face < 16; face += 1) {
        var angle = face * TAU / 16;
        var dx = -Math.cos(angle) * relief * ring / (height * radius);
        var dy = -Math.sin(angle) * relief * ring / (height * radius);
        planes.push({ x: dx, y: dy, z: point.depth + 0.025 + relief / height - dx * point.x - dy * point.y });
      }
    });
    return planes;
  }

  function stoneContours(depth, point, radius) {
    var extent = radius + 1;
    var left = point.x - extent, right = point.x + extent;
    var top = point.y - extent, bottom = point.y + extent;
    var whole = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    var pieces = [whole], changed = false;
    var planes = stoneCapPlanes(point, radius);
    var candidates = depth.trianglesInRect(left, top, right, bottom);
    candidates.sort(function nearestFirst(a, b) { return b.offset + b.dzdx * point.x + b.dzdy * point.y - a.offset - a.dzdx * point.x - a.dzdy * point.y; });
    candidates.forEach(function cutSurface(triangle) {
      if (!pieces.length) { return; }
      var bx = triangle.dzdx >= 0 ? Math.min(right, triangle.maxX) : Math.max(left, triangle.minX);
      var by = triangle.dzdy >= 0 ? Math.min(bottom, triangle.maxY) : Math.max(top, triangle.minY);
      if (triangle.dzdx * bx + triangle.dzdy * by + triangle.offset <= point.depth + 0.025) { return; }
      var trianglePoints = clipPolygon([triangle.a, triangle.b, triangle.c], function aboveFoot(p) {
        return triangle.dzdx * p.x + triangle.dzdy * p.y + triangle.offset - point.depth - 0.025;
      });
      if (trianglePoints.length < 3) { return; }
      var activePlanes = [], fullyCovered = false, classified = false;
      var occluder = trianglePoints;
      var minX = Math.max(left, triangle.minX), maxX = Math.min(right, triangle.maxX);
      var minY = Math.max(top, triangle.minY), maxY = Math.min(bottom, triangle.maxY);
      var next = [];
      pieces.forEach(function subtract(piece) {
        if (classified && !fullyCovered && !activePlanes.length) { next.push(piece); return; }
        if (piece.every(function outside(p) { return p.x <= minX; }) || piece.every(function outside(p) { return p.x >= maxX; }) ||
            piece.every(function outside(p) { return p.y <= minY; }) || piece.every(function outside(p) { return p.y >= maxY; })) { next.push(piece); return; }
        var inside = piece, fragments = [];
        for (var i = 0; i < occluder.length && inside.length; i += 1) {
          var a = occluder[i], b = occluder[(i + 1) % occluder.length];
          var distance = function signed(p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); };
          var outside = clipPolygon(inside, function inverse(p) { return -distance(p); });
          if (outside.length >= 3) { fragments.push(outside); }
          inside = clipPolygon(inside, distance);
        }
        if (!inside.length) { next.push(piece); return; }
        // Classify only after a visible stone fragment actually intersects
        // this triangle. An affine depth difference needs only vertex signs;
        // a wholly non-cutting cap plane can then be skipped for every piece.
        if (!classified) {
          for (var capIndex = 0; capIndex < planes.length; capIndex += 1) {
            var cap = planes[capIndex], ax = cap.x - triangle.dzdx, ay = cap.y - triangle.dzdy, offset = cap.z - triangle.offset;
            var negative = false, positive = false;
            for (var vertex = 0; vertex < trianglePoints.length && !(negative && positive); vertex += 1) {
              var corner = trianglePoints[vertex], gap = ax * corner.x + ay * corner.y + offset;
              if (gap < 0) { negative = true; } else { positive = true; }
            }
            if (!negative) { continue; }
            if (!positive) { fullyCovered = true; break; }
            activePlanes.push(cap);
          }
          classified = true;
        }
        var shown = fullyCovered ? [] : inside;
        for (var planeIndex = 0; planeIndex < activePlanes.length && shown.length; planeIndex += 1) {
          var plane = activePlanes[planeIndex];
          shown = clipPolygon(shown, function inFront(p) {
            return (plane.x - triangle.dzdx) * p.x + (plane.y - triangle.dzdy) * p.y + plane.z - triangle.offset;
          });
        }
        if (shown === inside) { next.push(piece); return; }
        changed = true;
        next.push.apply(next, fragments);
        if (shown.length) { next.push(shown); }
      });
      pieces = next;
    });
    return changed ? pieces : null;
  }

  function stoneOutline(contours) {
    if (!contours || contours.length < 2) { return contours; }
    var epsilon = 1e-6, bucketSize = 8;
    var vertices = [], nearby = new Map(), buckets = new Map(), polygons = [];
    function vertexId(point) {
      var x = Math.round(point.x / epsilon), y = Math.round(point.y / epsilon);
      var key = x + ":" + y, exact = nearby.get(key);
      if (exact !== undefined) { return exact; }
      for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) { continue; }
          var found = nearby.get((x + dx) + ":" + (y + dy));
          if (found !== undefined && Math.abs(vertices[found].x - point.x) <= epsilon && Math.abs(vertices[found].y - point.y) <= epsilon) { return found; }
        }
      }
      var id = vertices.length;
      vertices.push(point);
      nearby.set(key, id);
      var bucketKey = Math.floor(point.x / bucketSize) + ":" + Math.floor(point.y / bucketSize);
      var bucket = buckets.get(bucketKey);
      if (!bucket) { bucket = []; buckets.set(bucketKey, bucket); }
      bucket.push(id);
      return id;
    }
    contours.forEach(function weldContour(contour) {
      var polygon = [];
      contour.forEach(function weldPoint(point) {
        var id = vertexId(point);
        if (!polygon.length || polygon[polygon.length - 1] !== id) { polygon.push(id); }
      });
      if (polygon.length && polygon[0] === polygon[polygon.length - 1]) { polygon.pop(); }
      if (polygon.length >= 3) { polygons.push(polygon); }
    });
    var edges = new Map();
    function addEdge(from, to) {
      if (from === to) { return; }
      var low = Math.min(from, to), high = Math.max(from, to), key = low + ":" + high;
      var edge = edges.get(key);
      if (!edge) { edge = { low: low, high: high, count: 0 }; edges.set(key, edge); }
      edge.count += from === low ? 1 : -1;
    }
    polygons.forEach(function splitContour(polygon) {
      for (var i = 0; i < polygon.length; i += 1) {
        var from = polygon[i], to = polygon[(i + 1) % polygon.length];
        var a = vertices[from], b = vertices[to], dx = b.x - a.x, dy = b.y - a.y;
        var lengthSquared = dx * dx + dy * dy;
        if (lengthSquared <= epsilon * epsilon) { continue; }
        var tolerance = epsilon * Math.sqrt(lengthSquared);
        var cuts = [{ id: from, amount: 0 }, { id: to, amount: 1 }];
        var left = Math.floor((Math.min(a.x, b.x) - epsilon) / bucketSize);
        var right = Math.floor((Math.max(a.x, b.x) + epsilon) / bucketSize);
        var top = Math.floor((Math.min(a.y, b.y) - epsilon) / bucketSize);
        var bottom = Math.floor((Math.max(a.y, b.y) + epsilon) / bucketSize);
        // Clipping creates T junctions: one fragment can retain a long edge
        // while its neighbor splits it. Split both before canceling seams.
        for (var row = top; row <= bottom; row += 1) {
          for (var column = left; column <= right; column += 1) {
            var candidates = buckets.get(column + ":" + row);
            if (!candidates) { continue; }
            for (var j = 0; j < candidates.length; j += 1) {
              var id = candidates[j];
              if (id === from || id === to) { continue; }
              var point = vertices[id], px = point.x - a.x, py = point.y - a.y;
              if (Math.abs(dx * py - dy * px) > tolerance) { continue; }
              var amount = (dx * px + dy * py) / lengthSquared;
              if (amount > 0 && amount < 1) { cuts.push({ id: id, amount: amount }); }
            }
          }
        }
        cuts.sort(function alongEdge(first, second) { return first.amount - second.amount; });
        for (var cut = 1; cut < cuts.length; cut += 1) { addEdge(cuts[cut - 1].id, cuts[cut].id); }
      }
    });
    var outgoing = vertices.map(function emptyEdges() { return []; });
    edges.forEach(function retainBoundary(edge) {
      if (!edge.count) { return; }
      var from = edge.count > 0 ? edge.low : edge.high, to = edge.count > 0 ? edge.high : edge.low;
      outgoing[from].push({ to: to, count: Math.abs(edge.count) });
    });
    var result = [];
    for (var first = 0; first < outgoing.length; first += 1) {
      while (outgoing[first].length) {
        var current = first, contour = [];
        do {
          contour.push(vertices[current]);
          var choices = outgoing[current], next = choices[choices.length - 1];
          if (!next) { return contours; }
          next.count -= 1;
          if (!next.count) { choices.pop(); }
          current = next.to;
        } while (current !== first);
        if (contour.length >= 3) { result.push(contour); }
      }
    }
    return result;
  }

  function stoneIntersectionContours(depth, point, radius, outline) {
    if (!depth) { return []; }
    if (outline === undefined) { outline = stoneOutline(stoneContours(depth, point, radius)); }
    if (!outline || !outline.length) { return []; }
    var planes = stoneCapPlanes(point, radius), segments = [], depths = new Map();
    var candidates = depth.trianglesInRect(point.x - radius, point.y - radius, point.x + radius, point.y + radius);
    function capDepth(p) {
      var value = Infinity;
      for (var index = 0; index < planes.length; index += 1) {
        var plane = planes[index]; value = Math.min(value, plane.x * p.x + plane.y * p.y + plane.z);
      }
      return value;
    }
    function cachedCapDepth(p) {
      var known = depths.get(p);
      if (known !== undefined) { return known; }
      known = capDepth(p);
      depths.set(p, known); return known;
    }
    function surfaceContact(from, to, middle, fromDepth, toDepth) {
      var middleDepth = capDepth(middle);
      if (Math.abs(middleDepth - (fromDepth + toDepth) / 2) > 1e-5) { return false; }
      // A visible-outline edge already survived every foreground occluder.
      // Match its affine cut to one local facet, instead of querying the whole
      // depth field three times for every small fragment of every stone.
      for (var index = 0; index < candidates.length; index += 1) {
        var facet = candidates[index];
        if (middle.x < facet.minX - 1e-6 || middle.x > facet.maxX + 1e-6 || middle.y < facet.minY - 1e-6 || middle.y > facet.maxY + 1e-6) { continue; }
        if (Math.abs(facet.dzdx * from.x + facet.dzdy * from.y + facet.offset - fromDepth) > 1e-5 ||
            Math.abs(facet.dzdx * to.x + facet.dzdy * to.y + facet.offset - toDepth) > 1e-5) { continue; }
        var vertices = facet.vertices, inside = true;
        for (var edge = 0; edge < 3; edge += 1) {
          var a = vertices[edge], b = vertices[(edge + 1) % 3];
          if ((b.x - a.x) * (middle.y - a.y) - (b.y - a.y) * (middle.x - a.x) < -1e-6) { inside = false; break; }
        }
        if (inside) { return true; }
      }
      return false;
    }
    outline.forEach(function contour(polygon) {
      for (var index = 0; index < polygon.length; index += 1) {
        var a = polygon[index], b = polygon[(index + 1) % polygon.length];
        var dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1e-10) { continue; }
        var ox = a.x - point.x, oy = a.y - point.y;
        var center = -(ox * dx + oy * dy) / lengthSquared;
        var halfSquared = center * center - (ox * ox + oy * oy - radius * radius) / lengthSquared;
        if (halfSquared <= 0) { continue; }
        var half = Math.sqrt(halfSquared), low = Math.max(0, center - half), high = Math.min(1, center + half);
        if (high - low < 1e-5) { continue; }
        // Discard the clipping rectangle outside the circular face before
        // querying any depth. Shared outline vertices reuse the same query.
        var from = low === 0 ? a : { x: a.x + dx * low, y: a.y + dy * low };
        var to = high === 1 ? b : { x: a.x + dx * high, y: a.y + dy * high };
        // The visibility outline also contains unrelated foreground silhouettes.
        // Retain only edges at which the rounded stone and surface meet in depth.
        var middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        var fromDepth = cachedCapDepth(from), toDepth = cachedCapDepth(to);
        if (!surfaceContact(from, to, middle, fromDepth, toDepth)) { continue; }
        segments.push([{ x: from.x, y: from.y, depth: fromDepth }, { x: to.x, y: to.y, depth: toDepth }]);
      }
    });
    return joinIntersectionSegments(segments);
  }

  function drawStoneIntersections(ctx, depth, point, radius, outline) {
    var paths = stoneIntersectionContours(depth, point, radius, outline);
    if (!paths.length) { return; }
    ctx.save();
    ctx.beginPath();
    paths.forEach(function path(raw) {
      var points = softenIntersectionPath(raw);
      ctx.moveTo(points[0].x, points[0].y);
      for (var index = 1; index < points.length; index += 1) { ctx.lineTo(points[index].x, points[index].y); }
    });
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    strokeIntersectionLight(ctx, true);
    ctx.restore();
  }

  function paintStone(ctx, depth, point, radius, paint) {
    var contours = depth ? stoneContours(depth, point, radius) : null;
    if (!contours) { paint(); return; }
    if (!contours.length) {
      if (depth.translucency) { ctx.save(); ctx.globalAlpha *= depth.translucency; paint(); ctx.restore(); }
      return;
    }
    // The soft cast shadow does not need surface tessellation. Draw it once
    // outside the face; reserve exact clipping for the face and its thin rim.
    var area = 0;
    contours.forEach(function measure(points) {
      for (var i = 1; i + 1 < points.length; i += 1) {
        area += Math.abs((points[i].x - points[0].x) * (points[i + 1].y - points[0].y) - (points[i].y - points[0].y) * (points[i + 1].x - points[0].x)) / 2;
      }
    });
    ctx.save();
    ctx.globalAlpha *= depth.translucency + (1 - depth.translucency) * clamp01(area / (4 * Math.pow(radius + 1, 2)));
    ctx.beginPath();
    ctx.rect(point.x - radius * 3, point.y - radius * 3, radius * 6, radius * 6);
    ctx.arc(point.x, point.y, radius, 0, TAU, true);
    ctx.clip("evenodd");
    paint("shadow");
    ctx.restore();
    if (depth.translucency) {
      ctx.save(); ctx.globalAlpha *= depth.translucency; paint(false); ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    var outline = stoneOutline(contours);
    outline.forEach(function contour(points) {
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i += 1) { ctx.lineTo(points[i].x, points[i].y); }
      ctx.closePath();
    });
    ctx.clip();
    paint(false);
    ctx.restore();
    drawStoneIntersections(ctx, depth, point, radius, outline);
  }

  function fillSurface(ctx, patches) {
    // Cancel interior triangle edges before asking Canvas to tessellate the
    // path. The remaining contours retain the full mesh's nonzero winding,
    // including silhouettes, holes and folds, without thousands of overlaps.
    var vertices = [], ids = new Map(), edges = new Map();
    function vertexId(point) {
      if (!ids.has(point)) { ids.set(point, vertices.length); vertices.push(point); }
      return ids.get(point);
    }
    function addEdge(from, to) {
      if (from === to) { return; }
      var low = Math.min(from, to), high = Math.max(from, to);
      var key = low + ":" + high;
      var edge = edges.get(key);
      if (!edge) { edge = { low: low, high: high, count: 0 }; edges.set(key, edge); }
      edge.count += from === low ? 1 : -1;
    }
    patches.forEach(function addPatch(patch) {
      for (var index = 1; index < patch.points.length - 1; index += 1) {
        var a = patch.points[0], b = patch.points[index], c = patch.points[index + 1];
        var area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (!Number.isFinite(area) || Math.abs(area) < 1e-10) { continue; }
        if (area < 0) { var swap = b; b = c; c = swap; }
        var ai = vertexId(a), bi = vertexId(b), ci = vertexId(c);
        addEdge(ai, bi); addEdge(bi, ci); addEdge(ci, ai);
      }
    });
    var outgoing = vertices.map(function emptyEdges() { return []; });
    edges.forEach(function retainEdge(edge) {
      if (!edge.count) { return; }
      var from = edge.count > 0 ? edge.low : edge.high;
      var to = edge.count > 0 ? edge.high : edge.low;
      outgoing[from].push({ to: to, count: Math.abs(edge.count) });
    });
    ctx.beginPath();
    outgoing.forEach(function traceContours(available, first) {
      while (available.length) {
        var current = first;
        ctx.moveTo(vertices[first].x, vertices[first].y);
        do {
          var choices = outgoing[current];
          var next = choices[choices.length - 1];
          next.count -= 1;
          if (!next.count) { choices.pop(); }
          current = next.to;
          ctx.lineTo(vertices[current].x, vertices[current].y);
        } while (current !== first);
        ctx.closePath();
      }
    });
    ctx.fill();
  }

  function project(type, u, v, width, height, orientation) {
    return projectPoint(type, surfacePoint(type, u, v), width, height, orientation);
  }

  function isPeriodicX(type) {
    return type !== "plane";
  }

  function isPeriodicY(type) {
    return type === "torus" || type === "klein" || type === "projective" || type === "sphere";
  }

  function hasXTwist(type) {
    return type === "mobius" || type === "klein" || type === "projective";
  }

  function hasYTwist(type) {
    return type === "projective";
  }

  function seamBridgeUV(type, from, to, vector, crossesX, crossesY) {
    if (type === "sphere") {
      var source;
      var target;
      var along;
      if (crossesX && vector.dy < 0) {
        along = clamp01((from.u + to.v) * 0.5);
        source = { u: along, v: 0 };
        target = { u: 0, v: along };
      } else if (crossesX) {
        along = clamp01((from.v + to.u) * 0.5);
        source = { u: 0, v: along };
        target = { u: along, v: 0 };
      } else if (crossesY && vector.dy > 0) {
        along = clamp01((from.u + to.v) * 0.5);
        source = { u: along, v: 1 };
        target = { u: 1, v: along };
      } else {
        along = clamp01((from.v + to.u) * 0.5);
        source = { u: 1, v: along };
        target = { u: along, v: 1 };
      }
      return { source: source, target: target, amount: 0.5 };
    }

    var sourceChartTo = { u: to.u, v: to.v };

    // Undo the quotient identification first so both stone centres live in
    // one continuous, unfolded chart. This is the step the old renderer
    // skipped, which made diagonal seam edges travel horizontally and then
    // jump vertically at the join.
    if (crossesY && hasYTwist(type)) {
      sourceChartTo.u = 1 - sourceChartTo.u;
    }
    if (crossesX && hasXTwist(type)) {
      sourceChartTo.v = 1 - sourceChartTo.v;
    }
    if (crossesX) {
      sourceChartTo.u += vector.dx > 0 ? 1 : -1;
    }
    if (crossesY) {
      sourceChartTo.v += vector.dy > 0 ? 1 : -1;
    }

    var crossingTimes = [];
    if (crossesX) {
      var boundaryU = vector.dx > 0 ? 1 : 0;
      crossingTimes.push((boundaryU - from.u) / (sourceChartTo.u - from.u));
    }
    if (crossesY) {
      var boundaryV = vector.dy > 0 ? 1 : 0;
      crossingTimes.push((boundaryV - from.v) / (sourceChartTo.v - from.v));
    }
    var amount = crossingTimes.reduce(function sum(total, value) {
      return total + value;
    }, 0) / Math.max(1, crossingTimes.length);
    amount = clamp01(Number.isFinite(amount) ? amount : 0.5);

    var source = {
      u: from.u + (sourceChartTo.u - from.u) * amount,
      v: from.v + (sourceChartTo.v - from.v) * amount
    };
    if (crossesX) {
      source.u = vector.dx > 0 ? 1 : 0;
    }
    if (crossesY) {
      source.v = vector.dy > 0 ? 1 : 0;
    }

    // Apply the actual edge identification to obtain the same surface point
    // in the target chart. Twisted edges reflect their transverse coordinate.
    var target = { u: source.u, v: source.v };
    if (crossesX) {
      target.u = vector.dx > 0 ? 0 : 1;
    }
    if (crossesY) {
      target.v = vector.dy > 0 ? 0 : 1;
    }
    if (crossesX && hasXTwist(type)) {
      target.v = 1 - target.v;
    }
    if (crossesY && hasYTwist(type)) {
      target.u = 1 - target.u;
    }

    return {
      source: source,
      target: target,
      amount: amount
    };
  }

  function stoneUV(rules, cell) {
    var x = cell % rules.width;
    var y = Math.floor(cell / rules.width);
    if (rules.type === "sphere") {
      // Sphere seams are genuine glued edges rather than translated periods.
      // Keep only a small elastic margin outside the first/last board lines;
      // the former half-cell margin expanded into conspicuous empty wedges.
      var inset = 0.24;
      return {
        u: (x + inset) / Math.max(1, rules.width - 1 + inset * 2),
        v: (y + inset) / Math.max(1, rules.height - 1 + inset * 2)
      };
    }
    return {
      u: isPeriodicX(rules.type) ? (x + 0.5) / rules.width : x / Math.max(1, rules.width - 1),
      v: isPeriodicY(rules.type) ? (y + 0.5) / rules.height : y / Math.max(1, rules.height - 1)
    };
  }

  function close(a, b, tolerance) {
    var epsilon = typeof tolerance === "number" ? tolerance : 1e-7;
    return Math.abs(a[0] - b[0]) <= epsilon &&
      Math.abs(a[1] - b[1]) <= epsilon &&
      Math.abs(a[2] - b[2]) <= epsilon;
  }

  return {
    clamp01: clamp01,
    smooth: smooth,
    spring: spring,
    surfacePoint: surfacePoint,
    project: project,
    projectPoint: projectPoint,
    seamProgress: seamProgress,
    morphPoint: morphPoint,
    createDepthBuffer: createDepthBuffer,
    createSurfaceMesh: createSurfaceMesh,
    drawSurfaceIntersections: drawSurfaceIntersections,
    stoneContours: stoneContours,
    stoneOutline: stoneOutline,
    stoneIntersectionContours: stoneIntersectionContours,
    paintStone: paintStone,
    fillSurface: fillSurface,
    stoneUV: stoneUV,
    isPeriodicX: isPeriodicX,
    isPeriodicY: isPeriodicY,
    seamBridgeUV: seamBridgeUV,
    createPresentation: createPresentation,
    blendPresentation: blendPresentation,
    applyPresentation: applyPresentation,
    prepareSphere: prepareSphere,
    close: close
  };
});
