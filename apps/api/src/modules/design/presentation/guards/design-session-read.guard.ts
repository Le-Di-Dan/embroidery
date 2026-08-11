/**
 * The guard a **safe** anonymous Session read carries (`APP3-B06C`).
 *
 * Composed from `APP3-B06A`'s primitives, not duplicated from them: the same
 * `AuthorizeDesignSessionService`, the same `DesignSessionOriginPolicy`, the same
 * `DesignSessionRateLimiter`, the same `EphemeralNetworkKeyService`, the same
 * context attachment. No cookie parsing, no HMAC, no pepper and no liveness rule
 * is re-implemented here — a second copy of any of those is a second place for
 * them to drift.
 *
 * ## Why this is not `DesignSessionGuard`
 *
 * That guard is mutation-specific in two ways this route must not inherit.
 *
 * 1. **Origin and Fetch Metadata.** `IMP-D043` PO-05 requires an exact `Origin`
 *    and `Sec-Fetch-Site: same-origin` on a *state-changing* request, because a
 *    `SameSite=Lax` cookie accompanies a top-level cross-site POST. A browser
 *    sends no `Origin` at all on a same-origin image load, so requiring one here
 *    would make the delivery route unusable by the only consumer it exists for.
 *    The safe-read policy keeps the part that is free — an explicit `cross-site`
 *    is refused — and drops the parts that are about mutation.
 *
 * 2. **The mutation limit.** PO-07's 30/minute is a budget for *changes* to a
 *    Session. A Studio scene can legitimately reference several images, so
 *    charging previews against it would let ordinary rendering exhaust a
 *    customer's ability to save their own work. This guard does not call
 *    `checkMutation`, and that omission is asserted by the gate.
 *
 * Everything that *is* about authorization is kept identical, including the
 * order: cheap refusal, then the id+secret pair, then — only once a failure is
 * known — the authorization-failure budget, so a well-behaved client never spends
 * it. Exhausting that budget answers `429` rather than `401`, which is not an
 * enumeration oracle: it states how often *this caller* has failed, which is
 * equally true for an id that exists and one that does not.
 *
 * ## The read limit (`APP3-S06`, closing `FU-APP3-B06C-READ-RATE-LIMIT-01`)
 *
 * `APP3-B06C` shipped this guard with **no** positive read limit and said why:
 * it read `IMP-D043` PO-07 as defining four controls, none of them a read limit,
 * and refused to invent a number. Refusing was right; the premise was wrong.
 * PO-07 rules **five**, and the fifth is "bootstrap/resume/read 60/minute per
 * ephemeral network key" — locked at `APP3-G03` and carried in the security
 * document's limits table ever since. What was missing was the implementation,
 * not the decision, and this applies it.
 *
 * It is charged **before** authorization, and therefore on every read attempt
 * rather than only on successful ones. That is the point: what it bounds is a
 * caller *probing* Asset ids, and a limit spent only on hits would not bound
 * probing at all. It is a separate dimension from both the mutation counter and
 * the authorization-failure budget, so a scene referencing several images can
 * never exhaust a customer's ability to save their work, and a flood of failures
 * cannot exhaust a legitimate reader's budget.
 *
 * The guard never writes to the database and never issues a cookie; it may only
 * clear one whose credential is now dead. The limiter's counters are in-memory
 * security infrastructure, not durable Session state.
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
import { DESIGN_SESSION_ID_PARAM } from './design-session.guard';

interface GuardedRequest {
  readonly headers: Record<string, unknown>;
  readonly params?: Record<string, string> | undefined;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

interface CookieWritableResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class DesignSessionReadGuard implements CanActivate {
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

    if (this.origins.evaluateSafeRead(request) === 'REFUSED') {
      throw designSessionOriginRefused();
    }

    const sessionId = request.params?.[DESIGN_SESSION_ID_PARAM] ?? '';
    const networkKey = this.networkKeys.keyFor(request);

    // Before the credential is examined, so probing spends the budget it is
    // meant to bound. A refusal here is `429` and reveals nothing about whether
    // the session or the asset exists.
    if (!this.limiter.checkRead(networkKey).allowed) {
      throw designSessionRateLimited();
    }

    const outcome = await this.authorization.authorize(request, sessionId);

    if (!outcome.authorized) {
      if (outcome.clearCookie !== undefined) {
        response.setHeader('Set-Cookie', outcome.clearCookie);
      }
      const failure = this.limiter.checkAuthorizationFailure(
        networkKey,
        sessionId === '' ? undefined : sessionId,
      );
      throw failure.allowed ? designSessionUnauthorized() : designSessionRateLimited();
    }

    // No `checkMutation`. No cookie is issued, rotated or extended: the
    // authorized outcome carries no secret to write and this guard never calls
    // `serializeSessionCookie`.
    attachDesignSessionContext(request, outcome.context);
    return true;
  }
}
