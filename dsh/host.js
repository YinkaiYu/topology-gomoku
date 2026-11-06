/**
 * Native DeepSeek Harness integration for the local Topology Gomoku Arena.
 *
 * Two ideas shape this plugin:
 *
 * 1. The arena service is the authority. The player tool surface is discovered
 *    from the service's own MCP `tools/list`, so an upgraded arena checkout is
 *    picked up without editing this package; only the host-side operations
 *    (create / invite / service) are implemented here.
 * 2. 随想 stay what the arena already defines them as: notes the player writes
 *    through `arena_note`. The plugin only removes the ceremony around them
 *    (game id, seat token, ply, request id), never composes them.
 *
 * @module @local/topology-gomoku-arena
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
/** This plugin's own version, reported by `arena_service status`. */
const NATIVE_VERSION = require('./package.json').version
/** `dsh/` lives at the arena checkout root, so the checkout is the parent. */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Plugin name registered with the Loader. */
export const name = 'topology-gomoku-arena'
/** The Host tool registry is the only hard dependency. */
export const inject = ['tools']

/** Route prefix that serves the embedded arena panel from this Host. */
const ROUTE = '/topology-arena'
/** Directory name of the seat memory inside the DSH home. */
const STORE_DIR = 'topology-gomoku-arena'
/** Seat roles known to the arena. */
const ROLES = ['black', 'white', 'commentator']
/** Arguments the plugin fills from the bound seat instead of asking the model. */
const FILLABLE = new Set(['gameId', 'token', 'afterSeq', 'ply', 'expectedVersion', 'requestId'])
/** Read-only player tools may run in parallel. */
const READONLY_TOOLS = new Set(['arena_state', 'arena_wait', 'arena_rules', 'arena_replay'])
/** Roles as displayed to a Chinese-speaking host. */
const ROLE_NAMES = { black: '黑方', white: '白方', commentator: '解说员' }

const DEFAULT_CONFIG = {
  repoPath: '',
  port: 4318,
  nodePath: '',
  autoStart: true,
  startupTimeoutMs: 20000,
  stopOnExit: false,
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Build one coded error that the tool pipeline reports as a normal failure. */
function failure(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** Preserve an arena error code in the message prefix. */
function arenaFailure(error) {
  if (error && typeof error.code === 'string') return failure(error.code, error.message || String(error))
  return error instanceof Error ? error : new Error(String(error))
}

/** Format a duration as m:ss. */
function duration(ms) {
  if (!Number.isFinite(ms)) return '—'
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** One compact clock line for tool renderings. */
function clockLine(clock, role) {
  if (!clock) return '本局不限时'
  const self = clock.remainingMs?.[role]
  const other = clock.remainingMs?.[role === 'black' ? 'white' : 'black']
  return `余时 ${duration(self)}，对手 ${duration(other)}（+${duration(clock.incrementMs)}/手）`
}

/** Human board coordinate for a coordinate string or a zero-based cell index. */
function coordinateText(cell, width, height) {
  if (typeof cell === 'string') {
    const match = /^([A-S])([1-9]|1[0-9])$/i.exec(cell.trim())
    return match ? `${match[1].toUpperCase()}${match[2]}` : undefined
  }
  if (!Number.isInteger(cell) || !Number.isInteger(width) || !Number.isInteger(height)) return undefined
  if (cell < 0 || cell >= width * height) return undefined
  return `${String.fromCharCode(65 + (cell % width))}${height - Math.floor(cell / width)}`
}

/** Resolve the DSH home used for the per-session seat memory. */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** Stable short id for invitation-independent keys. */
function stableId(parts) {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
}

/** Whether a value is a plain object. */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strip trailing separators from a directory path. */
function normalizeDir(value) {
  return String(value).replace(/[\\/]+$/, '')
}

/** Absolute path inside the arena checkout. */
function repoFile(repoPath, ...parts) {
  return path.join(repoPath, ...parts)
}

/** JSON with sorted keys, for stable request-id keys. */
function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The Harness session that dispatched the call. */
function sessionOf(exec) {
  const agent = exec?.agent
  return agent?.id || agent?.session?.id || 'unbound'
}

// ---------------------------------------------------------------------------
// Arena service bridge
// ---------------------------------------------------------------------------

/**
 * Owns the relationship with one local arena service: discovery, optional
 * startup, host-authenticated calls, tool discovery and the panel read model.
 */
class ArenaBridge {
  constructor(options, logger) {
    this.options = options
    this.logger = logger
    this.child = null
    this.starting = null
    this.stderr = []
  }

  get url() {
    return `http://127.0.0.1:${this.options.port}`
  }

  get runtimePath() {
    return repoFile(this.options.repoPath, '.arena', 'runtime.json')
  }

  get serverScript() {
    return repoFile(this.options.repoPath, 'arena', 'server.cjs')
  }

  get dataDir() {
    return repoFile(this.options.repoPath, '.arena', 'data')
  }

  warn(message) {
    try {
      this.logger?.warn?.(`topology-arena: ${message}`)
    } catch {
      /* a logging failure must not fail the operation */
    }
  }

  /** Read the runtime file written by the running service. */
  readRuntime() {
    try {
      const value = JSON.parse(fs.readFileSync(this.runtimePath, 'utf8'))
      if (!value || typeof value.hostToken !== 'string' || typeof value.url !== 'string') return null
      return value
    } catch {
      return null
    }
  }

  /** Health probe with a short deadline; null means "not running". */
  async health(timeoutMs = 1200) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${this.url}/api/health`, { signal: controller.signal })
      if (!response.ok) return null
      const value = await response.json()
      return value && value.service === 'topology-gomoku-arena' ? value : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /** Resolve the node executable used to start the arena service. */
  nodeBinary() {
    if (this.options.nodePath && fs.existsSync(this.options.nodePath)) return this.options.nodePath
    if (!process.versions.electron && process.execPath) return process.execPath
    for (const candidate of ['C:/Program Files/nodejs/node.exe', 'C:/Program Files (x86)/nodejs/node.exe']) {
      if (fs.existsSync(candidate)) return candidate
    }
    return 'node'
  }

  /** Service status without starting anything. */
  async status() {
    const health = await this.health()
    const runtime = this.readRuntime()
    return {
      running: Boolean(health),
      managed: Boolean(this.child),
      url: this.url,
      repoPath: this.options.repoPath,
      pid: health?.pid ?? null,
      version: health?.version ?? null,
      nativeVersion: NATIVE_VERSION,
      gameVersion: health?.gameVersion ?? null,
      nodePath: this.nodeBinary(),
      hostToken: Boolean(runtime?.hostToken),
    }
  }

  /**
   * Read model for the embedded spectator panel: the local arena origin and a
   * small match directory. The panel frames the arena's own `?embed=1` page, so
   * the renderer, SSE stream and motion stay entirely upstream.
   */
  async view() {
    const health = await this.health()
    const result = { url: this.url, running: Boolean(health), games: [], selected: null, error: null }
    if (!health) return result
    try {
      const list = await this.hostCall('arena_list', {})
      const matches = Array.isArray(list?.matches) ? list.matches : []
      result.games = matches.map((match) => ({
        gameId: match.gameId,
        title: match.title,
        topology: match.topology,
        phase: match.phase,
        ply: match.ply,
        turn: match.turn,
        updatedAt: match.updatedAt || null,
      }))
      const live = matches.find((match) => match.phase !== 'ended') || matches[0]
      result.selected = live ? live.gameId : null
    } catch (error) {
      result.error = arenaFailure(error).message
    }
    return result
  }

  /** Return a running service, starting one when allowed. */
  async ensure() {
    const health = await this.health()
    if (health) return health
    if (!this.options.autoStart) {
      throw failure('SERVICE_DOWN', `Arena service is not running at ${this.url}. Start it with arena_service action "start".`)
    }
    return this.start()
  }

  /** Start the arena service from the configured checkout. */
  async start() {
    if (this.starting) return this.starting
    this.starting = this.launch().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  async launch() {
    const existing = await this.health()
    if (existing) return existing
    const repoPath = this.options.repoPath
    if (!repoPath) throw failure('NO_REPO', 'No arena checkout is configured. Set repoPath in the plugin config.')
    if (!fs.existsSync(this.serverScript)) throw failure('NO_REPO', `Arena service entry not found: ${this.serverScript}`)
    const binary = this.nodeBinary()
    this.stderr = []
    const child = spawn(binary, [this.serverScript, '--port', String(this.options.port)], {
      cwd: repoPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    this.child = child
    const collect = (chunk) => {
      this.stderr.push(String(chunk))
      if (this.stderr.length > 40) this.stderr.shift()
    }
    child.stderr?.on('data', collect)
    child.stdout?.on('data', collect)
    let exited = null
    child.once('exit', (code) => {
      exited = code
      if (this.child === child) this.child = null
    })
    child.once('error', (error) => {
      exited = -1
      this.stderr.push(String(error.message))
    })

    const deadline = Date.now() + this.options.startupTimeoutMs
    while (Date.now() < deadline) {
      const health = await this.health(1000)
      if (health) return health
      if (exited !== null) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const detail = this.stderr.join('').trim().split('\n').slice(-6).join('\n')
    throw failure('START_FAILED', `Arena service did not become healthy at ${this.url}.${detail ? `\n${detail}` : ''}`)
  }

  /** Ask the running service to shut down and wait until the port is free. */
  async stop() {
    const health = await this.health()
    if (!health) return { stopped: false, alreadyStopped: true, url: this.url }
    const runtime = this.readRuntime()
    if (!runtime?.hostToken) {
      throw failure('NO_HOST_TOKEN', `The arena at ${this.url} is running but its runtime file is unreadable: ${this.runtimePath}`)
    }
    try {
      await fetch(`${runtime.url}/api/shutdown`, {
        method: 'POST',
        headers: { authorization: `Bearer ${runtime.hostToken}` },
      })
    } catch (error) {
      this.warn(`shutdown request failed: ${error.message}`)
    }
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      if (!(await this.health(800))) return { stopped: true, url: this.url }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw failure('STOP_FAILED', `Arena service at ${this.url} is still responding after shutdown.`)
  }

  /** POST one arena tool call over the service's own HTTP endpoint. */
  async post(body, headers, signal) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 32000)
    const relay = () => controller.abort()
    signal?.addEventListener('abort', relay, { once: true })
    try {
      const response = await fetch(`${this.url}/api/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await response.text()
      let value = null
      try {
        value = text ? JSON.parse(text) : null
      } catch {
        value = null
      }
      if (!response.ok) {
        throw failure(value?.error?.code || `HTTP_${response.status}`, value?.error?.message || `Arena request failed (${response.status}).`)
      }
      if (!value || value.ok !== true) throw failure('BAD_RESPONSE', 'Arena returned an unexpected response.')
      return value.result
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
    }
  }

  /** Call a match tool as the current seat (no host credential). */
  async call(name, args, signal) {
    await this.ensure()
    return this.post({ name, arguments: args }, {}, signal)
  }

  /** Call a host-only arena operation with the local host credential. */
  async hostCall(name, args, signal) {
    await this.ensure()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const runtime = this.readRuntime()
      if (!runtime?.hostToken) {
        throw failure('NO_HOST_TOKEN', `No host credential at ${this.runtimePath}. Leave the arena running or start it with arena_service.`)
      }
      try {
        return await this.post({ name, arguments: args }, { authorization: `Bearer ${runtime.hostToken}` }, signal)
      } catch (error) {
        if (error.code !== 'HOST_REQUIRED' || attempt === 1) throw error
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
    throw failure('NO_HOST_TOKEN', 'Host credential rejected.')
  }

  /** Read one unauthenticated JSON endpoint. */
  async getJSON(route) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(`${this.url}${route}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Discover the player tools from the service's own MCP endpoint. The endpoint
   * is stateless and answers `tools/list` without a session, so discovery costs
   * one request and always matches the running arena version.
   */
  async listTools() {
    const health = await this.health()
    if (!health) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${this.url}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'tools', method: 'tools/list' }),
        signal: controller.signal,
      })
      if (!response.ok) return null
      const text = await response.text()
      let value = null
      try {
        value = JSON.parse(text)
      } catch {
        // Older or differently configured servers may answer with an SSE frame.
        const frame = text.split('\n').filter((line) => line.startsWith('data:')).pop()
        if (frame) {
          try {
            value = JSON.parse(frame.slice(5).trim())
          } catch {
            value = null
          }
        }
      }
      const tools = value?.result?.tools
      return Array.isArray(tools) ? tools : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /** Find the match that owns an invitation token, so join only needs the token. */
  async gameForInvite(inviteToken) {
    let entries = []
    try {
      entries = fs.readdirSync(this.dataDir).filter((entry) => entry.startsWith('match-') && entry.endsWith('.json'))
    } catch {
      return null
    }
    for (const entry of entries) {
      try {
        const match = JSON.parse(fs.readFileSync(path.join(this.dataDir, entry), 'utf8'))
        const credentials = match?.credentials || {}
        for (const role of ROLES) {
          if (credentials[role]?.inviteToken === inviteToken) return { gameId: match.gameId, role, phase: match.phase }
        }
      } catch {
        /* unreadable saves are reported by the service itself */
      }
    }
    return null
  }

  /** Release a service this plugin started, when configured to do so. */
  dispose() {
    if (!this.options.stopOnExit || !this.child) return
    const runtime = this.readRuntime()
    if (!runtime?.hostToken) return
    fetch(`${runtime.url}/api/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${runtime.hostToken}` } }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** One sidebar-friendly match summary. */
function summarizeMatch(match) {
  return {
    gameId: match.gameId,
    title: match.title,
    topology: match.topology,
    mode: match.mode,
    phase: match.phase,
    ply: match.ply,
    turn: match.turn,
    seats: {
      black: seatSummary(match.seats?.black),
      white: seatSummary(match.seats?.white),
      commentator: seatSummary(match.seats?.commentator),
    },
    clock: match.clock ? { active: match.clock.active, remainingMs: match.clock.remainingMs } : null,
    updatedAt: match.updatedAt || null,
  }
}

/** One seat without credentials. */
function seatSummary(seat) {
  if (!seat) return null
  return { name: seat.name || seat.displayName || '', model: seat.model || '', joined: Boolean(seat.joined), ready: Boolean(seat.ready) }
}

// ---------------------------------------------------------------------------
// Seat memory and idempotency
// ---------------------------------------------------------------------------

/**
 * Remembers one seat per Harness session so tools do not need the game id and
 * token on every call. Stored next to the profile, readable only by the user.
 */
class SeatStore {
  constructor(file) {
    this.file = file
    this.data = { version: 1, seats: {} }
    this.load()
  }

  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (isObject(value) && isObject(value.seats)) this.data = { version: 1, seats: value.seats }
    } catch {
      /* first run, or a corrupt store is replaced on the next write */
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 })
      fs.renameSync(temporary, this.file)
    } catch (error) {
      throw failure('SEAT_STORE', `Could not save the arena seat: ${error.message}`)
    }
  }

  get(sessionId) {
    return this.data.seats[sessionId] || null
  }

  put(sessionId, seat) {
    this.data.seats[sessionId] = { ...seat, updatedAt: Date.now() }
    this.save()
  }

  touch(sessionId, patch) {
    const seat = this.get(sessionId)
    if (!seat) return null
    this.put(sessionId, { ...seat, ...patch })
    return this.data.seats[sessionId]
  }
}

/**
 * Stable request ids: a retried call with identical arguments reuses the id
 * generated for the first attempt, so the arena's receipt makes it idempotent.
 */
class RequestIds {
  constructor() {
    this.map = new Map()
  }

  get(sessionId, tool, args) {
    const { requestId, ...rest } = args
    const key = `${sessionId}|${tool}|${stableJSON(rest)}`
    const now = Date.now()
    const hit = this.map.get(key)
    if (hit && now - hit.at < 20 * 60 * 1000) return hit.id
    const id = crypto.randomUUID().replace(/-/g, '')
    this.map.set(key, { id, at: now })
    if (this.map.size > 500) {
      for (const [entryKey, entry] of this.map) {
        if (now - entry.at > 20 * 60 * 1000) this.map.delete(entryKey)
      }
    }
    return id
  }
}

// ---------------------------------------------------------------------------
// Dynamic player tool catalog
// ---------------------------------------------------------------------------

/**
 * Mirrors the arena's own MCP tool list on the Harness registry. Schemas and
 * descriptions come from `tools/list`, so an arena upgrade changes the tool
 * surface without touching this package. The adaptation layer only adds what a
 * seat makes implicit: identity arguments, the read cursor and request ids.
 */
class ToolCatalog {
  constructor(runtime) {
    this.ctx = runtime.ctx
    this.bridge = runtime.bridge
    this.seats = runtime.seats
    this.ids = runtime.ids
    this.options = runtime.options
    this.registrations = new Map()
    this.tools = new Map()
    this.refreshing = null
  }

  /** Re-read the service tool list and apply the difference. */
  async refresh() {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.apply().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  async apply() {
    const tools = await this.bridge.listTools()
    if (!tools) return { ok: false, reason: 'service-unavailable', count: this.registrations.size }
    const seen = new Set()
    for (const tool of tools) {
      if (!tool || typeof tool.name !== 'string') continue
      seen.add(tool.name)
      const previous = this.registrations.get(tool.name)
      const signature = JSON.stringify({ description: tool.description || '', schema: tool.inputSchema || null })
      if (previous && previous.signature === signature) continue
      try {
        previous?.dispose?.()
        const dispose = this.ctx.tools.register(this.definitionFor(tool))
        this.registrations.set(tool.name, { dispose, signature })
        this.tools.set(tool.name, tool)
      } catch (error) {
        this.bridge.warn(`tool ${tool.name} was not registered: ${error.message}`)
      }
    }
    for (const [toolName, entry] of this.registrations) {
      if (seen.has(toolName)) continue
      try {
        entry.dispose?.()
      } catch {
        /* already disposed */
      }
      this.registrations.delete(toolName)
      this.tools.delete(toolName)
    }
    return { ok: true, count: this.registrations.size, tools: [...this.registrations.keys()] }
  }

  /** Build one Harness definition for a discovered MCP tool. */
  definitionFor(tool) {
    const schema = adaptSchema(tool.inputSchema)
    const catalog = this
    const definition = {
      name: tool.name,
      description: tool.description || '',
      parameters: schema,
      output: {
        schema: {},
        render(args, value) {
          return catalog.render(tool.name, args, value)
        },
      },
      timeoutMs: tool.name === 'arena_wait' ? 30000 : 20000,
      isConcurrencySafe: () => READONLY_TOOLS.has(tool.name),
      async execute(args, exec) {
        return catalog.execute(tool.name, args, exec)
      },
    }
    if (tool.name === 'arena_note') definition.output.presentationMeta = noteMeta
    if (tool.name === 'arena_move') definition.output.presentationMeta = moveMeta
    return definition
  }

  /** Property names of the original schema, for the seat-aware injection. */
  propertiesOf(name) {
    const tool = this.tools.get(name)
    const properties = tool?.inputSchema?.properties
    return new Set(properties && typeof properties === 'object' ? Object.keys(properties) : [])
  }

  /** Names currently mirrored from the service, for status output. */
  names() {
    return [...this.registrations.keys()].sort()
  }

  render(name, args, value) {
    if (name === 'arena_note') return [noteText(value)]
    if (name === 'arena_move') return [moveText(value)]
    return [{ type: 'text', text: JSON.stringify(value) }]
  }

  /** Call one discovered tool with seat-derived defaults. */
  async execute(name, args, exec) {
    const sessionId = sessionOf(exec)
    const seat = this.seats.get(sessionId)
    try {
      if (name === 'arena_join') return await this.join(args, exec, sessionId)
      const properties = this.propertiesOf(name)
      if ((properties.has('token') || properties.has('gameId')) && !seat) {
        throw failure('NO_SEAT', 'This session has not joined a match yet. Call arena_join with the invitation first.')
      }
      const callArgs = { ...args }
      if (seat) {
        const targetGame = typeof callArgs.gameId === 'string' && callArgs.gameId ? callArgs.gameId : seat.gameId
        if (properties.has('gameId')) callArgs.gameId = targetGame
        if (properties.has('token')) {
          // The bound seat owns the call: an invitation token or a stale copy
          // must never override it, and another game is read without it.
          callArgs.token = targetGame === seat.gameId ? seat.token : undefined
        }
        if (properties.has('afterSeq') && callArgs.afterSeq == null) callArgs.afterSeq = Number.isInteger(seat.eventSeq) ? seat.eventSeq : 0
        if (properties.has('ply') && callArgs.ply == null) callArgs.ply = Number.isInteger(seat.ply) ? seat.ply : 0
        if (properties.has('expectedVersion') && callArgs.expectedVersion == null && Number.isInteger(seat.version)) callArgs.expectedVersion = seat.version
        if (properties.has('requestId') && callArgs.requestId == null) callArgs.requestId = this.ids.get(sessionId, name, callArgs)
      }
      const result = await this.bridge.call(name, callArgs, exec.signal)
      if (seat) this.remember(sessionId, result, name !== 'arena_replay')
      return result
    } catch (error) {
      throw arenaFailure(error)
    }
  }

  /** Bind the seat from an invitation, resolving the game when it is omitted. */
  async join(args, exec, sessionId) {
    let gameId = args.gameId
    if (!gameId) {
      const found = await this.bridge.gameForInvite(args.inviteToken)
      if (!found) throw failure('GAME_NOT_FOUND', 'No match in the arena data directory owns that invitation token. Start the service or pass gameId.')
      gameId = found.gameId
    }
    const result = await this.bridge.call('arena_join', {
      gameId,
      inviteToken: args.inviteToken,
      name: args.name,
      ...(args.model ? { model: args.model } : {}),
    }, exec.signal)
    this.seats.put(sessionId, {
      gameId,
      role: result.role,
      token: result.token,
      name: args.name,
      model: args.model || '',
      version: result.state?.version ?? 0,
      ply: result.state?.ply ?? 0,
      eventSeq: result.state?.eventSeq ?? 0,
      phase: result.state?.phase || null,
    })
    const { token: _token, ...rest } = result
    return {
      ...rest,
      roleName: ROLE_NAMES[result.role] || result.role,
      gameId,
      seat: { name: args.name, model: args.model || '' },
      seatBound: true,
      hint: 'seat credentials are bound to this session; later calls need no gameId or token',
    }
  }

  /** Cache the progress any result reveals, for the next implicit argument. */
  remember(sessionId, result, advanceCursor = true) {
    const state = isObject(result?.state) ? result.state : result
    if (!isObject(state)) return
    const patch = {}
    if (Number.isInteger(state.version)) patch.version = state.version
    if (Number.isInteger(state.ply)) patch.ply = state.ply
    if (advanceCursor) {
      const cursor = Number.isInteger(state.nextAfterSeq) ? state.nextAfterSeq : state.eventSeq
      if (Number.isInteger(cursor)) patch.eventSeq = cursor
    }
    if (typeof state.phase === 'string') patch.phase = state.phase
    if (Object.keys(patch).length) this.seats.touch(sessionId, patch)
  }
}

/** Relax the identity arguments the plugin fills from the bound seat. */
function adaptSchema(inputSchema) {
  let schema
  try {
    schema = inputSchema && typeof inputSchema === 'object' ? JSON.parse(JSON.stringify(inputSchema)) : { type: 'object', properties: {} }
  } catch {
    schema = { type: 'object', properties: {} }
  }
  if (!isObject(schema.properties)) schema.properties = {}
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter((name) => !FILLABLE.has(name))
    if (!schema.required.length) delete schema.required
  }
  return schema
}

/** Structured metadata consumed by the conversation row. */
function noteMeta(_args, value) {
  const state = value?.state || {}
  return {
    ply: value?.event?.ply,
    role: value?.event?.role,
    turn: state.turn ?? null,
    remainingMs: state.clock?.remainingMs ?? null,
    incrementMs: state.clock?.incrementMs ?? null,
    active: state.clock?.active ?? null,
  }
}

/** Structured metadata for a settled move. */
function moveMeta(_args, value) {
  return {
    ply: value?.ply,
    role: value?.lastMove?.player || null,
    cell: value?.lastMove?.cell,
    coordinate: value?.lastMove?.coordinate,
    remainingMs: value?.clock?.remainingMs ?? null,
    incrementMs: value?.clock?.incrementMs ?? null,
    active: value?.clock?.active ?? null,
  }
}

/** Compact thought receipt for the model. */
function noteText(value) {
  const state = value?.state || {}
  const turn = state.turn ? (state.turn === 'black' ? '黑方行棋' : '白方行棋') : '等待开赛'
  const lines = [`随想已记录（第 ${value?.event?.ply} 手）· ${turn} · ${clockLine(state.clock, value?.event?.role)}`]
  if (state.guidance) lines.push(state.guidance)
  return { type: 'text', text: lines.join('\n') }
}

/** Compact move receipt for the model that still carries the next decision. */
function moveText(value) {
  const move = value?.lastMove || {}
  const turn = value?.turn ? (value.turn === 'black' ? '黑方' : '白方') : '—'
  const lines = [`已落子 ${move.coordinate || move.cell}（第 ${value?.ply} 手）· 轮到${turn} · 版本 ${value?.version} · ${clockLine(value?.clock, move.player)}`]
  if (value?.phase === 'ended') lines.push(`棋局结束：${value.outcome || ''} ${value.winner ? `${value.winner} 胜` : ''} ${value.winReason || ''}`.trim())
  if (value?.guidance) lines.push(value.guidance)
  return { type: 'text', text: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Host-side tools: service and host operations
// ---------------------------------------------------------------------------

function registerHostTools(ctx, runtime) {
  const { bridge, seats, catalog, options } = runtime

  ctx.tools.register({
    name: 'arena_service',
    description:
      'Inspect, start, stop, refresh or open the local arena service. Starting reuses a healthy service; refresh re-reads the service tool list so an upgraded arena needs no plugin update.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'start', 'stop', 'refresh', 'open'], description: 'Service action; default status.' },
      },
    },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000,
    async execute(args) {
      const action = args.action || 'status'
      try {
        if (action === 'start') {
          const health = await bridge.start()
          const discovery = await catalog.refresh()
          return { started: true, discovery, ...(await bridge.status()), ...health }
        }
        if (action === 'stop') return await bridge.stop()
        if (action === 'refresh') {
          const discovery = await catalog.refresh()
          return { ...(await bridge.status()), discovery }
        }
        if (action === 'open') {
          const health = await bridge.ensure()
          openExternal(bridge.url)
          return { opened: true, url: bridge.url, ...health }
        }
        return { ...(await bridge.status()), tools: catalog.names() }
      } catch (error) {
        throw arenaFailure(error)
      }
    },
  })
  ctx.tools.register({
    name: 'arena_host',
    description:
      'Host operations for the local arena: list matches, read the level catalog, create a match with ready-to-send invitations, invite one more role, control a match, or delete an ended match. Invitations work for any arena client, with or without this plugin.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['catalog', 'list', 'create', 'invite', 'control', 'delete'], description: 'Host action.' },
        gameId: { type: 'string', description: 'Match id.' },
        topology: { type: 'string', description: 'Topology id from action catalog; default torus.' },
        mode: { type: 'string', enum: ['ai', 'duel'], description: 'Human versus built-in AI, or two invited players. Default duel.' },
        playPolicy: { type: 'string', enum: ['direct', 'assisted'], description: 'direct: reasoning only, 1 minute preparation. assisted: custom tools allowed, 5 minutes. Default direct.' },
        difficulty: { type: 'string', description: 'Built-in AI difficulty id from action catalog, for mode ai.' },
        width: { type: 'integer', minimum: 5, maximum: 19, description: 'Board width; defaults to the topology default.' },
        height: { type: 'integer', minimum: 5, maximum: 19, description: 'Board height; defaults to the topology default.' },
        title: { type: 'string', description: 'Match title shown in the arena.' },
        clock: {
          type: 'object',
          additionalProperties: false,
          description: 'Game clock; omit for 5 minutes plus 5 seconds per move.',
          properties: {
            initialMs: { type: 'integer', minimum: 1000, maximum: 3600000, description: 'Initial time per player in milliseconds.' },
            incrementMs: { type: 'integer', minimum: 0, maximum: 60000, description: 'Increment per move in milliseconds.' },
          },
        },
        role: { type: 'string', enum: ROLES, description: 'Role for invite, or the player for a disqualify control action.' },
        control: { type: 'string', enum: ['start', 'pause', 'resume', 'stop', 'disqualify', 'commentary_on', 'commentary_off'], description: 'Control action.' },
        invitation: { type: 'boolean', description: 'Whether create also invites the seats; default true.' },
      },
    },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 45000,
    async execute(args, exec) {
      const action = args.action || 'list'
      try {
        if (action === 'catalog') return await bridge.hostCall('arena_catalog', {}, exec.signal)
        if (action === 'list') {
          const result = await bridge.hostCall('arena_list', {}, exec.signal)
          return { matches: (result.matches || []).map(summarizeMatch) }
        }
        if (action === 'invite') {
          if (!args.gameId || !args.role) throw failure('INVALID_ARGUMENT', 'invite needs gameId and role.')
          const result = await bridge.hostCall('arena_invite', { gameId: args.gameId, role: args.role }, exec.signal)
          return { ...result, invitation: await buildInvitation(bridge, options, result.gameId, args.role, result.inviteToken) }
        }
        if (action === 'control') {
          if (!args.gameId || !args.control) throw failure('INVALID_ARGUMENT', 'control needs gameId and control.')
          return await bridge.hostCall('arena_control', {
            gameId: args.gameId,
            action: args.control,
            ...(args.role ? { role: args.role } : {}),
          }, exec.signal)
        }
        if (action === 'delete') {
          if (!args.gameId) throw failure('INVALID_ARGUMENT', 'delete needs gameId.')
          return await bridge.hostCall('arena_delete', { gameId: args.gameId }, exec.signal)
        }
        if (action === 'create') return await createMatch(bridge, options, args, exec.signal)
        throw failure('INVALID_ARGUMENT', `Unknown host action: ${action}`)
      } catch (error) {
        throw arenaFailure(error)
      }
    },
  })
}

/** Create one match and, by default, invite its seats with portable text. */
async function createMatch(bridge, options, args, signal) {
  const catalog = await bridge.hostCall('arena_catalog', {}, signal)
  const levels = Array.isArray(catalog.levels) ? catalog.levels : []
  const topology = args.topology || (levels.some((level) => level.topology === 'torus') ? 'torus' : levels[0]?.topology)
  if (!topology) throw failure('INVALID_TOPOLOGY', 'The arena catalog is empty.')
  const mode = args.mode || 'duel'
  const created = await bridge.hostCall('arena_create', {
    topology,
    mode,
    playPolicy: args.playPolicy || 'direct',
    ...(args.difficulty ? { difficulty: args.difficulty } : {}),
    ...(Number.isInteger(args.width) ? { width: args.width } : {}),
    ...(Number.isInteger(args.height) ? { height: args.height } : {}),
    ...(args.title ? { title: args.title } : {}),
    ...(args.clock ? { clock: args.clock } : {}),
  }, signal)
  const gameId = created.gameId
  const invitations = {}
  if (args.invitation !== false) {
    const roles = mode === 'ai' ? ['black'] : ['black', 'white']
    for (const role of roles) {
      const invited = await bridge.hostCall('arena_invite', { gameId, role }, signal)
      invitations[role] = {
        role,
        inviteToken: invited.inviteToken,
        text: await buildInvitation(bridge, options, gameId, role, invited.inviteToken),
      }
    }
  }
  return {
    gameId,
    url: bridge.url,
    topology: created.topology,
    mode: created.mode,
    playPolicy: created.playPolicy,
    preparationMs: created.preparation?.durationMs ?? null,
    title: created.title,
    invitations,
  }
}

/**
 * Render the invitation from the service's own template, so an upstream wording
 * change reaches every client without touching this plugin. The result is a
 * plain arena invitation: the DSH shortcut is only an extra hint.
 */
async function buildInvitation(bridge, options, gameId, role, inviteToken) {
  const root = normalizeDir(options.repoPath)
  const server = bridge.url
  const sep = root.includes('\\') ? '\\' : '/'
  const arena = `${root}${sep}arena`
  const values = {
    roleName: ROLE_NAMES[role] || role,
    server,
    mcpUrl: `${server}/mcp`,
    root,
    seatStatus: '未加入',
    skillPath: `${arena}${sep}skills${sep}topology-gomoku-arena${sep}SKILL.md`,
    rolePath: `${arena}${sep}prompts${sep}${role === 'commentator' ? 'commentator.md' : 'player.md'}`,
    joinArgs: JSON.stringify({ gameId, inviteToken, name: '你的名称' }, null, 2),
    playerPrompt: '请在规则允许的范围内尽最大努力赢下这盘棋，并勤发随想。',
  }
  try {
    const prompts = await bridge.getJSON('/api/prompts')
    if (typeof prompts?.invitation === 'string' && prompts.invitation.trim()) {
      if (typeof prompts.player === 'string' && prompts.player.trim()) values.playerPrompt = prompts.player.trim()
      const text = prompts.invitation.replace(/\{\{(\w+)\}\}/g, (_match, key) => (values[key] === undefined ? '' : String(values[key])))
      return `${text}\n\n（使用 DeepSeek Harness 的客户端可直接调用 arena_join；其他客户端按上面的 MCP 地址接入。）`
    }
  } catch {
    /* fall back to the local template */
  }
  return [
    `请作为${values.roleName}加入这场拓扑五子棋。`,
    '',
    `服务：${server}`,
    `MCP：${server}/mcp`,
    `本地仓库：${root}`,
    `席位状态：未加入`,
    '',
    '先读取以下本地文件，按其中的流程与角色要求参与本局：',
    `- 操作流程：${values.skillPath}`,
    `- 角色要求：${values.rolePath}`,
    '',
    'arena_join 参数：',
    values.joinArgs,
    '',
    '（使用 DeepSeek Harness 的客户端可直接调用 arena_join；其他客户端按上面的 MCP 地址接入。）',
    values.playerPrompt,
  ].join('\n')
}

/** Open one URL in the user's default browser. */
function openExternal(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch (error) {
    throw failure('OPEN_FAILED', `Could not open ${url}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Embedded spectator route
// ---------------------------------------------------------------------------

/** Write one JSON response. */
function sendJSON(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** Serve the panel read model; the page itself is the arena's own embed view. */
function createViewRoute(bridge, catalog) {
  return async (request, response) => {
    let pathname = ''
    try {
      pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    } catch {
      pathname = ''
    }
    if (!pathname.startsWith(ROUTE)) {
      sendJSON(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown route.' } })
      return
    }
    const tail = pathname.slice(ROUTE.length)
    try {
      if (request.method === 'GET' && tail === '/api/view') {
        const view = await bridge.view()
        // The panel is the local host's own surface; it hands the frame a host
        // credential so host actions survive a blocked third-party cookie.
        sendJSON(response, 200, { ...view, hostToken: bridge.readRuntime()?.hostToken || null })
        return
      }
      if (request.method === 'POST' && tail === '/api/start') {
        await bridge.start()
        await catalog.refresh()
        sendJSON(response, 200, await bridge.view())
        return
      }
      sendJSON(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown route.' } })
    } catch (error) {
      const coded = arenaFailure(error)
      sendJSON(response, 200, { url: bridge.url, running: false, games: [], selected: null, error: coded.message })
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/** Resolve and clamp the row config. */
function resolveOptions(config) {
  const value = isObject(config) ? config : {}
  const repoPath = typeof value.repoPath === 'string' && value.repoPath.trim() ? normalizeDir(value.repoPath.trim()) : PACKAGE_ROOT
  const port = Number.isInteger(value.port) && value.port >= 1 && value.port <= 65535 ? value.port : DEFAULT_CONFIG.port
  return {
    repoPath,
    port,
    nodePath: typeof value.nodePath === 'string' ? value.nodePath.trim() : '',
    autoStart: value.autoStart !== false,
    startupTimeoutMs: Number.isInteger(value.startupTimeoutMs) ? value.startupTimeoutMs : DEFAULT_CONFIG.startupTimeoutMs,
    stopOnExit: value.stopOnExit === true,
  }
}

/**
 * Mount the arena bridge, the discovered player tools and the host tools.
 * @param ctx - Host context owning the tool registry.
 * @param config - Row config from cordis.patch.yml.
 */
export function apply(ctx, config) {
  const options = resolveOptions(config)
  const logger = ctx.logger || console
  const bridge = new ArenaBridge(options, logger)
  const seats = new SeatStore(path.join(dshHome(), STORE_DIR, 'seats.json'))
  const ids = new RequestIds()
  const catalog = new ToolCatalog({ ctx, bridge, seats, ids, options })
  const runtime = { ctx, bridge, seats, ids, catalog, options }

  ctx.effect(() => () => bridge.dispose(), 'topology-arena: release service')
  registerHostTools(ctx, runtime)

  // Discovery is best effort: a stopped service simply leaves the player tools
  // out until `arena_service start` (or refresh) brings them in.
  void catalog.refresh()

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: ROUTE, handler: createViewRoute(bridge, catalog) }),
      'topology-arena: embedded spectator route',
    )
  })
}
