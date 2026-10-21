#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig } from './config.mjs';
import { createMcpServer } from './server.mjs';
import { createHttpMcpServer } from './http.mjs';

const HELP = `ThinkingModels public knowledge MCP server
Usage: node mcp/src/cli.mjs [--transport stdio|http] [--host 127.0.0.1] [--port 3000]

The default transport is stdio. HTTP serves POST /mcp and GET /healthz.
Non-loopback HTTP listening requires THINKINGMODELS_MCP_TOKEN.

Environment:
  THINKINGMODELS_API_BASE_URL       Public REST origin (default https://thinkingmodels.site)
  THINKINGMODELS_TIMEOUT_MS         Per-attempt timeout, 1..120000 (default 10000)
  THINKINGMODELS_HTTP_HOST          HTTP bind address (default 127.0.0.1)
  THINKINGMODELS_HTTP_PORT          HTTP port, 1..65535 (default 3000)
  THINKINGMODELS_MCP_TOKEN          Optional local / required remote bearer token
  THINKINGMODELS_ALLOWED_HOSTS      Exact hostnames or IPs, comma-separated
  THINKINGMODELS_ALLOWED_ORIGINS    Exact HTTP(S) origins, comma-separated

No authentication headers, cookies or personal data are sent to the REST backend.
`;

async function main() {
  const config = readConfig();
  if (config.help) { process.stdout.write(HELP); return; }
  let shutdown;
  if (config.transport === 'stdio') {
    const server = createMcpServer(config);
    await server.connect(new StdioServerTransport());
    shutdown = () => server.close();
  } else {
    const server = createHttpMcpServer(config);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });
    process.stderr.write(`ThinkingModels MCP listening on ${config.host}:${config.port} (/mcp).\n`);
    shutdown = () => server.shutdown();
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 5000);
    timer.unref();
    await shutdown();
    clearTimeout(timer);
    process.exitCode = 0;
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}

main().catch((error) => {
  // Configuration values and upstream response bodies are intentionally omitted.
  process.stderr.write(`ThinkingModels MCP startup failed: ${error.message}\n`);
  process.exitCode = 1;
});
