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
    const content = baseline ? execFileSync('git',['show',baseline+':'+localPath.replace(/^\//,'').replace(/^dist\/web\//,'app/')],{cwd:root,maxBuffer:5*1024*1024}) : fs.readFileSync(file);
    res.end(content);
  }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(args.includes('--serve') ? 8769 : 0, '127.0.0.1', resolve));
  if (args.includes('--serve')) { console.log('Preview: http://localhost:8769/show/topology-gomoku/index.html'); return; }
  const browser = await engine.launch({headless:true});
  try {
    for (const [width,height,embedded,webBuild] of [[390,674,false,false],[390,674,true,false],[390,560,true,false],[390,844,false,false],[900,560,true,false],[390,674,false,true],[1440,900,false,true]]) {
      const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:2});
      await page.addInitScript(() => localStorage.setItem('topology-gomoku:v1',JSON.stringify({unlocked:6,learnedLevels:[],sound:false})));
      const errors=[]; page.on('pageerror',err => errors.push(err.message));
      await page.goto('http://localhost:'+server.address().port+(embedded?'/embed':webBuild?'/show/topology-gomoku/index.html':'/app/index.html'));
      const frame = embedded ? page.frames().find(f=>f.url().includes('/app/')) : page.mainFrame();
      await frame.locator('[data-level="2"]').click();
      await page.waitForTimeout(1400);
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
          const margin=Math.max(34,Math.min(c.clientWidth,c.clientHeight)*0.115);
          const cell=Math.min((c.clientWidth-2*margin)/6,(c.clientHeight-2*margin)/5);
          return {x:r.x+c.clientWidth/2,y:r.y+c.clientHeight/2+1.5*cell};
        });
        await page.mouse.click(point.x,point.y);
        await frame.locator('#turnStatus').filter({hasText:'走到下边界'}).waitFor();
        console.log(`${name}: element-only resize and bottom-row placement passed`);
      }
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
