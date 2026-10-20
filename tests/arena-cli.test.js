'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { main, localUrl, configFor, readArguments, SERVICE } = require('../arena/cli.cjs');

async function fixture(t, { service = SERVICE, otherWorkspace = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gomoku-arena-cli-'));
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = body ? JSON.parse(body) : null;
    requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/health') {
      res.end(JSON.stringify({ service, version: 'test', pid: process.pid, workspacePath: otherWorkspace ? path.join(root, 'other') : root }));
    } else if (req.url === '/api/call') {
      if (parsed.name === 'arena_move' && parsed.arguments.cell === -1) {
        res.statusCode = 409;
        res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_MOVE', message: 'Cell is outside the board.' } }));
      } else res.end(JSON.stringify({ ok: true, result: parsed }));
    } else if (req.url === '/api/shutdown') {
      res.end(JSON.stringify({ ok: true, result: { stopped: true } }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await fs.mkdir(path.join(root, '.arena'));
  await fs.writeFile(path.join(root, '.arena', 'runtime.json'), JSON.stringify({ pid: process.pid, url, workspacePath: root, hostToken: 'private-host-token', version: 'test' }));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  async function run(argv, extra = {}) {
    let out = '', err = '';
    const code = await main(argv, { root, stdout: { write: value => { out += value; } }, stderr: { write: value => { err += value; } }, ...extra });
    return { code, out, err };
  }
  return { root, url, requests, run };
}

test('CLI accepts only local loopback HTTP endpoints', () => {
  assert.equal(localUrl('http://localhost:4318/'), 'http://localhost:4318');
  assert.equal(localUrl('http://[::1]:4318'), 'http://[::1]:4318');
  for (const input of ['https://127.0.0.1:4318', 'http://example.com:4318', 'http://127.0.0.1:4318/api', 'http://secret@127.0.0.1:4318', 'http://127.0.0.1:4318?token=x']) {
    assert.throws(() => localUrl(input), { code: 'LOCAL_ONLY' });
  }
});

test('up reuses a healthy owned service without spawning another process', async t => {
  const fx = await fixture(t);
  const result = await fx.run(['up', '--no-open'], { spawn() { throw new Error('Must not spawn'); } });
  assert.equal(result.code, 0, result.err);
  const value = JSON.parse(result.out).result;
  assert.equal(value.reused, true);
  assert.equal(value.hostUrl, `${fx.url}/#host=private-host-token`);
});

test('up and stop refuse a service belonging to another checkout', async t => {
  const fx = await fixture(t, { otherWorkspace: true });
  for (const command of ['up', 'stop']) {
    const result = await fx.run([command, ...(command === 'up' ? ['--no-open'] : [])]);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.err).error.code, 'SERVICE_NOT_OWNED');
  }
  assert.equal(fx.requests.filter(request => request.url === '/api/shutdown').length, 0);
});

test('CLI rejects another HTTP service instead of treating it as Arena', async t => {
  const fx = await fixture(t, { service: 'some-other-service' });
  const result = await fx.run(['up', '--no-open'], { spawn() { throw new Error('Must not spawn'); } });
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.err).error.code, 'PORT_IN_USE');
});

test('CLI public status never prints the host credential', async t => {
  const fx = await fixture(t);
  const result = await fx.run(['status']);
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).result.owned, true);
  assert.equal(result.out.includes('private-host-token'), false);
});

test('CLI host actions authenticate locally while player calls preserve seat credentials', async t => {
  const fx = await fixture(t);
  const requestPath = path.join(fx.root, '.arena', 'request.json');
  await fs.writeFile(requestPath, JSON.stringify({ gameId: 'game', token: 'seat-token', text: '这一步先守住接缝。' }));
  assert.equal((await fx.run(['call', 'arena_create', '--json', '{"title":"对局"}'])).code, 0);
  assert.equal((await fx.run(['call', 'arena_speak', '--file', requestPath])).code, 0);
  assert.equal((await fx.run(['stop'])).code, 0);
  const calls = fx.requests.filter(request => request.url !== '/api/health');
  assert.equal(calls[0].auth, 'Bearer private-host-token');
  assert.equal(calls[1].auth, undefined);
  assert.equal(calls[1].body.arguments.token, 'seat-token');
  assert.equal(calls[1].body.arguments.text, '这一步先守住接缝。');
  assert.equal(calls[2].url, '/api/shutdown');
  assert.equal(calls[2].auth, 'Bearer private-host-token');
});

test('CLI propagates invalid moves as nonzero failures', async t => {
  const fx = await fixture(t);
  const result = await fx.run(['call', 'arena_move', '--json', '{"cell":-1}']);
  assert.equal(result.code, 1);
  assert.equal(result.out, '');
  assert.equal(JSON.parse(result.err).error.code, 'INVALID_MOVE');
});

test('JSON input supports BOM files and stdin without shell interpolation', async t => {
  const fx = await fixture(t);
  const result = await fx.run(['call', 'arena_speak', '--json', '-'], { stdin: Readable.from(['{"text":"$HOME `echo` 中文"}']) });
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).result.arguments.text, '$HOME `echo` 中文');
  assert.deepEqual(await readArguments({ json: '\uFEFF{"cell":1}' }), { cell: 1 });
  await assert.rejects(readArguments({ json: '[]' }), { code: 'INVALID_JSON' });
  await assert.rejects(readArguments({ json: '{}', file: 'anything' }), { code: 'USAGE' });
});

test('client configuration points all clients at the same bridge without host credentials', () => {
  const root = path.resolve('a project with spaces');
  const executable = path.resolve('node runtime', 'node.exe');
  const url = 'http://127.0.0.1:4987';
  const expected = [path.join(root, 'arena', 'mcp.cjs'), '--url', url];
  for (const client of ['claude', 'kimi']) {
    const config = JSON.parse(configFor(client, root, url, executable));
    assert.deepEqual(config.mcpServers['topology-gomoku-arena'], { command: executable, args: expected });
  }
  const opencode = JSON.parse(configFor('opencode', root, url, executable));
  assert.deepEqual(opencode.mcp['topology-gomoku-arena'].command, [executable, ...expected]);
  for (const client of ['codex', 'deepseek']) {
    const output = configFor(client, root, url, executable);
    assert.ok(output.includes(JSON.stringify(executable)));
    assert.ok(output.includes(JSON.stringify(expected)));
    assert.ok(!output.includes('hostToken'));
  }
  assert.throws(() => configFor('unknown', root, url), { code: 'UNKNOWN_CLIENT' });
});

test('invalid options fail before making a request or starting processes', async t => {
  const fx = await fixture(t);
  for (const argv of [['up', '--port', '0'], ['up', '--port', '65536'], ['up', '--port', 'bad'], ['call', 'arena_move', '--file'], ['status', '--host'], ['stop', 'anything']]) {
    const result = await fx.run(argv);
    assert.equal(result.code, 1);
  }
  assert.equal(fx.requests.length, 0);
});
