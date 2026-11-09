"use strict";
// NODE_PATH exposes Playwright; all games and credentials are isolated test data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, "..");
const BASE = "3221f53";
const OUT = path.join(ROOT, "artifacts/arena-toast-layer");
const SAMPLE = "请以黑方参加这场示例对局。\n这是展示复制效果的示例邀请，不包含真实凭证。";
async function layer(page) {
  return page.locator("#toast").evaluate(node => {
    const r = node.getBoundingClientRect();
    return { front: document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node,
      parent: node.parentElement.id || node.parentElement.tagName,
      x:r.x,y:r.y,width:r.width,height:r.height };
  });
}
(async () => {
  fs.mkdirSync(OUT,{recursive:true});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"arena-toast-layer-"));
  const app = await startServer({port:0,dataDir:directory,writeRuntime:false});
  const browser = await chromium.launch({headless:true});
  const baseline = execFileSync("git",["show",`${BASE}:arena/public/arena.js`],{cwd:ROOT});
  const results=[];
  try {
    for (const viewport of [{width:1280,height:720},{width:1024,height:768}]) {
      let before;
      for (const previous of [true,false]) {
        const {gameId} = app.arena.call("arena_create",{topology:"mobius",mode:"duel",clock:null},{hostAuthorized:true});
        const context = await browser.newContext({viewport,permissions:["clipboard-read","clipboard-write"]});
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors=[];page.on("pageerror",error=>errors.push(error.message));
        let clipboard;
        try {
          if(previous) await page.route("**/arena.js",route=>route.fulfill({body:baseline,contentType:"text/javascript"}));
          await page.goto(`${app.url}/?game=${gameId}`);
          await page.locator("#match").waitFor();
          clipboard=await page.evaluate(()=>navigator.clipboard.readText());
          await page.locator("#settings-button").click();
          await page.locator('[data-invite="black"]').click();
          await page.locator("#invite-dialog").waitFor({state:"visible"});
          await page.locator("#invite-text").evaluate((node,text)=>{node.value=text;},SAMPLE);
          await page.evaluate(()=>document.fonts.ready);
          await page.locator("#copy-invite").click();
          await page.locator("#toast:not([hidden])").waitFor();
          const copied = (await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,"\n");
          assert.ok(copied===SAMPLE,"Clipboard matches the fixed example");
          const state=await layer(page);
          assert.equal(state.front,!previous);
          if(previous) before=state;
          else {
            assert.equal(state.parent,"invite-dialog");
            for(const key of ["x","y","width","height"]) assert.equal(state[key],before[key]);
          }
          await page.screenshot({path:path.join(OUT,`${previous?"before":"after"}-${viewport.width}x${viewport.height}.png`)});
          if(!previous) {
            await page.locator("#copy-invite").press("Enter");
            assert.equal((await layer(page)).front,true);
            await page.keyboard.press("Escape");
            assert.equal(await page.locator("#settings-dialog").isVisible(),true);
            await page.locator('[data-invite="white"]').click();
            await page.locator("#invite-dialog").waitFor({state:"visible"});
            await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error("Permission denied in QA");};});
            await page.locator("#invite-text").evaluate((node,text)=>{node.value=text;},SAMPLE);
            await page.locator("#copy-invite").click();
            await page.waitForFunction(()=>document.querySelector("#toast").textContent.includes("请复制"));
            assert.equal((await layer(page)).front,true);
            assert.equal(await page.locator("#invite-text").evaluate(n=>n.selectionEnd-n.selectionStart),SAMPLE.length);
            await page.locator("#toast").waitFor({state:"hidden",timeout:4500});
            await page.keyboard.press("Escape");await page.keyboard.press("Escape");
            await page.locator("#settings-button").click();
            await page.locator("#export-button").click();
            await page.waitForFunction(()=>document.querySelector("#toast").textContent==="已保存");
            assert.equal((await layer(page)).front,true);
            assert.equal((await layer(page)).parent,"settings-dialog");
            await page.keyboard.press("Escape");
            app.arena.call("arena_control",{gameId,action:"stop"},{hostAuthorized:true});
            app.arena.call("arena_delete",{gameId},{hostAuthorized:true});
            await page.waitForFunction(()=>document.querySelector("#toast").textContent==="棋局记录已删除");
            assert.equal((await layer(page)).front,true);
            assert.equal((await layer(page)).parent,"BODY");
          }
          assert.deepEqual(errors,[]);
          results.push({viewport,previous,...state,clipboardMatches:true,errors});
        } finally {
          if(clipboard!==undefined) {
            await page.reload();
            await page.evaluate(text=>navigator.clipboard.writeText(text),clipboard).catch(()=>{});
          }
          await context.close();
        }
      }
    }
    fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify({baseline:BASE,results},null,2)+"\n");
    console.log("Toast QA passed: modal stacking, unchanged placement, repeat/keyboard copy, denial fallback, expiry, export, and page-level feedback.");
  } finally {
    await browser.close();await app.close();
    assert.equal(path.dirname(directory),os.tmpdir());
    assert.ok(path.basename(directory).startsWith("arena-toast-layer-"));
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
