import { findGameRenderShot } from "../data/game-render-shots.js";

export const RENDER_API_METHODS = Object.freeze(["selectShot", "render", "renderReady"]);
const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function normalizeRenderState(value = {}) {
  return Object.freeze({
    topology: String(value.topology || "plane"),
    shot: value.shot === "completion" ? "completion" : "helper",
    demo: String(value.demo || ""),
    chapterProgress: clamp(value.chapterProgress),
    lessonStep: Math.max(0, Math.min(5, Math.trunc(value.lessonStep || 0))),
    dropProgress: clamp(value.dropProgress),
    breathPhase: clamp(value.breathPhase),
    morphProgress: clamp(value.morphProgress),
    rotation: Object.freeze({ x: Number(value.rotation?.x) || 0, y: Number(value.rotation?.y) || 0, z: Number(value.rotation?.z) || 0 }),
    freezeRotation: value.freezeRotation !== false
  });
}

export function chapterStateAt(definition, demo, progress) {
  const units = [{ phase: "establish", weight: 1 }];
  const crossings = new Set(demo.crossings);
  for (let step = 1; step <= 5; step += 1) {
    if (crossings.has(step)) units.push({ phase: "breathe", step, weight: 2 });
    units.push({ phase: "drop", step, weight: 1 });
  }
  units.push({ phase: "win-hold", step: 5, weight: 1.25 }, { phase: "morph", weight: 4 }, { phase: "settled", weight: 1 }, { phase: "rotation", weight: 1.5 });
  const total = units.reduce((sum, unit) => sum + unit.weight, 0);
  let cursor = clamp(progress) * total;
  let selected = units.at(-1);
  let local = 1;
  for (const unit of units) {
    if (cursor <= unit.weight) { selected = unit; local = cursor / unit.weight; break; }
    cursor -= unit.weight;
  }
  const completedDrops = units.slice(0, units.indexOf(selected)).filter((unit) => unit.phase === "drop").length;
  return Object.freeze({
    phase: selected.phase,
    lessonStep: selected.phase === "drop" ? selected.step - 1 : completedDrops,
    pendingStep: selected.step || 0,
    dropProgress: selected.phase === "drop" ? local : 0,
    breathPhase: selected.phase === "breathe" ? local : 0,
    winningFive: ["win-hold", "morph", "settled", "rotation"].includes(selected.phase),
    morphProgress: selected.phase === "morph" ? local : (["settled", "rotation"].includes(selected.phase) ? 1 : 0),
    rotation: selected.phase === "rotation" ? { x: -.18 * local, y: .72 * local, z: .04 * local } : { x: 0, y: 0, z: 0 },
    topology: definition.topology,
    demo: demo.id
  });
}

const instrument = `
window.__PV_GAME__={
 setup:function(level,path){
  startLevel(level,{introMode:"none"});
  setTimeout(function(){
   window.__PV_CONTROL__.frozen=true;
   startBoundaryLesson();
   if(game.levelIndex===0)game.lesson.paths=boundaryGuidePaths();
   activateLessonPath(game.lesson,path);
   window.__PV_CONTROL__.mode="helper";
   window.__PV_CONTROL__.suppressedTextCalls=0;
   window.__PV_CONTROL__.visiblePromptCalls=0;
   window.__PV_CONTROL__.lessonStrokeCalls=0;
   window.__PV_CONTROL__.paperDots=0;
   document.fonts.ready.then(function(){window.__PV_READY__=document.fonts.status==="loaded";});
  },140);
 },
 rebuild:function(spec){
  turnToken+=1;
  game.board.fill(Engine.EMPTY);
  game.moves=[];game.turn=HUMAN;game.status="playing";game.outcome=null;game.winningMask=null;game.winReason=null;
  game.autoAdvancePending=false;game.lastMove=-1;game.demo=null;game.completion=null;game.review=null;game.lessonReturn=null;
  if(!game.lesson){startBoundaryLesson();}
  if(game.levelIndex===0)game.lesson.paths=boundaryGuidePaths();
  game.lesson.active=true;game.lesson.completed=false;
  activateLessonPath(game.lesson,spec.sourcePathIndex);
  renderState.hoverCell=-1;renderState.pressedCell=-1;renderState.pressedAt=0;renderState.pressedMotionReady=false;
  renderState.lastMoveAt=0;renderState.seamPulseAt=0;renderState.seamPulseBits=0;renderState.winAt=0;renderState.lastFrameAt=spec.time;
  dom.boardStage.classList.remove("is-settled","is-exploring","is-dragging");
  window.__PV_CONTROL__.mode=spec.winning?"completion":"helper";
  window.__PV_CONTROL__.morph=game.levelIndex===0?null:spec.morphProgress;
  window.__PV_CONTROL__.rotation=spec.rotation;
  window.__PV_CONTROL__.lessonSeamCues=[];
  while(game.lesson&&game.lesson.step<spec.targetStep){performMove(game.lesson.cells[game.lesson.step],HUMAN);}
  renderState.lastMoveAt=spec.dropProgress>0?spec.time-spec.dropProgress*320:0;
  renderState.seamPulseAt=0;
  if(spec.winning){
   game.status="ended";game.outcome="win";game.turn=0;if(game.lesson)game.lesson.active=false;
   renderState.winAt=spec.time-1450;
   game.completion=createCompletionState();
   if(game.completion){
    game.completion.startedAt=spec.time-80-spec.morphProgress*2550;
    game.completion.lineStartedAt=renderState.winAt;
    game.completion.rotation={x:0,y:0,z:0};game.completion.velocity={x:0,y:0};
    game.completion.elastic={x:0,y:0,velocityX:0,velocityY:0};game.completion.autoResumeAt=Infinity;
   }
  }
 },
 renderAt:function(time){
  window.__PV_CONTROL__.queuedFrame=null;renderState.frame=0;renderState.lastFrameAt=time;
  window.__PV_CONTROL__.explicitRenders+=1;renderFrame(time);
 },
 status:function(){
  var lesson=game&&game.lesson;
  return{
   instanceId:window.__PV_CONTROL__.instanceId,lessonStep:lesson?lesson.step:0,completion:Boolean(game&&game.completion),
   sourcePathIndex:lesson?lesson.pathIndex:null,
   lessonPoints:lesson?lesson.cells.map(function(cell){var point=Engine.toPoint(game.rules,cell);return[point.x,point.y];}):[],
   lessonSeams:lesson?Array.prototype.slice.call(lesson.seams):[],
   winningPoints:game&&game.winningMask?Array.prototype.slice.call(game.winningMask.cells).map(function(cell){var point=Engine.toPoint(game.rules,cell);return[point.x,point.y];}):[],
   lessonSeamCues:window.__PV_CONTROL__.lessonSeamCues.slice(),
   suppressedTextCalls:window.__PV_CONTROL__.suppressedTextCalls,visiblePromptCalls:window.__PV_CONTROL__.visiblePromptCalls,
   lessonStrokeCalls:window.__PV_CONTROL__.lessonStrokeCalls,paperDots:window.__PV_CONTROL__.paperDots,
   queueSize:window.__PV_CONTROL__.queueSize(),rafRequests:window.__PV_CONTROL__.rafRequests,explicitRenders:window.__PV_CONTROL__.explicitRenders
  };
 }
};
`;

const seamAnchor = "  function drawLessonSeamCue(ctx, lesson, index, from, to, color, pending, pulse, cell, time) {";
function instrumentGameSource(gameSource) {
  if (!gameSource.includes("  initialize();") || !gameSource.includes(seamAnchor)) throw new Error("PV game instrumentation anchors changed");
  return gameSource
    .replace(seamAnchor, `${seamAnchor}\n    window.__PV_CONTROL__.lessonSeamCues.push({ index: index, seam: lesson.seams[index - 1], pending: pending, pathIndex: lesson.pathIndex });`)
    .replace("  initialize();", `${instrument}\n  initialize();`);
}

export class GameRenderAdapter {
  constructor(frame = document.getElementById("game-render-frame")) {
    this.frame = frame;
    this.ready = Promise.resolve();
    this.time = 10000;
  }

  async selectShot(topology, options = {}) {
    const { definition, demo } = findGameRenderShot(topology, options.demo);
    this.definition = definition;
    this.demo = demo;
    this.ready = (async () => {
      const configuredRoot = new URLSearchParams(window.location.search).get("sourceRoot") || "/app";
      const sourceRoot = new URL(`${configuredRoot.replace(/\/$/, "")}/`, window.location.href);
      const hookUrl = new URL("./src/game-render/hook.js", window.location.href);
      const [htmlResponse, gameResponse] = await Promise.all([
        fetch(new URL("index.html", sourceRoot)),
        fetch(new URL("assets/game.js", sourceRoot))
      ]);
      if (!htmlResponse.ok || !gameResponse.ok) throw new Error("Unable to load real game source");
      const [html, game] = await Promise.all([htmlResponse.text(), gameResponse.text()]);
      const css = `<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}html,body,.app-shell,.screens,.screen,.game-screen,#boardStage{background:transparent!important;box-shadow:none!important}body{overflow:hidden}.ambient,.topbar,.match-strip,.game-action-deck,.developer-fab,.sheet,.scrim{display:none!important}.game-screen{padding:0!important}#boardStage{position:fixed!important;inset:0!important;width:640px!important;height:640px!important;max-width:none!important;border:0!important}#boardStage::after{display:none!important}</style>`;
      const gameScript = instrumentGameSource(game).replace(/<\/script/gi, "<\\/script");
      const source = html
        .replace("<head>", `<head><base href="${sourceRoot.href}">${css}<script src="${hookUrl.href}"></script>`)
        .replace('<script src="./assets/game.js"></script>', `<script>${gameScript}</script>`);
      const loaded = new Promise((resolve) => this.frame.addEventListener("load", resolve, { once: true }));
      this.frame.srcdoc = source;
      await loaded;
      await new Promise((resolve, reject) => {
        const deadline = performance.now() + 5000;
        let setupStarted = false;
        const poll = () => {
          const inner = this.frame.contentWindow;
          if (inner?.__PV_GAME__ && !setupStarted) { setupStarted = true; inner.__PV_GAME__.setup(definition.level, demo.sourcePathIndex); }
          if (inner?.__PV_READY__) return resolve();
          if (performance.now() > deadline) return reject(new Error("game render adapter setup timeout"));
          setTimeout(poll, 20);
        };
        poll();
      });
      const readiness = this.renderReady();
      if (!readiness.ready) throw new Error("game render adapter fonts are not ready");
      return readiness;
    })();
    return this.ready;
  }

  renderReady() {
    const doc = this.frame.contentDocument;
    return {
      ready: Boolean(doc?.fonts?.status === "loaded" && this.frame.contentWindow?.__PV_READY__),
      status: this.frame.contentWindow?.__PV_GAME__?.status()
    };
  }

  async render(value = {}) {
    await this.ready;
    if (!this.definition) throw new Error("selectShot must run before render");
    const requestedDemoId = value.demo || this.demo.id;
    const { demo } = findGameRenderShot(this.definition.id, requestedDemoId);
    let state = normalizeRenderState({ ...value, topology: this.definition.id, demo: demo.id });
    if (Object.hasOwn(value, "chapterProgress")) state = chapterStateAt(this.definition, demo, value.chapterProgress);
    const winning = Boolean(state.winningFive || state.shot === "completion");
    const targetStep = winning ? 5 : Math.min(5, state.lessonStep + (state.dropProgress > 0 ? 1 : 0));
    this.time = 10000 + state.breathPhase * 1200 + state.dropProgress * 320 + state.morphProgress * 2550;
    const api = this.frame.contentWindow.__PV_GAME__;
    api.rebuild({ sourcePathIndex: demo.sourcePathIndex, targetStep, dropProgress: state.dropProgress, winning, morphProgress: state.morphProgress, rotation: state.rotation, time: this.time });
    api.renderAt(this.time);
    this.demo = demo;
    return { state, ...api.status() };
  }
}

if (typeof document !== "undefined") window.gameRender = new GameRenderAdapter();
