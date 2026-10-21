const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TRANSIENT_STATUS = new Set([408, 429, 502, 503, 504]);

class PublicApiError extends Error {
  constructor(publicMessage, retryable = false) {
    super(publicMessage);
    this.publicMessage = publicMessage;
    this.retryable = retryable;
  }
}

export function validateApiBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('THINKINGMODELS_API_BASE_URL must be an HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('THINKINGMODELS_API_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

async function readJson(response) {
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new PublicApiError('The public knowledge response exceeded the size limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PublicApiError('The public knowledge service returned an invalid response.');
  const chunks = [];
  let lengthRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PublicApiError('The public knowledge response exceeded the size limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks, lengthRead).toString('utf8')); }
  catch { throw new PublicApiError('The public knowledge service returned invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PublicApiError('The public knowledge service returned an invalid response.');
  return data;
}

export function createPublicApi({ baseUrl = 'https://thinkingmodels.site', timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  const origin = validateApiBaseUrl(baseUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Invalid public API timeout.');
  return {
    async get(path, query = new URLSearchParams(), { signal } = {}) {
      if (!/^\/api\/(?:taxonomy|entries(?:\/m\d+(?:\/(?:lineage|sources))?)?)$/.test(path)) throw new PublicApiError('Unsupported public knowledge route.');
      const url = new URL(path, origin);
      url.search = query.toString();
      // All requests are read-only and idempotent. At most one retry is allowed,
      // only for timeouts, connection errors or the explicit transient statuses.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        try {
          const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal });
          if (!response.ok) {
            await response.body?.cancel();
            throw new PublicApiError(response.status === 404 ? 'The included public model was not found.' : `The public knowledge service returned HTTP ${response.status}.`, TRANSIENT_STATUS.has(response.status));
          }
          return await readJson(response);
        } catch (error) {
          if (signal?.aborted) throw new PublicApiError('The public knowledge request was cancelled.');
          const safeError = error instanceof PublicApiError ? error : new PublicApiError(timedOut ? 'The public knowledge request timed out.' : 'The public knowledge service could not be reached.', true);
          if (attempt === 1 || !safeError.retryable) throw safeError;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        }
      }
      throw new PublicApiError('The public knowledge service is unavailable.');
    },
  };
}
