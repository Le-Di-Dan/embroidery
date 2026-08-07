/**
 * Per-session cookie naming, extraction and clearing (`IMP-D043` PO-03,
 * `APP3-B06A`).
 *
 * The name is **derived from the Session id in the path**, never discovered by
 * scanning. That is the whole design: a request authorizes one session, so it
 * may read exactly one cookie, and a browser holding ten session cookies cannot
 * have a foreign one silently accepted for an id it does not match. A "find the
 * cookie that looks like a session secret" implementation would authorize the
 * wrong session the first time a customer opened two designs.
 *
 * The id is validated before it is ever concatenated into a header name, so a
 * crafted path segment cannot inject cookie grammar.
 *
 * `APP3-B06A` clears cookies and never issues one: minting belongs to
 * `APP3-B07`, and there is deliberately no successful `Set-Cookie` here.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  DESIGN_SESSION_AUTH_CONFIG,
  type DesignSessionAuthConfig,
} from '../../config/design-session-auth.config';

/** The locked prefix (PO-03). `__Host-` forbids Domain and requires Secure + Path=/. */
export const DESIGN_SESSION_COOKIE_PREFIX = '__Host-nettheu_ds_';

/**
 * Canonical Session id form.
 *
 * UUID-shaped, as `idColumn()` issues. Anchored and case-insensitive only in the
 * hex digits; anything else — a comma, a semicolon, whitespace, an equals sign —
 * cannot reach the cookie name.
 */
const SESSION_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isCanonicalSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

/**
 * The one cookie name this Session's secret may travel in.
 *
 * Throws on a non-canonical id rather than returning a best-effort name: a
 * caller that has not validated the path segment must not get a header name
 * built from it.
 */
export function buildDesignSessionCookieName(sessionId: string): string {
  if (!isCanonicalSessionId(sessionId)) {
    throw new Error('A design session cookie name requires a canonical session id.');
  }
  return `${DESIGN_SESSION_COOKIE_PREFIX}${sessionId.toLowerCase()}`;
}

export interface ExtractedSessionSecret {
  readonly secret: string | undefined;
  /** True when the same name appears more than once with differing values. */
  readonly ambiguous: boolean;
}

/** Structural request shape: avoids importing an HTTP-server type. */
interface CookieReadableRequest {
  readonly headers: Record<string, unknown>;
}

@Injectable()
export class DesignSessionCookiePolicy {
  constructor(
    @Inject(DESIGN_SESSION_AUTH_CONFIG) private readonly config: DesignSessionAuthConfig,
  ) {}

  cookieName(sessionId: string): string {
    return buildDesignSessionCookieName(sessionId);
  }

  /**
   * Reads the secret for exactly this Session.
   *
   * A duplicated name with differing values is reported as ambiguous so the
   * caller refuses rather than guessing which value is authoritative.
   */
  extract(request: CookieReadableRequest, sessionId: string): ExtractedSessionSecret {
    const header = request.headers['cookie'];
    if (typeof header !== 'string' || header === '') {
      return { secret: undefined, ambiguous: false };
    }
    const wanted = this.cookieName(sessionId);
    const values: string[] = [];
    for (const pair of header.split(';')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      if (pair.slice(0, eq).trim() === wanted) {
        values.push(pair.slice(eq + 1).trim());
      }
    }
    if (values.length === 0) return { secret: undefined, ambiguous: false };
    if (new Set(values).size > 1) return { secret: undefined, ambiguous: true };
    return { secret: values[0], ambiguous: false };
  }

  /**
   * A `Set-Cookie` carrying a freshly issued secret (`APP3-B07`).
   *
   * `Max-Age` is derived from `expiresAt` and clamped at zero, so the cookie can
   * never outlive the session it authorizes — `IMP-D043` PO-03 requires exactly
   * that, and a fixed lifetime would drift from the absolute TTL on every
   * rotation. Attributes match `serializeDeletionCookie` so a later clear can
   * actually remove what this set.
   */
  serializeSessionCookie(sessionId: string, secret: string, expiresAt: Date, now: Date): string {
    const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    const parts = [
      `${this.cookieName(sessionId)}=${secret}`,
      `Max-Age=${String(maxAgeSeconds)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (this.config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }

  /**
   * A `Set-Cookie` that deletes this Session's cookie.
   *
   * Attributes must match the ones it was set with or the browser keeps the
   * original: same name, `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain`,
   * plus both `Max-Age=0` and a past `Expires` for older clients.
   */
  serializeDeletionCookie(sessionId: string): string {
    const parts = [
      `${this.cookieName(sessionId)}=`,
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (this.config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }
}
