#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVICE = 'topology-gomoku-arena';
const DEFAULT_URL = 'http://127.0.0.1:4318';
const HOST_TOOLS = new Set(['arena_create', 'arena_invite', 'arena_control']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function localUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_URL', 'Use a local URL such as http://127.0.0.1:4318.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    fail('LOCAL_ONLY', 'Arena connects only to an HTTP loopback address with no path, credentials, query or fragment.');
  }
  return url.origin;
}

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (['--no-open', '--host'].includes(word)) {
      options[word.slice(2)] = true;
    } else if (['--port', '--url', '--json', '--file'].includes(word)) {
      if (i + 1 === rest.length || rest[i + 1].startsWith('--')) fail('USAGE', `Missing value for ${word}.`);
      options[word.slice(2)] = rest[++i];
    } else if (word.startsWith('--')) {
      fail('USAGE', `Unknown option ${word}.`);
    } else {
      positionals.push(word);
    }
  }
  const permitted = {
    up: ['port', 'no-open'], status: ['url'], stop: ['url'],
    call: ['url', 'json', 'file', 'host'], 'mcp-config': ['url'], help: [],
  };
  if (!permitted[command]) fail('USAGE', `Unknown command ${command}. Run node arena/cli.cjs help.`);
  for (const key of Object.keys(options)) {
    if (!permitted[command].includes(key)) fail('USAGE', `--${key} is not supported for ${command}.`);
  }
  const expected = command === 'call' || command === 'mcp-config' ? 1 : 0;
  if (positionals.length !== expected) fail('USAGE', `${command} expects ${expected} positional argument(s).`);
  return { command, options, positionals };
}

async function readRuntime(root) {
  try {
    const value = JSON.parse(await fsp.readFile(path.join(root, '.arena', 'runtime.json'), 'utf8'));
    if (typeof value.url !== 'string' || typeof value.hostToken !== 'string' ||
        !Number.isSafeInteger(value.pid) || typeof value.workspacePath !== 'string') {
      fail('RUNTIME_INVALID', 'Arena runtime record is invalid; inspect .arena/runtime.json before restarting.');
    }
    localUrl(value.url);
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function jsonRequest(url, init, fetchImpl = fetch, timeout = 5000) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  } catch (error) {
    fail('CONNECTION_FAILED', `Cannot connect to the local Arena service (${error.cause?.code || error.name}). Run node arena/cli.cjs status or up.`);
  }
  let value;
  try { value = await response.json(); } catch { fail('INVALID_RESPONSE', 'The local endpoint did not return Arena JSON. Check its port.'); }
  if (!response.ok || value.ok === false) fail(value.error?.code || 'HTTP_ERROR', value.error?.message || `HTTP ${response.status}`);
  return value;
}

async function health(url, fetchImpl = fetch) {
  const data = await jsonRequest(`${localUrl(url)}/api/health`, {}, fetchImpl, 1500);
  if (data.service !== SERVICE) fail('PORT_IN_USE', 'This port belongs to another service. Choose another port with up --port NUMBER.');
  return data;
}

function samePath(a, b) {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return typeof a === 'string' && typeof b === 'string' && normalize(a) === normalize(b);
}

function verifyOwner(runtime, data, root, url) {
  if (!runtime || !samePath(runtime.workspacePath, root) || !samePath(data.workspacePath, root) ||
      runtime.pid !== data.pid || localUrl(runtime.url) !== localUrl(url)) {
    fail('SERVICE_NOT_OWNED', 'The service does not match this checkout’s runtime record. Do not stop it; use its original checkout or choose another port.');
  }
}

function configFor(client, root, url, executable = process.execPath) {
  const args = [path.join(root, 'arena', 'mcp.cjs'), '--url', localUrl(url)];
  const stdio = { command: executable, args };
  const name = 'topology-gomoku-arena';
  if (client === 'codex') {
    return `[mcp_servers.${name}]\ncommand = ${JSON.stringify(executable)}\nargs = ${JSON.stringify(args)}\ntool_timeout_sec = 40\n`;
  }
  if (client === 'claude' || client === 'kimi') return `${JSON.stringify({ mcpServers: { [name]: stdio } }, null, 2)}\n`;
  if (client === 'opencode') {
    return `${JSON.stringify({ mcp: { [name]: { type: 'local', command: [executable, ...args], enabled: true, timeout: 40000 } } }, null, 2)}\n`;
  }
  if (client === 'deepseek') {
    return `- id: topology-gomoku-arena\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: topology-gomoku-arena\n    transport: stdio\n    command: ${JSON.stringify(executable)}\n    args: ${JSON.stringify(args)}\n    toolCallTimeoutMs: 40000\n`;
  }
  fail('UNKNOWN_CLIENT', 'Choose codex, claude, kimi, opencode or deepseek.');
}

async function readArguments(options, stdin = process.stdin) {
  if (options.json !== undefined && options.file !== undefined) fail('USAGE', 'Use either --json or --file.');
  let source = '{}';
  if (options.file) source = await fsp.readFile(path.resolve(options.file), 'utf8');
  else if (options.json === '-') {
    source = '';
    for await (const chunk of stdin) {
      source += chunk;
      if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) fail('INPUT_TOO_LARGE', 'JSON input must be at most 1 MiB.');
    }
  } else if (options.json !== undefined) source = options.json;
  let args;
  try { args = JSON.parse(source.replace(/^\uFEFF/, '')); } catch { fail('INVALID_JSON', 'Arguments must be valid JSON. Prefer --file request.json or --json - for shell-safe input.'); }
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_JSON', 'Tool arguments must be a JSON object.');
  return args;
}

async function openBrowser(url, spawnImpl, stderr) {
  let command, args;
  if (process.platform === 'win32') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${url.replace(/'/g, "''")}'`];
  } else {
    command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    args = [url];
  }
  const child = spawnImpl(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => stderr.write('Browser could not open automatically. Open the host URL printed above.\n'));
  child.unref();
}

async function up(root, options, dependencies) {
  const { fetchImpl, spawnImpl, stdout, stderr } = dependencies;
  let runtime = await readRuntime(root);
  const port = options.port === undefined ? null : Number(options.port);
  if (port !== null && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) fail('INVALID_PORT', 'Port must be an integer between 1 and 65535.');
  const url = localUrl(port !== null ? `http://127.0.0.1:${port}` : runtime?.url || DEFAULT_URL);
  let data;
  try { data = await health(url, fetchImpl); } catch (error) {
    // Only a refused connection means there is no service. Do not replace an
    // unrelated HTTP endpoint or a port occupied by a non-HTTP service.
    if (error.code !== 'CONNECTION_FAILED') throw error;
  }
  let reused = false;
  if (data) {
    verifyOwner(runtime, data, root, url);
    reused = true;
  } else {
    if (runtime && localUrl(runtime.url) !== url) {
      try {
        const active = await health(runtime.url, fetchImpl);
        verifyOwner(runtime, active, root, runtime.url);
        fail('ALREADY_RUNNING', `This checkout already runs at ${runtime.url}. Stop it before choosing another port.`);
      } catch (error) {
        if (error.code !== 'CONNECTION_FAILED') throw error;
      }
    }
    const stateDir = path.join(root, '.arena');
    await fsp.mkdir(stateDir, { recursive: true });
    const logPath = path.join(stateDir, 'server.log');
    const logFd = fs.openSync(logPath, 'a');
    let child;
    try {
      child = spawnImpl(process.execPath, [path.join(root, 'arena', 'server.cjs'), '--port', String(new URL(url).port || 80)], {
        cwd: root, detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true,
      });
    } finally { fs.closeSync(logFd); }
    let startupError;
    child.on('error', error => { startupError = error; });
    child.unref();
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (startupError) fail('START_FAILED', `Could not launch Arena: ${startupError.message}`);
      try {
        data = await health(url, fetchImpl);
        runtime = await readRuntime(root);
        verifyOwner(runtime, data, root, url);
        break;
      } catch (error) {
        if (!['CONNECTION_FAILED', 'SERVICE_NOT_OWNED'].includes(error.code)) throw error;
        data = null;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!data) fail('START_FAILED', `Arena did not become ready. Inspect ${logPath}; the selected port may be busy.`);
  }
  const hostUrl = `${url}/#host=${encodeURIComponent(runtime.hostToken)}`;
  stdout.write(`${JSON.stringify({ ok: true, result: { running: true, reused, url, hostUrl, pid: data.pid, version: data.version } }, null, 2)}\n`);
  if (!options['no-open']) await openBrowser(hostUrl, spawnImpl, stderr);
}

const HELP = `Topology Gomoku Arena — local agents, one shared board

  node arena/cli.cjs up [--port 4318] [--no-open]
  node arena/cli.cjs status [--url http://127.0.0.1:4318]
  node arena/cli.cjs stop [--url http://127.0.0.1:4318]
  node arena/cli.cjs call TOOL [--file request.json | --json - | --json JSON] [--url URL] [--host]
  node arena/cli.cjs mcp-config codex|claude|kimi|opencode|deepseek [--url URL]

Run npm ci --prefix arena once before starting. Configuration output is a merge
snippet; this command never edits client settings. Host tools authenticate using
this checkout's .arena/runtime.json. Player tools use the token in their JSON.
Keep runtime files and host URLs private. Node.js 20 or newer is required.
`;

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const root = path.resolve(dependencies.root || path.join(__dirname, '..'));
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  const fetchImpl = dependencies.fetch || fetch;
  const spawnImpl = dependencies.spawn || spawn;
  try {
    const { command, options, positionals } = parseArgs(argv);
    if (command === 'help') { stdout.write(HELP); return 0; }
    if (Number(process.versions.node.split('.')[0]) < 20) fail('NODE_VERSION', 'Arena requires Node.js 20 or newer.');
    if (command === 'up') {
      await up(root, options, { fetchImpl, spawnImpl, stdout, stderr });
      return 0;
    }
    const runtime = await readRuntime(root);
    const url = localUrl(options.url || runtime?.url || DEFAULT_URL);
    if (command === 'mcp-config') {
      stdout.write(configFor(positionals[0], root, url));
      stderr.write('Merge this entry into your client configuration; preserve other entries. Reload the client if its tools do not appear. No file was changed.\n');
      return 0;
    }
    const data = await health(url, fetchImpl);
    if (command === 'status') {
      stdout.write(`${JSON.stringify({ ok: true, result: { running: true, url, ...data, owned: !!runtime && samePath(runtime.workspacePath, root) && samePath(data.workspacePath, root) && runtime.pid === data.pid && localUrl(runtime.url) === url } }, null, 2)}\n`);
      return 0;
    }
    if (command === 'stop') {
      verifyOwner(runtime, data, root, url);
      const result = await jsonRequest(`${url}/api/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.hostToken}` } }, fetchImpl);
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    const name = positionals[0];
    if (!/^arena_[a-z_]+$/.test(name)) fail('INVALID_TOOL', 'Use an arena_ tool name.');
    const args = await readArguments(options, dependencies.stdin);
    const headers = { 'Content-Type': 'application/json' };
    if (options.host || HOST_TOOLS.has(name)) {
      verifyOwner(runtime, data, root, url);
      headers.Authorization = `Bearer ${runtime.hostToken}`;
    }
    const result = await jsonRequest(`${url}/api/call`, { method: 'POST', headers, body: JSON.stringify({ name, arguments: args }) }, fetchImpl, 35000);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code || 'CLI_ERROR', message: error.message } })}\n`);
    return 1;
  }
}

module.exports = { main, parseArgs, localUrl, configFor, verifyOwner, readArguments, SERVICE };
if (require.main === module) main().then(code => { process.exitCode = code; });
