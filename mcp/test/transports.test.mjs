import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { publicApiFixture } from '../fixtures/public-api.mjs';
import { readConfig } from '../src/config.mjs';
import { createHttpMcpServer } from '../src/http.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

test('configuration rejects unsafe/invalid values and unsupported CLI flags', () => {
  assert.equal(readConfig([], {}).transport, 'stdio');
  assert.equal(readConfig([], {}).apiBaseUrl, 'https://thinkingmodels.site');
  assert.equal(readConfig(['--transport', 'http'], {}).host, '127.0.0.1');
  assert.equal(readConfig(['--help'], {}).help, true);
  for (const [args, env] of [
    [['--unknown'], {}], [['--port'], {}], [['--port', '0'], {}], [['--transport', 'sse'], {}],
    [[], { THINKINGMODELS_TIMEOUT_MS: 'abc' }], [[], { THINKINGMODELS_HTTP_PORT: '-3' }],
    [[], { THINKINGMODELS_API_BASE_URL: 'https://user:secret@example.com' }],
    [[], { THINKINGMODELS_API_BASE_URL: 'https://example.com/path?token=secret' }],
    [['--transport', 'http', '--host', '0.0.0.0'], {}],
    [[], { THINKINGMODELS_ALLOWED_HOSTS: '*' }], [[], { THINKINGMODELS_ALLOWED_ORIGINS: '*' }],
  ]) assert.throws(() => readConfig(args, env), 'invalid configuration');
  const remote = readConfig(['--transport', 'http', '--host', '0.0.0.0'], { THINKINGMODELS_MCP_TOKEN: 'long-test-token', THINKINGMODELS_ALLOWED_HOSTS: 'mcp.example.com' });
  assert.equal(remote.host, '0.0.0.0');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--transport/);
});

async function exerciseClient(client) {
  const list = await client.listTools();
  assert.equal(list.tools.length, 5);
  for (const tool of list.tools) assert.equal(tool.annotations.readOnlyHint, true);
  const result = await client.callTool({ name: 'search_models', arguments: { query: 'decision', limit: 2 } });
  assert.equal(result.structuredContent.fixture, true);
  assert.match(result.structuredContent.path, /status=included/);
  const missing = await client.callTool({ name: 'get_model', arguments: { id: 'm404' } });
  assert.equal(missing.isError, true);
  assert.doesNotMatch(missing.content[0].text, /do not expose/);
}

test('official SDK Client initializes, lists and calls the real stdio CLI', async (t) => {
  const fixture = await publicApiFixture();
  t.after(() => fixture.close());
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli], env: { THINKINGMODELS_API_BASE_URL: fixture.baseUrl }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const client = new Client({ name: 'offline-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  await exerciseClient(client);
  assert.equal(stderr, '');
  assert.ok(fixture.requests.every(({ headers }) => !headers.authorization && !headers.cookie));
});

async function startHttp(t, overrides = {}, fixtureOptions = {}) {
  const fixture = await publicApiFixture(fixtureOptions);
  t.after(() => fixture.close());
  const config = { ...readConfig(['--transport', 'http'], { THINKINGMODELS_API_BASE_URL: fixture.baseUrl }), ...overrides };
  const server = createHttpMcpServer(config);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.shutdown());
  return { fixture, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('official SDK HTTP Client initializes, lists and calls with stateless JSON responses', async (t) => {
  const { baseUrl, fixture } = await startHttp(t);
  const client = new Client({ name: 'offline-http-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  await exerciseClient(client);
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/mcp`)).status, 405);
  assert.ok(fixture.requests.every(({ headers }) => !headers.authorization && !headers.cookie));
});

test('HTTP protects Host, Origin, method, JSON body size and bearer token', async (t) => {
  const { baseUrl } = await startHttp(t, { token: 'test-secret-token' });
  const auth = { authorization: 'Bearer test-secret-token' };
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = request(`${baseUrl}/mcp`, { method: 'POST', headers: { host: 'attacker.test', ...auth } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.once('error', reject);
    req.end('{}');
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { origin: 'https://attacker.test', ...auth }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'PUT', headers: auth })).status, 405);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'xapplication/json' }, body: '{}' })).status, 415);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: 'x'.repeat(33 * 1024) })).status, 413);
  const client = new Client({ name: 'authorized-http', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: auth } }));
  assert.equal((await client.listTools()).tools.length, 5);
});

test('chunked bodies are capped even when Content-Length is absent', async (t) => {
  const { baseUrl } = await startHttp(t);
  const status = await new Promise((resolve, reject) => {
    const req = request(`${baseUrl}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.once('error', reject);
    req.write('x'.repeat(16 * 1024));
    req.end('x'.repeat(17 * 1024));
  });
  assert.equal(status, 413);
});

test('HTTP concurrency is capped at 32 and recovers after responses finish', async (t) => {
  let release;
  let allStarted;
  let count = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { allStarted = resolve; });
  const { baseUrl } = await startHttp(t, {}, { onRequest: async (_req, res) => {
    if (++count === 32) allStarted();
    await gate;
    res.end(JSON.stringify({ ok: true }));
    return true;
  } });
  t.after(release);
  const options = {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_taxonomy', arguments: {} } }),
  };
  const calls = Array.from({ length: 32 }, () => fetch(`${baseUrl}/mcp`, options));
  await started;
  assert.equal((await fetch(`${baseUrl}/mcp`, options)).status, 503);
  release();
  const results = await Promise.all(calls);
  assert.ok(results.every((res) => res.status === 200));
  await Promise.all(results.map((res) => res.json()));
  assert.equal((await fetch(`${baseUrl}/mcp`, options)).status, 200);
});

test('HTTP request rate is bounded per real peer address and ignores X-Forwarded-For', async (t) => {
  const { baseUrl } = await startHttp(t);
  let response;
  for (let index = 0; index < 61; index += 1) response = await fetch(`${baseUrl}/mcp`, { headers: { 'x-forwarded-for': `10.0.0.${index}` } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('HTTP CLI keeps stdout clean and exits cleanly on SIGTERM', async (t) => {
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, [cli, '--transport', 'http', '--port', String(port)], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stderr.on('data', (chunk) => { if (chunk.toString().includes('listening on')) resolve(); });
    child.once('exit', (code) => reject(new Error(`CLI exited before readiness: ${code}`)));
  });
  await ready;
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(stdout, '');
});
