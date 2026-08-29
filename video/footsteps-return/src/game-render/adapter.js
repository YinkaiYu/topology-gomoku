import { findGameRenderShot } from "../data/game-render-shots.js";

export const RENDER_API_METHODS = Object.freeze(["selectShot", "render", "renderReady"]);
const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
export function normalizeRenderState(value = {}) {
  return Object.freeze({
    topology: String(value.topology || "plane"), shot: value.shot === "completion" ? "completion" : "helper", demo: String(value.demo || ""),
    chapterProgress: clamp(value.chapterProgress), lessonStep: Math.max(0, Math.min(5, Math.trunc(value.lessonStep || 0))),
    dropProgress: clamp(value.dropProgress), breathPhase: clamp(value.breathPhase), morphProgress: clamp(value.morphProgress),
    rotation: Object.freeze({ x: Number(value.rotation?.x) || 0, y: Number(value.rotation?.y) || 0, z: Number(value.rotation?.z) || 0 }),
    freezeRotation: value.freezeRotation !== false
  });
}

export function chapterStateAt(definition, demo, progress) {
  const p = clamp(progress); const crossings = new Set(demo.crossings); const units = [];
  units.push({ phase: "establish", weight: 1 });
  for (let step = 1; step <= 5; step += 1) {
    if (crossings.has(step)) units.push({ phase: "breathe", step, weight: 2 });
    units.push({ phase: "drop", step, weight: 1 });
  }
  units.push({ phase: "win-hold", step: 5, weight: 1.25 }, { phase: "morph", weight: 4 }, { phase: "settled", weight: 1 }, { phase: "rotation", weight: 1.5 });
  const total = units.reduce((sum, unit) => sum + unit.weight, 0); let cursor = p * total; let selected = units.at(-1); let local = 1;
  for (const unit of units) { if (cursor <= unit.weight) { selected = unit; local = cursor / unit.weight; break; } cursor -= unit.weight; }
  const completedDrops = units.slice(0, units.indexOf(selected)).filter((unit) => unit.phase === "drop").length;
  return Object.freeze({ phase: selected.phase, lessonStep: selected.phase === "drop" ? selected.step - 1 : completedDrops, pendingStep: selected.step || 0,
    dropProgress: selected.phase === "drop" ? local : 0, breathPhase: selected.phase === "breathe" ? local : 0,
    winningFive: ["win-hold","morph","settled","rotation"].includes(selected.phase), morphProgress: selected.phase === "morph" ? local : (["settled","rotation"].includes(selected.phase) ? 1 : 0),
    rotation: selected.phase === "rotation" ? { x: -.18 * local, y: .72 * local, z: .04 * local } : { x: 0, y: 0, z: 0 }, topology: definition.topology, demo: demo.id });
}

const instrument = `\nwindow.__PV_GAME__={\n setup:function(level,path){startLevel(level,{introMode:"none"});setTimeout(function(){window.__PV_CONTROL__.frozen=true;startBoundaryLesson();activateLessonPath(game.lesson,path);window.__PV_CONTROL__.mode="helper";window.__PV_CONTROL__.suppressedTextCalls=0;window.__PV_CONTROL__.visiblePromptCalls=0;window.__PV_CONTROL__.lessonStrokeCalls=0;window.__PV_CONTROL__.paperDots=0;window.__PV_READY__=true;},140)},\n advance:function(step,time,progress){while(game.lesson&&game.lesson.step<step){performMove(game.lesson.cells[game.lesson.step],HUMAN);}renderState.lastMoveAt=progress>0?time-progress*320:0;},\n completion:function(progress,rotation,time){if(!game.completion){game.status="ended";game.outcome="win";if(game.lesson)game.lesson.active=false;game.completion=createCompletionState();}window.__PV_CONTROL__.morph=progress;window.__PV_CONTROL__.rotation=rotation;if(game.completion){game.completion.startedAt=time-80-progress*2550;game.completion.rotation={x:0,y:0,z:0};game.completion.velocity={x:0,y:0};game.completion.elastic={x:0,y:0,velocityX:0,velocityY:0};}},\n renderAt:function(time){renderState.lastFrameAt=time;renderFrame(time)},\n status:function(){return{lessonStep:game&&game.lesson?game.lesson.step:0,completion:Boolean(game&&game.completion),suppressedTextCalls:window.__PV_CONTROL__.suppressedTextCalls,visiblePromptCalls:window.__PV_CONTROL__.visiblePromptCalls,lessonStrokeCalls:window.__PV_CONTROL__.lessonStrokeCalls,paperDots:window.__PV_CONTROL__.paperDots}}\n};\n`;

export class GameRenderAdapter {
  constructor(frame = document.getElementById("game-render-frame")) { this.frame = frame; this.ready = Promise.resolve(); this.lastStep = 0; this.time = 10000; }
  async selectShot(topology, options = {}) {
    const { definition, demo } = findGameRenderShot(topology, options.demo); this.definition = definition; this.demo = demo; this.lastStep = 0;
    this.ready = (async () => {
      const [html, game] = await Promise.all([fetch("/app/index.html").then((r) => r.text()), fetch("/app/assets/game.js").then((r) => r.text())]);
      const css = `<style>html,body,.app-shell,.screens,.screen,.game-screen,#boardStage{background:transparent!important;box-shadow:none!important}body{overflow:hidden}.ambient,.topbar,.match-strip,.game-action-deck,.developer-fab,.sheet,.scrim{display:none!important}.game-screen{padding:0!important}#boardStage{position:fixed!important;inset:0!important;width:640px!important;height:640px!important;max-width:none!important;border:0!important}#boardStage:after{display:none!important}</style>`;
      let source = html.replace("<head>", `<head><base href="/app/">${css}<script src="/video/footsteps-return/src/game-render/hook.js"></script>`).replace('<script src="./assets/game.js"></script>', `<script>${game.replace(/<\/script/gi,"<\\/script").replace("  initialize();", instrument + "  initialize();")}</script>`);
      const loaded = new Promise((resolve) => this.frame.addEventListener("load", resolve, { once: true }));
      this.frame.srcdoc = source;
      await loaded;
      await new Promise((resolve, reject) => { const deadline = performance.now() + 5000; let setupStarted = false; const poll = () => { const w = this.frame.contentWindow; if (w?.__PV_GAME__ && !setupStarted) { setupStarted = true; w.__PV_GAME__.setup(definition.level, definition.demos.indexOf(demo)); } if (w?.__PV_READY__) return resolve(); if (performance.now() > deadline) return reject(new Error("game render adapter setup timeout")); setTimeout(poll, 20); }; poll(); });
      return this.renderReady();
    })();
    return this.ready;
  }
  renderReady() { const doc = this.frame.contentDocument; return { ready: Boolean(doc?.fonts?.status === "loaded" && this.frame.contentWindow?.__PV_READY__), canvas: doc?.getElementById("boardCanvas"), status: this.frame.contentWindow?.__PV_GAME__?.status() }; }
  async render(value = {}) {
    await this.ready; const state = value.chapterProgress === undefined ? normalizeRenderState(value) : chapterStateAt(this.definition, this.demo, value.chapterProgress);
    const win = state.winningFive || state.shot === "completion"; const targetStep = win ? 5 : state.lessonStep + (state.dropProgress > 0 ? 1 : 0);
    this.time = 10000 + (state.breathPhase || state.dropProgress || state.morphProgress || 0) * 1000;
    const api = this.frame.contentWindow.__PV_GAME__; api.advance(Math.max(this.lastStep, targetStep), this.time, state.dropProgress); this.lastStep = Math.max(this.lastStep, targetStep);
    const control = this.frame.contentWindow.__PV_CONTROL__; control.mode = win ? "completion" : "helper"; control.morph = win ? state.morphProgress : null; control.rotation = state.rotation || {x:0,y:0,z:0};
    if (win) api.completion(state.morphProgress, control.rotation, this.time); api.renderAt(this.time); control.flush(this.time);
    return { state, ...api.status() };
  }
}

if (typeof document !== "undefined") { const adapter = new GameRenderAdapter(); window.gameRender = adapter; }
