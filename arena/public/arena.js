(function arenaBrowser() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const Engine = window.TopologyGomoku;
  const Art = window.TopologyBoardArt;
  const Content = window.TopologyGameContent;
  const hostKey = "topology-arena-host";
  const gameKey = "topology-arena-game";
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has("host")) {
    sessionStorage.setItem(hostKey, fragment.get("host"));
    history.replaceState(null, "", location.pathname + location.search);
  }
  const hostToken = sessionStorage.getItem(hostKey) || "";
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
  const kinds = { reaction: "回应", thinking: "落子前", thought: "落子前", explanation: "落子说明", commentary: "场边解说", comment: "场边解说" };

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
  function error(message) {
    text("error-text", message);
    $("error-banner").hidden = false;
  }
  function connection(connected, label) {
    const node = $("connection");
    node.dataset.status = connected ? "connected" : "disconnected";
    node.title = label || (connected ? "已连接" : "连接中断");
    node.setAttribute("aria-label", node.title);
  }

  async function call(name, args = {}, admin = false) {
    const headers = { "Content-Type": "application/json" };
    if (admin && hostToken) headers.Authorization = "Bearer " + hostToken;
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
    return seat?.name || names[role] || role || "";
  }
  function formatTime(at) {
    if (!at) return "";
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  function isJoined(seat) { return Boolean(seat && (seat.joined || seat.name)); }
  function visibleEvents() {
    const events = state?.events || [];
    return replayPly === null ? events : events.filter((event) => Number(event.ply || 0) <= replayPly);
  }
  function voiceEvents(role) { return visibleEvents().filter((event) => event.role === role && typeof event.text === "string" && event.text.trim()); }
  function voiceMeta(event) {
    return (event.ply ? "第 " + event.ply + " 手 · " : "开局前 · ") + (kinds[event.kind] || (event.role === "commentator" ? "场边解说" : "棋手说棋"));
  }
  function renderVoice(role) {
    const node = $(role + "-voice");
    const events = voiceEvents(role).slice(-2).reverse();
    const key = state.gameId + ":" + events.map((event) => event.seq).join(",");
    if (node.dataset.events === key) return;
    node.dataset.events = key;
    node.replaceChildren();
    events.forEach((event) => {
      const item = element("blockquote", "voice-item speech-bubble");
      item.title = voiceMeta(event);
      item.setAttribute("aria-label", voiceMeta(event));
      item.append(element("p", "", event.text));
      node.append(item);
    });
  }

  function renderSeat(role) {
    const seat = state.seats?.[role];
    const joined = isJoined(seat);
    text(role + "-name", joined ? state.mode === "ai" && role === "white" ? "内置 AI" : seat.name || names[role] : "等待棋手");
    text(role + "-model", joined ? seat.model || "" : "");
    $(role + "-model").hidden = !seat?.model;
    $(role + "-turn").hidden = state.phase !== "playing" || state.turn !== role || replayPly !== null;
    const invite = document.querySelector('[data-invite="' + role + '"]');
    invite.hidden = !hostToken || joined || state.phase === "ended";
    invite.firstChild.textContent = "邀请" + names[role] + " ";
    document.querySelector('[data-reinvite="' + role + '"]').hidden = state.phase === "ended" || (state.mode === "ai" && role === "white");
    renderVoice(role);
  }
  function updateActivity() {
    if (!state) return;
    ["black", "white"].forEach((role) => {
      const seat = state.seats?.[role];
      $(role + "-name").title = seat?.model || "";
    });
  }

  function renderCommentary() {
    $("commentary").hidden = !state.commentaryEnabled;
    $("commentary-toggle").hidden = !isJoined(state.seats?.commentator) && !state.commentaryEnabled;
    text("commentary-toggle", state.commentaryEnabled ? "关闭解说" : "开启解说");
    document.querySelector('[data-reinvite="commentator"]').hidden = state.phase === "ended";
    const commentator = state.seats?.commentator;
    const event = voiceEvents("commentator").at(-1);
    text("commentary-heading", event ? commentator?.name || "解说" : "");
    const invite = document.querySelector('[data-invite="commentator"]');
    invite.hidden = !hostToken || isJoined(commentator) || state.phase === "ended";
    $("commentary").classList.toggle("has-speech", Boolean(event));
    $("commentary").classList.toggle("is-empty", !event && invite.hidden);
    const node = $("commentary-text");
    const key = state.gameId + ":" + (event?.seq || "");
    if (node.dataset.events === key) return;
    node.dataset.events = key;
    node.replaceChildren();
    if (event) {
      node.title = voiceMeta(event);
      node.append(element("p", "", event.text));
    }
  }

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
    $("new-button").hidden = !hostToken;
    text("match-title-display", state.title || level.name + " · 对弈");
    text("match-topology", level.typeName);
    text("turn-label", replayPly !== null ? "第 " + replayPly + " / " + state.ply + " 手" : state.phase === "ended" ? outcomeLabel() : state.phase === "playing" ? (names[state.turn] || "") + "行棋" : state.phase === "paused" ? "已暂停" : joined ? "已就绪" : "等待入席");
    renderSeat("black"); renderSeat("white"); updateActivity(); renderCommentary();
    $("match-actions").hidden = !hostToken;
    $("start-button").hidden = state.phase !== "waiting";
    $("start-button").disabled = !joined || pending;
    $("pause-button").hidden = state.phase !== "playing";
    $("resume-button").hidden = state.phase !== "paused";
    $("stop-button").hidden = state.phase === "ended";
    const moves = state.moves || [];
    $("replay-controls").hidden = !moves.length;
    $("replay-range").max = String(moves.length);
    $("replay-range").value = String(replayPly === null ? moves.length : replayPly);
    text("replay-label", replayPly === null ? "第 " + moves.length + " 手" : "第 " + replayPly + " 手 · 复盘");
    $("previous-move").disabled = (replayPly === null ? moves.length : replayPly) <= 0;
    $("next-move").disabled = replayPly === null || replayPly >= moves.length;
    $("return-live").hidden = replayPly === null;
    text("return-live", state.phase === "ended" ? "回到定局" : "回到当前棋局");
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
    localStorage.setItem(gameKey, gameId);
    source = new EventSource("/api/events?gameId=" + encodeURIComponent(gameId));
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
    $("new-button").hidden = true;
    $("create-form").hidden = !hostToken;
    $("spectator-notice").hidden = Boolean(hostToken);
    localStorage.removeItem(gameKey);
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
      label.append(input, span); label.title = level.typeName + " · " + level.edgeText;
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
    text("topology-description", level.typeName + " · " + (level.ruleText || level.edgeText || "") + " · " + level.width + " × " + level.height);
    $("welcome-glyph").src = "/assets/topologies/" + level.topology + ".svg";
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
    const fields = {
      roleName: role === "commentator" ? "解说员" : names[role] + "棋手",
      server: location.origin, gameId: invite.gameId, root: bootstrap.workspacePath,
      mcpUrl: bootstrap.mcpUrl,
      joinArgs: JSON.stringify({ gameId: invite.gameId, inviteToken: invite.inviteToken, name: rejoining ? seat.name : "你的名称", model: rejoining ? seat.model || "" : "" }),
      rolePrompt: role === "commentator" ? prompts.commentator : prompts.player
    };
    return prompts.invitation.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] ?? "");
  }

  async function invite(role) {
    if (!state || !hostToken) return;
    const result = await call("arena_invite", { gameId: state.gameId, role }, true);
    text("invite-heading", role === "commentator" ? "邀请解说员" : "邀请" + names[role] + "棋手");
    $("invite-text").value = await invitePrompt(result, role);
    $("invite-dialog").showModal();
  }
  async function showRooms() {
    const result = await call("arena_list");
    matches = result.matches || [];
    const node = $("room-list");
    node.replaceChildren();
    if (!matches.length) node.append(element("p", "room-empty", "还没有棋局。创建第一局，邀请棋手来相遇。"));
    matches.forEach((match) => {
      const button = element("button", "room-row"); button.type = "button";
      const label = element("span");
      const level = levelFor(match.topology);
      label.append(element("strong", "", match.title || level.name + " · 对弈"), element("small", "", level.typeName + " · " + (match.mode === "ai" ? "Agent 与内置 AI" : "两位 Agent") + " · " + (match.ply || 0) + " 手"));
      button.append(label, element("span", "", phases[match.phase] || ""));
      button.addEventListener("click", () => guarded(async () => { await selectGame(match.gameId); $("rooms-dialog").close(); }));
      node.append(button);
    });
    $("rooms-dialog").showModal();
  }
  function eventDescription(event) {
    if (event.text) return event.text;
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
    const saved = requested || localStorage.getItem(gameKey);
    const chosen = matches.find((item) => item.gameId === saved) || matches.find((item) => item.phase === "playing") || matches.find((item) => item.phase === "waiting");
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
        const result = await call("arena_create", { topology, mode: document.querySelector('input[name="mode"]:checked').value, difficulty: $("difficulty").value, title: $("match-title").value.trim() || levelFor(topology).name + " · 对弈" }, true);
        await selectGame(result.gameId || result.state?.gameId);
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
  document.querySelectorAll("[data-reinvite]").forEach((button) => button.addEventListener("click", () => guarded(() => invite(button.dataset.reinvite))));
  $("copy-invite").addEventListener("click", () => copy($("invite-text").value));
  $("commentary-toggle").addEventListener("click", () => guarded(() => control(state.commentaryEnabled ? "commentary_off" : "commentary_on")));
  $("rooms-button").addEventListener("click", () => guarded(showRooms));
  $("new-button").addEventListener("click", showWelcome);
  $("start-button").addEventListener("click", () => guarded(() => control("start")));
  $("pause-button").addEventListener("click", () => guarded(() => control("pause")));
  $("resume-button").addEventListener("click", () => guarded(() => control("resume")));
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
  setInterval(updateActivity, 10000);
  window.addEventListener("pagehide", () => { if (source) source.close(); });
  guarded(boot);
})();
