/**
 * Admin session cookie policy (ADR-APP1-001 §5).
 *
 * One place that knows the cookie's name and attributes, so issuance, deletion
 * and extraction can never disagree. Production uses the `__Host-` prefix (which
 * mandates Secure, host-only, Path=/); development over plain HTTP uses the
 * unprefixed name without Secure. The cookie is always HttpOnly, SameSite=Strict
 * and host-only (no Domain), and the raw token is never logged or stringified
 * anywhere but the `Set-Cookie` value itself.
 *
 * A tiny standards-compliant serializer is used rather than an added cookie
 * dependency (ADR §18): the base64url token needs no percent-encoding.
 */
import { Inject, Injectable } from '@nestjs/common';

import { STAFF_AUTH_CONFIG, type StaffAuthConfig } from '../../config/staff-auth.config';

const SECURE_COOKIE_NAME = '__Host-adm_session';
const DEV_COOKIE_NAME = 'adm_session';

/** Structural request shape: avoids importing an HTTP-server type. */
interface CookieReadableRequest {
  readonly headers: Record<string, unknown>;
}

export interface ExtractedSessionCookie {
  readonly token: string | undefined;
  /** True when the same cookie name appears more than once with differing values. */
  readonly ambiguous: boolean;
}

@Injectable()
export class CookiePolicyService {
  constructor(@Inject(STAFF_AUTH_CONFIG) private readonly config: StaffAuthConfig) {}

  /** The environment-specific cookie name. */
  get cookieName(): string {
    return this.config.cookieSecure ? SECURE_COOKIE_NAME : DEV_COOKIE_NAME;
  }

  /** A `Set-Cookie` value carrying the raw token, expiring at the absolute timeout. */
  serializeSessionCookie(rawToken: string): string {
    const maxAgeSeconds = Math.floor(this.config.absoluteTimeoutMs / 1000);
    return this.serialize(rawToken, maxAgeSeconds);
  }

  /** A `Set-Cookie` value that deletes the cookie with matching attributes. */
  serializeDeletionCookie(): string {
    return this.serialize('', 0);
  }

  /**
   * Reads the session token from the request cookies.
   *
   * A duplicated cookie name with differing values is reported as ambiguous so
   * the guard can reject it rather than guess which token is authoritative.
   */
  extract(request: CookieReadableRequest): ExtractedSessionCookie {
    const header = request.headers['cookie'];
    if (typeof header !== 'string' || header === '') {
      return { token: undefined, ambiguous: false };
    }
    const values: string[] = [];
    for (const pair of header.split(';')) {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const name = pair.slice(0, eq).trim();
      if (name === this.cookieName) {
        values.push(pair.slice(eq + 1).trim());
      }
    }
    if (values.length === 0) {
      return { token: undefined, ambiguous: false };
    }
    const distinct = new Set(values);
    if (distinct.size > 1) {
      return { token: undefined, ambiguous: true };
    }
    return { token: values[0], ambiguous: false };
  }

  private serialize(value: string, maxAgeSeconds: number): string {
    const parts = [
      `${this.cookieName}=${value}`,
      `Max-Age=${maxAgeSeconds}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
    ];
    if (this.config.cookieSecure) {
      parts.push('Secure');
    }
    return parts.join('; ');
  }
}
