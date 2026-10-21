import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.env.THINKINGMODELS_MCP_URL || 'https://thinkingmodels.site/mcp');
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) MCP URL without credentials.');
const headers = process.env.THINKINGMODELS_MCP_TOKEN ? { Authorization: `Bearer ${process.env.THINKINGMODELS_MCP_TOKEN}` } : {};
const client = new Client({ name: 'thinkingmodels-public-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
const names = ['get_taxonomy', 'search_models', 'get_model', 'get_model_lineage', 'get_model_sources'];
const checks = [];
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  assert(!result.isError, `${name} failed`);
  const data = result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text);
  checks.push(name);
  return data;
}
try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [...names].sort());
  assert(listed.tools.every(tool => tool.annotations?.readOnlyHint === true));
  await call('get_taxonomy', {});
  const searched = await call('search_models', { query: 'decision', limit: 1 });
  assert(searched.items?.length, 'No public model returned for the smoke query');
  const id = searched.items[0].id;
  assert.match(id, /^m\d+$/);
  await call('get_model', { id });
  await call('get_model_lineage', { id });
  await call('get_model_sources', { id, limit: 1 });
  console.log(JSON.stringify({ passed: true, endpoint: url.origin + url.pathname, tools: names.length, checks, publicModelId: id }, null, 2));
} finally {
  await client.close();
}
