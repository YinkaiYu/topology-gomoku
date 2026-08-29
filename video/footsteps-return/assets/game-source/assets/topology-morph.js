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
    cylinder: { rotation: [0.34, -0.56, -0.12], scale: 0.27 },
    torus: { rotation: [0.72, -0.12, -0.24], scale: 0.235 },
    mobius: { rotation: [0.96, -0.08, -0.12], scale: 0.245 },
    klein: { rotation: [0.18, -0.2, -0.08], scale: 0.29 },
    projective: { rotation: [0.66, -0.52, 0.12], scale: 0.285 },
    sphere: { rotation: [0.42, -0.58, -0.08], scale: 0.315 }
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
      points = next;
    }
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
    return normalize3([
      topLeft[0] * (1 - amountU) * (1 - amountV) + topRight[0] * amountU * (1 - amountV) +
        bottomLeft[0] * (1 - amountU) * amountV + bottomRight[0] * amountU * amountV,
      topLeft[1] * (1 - amountU) * (1 - amountV) + topRight[1] * amountU * (1 - amountV) +
        bottomLeft[1] * (1 - amountU) * amountV + bottomRight[1] * amountU * amountV,
      topLeft[2] * (1 - amountU) * (1 - amountV) + topRight[2] * amountU * (1 - amountV) +
        bottomLeft[2] * (1 - amountU) * amountV + bottomRight[2] * amountU * amountV
    ]);
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
    return {
      x: width * 0.5 + point[0] * scale,
      y: height * 0.5 - point[1] * scale,
      depth: point[2]
    };
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
    stoneUV: stoneUV,
    isPeriodicX: isPeriodicX,
    isPeriodicY: isPeriodicY,
    seamBridgeUV: seamBridgeUV,
    createPresentation: createPresentation,
    applyPresentation: applyPresentation,
    prepareSphere: prepareSphere,
    close: close
  };
});
