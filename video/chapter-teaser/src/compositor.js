(function attachChapterTeaserCompositor(root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../../../app/assets/topology.js"),
      require("../../../app/assets/topology-morph.js")
    );
    return;
  }
  root.ChapterTeaserCompositor = factory(root.TopologyGomoku, root.TopologyMorph);
})(typeof globalThis !== "undefined" ? globalThis : this, function compositorFactory(Engine, Morph) {
  "use strict";

  if (!Engine || !Morph) {
    throw new Error("Chapter teaser compositor requires TopologyGomoku and TopologyMorph");
  }

  var TAU = Math.PI * 2;
  var DEFAULT_SEED = 0x715eede7;
  var FONT_FAMILY = '"Topo Serif PV"';

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
      accent: parseHex(chapter.accent)
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
    var drift = Math.sin(frameIndex / 181 + chapterIndex * 0.73);
    return {
      x: Math.sin(frameIndex / 317 + chapterIndex) * 0.035,
      y: progress * 0.34 + frameIndex / 1800 + chapterIndex * 0.025,
      z: Math.sin(frameIndex / 263 + chapterIndex * 1.3) * 0.018,
      scale: scale || 1,
      shapeX: 1,
      shapeY: 1,
      shapeZ: 1,
      wobbleX: drift * 0.018,
      wobbleY: Math.cos(frameIndex / 229 + chapterIndex) * 0.012,
      presentation: model.presentation
    };
  }

  function flatPoint(model, u, v, lift) {
    var aspect = model.rules.width / model.rules.height;
    var x = (u - 0.5) * 2 * Math.min(1.35, aspect);
    var y = (v - 0.5) * 2;
    var edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
    var z = model.chapter.id === "plane" ? Math.pow(edge, 4) * lift * 0.36 : 0;
    return [x, y, z];
  }

  function surfacePoint(model, u, v, morphAmount) {
    var target = Morph.surfacePoint(model.chapter.id, u, v);
    var flat = flatPoint(model, u, v, morphAmount);
    if (model.chapter.id === "plane") {
      return flat;
    }
    return mix3(flat, target, smootherstep(0, 1, morphAmount));
  }

  function projectSurfacePoint(model, u, v, viewport, morphAmount, orientation) {
    var point = surfacePoint(model, u, v, morphAmount);
    var projected = Morph.projectPoint(
      model.chapter.id,
      point,
      viewport.width,
      viewport.height,
      orientation
    );
    return {
      x: projected.x + viewport.x,
      y: projected.y + viewport.y,
      depth: projected.depth,
      u: u,
      v: v
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

  function drawVoid(ctx, width, height, frameIndex, palette, seed, intensity) {
    ctx.save();
    ctx.fillStyle = palette.void;
    ctx.fillRect(0, 0, width, height);

    var radial = ctx.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, Math.max(width, height) * 0.72);
    radial.addColorStop(0, rgba(palette.voidLift, 0.68 * intensity));
    radial.addColorStop(0.5, rgba(palette.voidLift, 0.18 * intensity));
    radial.addColorStop(1, rgba(palette.void, 0));
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    var dustCount = Math.round(72 + 40 * intensity);
    for (var index = 0; index < dustCount; index += 1) {
      var x = hash01(seed, index * 5) * width;
      var baseY = hash01(seed, index * 5 + 1) * height;
      var speed = mix(0.006, 0.024, hash01(seed, index * 5 + 2));
      var y = (baseY + frameIndex * speed * height / 60) % height;
      var radius = mix(0.35, 1.35, hash01(seed, index * 5 + 3)) * height / 1080;
      var pulse = 0.45 + 0.55 * Math.sin(frameIndex / mix(74, 137, hash01(seed, index * 5 + 4)) + index);
      ctx.fillStyle = rgba(palette.paper, (0.022 + 0.055 * pulse) * intensity);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette(ctx, width, height, strength) {
    var gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.18, width * 0.5, height * 0.5, Math.max(width, height) * 0.68);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.64, "rgba(0,0,0,0.04)");
    gradient.addColorStop(1, "rgba(0,0,0," + clamp01(strength) + ")");
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
        patches.push({
          points: quad,
          depth: (quad[0].depth + quad[1].depth + quad[2].depth + quad[3].depth) / 4
        });
      }
    }
    patches.sort(function sortDepth(left, right) { return left.depth - right.depth; });
    return { rows: rows, patches: patches, stepsU: stepsU, stepsV: stepsV };
  }

  function drawSurfaceFill(ctx, mesh, accent, opacity) {
    mesh.patches.forEach(function drawPatch(patch) {
      var depthLight = clamp01(0.48 + patch.depth * 0.22);
      ctx.fillStyle = rgba(accent, opacity * mix(0.24, 0.78, depthLight));
      ctx.beginPath();
      ctx.moveTo(patch.points[0].x, patch.points[0].y);
      for (var index = 1; index < patch.points.length; index += 1) {
        ctx.lineTo(patch.points[index].x, patch.points[index].y);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  function traceParamLine(ctx, model, viewport, morphAmount, orientation, fixedAxis, fixedValue, samples) {
    ctx.beginPath();
    for (var index = 0; index <= samples; index += 1) {
      var amount = index / samples;
      var u = fixedAxis === "u" ? fixedValue : amount;
      var v = fixedAxis === "v" ? fixedValue : amount;
      var point = projectSurfacePoint(model, u, v, viewport, morphAmount, orientation);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  function drawSurfaceGrid(ctx, model, viewport, morphAmount, orientation, accent, opacity) {
    var samples = model.chapter.id === "sphere" ? 42 : 30;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.65, viewport.height / 1480);
    ctx.strokeStyle = rgba(accent, opacity * 0.48);
    for (var x = 0; x < model.rules.width; x += 1) {
      var u = model.rules.width === 1 ? 0.5 : x / (model.rules.width - 1);
      if (Morph.isPeriodicX(model.chapter.id)) u = (x + 0.5) / model.rules.width;
      traceParamLine(ctx, model, viewport, morphAmount, orientation, "u", u, samples);
    }
    for (var y = 0; y < model.rules.height; y += 1) {
      var v = model.rules.height === 1 ? 0.5 : y / (model.rules.height - 1);
      if (Morph.isPeriodicY(model.chapter.id)) v = (y + 0.5) / model.rules.height;
      traceParamLine(ctx, model, viewport, morphAmount, orientation, "v", v, samples);
    }
    ctx.lineWidth *= 1.35;
    ctx.strokeStyle = rgba(accent, opacity * 0.28);
    traceParamLine(ctx, model, viewport, morphAmount, orientation, "u", 0, samples);
    traceParamLine(ctx, model, viewport, morphAmount, orientation, "u", 1, samples);
    traceParamLine(ctx, model, viewport, morphAmount, orientation, "v", 0, samples);
    traceParamLine(ctx, model, viewport, morphAmount, orientation, "v", 1, samples);
    ctx.restore();
  }

  function drawSurface(ctx, model, viewport, morphAmount, orientation, opacity, quality) {
    var mesh = buildSurfaceMesh(model, viewport, morphAmount, orientation, quality);
    ctx.save();
    drawSurfaceFill(ctx, mesh, model.accent, opacity * 0.16);
    drawSurfaceGrid(ctx, model, viewport, morphAmount, orientation, model.accent, opacity);
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

  function drawPath(ctx, model, viewport, morphAmount, orientation, reveal, palette, opacity) {
    var scale = viewport.height / 1080;
    var lineColor = rgba(model.accent, opacity * 0.92);
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
            glow: rgba(model.accent, opacity * 0.42),
            width: Math.max(2, 4.6 * scale),
            blur: 7 * scale
          });
        }
      });

      if (model.trace.seams[edge] && edgeReveal > 0.48) {
        var bridgePieces = pathPieces(model, edge);
        var seamUv = bridgePieces[0].to;
        var seamPoint = projectSurfacePoint(model, seamUv.u, seamUv.v, viewport, morphAmount, orientation);
        ctx.save();
        ctx.strokeStyle = rgba(model.accent, opacity * 0.55);
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.arc(seamPoint.x, seamPoint.y, 12 * scale, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    var visibleStones = clamp(reveal * 5.25 + 0.1, 0, 5);
    var stones = model.trace.cells.map(function makeStone(cell, index) {
      var uv = Morph.stoneUV(model.rules, cell);
      var point = projectSurfacePoint(model, uv.u, uv.v, viewport, morphAmount, orientation);
      return { point: point, index: index, amount: clamp01(visibleStones - index) };
    }).filter(function visible(stone) { return stone.amount > 0; });
    stones.sort(function sortStones(left, right) { return left.point.depth - right.point.depth; });
    stones.forEach(function drawStone(stone) {
      var depthScale = clamp(0.84 + stone.point.depth * 0.045, 0.72, 1.16);
      var radius = (stone.index === 4 ? 15 : 13) * scale * depthScale * smootherstep(0, 1, stone.amount);
      var fill = stone.index === 4 && reveal > 0.94 ? palette.danger : palette.paper;
      ctx.save();
      ctx.shadowColor = rgba(fill, opacity * 0.34);
      ctx.shadowBlur = 10 * scale;
      ctx.fillStyle = rgba(fill, opacity * clamp(0.35 + stone.point.depth * 0.08, 0.24, 0.98));
      ctx.beginPath();
      ctx.arc(stone.point.x, stone.point.y, radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(model.accent, opacity * 0.72);
      ctx.lineWidth = 1.15 * scale;
      ctx.stroke();
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
    drawSurfaceGrid(ctx, model, viewport, 1, orientation, model.accent, silhouetteAlpha * cardAlpha);

    var topY = height * 0.465;
    var bottomY = height * 0.558;
    var topSize = Math.round(height * 0.044);
    var bottomSize = Math.round(height * 0.074);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(composition.palette.paper, cardAlpha);
    ctx.font = "600 " + topSize + "px " + FONT_FAMILY;
    var topTracking = topSize * 0.18;

    var actAlpha = cardAlpha * (1 - transform);
    var manifoldAlpha = cardAlpha * transform;
    if (actAlpha > 0.001) {
      ctx.fillStyle = rgba(composition.palette.paper, actAlpha * 0.88);
      drawTrackedText(ctx, model.chapter.act, width * 0.5, topY, topTracking);
    }
    if (manifoldAlpha > 0.001) {
      var ghostDistance = height * 0.004 * (1 - transform);
      ctx.fillStyle = rgba(model.accent, manifoldAlpha * 0.12);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5 - ghostDistance, topY, topSize * 0.115);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5 + ghostDistance, topY, topSize * 0.115);
      ctx.fillStyle = rgba(composition.palette.paper, manifoldAlpha * 0.92);
      drawTrackedText(ctx, model.chapter.manifold, width * 0.5, topY, topSize * 0.115);
    }

    ctx.font = "700 " + bottomSize + "px " + FONT_FAMILY;
    ctx.fillStyle = rgba(composition.palette.paper, cardAlpha);
    drawTrackedText(ctx, model.chapter.chapter, width * 0.5, bottomY, bottomSize * 0.22);
    ctx.restore();

    var barWidth = height * 0.052;
    ctx.fillStyle = rgba(model.accent, cardAlpha * 0.5);
    ctx.fillRect(width * 0.5 - barWidth / 2, height * 0.622, barWidth, Math.max(1, height / 1080));
  }

  function drawChapterScene(ctx, composition, model, frameInfo) {
    var progress = frameInfo.progress;
    var settle = smoothstep(0.02, 0.11, progress);
    var morphAmount = model.chapter.id === "plane"
      ? smoothstep(0.58, 0.94, progress)
      : smootherstep(0.46, 0.84, progress);
    var reveal = smootherstep(0.08, 0.38, progress);
    var viewport = {
      x: 0,
      y: -composition.height * 0.025,
      width: composition.width,
      height: composition.height
    };
    var orientation = makeOrientation(model, frameInfo.frameIndex, progress, mix(1.08, 0.96, morphAmount));
    drawSurface(ctx, model, viewport, morphAmount, orientation, settle, composition.quality);
    drawPath(ctx, model, viewport, morphAmount, orientation, reveal, composition.palette, settle);

    var seamPulse = model.trace.seams.some(Boolean) ? smoothstep(0.18, 0.46, progress) * (1 - smoothstep(0.72, 0.94, progress)) : 0;
    if (seamPulse > 0) {
      ctx.save();
      var seamGradient = ctx.createLinearGradient(0, 0, composition.width, composition.height);
      seamGradient.addColorStop(0, rgba(composition.palette.connection, 0));
      seamGradient.addColorStop(0.48, rgba(model.accent, seamPulse * 0.028));
      seamGradient.addColorStop(0.52, rgba(model.accent, seamPulse * 0.065));
      seamGradient.addColorStop(1, rgba(composition.palette.connection, 0));
      ctx.fillStyle = seamGradient;
      ctx.fillRect(0, 0, composition.width, composition.height);
      ctx.restore();
    }
  }

  function drawIntro(ctx, composition, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var progress = frameInfo.progress;
    var model = composition.chapters[0];
    var viewport = { x: 0, y: height * 0.02, width: width, height: height };
    var orientation = makeOrientation(model, frameInfo.frameIndex, progress, 1.34);
    orientation.x -= 0.2;
    orientation.y += 0.22;
    var emerge = smoothstep(0.05, 0.28, progress) * (1 - smoothstep(0.82, 1, progress));
    drawSurfaceGrid(ctx, model, viewport, smoothstep(0.58, 1, progress), orientation, composition.palette.paper, emerge * 0.35);

    ctx.save();
    ctx.strokeStyle = rgba(composition.palette.connection, emerge * 0.28);
    ctx.lineWidth = Math.max(1, height / 1080);
    var radius = height * mix(0.12, 0.46, smoothstep(0.3, 0.92, progress));
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.48, radius, Math.PI * 1.04, Math.PI * 1.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawMiniature(ctx, composition, model, centerX, centerY, size, frameInfo, index, opacity) {
    var viewport = { x: centerX - size / 2, y: centerY - size / 2, width: size, height: size };
    var orientation = makeOrientation(model, frameInfo.frameIndex + index * 97, frameInfo.progress, 0.92);
    orientation.y += index * 0.13;
    var morphAmount = model.chapter.id === "plane" ? 0.9 : 1;
    drawSurfaceGrid(ctx, model, viewport, morphAmount, orientation, model.accent, opacity);
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
        arrival * fade * 0.48
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
        var angle = index / 6 * TAU + frameInfo.frameIndex / 1500;
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

  function drawEndCard(ctx, composition, frameInfo) {
    var width = composition.width;
    var height = composition.height;
    var reveal = smootherstep(0.04, 0.28, frameInfo.progress);
    var fade = 1 - smoothstep(0.91, 0.995, frameInfo.progress);
    var alpha = reveal * fade;
    var logoDiameter = height * 0.34;
    drawCircularLogo(ctx, composition.logo, width * 0.5, height * 0.39, logoDiameter, alpha);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(height * 0.076) + "px " + FONT_FAMILY;
    ctx.fillStyle = rgba(composition.palette.paper, alpha);
    drawTrackedText(ctx, composition.story.endCard.gameTitle, width * 0.5, height * 0.69, height * 0.017);
    ctx.fillStyle = rgba(composition.palette.connection, alpha * 0.55);
    ctx.fillRect(width * 0.5 - height * 0.038, height * 0.755, height * 0.076, Math.max(1, height / 1080));
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
    ctx.font = "600 " + fontSize + "px " + FONT_FAMILY;
    while (fontSize > height * 0.026 && ctx.measureText(subtitle.text).width > maxWidth) {
      fontSize -= 1;
      ctx.font = "600 " + fontSize + "px " + FONT_FAMILY;
    }
    ctx.strokeStyle = "rgba(0,0,0," + (0.84 * alpha) + ")";
    ctx.lineWidth = Math.max(2, height * 0.0034);
    ctx.strokeText(subtitle.text, width * 0.5, height * 0.917, maxWidth);
    ctx.fillStyle = rgba(composition.palette.paper, alpha * 0.96);
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
    gradient.addColorStop(0, rgba(composition.palette.void, amount * 0.98));
    gradient.addColorStop(0.46, rgba(composition.palette.void, amount * 0.78));
    gradient.addColorStop(1, rgba(composition.palette.void, 0));
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
      palette: story.palette,
      seed: normalizeSeed(manifest.seed),
      logo: options.logo || null,
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
      var subtitle = kind === "chapter-card" ? null : findSubtitle(manifest.subtitles, frameIndex);
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
      drawVoid(ctx, width, height, frameIndex, composition.palette, composition.seed, 1);

      if (frameInfo.kind === "intro") {
        drawIntro(ctx, composition, frameInfo);
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
      drawVignette(ctx, width, height, 0.82);
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
        endCard: { logoClip: "circle", textLines: [story.endCard.gameTitle] },
        chapters: chapters.map(function summarize(model) {
          return {
            id: model.chapter.id,
            cells: model.trace.cells.slice(),
            seams: model.trace.seams.slice(),
            directions: model.trace.directions.slice(),
            usesSurface: true
          };
        })
      };
    };

    return composition;
  }

  return {
    DEFAULT_SEED: DEFAULT_SEED,
    FONT_FAMILY: FONT_FAMILY,
    validateStory: validateStory,
    validateManifest: validateManifest,
    createComposition: createComposition,
    internals: {
      normalizeSeed: normalizeSeed,
      hash01: hash01,
      pathPieces: pathPieces,
      segmentKind: segmentKind,
      drawCircularLogo: drawCircularLogo
    }
  };
});
