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
    projective: { rotation: [0.66, -0.52, 0.12], scale: 0.285 }
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
    var damping = 0.62;
    var frequency = 8.5;
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
    var wobbleX = 0;
    var wobbleY = 0;
    if (orientation && typeof orientation === "object") {
      offsetX = Number(orientation.x) || 0;
      offsetY = Number(orientation.y) || 0;
      offsetZ = Number(orientation.z) || 0;
      scaleFactor = Number(orientation.scale) || 1;
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
    var softX = surface[0] * (1 + wobbleY * 0.78) + surface[1] * wobbleX * 0.34;
    var softY = surface[1] * (1 - wobbleY * 0.28) + surface[2] * wobbleX * 0.22;
    var softZ = surface[2] * (1 - wobbleY * 0.32) - surface[0] * wobbleX * 0.16;
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
    return type === "torus" || type === "klein" || type === "projective";
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
    close: close
  };
});
