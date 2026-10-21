"use strict";
// Deterministic browser fixtures, not model performance claims.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "artifacts", "arena-refinement");
const BASE = "756d52d";
const sequence = [0,7,1,8,2,9,3,10,4];
const comments = ["先从边界落子，看看这盘棋会怎样绕回来。","对手选择了边上，我也留住相邻的一条线。","沿着这条线继续展开，同时观察另一侧。","两侧其实相连，不能只看眼前这一小块。"];
async function ready(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function shot(page, name) { await ready(page); await page.screenshot({ path:path.join(EVIDENCE,name), animations:"disabled" }); }
async function main() {
  fs.mkdirSync(EVIDENCE,{recursive:true});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),"arena-desktop-"));
  const app = await startServer({port:0,dataDir:temp,writeRuntime:false});
  const browser = await chromium.launch({headless:true});
  const baseline = Object.fromEntries(["index.html","arena.js","arena.css"].map(name => [name,execFileSync("git",["show",BASE+":arena/public/"+name],{cwd:ROOT})]));
  const host = {hostAuthorized:true};
  const call = (name,args) => app.arena.call(name,args,host);
  function create(title="曲面上的相遇") {
    const s=call("arena_create",{topology:"torus",mode:"duel",title}), gameId=s.gameId, tokens={};
    for(const [role,name] of [["black","墨白"],["white","听雨"],["commentator","场边客"]])tokens[role]=call("arena_join",{...call("arena_invite",{gameId,role}),name}).token;
    call("arena_control",{gameId,action:"start"});
    return {gameId,tokens};
  }
  const results=[];
  try {
    for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:1024,height:768},{width:1440,height:1080}]) {
      const size=viewport.width+"x"+viewport.height;
      const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:"reduce"});
      const page=await context.newPage(), errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
      await page.goto(app.url+"/#host="+app.hostToken);
      // Each context is fresh; previous fixture matches may be selected by boot.
      if(await page.locator("#new-button").isVisible())await page.locator("#new-button").click();
      await page.locator("#create-button").waitFor({state:"visible"});
      await shot(page,"home-"+size+".png");
      await page.locator("#match-title").fill("邀请测试");
      await page.locator("#create-button").click();
      await page.locator("#match").waitFor({state:"visible"});
      assert.equal(await page.locator("#commentary").isVisible(), false, "commentary defaults off without reserved space");
      await page.locator('[data-invite="black"]').click();
      await page.locator("#invite-dialog").waitFor({state:"visible"});
      const invitation=await page.locator("#invite-text").inputValue();
      assert.ok(invitation.includes("arena_resign") && invitation.includes("arena_draw") && invitation.includes("SKILL.md"));
      assert.ok(!invitation.includes("{{") && !invitation.includes(app.hostToken));
      const abandoned=call("arena_list").matches[0];call("arena_control",{gameId:abandoned.gameId,action:"stop"});
      const {gameId,tokens}=create();
      await page.goto(app.url+"/?game="+gameId+"#host="+app.hostToken);
      await page.locator("#match").waitFor({state:"visible"});
      const oldContext=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:"reduce"});
      const before=await oldContext.newPage();
      await before.route("**/*",async route=>{const url=new URL(route.request().url());const name=url.pathname==="/"?"index.html":url.pathname.slice(1);if(baseline[name])await route.fulfill({body:baseline[name],contentType:name.endsWith("css")?"text/css":name.endsWith("js")?"text/javascript":"text/html"});else await route.continue();});
      await before.goto(app.url+"/?game="+gameId+"#host="+app.hostToken);
      await before.locator("#match").waitFor({state:"visible"});
      await shot(before,"before-empty-"+size+".png");await shot(page,"empty-"+size+".png");
      for(let i=0;i<4;i++)call("arena_move",{gameId,token:tokens[i%2?"white":"black"],cell:sequence[i],expectedVersion:i,requestId:"qa-"+i,explanation:comments[i]});
      call("arena_speak",{gameId,token:tokens.commentator,kind:"commentary",ply:4,text:"双方都在边界附近展开。环面的另一侧并不遥远，接下来要留意跨边界的连线。"});
      await page.waitForFunction(()=>document.getElementById("board").getAttribute("aria-label").includes("第 4 手"));
      await before.waitForFunction(()=>document.getElementById("board").getAttribute("aria-label").includes("第 4 手"));
      await shot(before,"before-live-"+size+".png");await shot(page,"live-"+size+".png");
      const geometry=await page.evaluate(()=>{
        const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const bubble=document.querySelector(".speech-bubble"), style=getComputedStyle(bubble);
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:rect("board"),commentary:rect("commentary"),bubble:{background:style.backgroundImage,shadow:style.boxShadow},text:document.getElementById("match").innerText};
      });
      assert.ok(geometry.scrollWidth<=viewport.width);
      assert.ok(geometry.board.width>=300 && geometry.board.height>=220);
      assert.ok(geometry.board.bottom<=geometry.commentary.y);
      assert.ok(geometry.commentary.bottom<=viewport.height-35);
      assert.notEqual(geometry.bubble.background,"none");assert.notEqual(geometry.bubble.shadow,"none");
      for(const unwanted of ["坐标从左上角开始","公开表达","正在决策","等待棋手说棋","落子说明"])assert.ok(!geometry.text.includes(unwanted));
      await oldContext.close();
      await page.locator(".host-options summary").click();await page.locator("#commentary-toggle").click();
      await page.locator("#commentary").waitFor({state:"hidden"});await page.locator(".host-options summary").click();
      const quietBoard=await page.locator("#board").boundingBox();
      assert.ok(quietBoard.height>geometry.board.height+100, "disabled commentary releases its layout space");
      await shot(page,"no-commentary-"+size+".png");
      await page.reload();await page.locator("#match").waitFor({state:"visible"});assert.equal(await page.locator("#commentary").isVisible(),false);
      await page.locator(".host-options summary").click();await page.locator("#commentary-toggle").click();
      await page.locator("#commentary").waitFor({state:"visible"});await page.locator(".host-options summary").click();
      await page.locator("#surface-view").click();await page.waitForFunction(()=>document.getElementById("view-range").value==="100");await shot(page,"surface-"+size+".png");await page.locator("#flat-view").click();
      await page.locator("#pause-button").click();await page.locator("#resume-button").click();
      const offer=call("arena_draw",{gameId,token:tokens.black,action:"offer",expectedVersion:4,requestId:"draw-offer"});
      await page.locator("#board-notice").waitFor({state:"visible"});await shot(page,"draw-offer-"+size+".png");
      call("arena_draw",{gameId,token:tokens.white,action:"accept",offerId:offer.drawOffer.id,expectedVersion:4,requestId:"draw-accept",reason:"这局就此握手。"});
      await page.waitForFunction(()=>document.getElementById("turn-label").textContent==="双方和棋");await shot(page,"draw-"+size+".png");
      await page.locator("#replay-range").fill("2");await page.locator("#replay-range").dispatchEvent("input");await shot(page,"replay-"+size+".png");
      const downloadPromise=page.waitForEvent("download");await page.locator("#export-button").click();const download=await downloadPromise;const data=JSON.parse(fs.readFileSync(await download.path(),"utf8"));assert.equal(data.winReason,"draw_agreement");assert.ok(!JSON.stringify(data).includes(tokens.black));
      await page.reload();await page.locator("#match").waitFor({state:"visible"});await page.locator("#timeline-button").click();await page.locator("#timeline-dialog").waitFor({state:"visible"});assert.ok((await page.locator("#timeline").innerText()).includes("双方同意和棋"));await page.locator("#timeline-dialog [data-close]").click();
      const conceded=create("一局已定");call("arena_move",{gameId:conceded.gameId,token:conceded.tokens.black,cell:0,expectedVersion:0,requestId:"first"});call("arena_resign",{gameId:conceded.gameId,token:conceded.tokens.white,expectedVersion:1,requestId:"resign",reason:"我认输。"});
      await page.goto(app.url+"/?game="+conceded.gameId);await page.waitForFunction(()=>document.getElementById("turn-label").textContent.includes("认输"));await shot(page,"resign-"+size+".png");
      const winning=create("五连终局");for(let i=0;i<sequence.length;i++)call("arena_move",{gameId:winning.gameId,token:winning.tokens[i%2?"white":"black"],cell:sequence[i],expectedVersion:i,requestId:"winning-"+i});await page.goto(app.url+"/?game="+winning.gameId);await page.waitForFunction(()=>document.getElementById("turn-label").textContent==="黑方获胜");
      assert.deepEqual(errors,[]);results.push({viewport,board:geometry.board,errors,result:"passed"});await context.close();
    }
    fs.writeFileSync(path.join(EVIDENCE,"verification.json"),JSON.stringify({baseline:BASE,fixture:"Deterministic four-move torus, same state before/after; scripted speech, not model dialogue.",checks:["16:9 and 4:3 desktop","floating speech","reduced labels","commentary defaults off, releases layout space, and stays off after reload","host commentary toggle","invitations from editable prompts","SSE","2D/3D","pause/resume","draw offer/accept","resignation","five-stone result","replay/export","no overflow or browser errors"],results},null,2)+"\n");
    console.log("Arena desktop QA passed: "+results.length+" viewports.");
  } finally {await browser.close();await app.close();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
