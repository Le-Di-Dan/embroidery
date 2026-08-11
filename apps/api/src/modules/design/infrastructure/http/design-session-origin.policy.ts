/**
 * Origin and Fetch Metadata policy for anonymous Session mutations
 * (`IMP-D043` PO-05, `APP3-B06A`).
 *
 * Deliberately **stricter than the staff policy**, and the difference is the
 * point. `RequestOriginPolicy` treats an absent `Origin` as a non-browser caller
 * and allows it, which is defensible for an operator tool behind
 * `SameSite=Strict`. This cookie is `SameSite=Lax`, so a top-level cross-site
 * POST would carry it; `IMP-D043` PO-05 therefore rules that a missing or
 * disallowed `Origin` **fails**, and that `SameSite` alone is not sufficient.
 *
 * `Sec-Fetch-Site` is required too, and is checked as a second, independent
 * signal: it is set by the browser and not by page script, so a same-origin
 * claim forged in an `Origin` header does not survive it. `cross-site` is
 * refused outright.
 *
 * `Referer` is never consulted. It is trimmed by referrer policies and proxies,
 * so accepting it would mean accepting an absent `Origin` in disguise.
 */
import { Inject, Injectable } from '@nestjs/common';

import { normalizeOrigin } from '../../../identity/config/staff-auth.config';
import {
  DESIGN_SESSION_AUTH_CONFIG,
  type DesignSessionAuthConfig,
} from '../../config/design-session-auth.config';

/** Structural request shape: avoids importing an HTTP-server type. */
interface OriginReadableRequest {
  readonly headers: Record<string, unknown>;
}

/** The only `Sec-Fetch-Site` values a Session mutation may carry (PO-05). */
const ALLOWED_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin']);

export type OriginDecision = 'ALLOWED' | 'REFUSED';

@Injectable()
export class DesignSessionOriginPolicy {
  constructor(
    @Inject(DESIGN_SESSION_AUTH_CONFIG) private readonly config: DesignSessionAuthConfig,
  ) {}

  /**
   * Both signals must pass. Neither is sufficient alone, and neither has a
   * "missing means fine" branch.
   */
  evaluate(request: OriginReadableRequest): OriginDecision {
    return this.hasAllowedOrigin(request) && this.hasAllowedFetchSite(request)
      ? 'ALLOWED'
      : 'REFUSED';
  }

  /**
   * The policy for a **safe** request — a GET that changes nothing
   * (`APP3-B06C`).
   *
   * Deliberately not `evaluate`. The rules above exist because a `SameSite=Lax`
   * cookie accompanies a top-level cross-site POST, and that reasoning is about
   * *mutation*: applying it to a GET would refuse the one thing the delivery
   * route exists for. A browser sends **no** `Origin` on a same-origin image
   * load, so requiring one would mean no `<img>` could ever display a customer's
   * own upload, and `Sec-Fetch-*` is withheld entirely on a non-trustworthy
   * origin, so requiring it would break plain-HTTP development.
   *
   * What is left is a single, purely additive check: an explicit
   * `Sec-Fetch-Site: cross-site` is refused. That value is set by the browser and
   * not by page script, so it cannot be forged from a page. It costs nothing —
   * a `SameSite=Lax` cookie is not sent on a cross-site subresource load at all,
   * so such a request could never have authorized anyway — and it means a
   * cross-site attempt is refused before a cookie is read rather than after.
   *
   * An absent header is allowed, and that is not a "missing means fine" branch of
   * the kind `evaluate` refuses: here the credential itself is doing the work,
   * and the header is a second signal that may legitimately not exist.
   */
  evaluateSafeRead(request: OriginReadableRequest): OriginDecision {
    const raw = request.headers['sec-fetch-site'];
    if (typeof raw !== 'string') return 'ALLOWED';
    return raw.trim().toLowerCase() === 'cross-site' ? 'REFUSED' : 'ALLOWED';
  }

  private hasAllowedOrigin(request: OriginReadableRequest): boolean {
    const raw = request.headers['origin'];
    if (typeof raw !== 'string' || raw === '') {
      // No Origin at all. Refused: a browser sends one on every cross-origin
      // and every mutating same-origin request, so its absence is either a
      // non-browser caller or a stripped header, and neither may mutate a
      // session that a Lax cookie would accompany.
      return false;
    }
    const normalized = normalizeOrigin(raw);
    if (normalized === undefined) {
      // Present but unparseable, including the literal `null` a sandboxed
      // iframe or a redirected form sends.
      return false;
    }
    // Exact match against the configured allowlist — never a prefix, suffix or
    // reflection of what the caller stated. An empty allowlist allows nothing.
    return this.config.allowedOrigins.includes(normalized);
  }

  private hasAllowedFetchSite(request: OriginReadableRequest): boolean {
    const raw = request.headers['sec-fetch-site'];
    if (typeof raw !== 'string' || raw === '') {
      return false;
    }
    return ALLOWED_FETCH_SITES.has(raw.trim().toLowerCase());
  }
}
