import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, callTool } from '../src/tools.mjs';
import { createPublicApi } from '../src/upstream.mjs';

test('five read-only tools map to public GET paths and preserve response fields', async () => {
  const seen = [];
  const resultData = { entries: [{ id: 'm1' }], cursor: null, extra: { stable: true } };
  const api = createPublicApi({ baseUrl: 'https://fixture.invalid', fetchImpl: async (url, options) => {
    seen.push({ url: new URL(url), options });
    return Response.json(resultData);
  } });
  assert.deepEqual(TOOLS.map((tool) => tool.name), ['get_taxonomy', 'search_models', 'get_model', 'get_model_lineage', 'get_model_sources']);
  for (const tool of TOOLS) assert.equal(tool.annotations.readOnlyHint, true);
  const calls = [
    ['get_taxonomy', {}, '/api/taxonomy', ''],
    ['search_models', { query: 'a & b', category: 'learn', support: 'high', limit: 3 }, '/api/entries', '?status=included&limit=3&q=a+%26+b&category=learn&support=high'],
    ['get_model', { id: 'm00001' }, '/api/entries/m00001', ''],
    ['get_model_lineage', { id: 'm00001' }, '/api/entries/m00001/lineage', ''],
    ['get_model_sources', { id: 'm00001', verified: false }, '/api/entries/m00001/sources', '?limit=25&verified=false'],
  ];
  for (const [name, args, path, search] of calls) {
    const result = await callTool(api, name, args);
    assert.deepEqual(result.structuredContent, resultData);
    assert.deepEqual(JSON.parse(result.content[0].text), resultData);
    const request = seen.at(-1);
    assert.equal(request.url.pathname, path);
    assert.equal(request.url.search, search);
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.credentials, 'omit');
    assert.deepEqual(request.options.headers, { accept: 'application/json' });
  }
});

test('invalid arguments and unknown tools cannot reach fetch', async () => {
  let fetchCount = 0;
  const api = createPublicApi({ fetchImpl: async () => { fetchCount += 1; return Response.json({}); } });
  const cases = [
    ['private_data', {}], ['get_taxonomy', { auth: 'secret' }], ['get_taxonomy', []],
    ['search_models', { status: 'draft' }], ['search_models', { query: 'x'.repeat(301) }],
    ['search_models', { category: '../private' }], ['search_models', { limit: 0 }],
    ['search_models', { limit: 26 }], ['search_models', { limit: 1.2 }],
    ['search_models', { support: 'all' }], ['get_model', { id: '../private' }],
    ['get_model', {}], ['get_model_lineage', { id: 'm1', cookie: 'secret' }],
    ['get_model_sources', { id: 'm1', verified: 'true' }],
    ['get_model_sources', { id: 'm1', limit: 30 }],
  ];
  for (const [name, args] of cases) assert.equal((await callTool(api, name, args)).isError, true, name);
  assert.equal(fetchCount, 0);
});

test('default search always requests included entries with a bounded limit', async () => {
  let seen;
  const api = createPublicApi({ fetchImpl: async (url) => { seen = new URL(url); return Response.json({}); } });
  await callTool(api, 'search_models', {});
  assert.equal(seen.searchParams.get('status'), 'included');
  assert.equal(seen.searchParams.get('limit'), '25');
});

test('404 and permanent errors are not retried and do not expose bodies', async () => {
  for (const status of [400, 401, 403, 404, 500]) {
    let count = 0;
    const api = createPublicApi({ fetchImpl: async () => { count += 1; return new Response('secret body', { status }); } });
    const result = await callTool(api, 'get_model', { id: 'm1' });
    assert.equal(result.isError, true);
    assert.equal(count, 1);
    assert.doesNotMatch(result.content[0].text, /secret/);
  }
});

test('transient GET errors retry once, then fail safely', async () => {
  let count = 0;
  const api = createPublicApi({ fetchImpl: async () => ++count === 1 ? new Response('not public', { status: 503 }) : Response.json({ ok: true }) });
  assert.deepEqual((await callTool(api, 'get_taxonomy', {})).structuredContent, { ok: true });
  assert.equal(count, 2);
  count = 0;
  const failing = createPublicApi({ fetchImpl: async () => { count += 1; throw new Error('private network details'); } });
  const result = await callTool(failing, 'get_taxonomy', {});
  assert.equal(count, 2);
  assert.equal(result.isError, true);
  assert.doesNotMatch(result.content[0].text, /private/);
});

test('per-attempt timeout aborts the request with at most one retry', async () => {
  let count = 0;
  const api = createPublicApi({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => {
    count += 1;
    return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const result = await callTool(api, 'get_taxonomy', {});
  assert.equal(count, 2);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /timed out/);
});

test('oversized and invalid upstream responses fail without retries', async () => {
  for (const response of [new Response('x'.repeat(2 * 1024 * 1024 + 1)), new Response('not json'), Response.json(['unexpected array'])]) {
    let count = 0;
    const api = createPublicApi({ fetchImpl: async () => { count += 1; return response; } });
    assert.equal((await callTool(api, 'get_taxonomy', {})).isError, true);
    assert.equal(count, 1);
  }
});
