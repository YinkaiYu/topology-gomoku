(function attachChapterTeaserCompositor(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../../../app/assets/topology.js"),
      require("../../../app/assets/topology-morph.js"),
      require("../../../app/assets/topology-art.js")
    );
    return;
  }
  root.ChapterTeaserCompositor = factory(root.TopologyGomoku, root.TopologyMorph, root.TopologyArt);
})(typeof globalThis !== "undefined" ? globalThis : this, function compositorFactory(Engine, Morph, Art) {
  "use strict";

  if (!Engine || !Morph || !Art) {
    throw new Error("Chapter teaser compositor requires TopologyGomoku, TopologyMorph and TopologyArt");
  }

  var TAU = Math.PI * 2;
  var DEFAULT_SEED = 0x715eede7;
  var FONT_FAMILY = '"Topo Serif PV"';
  var SUBTITLE_FONT_FAMILY = '"Topo Sans PV"';
  var GAME_PALETTE = Art.PALETTE;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) {
      return value < edge0 ? 0 : 1;
    }
    var amount = clamp01((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
  }

  function smootherstep(edge0, edge1, value) {
    var amount = clamp01((value - edge0) / (edge1 - edge0));
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
  }

  function mix(left, right, amount) {
    return left + (right - left) * amount;
  }

  function mix3(left, right, amount) {
    return [
      mix(left[0], right[0], amount),
      mix(left[1], right[1], amount),
      mix(left[2], right[2], amount)
    ];
  }

  function parseHex(hex) {
    var value = String(hex || "#ffffff").replace("#", "");
    if (value.length === 3) {
      value = value.replace(/./g, function expand(character) { return character + character; });
    }
    var number = Number.parseInt(value, 16);
    return {
      r: (number >>> 16) & 255,
      g: (number >>> 8) & 255,
      b: number & 255
    };
  }

  function rgba(color, alpha) {
    var parsed = typeof color === "string" ? parseHex(color) : color;
    return "rgba(" + parsed.r + "," + parsed.g + "," + parsed.b + "," + clamp01(alpha) + ")";
  }

  function normalizeSeed(value) {
    if (Number.isInteger(value)) {
      return value >>> 0;
    }
    var text = String(value == null ? DEFAULT_SEED : value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function hash01(seed, index) {
    var value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function invariant(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function validateStory(story) {
    invariant(story && typeof story === "object", "story.json must contain an object");
    invariant(story.render && story.render.fps === 60, "story.render.fps must be 60");
    ["master", "review"].forEach(function validateProfile(name) {
      var profile = story.render[name];
      invariant(profile && Number.isInteger(profile.width) && Number.isInteger(profile.height), "story.render." + name + " is invalid");
      invariant(Math.abs(profile.width / profile.height - 16 / 9) < 1e-9, "story.render." + name + " must be 16:9");
    });
    invariant(Array.isArray(story.chapters) && story.chapters.length === 7, "story must define seven chapters");
  }

  function validateManifest(manifest, story) {
    validateStory(story);
    invariant(manifest && typeof manifest === "object", "manifest.json must contain an object; run the PV audio build first");
    invariant(Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion >= 1, "manifest.schemaVersion must be a positive integer");
    invariant(manifest.fps === story.render.fps, "manifest.fps must match story.render.fps");
    invariant(Number.isInteger(manifest.totalFrames) && manifest.totalFrames > 0, "manifest.totalFrames must be a positive integer");
    invariant(Array.isArray(manifest.segments) && manifest.segments.length > 0, "manifest.segments must be a non-empty array");
    invariant(Array.isArray(manifest.subtitles), "manifest.subtitles must be an array");

    var previousEnd = 0;
    var ids = Object.create(null);
    manifest.segments.forEach(function validateSegment(segment, index) {
      invariant(segment && typeof segment.id === "string" && segment.id.length > 0, "manifest segment " + index + " needs an id");
      invariant(!ids[segment.id], "duplicate manifest segment id: " + segment.id);
      ids[segment.id] = true;
      invariant(Number.isInteger(segment.startFrame) && Number.isInteger(segment.endFrame), "manifest segment " + segment.id + " needs integer frame bounds");
      invariant(segment.startFrame === previousEnd, "manifest segments must be contiguous at " + segment.id);
      invariant(segment.endFrame > segment.startFrame, "manifest segment " + segment.id + " must have positive duration");
      if (Number.isInteger(segment.durationFrames)) {
        invariant(segment.durationFrames === segment.endFrame - segment.startFrame, "manifest segment duration mismatch: " + segment.id);
      }
      if (segment.kind === "chapter-card") {
        invariant(!segment.narrationCueIds || segment.narrationCueIds.length === 0, "chapter cards cannot contain narration cues");
        if (segment.transformFrame != null) {
          invariant(
            Number.isInteger(segment.transformFrame) && segment.transformFrame > segment.startFrame && segment.transformFrame < segment.endFrame,
            "chapter card transformFrame must be an absolute frame inside the segment: " + segment.id
          );
        }
      }
      previousEnd = segment.endFrame;
    });
    invariant(previousEnd === manifest.totalFrames, "manifest.totalFrames must equal the end of the final segment");

    var previousSubtitleEnd = 0;
    manifest.subtitles.forEach(function validateSubtitle(subtitle, index) {
      invariant(subtitle && typeof subtitle.text === "string" && subtitle.text.length > 0, "manifest subtitle " + index + " needs text");
      invariant(!/[\r\n]/u.test(subtitle.text), "subtitles must remain on one line");
      invariant(!/[。.]/u.test(subtitle.text), "subtitles must not contain full stops");
      invariant(Number.isInteger(subtitle.startFrame) && Number.isInteger(subtitle.endFrame), "subtitle frame bounds must be integers");
      invariant(subtitle.startFrame >= previousSubtitleEnd, "subtitle cues must not overlap");
      invariant(subtitle.endFrame > subtitle.startFrame && subtitle.endFrame <= manifest.totalFrames, "subtitle frame bounds are invalid");
      previousSubtitleEnd = subtitle.endFrame;
    });
    return manifest;
  }

  function topologyConnections(type) {
    if (type === "cylinder") return { x: "same", y: null };
    if (type === "torus") return { x: "same", y: "same" };
    if (type === "mobius") return { x: "twist", y: null };
    if (type === "klein") return { x: "twist", y: "same" };
    if (type === "projective") return { x: "twist", y: "twist" };
    if (type === "sphere") return { x: "adjacent", y: "adjacent" };
    return { x: null, y: null };
  }

  function supportingStones(rules, winningCells) {
    var blocked = Object.create(null);
    winningCells.forEach(function remember(cell) { blocked[cell] = true; });
    var coordinates = [
      [Math.floor(rules.width * 0.28), Math.floor(rules.height * 0.24)],
      [Math.floor(rules.width * 0.72), Math.floor(rules.height * 0.72)],
      [Math.floor(rules.width * 0.72), Math.floor(rules.height * 0.28)],
      [Math.floor(rules.width * 0.28), Math.floor(rules.height * 0.72)]
    ];
    var result = [];
    coordinates.forEach(function addCoordinate(coordinate) {
      var cell = Engine.toCell(rules, clamp(coordinate[0], 0, rules.width - 1), clamp(coordinate[1], 0, rules.height - 1));
      if (!blocked[cell] && !result.some(function duplicate(item) { return item.cell === cell; })) {
        result.push({ cell: cell, player: Engine.AI });
      }
    });
    return result.slice(0, 3);
  }

  function prepareChapter(chapter) {
    var rules = Engine.createRules({
      type: chapter.id,
      width: chapter.width,
      height: chapter.height,
      target: 5
    });
    var startCell = Engine.toCell(rules, chapter.start[0], chapter.start[1]);
    var trace = Engine.tracePath(rules, startCell, chapter.direction, 5);
    invariant(trace && trace.cells.length === 5, "invalid representative topology path: " + chapter.id);
    var presentation = Morph.createPresentation(chapter.id, rules, trace.cells);
    return {
      chapter: chapter,
      rules: rules,
      trace: trace,
      presentation: presentation,
      accent: chapter.accent,
      connections: topologyConnections(chapter.id),
      supportingStones: supportingStones(rules, trace.cells)
    };
  }

  function findSegment(segments, frameIndex) {
    var low = 0;
    var high = segments.length - 1;
    while (low <= high) {
      var middle = (low + high) >>> 1;
      var segment = segments[middle];
      if (frameIndex < segment.startFrame) {
        high = middle - 1;
      } else if (frameIndex >= segment.endFrame) {
        low = middle + 1;
      } else {
        return segment;
      }
    }
    return null;
  }

  function findSubtitle(subtitles, frameIndex) {
    var low = 0;
    var high = subtitles.length - 1;
    while (low <= high) {
      var middle = (low + high) >>> 1;
      var subtitle = subtitles[middle];
      if (frameIndex < subtitle.startFrame) {
        high = middle - 1;
      } else if (frameIndex >= subtitle.endFrame) {
        low = middle + 1;
      } else {
        return subtitle;
      }
    }
    return null;
  }

  function segmentKind(segment) {
    var kind = String(segment.kind || "").toLowerCase();
    var id = String(segment.id || "").toLowerCase();
    if (kind) {
      return kind;
    }
    if (id.indexOf("end-card") >= 0) return "end-card";
    if (id.indexOf("tableau") >= 0 || id.indexOf("seven-worlds") >= 0) return "tableau";
    if (id.indexOf("finale") >= 0) return "finale";
    if (id.indexOf("intro") >= 0) return "intro";
    if (id.indexOf("card") >= 0) return "chapter-card";
    return segment.chapterId ? "chapter" : "unknown";
  }

  function chapterForSegment(chapterById, segment) {
    if (segment.chapterId && chapterById[segment.chapterId]) {
      return chapterById[segment.chapterId];
    }
    if (chapterById[segment.id]) {
      return chapterById[segment.id];
    }
    var values = Object.keys(chapterById).map(function mapChapter(key) { return chapterById[key]; });
    return values.find(function matchChapter(model) {
      return segment.id.indexOf(model.chapter.id) >= 0 || segment.title === model.chapter.chapter || segment.manifold === model.chapter.manifold;
    }) || null;
  }

  function makeOrientation(model, frameIndex, progress, scale) {
    var chapterIndex = model.chapter.index || 0;
    return {
      x: -0.07 + chapterIndex * 0.012,
      y: progress * 0.22 + chapterIndex * 0.045,
      z: (chapterIndex % 2 ? -1 : 1) * 0.018,
      scale: scale || 1,
      shapeX: 1,
      shapeY: 1,
      shapeZ: 1,
      wobbleX: 0,
      wobbleY: 0,
      presentation: model.presentation
    };
  }

  function flatBoardSize(model, viewport) {
    var first = Morph.stoneUV(model.rules, 0);
    var last = Morph.stoneUV(model.rules, model.rules.cellCount - 1);
    var columns = Math.max(1, model.rules.width - 1);
    var rows = Math.max(1, model.rules.height - 1);
    var spanU = Math.max(1e-6, Math.abs(last.u - first.u));
    var spanV = Math.max(1e-6, Math.abs(last.v - first.v));
    // The parameter domain grows by one interval on every periodic axis. Derive
    // its aspect from the actual stone UV span so both canvas axes retain the
    // live game's single square-cell metric for every topology.
    var aspect = Math.max(0.74, (spanV * columns) / (spanU * rows));
    var height = viewport.height * 0.60;
    var width = height * aspect;
    if (width > viewport.width * 0.47) {
      width = viewport.width * 0.47;
      height = width / aspect;
    }
    return { width: width, height: height };
  }

  function flatCanvasPoint(model, u, v, viewport) {
    var size = flatBoardSize(model, viewport);
    return {
      x: viewport.x + viewport.width * 0.5 + (u - 0.5) * size.width,
      y: viewport.y + viewport.height * 0.5 + (v - 0.5) * size.height,
      depth: 0,
      u: u,
      v: v
    };
  }

  function projectSurfacePoint(model, u, v, viewport, morphAmount, orientation) {
    var flat = flatCanvasPoint(model, u, v, viewport);
    if (model.chapter.id === "plane" || morphAmount <= 0) {
      return flat;
    }
    var projected = Morph.project(
      model.chapter.id,
      u,
      v,
      viewport.width,
      viewport.height,
      orientation
    );
    return {
      x: mix(flat.x, projected.x + viewport.x, morphAmount),
      y: mix(flat.y, projected.y + viewport.y, morphAmount),
      depth: projected.depth * morphAmount,
      u: u,
      v: v
    };
  }

  function flatBoardLayout(model, viewport) {
    var first = Morph.stoneUV(model.rules, 0);
    var last = Morph.stoneUV(model.rules, model.rules.cellCount - 1);
    var topLeft = flatCanvasPoint(model, first.u, first.v, viewport);
    var bottomRight = flatCanvasPoint(model, last.u, last.v, viewport);
    var cellX = (bottomRight.x - topLeft.x) / Math.max(1, model.rules.width - 1);
    var cellY = (bottomRight.y - topLeft.y) / Math.max(1, model.rules.height - 1);
    return {
      left: topLeft.x,
      right: bottomRight.x,
      top: topLeft.y,
      bottom: bottomRight.y,
      cellX: cellX,
      cellY: cellY,
      cell: Math.min(Math.abs(cellX), Math.abs(cellY)),
      artScale: Math.min(Math.abs(cellX), Math.abs(cellY)) / 48
    };
  }

  function boardStageBounds(model, viewport) {
    var domainTopLeft = flatCanvasPoint(model, 0, 0, viewport);
    var domainBottomRight = flatCanvasPoint(model, 1, 1, viewport);
    var padding = viewport.height * 0.048;
    return {
      left: domainTopLeft.x - padding,
      top: domainTopLeft.y - padding,
      right: domainBottomRight.x + padding,
      bottom: domainBottomRight.y + padding
    };
  }

  function drawTrackedText(ctx, text, x, y, tracking) {
    if (!tracking) {
      ctx.fillText(text, x, y);
      return;
    }
    var characters = Array.from(text);
    var widths = characters.map(function measure(character) { return ctx.measureText(character).width; });
    var total = widths.reduce(function sum(value, width) { return value + width; }, 0) + tracking * Math.max(0, characters.length - 1);
    var cursor = x - total / 2;
    var align = ctx.textAlign;
    ctx.textAlign = "left";
    characters.forEach(function paint(character, index) {
      ctx.fillText(character, cursor, y);
      cursor += widths[index] + tracking;
    });
    ctx.textAlign = align;
  }

  function drawGameBackdrop(ctx, width, height, frameIndex, palette, seed, intensity, accent) {
    Art.drawAppBackdrop(ctx, width, height, { alpha: intensity, accent: accent || null });
    Art.drawPaperTexture(ctx, width, height, 0.42 * intensity);
    ctx.save();
    for (var index = 0; index < 34; index += 1) {
      var x = hash01(seed, index * 3) * width;
      var y = hash01(seed, index * 3 + 1) * height;
      var radius = mix(0.35, 1.05, hash01(seed, index * 3 + 2)) * height / 1080;
      ctx.fillStyle = rgba(GAME_PALETTE.ink, 0.018 * intensity);
      ctx.fillRect(x, y, radius, radius);
    }
    ctx.restore();
  }

  function drawVignette(ctx, width, height, strength) {
    var gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.18, width * 0.5, height * 0.5, Math.max(width, height) * 0.68);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.64, rgba(GAME_PALETTE.ink, 0.012));
    gradient.addColorStop(1, rgba(GAME_PALETTE.ink, clamp01(strength)));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function buildSurfaceMesh(model, viewport, morphAmount, orientation, quality) {
    var stepsU = Math.max(12, Math.round(model.rules.width * (quality || 2.35)));
    var stepsV = Math.max(12, Math.round(model.rules.height * (quality || 2.35)));
    if (model.chapter.id === "sphere") {
      stepsU = Math.max(20, stepsU);
      stepsV = Math.max(20, stepsV);
    }
    var rows = [];
    for (var row = 0; row <= stepsV; row += 1) {
      var points = [];
      for (var column = 0; column <= stepsU; column += 1) {
        points.push(projectSurfacePoint(model, column / stepsU, row / stepsV, viewport, morphAmount, orientation));
      }
      rows.push(points);
    }
    var patches = [];
    for (row = 0; row < stepsV; row += 1) {
      for (column = 0; column < stepsU; column += 1) {
        var quad = [rows[row][column], rows[row][column + 1], rows[row + 1][column + 1], rows[row + 1][column]];
        if (model.chapter.id === "sphere") {
          [[0, 1, 2], [0, 2, 3]].forEach(function addSphereTriangle(indices) {
            var triangle = indices.map(function sphereTrianglePoint(index) { return quad[index]; });
            patches.push({
              points: triangle,
              depth: (triangle[0].depth + triangle[1].depth + triangle[2].depth) / 3
            });
          });
        } else {
          patches.push({
            points: quad,
            depth: (quad[0].depth + quad[1].depth + quad[2].depth + quad[3].depth) / 4
          });
        }
      }
    }
    patches.sort(function sortDepth(left, right) { return left.depth - right.depth; });
    return { rows: rows, patches: patches, stepsU: stepsU, stepsV: stepsV };
  }

  function drawSurfaceFill(ctx, mesh, model, viewport, morphAmount, opacity) {
    Art.drawCompletionSurface(ctx, mesh.patches, viewport.y + viewport.height, morphAmount, opacity, model.accent);
  }

  function collectParamLine(model, viewport, morphAmount, orientation, fixedAxis, fixedValue, samples, start, end) {
    var points = [];
    var from = start == null ? 0 : start;
    var to = end == null ? 1 : end;
    for (var index = 0; index <= samples; index += 1) {
      var amount = mix(from, to, index / samples);
      var u = fixedAxis === "u" ? fixedValue : amount;
      var v = fixedAxis === "v" ? fixedValue : amount;
      points.push(projectSurfacePoint(model, u, v, viewport, morphAmount, orientation));
    }
    return points;
  }

  function strokeSurfacePolyline(ctx, points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.stroke();
  }

  function strokeSmoothSurfacePath(ctx, points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      for (var index = 0; index < points.length - 1; index += 1) {
        var before = points[Math.max(0, index - 1)];
        var from = points[index];
        var to = points[index + 1];
        var after = points[Math.min(points.length - 1, index + 2)];
        ctx.bezierCurveTo(
          from.x + (to.x - before.x) / 6,
          from.y + (to.y - before.y) / 6,
          to.x - (after.x - from.x) / 6,
          to.y - (after.y - from.y) / 6,
          to.x,
          to.y
        );
      }
    }
    ctx.stroke();
  }

  function surfaceDepthIntersection(from, to, threshold) {
    var span = to.depth - from.depth;
    var amount = Math.abs(span) < 1e-8 ? 0.5 : (threshold - from.depth) / span;
    amount = clamp01(amount);
    return {
      x: mix(from.x, to.x, amount),
      y: mix(from.y, to.y, amount),
      depth: threshold
    };
  }

  function strokeFrontFacingSurfacePath(ctx, points, threshold) {
    var visible = [];
    function finishVisibleRun() {
      if (visible.length > 1) strokeSmoothSurfacePath(ctx, visible);
      visible = [];
    }
    for (var index = 1; index < points.length; index += 1) {
      var from = points[index - 1];
      var to = points[index];
      var fromVisible = from.depth >= threshold;
      var toVisible = to.depth >= threshold;
      if (fromVisible && toVisible) {
        if (!visible.length) visible.push(from);
        visible.push(to);
      } else if (fromVisible) {
        if (!visible.length) visible.push(from);
        visible.push(surfaceDepthIntersection(from, to, threshold));
        finishVisibleRun();
      } else if (toVisible) {
        visible.push(surfaceDepthIntersection(from, to, threshold));
        visible.push(to);
      } else {
        finishVisibleRun();
      }
    }
    finishVisibleRun();
  }

  function traceParamLine(ctx, model, viewport, morphAmount, orientation, fixedAxis, fixedValue, samples) {
    strokeSurfacePolyline(
      ctx,
      collectParamLine(model, viewport, morphAmount, orientation, fixedAxis, fixedValue, samples)
    );
  }

  function drawSphereSurfaceGrid(ctx, model, viewport, morphAmount, orientation, samples) {
    var first = Morph.stoneUV(model.rules, 0);
    var last = Morph.stoneUV(model.rules, model.rules.cellCount - 1);
    var frontBlend = Morph.smooth((morphAmount - 0.46) / 0.42);
    var depthThreshold = -0.012 * morphAmount;

    function strokeSphereLine(points) {
      ctx.save();
      ctx.globalAlpha *= 1 - frontBlend * 0.84;
      strokeSmoothSurfacePath(ctx, points);
      ctx.restore();
      if (frontBlend > 0) {
        ctx.save();
        ctx.globalAlpha *= frontBlend * 0.84;
        strokeFrontFacingSurfacePath(ctx, points, depthThreshold);
        ctx.restore();
      }
    }

    for (var x = 0; x < model.rules.width; x += 1) {
      var u = Morph.stoneUV(model.rules, x).u;
      strokeSphereLine(collectParamLine(model, viewport, morphAmount, orientation, "u", u, samples, first.v, last.v));
    }
    for (var y = 0; y < model.rules.height; y += 1) {
      var v = Morph.stoneUV(model.rules, y * model.rules.width).v;
      strokeSphereLine(collectParamLine(model, viewport, morphAmount, orientation, "v", v, samples, first.u, last.u));
    }
  }

  function drawSurfaceGrid(ctx, model, viewport, morphAmount, orientation, opacity) {
    var samples = model.chapter.id === "sphere" ? 72 : 30;
    var flatBlend = model.chapter.id === "plane" ? 1 : 1 - smoothstep(0.035, 0.18, morphAmount);
    if (flatBlend > 0.001) {
      Art.drawGrid(ctx, flatBoardLayout(model, viewport), model.rules, opacity * flatBlend);
    }
    if (model.chapter.id === "plane") return;
    var surfaceBlend = smoothstep(0.025, 0.15, morphAmount);
    if (surfaceBlend <= 0.001) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.7, viewport.height / 1480);
    ctx.strokeStyle = "rgba(92,88,80," + (opacity * surfaceBlend * (0.48 - clamp01(morphAmount) * 0.17)) + ")";
    if (model.chapter.id === "sphere") {
      drawSphereSurfaceGrid(ctx, model, viewport, morphAmount, orientation, samples);
      ctx.restore();
      return;
    }
    for (var x = 0; x < model.rules.width; x += 1) {
      var u = Morph.stoneUV(model.rules, x).u;
      traceParamLine(ctx, model, viewport, morphAmount, orientation, "u", u, samples);
    }
    for (var y = 0; y < model.rules.height; y += 1) {
      var v = Morph.stoneUV(model.rules, y * model.rules.width).v;
      traceParamLine(ctx, model, viewport, morphAmount, orientation, "v", v, samples);
    }
    ctx.restore();
  }

  function drawSurfaceBoundaries(ctx, model, viewport, morphAmount, orientation, opacity) {
    if (model.chapter.id === "plane") return;
    var reveal = smoothstep(0.08, 0.42, morphAmount) * opacity;
    if (reveal <= 0.001) return;
    var samples = model.chapter.id === "sphere" ? 72 : 48;
    var scale = viewport.height / 1080;
    function strokeBoundary(fixedAxis, fixedValue, color) {
      ctx.save();
      ctx.strokeStyle = rgba(color, reveal * 0.72);
      ctx.lineWidth = Math.max(1.5, 2.4 * scale);
      ctx.lineCap = "round";
      traceParamLine(ctx, model, viewport, morphAmount, orientation, fixedAxis, fixedValue, samples);
      ctx.restore();
    }
    if (model.chapter.id === "sphere") {
      strokeBoundary("v", 0, GAME_PALETTE.connection);
      strokeBoundary("u", 0, GAME_PALETTE.connection);
      strokeBoundary("v", 1, GAME_PALETTE.twist);
      strokeBoundary("u", 1, GAME_PALETTE.twist);
      return;
    }
    if (model.connections.x) {
      strokeBoundary("u", 0, GAME_PALETTE.connection);
      strokeBoundary("u", 1, GAME_PALETTE.connection);
    }
    if (model.connections.y) {
      strokeBoundary("v", 0, GAME_PALETTE.twist);
      strokeBoundary("v", 1, GAME_PALETTE.twist);
    }
  }

  function drawSurface(ctx, model, viewport, morphAmount, orientation, opacity, quality) {
    var mesh = buildSurfaceMesh(model, viewport, morphAmount, orientation, quality);
    ctx.save();
    drawSurfaceFill(ctx, mesh, model, viewport, morphAmount, opacity);
    drawSurfaceGrid(ctx, model, viewport, morphAmount, orientation, opacity);
    drawSurfaceBoundaries(ctx, model, viewport, morphAmount, orientation, opacity);
    ctx.restore();
    return mesh;
  }

  function pathPieces(model, edgeIndex) {
    var from = Morph.stoneUV(model.rules, model.trace.cells[edgeIndex]);
    var to = Morph.stoneUV(model.rules, model.trace.cells[edgeIndex + 1]);
    var seam = model.trace.seams[edgeIndex];
    if (!seam) {
      return [{ from: from, to: to, t0: 0, t1: 1, seam: false }];
    }
    var bridge = Morph.seamBridgeUV(
      model.chapter.id,
      from,
      to,
      Engine.DIRECTIONS[model.trace.directions[edgeIndex]],
      Boolean(seam & Engine.SEAM_X),
      Boolean(seam & Engine.SEAM_Y)
    );
    return [
      { from: from, to: bridge.source, t0: 0, t1: bridge.amount, seam: true },
      { from: bridge.target, to: to, t0: bridge.amount, t1: 1, seam: true }
    ];
  }

  function drawUvPiece(ctx, model, viewport, morphAmount, orientation, piece, amount, style) {
    var visibleEnd = mix(piece.t0, piece.t1, clamp01(amount));
    var denominator = Math.max(1e-8, piece.t1 - piece.t0);
    var localEnd = clamp01((visibleEnd - piece.t0) / denominator);
    var samples = 18;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = style.blur;
    ctx.beginPath();
    for (var index = 0; index <= samples; index += 1) {
      var local = localEnd * index / samples;
      var u = mix(piece.from.u, piece.to.u, local);
      var v = mix(piece.from.v, piece.to.v, local);
      var point = projectSurfacePoint(model, u, v, viewport, morphAmount, orientation);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function projectedCellPoint(model, cell, viewport, morphAmount, orientation) {
    var uv = Morph.stoneUV(model.rules, cell);
    return projectSurfacePoint(model, uv.u, uv.v, viewport, morphAmount, orientation);
  }

  function drawFlatBoardStage(ctx, model, viewport, alpha) {
    if (alpha <= 0.001) return;
    var bounds = boardStageBounds(model, viewport);
    Art.drawBoardStage(ctx, bounds, alpha);
    ctx.save();
    Art.internals.roundedRect(
      ctx,
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top,
      Math.max(16, viewport.height * 0.027)
    );
    ctx.clip();
    ctx.translate(bounds.left, bounds.top);
    Art.drawPaperTexture(ctx, bounds.right - bounds.left, bounds.bottom - bounds.top, alpha * 0.72);
    ctx.restore();
  }

  function drawBoundaryTeaching(ctx, model, viewport, morphAmount, orientation, reveal, opacity, frameIndex) {
    var flatAlpha = opacity * (1 - smoothstep(0.28, 0.68, morphAmount));
    if (flatAlpha <= 0.001) return;
    var layout = flatBoardLayout(model, viewport);
    var time = frameIndex * 1000 / 60;
    var railPulse = 0.18 + (Math.sin(time * 0.0055) * 0.5 + 0.5) * 0.38;
    Art.drawTopologyRails(ctx, {
      layout: layout,
      type: model.chapter.id,
      xConnection: model.connections.x,
      yConnection: model.connections.y,
      pulseX: railPulse,
      pulseY: railPulse * 0.86,
      alpha: flatAlpha
    });

    var edgeTravel = reveal * 4.35;
    var activeTarget = edgeTravel < 0.05 ? 0 : Math.min(4, Math.floor(edgeTravel) + 1);
    for (var edge = 0; edge < model.trace.cells.length - 1; edge += 1) {
      var amount = clamp01(edgeTravel - edge);
      if (amount <= 0) continue;
      var from = projectedCellPoint(model, model.trace.cells[edge], viewport, 0, orientation);
      var to = projectedCellPoint(model, model.trace.cells[edge + 1], viewport, 0, orientation);
      var seam = model.trace.seams[edge];
      var color = seam & Engine.SEAM_TWIST ? GAME_PALETTE.twist : GAME_PALETTE.connection;
      var pending = amount < 0.999;
      var pulse = Math.sin(time * 0.0055) * 0.5 + 0.5;
      ctx.save();
      ctx.globalAlpha = flatAlpha * (pending ? 0.48 + pulse * 0.24 : 0.34);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1.5, layout.cell * 0.045);
      ctx.lineCap = "round";
      if (pending) {
        ctx.setLineDash([layout.cell * 0.12, layout.cell * 0.10]);
        ctx.lineDashOffset = -time * 0.018;
      }
      if (!seam) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mix(from.x, to.x, amount), mix(from.y, to.y, amount));
        ctx.stroke();
      } else {
        var fromDirection = Engine.DIRECTIONS[model.trace.directions[edge]];
        var nextDirectionIndex = model.trace.directions[edge + 1] == null
          ? model.trace.directions[edge]
          : model.trace.directions[edge + 1];
        var toDirection = Engine.DIRECTIONS[nextDirectionIndex];
        var ray = layout.cell * (pending ? 0.72 : 0.58);
        var fromEdge = { x: from.x + fromDirection.dx * ray, y: from.y + fromDirection.dy * ray };
        var toEdge = { x: to.x - toDirection.dx * ray, y: to.y - toDirection.dy * ray };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mix(from.x, fromEdge.x, amount), mix(from.y, fromEdge.y, amount));
        ctx.moveTo(toEdge.x, toEdge.y);
        ctx.lineTo(mix(toEdge.x, to.x, amount), mix(toEdge.y, to.y, amount));
        ctx.stroke();
        ctx.setLineDash([]);
        var ringRadius = layout.cell * 0.37 + pulse * (pending ? 4 : 2);
        [from, to].forEach(function drawCrossingRing(point) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, ringRadius, 0, TAU);
          ctx.stroke();
        });
        if (pending) {
          var travel = 0.2 + pulse * 0.64;
          [[from, fromEdge], [toEdge, to]].forEach(function drawTravelDot(segment) {
            ctx.beginPath();
            ctx.arc(mix(segment[0].x, segment[1].x, travel), mix(segment[0].y, segment[1].y, travel), Math.max(2, layout.cell * 0.055), 0, TAU);
            ctx.fill();
          });
        }
      }
      ctx.restore();
    }

    if (activeTarget < model.trace.cells.length && reveal < 0.94) {
      var target = projectedCellPoint(model, model.trace.cells[activeTarget], viewport, 0, orientation);
      Art.drawTutorialGuide(ctx, {
        x: target.x,
        y: target.y,
        cell: layout.cell,
        time: time,
        alpha: flatAlpha * (1 - smoothstep(0.78, 0.96, reveal))
      });
    }
  }

  function drawPath(ctx, model, viewport, morphAmount, orientation, reveal, palette, opacity) {
    var scale = viewport.height / 1080;
    var layout = flatBoardLayout(model, viewport);
    var pathWidth = Math.max(3.4 * scale, layout.cell * (0.11 - clamp01(morphAmount) * 0.018));
    var lineColor = rgba(GAME_PALETTE.twist, opacity * (0.62 + reveal * 0.22));
    for (var edge = 0; edge < model.trace.cells.length - 1; edge += 1) {
      var edgeReveal = clamp01(reveal * 4.35 - edge);
      if (edgeReveal <= 0) continue;
      var pieces = pathPieces(model, edge);
      pieces.forEach(function paintPiece(piece) {
        var pieceStart = piece.t0;
        var pieceEnd = piece.t1;
        var pieceAmount = clamp01((edgeReveal - pieceStart) / Math.max(1e-8, pieceEnd - pieceStart));
        if (edgeReveal >= pieceEnd) pieceAmount = 1;
        if (edgeReveal <= pieceStart) pieceAmount = 0;
        if (pieceAmount > 0) {
          drawUvPiece(ctx, model, viewport, morphAmount, orientation, piece, pieceAmount, {
            color: lineColor,
            glow: rgba(GAME_PALETTE.twist, opacity * 0.36 * smoothstep(0.18, 0.74, morphAmount)),
            width: pathWidth,
            blur: 12 * scale * smoothstep(0.18, 0.74, morphAmount)
          });
        }
      });

      if (model.trace.seams[edge] && edgeReveal > 0.48) {
        var bridgePieces = pathPieces(model, edge);
        var seamUv = bridgePieces[0].to;
        var seamPoint = projectSurfacePoint(model, seamUv.u, seamUv.v, viewport, morphAmount, orientation);
        ctx.save();
        var seamColor = model.trace.seams[edge] & Engine.SEAM_TWIST ? GAME_PALETTE.twist : GAME_PALETTE.connection;
        ctx.strokeStyle = rgba(seamColor, opacity * 0.58);
        ctx.lineWidth = Math.max(1.2 * scale, layout.cell * 0.018);
        ctx.beginPath();
        ctx.arc(seamPoint.x, seamPoint.y, layout.cell * 0.30, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    var visibleStones = clamp(reveal * 5.25 + 0.1, 0, 5);
    var stones = model.supportingStones.map(function makeSupportingStone(item, index) {
      return {
        point: projectedCellPoint(model, item.cell, viewport, morphAmount, orientation),
        index: -index - 1,
        amount: smoothstep(0.08, 0.26, reveal),
        player: item.player,
        supporting: true
      };
    }).concat(model.trace.cells.map(function makeStone(cell, index) {
      return {
        point: projectedCellPoint(model, cell, viewport, morphAmount, orientation),
        index: index,
        amount: clamp01(visibleStones - index),
        player: Engine.HUMAN,
        supporting: false
      };
    })).filter(function visible(stone) { return stone.amount > 0; });
    stones.sort(function sortStones(left, right) { return left.point.depth - right.point.depth; });
    stones.forEach(function drawStone(stone) {
      var depthScale = clamp(0.92 + stone.point.depth * 0.05, 0.74, 1.16);
      var radius = layout.cell * (0.37 - clamp01(morphAmount) * 0.07) * depthScale * smootherstep(0, 1, stone.amount);
      ctx.save();
      ctx.globalAlpha = opacity * (stone.supporting ? 0.62 : 1);
      ctx.translate(stone.point.x, stone.point.y);
      ctx.shadowColor = stone.player === Engine.HUMAN ? "rgba(24,31,29,0.28)" : "rgba(65,58,48,0.18)";
      ctx.shadowBlur = radius * 0.42;
      ctx.shadowOffsetY = radius * 0.2;
      Art.drawStoneFace(ctx, {
        player: stone.player,
        radius: radius,
        markLastMove: !stone.supporting && stone.index === 4 && reveal > 0.94,
        compression: 0
      });
      ctx.restore();
    });
  }

  function drawChapterCard(ctx, composition, model, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var local = frameInfo.localFrame;
    var duration = frameInfo.durationFrames;
    var transformFrame = frameInfo.titleTransformLocalFrame;
    var reveal = smootherstep(12, 72, local);
    var fadeOut = 1 - smoothstep(duration - 38, duration - 5, local);
    var cardAlpha = reveal * fadeOut;
    var transform = smoothstep(transformFrame - 22, transformFrame + 22, local);
    var silhouetteAlpha = 0.045 + 0.055 * Math.sin(Math.PI * clamp01(local / duration));

    var viewport = { x: 0, y: -height * 0.015, width: width, height: height };
    var orientation = makeOrientation(model, frameInfo.frameIndex, 0.76, 1.35);
    drawSurfaceGrid(ctx, model, viewport, model.chapter.id === "plane" ? 0 : 1, orientation, silhouetteAlpha * cardAlpha);

    var topY = height * 0.465;
    var bottomY = height * 0.558;
    var topSize = Math.round(height * 0.044);
    var bottomSize = Math.round(height * 0.074);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(GAME_PALETTE.ink, cardAlpha);
    ctx.font = "600 " + topSize + "px " + FONT_FAMILY;
    var topTracking = topSize * 0.18;

    var actAlpha = cardAlpha * (1 - transform);
    var manifoldAlpha = cardAlpha * transform;
    if (actAlpha > 0.001) {
      ctx.fillStyle = rgba(GAME_PALETTE.muted, actAlpha * 0.92);
      drawTrackedText(ctx, model.chapter.act, width * 0.5, topY, topTracking);
    }
    if (manifoldAlpha > 0.001) {
      var ghostDistance = height * 0.004 * (1 - transform);
      var titleAccent = model.connections.x === "twist" || model.connections.y === "twist"
        ? GAME_PALETTE.twist
        : GAME_PALETTE.connection;
      ctx.fillStyle = rgba(titleAccent, manifoldAlpha * 0.14);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5 - ghostDistance, topY, topSize * 0.115);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5 + ghostDistance, topY, topSize * 0.115);
      ctx.fillStyle = rgba(GAME_PALETTE.ink, manifoldAlpha * 0.92);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5, topY, topSize * 0.115);
    }

    ctx.font = "700 " + bottomSize + "px " + FONT_FAMILY;
    ctx.fillStyle = rgba(GAME_PALETTE.ink, cardAlpha);
    drawTrackedText(ctx, model.chapter.chapter, width * 0.5, bottomY, bottomSize * 0.22);
    ctx.restore();

    var barWidth = height * 0.052;
    ctx.fillStyle = rgba(model.connections.x === "twist" || model.connections.y === "twist" ? GAME_PALETTE.twist : GAME_PALETTE.connection, cardAlpha * 0.58);
    ctx.fillRect(width * 0.5 - barWidth / 2, height * 0.622, barWidth, Math.max(1, height / 1080));
  }

  function drawChapterScene(ctx, composition, model, frameInfo) {
    var progress = frameInfo.progress;
    var settle = smoothstep(0.02, 0.11, progress);
    var morphProgress = model.chapter.id === "plane" ? 0 : smootherstep(0.46, 0.84, progress);
    var morphAmount = model.chapter.id === "plane" ? 0 : Morph.spring(morphProgress);
    var reveal = smootherstep(0.08, 0.38, progress);
    var viewport = {
      x: 0,
      y: -composition.height * 0.025,
      width: composition.width,
      height: composition.height
    };
    var orientation = makeOrientation(model, frameInfo.frameIndex, progress, mix(1.04, 0.96, clamp01(morphAmount)));
    drawFlatBoardStage(ctx, model, viewport, settle * (1 - smoothstep(0.24, 0.72, morphAmount)));
    drawSurface(ctx, model, viewport, morphAmount, orientation, settle, composition.quality);
    drawBoundaryTeaching(ctx, model, viewport, morphAmount, orientation, reveal, settle, frameInfo.frameIndex);
    drawPath(ctx, model, viewport, morphAmount, orientation, reveal, composition.palette, settle);
  }

  function drawIntroEdge(ctx, composition, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var progress = frameInfo.progress;
    var reveal = smootherstep(0.03, 0.20, progress);
    var dissolve = 1 - smoothstep(0.90, 1, progress);
    var alpha = reveal * dissolve;
    var left = width * 0.18;
    var right = width * 0.82;
    var top = height * 0.24;
    var bottom = height * 0.72;
    var columns = 11;
    var rows = 7;
    var pulse = 0.55 + 0.45 * Math.sin(frameInfo.frameIndex * 0.018);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, height / 1080);
    for (var column = 0; column <= columns; column += 1) {
      var x = mix(left, right, column / columns);
      var edgeDistanceX = Math.min(column, columns - column) / Math.max(1, columns * 0.34);
      ctx.strokeStyle = rgba(GAME_PALETTE.ink, alpha * mix(0.035, 0.14, clamp01(edgeDistanceX)));
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (var row = 0; row <= rows; row += 1) {
      var y = mix(top, bottom, row / rows);
      var edgeDistanceY = Math.min(row, rows - row) / Math.max(1, rows * 0.34);
      ctx.strokeStyle = rgba(GAME_PALETTE.ink, alpha * mix(0.035, 0.14, clamp01(edgeDistanceY)));
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    ctx.lineWidth = Math.max(2, height * 0.0032);
    ctx.strokeStyle = rgba(GAME_PALETTE.connection, alpha * (0.38 + pulse * 0.12));
    ctx.setLineDash([height * 0.022, height * 0.014]);
    ctx.lineDashOffset = -frameInfo.frameIndex * height * 0.00045;
    ctx.beginPath();
    ctx.moveTo(width * 0.50, height * 0.58);
    ctx.bezierCurveTo(width * 0.63, height * 0.56, width * 0.73, height * 0.39, right, height * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left, height * 0.42);
    ctx.bezierCurveTo(width * 0.29, height * 0.45, width * 0.36, height * 0.60, width * 0.50, height * 0.58);
    ctx.stroke();
    ctx.setLineDash([]);

    var fold = smootherstep(0.47, 0.82, progress);
    var farGap = mix(width * 0.64, width * 0.10, fold);
    var pointY = height * 0.42;
    [width * 0.5 - farGap / 2, width * 0.5 + farGap / 2].forEach(function drawEndpoint(pointX, index) {
      var radius = height * (0.010 + pulse * 0.0025);
      ctx.fillStyle = rgba(index ? GAME_PALETTE.connection : GAME_PALETTE.twist, alpha * 0.92);
      ctx.beginPath();
      ctx.arc(pointX, pointY, radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(GAME_PALETTE.card, alpha * 0.72);
      ctx.lineWidth = Math.max(1, height * 0.0014);
      ctx.stroke();
    });

    ctx.strokeStyle = rgba(GAME_PALETTE.twist, alpha * fold * 0.24);
    ctx.lineWidth = Math.max(1, height * 0.0018);
    ctx.beginPath();
    ctx.ellipse(width * 0.5, pointY, farGap * 0.58, height * 0.095 * (1 - fold * 0.35), 0, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawIntroAwakening(ctx, composition, frameInfo) {
    var positions = [
      [0.16, 0.42], [0.275, 0.62], [0.39, 0.36], [0.50, 0.58],
      [0.61, 0.36], [0.725, 0.62], [0.84, 0.42]
    ];
    var progress = frameInfo.progress;
    var width = composition.width;
    var height = composition.height;
    var lineReveal = smootherstep(0.06, 0.72, progress);
    ctx.save();
    ctx.strokeStyle = rgba(GAME_PALETTE.connection, lineReveal * 0.16);
    ctx.lineWidth = Math.max(1, height * 0.0016);
    ctx.setLineDash([height * 0.010, height * 0.014]);
    ctx.lineDashOffset = -frameInfo.frameIndex * height * 0.0002;
    ctx.beginPath();
    positions.forEach(function connect(position, index) {
      var x = width * position[0];
      var y = height * position[1];
      if (index === 0) ctx.moveTo(x, y);
      else ctx.quadraticCurveTo(width * 0.5, height * (index % 2 ? 0.28 : 0.72), x, y);
    });
    ctx.stroke();
    ctx.restore();

    composition.chapters.forEach(function awaken(model, index) {
      var arrival = smootherstep(index * 0.085, index * 0.085 + 0.25, progress);
      var fade = 1 - smoothstep(0.91, 1, progress);
      drawMiniature(
        ctx,
        composition,
        model,
        width * positions[index][0],
        height * positions[index][1],
        height * 0.31,
        frameInfo,
        index,
        arrival * fade * 0.34
      );
    });
  }

  function drawIntro(ctx, composition, frameInfo) {
    if (frameInfo.segment.id === "intro-awakening") {
      drawIntroAwakening(ctx, composition, frameInfo);
      return;
    }
    drawIntroEdge(ctx, composition, frameInfo);
  }

  function drawInstitutionLogo(ctx, composition, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var reveal = smootherstep(0.05, 0.28, frameInfo.progress);
    var fade = 1 - smoothstep(0.82, 1, frameInfo.progress);
    var alpha = reveal * fade;
    var diameter = height * 0.36;
    ctx.save();
    ctx.strokeStyle = rgba(GAME_PALETTE.connection, alpha * 0.13);
    ctx.lineWidth = Math.max(1, height * 0.0015);
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.49, diameter * 0.61, 0, TAU);
    ctx.stroke();
    ctx.restore();
    drawCircularLogo(ctx, composition.logos.institution, width * 0.5, height * 0.49, diameter, alpha);
  }

  function drawMiniature(ctx, composition, model, centerX, centerY, size, frameInfo, index, opacity) {
    var viewport = { x: centerX - size / 2, y: centerY - size / 2, width: size, height: size };
    var orientation = makeOrientation(model, frameInfo.frameIndex + index * 97, frameInfo.progress, 0.92);
    orientation.y += index * 0.13;
    var morphAmount = model.chapter.id === "plane" ? 0 : 1;
    drawSurface(ctx, model, viewport, morphAmount, orientation, opacity, Math.max(1.1, composition.quality * 0.56));
    drawPath(ctx, model, viewport, morphAmount, orientation, 1, composition.palette, opacity * 0.78);
  }

  function drawTableau(ctx, composition, frameInfo) {
    var positions = [
      [0.19, 0.34], [0.395, 0.27], [0.605, 0.27], [0.81, 0.34],
      [0.30, 0.67], [0.50, 0.73], [0.70, 0.67]
    ];
    var baseSize = composition.height * 0.42;
    composition.chapters.forEach(function drawWorld(model, index) {
      var arrival = smootherstep(index * 0.075, index * 0.075 + 0.22, frameInfo.progress);
      var fade = 1 - smoothstep(0.88, 1, frameInfo.progress);
      drawMiniature(
        ctx,
        composition,
        model,
        composition.width * positions[index][0],
        composition.height * positions[index][1],
        baseSize,
        frameInfo,
        index,
        arrival * fade * 0.54
      );
    });
  }

  function drawFinale(ctx, composition, frameInfo) {
    var sphere = composition.chapterById.sphere;
    var viewport = { x: 0, y: -composition.height * 0.02, width: composition.width, height: composition.height };
    var orientation = makeOrientation(sphere, frameInfo.frameIndex, frameInfo.progress, mix(1.18, 0.78, frameInfo.progress));
    orientation.y += frameInfo.progress * 0.42;
    var opacity = smoothstep(0.02, 0.17, frameInfo.progress) * (1 - smoothstep(0.91, 1, frameInfo.progress));
    drawSurface(ctx, sphere, viewport, 1, orientation, opacity, composition.quality);
    drawPath(ctx, sphere, viewport, 1, orientation, smoothstep(0.16, 0.70, frameInfo.progress), composition.palette, opacity);

    if (frameInfo.progress > 0.48) {
      var orbitOpacity = smoothstep(0.48, 0.78, frameInfo.progress) * (1 - smoothstep(0.92, 1, frameInfo.progress));
      composition.chapters.slice(0, 6).forEach(function drawOrbiting(model, index) {
        var angle = index / 6 * TAU + frameInfo.progress * 0.22;
        var radiusX = composition.width * 0.36;
        var radiusY = composition.height * 0.29;
        drawMiniature(
          ctx,
          composition,
          model,
          composition.width * 0.5 + Math.cos(angle) * radiusX,
          composition.height * 0.48 + Math.sin(angle) * radiusY,
          composition.height * 0.18,
          frameInfo,
          index,
          orbitOpacity * 0.22
        );
      });
    }
  }

  function drawCircularLogo(ctx, logo, centerX, centerY, diameter, alpha) {
    if (!logo || !logo.width || !logo.height) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.beginPath();
    ctx.arc(centerX, centerY, diameter / 2, 0, TAU);
    ctx.clip();
    ctx.drawImage(logo, centerX - diameter / 2, centerY - diameter / 2, diameter, diameter);
    ctx.restore();
  }

  function drawContainedImage(ctx, image, centerX, centerY, width, height, alpha) {
    if (!image || !image.width || !image.height) return;
    var scale = Math.min(width / image.width, height / image.height);
    var drawWidth = image.width * scale;
    var drawHeight = image.height * scale;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawEndCard(ctx, composition, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var reveal = smootherstep(0.04, 0.28, frameInfo.progress);
    var alpha = reveal;
    var logoDiameter = height * 0.235;
    drawCircularLogo(ctx, composition.logos.institution, width * 0.425, height * 0.36, logoDiameter, alpha);
    drawContainedImage(
      ctx,
      composition.logos.game,
      width * 0.575,
      height * 0.36,
      logoDiameter * 1.16,
      logoDiameter * 1.16,
      alpha
    );

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(height * 0.076) + "px " + FONT_FAMILY;
    ctx.fillStyle = rgba(GAME_PALETTE.ink, alpha);
    drawTrackedText(ctx, composition.story.endCard.gameTitle, width * 0.5, height * 0.64, height * 0.017);
    ctx.fillStyle = rgba(GAME_PALETTE.connection, alpha * 0.62);
    ctx.fillRect(width * 0.5 - height * 0.038, height * 0.715, height * 0.076, Math.max(1, height / 1080));
    ctx.font = "600 " + Math.round(height * 0.036) + "px " + FONT_FAMILY;
    ctx.fillStyle = rgba(GAME_PALETTE.ink, alpha * 0.88);
    drawTrackedText(ctx, composition.story.endCard.producer, width * 0.5, height * 0.80, height * 0.008);
    ctx.restore();
  }

  function drawSubtitle(ctx, composition, subtitle, frameIndex) {
    if (!subtitle) return;
    var width = composition.width;
    var height = composition.height;
    var localIn = frameIndex - subtitle.startFrame;
    var localOut = subtitle.endFrame - frameIndex;
    var alpha = smoothstep(0, 8, localIn) * smoothstep(0, 8, localOut);
    var fontSize = Math.round(height * 0.036);
    var maxWidth = width * 0.85;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.font = "600 " + fontSize + "px " + SUBTITLE_FONT_FAMILY;
    while (fontSize > height * 0.026 && ctx.measureText(subtitle.text).width > maxWidth) {
      fontSize -= 1;
      ctx.font = "600 " + fontSize + "px " + SUBTITLE_FONT_FAMILY;
    }
    ctx.strokeStyle = rgba(GAME_PALETTE.ink, 0.88 * alpha);
    ctx.lineWidth = Math.max(2, height * 0.0034);
    ctx.strokeText(subtitle.text, width * 0.5, height * 0.917, maxWidth);
    ctx.fillStyle = rgba(GAME_PALETTE.card, alpha * 0.98);
    ctx.fillText(subtitle.text, width * 0.5, height * 0.917, maxWidth);
    ctx.restore();
  }

  function drawSpatialOcclusion(ctx, composition, frameInfo, chapterIndex) {
    var progress = frameInfo.progress;
    var opening = 1 - smoothstep(0, 0.055, progress);
    var closing = smoothstep(0.88, 1, progress);
    var amount = Math.max(opening, closing);
    if (amount <= 0.001) return;
    var width = composition.width;
    var height = composition.height;
    var direction = chapterIndex % 2 === 0 ? 1 : -1;
    var centerX = closing > opening
      ? mix(width * (direction > 0 ? -0.15 : 1.15), width * 0.5, closing)
      : mix(width * 0.5, width * (direction > 0 ? 1.15 : -0.15), 1 - opening);
    var gradient = ctx.createRadialGradient(centerX, height * 0.50, height * 0.04, centerX, height * 0.50, Math.max(width, height) * 0.68);
    gradient.addColorStop(0, rgba(GAME_PALETTE.paperDeep, amount * 0.98));
    gradient.addColorStop(0.46, rgba(GAME_PALETTE.paper, amount * 0.82));
    gradient.addColorStop(0.74, rgba(GAME_PALETTE.connection, amount * 0.055));
    gradient.addColorStop(1, rgba(GAME_PALETTE.paper, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function createComposition(options) {
    options = options || {};
    var story = options.story;
    var manifest = validateManifest(options.manifest, story);
    var width = Number(options.width) || story.render.review.width;
    var height = Number(options.height) || story.render.review.height;
    invariant(Number.isInteger(width) && Number.isInteger(height), "render dimensions must be integers");
    invariant(Math.abs(width / height - 16 / 9) < 1e-9, "render dimensions must be exactly 16:9");

    Morph.prepareSphere();
    var chapterById = Object.create(null);
    var chapters = story.chapters.map(function build(chapter, index) {
      var copy = Object.assign({ index: index }, chapter);
      var model = prepareChapter(copy);
      chapterById[chapter.id] = model;
      return model;
    });
    var composition = {
      story: story,
      manifest: manifest,
      width: width,
      height: height,
      fps: manifest.fps,
      totalFrames: manifest.totalFrames,
      palette: Object.assign({}, story.palette, GAME_PALETTE),
      gamePalette: GAME_PALETTE,
      seed: normalizeSeed(manifest.seed),
      logos: options.logos || { institution: options.logo || null, game: null },
      subtitlesEnabled: options.subtitlesEnabled !== false,
      quality: Number(options.quality) || (width >= 3000 ? 2.8 : 2.25),
      chapters: chapters,
      chapterById: chapterById
    };

    composition.describeFrame = function describeFrame(frameIndex) {
      invariant(Number.isInteger(frameIndex), "frameIndex must be an integer");
      invariant(frameIndex >= 0 && frameIndex < manifest.totalFrames, "frameIndex is outside the manifest timeline");
      var segment = findSegment(manifest.segments, frameIndex);
      invariant(segment, "manifest has no segment for frame " + frameIndex);
      var kind = segmentKind(segment);
      var model = chapterForSegment(chapterById, segment);
      var durationFrames = segment.endFrame - segment.startFrame;
      var localFrame = frameIndex - segment.startFrame;
      var subtitle = composition.subtitlesEnabled && kind !== "chapter-card"
        ? findSubtitle(manifest.subtitles, frameIndex)
        : null;
      var titleRows = null;
      var titlePhase = null;
      var titleTransformLocalFrame = null;
      if (kind === "chapter-card") {
        invariant(model, "chapter-card segment cannot be matched to a chapter: " + segment.id);
        titleTransformLocalFrame = Number.isInteger(segment.transformFrame)
          ? segment.transformFrame - segment.startFrame
          : story.render.titleTransformFrame;
        titlePhase = localFrame < titleTransformLocalFrame ? "act" : "manifold";
        titleRows = [titlePhase === "act" ? model.chapter.act : model.chapter.manifold, model.chapter.chapter];
      }
      return {
        frameIndex: frameIndex,
        segment: segment,
        kind: kind,
        chapter: model,
        localFrame: localFrame,
        durationFrames: durationFrames,
        progress: durationFrames <= 1 ? 1 : localFrame / (durationFrames - 1),
        subtitle: subtitle,
        titlePhase: titlePhase,
        titleTransformLocalFrame: titleTransformLocalFrame,
        titleRows: titleRows
      };
    };

    composition.renderFrame = function renderFrame(ctx, frameIndex) {
      invariant(ctx && typeof ctx.fillRect === "function", "renderFrame requires a 2D canvas context");
      var frameInfo = composition.describeFrame(frameIndex);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawGameBackdrop(
        ctx,
        width,
        height,
        frameIndex,
        composition.palette,
        composition.seed,
        1,
        frameInfo.chapter ? frameInfo.chapter.accent : null
      );

      if (frameInfo.kind === "intro") {
        drawIntro(ctx, composition, frameInfo);
      } else if (frameInfo.kind === "institution-logo") {
        drawInstitutionLogo(ctx, composition, frameInfo);
      } else if (frameInfo.kind === "chapter-card") {
        drawChapterCard(ctx, composition, frameInfo.chapter, frameInfo);
      } else if (frameInfo.kind === "tableau" || frameInfo.kind === "seven-worlds") {
        drawTableau(ctx, composition, frameInfo);
      } else if (frameInfo.kind === "finale") {
        drawFinale(ctx, composition, frameInfo);
      } else if (frameInfo.kind === "end-card" || frameInfo.kind === "endcard") {
        drawEndCard(ctx, composition, frameInfo);
      } else if (frameInfo.chapter) {
        drawChapterScene(ctx, composition, frameInfo.chapter, frameInfo);
      } else {
        drawTableau(ctx, composition, frameInfo);
      }

      if (frameInfo.chapter && frameInfo.kind !== "chapter-card") {
        drawSpatialOcclusion(ctx, composition, frameInfo, frameInfo.chapter.chapter.index || 0);
      }
      drawVignette(ctx, width, height, 0.075);
      drawSubtitle(ctx, composition, frameInfo.subtitle, frameIndex);
      ctx.restore();
      return frameInfo;
    };

    composition.inspect = function inspect() {
      return {
        width: width,
        height: height,
        fps: composition.fps,
        totalFrames: composition.totalFrames,
        seed: composition.seed,
        artSource: "TopologyArt",
        palette: Object.assign({}, GAME_PALETTE),
        subtitlesEnabled: composition.subtitlesEnabled,
        endCard: {
          logos: ["institution", "game"],
          institutionLogoClip: "circle",
          textLines: [story.endCard.gameTitle, story.endCard.producer]
        },
        chapters: chapters.map(function summarize(model) {
          return {
            id: model.chapter.id,
            cells: model.trace.cells.slice(),
            seams: model.trace.seams.slice(),
            directions: model.trace.directions.slice(),
            usesSurface: true,
            startsAsFlatBoard: true,
            morphsToSurface: model.chapter.id !== "plane"
          };
        })
      };
    };

    return composition;
  }

  return {
    DEFAULT_SEED: DEFAULT_SEED,
    FONT_FAMILY: FONT_FAMILY,
    SUBTITLE_FONT_FAMILY: SUBTITLE_FONT_FAMILY,
    validateStory: validateStory,
    validateManifest: validateManifest,
    createComposition: createComposition,
    internals: {
      normalizeSeed: normalizeSeed,
      hash01: hash01,
      makeOrientation: makeOrientation,
      flatBoardLayout: flatBoardLayout,
      buildSurfaceMesh: buildSurfaceMesh,
      pathPieces: pathPieces,
      segmentKind: segmentKind,
      drawCircularLogo: drawCircularLogo
    }
  };
});
