import { chooseCompletionView, gameForReviewFrame } from '../platform/wechat-ui-parity';
import {
  clamp01,
  fillRoundedRect,
  glassPanel,
  lerp,
  pill,
  pointInRect,
  roundedRectPath,
  softOut,
  springOut,
  text,
  drawIcon,
  drawIconAsset,
  drawImageContain,
  effectPixels,
  setContextPixelRatio,
} from './primitives';

const COLORS = {
  paper: '#f2efe7',
  paperDeep: '#e8e2d7',
  ink: '#21302c',
  muted: '#817f77',
  faint: '#c8c1b5',
  red: '#d95b4f',
  teal: '#3f8c87',
  gold: '#c79244',
  spatial: '#8b7556',
};

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function copyRect(value) {
  return value ? rect(value.x, value.y, value.width, value.height) : null;
}

function usableRect(value) {
  return Boolean(value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.width)
    && Number.isFinite(value.height)
    && value.width > 0
    && value.height > 0);
}

function interpolateRect(from, to, amount) {
  return rect(
    lerp(from.x, to.x, amount),
    lerp(from.y, to.y, amount),
    lerp(from.width, to.width, amount),
    lerp(from.height, to.height, amount),
  );
}

function aspectFitRect(source, target) {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return rect(
    target.x + (target.width - width) / 2,
    target.y + (target.height - height) / 2,
    width,
    height,
  );
}

function cubicBezierCoordinate(time, first, second) {
  const inverse = 1 - time;
  return 3 * inverse * inverse * time * first
    + 3 * inverse * time * time * second
    + time * time * time;
}

function cubicBezierProgress(progress, x1, y1, x2, y2) {
  const target = clamp01(progress);
  let lower = 0;
  let upper = 1;
  let time = target;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const x = cubicBezierCoordinate(time, x1, x2);
    if (Math.abs(x - target) < 0.0001) {
      break;
    }
    if (x < target) {
      lower = time;
    } else {
      upper = time;
    }
    time = (lower + upper) / 2;
  }
  return cubicBezierCoordinate(time, y1, y2);
}

function drawSnapshotWithoutRect(ctx, snapshot, source, dpr, width, height) {
  const left = Math.max(0, Math.min(width, source.x));
  const top = Math.max(0, Math.min(height, source.y));
  const right = Math.max(left, Math.min(width, source.x + source.width));
  const bottom = Math.max(top, Math.min(height, source.y + source.height));
  const regions = [
    rect(0, 0, width, top),
    rect(0, bottom, width, height - bottom),
    rect(0, top, left, bottom - top),
    rect(right, top, width - right, bottom - top),
  ];
  regions.forEach((region) => {
    if (region.width <= 0 || region.height <= 0) {
      return;
    }
    ctx.drawImage(
      snapshot,
      region.x * dpr,
      region.y * dpr,
      region.width * dpr,
      region.height * dpr,
      region.x,
      region.y,
      region.width,
      region.height,
    );
  });
}

export default class SceneRenderer {
  constructor(host, controller) {
    this.host = host;
    this.context = host.context;
    this.controller = controller;
    this.metrics = host.metrics;
    this.syncContextPixelRatio();
    this.hits = [];
    this.homeRects = {};
    this.boardRect = null;
    this.boardLayout = null;
    this.settingsOpen = false;
    this.sheetMotion = null;
    this.sheetRect = null;
    this.difficultyRect = null;
    this.switchRects = {};
    this.pressedKey = null;
    this.transition = null;
    this.surfaceRotation = { x: 0, y: 0, z: 0 };
    this.surfacePresentation = null;
    this.surfacePresentationKey = '';
    this.surfaceView = null;
    this.surfaceViewKey = '';
    this.completionMotion = null;
    this.surfaceVelocity = { x: 0, y: 0 };
    this.surfaceElastic = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
    this.surfaceAutoResumeAt = 0;
    this.gamePausedAt = null;
    this.levelShake = null;
    this.controlMotions = {
      difficulty: null,
      switches: {},
    };
    this.settingsBackdrop = null;
  }

  resize(metrics) {
    this.metrics = metrics;
    this.syncContextPixelRatio();
    this.hits = [];
    this.homeRects = {};
    this.boardRect = null;
    this.boardLayout = null;
    this.surfaceView = null;
    this.surfaceViewKey = '';
  }

  syncContextPixelRatio() {
    const pixelRatio = Math.max(1, Number(this.metrics && this.metrics.pixelRatio) || 1);
    setContextPixelRatio(this.context, pixelRatio);
    if (GameGlobal.TopologyBoardArt
      && typeof GameGlobal.TopologyBoardArt.setContextPixelRatio === 'function') {
      GameGlobal.TopologyBoardArt.setContextPixelRatio(this.context, pixelRatio);
    }
  }

  contentBounds(maxWidth = 520, horizontalPadding = null) {
    const { width, leftInset, rightInset } = this.metrics;
    const left = horizontalPadding === null
      ? leftInset
      : Math.max(leftInset, horizontalPadding);
    const right = horizontalPadding === null
      ? rightInset
      : Math.max(rightInset, horizontalPadding);
    const safeWidth = Math.max(1, width - left - right);
    const contentWidth = Math.min(maxWidth, safeWidth);
    return {
      x: left + (safeWidth - contentWidth) / 2,
      width: contentWidth,
    };
  }

  shakeLevel(index, time) {
    this.levelShake = { index, startedAt: time, duration: 300 };
  }

  levelShakeOffset(index, time) {
    if (!this.levelShake || this.levelShake.index !== index) {
      return 0;
    }
    const progress = clamp01((time - this.levelShake.startedAt) / this.levelShake.duration);
    if (progress >= 1) {
      this.levelShake = null;
      return 0;
    }
    if (progress < 0.25) {
      return lerp(0, -4, progress / 0.25);
    }
    if (progress < 0.55) {
      return lerp(-4, 4, (progress - 0.25) / 0.3);
    }
    if (progress < 0.8) {
      return lerp(4, -2, (progress - 0.55) / 0.25);
    }
    return lerp(-2, 0, (progress - 0.8) / 0.2);
  }

  topologyImage(name, compact = false) {
    return this.host.images && this.host.images.topologies
      ? this.host.images.topologies[`${name}${compact ? '-compact' : ''}`]
      : null;
  }

  silhouetteImage(name, compact = false) {
    return this.host.images && this.host.images.silhouettes
      ? this.host.images.silhouettes[`${name}${compact ? '-compact' : ''}`]
      : null;
  }

  iconImage(name) {
    return this.host.images && this.host.images.icons
      ? this.host.images.icons[name]
      : null;
  }

  drawAssetIcon(ctx, name, x, y, size, color = COLORS.muted) {
    if (!drawIconAsset(ctx, this.iconImage(name), x, y, size)) {
      drawIcon(ctx, name === 'next-level' ? 'next' : name, x, y, size, color);
    }
  }

  gameTime(time) {
    return this.gamePausedAt === null ? time : this.gamePausedAt;
  }

  pauseGameTime(time) {
    if (this.gamePausedAt === null) {
      this.gamePausedAt = time;
    }
  }

  resumeGameTime(time) {
    if (this.gamePausedAt === null) {
      return;
    }
    const pausedAt = this.gamePausedAt;
    const offset = Math.max(0, time - pausedAt);
    const shiftMotion = (motion) => {
      if (motion && motion.startedAt <= pausedAt) {
        motion.startedAt += offset;
      }
    };
    shiftMotion(this.completionMotion);
    shiftMotion(this.transition);
    if (Number.isFinite(this.surfaceAutoResumeAt) && this.surfaceAutoResumeAt > 0) {
      this.surfaceAutoResumeAt += offset;
    }
    this.gamePausedAt = null;
  }

  setPressedKey(key) {
    this.pressedKey = key || null;
  }

  openSettings(time) {
    if (this.settingsOpen) {
      return;
    }
    this.settingsOpen = true;
    this.sheetMotion = { opening: true, startedAt: time, duration: 380, dragOffset: 0 };
  }

  closeSettings(time) {
    if (!this.settingsOpen) {
      return;
    }
    this.sheetMotion = { opening: false, startedAt: time, duration: 380, dragOffset: 0 };
  }

  setSheetDrag(offset) {
    if (!this.settingsOpen) {
      return;
    }
    if (!this.sheetMotion || !this.sheetMotion.dragging) {
      this.sheetMotion = { opening: true, startedAt: 0, duration: 1, dragging: true, dragOffset: 0 };
    }
    this.sheetMotion.dragOffset = Math.max(0, offset || 0);
  }

  settleSheetDrag(time, dismiss) {
    if (!this.settingsOpen) {
      return;
    }
    const fromOffset = this.sheetMotion && this.sheetMotion.dragOffset
      ? this.sheetMotion.dragOffset
      : 0;
    this.sheetMotion = dismiss
      ? { opening: false, startedAt: time, duration: 380, dragOffset: 0, fromOffset }
      : { opening: true, settling: true, startedAt: time, duration: 380, dragOffset: 0, fromOffset };
  }

  beginTransition(kind, sourceRect, levelIndex, time) {
    if (!usableRect(sourceRect)) {
      this.transition = null;
      return false;
    }
    let snapshot = null;
    try {
      if (typeof wx.createCanvas === 'function' && this.host.canvas) {
        snapshot = wx.createCanvas();
        snapshot.width = this.host.canvas.width;
        snapshot.height = this.host.canvas.height;
        snapshot.getContext('2d').drawImage(this.host.canvas, 0, 0);
      }
    } catch (error) {
      snapshot = null;
    }
    this.transition = {
      kind,
      sourceRect: copyRect(sourceRect),
      levelIndex,
      startedAt: time,
      duration: kind === 'enter' ? 300 : 240,
      snapshot,
      snapshotDpr: this.metrics.pixelRatio || 1,
    };
    return true;
  }

  transitionTargetAlpha(kind, time) {
    const transition = this.transition;
    if (!transition || transition.kind !== kind) {
      return 1;
    }
    const progress = clamp01((time - transition.startedAt) / transition.duration);
    return softOut(clamp01((progress - 0.72) / 0.28));
  }

  register(key, bounds, payload = {}, disabled = false) {
    this.hits.push({ key, rect: copyRect(bounds), payload, disabled });
  }

  hitTest(x, y) {
    for (let index = this.hits.length - 1; index >= 0; index -= 1) {
      const hit = this.hits[index];
      if (pointInRect(hit.rect, x, y)) {
        return hit;
      }
    }
    return null;
  }

  hitRect(key) {
    const hit = this.hits.find((candidate) => candidate.key === key);
    return hit ? copyRect(hit.rect) : null;
  }

  boardCellAt(x, y) {
    if (!this.boardRect || !this.boardLayout) {
      return -1;
    }
    const state = this.controller.getState();
    if (!state.game) {
      return -1;
    }
    return GameGlobal.TopologyBoardArt.hitTestCell(
      state.game.rules,
      this.boardLayout,
      x - this.boardRect.x,
      y - this.boardRect.y,
    );
  }

  boardContains(x, y) {
    if (!this.boardRect || !this.boardLayout) {
      return false;
    }
    return GameGlobal.TopologyBoardArt.pointInsideBoard(
      this.boardLayout,
      x - this.boardRect.x,
      y - this.boardRect.y,
    );
  }

  boardCellCenter(cell) {
    const game = this.controller.getState().game;
    if (!game || !this.boardRect || !this.boardLayout || cell < 0) {
      return null;
    }
    const center = GameGlobal.TopologyBoardArt.cellCenter(game.rules, this.boardLayout, cell);
    return { x: center.x + this.boardRect.x, y: center.y + this.boardRect.y };
  }

  difficultyGeometry() {
    if (!this.difficultyRect) {
      return null;
    }
    const thumbWidth = (this.difficultyRect.width - 14) / 3;
    return {
      thumbWidth,
      step: thumbWidth + 3,
      firstCenter: this.difficultyRect.x + 4 + thumbWidth / 2,
    };
  }

  difficultyProgressAt(x, grabOffset = 0) {
    const geometry = this.difficultyGeometry();
    if (!geometry) {
      return 1;
    }
    const raw = (x - grabOffset - geometry.firstCenter) / geometry.step;
    return this.detentProgress(this.dampedControlProgress(raw, 2, 0.56, 0.24), 2);
  }

  difficultyDragProgress(startProgress, deltaX) {
    return this.difficultyDragState(startProgress, deltaX).visual;
  }

  difficultyDragState(startProgress, deltaX) {
    const geometry = this.difficultyGeometry();
    if (!geometry) {
      return { raw: startProgress, clamped: startProgress, visual: startProgress };
    }
    const raw = startProgress + deltaX / geometry.step;
    return {
      raw,
      clamped: Math.max(0, Math.min(2, raw)),
      visual: this.detentProgress(this.dampedControlProgress(raw, 2, 0.56, 0.24), 2),
    };
  }

  difficultyAt(x) {
    if (!this.difficultyRect) {
      return 1;
    }
    return Math.max(0, Math.min(2, Math.round(this.difficultyProgressAt(x))));
  }

  difficultyThumbRect(progress) {
    const geometry = this.difficultyGeometry();
    if (!geometry || !this.difficultyRect) {
      return null;
    }
    return rect(
      this.difficultyRect.x + 4 + progress * geometry.step,
      this.difficultyRect.y + 4,
      geometry.thumbWidth,
      36,
    );
  }

  difficultyThumbContains(x, y, progress) {
    return pointInRect(this.difficultyThumbRect(progress), x, y, 2);
  }

  difficultyThumbCenter(progress) {
    const bounds = this.difficultyThumbRect(progress);
    return bounds ? bounds.x + bounds.width / 2 : 0;
  }

  switchProgressAt(key, x, grabOffset = 0) {
    const bounds = this.switchRects[key];
    if (!bounds) {
      return 0;
    }
    const raw = (x - grabOffset - (bounds.x + 3 + 13)) / 34;
    return this.detentProgress(this.dampedControlProgress(raw, 1, 0.58, 0.22), 1);
  }

  switchDragProgress(key, startProgress, deltaX) {
    return this.switchDragState(key, startProgress, deltaX).visual;
  }

  switchDragState(key, startProgress, deltaX) {
    const bounds = this.switchRects[key];
    if (!bounds) {
      return { raw: startProgress, clamped: startProgress, visual: startProgress };
    }
    const travel = Math.max(1, bounds.width - 6 - 26);
    const raw = startProgress + deltaX / travel;
    return {
      raw,
      clamped: clamp01(raw),
      visual: this.detentProgress(this.dampedControlProgress(raw, 1, 0.58, 0.22), 1),
    };
  }

  dampedControlProgress(raw, maximum, damping, overshoot) {
    if (raw < 0) {
      return Math.max(-overshoot, raw * damping);
    }
    if (raw > maximum) {
      return Math.min(maximum + overshoot, maximum + (raw - maximum) * damping);
    }
    return raw;
  }

  detentProgress(progress, maximum) {
    if (progress <= 0 || progress >= maximum) {
      return progress;
    }
    const nearestStop = Math.round(progress);
    const distance = progress - nearestStop;
    const normalizedDistance = Math.min(1, Math.abs(distance) * 2);
    const attractedDistance = Math.pow(normalizedDistance, 2.05) * 0.5;
    return nearestStop + (distance < 0 ? -attractedDistance : attractedDistance);
  }

  switchKnobRect(key, progress) {
    const bounds = this.switchRects[key];
    if (!bounds) {
      return null;
    }
    return rect(bounds.x + 3 + progress * 34, bounds.y + 3, 26, 26);
  }

  switchKnobContains(key, x, y, progress) {
    return pointInRect(this.switchKnobRect(key, progress), x, y, 2);
  }

  switchKnobCenter(key, progress) {
    const bounds = this.switchKnobRect(key, progress);
    return bounds ? bounds.x + bounds.width / 2 : 0;
  }

  switchValueAt(key, x) {
    return this.switchProgressAt(key, x) >= 0.5;
  }

  settleControl(
    kind,
    key,
    from,
    to,
    time,
    pressedMovable = false,
    directSelection = false,
    travelFrom = from,
  ) {
    const distance = Math.max(0, Math.min(2, Math.abs(to - travelFrom)));
    const duration = kind === 'difficulty'
      ? Math.round((directSelection ? 660 : 720) + distance * 140)
      : (directSelection ? 820 : Math.round(720 + Math.min(1, distance) * 120));
    const motion = {
      from,
      to,
      startedAt: time,
      duration,
      pressedMovable,
    };
    if (kind === 'difficulty') {
      this.controlMotions.difficulty = motion;
    } else {
      this.controlMotions.switches[key] = motion;
    }
  }

  controlProgress(kind, key, fallback, time) {
    const motion = kind === 'difficulty'
      ? this.controlMotions.difficulty
      : this.controlMotions.switches[key];
    if (!motion) {
      return fallback;
    }
    const progress = clamp01((time - motion.startedAt) / motion.duration);
    if (progress >= 1) {
      if (kind === 'difficulty') {
        this.controlMotions.difficulty = null;
      } else {
        delete this.controlMotions.switches[key];
      }
      return motion.to;
    }
    const amount = cubicBezierProgress(progress, 0.32, 0.05, 0.2, 1.13);
    return lerp(motion.from, motion.to, amount);
  }

  controlSettleScale(kind, key, time) {
    const motion = kind === 'difficulty'
      ? this.controlMotions.difficulty
      : this.controlMotions.switches[key];
    if (!motion || !motion.pressedMovable) {
      return { x: 1, y: 1 };
    }
    const progress = clamp01((time - motion.startedAt) / motion.duration);
    const frames = kind === 'difficulty'
      ? [
        [0, 1.34, 1.58],
        [0.28, 1.14, 1.06],
        [0.66, 0.975, 1.025],
        [0.84, 1.012, 0.99],
        [1, 1, 1],
      ]
      : [
        [0, 1.66, 1.48],
        [0.26, 1.2, 1.055],
        [0.64, 0.965, 1.03],
        [0.84, 1.018, 0.985],
        [1, 1, 1],
      ];
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const next = frames[index];
      if (progress <= next[0]) {
        const localProgress = (progress - previous[0]) / Math.max(0.0001, next[0] - previous[0]);
        const amount = cubicBezierProgress(localProgress, 0.22, 0.64, 0.2, 1);
        return {
          x: lerp(previous[1], next[1], amount),
          y: lerp(previous[2], next[2], amount),
        };
      }
    }
    return { x: 1, y: 1 };
  }

  hasControlMotion(time) {
    const motions = [
      this.controlMotions.difficulty,
      ...Object.keys(this.controlMotions.switches).map((key) => this.controlMotions.switches[key]),
    ].filter(Boolean);
    return motions.some((motion) => time - motion.startedAt < motion.duration);
  }

  ensureSettingsBackdrop() {
    if (!this.host.canvas || typeof wx.createCanvas !== 'function') {
      return null;
    }
    const source = this.host.canvas;
    if (!this.settingsBackdrop) {
      try {
        this.settingsBackdrop = {
          snapshot: wx.createCanvas(),
          softened: wx.createCanvas(),
        };
      } catch (error) {
        this.settingsBackdrop = null;
        return null;
      }
    }
    const snapshot = this.settingsBackdrop.snapshot;
    if (snapshot.width !== source.width || snapshot.height !== source.height) {
      snapshot.width = source.width;
      snapshot.height = source.height;
    }
    return this.settingsBackdrop;
  }

  drawCurrentCanvasBlur(blurRadius, clipRect = null, radius = 0, options = {}) {
    const backdrop = this.ensureSettingsBackdrop();
    if (!backdrop) {
      return false;
    }
    const source = this.host.canvas;
    const snapshot = backdrop.snapshot;
    const snapshotContext = snapshot.getContext('2d');
    try {
      snapshotContext.setTransform(1, 0, 0, 1, 0, 0);
    } catch (error) {
      // Fresh offscreen canvases already use an identity transform.
    }
    snapshotContext.clearRect(0, 0, snapshot.width, snapshot.height);
    snapshotContext.drawImage(source, 0, 0);

    const ctx = this.context;
    const { width, height } = this.metrics;
    ctx.save();
    ctx.globalAlpha *= options.alpha === undefined ? 1 : clamp01(options.alpha);
    if (clipRect) {
      roundedRectPath(ctx, clipRect.x, clipRect.y, clipRect.width, clipRect.height, radius);
      ctx.clip();
    }
    let filtered = false;
    try {
      const saturation = options.saturation === undefined ? 0.94 : options.saturation;
      const brightness = options.brightness === undefined ? 0.99 : options.brightness;
      const contrast = options.contrast === undefined ? 1 : options.contrast;
      ctx.filter = `blur(${effectPixels(ctx, blurRadius)}px) saturate(${saturation}) brightness(${brightness}) contrast(${contrast})`;
      filtered = typeof ctx.filter === 'string' && ctx.filter.indexOf('blur') >= 0;
    } catch (error) {
      filtered = false;
    }
    if (filtered) {
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height);
    } else {
      const scale = blurRadius > 3 ? 0.25 : 0.34;
      const softened = backdrop.softened;
      const softenedWidth = Math.max(1, Math.round(snapshot.width * scale));
      const softenedHeight = Math.max(1, Math.round(snapshot.height * scale));
      if (softened.width !== softenedWidth || softened.height !== softenedHeight) {
        softened.width = softenedWidth;
        softened.height = softenedHeight;
      }
      const softenedContext = softened.getContext('2d');
      softenedContext.clearRect(0, 0, softened.width, softened.height);
      softenedContext.imageSmoothingEnabled = true;
      softenedContext.imageSmoothingQuality = 'high';
      softenedContext.drawImage(snapshot, 0, 0, softened.width, softened.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(softened, 0, 0, softened.width, softened.height, 0, 0, width, height);
    }
    try {
      ctx.filter = 'none';
    } catch (error) {
      // Older Canvas 2D implementations ignore filter resets.
    }
    ctx.restore();
    return true;
  }

  presentationFor(game) {
    if (!game || !game.winningMask) {
      this.surfacePresentation = null;
      this.surfacePresentationKey = '';
      return null;
    }
    const cells = Array.prototype.slice.call(game.winningMask.cells);
    const key = `${game.level.topology}:${cells.join(',')}`;
    if (key !== this.surfacePresentationKey) {
      this.surfacePresentation = GameGlobal.TopologyMorph.createPresentation(
        game.level.topology,
        game.rules,
        cells,
      );
      this.surfacePresentationKey = key;
    }
    return this.surfacePresentation;
  }

  completionViewFor(game) {
    if (!game || !game.winningMask || !this.boardLayout) {
      this.surfaceView = null;
      this.surfaceViewKey = '';
      return null;
    }
    const key = `${this.completionKey(game)}:${this.boardLayout.width}x${this.boardLayout.height}`;
    if (key !== this.surfaceViewKey) {
      this.surfaceView = chooseCompletionView(
        game,
        this.presentationFor(game),
        this.boardLayout.width,
        this.boardLayout.height,
      );
      this.surfaceViewKey = key;
    }
    return this.surfaceView;
  }

  completionKey(game) {
    if (!game) {
      return '';
    }
    const winningCells = game.winningMask && game.winningMask.cells
      ? Array.prototype.join.call(game.winningMask.cells, ',')
      : '';
    return `${game.levelIndex}:${game.outcome || ''}:${game.moves.length}:${winningCells}`;
  }

  resetCompletionMotion() {
    this.completionMotion = null;
    this.surfaceVelocity = { x: 0, y: 0 };
    this.surfaceElastic = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
    this.surfaceAutoResumeAt = 0;
  }

  startPresenting(game, time) {
    if (!game || !game.completionAvailable) {
      return false;
    }
    this.completionMotion = {
      key: this.completionKey(game),
      phase: 'presenting',
      startedAt: time,
      duration: 3000,
      settled: false,
    };
    this.surfaceAutoResumeAt = time + 2450;
    return true;
  }

  startReturning(game, time) {
    const pose = this.completionPose(game, time);
    if (!pose || !pose.settled) {
      return false;
    }
    this.completionMotion = {
      key: this.completionKey(game),
      phase: 'returning',
      startedAt: time,
      duration: 1050,
      settled: false,
    };
    this.surfaceVelocity = { x: 0, y: 0 };
    return true;
  }

  completionPose(game, time) {
    time = this.gameTime(time);
    if (!game || game.status !== 'ended' || !game.completionAvailable) {
      this.resetCompletionMotion();
      return null;
    }
    const key = this.completionKey(game);
    if (!this.completionMotion && game.viewMode === 'surface') {
      this.startPresenting(game, game.winAt || time);
    }
    const motion = this.completionMotion;
    if (!motion || motion.key !== key) {
      if (game.viewMode === 'surface') {
        this.startPresenting(game, game.winAt || time);
        return this.completionPose(game, time);
      }
      this.resetCompletionMotion();
      return null;
    }
    const elapsed = Math.max(0, time - motion.startedAt);
    if (motion.phase === 'returning') {
      const progress = clamp01(elapsed / motion.duration);
      if (progress >= 1) {
        this.resetCompletionMotion();
        return null;
      }
      return {
        draw: true,
        morph: 1 - GameGlobal.TopologyMorph.smooth(progress),
        scale: 1,
        settled: false,
      };
    }
    const progress = clamp01((elapsed - 80) / 2550);
    if (elapsed >= motion.duration) {
      motion.settled = true;
    }
    const scale = 1
      + Math.sin(progress * Math.PI * 2.35) * Math.pow(1 - progress, 1.85) * 0.048;
    return {
      draw: true,
      morph: GameGlobal.TopologyMorph.spring(progress),
      scale,
      settled: motion.settled,
    };
  }

  canToggleDimension(game, time) {
    if (!game || !game.completionAvailable) {
      return false;
    }
    if (game.viewMode === 'surface') {
      const pose = this.completionPose(game, time);
      return Boolean(pose && pose.settled);
    }
    return !this.completionMotion;
  }

  canDragSurface(game, time) {
    const pose = this.completionPose(game, time);
    return Boolean(game && game.viewMode === 'surface' && pose && pose.settled);
  }

  beginSurfaceDrag(time) {
    this.surfaceVelocity = { x: 0, y: 0 };
    this.surfaceAutoResumeAt = Infinity;
    this.surfaceDragAt = time;
  }

  dragSurface(deltaX, deltaY, deltaTime) {
    const yaw = deltaX * 0.009;
    const pitch = deltaY * 0.009;
    const elapsed = Math.max(8, Math.min(40, deltaTime || 16.67));
    this.surfaceRotation.y += yaw;
    this.surfaceRotation.x += pitch;
    this.surfaceVelocity.y = yaw / elapsed;
    this.surfaceVelocity.x = pitch / elapsed;
    this.surfaceElastic.velocityY += yaw * 0.18;
    this.surfaceElastic.velocityX += pitch * 0.18;
  }

  endSurfaceDrag(time) {
    this.surfaceAutoResumeAt = time + 1500;
  }

  updateSurfaceMotion(game, time, delta, dragging) {
    time = this.gameTime(time);
    const hadMotion = Boolean(this.completionMotion);
    const pose = this.completionPose(game, time);
    if (!pose) {
      return hadMotion;
    }
    if (!pose.settled) {
      return true;
    }
    const frameDelta = Math.max(1, Math.min(67, delta || 16.67));
    const frameScale = Math.max(0.25, Math.min(2, frameDelta / 16.67));
    const friction = Math.pow(0.925, frameScale);
    if (!dragging) {
      this.surfaceRotation.x += this.surfaceVelocity.x * frameDelta;
      this.surfaceRotation.y += this.surfaceVelocity.y * frameDelta;
      this.surfaceVelocity.x *= friction;
      this.surfaceVelocity.y *= friction;
      if (time >= this.surfaceAutoResumeAt) {
        this.surfaceRotation.y += 0.00016 * frameDelta;
      }
    }
    const targetX = Math.max(-0.14, Math.min(0.14, this.surfaceVelocity.x * 20));
    const targetY = Math.max(-0.15, Math.min(0.15, this.surfaceVelocity.y * 19));
    this.surfaceElastic.velocityX += (targetX - this.surfaceElastic.x) * 0.16 * frameScale;
    this.surfaceElastic.velocityY += (targetY - this.surfaceElastic.y) * 0.16 * frameScale;
    const damping = Math.pow(0.78, frameScale);
    this.surfaceElastic.velocityX *= damping;
    this.surfaceElastic.velocityY *= damping;
    this.surfaceElastic.x += this.surfaceElastic.velocityX * frameScale;
    this.surfaceElastic.y += this.surfaceElastic.velocityY * frameScale;
    return true;
  }

  surfaceAnimationDelay(game, time) {
    const pose = this.completionPose(game, time);
    if (!pose || !pose.settled) {
      return 16;
    }
    const moving = Math.abs(this.surfaceVelocity.x) > 0.00008
      || Math.abs(this.surfaceVelocity.y) > 0.00008
      || Math.abs(this.surfaceElastic.velocityX) > 0.00008
      || Math.abs(this.surfaceElastic.velocityY) > 0.00008;
    return moving ? 33 : 66;
  }

  needsSurfaceFrames(game, time) {
    const pose = this.completionPose(game, time);
    return Boolean(pose && (pose.draw || !pose.settled));
  }

  render(time, interaction = {}) {
    const ctx = this.context;
    const { width, height } = this.metrics;
    this.hits = [];
    this.homeRects = {};
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(time);
    const state = this.controller.getState();
    if (state.scene === 'game' && state.game) {
      this.drawGame(state, time, interaction);
    } else {
      this.drawHome(state, time);
    }
    if (this.settingsOpen || (this.sheetMotion && !this.sheetMotion.opening)) {
      this.drawSettings(state, time, interaction);
    }
    this.drawTransition(time);
  }

  drawBackground(time) {
    const ctx = this.context;
    const { width, height } = this.metrics;
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, '#f6f3ec');
    base.addColorStop(0.56, COLORS.paper);
    base.addColorStop(1, '#ece6db');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const teal = ctx.createRadialGradient(width * 0.9, height * 0.34, 0, width * 0.9, height * 0.34, width * 0.52);
    teal.addColorStop(0, 'rgba(69,154,139,0.11)');
    teal.addColorStop(1, 'rgba(69,154,139,0)');
    ctx.fillStyle = teal;
    ctx.fillRect(0, 0, width, height);
    const gold = ctx.createRadialGradient(width * 0.08, height * 0.78, 0, width * 0.08, height * 0.78, width * 0.58);
    gold.addColorStop(0, 'rgba(205,158,88,0.1)');
    gold.addColorStop(1, 'rgba(205,158,88,0)');
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.018;
    ctx.fillStyle = COLORS.ink;
    for (let index = 0; index < 58; index += 1) {
      const x = (Math.sin(index * 71.23) * 0.5 + 0.5) * width;
      const y = (Math.sin(index * 43.77 + time * 0.00001) * 0.5 + 0.5) * height;
      ctx.fillRect(x, y, 0.7, 0.7);
    }
    ctx.restore();
  }

  drawHome(state, time) {
    const ctx = this.context;
    const { height, topInset, bottomInset } = this.metrics;
    const compact = height <= 760;
    const content = this.contentBounds(520, 20);
    const contentWidth = content.width;
    const contentLeft = content.x;
    const headerY = topInset + (compact ? -5 : 0);
    const iconColumn = compact
      ? Math.min(156, Math.max(122, this.metrics.width * 0.38))
      : Math.min(190, Math.max(146, this.metrics.width * 0.43));
    const heroHeight = compact
      ? Math.max(112, iconColumn)
      : Math.max(142, iconColumn + 13);
    const breath = (Math.sin(time / 5200 * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    const iconScale = lerp(1.09, 1.125, breath);
    const iconSize = iconColumn * iconScale;
    const iconCenterX = contentLeft + contentWidth - iconColumn / 2;
    const iconCenterY = headerY + (heroHeight - 13) / 2 - breath * 3;
    if (this.host.brandIcon) {
      ctx.save();
      ctx.translate(iconCenterX, iconCenterY);
      ctx.rotate(lerp(-5, -3.5, breath) * Math.PI / 180);
      ctx.shadowColor = 'rgba(33,48,44,0.13)';
      ctx.shadowBlur = effectPixels(ctx, 18);
      ctx.shadowOffsetY = effectPixels(ctx, 14);
      ctx.drawImage(this.host.brandIcon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      ctx.restore();
    } else {
      const fallbackRect = rect(
        iconCenterX - iconColumn / 2,
        iconCenterY - iconColumn / 2,
        iconColumn,
        iconColumn,
      );
      glassPanel(ctx, fallbackRect, {
        variant: 'card',
        radius: Math.min(38, iconSize * 0.24),
      });
      if (state.levels[0]) {
        GameGlobal.TopologyBoardArt.drawTopologyGlyph(
          ctx,
          state.levels[0].topology,
          fallbackRect,
          { locked: false },
        );
      }
    }

    const titleSize = compact
      ? Math.max(37, Math.min(48, this.metrics.width * 0.105))
      : Math.max(43, Math.min(57, this.metrics.width * 0.12));
    const titleLine = titleSize * 0.94;
    const titleX = contentLeft + 2;
    const titleFirstY = headerY + (compact ? 18 : 25.5) + titleLine / 2;
    text(ctx, '拓扑', titleX, titleFirstY, {
      font: this.host.font(600, titleSize),
      color: COLORS.ink,
      letterSpacing: -titleSize * 0.065,
    });
    text(ctx, '五子棋', titleX, titleFirstY + titleLine, {
      font: this.host.font(600, titleSize),
      color: COLORS.ink,
      letterSpacing: -titleSize * 0.065,
    });
    text(ctx, '边界之外，也能连成一线。', titleX, headerY + heroHeight - (compact ? 25 : 47), {
      font: this.host.font(400, compact ? 10 : 12),
      color: COLORS.muted,
      letterSpacing: (compact ? 10 : 12) * 0.055,
    });

    const completed = state.preferences.completed.filter(Boolean).length;
    const journeyY = headerY + heroHeight + (compact ? 9 : 14);
    text(ctx, '旅程', contentLeft + 2, journeyY, {
      font: this.host.font(600, compact ? 10 : 12),
      color: COLORS.muted,
      letterSpacing: (compact ? 10 : 12) * 0.12,
    });
    text(ctx, `${completed} / ${state.levels.length}`, contentLeft + contentWidth - 2, journeyY, {
      font: this.host.font(600, compact ? 10 : 12),
      color: COLORS.ink,
      align: 'right',
      letterSpacing: (compact ? 10 : 12) * 0.03,
    });

    const cardTop = headerY + heroHeight + (compact ? 28 : 36);
    const gap = compact ? 6 : 9;
    const columns = 2;
    const cardWidth = (contentWidth - gap) / columns;
    const available = height - cardTop - bottomInset;
    const cardHeight = Math.max(66, (available - gap * 3) / 4);
    state.levels.forEach((level, index) => {
      const final = index === state.levels.length - 1;
      const row = final ? 3 : Math.floor(index / 2);
      const column = final ? 0 : index % 2;
      const cardRect = rect(
        contentLeft + column * (cardWidth + gap),
        cardTop + row * (cardHeight + gap),
        final ? contentWidth : cardWidth,
        cardHeight,
      );
      this.homeRects[index] = copyRect(cardRect);
      const sharedTarget = Boolean(
        this.transition
        && this.transition.kind === 'exit'
        && this.transition.levelIndex === index
      );
      const targetAlpha = sharedTarget ? this.transitionTargetAlpha('exit', time) : 1;
      if (targetAlpha > 0) {
        ctx.save();
        ctx.globalAlpha *= targetAlpha;
        ctx.translate(this.levelShakeOffset(index, time), 0);
        this.drawLevelCard(ctx, cardRect, level, index, state, time);
        ctx.restore();
      }
    });
  }

  drawLevelCard(ctx, cardRect, level, index, state, time) {
    const locked = index > state.preferences.unlocked;
    const completed = Boolean(state.preferences.completed[index]);
    glassPanel(ctx, cardRect, {
      variant: 'card',
      radius: 21,
      pressed: this.pressedKey === `level:${index}`,
    });
    const revealed = index === 0 || completed;
    const compact = this.metrics.height <= 760;
    const final = index === state.levels.length - 1;
    // Host chrome can shorten the gallery even on a tall logical viewport. In
    // that case the full-height artwork slot no longer fits above the two text
    // rows. Keep the card shell and typography unchanged, but bound the artwork
    // so its visible pixels and shadow retain a deliberate gap above the type.
    const denseArtwork = compact || (!final && cardRect.height < 122);
    const padding = compact
      ? 8
      : (denseArtwork ? 10 : Math.min(14, Math.max(10, this.metrics.height * 0.017)));
    let glyphRect;
    let typeX;
    let typeY;
    let nameX;
    let nameY;
    if (final) {
      const horizontalPadding = compact
        ? Math.min(48, Math.max(38, this.metrics.width * 0.11))
        : Math.min(64, Math.max(42, this.metrics.width * 0.13));
      const innerWidth = cardRect.width - horizontalPadding * 2;
      const leftColumn = innerWidth * 0.46;
      const glyphWidth = compact ? 92 : Math.min(124, Math.max(98, this.metrics.width * 0.28));
      const glyphHeight = compact ? 62 : Math.min(94, Math.max(72, this.metrics.height * 0.11));
      glyphRect = rect(
        cardRect.x + horizontalPadding + (leftColumn - glyphWidth) / 2,
        cardRect.y + (cardRect.height - glyphHeight) / 2,
        glyphWidth,
        glyphHeight,
      );
      typeX = cardRect.x + horizontalPadding + leftColumn + (innerWidth - leftColumn) / 2;
      nameX = typeX;
      typeY = cardRect.y + padding + (cardRect.height - padding * 2) / 2 - 9.5;
      nameY = cardRect.y + padding + (cardRect.height - padding * 2) / 2 + 9.2;
    } else {
      const glyphWidth = compact
        ? 68
        : (denseArtwork ? 82 : Math.min(88, Math.max(70, this.metrics.width * 0.21)));
      const glyphHeight = compact
        ? 46
        : (denseArtwork
          ? (revealed ? 66 : 60)
          : Math.min(70, Math.max(48, this.metrics.height * 0.082)));
      const glyphTop = cardRect.y + (denseArtwork && !compact ? (revealed ? 3 : 4) : padding);
      glyphRect = rect(
        cardRect.x + (cardRect.width - glyphWidth) / 2,
        glyphTop,
        glyphWidth,
        glyphHeight,
      );
      typeX = cardRect.x + cardRect.width / 2;
      nameX = typeX;
      typeY = cardRect.y + cardRect.height - padding - 18.4 - 3 - 4.7;
      nameY = cardRect.y + cardRect.height - padding - 9.2;
    }

    ctx.save();
    ctx.globalAlpha *= locked ? (revealed ? 1 : 0.68) : 1;
    if (revealed) {
      if (!drawImageContain(ctx, this.topologyImage(level.topology, compact), glyphRect)) {
        GameGlobal.TopologyBoardArt.drawTopologyGlyph(ctx, level.topology, glyphRect, { locked: false });
      }
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(28,40,36,0.18)';
      ctx.shadowBlur = effectPixels(ctx, 14);
      ctx.shadowOffsetY = effectPixels(ctx, 7);
      if (!drawImageContain(ctx, this.silhouetteImage(level.topology, compact), glyphRect)) {
        GameGlobal.TopologyBoardArt.drawTopologySilhouette(ctx, level.topology, glyphRect);
      }
      ctx.restore();
      const shadowRect = rect(glyphRect.x + (glyphRect.width - 48) / 2, glyphRect.y + glyphRect.height - 11, 48, 7);
      if (this.host.mysteryGroundShadow) {
        ctx.drawImage(
          this.host.mysteryGroundShadow,
          shadowRect.x - 9,
          shadowRect.y - 9,
          66,
          25,
        );
      } else {
        ctx.save();
        try {
          ctx.filter = `blur(${effectPixels(ctx, 3)}px)`;
        } catch (error) {
          // The pre-rendered asset is the normal path; this remains readable
          // while assets are still warming up on older Canvas runtimes.
        }
        ctx.fillStyle = 'rgba(30,39,35,0.16)';
        ctx.beginPath();
        ctx.ellipse(
          shadowRect.x + shadowRect.width / 2,
          shadowRect.y + shadowRect.height / 2,
          shadowRect.width / 2,
          shadowRect.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(glyphRect.x + glyphRect.width / 2, glyphRect.y + glyphRect.height / 2 - 1);
      ctx.rotate(4 * Math.PI / 180);
      ctx.shadowColor = 'rgba(4,10,8,0.28)';
      ctx.shadowBlur = effectPixels(ctx, 5);
      ctx.shadowOffsetY = effectPixels(ctx, 1);
      text(ctx, '?', 0, 0, {
        font: '500 28px Georgia, serif',
        color: 'rgba(247,244,235,0.92)',
        align: 'center',
      });
      ctx.restore();
    }
    ctx.restore();

    text(ctx, level.typeName, typeX, typeY, {
      font: this.host.font(400, compact ? 8 : 9),
      color: COLORS.muted,
      align: 'center',
      alpha: locked ? 0.48 : 1,
      letterSpacing: (compact ? 8 : 9) * 0.16,
    });
    text(ctx, level.name, nameX, nameY, {
      font: this.host.font(700, compact ? 14 : 16),
      color: COLORS.ink,
      align: 'center',
      alpha: locked ? 0.48 : 1,
      letterSpacing: (compact ? 14 : 16) * 0.09,
    });
    this.register(`level:${index}`, cardRect, { action: 'level', index, locked });
  }

  drawGame(state, time, interaction) {
    const ctx = this.context;
    const game = state.game;
    const gameTime = this.gameTime(time);
    const { height, topInset, bottomInset } = this.metrics;
    const compact = height <= 760;
    const content = this.contentBounds(560, compact ? 18 : 16);
    const contentCenter = content.x + content.width / 2;
    const screenTop = topInset + (compact ? 0 : 1);
    const topbarHeight = compact ? 44 : 52;
    const matchHeight = compact ? 44 : 56;
    const rowHeight = compact ? 44 : 52;
    const verticalGap = 10;
    const topButton = 42;
    const buttonY = screenTop + (topbarHeight - topButton) / 2;
    const backRect = rect(content.x, buttonY, topButton, topButton);
    const settingsRect = rect(content.x + content.width - topButton, buttonY, topButton, topButton);
    glassPanel(ctx, backRect, { variant: 'icon', radius: 21, pressed: this.pressedKey === 'back' });
    this.drawAssetIcon(ctx, 'back', backRect.x + 21, backRect.y + 21, 21);
    this.register('back', backRect, { action: 'back' });
    glassPanel(ctx, settingsRect, { variant: 'icon', radius: 21, pressed: this.pressedKey === 'settings' });
    this.drawAssetIcon(ctx, 'settings', settingsRect.x + 21, settingsRect.y + 21, 21);
    this.register('settings', settingsRect, { action: 'settings' });

    text(ctx, game.level.name, contentCenter, screenTop + topbarHeight / 2, {
      font: this.host.font(600, 19),
      color: COLORS.ink,
      align: 'center',
      letterSpacing: 19 * 0.08,
    });

    const matchRect = rect(content.x + 4, screenTop + topbarHeight + verticalGap, content.width - 8, matchHeight);
    const statusText = this.controller.statusText();
    ctx.save();
    ctx.font = this.host.font(600, 11);
    const statusWidth = Math.max(84, ctx.measureText(statusText).width + 24);
    ctx.restore();
    const statusRect = rect(contentCenter - statusWidth / 2, matchRect.y + (matchHeight - 32) / 2, statusWidth, 32);
    pill(ctx, statusRect, statusText, {
      font: this.host.font(600, 11),
      color: COLORS.ink,
      letterSpacing: 11 * 0.05,
    });

    const humanActive = game.status === 'playing' && game.turn === GameGlobal.TopologyGomoku.HUMAN;
    const aiActive = game.status === 'playing' && game.turn === GameGlobal.TopologyGomoku.AI;
    const chipY = matchRect.y + matchHeight / 2;
    this.drawMiniStone(matchRect.x + 9.5, chipY + (humanActive ? -1 : 0), 19, false);
    text(ctx, '你', matchRect.x + 26, chipY + (humanActive ? -1 : 0), {
      font: this.host.font(600, 12),
      color: humanActive ? COLORS.ink : COLORS.muted,
    });
    const tutorialHidden = Boolean(game.level.tutorial || (game.lesson && game.lesson.active));
    if (!tutorialHidden) {
      const difficulty = GameGlobal.TopologyGameContent.DIFFICULTIES[state.preferences.difficulty];
      const difficultyLabel = difficulty ? difficulty.label : '';
      const stoneX = matchRect.x + matchRect.width - 9.5;
      this.drawMiniStone(stoneX, chipY + (aiActive ? -1 : 0), 19, true);
      text(ctx, difficultyLabel, stoneX - 16.5, chipY + (aiActive ? -1 : 0), {
        font: this.host.font(600, 12),
        color: aiActive ? COLORS.ink : COLORS.muted,
        align: 'right',
      });
    }

    const actionDeckHeight = rowHeight * 2 + verticalGap;
    const boardTop = matchRect.y + matchHeight + verticalGap;
    const availableBoardHeight = Math.max(
      1,
      height - bottomInset - boardTop - verticalGap - actionDeckHeight,
    );
    const boardSize = Math.min(560, content.width, availableBoardHeight);
    this.boardRect = rect(
      content.x + (content.width - boardSize) / 2,
      boardTop,
      boardSize,
      boardSize,
    );
    const sharedTarget = Boolean(this.transition && this.transition.kind === 'enter');
    const targetAlpha = sharedTarget ? this.transitionTargetAlpha('enter', time) : 1;
    this.boardLayout = GameGlobal.TopologyBoardArt.computeLayout(
      this.boardRect.width,
      this.boardRect.height,
      game.rules,
      { minimumMargin: 34, marginRatio: 0.115 },
    );
    if (targetAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= targetAlpha;
      glassPanel(ctx, this.boardRect, {
        variant: 'board',
        radius: 29,
      });
      ctx.translate(this.boardRect.x, this.boardRect.y);
      const completionPose = this.completionPose(game, gameTime);
      if (completionPose && completionPose.draw) {
        const completionGame = gameForReviewFrame(game);
        GameGlobal.TopologyBoardArt.drawCompletion(ctx, {
          game: completionGame,
          layout: this.boardLayout,
          time: gameTime,
          rotation: this.surfaceRotation,
          view: this.completionViewFor(game),
          presentation: this.presentationFor(game),
          morph: completionPose.morph,
          scale: completionPose.scale,
          wobbleX: this.surfaceElastic.x,
          wobbleY: this.surfaceElastic.y,
        });
      } else {
        const boardInteraction = interaction.board
          ? {
              pressedCell: interaction.board.cell,
              pressedAt: interaction.board.startedAt,
              position: interaction.board.position
                ? {
                    x: interaction.board.position.x - this.boardRect.x,
                    y: interaction.board.position.y - this.boardRect.y,
                  }
                : null,
            }
          : null;
        GameGlobal.TopologyBoardArt.drawBoard(ctx, {
          game: gameForReviewFrame(game),
          layout: this.boardLayout,
          time: gameTime,
          preferences: state.preferences,
          interaction: boardInteraction,
          fontFamily: this.host.fonts[700] ? `'${this.host.fonts[700]}'` : 'serif',
        });
      }
      ctx.restore();
    }
    if (!sharedTarget) {
      this.register('board', this.boardRect, { action: 'board' });
    }
    this.drawGameActions(state, gameTime, this.boardRect.y + this.boardRect.height + verticalGap, rowHeight);
  }

  drawMiniStone(x, y, size, light) {
    const ctx = this.context;
    const radius = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(
      x - radius * 0.28,
      y - radius * 0.36,
      radius * 0.08,
      x,
      y,
      radius,
    );
    if (light) {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.48, '#f8f4e9');
      gradient.addColorStop(1, '#ddd7cb');
      ctx.strokeStyle = 'rgba(86,82,75,0.28)';
      ctx.shadowColor = 'rgba(61,55,47,0.12)';
    } else {
      gradient.addColorStop(0, '#5e6b67');
      gradient.addColorStop(0.35, '#24322e');
      gradient.addColorStop(1, '#14201d');
      ctx.strokeStyle = 'transparent';
      ctx.shadowColor = 'rgba(24,31,29,0.22)';
    }
    ctx.shadowBlur = effectPixels(ctx, 6);
    ctx.shadowOffsetY = effectPixels(ctx, 3);
    ctx.fillStyle = gradient;
    ctx.fill();
    if (light) {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGameActions(state, time, topY, rowHeight) {
    const game = state.game;
    const compact = this.metrics.height <= 760;
    const content = this.contentBounds(560, compact ? 18 : 16);
    const rowGap = 10;
    const contentWidth = content.width;
    if (game.status !== 'ended') {
      const actions = [
        {
          key: 'undo',
          label: '悔棋',
          icon: 'undo',
          disabled: !game.moves.length || game.status !== 'playing',
        },
        game.levelIndex > 0 ? {
          key: 'boundary',
          label: '边界演示',
          icon: 'boundary',
          tone: 'spatial',
          disabled: game.status !== 'playing'
            || Boolean(game.lesson && game.lesson.active)
            || Boolean(game.demo && game.demo.active),
        } : null,
        { key: 'restart', label: '重来', icon: 'restart', disabled: false },
      ];
      this.drawActionRow(actions, content.x, topY + rowHeight + rowGap, contentWidth, rowHeight, 8);
      return;
    }

    if (game.autoAdvancePending) {
      return;
    }

    const reviewing = Boolean(game.review);
    const completionReady = !game.completionAvailable || this.canToggleDimension(game, time);
    const firstLevel = game.levelIndex === 0;
    if (firstLevel) {
      const passed = game.outcome === 'win' || game.outcome === 'draw';
      const tutorialActions = [
        { key: 'journey', label: '旅程', icon: 'journey', disabled: !completionReady },
        null,
        {
          key: 'next-level',
          label: '下一关',
          icon: 'next-level',
          disabled: !completionReady || !passed || game.levelIndex >= state.levels.length - 1,
          tone: 'teal',
        },
      ];
      this.drawActionRow(
        tutorialActions,
        content.x,
        topY + rowHeight + rowGap,
        contentWidth,
        rowHeight,
        8,
      );
      return;
    }
    const firstRow = [
      {
        key: 'replay-toggle',
        label: reviewing ? '定局' : '复盘',
        icon: reviewing ? 'check' : 'review',
        tone: 'teal',
        disabled: !completionReady,
      },
      {
        key: 'previous',
        label: '上一步',
        icon: 'previous',
        disabled: !completionReady || !reviewing || game.review.step <= 0,
      },
      {
        key: 'next-step',
        label: '下一步',
        icon: 'next',
        disabled: !completionReady || !reviewing || game.review.step >= game.review.total,
      },
      {
        key: 'dimension',
        label: game.viewMode === 'surface' ? '二维' : '三维',
        icon: game.viewMode === 'surface' ? 'board' : 'surface',
        tone: 'spatial',
        disabled: !this.canToggleDimension(game, time),
      },
    ];
    this.drawActionRow(firstRow, content.x, topY, contentWidth, rowHeight, 4);
    const passed = game.outcome === 'win' || game.outcome === 'draw';
    const secondRow = [
      { key: 'journey', label: '旅程', icon: 'journey', disabled: !completionReady },
      { key: 'restart', label: '再来', icon: 'restart', disabled: !completionReady },
      {
        key: 'next-level',
        label: '下一关',
        icon: 'next',
        disabled: !completionReady || !passed || game.levelIndex >= state.levels.length - 1,
        tone: 'teal',
      },
    ];
    secondRow[2].icon = 'next-level';
    this.drawActionRow(secondRow, content.x, topY + rowHeight + rowGap, contentWidth, rowHeight, 8);
  }

  drawActionRow(actions, x, y, width, height, gap) {
    const ctx = this.context;
    const actionWidth = (width - gap * (actions.length - 1)) / actions.length;
    actions.forEach((action, index) => {
      if (!action) {
        return;
      }
      const actionRect = rect(x + index * (actionWidth + gap), y, actionWidth, height);
      const pressed = this.pressedKey === action.key;
      const toneColor = action.tone === 'teal'
        ? COLORS.teal
        : (action.tone === 'spatial' ? COLORS.spatial : COLORS.muted);
      ctx.save();
      ctx.globalAlpha *= action.disabled ? 0.28 : 1;
      if (pressed) {
        fillRoundedRect(ctx, actionRect, 15, 'rgba(255,255,255,0.18)');
        ctx.translate(actionRect.x + actionRect.width / 2, actionRect.y + actionRect.height / 2 - 1);
        ctx.scale(1.12, 1.12);
        ctx.translate(-(actionRect.x + actionRect.width / 2), -(actionRect.y + actionRect.height / 2 - 1));
      }
      const iconY = actionRect.y + (height <= 44 ? 13.5 : 16);
      const labelY = actionRect.y + (height <= 44 ? 32 : 36.5);
      this.drawAssetIcon(ctx, action.icon, actionRect.x + actionRect.width / 2, iconY, 20, toneColor);
      text(ctx, action.label, actionRect.x + actionRect.width / 2, labelY, {
        font: this.host.font(400, 9),
        color: pressed ? COLORS.ink : toneColor,
        align: 'center',
      });
      ctx.restore();
      this.register(action.key, actionRect, { action: action.key }, action.disabled);
    });
  }

  drawSettings(state, time, interaction) {
    const ctx = this.context;
    const { width, height, bottomInset, safeArea } = this.metrics;
    let progress = 1;
    let dragOffset = 0;
    if (this.sheetMotion) {
      if (this.sheetMotion.dragging) {
        dragOffset = this.sheetMotion.dragOffset || 0;
      } else {
        const elapsed = time - this.sheetMotion.startedAt;
        const normalized = clamp01(elapsed / this.sheetMotion.duration);
        const eased = cubicBezierProgress(normalized, 0.37, 0, 0.63, 1);
        progress = this.sheetMotion.opening
          ? (this.sheetMotion.settling ? 1 : eased)
          : 1 - eased;
        dragOffset = (this.sheetMotion.fromOffset || 0) * (1 - eased);
        if (!this.sheetMotion.opening && normalized >= 1) {
          this.settingsOpen = false;
          this.sheetMotion = null;
          this.sheetRect = null;
          return;
        }
        if (this.sheetMotion.opening && normalized >= 1) {
          this.sheetMotion = null;
        }
      }
    }
    const safeLeft = Math.max(12, Number(safeArea && safeArea.left) || 0);
    const safeRight = Math.max(12, width - (Number(safeArea && safeArea.right) || width));
    const sheetWidth = Math.min(520, width - safeLeft - safeRight);
    const sheetX = safeLeft + (width - safeLeft - safeRight - sheetWidth) / 2;
    const sheetHeight = Math.min(382, Math.max(344, height - bottomInset - 20));
    const visibleProgress = clamp01(progress);
    const dragCompression = clamp01(dragOffset / Math.max(180, sheetHeight * 0.54));
    const scrimAlpha = visibleProgress * (1 - dragCompression * 0.68);
    this.drawCurrentCanvasBlur(2.5, null, 0, { alpha: scrimAlpha });
    ctx.save();
    ctx.globalAlpha = scrimAlpha;
    ctx.fillStyle = 'rgba(23,35,31,0.14)';
    ctx.fillRect(0, 0, width, height);
    const scrimGlow = ctx.createRadialGradient(width / 2, height * 0.78, 0, width / 2, height * 0.78, width * 0.58);
    scrimGlow.addColorStop(0, 'rgba(174,211,197,0.08)');
    scrimGlow.addColorStop(1, 'rgba(174,211,197,0)');
    ctx.fillStyle = scrimGlow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    this.register('settings-scrim', rect(0, 0, width, height), { action: 'close-settings' });

    const settledY = height - bottomInset - 10 - sheetHeight;
    const hiddenY = settledY + sheetHeight + 34;
    const sheetY = lerp(hiddenY, settledY, visibleProgress) + dragOffset;
    this.sheetRect = rect(sheetX, sheetY, sheetWidth, sheetHeight);
    const scaleX = lerp(0.78, 1, visibleProgress) * (1 - dragCompression * 0.1);
    const scaleY = lerp(0.93, 1, visibleProgress) * (1 - dragCompression * 0.035);
    ctx.save();
    ctx.translate(this.sheetRect.x + this.sheetRect.width / 2, this.sheetRect.y + this.sheetRect.height);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-(this.sheetRect.x + this.sheetRect.width / 2), -(this.sheetRect.y + this.sheetRect.height));
    const returningFromDrag = Boolean(this.sheetMotion
      && (this.sheetMotion.dragging || this.sheetMotion.settling));
    const materialCollapse = returningFromDrag
      ? dragCompression
      : Math.max(1 - visibleProgress, dragCompression);
    const materialTopInset = this.sheetRect.width
      * materialCollapse
      * (returningFromDrag ? 0.045 : 0.1);
    const materialBottomInset = this.sheetRect.width
      * materialCollapse
      * (returningFromDrag ? 0.15 : 0.3);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.sheetRect.x + materialTopInset, this.sheetRect.y);
    ctx.lineTo(this.sheetRect.x + this.sheetRect.width - materialTopInset, this.sheetRect.y);
    ctx.lineTo(
      this.sheetRect.x + this.sheetRect.width - materialBottomInset,
      this.sheetRect.y + this.sheetRect.height,
    );
    ctx.lineTo(this.sheetRect.x + materialBottomInset, this.sheetRect.y + this.sheetRect.height);
    ctx.closePath();
    ctx.clip();
    const sheetBlurRect = rect(
      this.sheetRect.x + 1.5,
      this.sheetRect.y + 1.5,
      this.sheetRect.width - 3,
      this.sheetRect.height - 3,
    );
    this.drawCurrentCanvasBlur(5, sheetBlurRect, 32.5, {
      saturation: 1.45,
      brightness: 1.035,
      contrast: 0.98,
    });
    glassPanel(ctx, this.sheetRect, {
      variant: 'sheet',
      radius: 34,
    });
    ctx.restore();
    // The sheet itself sits above the scrim. Registering a neutral hit target
    // keeps taps in its empty areas from dismissing it, while later controls
    // continue to win reverse-order hit testing.
    this.register('settings-sheet', this.sheetRect, { action: 'none' });
    const contentX = this.sheetRect.x + 20;
    const contentWidth = this.sheetRect.width - 40;
    const softCollapse = Math.max(1 - visibleProgress, dragCompression);
    const softOpacity = (0.2 + visibleProgress * 0.8) * (1 - dragCompression * 0.8);
    const softTranslate = softCollapse * 22;
    const softScaleY = 1 - softCollapse * 0.06;
    const drawSoftLayer = (bounds, collapse, draw) => {
      const layerScale = 1 - softCollapse * collapse;
      ctx.save();
      ctx.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height);
      ctx.scale(layerScale, 1);
      ctx.translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height));
      draw();
      ctx.restore();
    };
    ctx.save();
    ctx.globalAlpha *= softOpacity;
    ctx.translate(0, softTranslate);
    ctx.translate(this.sheetRect.x + this.sheetRect.width / 2, this.sheetRect.y + this.sheetRect.height);
    ctx.scale(1, softScaleY);
    ctx.translate(-(this.sheetRect.x + this.sheetRect.width / 2), -(this.sheetRect.y + this.sheetRect.height));
    const handleRect = rect(this.sheetRect.x + this.sheetRect.width / 2 - 17, sheetY + 11, 34, 4);
    drawSoftLayer(handleRect, 0.22, () => {
      const handleGradient = ctx.createLinearGradient(handleRect.x, 0, handleRect.x + handleRect.width, 0);
      handleGradient.addColorStop(0, 'rgba(33,48,44,0.1)');
      handleGradient.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      handleGradient.addColorStop(1, 'rgba(33,48,44,0.14)');
      fillRoundedRect(ctx, handleRect, 2, handleGradient);
    });
    this.register('sheet-handle', rect(this.sheetRect.x, sheetY, this.sheetRect.width, 92), { action: 'sheet-handle' });

    const headY = sheetY + 21;
    const closeRect = rect(contentX + contentWidth - 36, headY + 7, 36, 36);
    drawSoftLayer(rect(contentX, headY, contentWidth, 43), 0.26, () => {
      text(ctx, '设置', contentX, headY + 25, {
        font: this.host.font(600, 21),
        color: COLORS.ink,
        letterSpacing: 21 * 0.07,
      });
      glassPanel(ctx, closeRect, {
        variant: 'icon',
        radius: 18,
        pressed: this.pressedKey === 'settings-close',
      });
      text(ctx, '×', closeRect.x + 18, closeRect.y + 17, {
        font: this.host.font(400, 24),
        color: COLORS.muted,
        align: 'center',
      });
    });
    this.register('settings-close', closeRect, { action: 'close-settings' });

    const difficultyRowY = headY + 50;
    this.difficultyRect = rect(contentX, difficultyRowY + 44, contentWidth, 46);
    const order = GameGlobal.TopologyGameContent.DIFFICULTY_ORDER;
    const selectedIndex = Math.max(0, order.indexOf(state.preferences.difficulty));
    const difficultyProgress = interaction.mode === 'difficulty'
      && interaction.previewDifficultyProgress !== undefined
      ? interaction.previewDifficultyProgress
      : this.controlProgress('difficulty', null, selectedIndex, time);
    drawSoftLayer(rect(contentX, difficultyRowY, contentWidth, 90), 0.36, () => {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(contentX, difficultyRowY + 0.5);
      ctx.lineTo(contentX + contentWidth, difficultyRowY + 0.5);
      ctx.stroke();
      ctx.restore();
      text(ctx, '对手', contentX, difficultyRowY + 24.5, {
        font: this.host.font(600, 12),
        color: COLORS.ink,
        letterSpacing: 12 * 0.06,
      });
      glassPanel(ctx, this.difficultyRect, {
        variant: 'track',
        radius: 19,
      });
      const selected = Math.max(0, Math.min(2, Math.round(difficultyProgress)));
      const thumbRect = this.difficultyThumbRect(difficultyProgress);
      const thumbSettleScale = this.controlSettleScale('difficulty', null, time);
      ctx.save();
      if (interaction.mode === 'difficulty' && interaction.pressedMovable) {
        const energy = Math.min(1, Math.abs(interaction.controlFrameDeltaX || 0) / 18);
        const stretch = 1.24 + energy * 0.12;
        const lift = 1.62 + energy * 0.08;
        const anchor = clamp01(difficultyProgress / 2);
        ctx.translate(-thumbRect.width * (stretch - 1) * anchor * 0.6, 0);
        ctx.translate(thumbRect.x, thumbRect.y + thumbRect.height / 2);
        ctx.scale(stretch, lift);
        ctx.translate(-thumbRect.x, -(thumbRect.y + thumbRect.height / 2));
      } else if (thumbSettleScale.x !== 1 || thumbSettleScale.y !== 1) {
        ctx.translate(thumbRect.x + thumbRect.width / 2, thumbRect.y + thumbRect.height / 2);
        ctx.scale(thumbSettleScale.x, thumbSettleScale.y);
        ctx.translate(-(thumbRect.x + thumbRect.width / 2), -(thumbRect.y + thumbRect.height / 2));
      }
      glassPanel(ctx, thumbRect, {
        variant: 'thumb',
        radius: 15,
        pressed: interaction.mode === 'difficulty' && interaction.pressedMovable,
        explicitTransform: true,
      });
      ctx.restore();
      order.forEach((difficulty, index) => {
        const label = GameGlobal.TopologyGameContent.DIFFICULTIES[difficulty].label;
        const segmentRect = rect(
          this.difficultyRect.x + index * this.difficultyRect.width / 3,
          this.difficultyRect.y,
          this.difficultyRect.width / 3,
          this.difficultyRect.height,
        );
        text(ctx, label, segmentRect.x + segmentRect.width / 2, segmentRect.y + segmentRect.height / 2, {
          font: this.host.font(600, 11),
          color: index === selected ? COLORS.ink : COLORS.muted,
          align: 'center',
        });
        this.register(`difficulty:${index}`, segmentRect, { action: 'difficulty', index });
      });
    });

    drawSoftLayer(rect(contentX, difficultyRowY + 104, contentWidth, 65), 0.44, () => {
      this.drawSettingToggle('hints', '落点提示', state.preferences.hints, difficultyRowY + 104, interaction, time);
    });
    drawSoftLayer(rect(contentX, difficultyRowY + 169, contentWidth, 65), 0.52, () => {
      this.drawSettingToggle('sound', '声音', state.preferences.sound, difficultyRowY + 169, interaction, time);
    });

    const doneRect = rect(contentX, difficultyRowY + 241, contentWidth, 52);
    drawSoftLayer(doneRect, 0.6, () => {
      glassPanel(ctx, doneRect, {
        variant: 'dark',
        radius: 17,
        pressed: this.pressedKey === 'settings-done',
      });
      text(ctx, '完成', doneRect.x + doneRect.width / 2, doneRect.y + doneRect.height / 2, {
        font: this.host.font(700, 16),
        color: '#ffffff',
        align: 'center',
        letterSpacing: 16 * 0.12,
      });
    });
    this.register('settings-done', doneRect, { action: 'close-settings' });
    ctx.restore();
    ctx.restore();
  }

  drawSettingToggle(key, title, enabled, y, interaction, time) {
    const ctx = this.context;
    const x = this.sheetRect.x + 20;
    const width = this.sheetRect.width - 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + width, y + 0.5);
    ctx.stroke();
    ctx.restore();
    text(ctx, title, x, y + 32.5, {
      font: this.host.font(600, 13),
      color: COLORS.ink,
      letterSpacing: 13 * 0.06,
    });
    const switchRect = rect(x + width - 66, y + 16.5, 66, 32);
    this.switchRects[key] = switchRect;
    const previewProgress = interaction.mode === `switch:${key}`
      && interaction.previewSwitchProgress !== undefined
      ? interaction.previewSwitchProgress
      : this.controlProgress('switch', key, enabled ? 1 : 0, time);
    const enabledAmount = clamp01(previewProgress);
    glassPanel(ctx, switchRect, {
      variant: 'track',
      radius: 16,
      base: enabledAmount > 0.001
        ? `rgba(36,133,120,${0.1 + enabledAmount * 0.66})`
        : 'rgba(42,78,65,0.08)',
      tint: enabledAmount > 0.001
        ? `rgba(78,177,160,${0.1 + enabledAmount * 0.62})`
        : 'rgba(255,255,255,0.1)',
      bottom: enabledAmount > 0.001
        ? `rgba(36,133,120,${0.12 + enabledAmount * 0.64})`
        : 'rgba(42,78,65,0.08)',
      stroke: 'rgba(255,255,255,0.58)',
    });
    const knob = this.switchKnobRect(key, previewProgress);
    const knobSettleScale = this.controlSettleScale('switch', key, time);
    ctx.save();
    if (interaction.mode === `switch:${key}` && interaction.pressedMovable) {
      const stretch = 1.72;
      const lift = 1.5;
      const anchor = clamp01(previewProgress);
      ctx.translate(-knob.width * (stretch - 1) * anchor * 0.45, 0);
      ctx.translate(knob.x, knob.y + knob.height / 2);
      ctx.scale(stretch, lift);
      ctx.translate(-knob.x, -(knob.y + knob.height / 2));
    } else if (knobSettleScale.x !== 1 || knobSettleScale.y !== 1) {
      ctx.translate(knob.x + knob.width / 2, knob.y + knob.height / 2);
      ctx.scale(knobSettleScale.x, knobSettleScale.y);
      ctx.translate(-(knob.x + knob.width / 2), -(knob.y + knob.height / 2));
    }
    glassPanel(ctx, knob, {
      variant: 'thumb',
      radius: 13,
      pressed: interaction.mode === `switch:${key}` && interaction.pressedMovable,
      explicitTransform: true,
    });
    ctx.restore();
    this.register(
      `switch:${key}`,
      rect(switchRect.x - 8, switchRect.y - 6, switchRect.width + 16, switchRect.height + 12),
      { action: 'switch', key },
    );
  }

  drawTransition(time) {
    if (!this.transition) {
      return;
    }
    const transition = this.transition;
    if (!usableRect(transition.sourceRect)) {
      this.transition = null;
      return;
    }
    const progress = clamp01((time - transition.startedAt) / transition.duration);
    let target = null;
    if (transition.kind === 'enter') {
      target = this.boardRect;
    } else {
      target = this.homeRects[transition.levelIndex];
    }
    if (!usableRect(target)) {
      this.transition = null;
      return;
    }
    const amount = transition.kind === 'enter' ? springOut(progress) : softOut(progress);
    const from = transition.sourceRect;
    const to = target;
    const overlay = interpolateRect(from, to, amount);
    const fromRadius = transition.kind === 'enter' ? 21 : 29;
    const toRadius = transition.kind === 'enter' ? 29 : 21;
    const overlayRadius = lerp(fromRadius, toRadius, amount);
    const ctx = this.context;
    if (transition.snapshot) {
      const dpr = transition.snapshotDpr || 1;
      ctx.save();
      ctx.globalAlpha = 1 - softOut(progress);
      drawSnapshotWithoutRect(
        ctx,
        transition.snapshot,
        from,
        dpr,
        this.metrics.width,
        this.metrics.height,
      );
      ctx.restore();

      ctx.save();
      roundedRectPath(ctx, overlay.x, overlay.y, overlay.width, overlay.height, overlayRadius);
      ctx.clip();
      ctx.globalAlpha = 1 - this.transitionTargetAlpha(transition.kind, time);
      const contentRect = aspectFitRect(from, overlay);
      ctx.drawImage(
        transition.snapshot,
        from.x * dpr,
        from.y * dpr,
        from.width * dpr,
        from.height * dpr,
        contentRect.x,
        contentRect.y,
        contentRect.width,
        contentRect.height,
      );
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.46;
    glassPanel(ctx, overlay, {
      radius: overlayRadius,
      tint: 'rgba(251,250,246,0.42)',
      middle: 'rgba(251,250,246,0.26)',
      bottom: 'rgba(232,226,215,0.24)',
    });
    ctx.restore();
    if (progress >= 1) {
      this.transition = null;
    }
  }
}
