import SceneRenderer from '/wechat/js/ui/scene-renderer.js';
import Main from '/wechat/js/main.js';
import { computeViewportMetrics } from '/wechat/js/platform/wechat-host.js';

const canvas = document.getElementById('wechatPreview');
const context = canvas.getContext('2d');
const query = new URLSearchParams(window.location.search);
const width = Math.max(320, Number(query.get('width')) || window.innerWidth || 390);
const height = Math.max(520, Number(query.get('height')) || window.innerHeight || 844);
const density = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

canvas.width = Math.round(width * density);
canvas.height = Math.round(height * density);
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
context.setTransform(density, 0, 0, density, 0, 0);

const preferences = {
  unlocked: 5,
  completed: [true, true, true, true, true, false, false],
  bestDifficulty: [2, 2, 2, 2, 2, 0, 0],
  difficulty: 'easy',
  hints: true,
  sound: true,
  learnedLevels: [0, 1, 2, 3, 4],
};
const controller = new GameGlobal.TopologyGameController.GameController({
  preferences,
  now: () => Date.now(),
  random: () => 0.42,
});

const topologyNames = ['plane', 'cylinder', 'torus', 'mobius', 'klein', 'projective', 'sphere'];
const silhouetteNames = topologyNames.filter((name) => name !== 'plane');
const iconNames = [
  'back',
  'settings',
  'undo',
  'boundary',
  'journey',
  'restart',
  'next-level',
  'review',
  'previous',
  'next',
  'surface',
  'board',
  'check',
];
const safeArea = { left: 0, right: width, top: 47, bottom: height - 12, width, height: height - 59 };
const menu = { left: width - 105, right: width - 12, top: 50, bottom: 82, width: 93, height: 32 };
const host = {
  canvas,
  context,
  brandIcon: null,
  mysteryGroundShadow: null,
  images: {
    topologies: {},
    silhouettes: {},
    icons: {},
  },
  fonts: { 400: 'Topo Serif', 600: 'Topo Serif', 700: 'Topo Serif' },
  metrics: computeViewportMetrics({
    windowWidth: width,
    windowHeight: height,
    pixelRatio: density,
    statusBarHeight: 47,
    safeArea,
  }, menu),
  font(weight, size) {
    return `${weight} ${size}px "Topo Serif", serif`;
  },
};
const renderer = new SceneRenderer(host, controller);
const runtime = Object.create(Main.prototype);
Object.assign(runtime, {
  controller, renderer, host, pauseReasons: new Set(),
  interaction: { mode: null, touchId: null },
  dirty: true, wake() {},
  sound: { play() {}, unlock() {}, setEnabled() {} },
});
host.writeStorage = () => {};
host.vibrate = () => {};
canvas.style.touchAction = 'none';
for (const [eventName, method] of [
  ['pointerdown', 'onTouchStart'], ['pointermove', 'onTouchMove'],
  ['pointerup', 'onTouchEnd'], ['pointercancel', 'onTouchCancel'],
]) {
  canvas.addEventListener(eventName, (event) => {
    if (eventName === 'pointerdown') { canvas.setPointerCapture(event.pointerId); }
    runtime[method]({ changedTouches: [{
      identifier: event.pointerId, clientX: event.offsetX, clientY: event.offsetY,
    }] });
    event.preventDefault();
  });
}
window.addEventListener('blur', () => runtime.onTouchCancel({ changedTouches: [] }));

function seedGame(levelIndex) {
  controller.startLevel(levelIndex, { introMode: 'none' }, Date.now() - 4000);
  return controller.game;
}

function seedEnding(levelIndex) {
  const game = seedGame(levelIndex);
  const moves = [0, 7, 1, 8, 2, 9, 3, 10, 4];
  moves.forEach((cell, index) => {
    game.board[cell] = index % 2 === 0 ? GameGlobal.TopologyGomoku.HUMAN : GameGlobal.TopologyGomoku.AI;
    game.moves.push({ cell, player: index % 2 === 0 ? GameGlobal.TopologyGomoku.HUMAN : GameGlobal.TopologyGomoku.AI });
  });
  game.lastMove = 4;
  const mask = GameGlobal.TopologyGomoku.checkWin(game.board, game.rules, 4, GameGlobal.TopologyGomoku.HUMAN);
  controller._finishGame('win', mask, null, Date.now() - 3600);
  game.autoAdvancePending = false;
  return game;
}

function configureState() {
  const stateName = query.get('state') || 'home';
  const levelIndex = Math.max(0, Math.min(6, Number(query.get('level')) || 0));
  if (stateName === 'game' || stateName === 'settings') {
    seedGame(levelIndex);
    controller.setViewProgress(Number(query.get('progress')) || 0, false, Date.now());
  } else if (stateName === 'end' || stateName === 'review') {
    const game = seedEnding(levelIndex);
    if (stateName === 'review') {
      game.viewMode = query.get('view') === 'board' ? 'board' : 'surface';
      game.review = { step: game.moves.length, total: game.moves.length };
    }
  }
  if (stateName === 'settings') {
    renderer.settingsOpen = true;
    renderer.sheetMotion = null;
  }
}

function draw() {
  const now = Date.now();
  controller.tick(now);
  runtime.processControllerEvents();
  renderer.updateSurfaceMotion(controller.game, now, 16.67,
    runtime.interaction.mode === 'view-board' && runtime.interaction.dragged);
  renderer.render(now, runtime.interaction);
  window.__wechatPreview = { controller, host, renderer };
  document.documentElement.dataset.previewReady = 'true';
  requestAnimationFrame(draw);
}

function loadImage(source, onLoad) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      onLoad(image);
      resolve();
    };
    image.onerror = resolve;
    image.src = source;
  });
}

Promise.all([
  document.fonts.load('400 16px "Topo Serif"'),
  document.fonts.load('600 16px "Topo Serif"'),
  document.fonts.load('700 16px "Topo Serif"'),
  loadImage('/app/assets/brand-icon.png', (image) => { host.brandIcon = image; }),
  loadImage('/wechat/assets/ui/mystery-ground-shadow.png', (image) => { host.mysteryGroundShadow = image; }),
  ...topologyNames.flatMap((name) => ['', '-compact'].map((suffix) => loadImage(
    `/wechat/assets/ui/topologies/${name}${suffix}.png`,
    (image) => { host.images.topologies[`${name}${suffix}`] = image; },
  ))),
  ...silhouetteNames.flatMap((name) => ['', '-compact'].map((suffix) => loadImage(
    `/wechat/assets/ui/silhouettes/${name}${suffix}.png`,
    (image) => { host.images.silhouettes[`${name}${suffix}`] = image; },
  ))),
  ...iconNames.map((name) => loadImage(
    `/wechat/assets/ui/icons/${name}.png`,
    (image) => { host.images.icons[name] = image; },
  )),
]).then(() => {
  configureState();
  draw();
});
