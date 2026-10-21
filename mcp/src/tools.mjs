// These five tools mirror the public ThinkingModels MCP contract. No private
// profile, conversation, write, or authentication routes are exposed here.
export const TOOLS = [
  ['get_taxonomy', 'Return the public taxonomy and support levels.', { type: 'object', additionalProperties: false }],
  ['search_models', 'Search included public models.', {
    type: 'object', additionalProperties: false,
    properties: {
      query: { type: 'string', maxLength: 300 }, category: { type: 'string', pattern: '^[a-z]+$' },
      support: { enum: ['high', 'medium', 'low'] }, limit: { type: 'integer', minimum: 1, maximum: 25 },
    },
  }],
  ['get_model', 'Return one included public model.', { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', pattern: '^m\\d+$' } } }],
  ['get_model_lineage', "Return an included model's public lineage.", { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', pattern: '^m\\d+$' } } }],
  ['get_model_sources', "Return an included model's public sources.", {
    type: 'object', additionalProperties: false, required: ['id'],
    properties: { id: { type: 'string', pattern: '^m\\d+$' }, verified: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 25 } },
  }],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } }));

const toolNames = new Set(TOOLS.map(({ name }) => name));
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validLimit = (value) => value === undefined || (Number.isInteger(value) && value >= 1 && value <= 25);

export function validArguments(name, value) {
  if (!toolNames.has(name) || !plainObject(value)) return false;
  const keys = Object.keys(value);
  const only = (...allowed) => keys.every((key) => allowed.includes(key));
  if (name === 'get_taxonomy') return keys.length === 0;
  if (name === 'search_models') {
    return only('query', 'category', 'support', 'limit')
      && (value.query === undefined || (typeof value.query === 'string' && value.query.length <= 300))
      && (value.category === undefined || (typeof value.category === 'string' && /^[a-z]+$/.test(value.category)))
      && (value.support === undefined || ['high', 'medium', 'low'].includes(value.support))
      && validLimit(value.limit);
  }
  return only('id', ...(name === 'get_model_sources' ? ['verified', 'limit'] : []))
    && typeof value.id === 'string' && /^m\d+$/.test(value.id)
    && (name !== 'get_model_sources' || ((value.verified === undefined || typeof value.verified === 'boolean') && validLimit(value.limit)));
}

/** Map validated arguments to a fixed public GET allowlist. */
export async function callTool(api, name, args = {}, { signal } = {}) {
  if (!validArguments(name, args)) return { isError: true, content: [{ type: 'text', text: 'Unknown tool or invalid arguments.' }] };
  let path;
  const query = new URLSearchParams();
  if (name === 'get_taxonomy') path = '/api/taxonomy';
  else if (name === 'search_models') {
    path = '/api/entries';
    query.set('status', 'included');
    query.set('limit', String(args.limit ?? 25));
    if (args.query !== undefined) query.set('q', args.query);
    if (args.category !== undefined) query.set('category', args.category);
    if (args.support !== undefined) query.set('support', args.support);
  } else {
    path = `/api/entries/${args.id}`;
    if (name === 'get_model_lineage') path += '/lineage';
    if (name === 'get_model_sources') {
      path += '/sources';
      query.set('limit', String(args.limit ?? 25));
      if (args.verified !== undefined) query.set('verified', String(args.verified));
    }
  }
  try {
    const data = await api.get(path, query, { signal });
    return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.publicMessage ?? 'The public knowledge service is unavailable. Please try again later.' }] };
  }
}
