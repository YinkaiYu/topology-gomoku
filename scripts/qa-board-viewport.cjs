// Run with NODE_PATH pointing to a Playwright installation.
const { chromium, webkit } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const engine = args.includes('--webkit') ? webkit : chromium;
const label = args.find(x => x.startsWith('--label='))?.split('=')[1] || 'before';
const baseline = args.find(x => x.startsWith('--baseline='))?.split('=')[1];
const shortPanel = args.includes('--short-panel');
const home = args.includes('--home');
const cardSizes = args.includes('--card-sizes');
const duel = args.includes('--duel');

async function checkHome(page, frame, name) {
  await frame.locator('.level-card').first().waitFor();
  if (duel) await frame.locator('[data-mode="duel"]').click();
  await frame.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const metrics = await frame.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};
    };
    const scroller = document.querySelector('.home-scroll');
    return {
      viewport: {width:innerWidth,height:innerHeight},
      scroll: {...rect(scroller), clientHeight:scroller.clientHeight,scrollHeight:scroller.scrollHeight,
        gutter:scroller.offsetWidth-scroller.clientWidth,overflow:getComputedStyle(scroller).overflowY},
      cards: Array.from(document.querySelectorAll('.level-card'), card => ({
        card:rect(card), glyph:rect(card.querySelector('.level-glyph')),
        mystery:rect(card.querySelector('.level-mystery') || card.querySelector('.level-glyph')),
        revealed:card.classList.contains('is-revealed') || !card.querySelector('.level-mystery'),
        type:rect(card.querySelector('.level-type')),name:rect(card.querySelector('.level-name')),
        horizontal:getComputedStyle(card.querySelector('.level-type')).gridColumnStart==='2'
      }))
    };
  });
  await page.screenshot({path:path.join(root,'artifacts',`qa-home-${label}-${name}.png`)});
  console.log(JSON.stringify({name,home:metrics}));
  if (label === 'before') return;
  assert.equal(metrics.scroll.gutter,0,`${name}: scrollbar must not reserve a gutter`);
  assert.ok(metrics.scroll.bottom<=metrics.viewport.height+1,`${name}: scroller must fit viewport`);
  assert.equal(metrics.scroll.overflow,'hidden');
  assert.ok(metrics.scroll.scrollHeight<=metrics.scroll.clientHeight+1,`${name}: home must fit without scrolling`);
  for (const {card,glyph,mystery,revealed,type,name:title,horizontal} of metrics.cards) {
    const icon = revealed ? glyph : mystery;
    assert.ok(card.x>=0 && card.right<=metrics.viewport.width+1,`${name}: no horizontal overflow`);
    for(const child of [icon,type,title]) {
      assert.ok(child.y>=card.y+3 && child.bottom<=card.bottom-3,`${name}: card content fits with padding`);
      assert.ok(child.x>=card.x+3 && child.right<=card.right-3,`${name}: card content fits horizontally`);
    }
    if(cardSizes) {
      assert.ok(type.height>=10 && type.height<=13,`${name}: readable single-line topology label`);
      assert.ok(title.height>=17,`${name}: readable level name`);
    }
    if(!horizontal) assert.ok(icon.bottom+3<=type.y,`${name}: icon and label must not overlap`);
    else assert.ok(icon.right+3<=type.x,`${name}: horizontal icon and label must not overlap`);
    if(horizontal && metrics.viewport.height<=700) {
      assert.ok(Math.abs((type.y+title.bottom-card.y-card.bottom)/2)<0.6,`${name}: label group must be vertically centered`);
    }
    assert.ok(type.bottom<=title.y,`${name}: labels must not overlap`);
    assert.ok(card.y>=0 && card.bottom<=metrics.viewport.height+1,`${name}: all cards visible`);
  }
  await page.mouse.move(metrics.scroll.x+metrics.scroll.width/2,Math.min(metrics.scroll.bottom-30,300));
  await page.mouse.wheel(0,1500);
  await page.waitForTimeout(250);
  assert.equal(await frame.evaluate(() => document.querySelector('.home-scroll').scrollTop),0,`${name}: wheel must not move home`);
  if(engine === chromium) {
    const cdp=await page.context().newCDPSession(page);
    const x=metrics.scroll.x+metrics.scroll.width/2;
    const y=Math.min(metrics.scroll.bottom-20,280);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let delta=20;delta<=120;delta+=20) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta}]});
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
    await page.waitForTimeout(250);
    assert.equal(await frame.evaluate(() => document.querySelector('.home-scroll').scrollTop+document.querySelector('.home-screen').scrollTop+document.querySelector('.app-shell').scrollTop),0,`${name}: swipe must not move home`);
  }
  // Keyboard navigation must reach the last card without moving the screen.
  await frame.locator('[data-level="0"]').focus();
  for(let i=0;i<6;i++) await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.dataset.level),'6');
  const focused=await frame.locator('[data-level="6"]').boundingBox();
  assert.ok(focused.y>=0 && focused.y+focused.height<=metrics.viewport.height+1,`${name}: focused last card visible`);
  assert.equal(await frame.evaluate(() => document.querySelector('.home-scroll').scrollTop),0);
  // Open the last unlocked card and return to the fixed catalogue.
  await frame.evaluate(() => {
    const data=JSON.parse(localStorage.getItem('topology-gomoku:v1'));
    data.unlocked=6;
    localStorage.setItem('topology-gomoku:v1',JSON.stringify(data));
  });
  await page.reload();
  frame = page.frames().find(f=>f.url().includes('/app/')) || page.mainFrame();
  await frame.locator('[data-level="6"]').click();
  await page.waitForTimeout(1200);
  await frame.locator('#backButton').click();
  await page.waitForTimeout(900);
  const returned=await frame.locator('[data-level="6"]').boundingBox();
  assert.ok(returned.y>=0 && returned.y+returned.height<=metrics.viewport.height+1,`${name}: return keeps selected card visible`);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/embed') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe src="http://127.0.0.1:' + server.address().port + '/app/index.html"></iframe>');
  }
  const localPath = url.pathname.replace(/^\/show\/topology-gomoku\//, '/dist/web/');
  const file = path.resolve(root, '.' + decodeURIComponent(localPath));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
  try {
    res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
    let content = baseline ? execFileSync('git',['show',baseline+':'+localPath.replace(/^\//,'').replace(/^dist\/web\//,'app/')],{cwd:root,maxBuffer:5*1024*1024}) : fs.readFileSync(file);
    if (baseline && localPath === '/dist/web/index.html') {
      content=content.toString().replace('<html lang="zh-CN">','<html lang="zh-CN" data-host-platform="web">');
    }
    res.end(content);
  }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(args.includes('--serve') ? 8769 : 0, '127.0.0.1', resolve));
  if (args.includes('--serve')) { console.log('Preview: http://localhost:8769/show/topology-gomoku/index.html'); return; }
  const browser = await engine.launch({headless:true});
  try {
    const scenarios = home && cardSizes ? [[390,674,true,false],[390,844,false,false],[390,844,false,true],[390,760,false,false],[320,568,false,false],[390,480,true,false],[700,320,true,false],[700,480,true,false],[1440,900,false,true]] : home ? [[466,620,false,true],[497,561,false,true],[700,480,true,false],[390,480,true,false],[320,480,true,false],[700,320,true,false],[390,844,false,true],[1440,900,false,true],[390,674,false,false]] : shortPanel ? [[497,561,false,true],[700,480,true,false]] : [[390,674,false,false],[390,674,true,false],[390,560,true,false],[390,844,false,false],[900,560,true,false],[390,674,false,true],[1440,900,false,true]];
    for (const [width,height,embedded,webBuild] of scenarios) {
      const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:2});
      if (args.includes('--offline-sdk')) {
        // Exercise the Toy adapter's no-SDK fallback locally; this is not a
        // substitute for the real Toy-host preview.
        await page.route('**/toy-sdk.js', route => route.fulfill({contentType:'text/javascript',body:''}));
      }
      await page.addInitScript(({home,learned}) => {
        if (!localStorage.getItem('topology-gomoku:v1')) localStorage.setItem('topology-gomoku:v1',JSON.stringify({unlocked:home?1:6,completed:home?[true]:[],learnedLevels:learned?[1]:[],sound:false}));
      }, {home,learned:shortPanel});
      const errors=[]; page.on('pageerror',err => errors.push(err.message));
      await page.goto('http://localhost:'+server.address().port+(embedded?'/embed':webBuild?'/show/topology-gomoku/index.html':'/app/index.html'));
      const frame = embedded ? page.frames().find(f=>f.url().includes('/app/')) : page.mainFrame();
      if(home) {
        await checkHome(page,frame,`${cardSizes?'cards-':''}${duel?'duel-':''}${engine.name()}-${width}x${height}-${embedded?'iframe':webBuild?'web-build':'default'}`);
        assert.deepEqual(errors,[]);
        await page.close();
        continue;
      }
      await frame.locator(`[data-level="${shortPanel?1:2}"]`).click();
      await page.waitForTimeout(1400);
      if (shortPanel) { await frame.locator('#boardCanvas').click(); await page.waitForTimeout(150); }
      const metrics=await frame.evaluate(() => {
        const result={host:document.documentElement.dataset.hostLayout};
        for(const selector of ['.game-screen','.board-stage','#boardCanvas','.game-tools']) {
          const el=document.querySelector(selector); if(!el) continue;
          const r=el.getBoundingClientRect(); result[selector]={x:r.x,y:r.y,width:r.width,height:r.height};
          if(el.tagName==='CANVAS') result.backing={width:el.width,height:el.height};
        }
        return result;
      });
      const name=`${engine.name()}-${width}x${height}-${embedded?'iframe':webBuild?'web-build':'default'}`;
      if(label !== 'before') {
        const panel=metrics['.board-stage'], canvas=metrics['#boardCanvas'];
        assert.ok(Math.abs(canvas.width-panel.width+2)<1.1 && Math.abs(canvas.height-panel.height+2)<1.1, `${name}: canvas must fit panel`);
        assert.ok(Math.abs(metrics.backing.width / 2-canvas.width)<1.1 && Math.abs(metrics.backing.height / 2-canvas.height)<1.1,`${name}: bitmap must match layout`);
        const tools=metrics['.game-tools'];
        assert.ok(tools.y+tools.height<=height+1,`${name}: tools must remain visible`);
        assert.deepEqual(errors,[]);
      }
      await page.screenshot({path:path.join(root,'artifacts',`qa-board-viewport-${label}-${name}.png`)});
      console.log(JSON.stringify({name,metrics,errors}));
      if (width === 390 && embedded) {
        // No window resize: simulate a host/control layout change and check
        // that the observer updates the bitmap and the bottom-row hit target.
        await frame.evaluate(() => document.querySelector('.board-stage').style.height='220px');
        await page.waitForTimeout(250);
        await page.screenshot({path:path.join(root,'artifacts',`qa-board-viewport-${label}-${name}-panel-resize.png`)});
        if (label === 'before') { await page.close(); continue; }
        await frame.waitForFunction(() => {
          const c=document.querySelector('#boardCanvas');
          return Math.abs(c.height/2-c.clientHeight)<1 && c.clientHeight<=220;
        });
        const point=await frame.evaluate(() => {
          const c=document.querySelector('#boardCanvas'),r=c.getBoundingClientRect();
          const layout=window.TopologyBoardArt.computeLayout(c.clientWidth,c.clientHeight,{width:7,height:6});
          return {x:r.x+layout.left+3*layout.cell,y:r.y+layout.top+4*layout.cell};
        });
        await page.mouse.click(point.x,point.y);
        await frame.locator('#turnStatus').filter({hasText:'走到下边界'}).waitFor();
        console.log(`${name}: element-only resize and bottom-row placement passed`);
      }
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
