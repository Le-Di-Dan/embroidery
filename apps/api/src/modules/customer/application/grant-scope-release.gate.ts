/**
 * Which grant scopes a release wave admits (`APP12-B04`,
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §3.2).
 *
 * ## The problem this exists to solve
 *
 * `APP12-G02` withheld `publicSecureLink_resolve` as a **whole operation**,
 * which was correct at the time: the operation's only scope was
 * `REQUEST_ACCESS`, so there was nothing in it to keep open. `APP12-DB01` and
 * this checkpoint change that. The one operation now serves two waves — a
 * Ready-Made customer opening their order (Wave 1) and a custom customer
 * opening their request (Wave 2) — and no static per-operation rule can
 * separate them, because the wave is a property of the **grant row**, which
 * does not exist until the token has been digested and looked up.
 *
 * So the gate moves from the operation to the resolved scope, and it moves
 * *inside* the resolution path rather than into the guard. `APP12-G02`'s
 * `CustomCapabilityReleaseGuard` runs before the pipes and therefore before any
 * token has been read; it has nothing to decide with here, which is exactly why
 * the three operations that resolve a grant are reclassified as scope-gated and
 * this class answers for them instead.
 *
 * ## The scope comes from the row, never from the caller
 *
 * There is no `scopeKind` on any public body and no parameter on any of the
 * three affected operations that could carry one. This function is called
 * **after** the digest lookup, with the persisted `scope_kind` of the grant that
 * was found. A caller cannot assert which wave it belongs to.
 *
 * ## The refusal is indistinguishable from an unknown token
 *
 * A withheld scope leaves as the delivered `SECURE_LINK_UNAVAILABLE` — the same
 * 404, code, message and shape as an unknown, expired, revoked or superseded
 * token. That is stronger than the guard's generic `NotFoundException`: while
 * Wave 2 is unreleased, a valid `REQUEST_ACCESS` token must not be
 * distinguishable from a fictional one, or the release plan is readable by
 * anyone holding a link.
 *
 * ## Wave 1 vs Wave 2, in full
 *
 * ```text
 * CUSTOM_EMBROIDERY_RELEASE_ENABLED = false
 *   ORDER_ACCESS    ALLOW    Ready-Made *is* Wave 1
 *   REQUEST_ACCESS  DENY     every custom customer surface stays withheld
 *
 * CUSTOM_EMBROIDERY_RELEASE_ENABLED = true
 *   ORDER_ACCESS    ALLOW    unchanged — Wave 1 does not close when Wave 2 opens
 *   REQUEST_ACCESS  ALLOW    the delivered APP4/APP5/APP6/APP7/APP9 behaviour,
 *                            byte-for-byte
 * ```
 *
 * `ORDER_ACCESS` is never gated by the flag in either direction, so this class
 * cannot become the place a Wave-1 capability is accidentally withheld.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { GrantScopeKind } from '@embroidery/database';

import {
  CUSTOM_EMBROIDERY_RELEASE_CONFIG,
  type CustomEmbroideryReleaseConfig,
} from '../../../config/custom-embroidery-release.config';
import { secureLinkUnavailable } from '../domain/grant/secure-link.errors';
import { ORDER_ACCESS_SCOPE } from '../domain/grant/grant-subject';

@Injectable()
export class GrantScopeReleaseGate {
  constructor(
    @Inject(CUSTOM_EMBROIDERY_RELEASE_CONFIG)
    private readonly release: CustomEmbroideryReleaseConfig,
  ) {}

  /**
   * Whether a resolved scope is released on this deployment.
   *
   * Published as a predicate as well as a guard because the release-gate
   * contract suite asserts the matrix directly, and asserting it through a
   * thrown 404 would be asserting the refusal rather than the decision.
   */
  isReleased(scopeKind: GrantScopeKind): boolean {
    return scopeKind === ORDER_ACCESS_SCOPE || this.release.enabled;
  }

  /**
   * Refuses a withheld scope with the one indistinguishable answer.
   *
   * Takes the scope rather than the grant so it cannot accidentally read a
   * subject, and returns nothing so a caller cannot mistake it for a resolver.
   */
  requireReleased(scopeKind: GrantScopeKind): void {
    if (!this.isReleased(scopeKind)) {
      throw secureLinkUnavailable();
    }
  }
}
