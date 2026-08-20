/**
 * The in-transaction half of secure-link authorization (`APP6-B05` §6,
 * ADR-DB3-004 r9).
 *
 * {@link AuthorizeSecureLink} admits a caller: it reads the published policy,
 * charges the abuse budget, digests the token and resolves the grant. That is
 * the right shape for a read, and `APP6-B04` consumes exactly it. It is **not**
 * enough for a sensitive write, for two reasons that have nothing to do with how
 * carefully it is written:
 *
 * 1. **It is a snapshot.** Its answer describes the grant as it was before the
 *    write transaction opened. ADR-DB3-004 r9 requires a sensitive action to
 *    re-check the grant *inside* the transaction that performs it, and CC-16 is
 *    the case that makes the difference observable: an operator revoking a
 *    leaked link while the customer is mid-accept must win.
 * 2. **It deliberately answers with less than a write needs.**
 *    `ResolvedSecureLink` carries the request, the scope and the expiry, and
 *    withholds `grantId` and `customerId` — `APP4-B06` records that publishing
 *    an id invites it into a URL, and that returning a customer id would turn a
 *    token into a lookup into the identity graph. But TBL-053 acceptance
 *    evidence has a `customer_id` and a `grant_id` with real foreign keys, so a
 *    write has to obtain both. The one safe place to obtain them is **from the
 *    grant row**, which is what this does.
 *
 * ### It is a re-check, not a second admission
 *
 * The policy is not re-read, the abuse budget is not charged twice, and no
 * second resolution-audit row is appended. Those are admission concerns and were
 * settled before the transaction opened; charging them again would make one
 * customer action cost two units of an anonymous caller's budget and would
 * double every accepted link's audit trail. What this re-establishes is the
 * *authorization fact*: the grant is still ACTIVE, still unexpired, still
 * `REQUEST_ACCESS`, and still belongs to the customer and request it did.
 *
 * ### Why the caller cannot skip the admission and use only this
 *
 * It would work, and it would be wrong: an unconfigured deployment would answer
 * from the database instead of failing closed, and an attacker guessing tokens
 * would get unlimited free HMAC comparisons against no budget. The two are
 * ordered, not alternatives — admission first, this inside the transaction.
 *
 * ### The raw token dies here too
 *
 * Digested in the first statement of {@link reauthorize} and never referenced
 * again. This class holds no field it could be kept in, and the digest is a
 * local that is equally never recorded.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { GrantScopeKind } from '@embroidery/database';

import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import { secureLinkUnavailable } from '../domain/grant/secure-link.errors';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrant,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';

/** The single scope a secure link may carry (ADR-DB3-004 r1). Never caller-supplied. */
const REQUEST_ACCESS: GrantScopeKind = 'REQUEST_ACCESS';

@Injectable()
export class ReauthorizeSecureGrant {
  constructor(
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    private readonly peppers: App4SecretPepperProvider,
  ) {}

  /**
   * Re-establishes the grant under its row lock, or refuses identically.
   *
   * Every failing reason — unknown digest, expired, revoked, superseded, wrong
   * scope — leaves as the same `SECURE_LINK_UNAVAILABLE` the read surface
   * throws. There is no diagnostic follow-up read here for the reason
   * `ResolveSecureLink` states: that read is the oracle. A caller therefore
   * cannot learn *why* its write was refused, which matters more here than on a
   * read: a write refusal is a stronger signal that something real is behind the
   * token.
   *
   * @requiresTransaction — the lock, and the guarantee it buys, only exist
   * inside the caller's transaction.
   */
  async reauthorize(token: string, now: Date): Promise<SecureAccessGrant> {
    const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, token);

    const grant = await this.grants.lockActiveByTokenDigest(tokenHash, REQUEST_ACCESS, now);
    if (grant === undefined) {
      throw secureLinkUnavailable();
    }
    return grant;
  }
}
