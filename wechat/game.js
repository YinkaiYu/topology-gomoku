import './js/platform/runtime-global';
import './js/shared/topology';
import './js/shared/topology-morph';
import './js/shared/game-replay';
import './js/shared/level-config';
import './js/shared/game-controller';
import './js/shared/board-art';
import Main from './js/main';

// 微信小游戏第一次调用 wx.createCanvas() 得到上屏 Canvas。所有模块都
// 保持顶层无 Canvas 副作用，让入口明确拥有这次调用。
if (!GameGlobal.canvas) {
  GameGlobal.canvas = wx.createCanvas();
}
if (GameGlobal.topologyGomoku && typeof GameGlobal.topologyGomoku.destroy === 'function') {
  GameGlobal.topologyGomoku.destroy();
}
GameGlobal.topologyGomoku = new Main(GameGlobal.canvas);
