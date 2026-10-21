(function arenaBrowser() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const Engine = window.TopologyGomoku;
  const Art = window.TopologyBoardArt;
  const Content = window.TopologyGameContent;
  const gameKey = "topology-arena-game";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  sessionStorage.removeItem("topology-arena-host");
  const avatarChoices = [{id:"",name:"默认"},{id:"deepseek-color",name:"DeepSeek"},{id:"openai",name:"OpenAI"},{id:"claude-color",name:"Claude"},{id:"gemini-color",name:"Gemini"},{id:"kimi-color",name:"Kimi"},{id:"qwen-color",name:"Qwen"},{id:"grok",name:"Grok"}];
  let drafts = {black:{name:"",avatar:""},white:{name:"",avatar:""}};
  try { const saved=JSON.parse(localStorage.getItem("arena-player-profiles"));if(saved?.black && saved?.white)drafts=saved; } catch {}
  let profileTarget = null, selectedAvatar = "", confirmAction = null, uploadEpoch = 0;
  let bootstrap = {};
  let levels = Content.LEVELS;
  let matches = [];
  let state = null;
  let source = null;
  let gameEpoch = 0;
  let replayPly = null;
  let morph = 0;
  let morphTarget = 0;
  let morphFrame = 0;
  let rotation = { x: 0, y: 0, z: 0 };
  let drag = null;
  let toastTimer = null;
  let lastStateSequence = -1;
  let pending = false;
  const rulesCache = new Map();
  const names = { black: "黑方", white: "白方", commentator: "解说员", host: "房主", system: "棋局" };
  const phases = { waiting: "等待入席", playing: "正在对弈", paused: "暂歇片刻", ended: "本局已结束" };

  function text(id, value) { $(id).textContent = value == null ? "" : String(value); }
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function toast(message) {
    text("toast", message);
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3200);
  }
  function error(message, kind = "operation") {
    $("error-banner").dataset.kind=kind;
    text("error-text", message);
    $("error-banner").hidden = false;
  }
  function connection(connected, label) {
    if(!connected)error(label || "连接中断，正在重连。", "connection");
    else if($("error-banner").dataset.kind==="connection")$("error-banner").hidden=true;
  }

  async function call(name, args = {}, admin = false) {
    const headers = { "Content-Type": "application/json" };

    const response = await fetch("/api/call", { method: "POST", headers, body: JSON.stringify({ name, arguments: args }) });
    const data = await response.json();
    if (!response.ok || data.ok === false || data.error) throw new Error(data.error?.message || "操作未完成，请稍后重试。");
    return data.result === undefined ? data : data.result;
  }
  async function guarded(action) {
    try { return await action(); } catch (err) { error(err.message || "连接未完成，请重试。"); return null; }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); toast("已复制"); }
    catch (_) {
      $("invite-text").focus();
      $("invite-text").select();
      toast("请复制已选中的邀请词。");
    }
  }
  function levelFor(topology) {
    const shared = Content.LEVELS.find((item) => item.topology === topology);
    const catalog = levels.find((item) => item.topology === topology);
    return { ...(shared || Content.LEVELS[0]), ...catalog };
  }
  function displayPlayer(role) {
    const seat = state?.seats?.[role];
    return seat?.displayName || seat?.name || names[role] || role || "";
  }
  function formatTime(at) {
    if (!at) return "";
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  function isJoined(seat) { return Boolean(seat?.joined); }
  function visibleEvents() {
    const events = state?.events || [];
    return replayPly === null ? events : events.filter((event) => Number(event.ply || 0) <= replayPly);
  }
  function voiceEvents(role) { return visibleEvents().filter((event) => event.role === role && typeof event.text === "string" && event.text.trim()); }
  function voiceMeta(event) {
    return (event.ply ? "第 " + event.ply + " 手 · " : "开局前 · ") + (event.role === "commentator" ? "场边解说" : "棋手随想");
  }
  function renderVoice(role) {
    const node = $(role + "-voice"), events = voiceEvents(role).slice(-20);
    const key = state.gameId + ":" + events.map(event => event.seq).join(",");
    if (node.dataset.events === key) return;
    const sameGame=node.dataset.game===state.gameId;
    const follow = !sameGame || replayPly !== null || node.scrollHeight-node.scrollTop-node.clientHeight<36;
    const old = new Map([...node.children].map(n=>[n.dataset.seq,{node:n,y:n.getBoundingClientRect().y}]));
    if(!sameGame){node.replaceChildren();old.clear();}
    node.dataset.events=key;node.dataset.game=state.gameId;
    const retained=new Set(events.map(e=>String(e.seq)));
    for(const child of [...node.children])if(!retained.has(child.dataset.seq))child.remove();
    for(const event of events){
      let item=old.get(String(event.seq))?.node;
      if(!item){item=element("blockquote","voice-item speech-bubble");item.dataset.seq=String(event.seq);item.title=voiceMeta(event);item.setAttribute("aria-label",voiceMeta(event));item.append(element("p","",event.text));}
      node.append(item);
    }
    if(follow)node.scrollTop=node.scrollHeight;
    if(sameGame && follow && replayPly===null && !matchMedia("(prefers-reduced-motion: reduce)").matches){
      for(const item of node.children){const previous=old.get(item.dataset.seq);const dy=previous?previous.y-item.getBoundingClientRect().y:18;
        item.animate(previous?[{transform:"translateY("+dy+"px)"},{transform:"translateY(0)"}]:[{opacity:0,transform:"translateY(18px)"},{opacity:1,transform:"translateY(0)"}],{duration:320,easing:"cubic-bezier(.2,.8,.2,1)"});}
    }
  }
  function avatarInto(node, avatar, role) {
    const key=(avatar || "")+":"+role;if(node._avatarKey===key)return;node._avatarKey=key;
    const hasImage=Boolean(avatar && (avatar.startsWith("data:image/png;base64,") || avatarChoices.some(a=>a.id===avatar) || avatar==="opencode"));
    node.replaceChildren();node.classList.toggle("uploaded",Boolean(avatar?.startsWith("data:image/png;base64,")));
    node.classList.toggle("stone-avatar",!hasImage);
    if(hasImage){const img=element("img");img.src=avatar.startsWith("data:")?avatar:"/avatars/"+avatar+".svg";img.alt="";node.append(img);}
    else {const stone=element("span","stone "+role+"-stone");stone.setAttribute("aria-hidden","true");node.append(stone);}
  }
  function profileButton(node, value, role) {
    node.replaceChildren();const avatar=element("span","avatar");avatarInto(avatar,value.avatar,role);node.append(avatar,element("span","",value.name||names[role]));
  }
  function renderDrafts(){for(const role of ["black","white"])profileButton($("setup-"+role),drafts[role],role);}
  function renderSeat(role) {
    const seat=state.seats[role], name=seat.displayName || (state.mode==="ai" && role==="white"?"内置 AI":seat.name || names[role]);
    text(role+"-name",name);avatarInto($(role+"-avatar"),seat.avatar,role);
    $(role+"-name").title=name+(seat.model?" · "+seat.model:"");
    profileButton($("settings-"+role),{name,avatar:seat.avatar},role);
    document.querySelector('[data-invite="'+role+'"]').hidden=state.phase==="ended" || (state.mode==="ai" && role==="white");
    renderVoice(role);
  }
  function renderCommentary() {
    const commentator=state.seats.commentator, event=voiceEvents("commentator").at(-1);
    $("commentary").hidden=!state.commentaryEnabled || !event;
    $("commentary-toggle").hidden=!isJoined(commentator) && !state.commentaryEnabled;
    text("commentary-toggle",state.commentaryEnabled?"关闭解说":"开启解说");
    document.querySelector('[data-invite="commentator"]').hidden=state.phase==="ended";
    text("commentary-heading",commentator?.displayName || commentator?.name || "解说");
    const node=$("commentary-text"), key=state.gameId+":"+(event?.seq || "");if(node.dataset.events===key)return;
    node.dataset.events=key;node.replaceChildren();if(event){node.title=voiceMeta(event);node.append(element("p","",event.text));}
  }
  function openSettings(){ $("match-settings").hidden=!state;$("settings-dialog").showModal(); }
  function closeSettings(){ $("settings-dialog").close(); }
  function openProfile(role, setup=false){
    uploadEpoch++;profileTarget={role,gameId:setup?null:state?.gameId};
    const seat=setup?drafts[role]:state.seats[role];selectedAvatar=seat.avatar || "";
    $("profile-name").value=setup?seat.name:seat.displayName || "";$("profile-name").placeholder=setup?names[role]:displayPlayer(role);
    text("profile-heading",names[role]+"棋手");$("avatar-upload").value="";renderAvatarOptions();$("profile-dialog").showModal();
  }
  function renderAvatarOptions(){
    avatarInto($("profile-preview"),selectedAvatar,profileTarget.role);
    const parent=$("avatar-options");parent.replaceChildren();
    for(const avatar of avatarChoices){const button=element("button","avatar-option");button.type="button";button.setAttribute("aria-pressed",String(selectedAvatar===avatar.id));button.dataset.avatar=avatar.id;
      if(avatar.id){const img=element("img");img.src="/avatars/"+avatar.id+".svg";img.alt="";button.append(img);}else{const span=element("span","avatar");avatarInto(span,"",profileTarget.role);button.append(span);}
      button.append(element("span","",avatar.name));button.addEventListener("click",()=>{uploadEpoch++;selectedAvatar=avatar.id;if(avatar.id)$("profile-name").value=avatar.name;renderAvatarOptions();});parent.append(button);}
  }
  async function uploadAvatar(file){
    if(!file)return;const epoch=++uploadEpoch;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size>5*1024*1024)throw Error("请选择 5 MB 以内的 PNG、JPEG 或 WebP 图片。");
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const img=new Image();img.src=data;await img.decode();let result="";
    for(const size of [192,128,96]){const canvas=document.createElement("canvas");canvas.width=canvas.height=size;const ctx=canvas.getContext("2d"),side=Math.min(img.width,img.height);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,size,size);result=canvas.toDataURL("image/png");if(result.length<=100000)break;}
    if(epoch!==uploadEpoch)return;selectedAvatar=result;renderAvatarOptions();
  }
  function confirmMutation(heading, description, action){text("confirm-heading",heading);text("confirm-description",description);confirmAction=action;$("confirm-dialog").showModal();}

  function outcomeLabel() {
    if (state.winReason === "resign") return names[state.winner === "black" ? "white" : "black"] + "认输 · " + names[state.winner] + "胜";
    if (state.winReason === "draw_agreement") return "双方和棋";
    if (state.mode === "ai" && state.winReason === "settled") return "定局 · 本局收束";
    if (state.mode === "ai" && state.winReason === "blocked") return "完成棋局 · 已封住白方连线";
    if (state.winner) return (state.winner === 1 ? "黑方" : state.winner === -1 ? "白方" : names[state.winner] || state.winner) + "获胜";
    if (state.outcome === "draw" || state.winReason === "draw") return "和棋";
    if (state.outcome === "stopped" || state.winReason === "stopped") return "房主结束了本局";
    return "对弈结束";
  }
  function render() {
    if (!state) return;
    const level = levelFor(state.topology);
    const joined = isJoined(state.seats?.black) && isJoined(state.seats?.white);
    $("welcome").hidden = true;
    $("match").hidden = false;
    placeSettings("match");
    text("match-level", level.name);$("match-glyph").src="/assets/topologies/"+state.topology+".svg";
    text("turn-label", replayPly !== null ? "第 " + replayPly + " / " + state.ply + " 手" : state.phase === "ended" ? outcomeLabel() : state.phase === "playing" ? (names[state.turn] || "") + "行棋" : state.phase === "paused" ? "已暂停" : joined ? "已就绪" : "等待入席");
    renderSeat("black"); renderSeat("white"); renderCommentary();
    $("match-settings").hidden = false;
    $("start-button").hidden = state.phase !== "waiting";
    $("start-button").disabled = !joined || pending;
    $("pause-button").hidden = state.phase !== "playing";
    $("resume-button").hidden = state.phase !== "paused";
    $("stop-button").hidden = state.phase === "ended";
    for(const id of ["pause-button","resume-button","stop-button","commentary-toggle"])$(id).disabled=pending;
    const moves = state.moves || [];
    $("replay-range").disabled = !moves.length;
    $("replay-range").max = String(moves.length);
    $("replay-range").value = String(replayPly === null ? moves.length : replayPly);
    text("replay-label", replayPly === null ? "第 " + moves.length + " 手" : state.phase === "ended" ? "回到定局" : "回到当前棋局");
    $("previous-move").disabled = (replayPly === null ? moves.length : replayPly) <= 0;
    $("next-move").disabled = replayPly === null || replayPly >= moves.length;
    $("return-live").disabled = replayPly === null;
    $("surface-view").disabled = state.topology === "plane";
    $("view-range").disabled = state.topology === "plane";
    if (state.topology === "plane") morph = morphTarget = 0;
    const notice = replayPly === null && state.drawOffer ? names[state.drawOffer.role] + "提议和棋" : "";
    text("board-notice", notice);
    $("board-notice").hidden = !notice;

    drawBoard();
    if ($("timeline-dialog").open) renderTimeline();
  }
  function applyState(next) {
    if (!next || !Array.isArray(next.board)) return;
    if (state?.gameId === next.gameId && Number(next.eventSeq) < lastStateSequence) return;
    state = next;
    lastStateSequence = Number(next.eventSeq) || 0;
    if (replayPly !== null) replayPly = Math.min(replayPly, next.moves?.length || 0);
    render();
  }
  async function selectGame(gameId) {
    const epoch = ++gameEpoch;
    if (source) source.close();
    source = null;
    replayPly = null;
    lastStateSequence = -1;
    morph = morphTarget = 0;
    rotation = { x: 0, y: 0, z: 0 };
    const next = await call("arena_state", { gameId });
    if (epoch !== gameEpoch) return;
    state = null;
    applyState(next.state || next);
    localStorage.setItem(gameKey, gameId);history.replaceState(null,"","/?game="+encodeURIComponent(gameId));
    source = new EventSource("/api/events?gameId=" + encodeURIComponent(gameId));
    source.addEventListener("deleted", () => { if(epoch===gameEpoch){showWelcome();toast("棋局记录已删除");} });
    source.addEventListener("open", () => { if (epoch === gameEpoch) connection(true); });
    source.addEventListener("state", (event) => {
      if (epoch !== gameEpoch) return;
      try { const data = JSON.parse(event.data); applyState(data.state || data); connection(true); } catch (_) { error("棋局更新未能读取，正在重新连接。"); }
    });
    source.addEventListener("error", () => { if (epoch === gameEpoch) connection(false, "正在重连"); });
  }
  function showWelcome() {
    ++gameEpoch;
    if (source) source.close();
    source = null;
    state = null;
    $("welcome").hidden = false;
    $("match").hidden = true;
    placeSettings("home");
    $("match-settings").hidden = true;closeSettings();renderDrafts();history.replaceState(null,"","/");
    localStorage.removeItem(gameKey);
  }
  function placeSettings(screen) {
    const slot = $(screen + "-settings-slot");
    const button = $("settings-button");
    if (button.parentElement !== slot) slot.append(button);
  }
  function renderTopologyOptions() {
    const parent = $("topology-options");
    parent.replaceChildren();
    levels.forEach((level, index) => {
      const label = element("label", "topology-option");
      const input = document.createElement("input");
      input.type = "radio"; input.name = "topology"; input.value = level.topology;
      input.checked = level.topology === "torus";
      const span = element("span");
      const img = document.createElement("img");
      img.src = "/assets/topologies/" + level.topology + ".svg"; img.alt = "";
      span.append(img, element("span", "", level.name));
      label.append(input, span); label.title = level.typeName;
      input.addEventListener("change", updateTopology);
      parent.append(label);
      if (!levels.some((item) => item.topology === "torus") && index === 0) input.checked = true;
    });
    updateTopology();
  }
  function updateTopology() {
    const selected = document.querySelector('input[name="topology"]:checked');
    if (!selected) return;
    const level = levelFor(selected.value);
    $("board-width").value=level.width;$("board-height").value=level.height;$("board-height").disabled=level.topology==="sphere";
  }
  function drawBoard() {
    if (!state) return;
    const canvas = $("board");
    const rect = $("board-wrap").getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    Art.setContextPixelRatio(ctx, pixelRatio);
    const cacheKey = state.topology + ":" + state.width + ":" + state.height;
    if (!rulesCache.has(cacheKey)) rulesCache.set(cacheKey, Engine.createRules({ type: state.topology, width: state.width, height: state.height, target: 5 }));
    const rules = rulesCache.get(cacheKey);
    const moves = state.moves || [];
    const shownMoves = replayPly === null ? moves : moves.slice(0, replayPly);
    let board = state.board;
    if (replayPly !== null) {
      board = new Array(state.width * state.height).fill(0);
      shownMoves.forEach((move) => { board[move.cell] = move.player === "black" || move.player === 1 ? 1 : -1; });
    }
    const last = shownMoves.at(-1);
    const lastPlayer = last ? (last.player === "black" || last.player === 1 ? 1 : -1) : 0;
    const mask = last ? Engine.checkWin(board, rules, last.cell, lastPlayer) : null;
    const game = { level: levelFor(state.topology), rules, board, mode: "duel", status: state.phase, lastMove: last?.cell ?? -1, lastMoveAt: 0, winningMask: mask, winAt: 0 };
    const layout = Art.computeLayout(rect.width, rect.height, rules);
    if (morph > .001 && state.topology !== "plane") Art.drawCompletion(ctx, { game, layout, time: 2000, morph, rotation });
    else Art.drawBoard(ctx, { game, layout, time: 2000, fontFamily: '"Topo Serif",serif' });
    if (morph < .1) {
      ctx.save(); ctx.fillStyle = "#817f77"; ctx.font = '10px "Topo Serif",serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let x = 0; x < state.width; x++) ctx.fillText(String(x), layout.left + layout.cell * x, layout.bottom + 27);
      for (let y = 0; y < state.height; y++) ctx.fillText(String(y), layout.left - 27, layout.top + layout.cell * y);
      ctx.restore();
    }
    canvas.setAttribute("aria-label", levelFor(state.topology).typeName + "棋盘，第 " + shownMoves.length + " 手。" + (last ? (lastPlayer === 1 ? "黑方" : "白方") + "最近落在横坐标 " + (last.cell % state.width) + "，纵坐标 " + Math.floor(last.cell / state.width) + "。" : "尚未落子。") + "文字棋盘见棋局时间线。");
    $("view-range").value = String(Math.round(morph * 100));
    $("flat-view").classList.toggle("active", morph < .5);
    $("surface-view").classList.toggle("active", morph >= .5);
  }
  function setMorph(value, direct = false) {
    morphTarget = Math.max(0, Math.min(1, value));
    cancelAnimationFrame(morphFrame);
    if (direct || matchMedia("(prefers-reduced-motion: reduce)").matches) { morph = morphTarget; drawBoard(); return; }
    const from = morph;
    const start = performance.now();
    const duration = 420;
    function frame(now) {
      const amount = Math.min(1, (now - start) / duration);
      const ease = amount * amount * (3 - 2 * amount);
      morph = from + (morphTarget - from) * ease;
      drawBoard();
      if (amount < 1) morphFrame = requestAnimationFrame(frame);
    }
    morphFrame = requestAnimationFrame(frame);
  }
  function setReplay(ply) {
    if (!state) return;
    replayPly = Math.max(0, Math.min(Number(ply), state.moves.length));
    render();
  }
  async function control(action) {
    if (!state || pending) return;
    pending = true;
    render();
    try {
      const result = await call("arena_control", { gameId: state.gameId, action }, true);
      applyState(result.state || result);
    } finally { pending = false; render(); }
  }
  async function invitePrompt(invite, role) {
    const response = await fetch("/api/prompts");
    if (!response.ok) throw new Error("邀请词未能加载。");
    const prompts = await response.json();
    const seat = state.seats?.[role];
    const rejoining = isJoined(seat);
    const root = bootstrap.workspacePath.replace(/\\/g, "/").replace(/\/$/, "");
    const fields = {
      roleName: role === "commentator" ? "解说员" : names[role] + "棋手",
      server: location.origin, root,
      mcpUrl: bootstrap.mcpUrl,
      seatStatus: rejoining ? "已加入，恢复原身份" : "尚未加入",
      skillPath: root + "/arena/skills/topology-gomoku-arena/SKILL.md",
      rolePath: root + "/arena/prompts/" + (role === "commentator" ? "commentator.md" : "player.md"),
      joinArgs: JSON.stringify({ gameId: invite.gameId, inviteToken: invite.inviteToken, name: rejoining ? seat.name : seat.displayName || "你的名称", model: rejoining ? seat.model || "" : "" })
    };
    return prompts.invitation.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] ?? "");
  }

  async function invite(role) {
    if (!state) return;
    const result = await call("arena_invite", { gameId: state.gameId, role }, true);
    text("invite-heading", role === "commentator" ? "邀请解说员" : "邀请" + names[role] + "棋手");
    $("invite-text").value = await invitePrompt(result, role);
    $("invite-dialog").showModal();
  }
  async function showRooms() {
    closeSettings();const result=await call("arena_list");matches=result.matches || [];
    const node=$("room-list");node.replaceChildren();if(!matches.length)node.append(element("p","room-empty","还没有棋局"));
    $("clear-records").disabled=!matches.some(m=>m.phase==="ended");
    for(const match of matches){const row=element("div","room-row"),button=element("button","room-open");button.type="button";
      const player=role=>match.seats[role].displayName || (match.mode==="ai" && role==="white"?"内置 AI":match.seats[role].name || names[role]);
      const date=new Date(match.createdAt).toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
      button.append(element("strong","",levelFor(match.topology).name+" · "+player("black")+" 与 "+player("white")),element("small","",date+" · "+phases[match.phase]+" · "+match.ply+" 手"));
      button.addEventListener("click",()=>guarded(async()=>{await selectGame(match.gameId);$("rooms-dialog").close();}));row.append(button);
      const action=element("button","quiet-button danger",match.phase==="ended"?"删除":"结束");action.type="button";action.dataset.game=match.gameId;
      action.addEventListener("click",()=>confirmMutation(match.phase==="ended"?"删除这局记录？":"结束这场对弈？",match.phase==="ended"?"棋谱和发言将一并删除。":"保留棋谱和发言。",async()=>{
        if(match.phase==="ended"){await call("arena_delete",{gameId:match.gameId},true);if(state?.gameId===match.gameId)showWelcome();}
        else {const next=await call("arena_control",{gameId:match.gameId,action:"stop"},true);if(state?.gameId===match.gameId)applyState(next);}
        await showRooms();
      }));row.append(action);node.append(row);
    }
    if(!$("rooms-dialog").open)$("rooms-dialog").showModal();
  }

  function eventDescription(event) {
    if (event.text) return event.text;
    if (event.type === "profile") return names[event.role]+"更新了棋手资料";
    if (event.type === "resign") return names[event.role] + "认输";
    if (event.type === "commentary") return event.enabled ? "开启解说" : "关闭解说";
    if (event.type === "draw") return names[event.role] + ({ offer: "提议和棋", accept: "接受和棋", decline: "拒绝和棋", withdraw: "撤回和棋提议" })[event.action];
    if (event.type === "control") return ({ start: "开始对弈", pause: event.reason === "service_restart" ? "服务已恢复，棋局暂停等待继续" : "棋局暂停", resume: "继续对弈", stop: "房主结束棋局" })[event.action] || "棋局状态更新";
    if (event.type === "result" && event.winReason === "resign") return names[event.winner] + "获胜（对方认输）";
    if (event.type === "result" && event.winReason === "draw_agreement") return "双方同意和棋";
    if (event.type === "result") return event.winReason === "settled" ? "定局 · 本局收束" : event.winReason === "blocked" ? "完成棋局 · 已封住白方连线" : event.winner ? (names[event.winner] || "") + "获胜" : event.outcome === "draw" ? "和棋" : "棋局结束";
    if (event.type === "move" || event.kind === "move") {
      const move = (state.moves || []).find((item) => item.ply === event.ply);
      const cell = event.cell ?? move?.cell;
      return (names[event.role] || names[move?.player] || "棋手") + "落子" + (Number.isInteger(cell) ? "（" + (cell % state.width) + "，" + Math.floor(cell / state.width) + "）" : "");
    }
    const labels = { created: "棋局已创建", create: "棋局已创建", joined: "棋手入席", join: "棋手入席", start: "开始对弈", started: "开始对弈", pause: "棋局暂停", paused: "棋局暂停", resume: "继续对弈", resumed: "继续对弈", ended: "棋局结束", end: "棋局结束", stop: "房主结束棋局", stopped: "房主结束棋局" };
    return labels[event.type] || labels[event.kind] || "棋局状态更新";
  }
  function renderTimeline() {
    const list = $("timeline");
    list.replaceChildren();
    const events = visibleEvents();
    if (!events.length) list.append(element("li", "", "棋局尚未开始。"));
    events.forEach((event) => {
      const item = element("li"); item.dataset.kind = event.type;
      item.append(element("span", "event-meta", [formatTime(event.at), event.ply ? "第 " + event.ply + " 手" : "开局前", event.role ? displayPlayer(event.role) : ""].filter(Boolean).join(" · ")), element("p", "", eventDescription(event)));
      list.append(item);
    });
    renderTextBoard();
  }
  function renderTextBoard() {
    const board = replayPly === null ? state.board : new Array(state.width * state.height).fill(0);
    if (replayPly !== null) state.moves.slice(0, replayPly).forEach((move) => { board[move.cell] = move.player === "black" || move.player === 1 ? 1 : -1; });
    const table = element("table");
    table.append(element("caption", "", "横纵坐标均从 0 开始；● 黑方，○ 白方，· 空位。"));
    const header = element("tr"); header.append(element("th", "", "y / x"));
    for (let x = 0; x < state.width; x++) header.append(element("th", "", x));
    table.append(header);
    for (let y = 0; y < state.height; y++) {
      const row = element("tr"); row.append(element("th", "", y));
      for (let x = 0; x < state.width; x++) row.append(element("td", "", board[y * state.width + x] === 1 ? "●" : board[y * state.width + x] === -1 ? "○" : "·"));
      table.append(row);
    }
    $("text-board").replaceChildren(table);
  }
  async function exportReplay() {
    if (!state) return;
    const replay = await call("arena_replay", { gameId: state.gameId });
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url; link.download = "topology-arena-" + state.gameId.replace(/[^a-zA-Z0-9_-]/g, "") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已保存");
  }
  async function boot() {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error("本地对弈室没有响应，请让启动它的 Agent 检查服务。");
    const data = await response.json();
    bootstrap = data.result || data;
    const catalog = await call("arena_catalog");
    if (Array.isArray(catalog.levels) && catalog.levels.length) levels = catalog.levels.map((item) => ({ ...Content.LEVELS.find((level) => level.topology === item.topology), ...item }));
    renderTopologyOptions();
    const result = await call("arena_list");
    matches = result.matches || [];
    connection(true);
    $("error-banner").hidden = true;
    const requested = new URLSearchParams(location.search).get("game");
    const chosen = matches.find((item) => item.gameId === requested);
    if (chosen) await selectGame(chosen.gameId);
    else showWelcome();
  }

  $("create-form").addEventListener("submit", (event) => {
    event.preventDefault();
    guarded(async () => {
      if (pending) return;
      pending = true; $("create-button").disabled = true;
      try {
        const topology = document.querySelector('input[name="topology"]:checked').value;
        const result = await call("arena_create", { topology, mode: document.querySelector('input[name="mode"]:checked').value, difficulty: $("difficulty").value, width:Number($("board-width").value),height:Number($("board-height").value),players:drafts }, true);
        await selectGame(result.gameId || result.state?.gameId);openSettings();
      } finally { pending = false; $("create-button").disabled = false; }
    });
  });
  document.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener("change", () => { $("difficulty-row").hidden = document.querySelector('input[name="mode"]:checked').value !== "ai"; }));
  document.querySelectorAll("[data-invite]").forEach((button) => button.addEventListener("click", () => guarded(() => invite(button.dataset.invite))));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));

  $("copy-invite").addEventListener("click", () => copy($("invite-text").value));
  $("commentary-toggle").addEventListener("click", () => guarded(() => control(state.commentaryEnabled ? "commentary_off" : "commentary_on")));
  $("rooms-button").addEventListener("click", () => guarded(showRooms));
  $("new-button").addEventListener("click", showWelcome);
  $("start-button").addEventListener("click", () => guarded(async () => {await control("start");closeSettings();}));
  $("pause-button").addEventListener("click", () => guarded(() => control("pause")));
  $("resume-button").addEventListener("click", () => guarded(async () => {await control("resume");closeSettings();}));
  $("stop-button").addEventListener("click", () => $("stop-dialog").showModal());
  $("confirm-stop").addEventListener("click", () => guarded(async () => { await control("stop"); $("stop-dialog").close(); }));
  $("timeline-button").addEventListener("click", () => { renderTimeline(); $("timeline-dialog").showModal(); });
  $("export-button").addEventListener("click", () => guarded(exportReplay));
  $("dismiss-error").addEventListener("click", () => { $("error-banner").hidden = true; });
  $("retry-button").addEventListener("click", () => guarded(boot));
  $("flat-view").addEventListener("click", () => setMorph(0));
  $("surface-view").addEventListener("click", () => setMorph(1));
  $("view-range").addEventListener("input", (event) => setMorph(Number(event.target.value) / 100, true));
  $("replay-range").addEventListener("input", (event) => setReplay(event.target.value));
  $("previous-move").addEventListener("click", () => setReplay((replayPly === null ? state.moves.length : replayPly) - 1));
  $("next-move").addEventListener("click", () => setReplay((replayPly === null ? state.moves.length : replayPly) + 1));
  $("return-live").addEventListener("click", () => { replayPly = null; render(); });
  $("settings-button").addEventListener("click",openSettings);
  $("board-width").addEventListener("input",()=>{if($("board-height").disabled)$("board-height").value=$("board-width").value;});
  for(const role of ["black","white"])$("setup-"+role).addEventListener("click",()=>openProfile(role,true));
  document.querySelectorAll("[data-profile]").forEach(button=>button.addEventListener("click",()=>openProfile(button.dataset.profile)));
  $("avatar-upload").addEventListener("change",()=>guarded(async()=>{const button=$("profile-form").querySelector('[type="submit"]');button.disabled=true;try{await uploadAvatar($("avatar-upload").files[0]);}finally{button.disabled=false;}}));
  $("profile-form").addEventListener("submit",event=>{event.preventDefault();guarded(async()=>{
    const value={name:$("profile-name").value.trim(),avatar:selectedAvatar},target=profileTarget;
    if(target.gameId){const next=await call("arena_profile",{gameId:target.gameId,role:target.role,...value},true);if(state?.gameId===target.gameId)applyState(next);}
    drafts[target.role]=value;localStorage.setItem("arena-player-profiles",JSON.stringify(drafts));renderDrafts();$("profile-dialog").close();
  });});
  $("clear-records").addEventListener("click",()=>confirmMutation("清空已结束棋局？","棋谱和发言将一并删除，进行中的棋局会保留。",async()=>{const result=await call("arena_clear",{},true);if(result.deleted.includes(state?.gameId))showWelcome();await showRooms();}));
  $("confirm-action").addEventListener("click",()=>guarded(async()=>{const action=confirmAction;if(!action)return;confirmAction=null;await action();$("confirm-dialog").close();}));
  $("board").addEventListener("pointerdown", (event) => {
    if (morph < .2 || !state || state.topology === "plane") return;
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    $("board").setPointerCapture(event.pointerId);
  });
  $("board").addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    rotation.y += (event.clientX - drag.x) * .009;
    rotation.x += (event.clientY - drag.y) * .009;
    drag.x = event.clientX; drag.y = event.clientY;
    drawBoard();
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => $("board").addEventListener(name, () => { drag = null; }));
  new ResizeObserver(drawBoard).observe($("board-wrap"));
  document.fonts.ready.then(drawBoard);

  window.addEventListener("pagehide", () => { if (source) source.close(); });
  guarded(boot);
})();
