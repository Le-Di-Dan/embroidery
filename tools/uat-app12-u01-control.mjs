/**
 * `APP12-U01` loopback control surface.
 *
 * U01 is driven by a human-equivalent operator and customer in real browsers,
 * across many turns, so the world has to outlive any single command. This is the
 * seam the driver talks to: a loopback-only HTTP server that pumps the run's
 * in-process worker and answers two questions nothing else can answer.
 *
 * ## Why the worker has to be in this process
 *
 * `RecordingNotificationChannelAdapter` is the repository's only notification
 * channel, and it is deliberately memory-only — no table, no file, no log —
 * because the moment it wrote anywhere the delivered plaintext would be at rest.
 * So the process that *executes* the delivery must be the process that reads it.
 * A containerised worker would deliver to nobody readable (`APP12-H07`).
 *
 * ## What may leave this process, and what may not
 *
 * `GET /verification-code` returns the delivered code. That one has to cross the
 * boundary: a customer types it into a field, so a driver must hold it. It is a
 * six-digit, single-use, minutes-long secret for a synthetic identity in a world
 * that is dropped at teardown.
 *
 * `GET /open/order-access` **never returns the token**. It answers `302` with
 * the delivered secure link in `Location`, so the browser — and only the browser
 * — ever sees it. That is what lets §11's "token delivered via fragment, and
 * stripped after claim" be proven by observing the address bar rather than by
 * pasting a secret through a transcript, a report or a filename.
 *
 * Bound to `127.0.0.1` exclusively. UAT tooling; never imported by application
 * code and never started by any deployment.
 */
import { createServer } from 'node:http';

/** Newest delivery of a kind, or `undefined`. Index only — never the record. */
function latestIndexOf(worker, kind) {
  for (let index = worker.deliveryCount() - 1; index >= 0; index -= 1) {
    if (worker.safeDelivery(index).secretKind === kind) return index;
  }
  return undefined;
}

/**
 * Drains every due job, one real claim at a time, exactly as the poll loop
 * would. The guard is a bound and not a timeout: a run still producing due jobs
 * after this many attempts has a loop, and failing loudly beats spinning.
 */
async function drain(worker, guard = 25) {
  let executed = 0;
  for (let attempt = 0; attempt < guard; attempt += 1) {
    const summary = await worker.runOnce();
    if (summary === undefined) return executed;
    executed += 1;
  }
  throw new Error(`Worker still had due jobs after ${String(guard)} attempts.`);
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

/**
 * @param {{ worker: object, state: object, port?: number, log?: (m: string) => void }} params
 */
export async function startControlServer({ worker, state, port = 4499, log = () => {} }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    void (async () => {
      try {
        if (url.pathname === '/state') {
          json(response, 200, state());
          return;
        }
        if (url.pathname === '/worker/drain') {
          const executed = await drain(worker);
          json(response, 200, { executed, deliveries: worker.deliveryCount() });
          return;
        }
        if (url.pathname === '/deliveries') {
          const safe = [];
          for (let index = 0; index < worker.deliveryCount(); index += 1) {
            safe.push({ index, ...worker.safeDelivery(index) });
          }
          json(response, 200, { deliveries: safe });
          return;
        }
        if (url.pathname === '/verification-code') {
          await drain(worker);
          const index = latestIndexOf(worker, 'VERIFICATION_CODE');
          if (index === undefined) {
            json(response, 404, { error: 'no VERIFICATION_CODE delivery recorded' });
            return;
          }
          json(response, 200, { code: worker.secretOf(index) });
          return;
        }
        if (url.pathname === '/open/order-access') {
          await drain(worker);
          const index = latestIndexOf(worker, 'SECURE_LINK_TOKEN');
          if (index === undefined) {
            json(response, 404, { error: 'no SECURE_LINK_TOKEN delivery recorded' });
            return;
          }
          const location = worker.secureLinkOf(index);
          if (typeof location !== 'string' || location === '') {
            json(response, 500, { error: 'the delivery carried no secure link' });
            return;
          }
          // The one place the link exists outside this process is the browser's
          // own navigation. Never a body, never a log line.
          response.writeHead(302, { location, 'cache-control': 'no-store' });
          response.end();
          return;
        }
        json(response, 404, { error: 'unknown control route' });
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  log(`control server on http://127.0.0.1:${String(port)}`);
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
