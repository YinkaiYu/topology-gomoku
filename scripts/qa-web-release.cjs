// NODE_PATH must expose Playwright. Pass the website worktree root as argv[2].
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2]);
const evidence = path.resolve(__dirname, '../artifacts/release-web-1.41.2');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2'};
const server = http.createServer((req,res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  fs.mkdirSync(evidence,{recursive:true});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true});
  const results=[];
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport,deviceScaleFactor:1});
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('response',response=>{if(response.status()>=400) errors.push(response.url()+':'+response.status());});
      await page.goto(`http://127.0.0.1:${server.address().port}/show/topology-gomoku/`);
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-host-platform'),'web');
      await page.screenshot({path:path.join(evidence,`${viewport.width}-home.png`)});
      await page.locator('[data-mode="duel"]').click();
      await page.locator('[data-level="0"]').click();
      await page.waitForFunction(()=>!document.querySelector('#appShell').classList.contains('is-navigating'));
      await page.locator('#gameSettingsButton').click();
      await page.locator('#settingsSheet').waitFor({state:'visible'});
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#settingsSheet')).transform==='matrix(1, 0, 0, 1, 0, 0)');
      await page.screenshot({path:path.join(evidence,`${viewport.width}-settings.png`)});
      await page.locator('#soundSwitch').click();
      const sound = await page.locator('#soundSwitch').getAttribute('aria-checked');
      await page.locator('#settingsDoneButton').click();
      await page.locator('#settingsSheet').waitFor({state:'hidden'});
      const point=await page.evaluate(()=>{
        const c=document.querySelector('#boardCanvas'),r=c.getBoundingClientRect();
        const layout=TopologyBoardArt.computeLayout(c.clientWidth,c.clientHeight,{width:7,height:7,type:'plane'});
        return {x:r.x+layout.left+3*layout.cell,y:r.y+layout.top+3*layout.cell};
      });
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>document.querySelector('#turnStatus').textContent.includes('白方'));
      await page.screenshot({path:path.join(evidence,`${viewport.width}-move.png`)});
      await page.reload();
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('topology-gomoku:v1')));
      assert.equal(stored.sound,sound==='true');
      assert.deepEqual(errors,[]);
      results.push({viewport,host:'web',settings:true,move:'white-to-play',preferencesPersisted:true,errors});
      await context.close();
    }
    fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({subpath:'/show/topology-gomoku/',results},null,2)+'\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
