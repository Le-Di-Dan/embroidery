/**
 * The whole of APP4's public secure-link admission, as one callable capability
 * (`APP5-B03` §2).
 *
 * `APP4-B06` already owns every part of this: {@link SecureLinkPolicyReader}
 * fails closed, {@link SecureLinkRateLimiter} charges the abuse budget, and
 * {@link ResolveSecureLink} turns a raw token into the request it opens. What
 * did not exist was a way for a **second** public read to obtain all three in
 * the one order that makes them a security model, without either re-deriving
 * that order or reaching past the module for three providers.
 *
 * `SecureGrantIssuer` is the precedent (`APP4-B05`, consumed by `APP5-B01`):
 * when another context needs an APP4 capability, the capability is exported
 * rather than the machinery behind it. Nothing new is decided here — no second
 * token format, no second grant table, no second verification algorithm and no
 * customer session. This class composes what APP4 already published.
 *
 * ### The order is the security model, and it lives in exactly one place
 *
 * 1. **read the published policy** — before the token is looked at, so an
 *    unconfigured deployment answers identically for every caller;
 * 2. **charge the rate limit** — once, before any HMAC work, and identically
 *    whatever the token turns out to be. Reversing 2 and 3 would make the
 *    limiter's cost depend on the credential and hand an attacker free failed
 *    guesses;
 * 3. **resolve** — one digest, one query, one answer.
 *
 * Both public surfaces that accept a secure-link token share the **same**
 * limiter dimension and key, so a caller cannot escape `secure_link.resolve`'s
 * budget by spreading guesses across two routes.
 *
 * ### Why the rate-limit refusal is returned and the others are thrown
 *
 * A `429` carries `Retry-After`, which is a response header and therefore the
 * controller's to set. Making that outcome a value keeps HTTP shaping out of
 * this service while leaving the caller nothing to decide: it cannot proceed to
 * a resolution it was not handed. Every other refusal — unconfigured policy, and
 * the one indistinguishable `SECURE_LINK_UNAVAILABLE` covering unknown, expired,
 * revoked, superseded, wrong-target and wrong-scope — is thrown exactly as
 * `APP4-B06` throws it, because no caller may vary its answer.
 */
import { Injectable } from '@nestjs/common';

import {
  SecureLinkPolicyReader,
  isSecureLinkPolicyUnavailable,
  secureLinkPolicyUnavailableResponse,
} from '../infrastructure/policy/secure-link-policy.reader';
import {
  PublicNetworkKeyService,
  type NetworkReadableRequest,
} from '../infrastructure/rate-limit/public-network-key.service';
import { SecureLinkRateLimiter } from '../infrastructure/rate-limit/secure-link-rate-limiter';
import { ResolveSecureLink, type ResolvedSecureLink } from './resolve-secure-link.query';

/**
 * Admission's two shapes.
 *
 * There is no third member reporting *why* a resolution failed, and there must
 * not be: that is the oracle `secure-link.errors.ts` exists to deny.
 */
export type SecureLinkAdmission =
  | { readonly outcome: 'RESOLVED'; readonly link: ResolvedSecureLink }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class AuthorizeSecureLink {
  constructor(
    private readonly policies: SecureLinkPolicyReader,
    private readonly limiter: SecureLinkRateLimiter,
    private readonly networkKeys: PublicNetworkKeyService,
    private readonly resolver: ResolveSecureLink,
  ) {}

  /**
   * Admits one token, or refuses.
   *
   * The raw token is passed straight to the resolver, which digests it in its
   * first statement. It is not stored, logged, echoed or audited here, and this
   * class holds no field it could be kept in.
   */
  async authorize(request: NetworkReadableRequest, token: string): Promise<SecureLinkAdmission> {
    const policy = await this.requirePolicy();

    const decision = this.limiter.check(this.networkKeys.keyFor(request), policy);
    if (!decision.allowed) {
      return {
        outcome: 'RATE_LIMITED',
        retryAfterSeconds: Math.ceil(decision.retryAfterMs / 1_000),
      };
    }

    return { outcome: 'RESOLVED', link: await this.resolver.resolve({ token }) };
  }

  /** Reads the published abuse limit, or refuses with the server-side answer. */
  private async requirePolicy() {
    try {
      return await this.policies.require();
    } catch (error: unknown) {
      if (isSecureLinkPolicyUnavailable(error)) {
        throw secureLinkPolicyUnavailableResponse();
      }
      throw error;
    }
  }
}
