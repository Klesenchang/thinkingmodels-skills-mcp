import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.mjs';
import { LOOPBACK_HOSTS } from './config.mjs';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_CONCURRENT = 32;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_PEERS = 10_000;

function send(res, status, message, headers = {}) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify({ error: message }));
}

function validHost(req, allowedHosts) {
  const value = req.headers.host;
  if (typeof value !== 'string' || /[\s/@?#\\]/.test(value)) return false;
  try {
    const url = new URL(`http://${value}`);
    return allowedHosts.includes(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
  } catch { return false; }
}

function validOrigin(req, config, port) {
  const value = req.headers.origin;
  if (value === undefined) return true; // CLI clients do not send Origin.
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return false;
    if (config.allowedOrigins) return config.allowedOrigins.includes(value);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && Number(url.port || 80) === port;
  } catch { return false; }
}

function authorized(req, token) {
  if (!token) return true;
  const provided = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  return await new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const error = () => { cleanup(); reject(Object.assign(new Error('Request body could not be read.'), { status: 400 })); };
    const aborted = () => { cleanup(); reject(Object.assign(new Error('Request body was aborted.'), { status: 400 })); };
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        cleanup();
        req.resume(); // Drain without retaining attacker-controlled data.
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
      } else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 })); }
    };
    req.on('data', data);
    req.once('end', end);
    req.once('error', error);
    req.once('aborted', aborted);
  });
}

export function createHttpMcpServer(config) {
  const peers = new Map();
  const transports = new Set();
  let activeRequests = 0;
  const http = createServer(async (req, res) => {
    if (!validHost(req, config.allowedHosts) || !validOrigin(req, config, http.address()?.port ?? config.port)) return send(res, 403, 'Host or Origin is not allowed.');
    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', service: 'thinkingmodels-mcp' }));
      return;
    }
    if (req.url !== '/mcp') return send(res, 404, 'Not found.');
    if (!authorized(req, config.token)) return send(res, 401, 'Bearer token required.', { 'www-authenticate': 'Bearer realm="thinkingmodels-mcp"' });
    // Trust the socket peer only. Forwarding headers are user-controlled unless
    // a separate trusted proxy is explicitly responsible for enforcing limits.
    const peer = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let rate = peers.get(peer);
    if (!rate || now - rate.start >= RATE_WINDOW_MS) {
      if (peers.size >= MAX_RATE_PEERS) {
        for (const [address, value] of peers) if (now - value.start >= RATE_WINDOW_MS) peers.delete(address);
        if (!peers.has(peer) && peers.size >= MAX_RATE_PEERS) return send(res, 429, 'Rate limit capacity reached.', { 'retry-after': '60' });
      }
      rate = { start: now, count: 0 };
      peers.set(peer, rate);
    }
    if (++rate.count > 60) return send(res, 429, 'Too many requests.', { 'retry-after': '60' });
    if (req.method !== 'POST') return send(res, 405, 'Use POST /mcp.', { allow: 'POST' });
    if ((req.headers['content-type'] ?? '').toLowerCase().split(';', 1)[0].trim() !== 'application/json') return send(res, 415, 'Content-Type must be application/json.');
    if (activeRequests >= MAX_CONCURRENT) return send(res, 503, 'Too many concurrent requests.', { 'retry-after': '1' });
    activeRequests += 1;
    let server;
    let transport;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      activeRequests -= 1;
      if (transport) { transports.delete(transport); void transport.close().catch(() => {}); }
      if (server) void server.close().catch(() => {});
    };
    res.once('close', cleanup);
    try {
      const body = await readBody(req);
      if (res.destroyed) return;
      server = createMcpServer(config);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      transports.add(transport);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      send(res, error.status ?? 500, error.status ? error.message : 'MCP request failed.');
    } finally {
      if (res.writableEnded || res.destroyed) cleanup();
    }
  });
  http.requestTimeout = 15_000;
  http.headersTimeout = 10_000;
  http.maxHeadersCount = 64;
  http.shutdown = async () => {
    for (const transport of transports) await transport.close().catch(() => {});
    await new Promise((resolve) => { http.close(resolve); http.closeAllConnections(); });
  };
  return http;
}
