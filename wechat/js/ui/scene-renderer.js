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
};

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function copyRect(value) {
  return value ? rect(value.x, value.y, value.width, value.height) : null;
}

function interpolateRect(from, to, amount) {
  return rect(
    lerp(from.x, to.x, amount),
    lerp(from.y, to.y, amount),
    lerp(from.width, to.width, amount),
    lerp(from.height, to.height, amount),
  );
}

export default class SceneRenderer {
  constructor(host, controller) {
    this.host = host;
    this.context = host.context;
    this.controller = controller;
    this.metrics = host.metrics;
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
    this.completionMotion = null;
    this.surfaceVelocity = { x: 0, y: 0 };
    this.surfaceElastic = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
    this.surfaceAutoResumeAt = 0;
  }

  resize(metrics) {
    this.metrics = metrics;
    this.boardRect = null;
    this.boardLayout = null;
  }

  contentBounds(maxWidth = 520) {
    const { width, leftInset, rightInset } = this.metrics;
    const safeWidth = Math.max(1, width - leftInset - rightInset);
    const contentWidth = Math.min(maxWidth, safeWidth);
    return {
      x: leftInset + (safeWidth - contentWidth) / 2,
      width: contentWidth,
    };
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
      : { opening: true, settling: true, startedAt: time, duration: 260, dragOffset: 0, fromOffset };
  }

  beginTransition(kind, sourceRect, levelIndex, time) {
    this.transition = {
      kind,
      sourceRect: copyRect(sourceRect),
      levelIndex,
      startedAt: time,
      duration: kind === 'enter' ? 300 : 240,
    };
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

  difficultyAt(x) {
    if (!this.difficultyRect) {
      return 1;
    }
    const local = clamp01((x - this.difficultyRect.x) / this.difficultyRect.width);
    return Math.max(0, Math.min(2, Math.floor(local * 3)));
  }

  switchValueAt(key, x) {
    const bounds = this.switchRects[key];
    if (!bounds) {
      return false;
    }
    return x >= bounds.x + bounds.width / 2;
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

  completionKey(game) {
    return game ? `${game.levelIndex}:${game.winAt}:${game.outcome || ''}` : '';
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
    if (!game || game.status !== 'ended' || !game.completionAvailable || game.review) {
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
    if (!game || !game.completionAvailable || game.review) {
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
    const hadMotion = Boolean(this.completionMotion);
    const pose = this.completionPose(game, time);
    if (!pose) {
      return hadMotion;
    }
    if (!pose.settled) {
      return true;
    }
    const frameDelta = Math.max(1, Math.min(34, delta || 16.67));
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
    const content = this.contentBounds();
    const contentWidth = content.width;
    const contentLeft = content.x;
    const headerY = topInset;
    const iconSize = 54;
    if (this.host.brandIcon) {
      ctx.save();
      roundedRectPath(ctx, contentLeft, headerY, iconSize, iconSize, 15);
      ctx.clip();
      ctx.drawImage(this.host.brandIcon, contentLeft, headerY, iconSize, iconSize);
      ctx.restore();
    } else {
      glassPanel(ctx, rect(contentLeft, headerY, iconSize, iconSize), { radius: 15 });
      ctx.save();
      ctx.strokeStyle = COLORS.teal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(contentLeft + iconSize / 2, headerY + iconSize / 2, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    text(ctx, '拓扑五子棋', contentLeft + iconSize + 13, headerY + 18, {
      font: this.host.font(700, 22),
      color: COLORS.ink,
    });
    text(ctx, '边界之外，也能连成一线。', contentLeft + iconSize + 13, headerY + 43, {
      font: this.host.font(400, 12),
      color: COLORS.muted,
    });

    const settingsRect = rect(contentLeft + contentWidth - 42, headerY + 62, 42, 42);
    glassPanel(ctx, settingsRect, { radius: 15, pressed: this.pressedKey === 'settings' });
    drawIcon(ctx, 'settings', settingsRect.x + 21, settingsRect.y + 21, 21);
    this.register('settings', settingsRect, { action: 'settings' });

    const completed = state.preferences.completed.filter(Boolean).length;
    const progressRect = rect(contentLeft, headerY + 70, 132, 28);
    pill(ctx, progressRect, `${completed} / ${state.levels.length} 个世界`, {
      font: this.host.font(600, 11),
      color: COLORS.teal,
    });

    const cardTop = headerY + 116;
    const gap = 10;
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
      this.drawLevelCard(ctx, cardRect, level, index, state, time);
    });
  }

  drawLevelCard(ctx, cardRect, level, index, state, time) {
    const locked = index > state.preferences.unlocked;
    const completed = Boolean(state.preferences.completed[index]);
    glassPanel(ctx, cardRect, {
      radius: 21,
      pressed: this.pressedKey === `level:${index}`,
      disabled: locked,
      tint: completed ? 'rgba(250,255,252,0.66)' : undefined,
    });
    const number = String(index + 1).padStart(2, '0');
    text(ctx, number, cardRect.x + 14, cardRect.y + 17, {
      font: this.host.font(600, 10),
      color: locked ? COLORS.faint : COLORS.teal,
    });
    text(ctx, level.name, cardRect.x + 14, cardRect.y + cardRect.height * 0.52, {
      font: this.host.font(700, Math.max(17, Math.min(21, cardRect.height * 0.24))),
      color: locked ? COLORS.muted : COLORS.ink,
    });
    text(ctx, level.typeName, cardRect.x + 14, cardRect.y + cardRect.height - 15, {
      font: this.host.font(400, 10),
      color: COLORS.muted,
    });
    const glyphSize = Math.min(cardRect.height - 14, cardRect.width * 0.42);
    const glyphRect = rect(cardRect.x + cardRect.width - glyphSize - 8, cardRect.y + 7, glyphSize, cardRect.height - 14);
    const revealed = index === 0 || completed;
    if (revealed) {
      GameGlobal.TopologyBoardArt.drawTopologyGlyph(ctx, level.topology, glyphRect, { locked });
    } else {
      const mystery = GameGlobal.TopologyBoardArt.drawTopologySilhouette(ctx, level.topology, glyphRect);
      text(ctx, '?', mystery.centerX, mystery.centerY - 1, {
        font: this.host.font(600, 27),
        color: 'rgba(247,244,235,0.94)',
        align: 'center',
      });
    }
    if (locked) {
      drawIcon(ctx, 'lock', cardRect.x + cardRect.width - 18, cardRect.y + 17, 13, COLORS.muted);
    } else if (completed) {
      drawIcon(ctx, 'check', cardRect.x + cardRect.width - 18, cardRect.y + 17, 13, COLORS.teal);
    }
    this.register(`level:${index}`, cardRect, { action: 'level', index, locked });
  }

  drawGame(state, time, interaction) {
    const ctx = this.context;
    const game = state.game;
    const { height, topInset, bottomInset } = this.metrics;
    const content = this.contentBounds();
    const contentCenter = content.x + content.width / 2;
    const topButton = 42;
    const backRect = rect(content.x, topInset, topButton, topButton);
    const settingsRect = rect(content.x + content.width - topButton, topInset, topButton, topButton);
    glassPanel(ctx, backRect, { radius: 15, pressed: this.pressedKey === 'back' });
    drawIcon(ctx, 'back', backRect.x + 21, backRect.y + 21, 20);
    this.register('back', backRect, { action: 'back' });
    glassPanel(ctx, settingsRect, { radius: 15, pressed: this.pressedKey === 'settings' });
    drawIcon(ctx, 'settings', settingsRect.x + 21, settingsRect.y + 21, 20);
    this.register('settings', settingsRect, { action: 'settings' });

    text(ctx, game.level.name, contentCenter, topInset + 13, {
      font: this.host.font(700, 19),
      color: COLORS.ink,
      align: 'center',
    });
    text(ctx, game.level.typeName, contentCenter, topInset + 34, {
      font: this.host.font(400, 10),
      color: COLORS.muted,
      align: 'center',
    });

    const statusText = this.controller.statusText();
    const statusRect = rect(contentCenter - 67, topInset + 49, 134, 28);
    pill(ctx, statusRect, statusText, {
      font: this.host.font(600, 11),
      color: game.turn === GameGlobal.TopologyGomoku.AI ? COLORS.gold : COLORS.teal,
    });

    const actionAreaHeight = game.status === 'ended' ? 120 : 66;
    const boardTop = topInset + 88;
    const boardBottom = height - bottomInset - actionAreaHeight - 12;
    const availableBoardHeight = Math.max(1, boardBottom - boardTop);
    const boardSize = Math.min(520, content.width, availableBoardHeight);
    this.boardRect = rect(
      content.x + (content.width - boardSize) / 2,
      boardTop + (availableBoardHeight - boardSize) / 2,
      boardSize,
      boardSize,
    );
    glassPanel(ctx, this.boardRect, {
      radius: 29,
      tint: 'rgba(251,250,246,0.3)',
      middle: 'rgba(251,250,246,0.2)',
      bottom: 'rgba(232,226,215,0.22)',
    });
    this.boardLayout = GameGlobal.TopologyBoardArt.computeLayout(
      this.boardRect.width,
      this.boardRect.height,
      game.rules,
      { minimumMargin: 30, marginRatio: 0.105 },
    );
    ctx.save();
    ctx.translate(this.boardRect.x, this.boardRect.y);
    const completionPose = this.completionPose(game, time);
    if (completionPose && completionPose.draw) {
      GameGlobal.TopologyBoardArt.drawCompletion(ctx, {
        game,
        layout: this.boardLayout,
        time,
        rotation: this.surfaceRotation,
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
        game,
        layout: this.boardLayout,
        time,
        preferences: state.preferences,
        interaction: boardInteraction,
        fontFamily: this.host.fonts[700] ? `'${this.host.fonts[700]}'` : 'serif',
      });
    }
    ctx.restore();

    this.register('board', this.boardRect, { action: 'board' });
    this.drawGameActions(state, time);
  }

  drawGameActions(state, time) {
    const game = state.game;
    const { bottomInset, height } = this.metrics;
    const content = this.contentBounds();
    const gap = 9;
    const contentWidth = content.width;
    const rowHeight = 48;
    const bottomY = height - bottomInset - rowHeight;
    if (game.status !== 'ended') {
      const actions = [];
      if (game.levelIndex > 0) {
        actions.push({
          key: 'boundary',
          label: '边界演示',
          icon: 'boundary',
          disabled: game.status !== 'playing'
            || Boolean(game.lesson && game.lesson.active)
            || Boolean(game.demo && game.demo.active),
        });
      }
      actions.push({ key: 'undo', label: '悔棋', icon: 'undo', disabled: !game.moves.length || game.status !== 'playing' });
      actions.push({ key: 'restart', label: '重来', icon: 'restart', disabled: false });
      this.drawActionRow(actions, content.x, bottomY, contentWidth, rowHeight, gap);
      return;
    }

    if (game.autoAdvancePending) {
      return;
    }

    const reviewing = Boolean(game.review);
    const completionReady = !game.completionAvailable || this.canToggleDimension(game, time);
    const firstRow = reviewing
      ? [
          { key: 'previous', label: '上一步', icon: 'previous', disabled: game.review.step <= 0 },
          { key: 'replay-toggle', label: '定局', icon: 'check', disabled: false },
          { key: 'next-step', label: '下一步', icon: 'next', disabled: game.review.step >= game.review.total },
        ]
      : [
          { key: 'replay-toggle', label: '复盘', icon: 'replay', disabled: !completionReady },
          {
            key: 'dimension',
            label: game.viewMode === 'surface' ? '二维' : '三维',
            icon: game.viewMode === 'surface' ? 'board' : 'surface',
            disabled: !this.canToggleDimension(game, time),
          },
          { key: 'journey', label: '图鉴', icon: 'journey', disabled: false },
        ];
    this.drawActionRow(firstRow, content.x, bottomY - rowHeight - gap, contentWidth, rowHeight, gap);
    const passed = game.outcome === 'win' || game.outcome === 'draw';
    const secondRow = [
      { key: 'restart', label: '再来', icon: 'restart', disabled: false },
      {
        key: 'next-level',
        label: '下一关',
        icon: 'next',
        disabled: !passed || game.levelIndex >= state.levels.length - 1,
        accent: true,
      },
    ];
    this.drawActionRow(secondRow, content.x, bottomY, contentWidth, rowHeight, gap);
  }

  drawActionRow(actions, x, y, width, height, gap) {
    const ctx = this.context;
    const actionWidth = (width - gap * (actions.length - 1)) / actions.length;
    actions.forEach((action, index) => {
      const actionRect = rect(x + index * (actionWidth + gap), y, actionWidth, height);
      glassPanel(ctx, actionRect, {
        radius: 17,
        pressed: this.pressedKey === action.key,
        disabled: action.disabled,
        tint: action.accent ? 'rgba(240,251,247,0.7)' : undefined,
      });
      const iconColor = action.accent ? COLORS.teal : COLORS.muted;
      drawIcon(ctx, action.icon, actionRect.x + 19, actionRect.y + actionRect.height / 2, 17, iconColor);
      text(ctx, action.label, actionRect.x + actionRect.width / 2 + 7, actionRect.y + actionRect.height / 2, {
        font: this.host.font(600, 12),
        color: action.disabled ? COLORS.faint : COLORS.ink,
        align: 'center',
      });
      this.register(action.key, actionRect, { action: action.key }, action.disabled);
    });
  }

  drawSettings(state, time, interaction) {
    const ctx = this.context;
    const { width, height, bottomInset } = this.metrics;
    const content = this.contentBounds();
    let progress = 1;
    let dragOffset = 0;
    if (this.sheetMotion) {
      if (this.sheetMotion.dragging) {
        dragOffset = this.sheetMotion.dragOffset || 0;
      } else {
        const elapsed = time - this.sheetMotion.startedAt;
        const normalized = clamp01(elapsed / this.sheetMotion.duration);
        const eased = softOut(normalized);
        progress = this.sheetMotion.opening
          ? (this.sheetMotion.settling ? 1 : springOut(normalized))
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
    ctx.save();
    ctx.globalAlpha = clamp01(progress) * 0.34;
    ctx.fillStyle = '#17231f';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    this.register('settings-scrim', rect(0, 0, width, height), { action: 'close-settings' });

    const sheetHeight = Math.min(356, Math.max(324, height - bottomInset - 88));
    const settledY = height - bottomInset - sheetHeight;
    const sheetY = lerp(height + 18, settledY, clamp01(progress)) + dragOffset;
    this.sheetRect = rect(content.x, sheetY, content.width, sheetHeight);
    glassPanel(ctx, this.sheetRect, {
      radius: 29,
      tint: 'rgba(255,255,255,0.78)',
      middle: 'rgba(247,245,239,0.68)',
      bottom: 'rgba(232,226,215,0.58)',
    });
    // The sheet itself sits above the scrim. Registering a neutral hit target
    // keeps taps in its empty areas from dismissing it, while later controls
    // continue to win reverse-order hit testing.
    this.register('settings-sheet', this.sheetRect, { action: 'none' });
    const handleRect = rect(width / 2 - 26, sheetY + 10, 52, 5);
    fillRoundedRect(ctx, handleRect, 3, 'rgba(90,93,87,0.25)');
    this.register('sheet-handle', rect(this.sheetRect.x, sheetY, this.sheetRect.width, 42), { action: 'sheet-handle' });
    text(ctx, '设置', this.sheetRect.x + 20, sheetY + 39, {
      font: this.host.font(700, 20),
      color: COLORS.ink,
    });
    const doneRect = rect(this.sheetRect.x + this.sheetRect.width - 70, sheetY + 23, 54, 34);
    glassPanel(ctx, doneRect, { radius: 14, pressed: this.pressedKey === 'settings-done' });
    text(ctx, '完成', doneRect.x + doneRect.width / 2, doneRect.y + doneRect.height / 2, {
      font: this.host.font(600, 12),
      color: COLORS.teal,
      align: 'center',
    });
    this.register('settings-done', doneRect, { action: 'close-settings' });

    text(ctx, '对手', this.sheetRect.x + 20, sheetY + 83, {
      font: this.host.font(600, 12),
      color: COLORS.muted,
    });
    this.difficultyRect = rect(this.sheetRect.x + 20, sheetY + 102, this.sheetRect.width - 40, 50);
    fillRoundedRect(ctx, this.difficultyRect, 18, 'rgba(226,225,218,0.52)');
    const order = GameGlobal.TopologyGameContent.DIFFICULTY_ORDER;
    const selected = interaction.previewDifficulty === undefined
      ? order.indexOf(state.preferences.difficulty)
      : interaction.previewDifficulty;
    const segmentWidth = (this.difficultyRect.width - 8) / 3;
    const thumbRect = rect(
      this.difficultyRect.x + 4 + selected * segmentWidth,
      this.difficultyRect.y + 4,
      segmentWidth,
      this.difficultyRect.height - 8,
    );
    glassPanel(ctx, thumbRect, {
      radius: 15,
      pressed: interaction.mode === 'difficulty',
      tint: 'rgba(255,255,255,0.74)',
    });
    order.forEach((difficulty, index) => {
      const label = GameGlobal.TopologyGameContent.DIFFICULTIES[difficulty].label;
      const segmentRect = rect(
        this.difficultyRect.x + index * this.difficultyRect.width / 3,
        this.difficultyRect.y,
        this.difficultyRect.width / 3,
        this.difficultyRect.height,
      );
      text(ctx, label, segmentRect.x + segmentRect.width / 2, segmentRect.y + segmentRect.height / 2, {
        font: this.host.font(index === selected ? 700 : 600, 13),
        color: index === selected ? COLORS.ink : COLORS.muted,
        align: 'center',
      });
      this.register(`difficulty:${index}`, segmentRect, { action: 'difficulty', index });
    });

    this.drawSettingToggle('hints', '落子提示', '显示活三与封堵点', state.preferences.hints, sheetY + 174, interaction);
    this.drawSettingToggle('sound', '声音', '保留落子与跨界提示音', state.preferences.sound, sheetY + 245, interaction);
  }

  drawSettingToggle(key, title, subtitle, enabled, y, interaction) {
    const ctx = this.context;
    const x = this.sheetRect.x + 20;
    const width = this.sheetRect.width - 40;
    text(ctx, title, x, y + 17, {
      font: this.host.font(600, 14),
      color: COLORS.ink,
    });
    text(ctx, subtitle, x, y + 39, {
      font: this.host.font(400, 10),
      color: COLORS.muted,
    });
    const switchRect = rect(x + width - 54, y + 11, 54, 34);
    this.switchRects[key] = switchRect;
    const preview = interaction.mode === `switch:${key}` && interaction.previewSwitch !== undefined
      ? interaction.previewSwitch
      : enabled;
    fillRoundedRect(ctx, switchRect, 17, preview ? 'rgba(63,140,135,0.32)' : 'rgba(129,127,119,0.18)');
    ctx.save();
    roundedRectPath(ctx, switchRect.x, switchRect.y, switchRect.width, switchRect.height, 17);
    ctx.strokeStyle = preview ? 'rgba(63,140,135,0.42)' : 'rgba(129,127,119,0.2)';
    ctx.stroke();
    ctx.restore();
    const knob = rect(preview ? switchRect.x + 23 : switchRect.x + 3, switchRect.y + 3, 28, 28);
    glassPanel(ctx, knob, {
      radius: 14,
      pressed: interaction.mode === `switch:${key}`,
      tint: 'rgba(255,255,255,0.86)',
    });
    this.register(
      `switch:${key}`,
      rect(switchRect.x - 8, switchRect.y - 6, switchRect.width + 16, switchRect.height + 12),
      { action: 'switch', key },
    );
  }

  drawTransition(time) {
    if (!this.transition || !this.transition.sourceRect) {
      return;
    }
    const transition = this.transition;
    const progress = clamp01((time - transition.startedAt) / transition.duration);
    let target = null;
    if (transition.kind === 'enter') {
      target = this.boardRect;
    } else {
      target = this.homeRects[transition.levelIndex];
    }
    if (!target) {
      return;
    }
    const amount = transition.kind === 'enter' ? springOut(progress) : softOut(progress);
    const from = transition.sourceRect;
    const to = target;
    const overlay = transition.kind === 'enter'
      ? interpolateRect(from, to, amount)
      : interpolateRect(from, to, amount);
    this.context.save();
    this.context.globalAlpha = Math.sin(progress * Math.PI) * 0.76;
    glassPanel(this.context, overlay, {
      radius: lerp(21, transition.kind === 'enter' ? 29 : 21, amount),
      tint: 'rgba(251,250,246,0.42)',
      middle: 'rgba(251,250,246,0.26)',
      bottom: 'rgba(232,226,215,0.24)',
    });
    this.context.restore();
    if (progress >= 1) {
      this.transition = null;
    }
  }
}
