/**
 * Admin server-error observability (`APP12-H03` §11).
 *
 * §11 is deliberately narrow about the frontends: centralized server logs,
 * Next server errors, existing request correlation where available, health
 * visibility — and explicitly **not** per-component instrumentation and **not**
 * a browser analytics or RUM product (`APP12-H05` owns CWV measurement). The
 * API and the worker own every commerce business metric.
 *
 * This file supplies the second of those four. The other three already exist:
 * Grafana Alloy collects this process's stdout into Loki like any other pod,
 * the Gateway's request id reaches the API on every proxied call, and
 * `/healthz` has answered since APP1.
 *
 * Identical in shape to the Storefront's, and deliberately app-local in both.
 * Sharing thirty lines of JSON formatting would mean giving two Next builds a
 * dependency on `@embroidery/observability`, whose other exports open a socket
 * — a backend runtime package has no business in a frontend bundle graph.
 *
 * ## Why Next needed anything at all
 *
 * An unhandled error in a Server Component reaches the browser as the standard
 * error page and reaches the terminal as a framework-formatted, multi-line
 * stack. Neither is a log record: the multi-line form breaks one-record-per-line
 * collection, and nothing in it says which route, which method or which render
 * phase. `onRequestError` is Next's hook for exactly this, and it fires for
 * server-side errors the framework would otherwise only print.
 *
 * ## What is deliberately not in the record
 *
 * No query string, no headers, no cookies, no request body, no user agent and
 * no stack. `APP12-H01`'s redaction policy is binding here as it is on the API:
 * a query string is where a search term or a token would be, headers are where
 * a session cookie is, and a stack trace can carry the value of any local
 * variable in scope. The message is kept — it is authored by the code that
 * threw — and truncated.
 *
 * The shape matches the `APP0-B05` platform log record so a single Loki query
 * spans the API, the worker and both frontends.
 */
import type { Instrumentation } from 'next';

/** Matches `LOG_SCHEMA_VERSION` in the API's platform log record. */
const LOG_SCHEMA_VERSION = 1;

const SERVICE = 'admin';

/** Longest retained message. Matches the API's `MAX_LOG_MESSAGE_LENGTH`. */
const MAX_MESSAGE_LENGTH = 2_000;

/** Longest retained path. A pathname, never a URL and never a query. */
const MAX_PATH_LENGTH = 200;

/**
 * The pathname only.
 *
 * Next's `path` is the resource path and may carry the search string; the
 * search string is exactly where a token or a customer's search term would be.
 * Cut at the first `?` or `#`, then bound the length.
 */
function safePath(raw: string | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return 'unknown';
  }
  const cut = [raw.indexOf('?'), raw.indexOf('#')].filter((index) => index >= 0);
  const path = cut.length > 0 ? raw.slice(0, Math.min(...cut)) : raw;
  return path.length <= MAX_PATH_LENGTH ? path : path.slice(0, MAX_PATH_LENGTH);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error';
  return message.length <= MAX_MESSAGE_LENGTH ? message : message.slice(0, MAX_MESSAGE_LENGTH);
}

function safeName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error';
}

/**
 * Emits one JSON line per server-side error.
 *
 * It never throws and never re-raises: a logger that failed while reporting a
 * failure would replace a diagnosable error with an undiagnosable one, and Next
 * would surface the second instead of the first.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  try {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: LOG_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        level: 'error',
        service: SERVICE,
        event: 'nextjs.request.error',
        message: safeMessage(error),
        http: {
          method: typeof request.method === 'string' ? request.method : 'unknown',
          route: safePath(request.path),
        },
        error: { name: safeName(error) },
        attributes: {
          // Both are closed vocabularies Next itself publishes — which render
          // phase failed, and which router produced it. They are what turns
          // "the page broke" into "a Server Component threw during render".
          routerKind: context.routerKind,
          renderSource: context.renderSource,
          routeType: context.routeType,
        },
      })}\n`,
    );
  } catch {
    // Nothing to do and nothing safe to say. Swallowed deliberately.
  }
};
