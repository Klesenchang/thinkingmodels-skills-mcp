import { createServer } from 'node:http';

/** A local public API double; deliberately does not require the production site. */
export async function publicApiFixture({ onRequest } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ url: req.url, method: req.method, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    if (onRequest && await onRequest(req, res)) return;
    if (req.url.includes('m404')) {
      res.writeHead(404).end(JSON.stringify({ secret: 'do not expose upstream bodies' }));
      return;
    }
    res.end(JSON.stringify({ fixture: true, path: req.url, items: [{ id: 'm00001', name: 'First principles' }] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}
