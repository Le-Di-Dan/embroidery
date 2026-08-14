/**
 * Reads the `secure_grant` policy at the point of use (`APP4-B05`).
 *
 * A second reader beside `VerificationPolicyReader` rather than one generic
 * `PolicyReader<T>`: the two read different keys into different shapes and
 * refuse with different vocabularies, and the only thing a shared generic would
 * actually share is the two-line `currentValue`-then-parse sequence. What must
 * not be shared is the refusal — a verification endpoint answering
 * `SECURE_GRANT_POLICY_UNAVAILABLE` would be lying about which configuration is
 * missing.
 *
 * Per call rather than memoized, for the reason `PolicyModule` records:
 * "consumers resolve their own values through `PolicyConfigurationRepository` at
 * the point of use". An operator who republishes the grant TTL must not have to
 * restart the API for it to take effect, and a cache here would make the
 * published version and the enforced one silently diverge.
 *
 * This class has no publish path and must not acquire one: publication closed
 * with `APP4-B01-C1`, and a consumer that can write its own policy is not
 * consuming one.
 */
import { Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  SECURE_GRANT_POLICY_KEY,
  parseSecureGrantPolicy,
  type SecureGrantPolicy,
} from '../../domain/grant/secure-grant-policy';
import { SecureGrantError } from '../../domain/grant/secure-grant-outcome';

@Injectable()
export class SecureGrantPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  /**
   * The published policy, or a bounded failure.
   *
   * Missing and malformed collapse onto one refusal deliberately. The parse
   * reasons name fields and bounds — useful to an operator, and useless to the
   * caller, which can do nothing differently either way. The operator-facing
   * signal is the key's own state in `policy_configurations`, directly
   * inspectable, rather than a log line on an issuance path.
   */
  async require(): Promise<SecureGrantPolicy> {
    const version = await this.policies.currentValue(SECURE_GRANT_POLICY_KEY);
    if (version === undefined) {
      throw new SecureGrantError('SECURE_GRANT_POLICY_UNAVAILABLE');
    }
    const result = parseSecureGrantPolicy(version.value);
    if (!result.ok) {
      throw new SecureGrantError('SECURE_GRANT_POLICY_UNAVAILABLE');
    }
    return result.policy;
  }
}
