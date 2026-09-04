/**
 * The internal metrics listener (`APP12-H03` §10).
 *
 * A dedicated `node:http` server on its own port, deliberately not a route on
 * the business application. Three properties follow from that and none of them
 * would hold for a controller:
 *
 * - it is **not in the OpenAPI document**, because it is not a Nest controller
 *   and the generator cannot see it. §2 requires exactly that, and requires the
 *   baseline 125/138/278 to be unchanged;
 * - it is **not on the Gateway**, because the Gateway routes to the business
 *   port and this is a different one. Denial is a property of the topology
 *   rather than of a rule someone has to remember to write;
 * - it **cannot be reached through the business request pipeline**, so no
 *   guard, interceptor, envelope or release gate applies to it, and none of
 *   them can accidentally start applying to it either.
 *
 * It also gives the worker — which publishes no HTTP surface at all — somewhere
 * to be scraped without inventing a business API for it. The worker's liveness
 * semantics are untouched: this server is not a probe target, and a failure to
 * bind it is logged and swallowed rather than being allowed to stop a process
 * whose real job is running jobs (§19).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { METRICS_CONTENT_TYPE, renderMetrics } from './exposition';
import type { MetricRegistry } from './metric-registry';

/** The one path this server answers. */
export const METRICS_PATH = '/metrics';

/** Default internal port for both applications. Not published by any Gateway. */
export const DEFAULT_METRICS_PORT = 9464;

export interface MetricsListenerOptions {
  readonly registry: MetricRegistry;
  readonly port: number;
  /** Defaults to every interface: the scraper is a pod in the same cluster. */
  readonly host?: string;
  readonly onError?: (error: unknown) => void;
}

export interface MetricsListener {
  readonly port: number;
  close(): Promise<void>;
}

function notFound(response: ServerResponse): void {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found\n');
}

async function handle(
  registry: MetricRegistry,
  request: IncomingMessage,
  response: ServerResponse,
  onError: (error: unknown) => void,
): Promise<void> {
  // Only the exact path, and only GET/HEAD. Anything else is answered without
  // rendering, so an unexpected caller cannot make this process do work.
  const path = (request.url ?? '').split('?')[0];
  if (path !== METRICS_PATH) {
    notFound(response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    const body = await renderMetrics(registry);
    response.writeHead(200, {
      'content-type': METRICS_CONTENT_TYPE,
      'content-length': Buffer.byteLength(body).toString(),
      // The scrape is process state, never cacheable, and must never be
      // stored by an intermediary that might outlive the pod.
      'cache-control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error: unknown) {
    onError(error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('metrics render failed\n');
  }
}

/**
 * Starts the listener. Resolves once bound; rejects if the port is unusable,
 * which the caller is expected to log and continue from rather than exit on.
 */
export async function startMetricsListener(
  options: MetricsListenerOptions,
): Promise<MetricsListener> {
  const onError = options.onError ?? ((): void => undefined);
  const server: Server = createServer((request, response) => {
    void handle(options.registry, request, response, onError);
  });
  // A metrics scrape is a fast local request; a client that opens a socket and
  // says nothing must not be able to accumulate against the process.
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    const onListenError = (error: unknown): void => {
      reject(error instanceof Error ? error : new Error('metrics listener failed to bind'));
    };
    server.once('error', onListenError);
    server.listen(options.port, options.host ?? '0.0.0.0', () => {
      server.removeListener('error', onListenError);
      // Runtime errors after binding must not crash the process.
      server.on('error', onError);
      resolve();
    });
  });

  // The *bound* port, not the requested one: a caller may ask for `0` and let
  // the OS choose, and the address is the only place that answer exists.
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : options.port;

  return {
    port: boundPort,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections?.();
      }),
  };
}

/** Reads and validates the listener's configuration. Never reads a secret. */
export function resolveMetricsPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_METRICS_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid METRICS_PORT "${raw}": expected an integer between 1 and 65535.`);
  }
  return port;
}

/** `false` only when an operator explicitly disables the listener. */
export function resolveMetricsEnabled(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') {
    return true;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`Invalid METRICS_ENABLED "${raw}": expected "true" or "false".`);
}
