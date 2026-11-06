// Replays the isolated color fix; current boundary geometry has a separate QA.
// Requires an existing Playwright installation; --serve keeps the preview open.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const baseline = args.find(arg => arg.startsWith('--baseline='))?.slice(11) || '76bef39';
const corrected = '9eaf057';
const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7)) || 4328;
const output = path.join(root, 'artifacts', 'sphere-seam-colors');
const cache = new Map();

function source(file, before) {
  const key = (before ? baseline : corrected) + ':' + file;
  if (!cache.has(key)) cache.set(key, execFileSync('git', ['show', key], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
  return cache.get(key);
}

function preview(before) {
  const prefix = before ? '/before/' : '/after/';
  const index = source('app/index.html', before).toString();
  // Keep the production dimension controls, icons, liquid material and behavior.
  const controls = index.slice(index.indexOf('<div class="dimension-control"'), index.indexOf('<div class="game-action-deck"')).replace(' hidden>', '>');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>归圆</title>
<link rel="stylesheet" href="${prefix}app/assets/style.css">
<style>
  body {background:var(--paper)}
  .qa-stage {width:min(660px,92vw);height:calc(100dvh - 48px);margin:24px auto;display:flex;flex-direction:column;align-items:center;--game-control-row-size:56px;--game-control-column-gap:12px}
  .qa-heading {display:flex;align-items:center;gap:12px;height:56px;flex:0 0 56px;font-size:28px;font-weight:400;letter-spacing:.06em}
  .qa-heading canvas {width:40px;height:40px}
  .qa-board {position:relative;flex:1;min-height:0;width:100%;touch-action:none}
  .qa-board canvas {position:absolute;width:100%;height:100%;inset:0}
  .qa-stage .dimension-control {flex:0 0 56px;width:90%;margin:8px 0 0}
  .qa-stage button:focus-visible,.qa-stage .dimension-range:has(.dimension-slider:focus-visible) .dimension-glass-thumb {outline:none}
</style>
<main class="qa-stage"><h1 class="qa-heading"><canvas id="glyph" aria-hidden="true"></canvas><span id="name">归圆</span></h1><div class="qa-board"><canvas id="board" aria-label="空棋盘"></canvas></div>${controls}</main>
<script src="${prefix}app/assets/topology.js"></script><script src="${prefix}app/assets/topology-morph.js"></script><script src="${prefix}app/assets/level-config.js"></script><script src="${prefix}app/assets/board-art.js"></script><script src="${prefix}app/assets/liquid-range.js"></script>
<script>
const Art=TopologyBoardArt, Liquid=TopologyLiquidRange;
const params=new URLSearchParams(location.search);
const type=params.get('type')||'sphere';
const level={...TopologyGameContent.LEVELS.find(level=>level.topology===type),width:7,height:7};
const rules=TopologyGomoku.createRules({type,width:7,height:7,target:5});
const game={level,rules,board:new Array(49).fill(0),mode:'duel',status:'playing',lastMove:-1,lastMoveAt:0,winningMask:null,winAt:0};
document.getElementById('name').textContent=level.name;
const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const input=document.getElementById('dimensionSlider');
const rotation={x:0,y:0,z:0};
let morph=Number(params.get('progress'))||0, animation=null, range;
function draw(){
  const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);Art.setContextPixelRatio(ctx,dpr);
  ctx.fillStyle=Art.TOKENS.paper;ctx.fillRect(0,0,rect.width,rect.height);
  const layout=Art.computeLayout(rect.width,rect.height,rules);
  const settings={game,layout,time:2000,morph,rotation,fontFamily:'"Topo Serif",serif'};
  if(morph>0) Art.drawCompletion(ctx,settings);else Art.drawBoard(ctx,settings);
  range?.sync(morph,false);
  document.getElementById('viewFlatButton').setAttribute('aria-pressed',String(morph===0));
  document.getElementById('viewSpatialButton').setAttribute('aria-pressed',String(morph===1));
}
function change(target,animate,touch){
  cancelAnimationFrame(animation);target=Math.max(0,Math.min(1,target));
  if(!animate){morph=target;draw();return;}
  const from=morph,start=performance.now(),duration=Liquid.duration(target-from,touch);
  function frame(now){const progress=Math.min(1,(now-start)/duration);morph=Math.max(0,Math.min(1,from+(target-from)*Liquid.glide(progress)));draw();if(progress<1)animation=requestAnimationFrame(frame);}
  animation=requestAnimationFrame(frame);
}
range=Liquid.bind({control:document.getElementById('dimensionRange'),input,thumb:document.getElementById('dimensionThumb'),isEnabled:()=>true,onBusy:()=>{},onChange:change});
document.getElementById('viewFlatButton').onclick=()=>change(0,true,false);
document.getElementById('viewSpatialButton').onclick=()=>change(1,true,false);
let drag=null;
canvas.addEventListener('pointerdown',event=>{if(morph<=0)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!drag)return;rotation.y+=(event.clientX-drag.x)*.006;rotation.x+=(event.clientY-drag.y)*.006;drag={x:event.clientX,y:event.clientY};draw();});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
window.qa={render:value=>change(value,false,false),get progress(){return morph;}};
const glyph=document.getElementById('glyph');glyph.width=80;glyph.height=80;const glyphCtx=glyph.getContext('2d');glyphCtx.scale(2,2);Art.drawTopologyGlyph(glyphCtx,type,{x:0,y:0,width:40,height:40});
new ResizeObserver(draw).observe(canvas.parentElement);
document.fonts.ready.then(()=>{draw();window.qa.ready=true;});
</script></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(preview(url.searchParams.get('revision') === 'before'));
    return;
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const match = url.pathname.match(/^\/(before|after)\/(app\/assets\/[a-zA-Z0-9_./-]+)$/);
  if (!match || match[2].includes('..')) { res.writeHead(404); res.end(); return; }
  try {
    const content = source(match[2], match[1] === 'before');
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', types[path.extname(match[2])] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});

async function verify(url) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
  const results = { baseline, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, board: { width: 7, height: 7, empty: true, time: 2000 }, frames: [], unchanged: [], interaction: {}, geometry: {} };
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const progress of [0, .25, .5, .7, 1]) {
      const hashes = {};
      for (const revision of ['before', 'after']) {
        await page.goto(url + '?revision=' + revision + '&progress=' + progress);
        await page.waitForFunction(() => window.qa?.ready);
        const name = revision + '-sphere-' + String(progress).replace('.', '-') + '-1280x720.png';
        await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
        hashes[revision] = digest(await page.evaluate(() => document.getElementById('board').toDataURL()));
        results.frames.push({ revision, progress, file: 'artifacts/sphere-seam-colors/' + name, canvasSha256: hashes[revision] });
      }
      if (progress === 0 || progress === 1) assert.equal(hashes.before, hashes.after, 'Sphere endpoints are unchanged');
      else assert.notEqual(hashes.before, hashes.after, 'Intermediate sphere boundaries are corrected');
    }
    for (const type of ['plane', 'cylinder', 'torus', 'mobius', 'klein', 'projective']) {
      const hashes = {};
      for (const revision of ['before', 'after']) {
        await page.goto(url + '?revision=' + revision + '&type=' + type + '&progress=0.5');
        await page.waitForFunction(() => window.qa?.ready);
        hashes[revision] = digest(await page.evaluate(() => document.getElementById('board').toDataURL()));
      }
      assert.equal(hashes.before, hashes.after, type + ': no pixel regression');
      results.unchanged.push({ type, progress: .5, sha256: hashes.after });
    }
    await page.goto(url);
    await page.waitForFunction(() => window.qa?.ready);
    await page.locator('#viewSpatialButton').click();
    await page.waitForFunction(() => window.qa.progress === 1);
    await page.locator('#viewFlatButton').click();
    await page.waitForFunction(() => window.qa.progress === 0);
    const track = await page.locator('#dimensionRange').boundingBox();
    await page.mouse.move(track.x + 14, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 12 });
    await page.mouse.up();
    const dragged = await page.evaluate(() => window.qa.progress);
    assert.ok(dragged > .4 && dragged < .6, 'Liquid slider drags to the middle');
    results.interaction = { flatButton: true, spatialButton: true, sliderDragProgress: dragged };
    const Morph = require(path.join(root, 'app/assets/topology-morph.js'));
    let maximumDistance = 0;
    for (let sample = 0; sample <= 128; sample++) {
      const t = sample / 128;
      for (const [first, second] of [[[t, 0], [0, t]], [[t, 1], [1, t]]]) {
        const a = Morph.surfacePoint('sphere', ...first), b = Morph.surfacePoint('sphere', ...second);
        maximumDistance = Math.max(maximumDistance, Math.hypot(...a.map((value, i) => value - b[i])));
      }
    }
    assert.ok(maximumDistance < 1e-9, 'Adjacent same-color sphere edges meet');
    results.geometry = { samplesPerPair: 129, pairs: ['top-left', 'bottom-right'], maximumDistance };
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify({ frames: results.frames.length, nonSphereComparisons: results.unchanged.length, interaction: results.interaction, geometry: results.geometry }));
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(args.includes('--serve') ? port : 0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  if (args.includes('--serve')) { console.log('Preview: ' + url); return; }
  try { await verify(url); } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
