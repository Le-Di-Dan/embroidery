/**
 * Derives a log-safe route string from a request (APP0-B05).
 *
 * The route template is preferred over the concrete path — `/api/orders/:orderId`
 * rather than a URL carrying a real id — because the template names the endpoint
 * without embedding a value that might identify a person. When no template is
 * available the pathname is used with the query string stripped, since the query
 * is exactly where credentials and search terms hide. As a last resort the route
 * is `unknown`. The query is never logged, and the full absolute URL never is.
 *
 * A limitation is accepted and documented: a concrete pathname can still contain
 * an id when the framework did not expose a template. That is bounded (no query,
 * length-capped) and preferable to logging nothing.
 */

/** Structural view of the fields we read; avoids importing an HTTP-server type. */
export interface RoutableRequest {
  readonly method?: string;
  readonly route?: { readonly path?: string };
  readonly baseUrl?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

const MAX_ROUTE_LENGTH = 200;
const UNKNOWN_ROUTE = 'unknown';

export function safeRoute(request: RoutableRequest): string {
  const template = request.route?.path;
  if (typeof template === 'string' && template.length > 0) {
    const base = typeof request.baseUrl === 'string' ? request.baseUrl : '';
    return bound(joinPath(base, template));
  }
  const raw = request.originalUrl ?? request.url;
  if (typeof raw === 'string' && raw.length > 0) {
    return bound(stripQuery(raw));
  }
  return UNKNOWN_ROUTE;
}

export function safeMethod(request: RoutableRequest): string {
  return typeof request.method === 'string' && request.method.length > 0
    ? request.method
    : UNKNOWN_ROUTE;
}

function stripQuery(url: string): string {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const cut = [queryIndex, hashIndex].filter((index) => index >= 0);
  return cut.length > 0 ? url.slice(0, Math.min(...cut)) : url;
}

function joinPath(base: string, path: string): string {
  if (base === '') {
    return path;
  }
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function bound(route: string): string {
  return route.length <= MAX_ROUTE_LENGTH ? route : route.slice(0, MAX_ROUTE_LENGTH);
}
