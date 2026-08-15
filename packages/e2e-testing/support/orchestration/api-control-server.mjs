/**
 * Loopback-only HTTP control seam for the isolated API lifecycle. A Playwright
 * spec runs in a separate process and cannot reach the orchestrator-owned API
 * host process directly, so — for the E01-C1-J02 API-unavailability journey only
 * — the orchestrator exposes stop/start/status over `127.0.0.1` on an ephemeral
 * port. It is bound to loopback, has no auth surface beyond that, and is torn
 * down with the rest of the environment. It drives the same single API service
 * handle, so restarts never leak a process.
 */
import http from 'node:http';

/**
 * @param {{ apiService: { start: () => Promise<void>, stop: () => Promise<void>, isRunning: () => boolean }, log: (msg: string) => void }} params
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startApiControlServer({ apiService, log }) {
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    (async () => {
      if (req.method === 'POST' && req.url === '/api/stop') {
        await apiService.stop();
        send(200, { running: apiService.isRunning() });
        return;
      }
      if (req.method === 'POST' && req.url === '/api/start') {
        await apiService.start();
        send(200, { running: apiService.isRunning() });
        return;
      }
      if (req.method === 'GET' && req.url === '/api/status') {
        send(200, { running: apiService.isRunning() });
        return;
      }
      // `APP4-E01-R01-C1`: the API is a separate host process, so a spec cannot
      // observe its output directly — and "the plaintext secret never reaches
      // API output" is a claim that has to be checked against the real thing.
      // Returns the bounded tail the service already keeps; the caller scans it
      // in memory and reports a boolean. Loopback-only, like the rest of this
      // seam, and torn down with the environment.
      if (req.method === 'GET' && req.url === '/api/log-tail') {
        send(200, { tail: apiService.tail() });
        return;
      }
      send(404, { error: 'not found' });
    })().catch((error) => {
      send(500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;
  log(`api control server @ ${url}`);

  return {
    url,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
