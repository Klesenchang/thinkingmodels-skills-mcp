import { isIP } from 'node:net';
import { validateApiBaseUrl } from './upstream.mjs';

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const integer = (name, value, minimum, maximum) => {
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return number;
};
function host(value) {
  const raw = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  if (isIP(raw)) return raw.toLowerCase();
  if (raw.length > 253 || !raw.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))) throw new Error('Hostnames must be literal IP addresses or DNS names, without schemes, paths, ports or wildcards.');
  return raw.toLowerCase();
}
const parseList = (name, value, convert) => {
  if (value === undefined) return null;
  const items = value.split(',').map((item) => item.trim());
  if (!items.length || items.some((item) => !item)) throw new Error(`${name} must be a nonempty comma-separated list.`);
  return [...new Set(items.map(convert))];
};
function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Allowed origins must be HTTP(S) origins.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Allowed origins must be exact HTTP(S) origins without paths or wildcards.');
  host(url.hostname);
  return url.origin;
}

export function readConfig(args = process.argv.slice(2), env = process.env) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') { flags.help = true; continue; }
    if (!['--transport', '--host', '--port'].includes(flag)) throw new Error(`Unsupported option: ${flag}`);
    if (Object.hasOwn(flags, flag)) throw new Error(`Duplicate option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    flags[flag] = value;
  }
  if (flags.help) return { help: true };
  const transport = flags['--transport'] ?? 'stdio';
  if (!['stdio', 'http'].includes(transport)) throw new Error('--transport must be stdio or http.');
  const bindHost = host(flags['--host'] ?? env.THINKINGMODELS_HTTP_HOST ?? '127.0.0.1');
  const port = integer('THINKINGMODELS_HTTP_PORT / --port', flags['--port'] ?? env.THINKINGMODELS_HTTP_PORT ?? 3000, 1, 65535);
  const timeoutMs = integer('THINKINGMODELS_TIMEOUT_MS', env.THINKINGMODELS_TIMEOUT_MS ?? 10000, 1, 120000);
  const token = env.THINKINGMODELS_MCP_TOKEN;
  if (token !== undefined && (!token || token.length > 1024 || /\s|[\x00-\x1f\x7f]/.test(token))) throw new Error('THINKINGMODELS_MCP_TOKEN must be a nonempty token without whitespace or control characters.');
  if (transport === 'http' && !LOOPBACK_HOSTS.has(bindHost) && !token) throw new Error('Non-loopback HTTP listening requires THINKINGMODELS_MCP_TOKEN.');
  return {
    transport, host: bindHost, port, timeoutMs, token,
    apiBaseUrl: validateApiBaseUrl(env.THINKINGMODELS_API_BASE_URL ?? 'https://thinkingmodels.site'),
    allowedHosts: parseList('THINKINGMODELS_ALLOWED_HOSTS', env.THINKINGMODELS_ALLOWED_HOSTS, host) ?? ['localhost', '127.0.0.1', '::1'],
    allowedOrigins: parseList('THINKINGMODELS_ALLOWED_ORIGINS', env.THINKINGMODELS_ALLOWED_ORIGINS, origin),
  };
}
