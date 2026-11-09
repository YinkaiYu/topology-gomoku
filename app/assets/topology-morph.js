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
    return {
      x: width * 0.5 + point[0] * scale * magnification,
      y: height * 0.5 - point[1] * scale * magnification,
      depth: point[2],
      scale: magnification,
      depthScale: scale * magnification
    };
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
        minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y), query: 0 };
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
    function strokePath(ctx, points) {
      if (points.length < 2) { return; }
      if (buffer.translucency) {
        ctx.save();
        ctx.globalAlpha *= buffer.translucency;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var back = 1; back < points.length; back += 1) { ctx.lineTo(points[back].x, points[back].y); }
        ctx.stroke();
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
      ctx.stroke();
    }
    var buffer = { visible: visible, depthAt: depthAt, trianglesInRect: trianglesInRect,
      strokePath: strokePath, translucency: 0 };
    return buffer;
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

  function stoneContours(depth, point, radius) {
    var extent = radius + 1;
    var left = point.x - extent, right = point.x + extent;
    var top = point.y - extent, bottom = point.y + extent;
    var whole = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    var pieces = [whole], changed = false;
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
    ctx.arc(point.x, point.y, radius + 1, 0, TAU, true);
    ctx.clip("evenodd");
    paint();
    ctx.restore();
    if (depth.translucency) {
      ctx.save(); ctx.globalAlpha *= depth.translucency; paint(false); ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    stoneOutline(contours).forEach(function contour(points) {
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i += 1) { ctx.lineTo(points[i].x, points[i].y); }
      ctx.closePath();
    });
    ctx.clip();
    paint(false);
    ctx.restore();
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
    createDepthBuffer: createDepthBuffer,
    stoneContours: stoneContours,
    stoneOutline: stoneOutline,
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
