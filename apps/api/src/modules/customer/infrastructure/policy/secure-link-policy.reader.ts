/**
 * Reads the `secure_link.resolve` policy at the point of use (`APP4-B06`).
 *
 * A third reader beside `VerificationPolicyReader` and `SecureGrantPolicyReader`
 * rather than one generic `PolicyReader<T>`, for the reason the second one
 * records: the only thing a generic would share is the two-line
 * `currentValue`-then-parse sequence, and what must **not** be shared is the
 * refusal — an endpoint answering `SECURE_GRANT_POLICY_UNAVAILABLE` would be
 * lying about which configuration is missing.
 *
 * Per call rather than memoized, so republishing the abuse limit takes effect
 * without an API restart.
 *
 * ### Why the refusal is 503 and not 404
 *
 * An unconfigured limiter is a fact about the **server**, not about the
 * caller's token, so collapsing it into `SECURE_LINK_UNAVAILABLE` would file a
 * server fault under an answer that means "your credential did not resolve".
 * It discloses nothing either, because it is read **before** any token work: the
 * response is identical for a valid token, a garbage token and no token at all,
 * so it cannot be used to probe.
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  SECURE_LINK_RESOLVE_POLICY_KEY,
  parseSecureLinkResolvePolicy,
  type SecureLinkResolvePolicy,
} from '../../domain/grant/secure-link-policy';

/** The endpoint cannot run without a published abuse limit. Fail closed. */
export class SecureLinkPolicyUnavailableError extends Error {
  constructor() {
    super('SECURE_LINK_POLICY_UNAVAILABLE');
    this.name = 'SecureLinkPolicyUnavailableError';
  }
}

export function isSecureLinkPolicyUnavailable(
  error: unknown,
): error is SecureLinkPolicyUnavailableError {
  return error instanceof SecureLinkPolicyUnavailableError;
}

/** The public answer to an unconfigured resolver. Names no policy key. */
export function secureLinkPolicyUnavailableResponse(): HttpException {
  return new HttpException(
    { message: 'Secure links are temporarily unavailable.' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

@Injectable()
export class SecureLinkPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  /**
   * The published policy, or a bounded failure.
   *
   * Missing and malformed collapse onto one refusal: the parse reasons name
   * fields and bounds, which is useful to an operator and useless to a public
   * caller, and the operator-facing signal is the key's own state in
   * `policy_configurations`, directly inspectable.
   */
  async require(): Promise<SecureLinkResolvePolicy> {
    const version = await this.policies.currentValue(SECURE_LINK_RESOLVE_POLICY_KEY);
    if (version === undefined) {
      throw new SecureLinkPolicyUnavailableError();
    }
    const result = parseSecureLinkResolvePolicy(version.value);
    if (!result.ok) {
      throw new SecureLinkPolicyUnavailableError();
    }
    return result.policy;
  }
}
