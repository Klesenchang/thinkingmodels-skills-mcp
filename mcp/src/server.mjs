import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, callTool } from './tools.mjs';
import { createPublicApi } from './upstream.mjs';

export function createMcpServer(config) {
  const api = createPublicApi({ baseUrl: config.apiBaseUrl, timeoutMs: config.timeoutMs });
  const server = new Server({ name: 'thinkingmodels-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => callTool(api, request.params.name, request.params.arguments ?? {}, { signal: extra.signal }));
  return server;
}
