/**
 * `POST /api/public/secure-links/resolve` (`APP4-B06`).
 *
 * The phase's highest-risk public surface: an anonymous caller presents an
 * opaque token and learns whether it opens something. Four properties carry the
 * security, and each is structural rather than remembered.
 *
 * ### 1. The target is read, never accepted
 *
 * The request carries the token and nothing else. There is no `customerId`, no
 * `customRequestId`, no `grantId`, no `scopeKind` and no `purpose` — not because
 * the code declines to read them, but because {@link ResolveSecureLinkCommand}
 * has nowhere to put them. The customer and the request come back **from the
 * grant row**, which is a stronger binding than checking a pair the caller
 * supplied: a caller cannot assert whose grant a token is.
 *
 * `REQUEST_ACCESS` is written here as a module constant (ADR-DB3-004 r1), so
 * scope is authority rather than input.
 *
 * ### 2. One path, one query, one refusal
 *
 * Every outcome goes through the same three steps — digest, one fixed-shape
 * read, one result check. There is no branch per cause and, critically, **no
 * second query after a miss**: nothing here asks "did this token ever exist?" or
 * "is there a revoked grant with this digest?" to classify a failure. Those
 * questions are exactly what would make six causes externally distinguishable,
 * by timing if not by body.
 *
 * ### 3. The raw token dies immediately
 *
 * It is digested in the first statement and never referenced again — not stored,
 * not logged, not echoed, not audited, not put in an error. The digest is a
 * local too, and is equally never recorded: it is the lookup key for the
 * credential (CST-008), so writing it anywhere durable would be nearly as bad as
 * writing the token.
 *
 * ### 4. Reading changes nothing
 *
 * No transaction, no write, no lifecycle transition. A grant is **not** consumed
 * by resolving it — ADR-DB3-004 r2 makes the link multi-use within its validity,
 * so a customer revisiting their request must not burn it. The only row this
 * path appends is the audit event.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { GrantScopeKind } from '@embroidery/database';

import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import { secureLinkUnavailable } from '../domain/grant/secure-link.errors';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { SecureLinkAuditRecorder } from './secure-link-audit.recorder';

/** The single scope a secure link may carry (ADR-DB3-004 r1). Never caller-supplied. */
const REQUEST_ACCESS: GrantScopeKind = 'REQUEST_ACCESS';

/** The whole input. One field, by design — see the header. */
export interface ResolveSecureLinkCommand {
  readonly token: string;
}

/**
 * What a resolved link tells the caller.
 *
 * The smallest projection the later Storefront shell (`APP4-S02`) needs to know
 * *which* request it is showing and *how long* the link lasts. Deliberately
 * absent: the token, the digest, `grantId` (no delivered consumer needs it, and
 * publishing an id invites it into a URL), `customerId` (which would turn a
 * token into a lookup into the identity graph), every contact field, the revoke
 * reason, the lineage, and all APP5/APP6/APP7 business content — none of which
 * exists yet and none of which B06 may invent.
 */
export interface ResolvedSecureLink {
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
  readonly expiresAt: Date;
}

@Injectable()
export class ResolveSecureLink {
  constructor(
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    private readonly peppers: App4SecretPepperProvider,
    private readonly audit: SecureLinkAuditRecorder,
    private readonly clock: VerificationClock,
  ) {}

  /**
   * Resolves a live grant, or refuses identically for all six causes.
   *
   * Throws {@link secureLinkUnavailable} for: an unknown digest, an expired
   * grant, a revoked one, a superseded one (which is revoked), a wrong target
   * (impossible to express, since the target is read) and a wrong scope. The
   * repository returns `undefined` for every one of them, so this method cannot
   * tell them apart even if a future edit wanted to.
   */
  async resolve(command: ResolveSecureLinkCommand): Promise<ResolvedSecureLink> {
    // The raw token's entire lifetime in this process: one argument, one digest,
    // then out of scope. `digestSecret` is the P01 authority — there is no second
    // HMAC in this checkpoint, and no comparison against a stored raw value,
    // because no raw value is stored.
    const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, command.token);

    const grant = await this.grants.resolveActiveByTokenDigest(
      tokenHash,
      REQUEST_ACCESS,
      this.clock.now(),
    );

    if (grant === undefined) {
      // No diagnostic follow-up read. This is the one place a well-meaning edit
      // would add "let me find out why" — and that read is the oracle.
      await this.audit.recordUnavailable();
      throw secureLinkUnavailable();
    }

    await this.audit.recordResolved({
      grantId: grant.id,
      customerId: grant.customerId,
      customRequestId: grant.customRequestId,
      scopeKind: grant.scopeKind,
    });

    return {
      customRequestId: grant.customRequestId,
      scopeKind: grant.scopeKind,
      expiresAt: grant.expiresAt,
    };
  }
}
