(function arenaBrowser() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const Engine = window.TopologyGomoku;
  const Art = window.TopologyBoardArt;
  const Content = window.TopologyGameContent;
  const Coordinates = window.ArenaCoordinates;
  const seatIdentities = { black: $("black-identity"), white: $("white-identity") };
  const gameKey = "topology-arena-game";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  sessionStorage.removeItem("topology-arena-host");
  const avatarChoices = [{id:"",name:"默认"},{id:"deepseek-color",name:"DeepSeek"},{id:"openai",name:"OpenAI"},{id:"claude-color",name:"Claude"},{id:"gemini-color",name:"Gemini"},{id:"kimi-color",name:"Kimi"},{id:"qwen-color",name:"Qwen"},{id:"grok",name:"Grok"},{id:"doubao-color",name:"Doubao"},{id:"hunyuan-color",name:"Hy"},{id:"minimax-color",name:"MiniMax"}];
  let drafts = {black:{name:"",avatar:""},white:{name:"",avatar:""}};
  try { const saved=JSON.parse(localStorage.getItem("arena-player-profiles"));if(saved?.black && saved?.white)drafts=saved; } catch {}
  let profileTarget = null, selectedAvatar = "", confirmAction = null, uploadEpoch = 0;
  let bootstrap = {};
  let levels = Content.LEVELS;
  let matches = [];
  let state = null;
  let stateReceivedAt = 0;
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
  let streamConnected = false;
  let conversationFrame = 0;
  let conversationAnimations = [];
  const turnActivity = element("div", "turn-activity");
  const rulesCache = new Map();
  const names = { black: "黑方", white: "白方", commentator: "解说员", host: "房主", system: "棋局" };
  const phases = { waiting: "准备中", playing: "正在对弈", paused: "暂歇片刻", ended: "本局已结束" };

  function text(id, value) { $(id).textContent = value == null ? "" : String(value); }
  function spacedText(node, parts) {
    node.classList.add("text-parts");
    node.replaceChildren();
    parts.filter(Boolean).forEach((part, index) => {
      if (index) node.append(document.createTextNode(" "));
      node.append(element("span", "", part));
    });
    return node;
  }
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
    const changed = streamConnected !== connected;
    streamConnected = connected;
    if(!connected)error(label || "连接中断，正在重连。", "connection");
    else if($("error-banner").dataset.kind==="connection")$("error-banner").hidden=true;
    if (changed && state) renderConversation();
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
  function voicePosition(event) { return event.ply ? "第 " + event.ply + " 手" : "开局"; }
  function bubbleSurface(bubble) {
    const material = element("span", "bubble-material"), glass = element("span", "bubble-glass");
    material.setAttribute("aria-hidden", "true");
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    outline.classList.add("bubble-outline");
    outline.append(document.createElementNS(outline.namespaceURI, "path"));
    material.append(glass, outline); bubble.prepend(material);
    return bubble;
  }
  function paintBubbleSurfaces() {
    if (!state) return;
    for (const bubble of $("conversation-rows").querySelectorAll(".speech-bubble")) {
      const { width, height } = bubble.getBoundingClientRect();
      const w = width + 10, h = height - .5, left = 10.5, right = w - .5, r = Math.min(22, (height - 1) / 2);
      if (!width || !height) continue;
      // A single contour includes the curved tail: no separate triangle or seam.
      const d = `M ${left+r} .5 H ${right-r} Q ${right} .5 ${right} ${r+.5} V ${h-r} Q ${right} ${h} ${right-r} ${h} H ${left+r} Q ${left} ${h} ${left} ${h-r} V 39 C ${left} 35 4 34 .5 29 C 6 30 ${left} 28 ${left} 24 V ${r+.5} Q ${left} .5 ${left+r} .5 Z`;
      const material = bubble.querySelector(".bubble-material"), outline = material.querySelector("svg");
      material.querySelector(".bubble-glass").style.clipPath = `path("${d}")`;
      outline.setAttribute("viewBox", `0 0 ${w} ${height}`);
      outline.firstElementChild.setAttribute("d", d);
    }
  }
  function fadeConversation() {
    if (!state) return;
    const bounds = $("conversation").getBoundingClientRect(), fade = Math.min(110, bounds.height * .2);
    for (const row of $("conversation-rows").querySelectorAll(".chat-row,.turn-activity")) {
      const rect = row.getBoundingClientRect();
      // Long legacy messages remain readable while their middle is in view.
      // Each message and its avatar share one uniform alpha; text is never masked.
      const inset = Math.min(rect.height / 2, 110);
      const distance = Math.min(rect.bottom - inset - bounds.top, bounds.bottom - rect.top - inset);
      const progress = Math.max(0, Math.min(1, distance / fade));
      row.style.opacity = String(progress * progress * (3 - 2 * progress));
    }
  }
  function stopConversationMotion() {
    cancelAnimationFrame(conversationFrame);
    conversationAnimations.forEach(animation => animation.cancel());
    conversationAnimations = [];
  }
  function paintConversationMotion() {
    fadeConversation();
    if (conversationAnimations.some(animation => animation.playState === "running")) {
      conversationFrame = requestAnimationFrame(paintConversationMotion);
    }
  }
  function interruptConversationMotion() {
    if (!conversationAnimations.some(animation => animation.playState === "running")) return;
    const viewport = $("conversation");
    const anchor = [...$("conversation-rows").querySelectorAll(".chat-row")]
      .find(row => row.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top);
    const y = anchor?.getBoundingClientRect().y;
    stopConversationMotion();
    if (anchor) viewport.scrollTop += anchor.getBoundingClientRect().y - y;
    fadeConversation();
  }
  function renderConversation() {
    const viewport = $("conversation"), rows = $("conversation-rows"), empty = $("empty-seats");
    const events = visibleEvents().filter(event => ["black", "white"].includes(event.role) && typeof event.text === "string" && event.text.trim());
    const activeRole = streamConnected && state.phase === "playing" && replayPly === null ? state.turn : null;
    const key = JSON.stringify([state.gameId, replayPly, activeRole, events.map(event => event.seq), ...["black", "white"].map(role => [displayPlayer(role), state.seats[role].avatar])]);
    if (viewport.dataset.events === key) return;
    viewport.dataset.events = key;
    const sameGame = viewport.dataset.game === state.gameId;
    const wasLive = viewport.dataset.replay === "live";
    viewport.dataset.replay = replayPly === null ? "live" : String(replayPly);
    const follow = !sameGame || replayPly !== null || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 36;
    const positions = new Map([...rows.children].map(node => [node, {
      y: node.getBoundingClientRect().y,
      opacity: node.firstElementChild ? Number(getComputedStyle(node.firstElementChild).opacity) : 1
    }]));
    const old = new Map([...rows.querySelectorAll(".chat-row")].map(node => [node.dataset.seq, { node, y: positions.get(node).y }]));
    const anchor = [...old.values()].find(item => item.node.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top);
    // Capture the current visual positions before cancelling an interrupted move.
    stopConversationMotion();
    if (!sameGame) { empty.append(seatIdentities.black, seatIdentities.white); rows.replaceChildren(empty); old.clear(); }
    viewport.dataset.game = state.gameId;
    const retained = new Set(events.map(event => String(event.seq)));
    const last = Object.fromEntries(["black", "white"].map(role => [role, events.filter(event => event.role === role).at(-1)?.seq]));
    for (const [seq, item] of old) if (!retained.has(seq)) item.node.remove();
    for (const event of events) {
      let row = old.get(String(event.seq))?.node;
      if (!row) {
        row = element("div", "chat-row"); row.dataset.seq = String(event.seq); row.dataset.role = event.role;
        const player = element("section", "player player-" + event.role);
        const timestamp = element("time", "voice-time", voicePosition(event));
        if (event.at && !Number.isNaN(new Date(event.at).getTime())) timestamp.dateTime = new Date(event.at).toISOString();
        const bubble = element("blockquote", "voice-item speech-bubble");
        bubble.append(element("p", "", event.text));
        player.append(timestamp, bubbleSurface(bubble)); row.append(player);
      }
      const player = row.firstElementChild, current = player.querySelector(".player-identity");
      let identity = current;
      if (event.seq === last[event.role] && event.role !== activeRole) identity = seatIdentities[event.role];
      else if (!current || current === seatIdentities[event.role]) {
        identity = seatIdentities[event.role].cloneNode(true);
        identity.removeAttribute("id"); identity.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      }
      if (current !== identity) { current?.remove(); player.prepend(identity); }
      avatarInto(identity.querySelector(".avatar"), state.seats[event.role].avatar, event.role);
      identity.querySelector("h2").textContent = displayPlayer(event.role);
      rows.insertBefore(row, empty);
    }
    for (const role of ["black", "white"]) if (last[role] === undefined && role !== activeRole) empty.append(seatIdentities[role]);
    if (activeRole) {
      if (turnActivity.dataset.role !== activeRole || turnActivity.dataset.game !== state.gameId) {
        const player = element("section", "player player-" + activeRole);
        const bubble = bubbleSurface(element("div", "turn-bubble speech-bubble")), dots = element("span", "waiting-dots");
        dots.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 3; i++) dots.append(element("i"));
        bubble.append(dots); player.append(bubble); turnActivity.replaceChildren(player);
      }
      turnActivity.dataset.role = activeRole; turnActivity.dataset.game = state.gameId;
      turnActivity.setAttribute("role", "status"); turnActivity.setAttribute("aria-label", "等待" + names[activeRole] + "落子");
      turnActivity.firstElementChild.prepend(seatIdentities[activeRole]);
      rows.insertBefore(turnActivity, empty);
    } else turnActivity.remove();
    paintBubbleSurfaces();
    if (follow) viewport.scrollTop = viewport.scrollHeight;
    else if (anchor?.node.isConnected) viewport.scrollTop += anchor.node.getBoundingClientRect().y - anchor.y;
    if (sameGame && follow && wasLive && replayPly === null && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const motion = { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" };
      const newRows = [...rows.querySelectorAll(".chat-row")].filter(row => !old.has(row.dataset.seq));
      const shift = Math.max(18, ...[...old.values()].filter(item => item.node.isConnected)
        .map(item => item.y - item.node.getBoundingClientRect().y));
      for (const row of rows.children) {
        const previous = positions.get(row);
        const offset = previous ? previous.y - row.getBoundingClientRect().y : shift;
        if (Math.abs(offset) > .5) {
          conversationAnimations.push(row.animate([
            { transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }
          ], motion));
        }
        const opacity = newRows.includes(row) ? 0 : previous?.opacity ?? 1;
        if (opacity < 1 && row.firstElementChild) {
          conversationAnimations.push(row.firstElementChild.animate([{ opacity }, { opacity: 1 }], motion));
        }
      }
    }
    paintConversationMotion();
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
    profileButton($("settings-"+role),{name,avatar:seat.avatar},role);
    text("ready-"+role, !isJoined(seat) ? "未入席" : seat.ready ? "已就绪" : "准备中");
    $("ready-"+role).hidden=state.phase!=="waiting";
    document.querySelector('[data-invite="'+role+'"]').hidden=state.phase==="ended" || (state.mode==="ai" && role==="white");
  }
  function renderClocks() {
    for (const role of ["black", "white"]) {
      const node = $(role + "-clock"), clock = state?.clock;
      node.hidden = !clock;
      if (!clock) continue;
      const active = clock.active === role && state.phase === "playing";
      const remaining = active ? Math.max(0, clock.deadline - Date.now()) : clock.remainingMs[role];
      const seconds = Math.ceil(remaining / 1000);
      node.querySelector(".clock-minutes").textContent = Math.floor(seconds / 60);
      node.querySelector(".clock-seconds").textContent = String(seconds % 60).padStart(2, "0");
      if (active && (node.dataset.active !== "true" || node.dataset.game !== state.gameId) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        node._turnAnimation?.cancel();
        node._turnAnimation = node.animate([{ transform: "scale(1)" }, { transform: "scale(1.09)", offset: .35 }, { transform: "scale(1)" }], { duration: 650, easing: "ease-out" });
      } else if (!active) node._turnAnimation?.cancel();
      node.dataset.game = state.gameId;
      node.dataset.active = String(active); node.dataset.low = String(remaining < 30000);
    }
  }
  function renderCommentary() {
    const commentator=state.seats.commentator, event=voiceEvents("commentator").at(-1);
    $("commentary").hidden=!state.commentaryEnabled || !event;
    $("commentary-toggle").hidden=!isJoined(commentator) && !state.commentaryEnabled;
    text("commentary-toggle",state.commentaryEnabled?"关闭解说":"开启解说");
    document.querySelector('[data-invite="commentator"]').hidden=state.phase==="ended";
    text("commentary-heading",commentator?.displayName || commentator?.name || "解说");
    const node=$("commentary-text"), key=state.gameId+":"+(event?.seq || "");if(node.dataset.events===key)return;
    node.dataset.events=key;node.replaceChildren();if(event)node.append(element("p","",event.text));
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
  function confirmMutation(heading, description, action) {
    text("confirm-heading", heading);
    text("confirm-description", description);
    $("confirm-description").hidden = !description;
    confirmAction = action;
    $("confirm-dialog").showModal();
  }

  function outcomeParts(match) {
    const winner = match.winner === 1 ? "black" : match.winner === -1 ? "white" : match.winner;
    if (match.winReason === "timeout") return [names[winner === "black" ? "white" : "black"] + "超时", names[winner] + "胜"];
    if (match.winReason === "resign") return [names[winner === "black" ? "white" : "black"] + "认输", names[winner] + "胜"];
    if (match.winReason === "rule_violation") return [names[winner === "black" ? "white" : "black"] + "违规判负", names[winner] + "胜"];
    if (match.winReason === "draw_agreement") return ["双方和棋"];
    if (match.mode === "ai" && match.winReason === "settled") return ["定局"];
    if (match.mode === "ai" && match.winReason === "blocked") return winner ? [names[winner] + "获胜", "封锁"] : ["已封住白方连线"];
    if (winner) return [(names[winner] || winner) + "获胜"];
    if (match.outcome === "draw" || match.winReason === "draw") return ["和棋"];
    if (match.outcome === "stopped" || match.winReason === "stopped") return ["房主结束"];
    return ["对弈结束"];
  }
  function renderPosition() {
    if (!state) return;
    const joined = isJoined(state.seats?.black) && isJoined(state.seats?.white);
    const preparing = !joined ? "等待入席" : state.seats.black.ready && state.seats.white.ready ? "准备就绪" : state.seats.black.ready ? "等待白方就绪" : state.seats.white.ready ? "等待黑方就绪" : "双方准备中";
    const preparation = state.preparation;
    const countdown = state.phase === "waiting" && joined && Number.isFinite(preparation?.deadline);
    const remaining = countdown ? Math.max(0, preparation.remainingMs - (performance.now() - stateReceivedAt)) : 0;
    const seconds = Math.ceil(remaining / 1000);
    const status = state.phase === "ended" ? outcomeParts(state) : countdown ? ["准备中", Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0")] : [state.phase === "playing" ? (names[state.turn] || "") + "行棋" : state.phase === "paused" ? "已暂停" : preparing];
    const returnLabel = state.phase === "ended" ? "回到定局" : "回到当前棋局";
    const positionParts = replayPly === null ? ["第 " + state.ply + " 手", ...status] : ["第 " + replayPly + " / " + state.ply + " 手", returnLabel];
    const node = $("turn-label"), key = JSON.stringify(positionParts);
    if (node.dataset.position !== key) {
      node.dataset.position = key;
      spacedText(node, positionParts);
      if (countdown && replayPly === null) node.lastElementChild.classList.add("preparation-countdown");
    }
  }
  function render() {
    if (!state) return;
    const level = levelFor(state.topology);
    $("welcome").hidden = true;
    $("match").hidden = false;
    placeSettings("match");
    text("match-level", level.name);$("match-glyph").src="/assets/topologies/"+state.topology+".svg";
    renderPosition();
    renderConversation(); renderSeat("black"); renderSeat("white"); renderCommentary(); renderClocks();
    $("match-settings").hidden = false;
    $("pause-button").hidden = state.phase !== "playing";
    $("resume-button").hidden = state.phase !== "paused";
    $("stop-button").hidden = state.phase === "ended";
    $("adjudicate-button").hidden = state.phase === "ended";
    for(const id of ["pause-button","resume-button","stop-button","commentary-toggle","adjudicate-button"])$(id).disabled=pending;
    const moves = state.moves || [];
    $("replay-range").disabled = !moves.length;
    $("replay-range").max = String(moves.length);
    $("replay-range").value = String(replayPly === null ? moves.length : replayPly);
    window.ArenaLiquidControls.syncRange($("replay-range"));
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
    stateReceivedAt = performance.now();
    lastStateSequence = Number(next.eventSeq) || 0;
    if (replayPly !== null) replayPly = Math.min(replayPly, next.moves?.length || 0);
    render();
  }
  async function selectGame(gameId) {
    const epoch = ++gameEpoch;
    cancelAnimationFrame(morphFrame);
    window.ArenaLiquidControls.cancelRanges();
    stopConversationMotion();
    if (source) source.close();
    source = null;
    streamConnected = false;
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
    cancelAnimationFrame(morphFrame);
    window.ArenaLiquidControls.cancelRanges();
    stopConversationMotion();
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
      label.append(input, span);
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
    // Reserve half a cell for connected boundaries, plus labels outside them.
    const cellSize = Math.min((rect.width - 56) / state.width, (rect.height - 56) / state.height);
    const layout = { cell: cellSize, left: (rect.width-cellSize*(state.width-1))/2, right: (rect.width+cellSize*(state.width-1))/2,
      top: (rect.height-cellSize*(state.height-1))/2, bottom: (rect.height+cellSize*(state.height-1))/2, width: rect.width, height: rect.height };
    if (morph > .001 && state.topology !== "plane") Art.drawCompletion(ctx, { game, layout, time: 2000, morph, rotation });
    else Art.drawBoard(ctx, { game, layout, time: 2000, fontFamily: '"Topo Serif",serif' });
    if (morph < .1) {
      ctx.save(); ctx.fillStyle = "#65665e"; ctx.font = Math.min(16, Math.max(14, layout.cell * .65)) + 'px "Topo Serif",serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // Open edges need only stone clearance (the radius used by Art.drawStones).
      const openOffset = layout.cell * .37 + 12;
      const railOffset = layout.cell * .5 + 16;
      const bottomOffset = game.level.yConnection || state.topology === "sphere" ? railOffset : openOffset;
      const leftOffset = game.level.xConnection || state.topology === "sphere" ? railOffset : openOffset;
      for (let x = 0; x < state.width; x++) ctx.fillText(String.fromCharCode(65+x), layout.left + layout.cell * x, layout.bottom + bottomOffset);
      for (let y = 0; y < state.height; y++) ctx.fillText(String(state.height-y), layout.left - leftOffset, layout.top + layout.cell * y);
      ctx.restore();
    }
    canvas.setAttribute("aria-label", levelFor(state.topology).typeName + "棋盘，第 " + shownMoves.length + " 手。" + (last ? (lastPlayer === 1 ? "黑方" : "白方") + "最近落在 " + Coordinates.label(last.cell, state.width, state.height) + "。" : "尚未落子。") + "文字棋盘见棋局时间线。");
    $("view-range").value = String(morph * 100);
    window.ArenaLiquidControls.syncRange($("view-range"));
    $("flat-view").classList.toggle("active", morph < .5);
    $("surface-view").classList.toggle("active", morph >= .5);
  }
  function setMorph(value, direct = false) {
    morphTarget = Math.max(0, Math.min(1, value));
    cancelAnimationFrame(morphFrame);
    if (direct || matchMedia("(prefers-reduced-motion: reduce)").matches) { morph = morphTarget; drawBoard(); return; }
    const from = morph;
    const start = performance.now();
    const duration = window.TopologyLiquidRange.duration(morphTarget - from, false);
    function frame(now) {
      const amount = Math.min(1, (now - start) / duration);
      const ease = window.TopologyLiquidRange.glide(amount);
      morph = Math.max(0, Math.min(1, from + (morphTarget - from) * ease));
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
  async function control(action, extra = {}) {
    if (!state || pending) return;
    pending = true;
    render();
    try {
      const result = await call("arena_control", { gameId: state.gameId, action, ...extra }, true);
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
      playerPrompt: role === "commentator" ? "" : prompts.player,
      joinArgs: JSON.stringify({ gameId: invite.gameId, inviteToken: invite.inviteToken, name: rejoining ? seat.name : seat.displayName || "你的名称", model: rejoining ? seat.model || "" : "" })
    };
    return prompts.invitation.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] ?? "").trim();
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
      const metadata = element("small", "room-meta");
      const resultParts = match.phase === "ended" ? outcomeParts(match) : [phases[match.phase]];
      metadata.append(element("span", "", date), spacedText(element("span", "room-result"), resultParts), element("span", "", match.ply + " 手"));
      button.append(spacedText(element("strong"), [levelFor(match.topology).name, player("black")+" 与 "+player("white")]), metadata);
      button.addEventListener("click",()=>guarded(async()=>{await selectGame(match.gameId);$("rooms-dialog").close();}));row.append(button);
      const action=element("button","quiet-button danger",match.phase==="ended"?"删除":"结束");action.type="button";action.dataset.game=match.gameId;
      action.addEventListener("click",()=>confirmMutation(match.phase==="ended"?"删除这局记录？":"结束这场对弈？",match.phase==="ended"?"棋谱和发言将一并删除。":"",async()=>{
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
    if (event.type === "ready") return names[event.role]+"准备就绪";
    if (event.type === "preparation") return "开始准备";
    if (event.type === "resign") return names[event.role] + "认输";
    if (event.type === "commentary") return event.enabled ? "开启解说" : "关闭解说";
    if (event.type === "draw") return names[event.role] + ({ offer: "提议和棋", accept: "接受和棋", decline: "拒绝和棋", withdraw: "撤回和棋提议" })[event.action];
    if (event.type === "control") return ({ start: "开始对弈", pause: event.reason === "service_restart" ? "服务已恢复，棋局暂停等待继续" : "棋局暂停", resume: "继续对弈", stop: "房主结束棋局" })[event.action] || "棋局状态更新";
    if (event.type === "result" && event.winReason === "resign") return names[event.winner] + "获胜（对方认输）";
    if (event.type === "result" && event.winReason === "draw_agreement") return "双方同意和棋";
    if (event.type === "result" && event.winReason === "timeout") return names[event.winner] + "获胜（对方超时）";
    if (event.type === "result" && event.winReason === "rule_violation") return names[event.winner] + "获胜（对方违规判负）";
    if (event.type === "result") return event.winReason === "settled" ? "定局" : event.winReason === "blocked" ? "已封住白方连线" : event.winner ? (names[event.winner] || "") + "获胜" : event.outcome === "draw" ? "和棋" : "棋局结束";
    if (event.type === "move" || event.kind === "move") {
      const move = (state.moves || []).find((item) => item.ply === event.ply);
      const cell = event.cell ?? move?.cell;
      return (names[event.role] || names[move?.player] || "棋手") + "落子" + (Number.isInteger(cell) ? " " + Coordinates.label(cell,state.width,state.height) : "");
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
      const metadata = spacedText(element("span", "event-meta"), [formatTime(event.at), event.ply ? "第 " + event.ply + " 手" : "开局前", event.role ? displayPlayer(event.role) : ""]);
      item.append(metadata, element("p", "", eventDescription(event)));
      list.append(item);
    });
    renderTextBoard();
  }
  function renderTextBoard() {
    const board = replayPly === null ? state.board : new Array(state.width * state.height).fill(0);
    if (replayPly !== null) state.moves.slice(0, replayPly).forEach((move) => { board[move.cell] = move.player === "black" || move.player === 1 ? 1 : -1; });
    const table = element("table");
    table.append(element("caption", "", "● 黑方，○ 白方，· 空位。"));
    const header = element("tr"); header.append(element("th", "", ""));
    for (let x = 0; x < state.width; x++) header.append(element("th", "", String.fromCharCode(65+x)));
    table.append(header);
    for (let y = 0; y < state.height; y++) {
      const row = element("tr"); row.append(element("th", "", state.height-y));
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

  function readIntegerInput(id, label) {
    const input = $(id);
    if (!input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      throw new Error(label + "请输入 " + input.min + "–" + input.max + " 之间的整数。");
    }
    return Number(input.value);
  }
  function selectedClock() {
    const mode = document.querySelector('input[name="clock-mode"]:checked').value;
    if (mode === "untimed") return null;
    const presets = {
      quick: { initialMs: 300000, incrementMs: 5000 },
      standard: { initialMs: 900000, incrementMs: 15000 },
      relaxed: { initialMs: 1800000, incrementMs: 30000 }
    };
    return presets[mode];
  }
  $("create-form").addEventListener("submit", (event) => {
    event.preventDefault();
    guarded(async () => {
      if (pending) return;
      pending = true; $("create-button").disabled = true;
      try {
        const topology = document.querySelector('input[name="topology"]:checked').value;
        const width = readIntegerInput("board-width", "棋盘宽度");
        const height = readIntegerInput("board-height", "棋盘高度");
        const result = await call("arena_create", {
          topology, mode: document.querySelector('input[name="mode"]:checked').value,
          playPolicy: document.querySelector('input[name="play-policy"]:checked').value,
          difficulty: document.querySelector('input[name="difficulty"]:checked').value,
          width, height, players: drafts, clock: selectedClock()
        }, true);
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
  $("pause-button").addEventListener("click", () => guarded(() => control("pause")));
  $("resume-button").addEventListener("click", () => guarded(async () => {await control("resume");closeSettings();}));
  $("stop-button").addEventListener("click", () => $("stop-dialog").showModal());
  $("adjudicate-button").addEventListener("click", () => $("adjudicate-dialog").showModal());
  document.querySelectorAll("[data-disqualify]").forEach(button => button.addEventListener("click", () => {
    const role = button.dataset.disqualify, gameId = state.gameId, winner = role === "black" ? "white" : "black";
    $("adjudicate-dialog").close();
    confirmMutation(names[role] + "违规判负？", names[winner] + "获胜，棋局立即结束。", async () => {
      if (state?.gameId !== gameId) throw new Error("棋局已切换，请重新确认。");
      await control("disqualify", { role });
      closeSettings();
    });
  }));
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
  document.addEventListener("click",event=>{const button=event.target.closest("[data-profile]");if(button)openProfile(button.dataset.profile);});
  document.querySelectorAll('input[type="number"]').forEach(input => input.addEventListener("input", () => input.removeAttribute("aria-invalid")));
  setInterval(() => { renderClocks(); if (streamConnected && state?.phase === "waiting") renderPosition(); }, 200);
  $("conversation").addEventListener("scroll", fadeConversation, { passive: true });
  $("conversation").addEventListener("wheel", interruptConversationMotion, { passive: true });
  $("conversation").addEventListener("pointerdown", interruptConversationMotion, { passive: true });
  $("conversation").addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interruptConversationMotion();
  });
  new ResizeObserver(() => { paintBubbleSurfaces(); fadeConversation(); }).observe($("conversation"));
  $("avatar-upload").addEventListener("change",()=>guarded(async()=>{const button=$("profile-form").querySelector('[type="submit"]');button.disabled=true;try{await uploadAvatar($("avatar-upload").files[0]);}finally{button.disabled=false;}}));
  $("profile-form").addEventListener("submit",event=>{event.preventDefault();guarded(async()=>{
    const value={name:$("profile-name").value.trim(),avatar:selectedAvatar},target=profileTarget;
    if(target.gameId){const next=await call("arena_profile",{gameId:target.gameId,role:target.role,...value},true);if(state?.gameId===target.gameId)applyState(next);}
    drafts[target.role]=value;localStorage.setItem("arena-player-profiles",JSON.stringify(drafts));renderDrafts();$("profile-dialog").close();
  });});
  $("clear-records").addEventListener("click",()=>confirmMutation("清空已结束棋局？","棋谱和发言将一并删除。",async()=>{const result=await call("arena_clear",{},true);if(result.deleted.includes(state?.gameId))showWelcome();await showRooms();}));
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
  document.fonts.ready.then(() => { drawBoard(); paintBubbleSurfaces(); fadeConversation(); });

  window.addEventListener("pagehide", () => { if (source) source.close(); });
  guarded(boot);
})();
