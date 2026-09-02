/**
 * `POST /api/public/secure-links/resolve` (`APP4-B06`, made scope-aware by
 * `APP12-B04`).
 *
 * The phase's highest-risk public surface: an anonymous caller presents an
 * opaque token and learns whether it opens something. Four properties carry the
 * security, and each is structural rather than remembered.
 *
 * ### 1. The target is read, never accepted
 *
 * The request carries the token and nothing else. There is no `customerId`, no
 * `customRequestId`, no `orderId`, no `grantId`, no `scopeKind` and no
 * `purpose` — not because the code declines to read them, but because
 * {@link ResolveSecureLinkCommand} has nowhere to put them. The customer, the
 * subject **and the scope** come back *from the grant row*, which is a stronger
 * binding than checking a pair the caller supplied: a caller cannot assert
 * whose grant a token is, and — since `APP12-B04` — cannot assert which release
 * wave it belongs to either.
 *
 * ### 2. One path, one query, one refusal
 *
 * Every outcome goes through the same steps: digest, one fixed-shape read, one
 * result check, one release decision. There is no branch per cause and,
 * critically, **no second query after a miss**. Nothing here asks "did this
 * token ever exist" or "is there a revoked grant with this digest" to classify a
 * failure. Those questions are exactly what would make the causes externally
 * distinguishable, by timing if not by body.
 *
 * The scope set is passed to the repository as `GRANT_SCOPE_KINDS`, so both
 * scopes are covered by **one** `IN` predicate. Two scope-pinned queries were
 * the obvious alternative and would have reintroduced the oracle: a request that
 * takes two round trips and one that takes one are distinguishable by timing
 * even when their bodies are identical.
 *
 * ### 3. The raw token dies immediately
 *
 * It is digested in the first statement and never referenced again: not stored,
 * not logged, not echoed, not audited, not put in an error. The digest is a
 * local too, and is equally never recorded — it is the lookup key for the
 * credential (CST-008), so writing it anywhere durable would be nearly as bad as
 * writing the token.
 *
 * ### 4. Reading changes nothing
 *
 * No transaction, no write, no lifecycle transition. A grant is **not** consumed
 * by resolving it — ADR-DB3-004 r2 makes the link multi-use within its validity,
 * so a customer revisiting their order must not burn it. The only row this path
 * appends is the audit event.
 *
 * ### The release decision, and where it is taken
 *
 * `APP12-G02` withheld this whole operation because its only scope was
 * `REQUEST_ACCESS`. `APP12-B04` replaces that with {@link GrantScopeReleaseGate},
 * applied here — **after** the grant is resolved and **before** the audit row is
 * written, so a withheld scope leaves no resolved trail. The refusal is the
 * delivered `SECURE_LINK_UNAVAILABLE`, identical to an unknown token, so a
 * Wave-1 deployment does not confirm that a custom customer's link is real.
 */
import { Inject, Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { GrantScopeKind } from '@embroidery/database';

import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import { secureLinkUnavailable } from '../domain/grant/secure-link.errors';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import { VerificationClock } from '../infrastructure/clock/verification-clock';
import { GrantScopeReleaseGate } from './grant-scope-release.gate';
import { SecureLinkAuditRecorder } from './secure-link-audit.recorder';

/**
 * Every scope a live link may carry (ADR-DB3-004 r1, `APP12-DB01`).
 *
 * The canonical tuple rather than a local list: a third scope added to the
 * schema must reach this resolver automatically, because a scope silently
 * missing here would be a link that resolves for nobody — a failure that looks
 * like a bad token and would be diagnosed as one.
 */
const RESOLVABLE_SCOPES: readonly GrantScopeKind[] = schema.GRANT_SCOPE_KINDS;

/** The whole input. One field, by design — see the header. */
export interface ResolveSecureLinkCommand {
  readonly token: string;
}

/**
 * What a resolved link tells its **in-process** caller.
 *
 * The smallest projection the Storefront shells need to know *which* subject
 * they are showing and *how long* the link lasts. Since `APP12-B04` the two
 * subjects are a typed XOR carried through from the row: exactly one of
 * `customRequestId` and `orderId` is present, decided by `scopeKind`.
 *
 * `orderId` is **internal to this type**. `PublicSecureLinkController` drops it
 * in its projection, because `BR-032` keeps raw order UUIDs off the customer
 * surface and `/truy-cap` needs only the scope to know where to forward. The
 * Ready-Made order and `FULL` payment surfaces re-resolve the token themselves
 * and read the order from the row, so no client ever holds one.
 *
 * Deliberately absent: the token, the digest, `grantId` (publishing an id
 * invites it into a URL), `customerId` (which would turn a token into a lookup
 * into the identity graph), every contact field, the revoke reason and the
 * lineage.
 */
export interface ResolvedSecureLink {
  readonly customRequestId: string | undefined;
  readonly orderId: string | undefined;
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
    private readonly release: GrantScopeReleaseGate,
  ) {}

  /**
   * Resolves a live grant, or refuses identically for every cause.
   *
   * Throws {@link secureLinkUnavailable} for an unknown digest, an expired
   * grant, a revoked one, a superseded one (which is revoked), a wrong target
   * (impossible to express, since the target is read), an unknown scope, and —
   * since `APP12-B04` — a scope this release wave withholds. The repository
   * returns `undefined` for all but the last, so this method cannot tell those
   * apart even if a future edit wanted to; the release refusal is raised through
   * the same factory and writes the same audit action, so it is not
   * distinguishable either.
   */
  async resolve(command: ResolveSecureLinkCommand): Promise<ResolvedSecureLink> {
    // The raw token's entire lifetime in this process: one argument, one digest,
    // then out of scope. `digestSecret` is the P01 authority — there is no second
    // HMAC in this checkpoint, and no comparison against a stored raw value,
    // because no raw value is stored.
    const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, command.token);

    const grant = await this.grants.resolveActiveByTokenDigest(
      tokenHash,
      RESOLVABLE_SCOPES,
      this.clock.now(),
    );

    if (grant === undefined) {
      // No diagnostic follow-up read. This is the one place a well-meaning edit
      // would add "let me find out why" — and that read is the oracle.
      await this.audit.recordUnavailable();
      throw secureLinkUnavailable();
    }

    // Before the success audit, so a withheld scope leaves the same trail an
    // unknown token does. The scope is the persisted one; nothing the caller
    // sent reached this decision.
    if (!this.release.isReleased(grant.scopeKind)) {
      await this.audit.recordUnavailable();
      throw secureLinkUnavailable();
    }

    await this.audit.recordResolved({
      grantId: grant.id,
      customerId: grant.customerId,
      scopeKind: grant.scopeKind,
      ...(grant.customRequestId === undefined ? {} : { customRequestId: grant.customRequestId }),
      ...(grant.orderId === undefined ? {} : { orderId: grant.orderId }),
    });

    return {
      customRequestId: grant.customRequestId,
      orderId: grant.orderId,
      scopeKind: grant.scopeKind,
      expiresAt: grant.expiresAt,
    };
  }
}
