"use strict";
// Synthetic profile fixtures only; no real game credentials or transcripts captured.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process"), { chromium } = require("playwright");
const { startServer } = require("../arena/server.cjs");
const ROOT = path.resolve(__dirname, ".."), BASE = "bd7b447", OUT = path.join(ROOT, "artifacts/arena-lean-avatars");
const VIEWPORTS = [{width:1280,height:720},{width:1920,height:1080},{width:1024,height:768},{width:1440,height:1080}];
async function shot(page,name){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});await page.screenshot({path:path.join(OUT,name),animations:"disabled"});}
async function saveProfile(page,id,name){await page.locator(`[data-avatar="${id}"]`).click();assert.equal(await page.locator("#profile-name").inputValue(),name);await page.locator('#profile-form [type="submit"]').click();await page.locator("#profile-dialog").waitFor({state:"hidden"});}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arena-avatar-qa-"));
 const app=await startServer({port:0,dataDir:dir,writeRuntime:false});const browser=await chromium.launch({headless:true});
 const call=(name,args={})=>app.arena.call(name,args,{hostAuthorized:true});
 const baseline=execFileSync("git",["show",`${BASE}:arena/public/arena.js`],{cwd:ROOT});const results=[];
 try{for(const viewport of VIEWPORTS){const context=await browser.newContext({viewport,reducedMotion:"reduce"});const old=await browser.newContext({viewport,reducedMotion:"reduce"});
 try{const page=await context.newPage(),before=await old.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await before.route("**/arena.js",route=>route.fulfill({body:baseline,contentType:"text/javascript"}));
 await before.goto(app.url);await before.locator("#setup-black").click();await shot(before,`picker-before-${viewport.width}x${viewport.height}.png`);
 await page.goto(app.url);await page.locator("#setup-black").click();await shot(page,`picker-${viewport.width}x${viewport.height}.png`);
 const geometry=await page.evaluate(()=>{const dialog=document.querySelector("#profile-dialog").getBoundingClientRect();const options=[...document.querySelectorAll(".avatar-option")];return {x:dialog.x,y:dialog.y,right:dialog.right,bottom:dialog.bottom,options:options.length,fit:options.every(el=>{const r=el.getBoundingClientRect();return r.x>=dialog.x&&r.right<=dialog.right&&r.bottom<=dialog.bottom;}),images:options.flatMap(el=>[...el.querySelectorAll("img")]).every(img=>img.complete&&img.naturalWidth>0),overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.equal(geometry.options,11);assert.equal(geometry.fit,true);assert.equal(geometry.images,true);assert.equal(geometry.overflow,false);assert.ok(geometry.y>=0&&geometry.bottom<=viewport.height);
 await saveProfile(page,"doubao-color","Doubao");await page.locator("#setup-white").click();await saveProfile(page,"hunyuan-color","Hy");
 await page.reload();await page.locator("#setup-black").waitFor();assert.match(await page.locator("#setup-black").innerText(),/Doubao/);assert.match(await page.locator("#setup-white").innerText(),/Hy/);
 await page.locator("#create-button").click();await page.locator("#settings-dialog").waitFor({state:"visible"});const gameId=new URL(page.url()).searchParams.get("game");
 let state=call("arena_state",{gameId});assert.equal(state.seats.black.avatar,"doubao-color");assert.equal(state.seats.white.avatar,"hunyuan-color");
 await page.locator("#settings-black").click();await saveProfile(page,"minimax-color","MiniMax");state=call("arena_state",{gameId});assert.equal(state.seats.black.avatar,"minimax-color");assert.equal(state.seats.black.displayName,"MiniMax");
 // Upload remains available, retains the user-entered name, and stays in spectator state.
 await page.locator("#settings-white").click();await page.locator("#profile-name").fill("自定棋手");
 const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d");x.fillStyle="#d6e7dd";x.fillRect(0,0,32,32);return c.toDataURL("image/png").split(",")[1];});
 await page.locator("#avatar-upload").setInputFiles({name:"sample.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 await page.waitForFunction(()=>document.querySelector("#profile-preview img")?.src.startsWith("data:image/png"));
 assert.equal(await page.locator("#profile-name").inputValue(),"自定棋手");await page.locator('#profile-form [type="submit"]').click();await page.locator("#profile-dialog").waitFor({state:"hidden"});
 state=call("arena_state",{gameId});assert.match(state.seats.white.avatar,/^data:image\/png;base64,/);assert.equal(state.seats.white.displayName,"自定棋手");
 await page.locator("#settings-white").click();await saveProfile(page,"hunyuan-color","Hy");await page.locator('#settings-dialog [data-close]').click();
 const tokens={};for(const role of ["black","white"])tokens[role]=call("arena_join",{...call("arena_invite",{gameId,role}),name:role}).token;
 for(const role of ["black","white"])call("arena_ready",{gameId,token:tokens[role]});
 call("arena_move",{gameId,token:tokens.black,cell:"D4",expectedVersion:0,requestId:"sample-move"});
 call("arena_note",{gameId,token:tokens.black,ply:1,text:"这是一条用于界面验收的示例随想。",requestId:"sample-note"});
 await page.waitForFunction(()=>document.querySelector("#turn-label").textContent.includes("第 1 手"));await page.locator(".voice-item").first().waitFor();
 const imgs=await page.locator('.chat-row img').evaluateAll(nodes=>nodes.map(n=>n.getAttribute("src")));assert.ok(imgs.some(src=>src.endsWith("minimax-color.svg")));
 await shot(page,`match-${viewport.width}x${viewport.height}.png`);call("arena_control",{gameId,action:"stop"});
 assert.deepEqual(errors,[]);results.push({viewport,geometry,namesAutofill:true,profilesPersist:true,uploadRetainsName:true,spectatorNotesAndMoves:true,errors});
 }finally{await context.close();await old.close();}}
 fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify({baseline:BASE,results},null,2));console.log("Avatar/spectator QA passed across four desktop viewports.");
 }finally{await browser.close();await app.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith("arena-avatar-qa-"));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

