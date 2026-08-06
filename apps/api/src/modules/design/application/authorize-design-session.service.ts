/**
 * Anonymous Session authorization (`IMP-D043` PO-01/PO-05/PO-07, `APP3-B06A`).
 *
 * Ownership is the **pair** — the public id from the path and the secret from
 * the cookie derived from that id. Neither authorizes alone, which is why the id
 * selects the cookie rather than the cookie selecting the session.
 *
 * The order of the checks is deliberate and cheap-first: the id's shape, then
 * the cookie, then one database read, then the secret, then liveness. Every
 * refusal produces an internal reason and the *same* external outcome, so the
 * caller cannot tell an unknown id from a wrong secret from an expired session.
 *
 * This service performs exactly one repository read and never writes. It does
 * not advance the revision, touch `last_activity_at`, append an Audit entry or
 * emit an event: authorization is not a mutation, and a guard that wrote would
 * make every unauthorized probe a database write.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  clearsCookie,
  type DesignSessionAuthorizationReason,
} from '../domain/design-session-authorization';
import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';
import { DesignSessionSecretVerifier } from '../infrastructure/crypto/design-session-secret.verifier';
import {
  DesignSessionCookiePolicy,
  isCanonicalSessionId,
} from '../infrastructure/http/design-session-cookie.policy';
import type { DesignSessionContext } from '../presentation/design-session-context';

/** Structural request shape: avoids importing an HTTP-server type. */
interface AuthorizableRequest {
  readonly headers: Record<string, unknown>;
}

export type AuthorizationOutcome =
  | { readonly authorized: true; readonly context: DesignSessionContext }
  | {
      readonly authorized: false;
      readonly reason: DesignSessionAuthorizationReason;
      /** A `Set-Cookie` value when this browser's credential is now dead. */
      readonly clearCookie: string | undefined;
    };

export type AuthorizationClock = () => Date;

@Injectable()
export class AuthorizeDesignSessionService {
  constructor(
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
    private readonly verifier: DesignSessionSecretVerifier,
    private readonly cookies: DesignSessionCookiePolicy,
  ) {}

  async authorize(
    request: AuthorizableRequest,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<AuthorizationOutcome> {
    if (!isCanonicalSessionId(sessionId)) {
      // Refused before the id is used to build a cookie name or a query.
      return { authorized: false, reason: 'MALFORMED_SESSION_ID', clearCookie: undefined };
    }

    const extracted = this.cookies.extract(request, sessionId);
    if (extracted.ambiguous) {
      return this.refuse('COOKIE_AMBIGUOUS', sessionId);
    }
    if (extracted.secret === undefined) {
      return this.refuse('COOKIE_MISSING', sessionId);
    }

    const session = await this.sessions.findById(sessionId as DesignSessionId);
    if (session === undefined) {
      // Deliberately not cookie-clearing: the id may simply be wrong, and
      // clearing would confirm which of the two the caller got right.
      return this.refuse('SESSION_NOT_FOUND', sessionId);
    }

    if (!this.verifier.verify(extracted.secret, session.sessionSecretHash)) {
      return this.refuse('SECRET_MISMATCH', sessionId);
    }

    // Liveness is checked *after* the secret so a caller who does not hold the
    // secret cannot learn a session's status by watching which refusal clears a
    // cookie.
    if (session.status !== 'ACTIVE') {
      return this.refuse('SESSION_NOT_ACTIVE', sessionId);
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      return this.refuse('SESSION_EXPIRED', sessionId);
    }

    return {
      authorized: true,
      context: {
        designSessionId: session.id,
        currentRevision: session.autosaveRevision,
        authorizedAt: now,
      },
    };
  }

  private refuse(
    reason: DesignSessionAuthorizationReason,
    sessionId: string,
  ): AuthorizationOutcome {
    return {
      authorized: false,
      reason,
      clearCookie: clearsCookie(reason)
        ? this.cookies.serializeDeletionCookie(sessionId)
        : undefined,
    };
  }
}
