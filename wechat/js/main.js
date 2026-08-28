import WechatHost from './platform/wechat-host';
import SoundEngine from './platform/sound';
import SceneRenderer from './ui/scene-renderer';

function touchCoordinate(touch) {
  if (!touch) {
    return null;
  }
  return {
    id: touch.identifier === undefined ? 0 : touch.identifier,
    x: Number.isFinite(touch.clientX) ? touch.clientX : Number(touch.pageX || touch.x) || 0,
    y: Number.isFinite(touch.clientY) ? touch.clientY : Number(touch.pageY || touch.y) || 0,
  };
}

function findTouch(event, identifier) {
  const changed = Array.prototype.slice.call(event.changedTouches || []);
  const active = Array.prototype.slice.call(event.touches || []);
  const all = changed.concat(active);
  const match = all.find((touch) => (touch.identifier === undefined ? 0 : touch.identifier) === identifier);
  return touchCoordinate(match || changed[0] || active[0]);
}

function emptyInteraction() {
  return {
    mode: null,
    touchId: null,
    key: null,
    startedAt: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastAt: 0,
    board: null,
    previewDifficulty: undefined,
    previewSwitch: undefined,
    switchStartValue: undefined,
    switchMoved: false,
    sheetOffset: 0,
  };
}

export default class Main {
  constructor(canvas) {
    const ControllerApi = GameGlobal.TopologyGameController;
    this.host = new WechatHost(canvas);
    const preferences = this.host.readStorage(ControllerApi.STORAGE_KEY);
    this.controller = new ControllerApi.GameController({ preferences });
    this.sound = new SoundEngine(this.controller.preferences.sound);
    this.renderer = new SceneRenderer(this.host, this.controller);
    this.interaction = emptyInteraction();
    this.frameId = 0;
    this.timerId = 0;
    this.suspended = false;
    this.pauseReasons = new Set();
    this.dirty = true;
    this.lastFrameAt = Date.now();
    this.lastRenderAt = 0;

    this.host.loadFonts();
    this.host.loadBrandIcon(() => this.wake());
    this.host.keepScreenAwake(false);
    this.bindHostEvents();
    this.startLoop();
  }

  bindHostEvents() {
    this.host.bindInput({
      start: (event) => { this.onTouchStart(event); this.wake(); },
      move: (event) => { this.onTouchMove(event); this.wake(); },
      end: (event) => { this.onTouchEnd(event); this.wake(); },
      cancel: (event) => { this.onTouchCancel(event); this.wake(); },
    });
    this.host.bindLifecycle({
      hide: () => this.onHide(),
      show: () => this.onShow(),
      resize: () => { this.onResize(); this.wake(); },
    });
  }

  wake() {
    this.dirty = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = 0;
    }
    this.startLoop();
  }

  startLoop(delay = 0) {
    if (this.frameId || this.timerId || this.suspended) {
      return;
    }
    if (delay > 0) {
      this.timerId = setTimeout(() => {
        this.timerId = 0;
        this.startLoop();
      }, Math.max(1, delay));
      return;
    }
    this.frameId = requestAnimationFrame(() => this.loop());
  }

  loop() {
    this.frameId = 0;
    if (this.suspended) {
      return;
    }
    const now = Date.now();
    const delta = Math.max(1, Math.min(40, now - this.lastFrameAt));
    this.lastFrameAt = now;
    this.updateInteractionMotion(delta);
    if (this.controller.tick(now)) {
      this.dirty = true;
    }
    this.processControllerEvents();
    const state = this.controller.getState();
    const surfaceAnimated = !this.pauseReasons.has('modal')
      && this.renderer.updateSurfaceMotion(
        state.game,
        now,
        delta,
        this.interaction.mode === 'surface',
      );
    const animationDelay = this.animationDelay(state, now, surfaceAnimated);
    if (this.dirty || animationDelay !== null) {
      this.renderer.render(now, this.interaction);
      this.lastRenderAt = now;
      this.dirty = false;
    }
    if (animationDelay !== null) {
      this.startLoop(animationDelay);
      return;
    }
    const nextScheduledAt = this.controller.nextScheduledAt();
    if (nextScheduledAt !== null) {
      this.startLoop(Math.max(1, nextScheduledAt - now));
    }
  }

  animationDelay(state, now, surfaceAnimated) {
    if (this.interaction.mode || this.renderer.transition || this.renderer.sheetMotion) {
      return 16;
    }
    if (this.pauseReasons.size) {
      return null;
    }
    const game = state.game;
    if (!game) {
      return null;
    }
    if ((game.demo && game.demo.active) || (game.lesson && game.lesson.active)) {
      return 33;
    }
    if (game.lastMoveAt && now - game.lastMoveAt < 340) {
      return 16;
    }
    if (game.seamPulseAt && now - game.seamPulseAt < 1000) {
      return 16;
    }
    if (game.winAt && now - game.winAt < 1500) {
      return 16;
    }
    if (surfaceAnimated) {
      return 33;
    }
    return null;
  }

  updateInteractionMotion(delta) {
    if (!this.interaction.board || !this.interaction.board.target) {
      return;
    }
    const board = this.interaction.board;
    if (!board.position) {
      board.position = { x: board.target.x, y: board.target.y };
      return;
    }
    const frameScale = Math.max(0.55, Math.min(2.05, delta / 16.67));
    const follow = 1 - Math.pow(0.46, frameScale);
    board.position.x += (board.target.x - board.position.x) * follow;
    board.position.y += (board.target.y - board.position.y) * follow;
    this.dirty = true;
  }

  processControllerEvents() {
    const ControllerApi = GameGlobal.TopologyGameController;
    this.controller.drainEvents().forEach((event) => {
      if (event.type === 'persist') {
        this.host.writeStorage(ControllerApi.STORAGE_KEY, event.detail);
      } else if (event.type === 'sound' && event.detail) {
        this.sound.play(event.detail.name);
      } else if (event.type === 'sound-enabled' && event.detail) {
        this.sound.setEnabled(event.detail.enabled);
      }
      this.dirty = true;
    });
  }

  resetInteraction() {
    this.interaction = emptyInteraction();
    this.renderer.setPressedKey(null);
    this.dirty = true;
  }

  addPauseReason(reason, time) {
    if (this.pauseReasons.has(reason)) {
      return;
    }
    if (!this.pauseReasons.size) {
      this.controller.pause(time);
    }
    this.pauseReasons.add(reason);
  }

  removePauseReason(reason, time) {
    if (!this.pauseReasons.delete(reason)) {
      return;
    }
    if (!this.pauseReasons.size) {
      this.controller.resume(time);
    }
  }

  onTouchStart(event) {
    if (this.renderer.transition || this.interaction.touchId !== null) {
      return;
    }
    const point = touchCoordinate((event.changedTouches || event.touches || [])[0]);
    if (!point) {
      return;
    }
    const now = Date.now();
    this.sound.unlock();
    const hit = this.renderer.hitTest(point.x, point.y);
    this.interaction = emptyInteraction();
    this.interaction.touchId = point.id;
    this.interaction.startedAt = now;
    this.interaction.startX = point.x;
    this.interaction.startY = point.y;
    this.interaction.lastX = point.x;
    this.interaction.lastY = point.y;
    this.interaction.lastAt = now;

    if (!hit) {
      this.resetInteraction();
      return;
    }
    const state = this.controller.getState();
    const action = hit.payload.action;
    if (hit.disabled) {
      this.host.vibrate();
      this.resetInteraction();
      return;
    }
    if (action === 'board' && state.game) {
      if (state.game.status === 'ended'
          && state.game.viewMode === 'surface'
          && this.renderer.canDragSurface(state.game, now)) {
        this.interaction.mode = 'surface';
        this.interaction.key = 'board';
        this.renderer.beginSurfaceDrag(now);
        this.dirty = true;
        return;
      }
      if (state.game.demo && state.game.demo.active) {
        this.controller.skipDemo();
        this.processControllerEvents();
        this.resetInteraction();
        return;
      }
      const cell = this.renderer.boardCellAt(point.x, point.y);
      if (this.controller.canPlaceCell(cell)) {
        const center = this.renderer.boardCellCenter(cell);
        this.interaction.mode = 'board';
        this.interaction.key = 'board';
        this.interaction.board = {
          cell,
          startedAt: now,
          position: center,
          target: center,
        };
        this.dirty = true;
        return;
      }
      this.resetInteraction();
      return;
    }
    if (action === 'difficulty') {
      this.interaction.mode = 'difficulty';
      this.interaction.previewDifficulty = this.renderer.difficultyAt(point.x);
    } else if (action === 'switch') {
      this.interaction.mode = `switch:${hit.payload.key}`;
      this.interaction.key = hit.payload.key;
      this.interaction.switchStartValue = Boolean(state.preferences[hit.payload.key]);
      this.interaction.previewSwitch = this.interaction.switchStartValue;
    } else if (action === 'sheet-handle') {
      this.interaction.mode = 'sheet';
    } else {
      this.interaction.mode = 'action';
      this.interaction.key = hit.key;
      this.renderer.setPressedKey(hit.key);
    }
    this.dirty = true;
  }

  onTouchMove(event) {
    if (this.interaction.touchId === null) {
      return;
    }
    const point = findTouch(event, this.interaction.touchId);
    if (!point) {
      return;
    }
    const now = Date.now();
    const deltaX = point.x - this.interaction.lastX;
    const deltaY = point.y - this.interaction.lastY;
    if (this.interaction.mode === 'board') {
      const cell = this.renderer.boardCellAt(point.x, point.y);
      if (this.controller.canPlaceCell(cell)) {
        const center = this.renderer.boardCellCenter(cell);
        this.interaction.board.cell = cell;
        this.interaction.board.target = center;
      }
    } else if (this.interaction.mode === 'surface') {
      this.renderer.dragSurface(deltaX, deltaY, now - this.interaction.lastAt);
    } else if (this.interaction.mode === 'difficulty') {
      this.interaction.previewDifficulty = this.renderer.difficultyAt(point.x);
    } else if (this.interaction.mode && this.interaction.mode.indexOf('switch:') === 0) {
      if (Math.abs(point.x - this.interaction.startX) > 3) {
        this.interaction.switchMoved = true;
      }
      if (this.interaction.switchMoved) {
        this.interaction.previewSwitch = this.renderer.switchValueAt(this.interaction.key, point.x);
      }
    } else if (this.interaction.mode === 'sheet') {
      this.interaction.sheetOffset = Math.max(0, point.y - this.interaction.startY);
      this.renderer.setSheetDrag(this.interaction.sheetOffset);
    } else if (this.interaction.mode === 'action') {
      const hit = this.renderer.hitTest(point.x, point.y);
      this.renderer.setPressedKey(hit && hit.key === this.interaction.key ? this.interaction.key : null);
    }
    this.interaction.lastX = point.x;
    this.interaction.lastY = point.y;
    this.interaction.lastAt = now;
    this.dirty = true;
  }

  onTouchEnd(event) {
    if (this.interaction.touchId === null) {
      return;
    }
    const changed = Array.prototype.slice.call(event.changedTouches || []);
    const released = changed.find((touch) => (
      touch.identifier === undefined ? 0 : touch.identifier
    ) === this.interaction.touchId);
    if (!released) {
      return;
    }
    const point = touchCoordinate(released);
    const now = Date.now();
    const mode = this.interaction.mode;
    if (mode === 'board' && this.interaction.board) {
      let cell = this.renderer.boardCellAt(point.x, point.y);
      if (cell < 0 && this.renderer.boardContains(point.x, point.y)) {
        cell = this.interaction.board.cell;
      }
      if (this.controller.canPlaceCell(cell)) {
        this.controller.performMove(cell, GameGlobal.TopologyGomoku.HUMAN, { fromPress: true }, now);
      }
    } else if (mode === 'surface') {
      this.renderer.endSurfaceDrag(now);
    } else if (mode === 'difficulty') {
      const index = this.interaction.previewDifficulty;
      const difficulty = GameGlobal.TopologyGameContent.DIFFICULTY_ORDER[index];
      this.controller.setDifficulty(difficulty);
    } else if (mode && mode.indexOf('switch:') === 0) {
      const nextValue = this.interaction.switchMoved
        ? this.interaction.previewSwitch
        : !this.interaction.switchStartValue;
      if (this.interaction.key === 'hints') {
        this.controller.setHints(nextValue);
      } else if (this.interaction.key === 'sound') {
        this.controller.setSound(nextValue);
      }
    } else if (mode === 'sheet') {
      const elapsed = Math.max(1, now - this.interaction.lastAt);
      const velocity = Math.max(0, point.y - this.interaction.lastY) / elapsed;
      const dismiss = this.interaction.sheetOffset > 92 || velocity > 0.75;
      this.renderer.settleSheetDrag(now, dismiss);
      if (dismiss) {
        this.removePauseReason('modal', now);
        this.sound.play('ui');
      }
    } else if (mode === 'action') {
      const hit = this.renderer.hitTest(point.x, point.y);
      if (hit && hit.key === this.interaction.key && !hit.disabled) {
        this.performAction(hit, now);
      }
    }
    this.resetInteraction();
    this.processControllerEvents();
  }

  onTouchCancel(event) {
    if (this.interaction.touchId !== null) {
      const changed = Array.prototype.slice.call((event && event.changedTouches) || []);
      if (changed.length && !changed.some((touch) => (
        touch.identifier === undefined ? 0 : touch.identifier
      ) === this.interaction.touchId)) {
        return;
      }
    }
    if (this.interaction.mode === 'sheet') {
      this.renderer.settleSheetDrag(Date.now(), false);
    } else if (this.interaction.mode === 'surface') {
      this.renderer.endSurfaceDrag(Date.now());
    }
    this.resetInteraction();
  }

  performAction(hit, now) {
    const action = hit.payload.action;
    const state = this.controller.getState();
    const game = state.game;
    if (action === 'settings') {
      this.addPauseReason('modal', now);
      this.renderer.openSettings(now);
      this.sound.play('ui');
    } else if (action === 'close-settings') {
      this.renderer.closeSettings(now);
      this.removePauseReason('modal', now);
      this.sound.play('ui');
    } else if (action === 'level') {
      const source = this.renderer.hitRect(hit.key);
      if (hit.payload.locked || !this.controller.selectLevel(hit.payload.index, now)) {
        this.host.vibrate();
      } else {
        this.renderer.surfaceRotation = { x: 0, y: 0, z: 0 };
        this.host.keepScreenAwake(true);
        this.renderer.beginTransition('enter', source, hit.payload.index, now);
      }
    } else if ((action === 'back' || action === 'journey') && game) {
      const source = copyBoardRect(this.renderer.boardRect);
      const levelIndex = game.levelIndex;
      this.controller.leaveGame();
      this.host.keepScreenAwake(false);
      this.renderer.beginTransition('exit', source, levelIndex, now);
    } else if (action === 'undo') {
      this.controller.undo(now);
    } else if (action === 'restart') {
      this.renderer.surfaceRotation = { x: 0, y: 0, z: 0 };
      this.controller.restart(now);
    } else if (action === 'boundary') {
      this.controller.replayBoundaryLesson(now);
    } else if (action === 'dimension') {
      if (this.renderer.canToggleDimension(game, now)) {
        if (game.viewMode === 'surface') {
          this.renderer.startReturning(game, now);
        } else {
          this.renderer.surfaceRotation = { x: 0, y: 0, z: 0 };
          this.renderer.startPresenting(game, now);
        }
        this.controller.toggleDimension();
      }
    } else if (action === 'replay-toggle') {
      if (game && game.review) {
        this.controller.endReplay();
      } else {
        this.controller.beginReplay();
      }
    } else if (action === 'previous') {
      this.controller.stepReplay(-1, now);
    } else if (action === 'next-step') {
      this.controller.stepReplay(1, now);
    } else if (action === 'next-level') {
      this.renderer.surfaceRotation = { x: 0, y: 0, z: 0 };
      this.controller.nextLevel(now);
    }
    this.dirty = true;
  }

  onHide() {
    const now = Date.now();
    this.suspended = true;
    if (this.frameId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameId);
    }
    this.frameId = 0;
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
    this.timerId = 0;
    this.addPauseReason('lifecycle', now);
    this.sound.pause();
    this.host.keepScreenAwake(false);
    this.onTouchCancel({ changedTouches: [] });
  }

  onShow() {
    const now = Date.now();
    this.host.resize();
    this.renderer.resize(this.host.metrics);
    this.removePauseReason('lifecycle', now);
    this.sound.resume();
    this.host.keepScreenAwake(this.controller.getState().scene === 'game');
    this.suspended = false;
    this.lastFrameAt = now;
    this.wake();
  }

  onResize() {
    this.host.resize();
    this.renderer.resize(this.host.metrics);
    this.dirty = true;
  }
}

function copyBoardRect(value) {
  return value ? {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  } : null;
}
