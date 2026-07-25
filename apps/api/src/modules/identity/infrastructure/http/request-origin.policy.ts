/**
 * Origin and content-type policy for staff session mutations (ADR-APP1-001 §6).
 *
 * Layered CSRF beyond the SameSite=Strict cookie: a state-changing staff request
 * must originate from an allowlisted origin and, for the login body, be JSON.
 * Matching is exact on normalized `scheme://host[:port]` — never a substring —
 * so a sibling or suffix origin cannot slip through.
 *
 * Absent-Origin policy: a request with neither `Origin` nor `Referer` is treated
 * as non-browser (server-to-server, CLI, test) and allowed; a browser cross-site
 * request always carries one, and a foreign or `null` origin is rejected.
 */
import { Inject, Injectable } from '@nestjs/common';

import { STAFF_AUTH_CONFIG, type StaffAuthConfig } from '../../config/staff-auth.config';

/** Structural request shape: avoids importing an HTTP-server type. */
interface OriginReadableRequest {
  readonly headers: Record<string, unknown>;
}

@Injectable()
export class RequestOriginPolicy {
  constructor(@Inject(STAFF_AUTH_CONFIG) private readonly config: StaffAuthConfig) {}

  /**
   * Whether the request's origin is permitted. Absent origin ⇒ non-browser ⇒
   * allowed; present origin ⇒ must exactly match the allowlist.
   */
  isAllowedOrigin(request: OriginReadableRequest): boolean {
    const stated = this.statedOrigin(request);
    if (stated === null) {
      // No Origin/Referer at all — non-browser request, allowed.
      return true;
    }
    if (stated === undefined) {
      // Present but unparseable (including the literal `null`) — reject.
      return false;
    }
    return this.config.allowedOrigins.includes(stated);
  }

  /** Whether the request declares a JSON body (login only). */
  isJsonContentType(request: OriginReadableRequest): boolean {
    const raw = request.headers['content-type'];
    if (typeof raw !== 'string') {
      return false;
    }
    const mediaType = (raw.split(';', 1)[0] ?? '').trim().toLowerCase();
    return mediaType === 'application/json';
  }

  /**
   * Resolves the stated origin: `null` when neither header is present, the
   * normalized origin string when parseable, or `undefined` when present but
   * invalid.
   */
  private statedOrigin(request: OriginReadableRequest): string | null | undefined {
    const origin = request.headers['origin'];
    if (typeof origin === 'string' && origin !== '') {
      return originOf(origin);
    }
    const referer = request.headers['referer'];
    if (typeof referer === 'string' && referer !== '') {
      return originOf(referer);
    }
    return null;
  }
}

/**
 * Extracts a normalized `scheme://host[:port]` from a full URL, tolerating a
 * path (a `Referer` carries one) but rejecting non-HTTP schemes and the literal
 * `null`. Default ports are dropped and the host lowercased so comparison with
 * the allowlist is exact.
 */
function originOf(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  const defaultPort =
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80');
  const port = url.port === '' || defaultPort ? '' : `:${url.port}`;
  return `${url.protocol}//${url.hostname.toLowerCase()}${port}`;
}
