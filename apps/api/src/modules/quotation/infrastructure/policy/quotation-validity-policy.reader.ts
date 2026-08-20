/**
 * Reads the `quotation.validity` policy at the point of use (`APP6-B03`).
 *
 * A second narrow reader beside `QuotationDepositPolicyReader`, not a policy
 * framework: each consumes exactly one key, each refuses when that key is
 * missing, and neither can publish. `PolicyModule`'s rule is that consumers
 * resolve their own values through `PolicyConfigurationRepository` when they
 * need them, and there is no policy cache anywhere in this repository — so this
 * reads per call, exactly as the APP4 readers and `APP6-B01`'s deposit reader do.
 *
 * This class has no publish path and no Admin identity, and must not acquire
 * either: publication belongs to `PublishApp6PolicyUseCase` on the bootstrap
 * seam, and a consumer that can write its own policy is not consuming one.
 *
 * A missing or malformed value is a **bounded refusal**, never a guessed window.
 * Sending under an assumed validity would tell a customer their price holds
 * until a date no published policy supports, so the endpoint refuses before it
 * writes anything and the operator's fix is to publish the dataset.
 */
import { Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  QUOTATION_VALIDITY_POLICY_KEY,
  parseQuotationValidityPolicy,
  type QuotationValidityPolicy,
} from '../../domain/sending/quotation-validity-policy';
import { quotationSendError } from '../../domain/sending/quotation-send.errors';

@Injectable()
export class QuotationValidityPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  async require(): Promise<QuotationValidityPolicy> {
    const version = await this.policies.currentValue(QUOTATION_VALIDITY_POLICY_KEY);
    if (version === undefined) {
      throw quotationSendError('QUOTATION_POLICY_UNAVAILABLE');
    }
    const parsed = parseQuotationValidityPolicy(version.value);
    if (!parsed.ok) {
      throw quotationSendError('QUOTATION_POLICY_UNAVAILABLE');
    }
    return parsed.policy;
  }
}
