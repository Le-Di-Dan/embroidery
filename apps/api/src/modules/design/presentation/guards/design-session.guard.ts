/**
 * The guard every anonymous Session mutation carries (`APP3-B06A`).
 *
 * Order is the security property, not a style choice:
 *
 *   1. **Origin / Fetch Metadata** — before anything reads a cookie, so a
 *      cross-site page cannot make the API do work on its behalf at all.
 *   2. **Authorization** — the id + secret pair.
 *   3. **Authorization-failure limit** — recorded only once a failure is known,
 *      so a well-behaved client never spends failure budget.
 *   4. **Mutation limit** — only for callers who proved ownership, so a flood
 *      of failures can never consume a legitimate session's budget.
 *
 * Exhausting the failure budget answers `429` rather than `401`. That is not an
 * enumeration oracle: it states how often *this caller* has failed, which is
 * equally true for an id that exists and one that does not.
 *
 * Known limitation: the failure limit is recorded after the single session read,
 * so it bounds guessing rather than preventing one read per attempt. The
 * existing limiter records and tests in one call, and splitting it into
 * peek-then-record is a change to a primitive shared with staff login.
 *
 * The guard never writes to the database and never issues a cookie; it may only
 * clear one whose credential is now dead.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import {
  designSessionOriginRefused,
  designSessionRateLimited,
  designSessionUnauthorized,
} from '../../domain/design-session-authorization';
import { AuthorizeDesignSessionService } from '../../application/authorize-design-session.service';
import { DesignSessionOriginPolicy } from '../../infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from '../../infrastructure/rate-limit/design-session-rate-limiter';
import { EphemeralNetworkKeyService } from '../../infrastructure/rate-limit/ephemeral-network-key.service';
import { attachDesignSessionContext } from '../design-session-context';

/** The route parameter carrying the public Session id. */
export const DESIGN_SESSION_ID_PARAM = 'sessionId';

interface GuardedRequest {
  readonly headers: Record<string, unknown>;
  readonly params?: Record<string, string> | undefined;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

interface CookieWritableResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class DesignSessionGuard implements CanActivate {
  constructor(
    private readonly origins: DesignSessionOriginPolicy,
    private readonly limiter: DesignSessionRateLimiter,
    private readonly networkKeys: EphemeralNetworkKeyService,
    private readonly authorization: AuthorizeDesignSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<GuardedRequest>();
    const response = http.getResponse<CookieWritableResponse>();

    if (this.origins.evaluate(request) === 'REFUSED') {
      throw designSessionOriginRefused();
    }

    const sessionId = request.params?.[DESIGN_SESSION_ID_PARAM] ?? '';
    const networkKey = this.networkKeys.keyFor(request);

    const outcome = await this.authorization.authorize(request, sessionId);

    if (!outcome.authorized) {
      if (outcome.clearCookie !== undefined) {
        response.setHeader('Set-Cookie', outcome.clearCookie);
      }
      // Recorded only now, so an authorized caller never spends this budget.
      const failure = this.limiter.checkAuthorizationFailure(
        networkKey,
        sessionId === '' ? undefined : sessionId,
      );
      throw failure.allowed ? designSessionUnauthorized() : designSessionRateLimited();
    }

    if (!this.limiter.checkMutation(outcome.context.designSessionId).allowed) {
      throw designSessionRateLimited();
    }

    attachDesignSessionContext(request, outcome.context);
    return true;
  }
}
