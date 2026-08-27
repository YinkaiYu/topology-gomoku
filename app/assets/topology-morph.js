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

  function sphere(u, v) {
    // Split the square along its diagonal into two triangular charts. Their
    // common three-edge boundary maps to the equator; the interiors map to
    // opposite hemispheres. This realizes the adjacent-edge quotient exactly:
    // S(u,0)=S(0,u) and S(u,1)=S(1,u).
    var upper = v <= u;
    var a = upper ? 1 - u : 1 - v;
    var b = upper ? u - v : v - u;
    var c = upper ? v : u;
    var angleA = 0;
    var angleB = TAU / 3;
    var angleC = TAU * 2 / 3;
    var x = a * Math.cos(angleA) + b * Math.cos(angleB) + c * Math.cos(angleC);
    var y = a * Math.sin(angleA) + b * Math.sin(angleB) + c * Math.sin(angleC);
    var z = (upper ? 1 : -1) * 3 * Math.sqrt(3) * Math.sqrt(Math.max(0, a * b * c));
    var length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
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

  function project(type, u, v, width, height, orientation) {
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
    } else {
      offsetY = Number(orientation) || 0;
    }
    var angles = [
      camera.rotation[0] + offsetX,
      camera.rotation[1] + offsetY,
      camera.rotation[2] + offsetZ
    ];
    var surface = surfacePoint(type, u, v);
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
    stoneUV: stoneUV,
    isPeriodicX: isPeriodicX,
    isPeriodicY: isPeriodicY,
    seamBridgeUV: seamBridgeUV,
    close: close
  };
});
