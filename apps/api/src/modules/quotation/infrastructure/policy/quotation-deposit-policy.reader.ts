/**
 * Reads the `quotation.deposit` policy at the point of use (`APP6-B01`).
 *
 * Per call rather than memoized, for the reason `PolicyModule` records:
 * consumers resolve their own values through `PolicyConfigurationRepository`
 * when they need them, and there is no policy cache anywhere in this
 * repository. The APP4 readers (`VerificationPolicyReader`,
 * `SecureGrantPolicyReader`) are the shape this follows.
 *
 * This class has no publish path and no Admin identity, and must not acquire
 * either: publication belongs to `PublishApp6PolicyUseCase` on the bootstrap
 * seam, and a consumer that can write its own policy is not consuming one.
 *
 * A missing or malformed value is a **bounded refusal**, never a guessed split.
 * Drafting a quotation against an assumed deposit share would put a number in
 * front of a customer that no published policy supports, so the endpoint refuses
 * and the operator's fix is to publish the dataset.
 */
import { Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  QUOTATION_DEPOSIT_POLICY_KEY,
  parseQuotationDepositPolicy,
  type QuotationDepositPolicy,
} from '../../domain/pricing/quotation-deposit-policy';
import { QuotationDraftingError } from '../../domain/drafting/quotation-drafting.errors';

@Injectable()
export class QuotationDepositPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  async require(): Promise<QuotationDepositPolicy> {
    const version = await this.policies.currentValue(QUOTATION_DEPOSIT_POLICY_KEY);
    if (version === undefined) {
      throw new QuotationDraftingError('QUOTATION_POLICY_UNAVAILABLE');
    }
    const parsed = parseQuotationDepositPolicy(version.value);
    if (!parsed.ok) {
      throw new QuotationDraftingError('QUOTATION_POLICY_UNAVAILABLE');
    }
    return parsed.policy;
  }
}
