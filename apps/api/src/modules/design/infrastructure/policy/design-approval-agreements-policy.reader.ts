/**
 * Reads the `design_approval.agreements` policy at the point of use
 * (`APP6-B10` §10).
 *
 * Per call rather than memoized, for the reason `PolicyModule` records:
 * consumers resolve their own values through `PolicyConfigurationRepository`
 * when they need them, and there is no policy cache anywhere in this repository.
 * `QuotationDepositPolicyReader` is the shape this follows exactly.
 *
 * This class has no publish path and no Admin identity, and must not acquire
 * either: publication belongs to `PublishApp6PolicyUseCase` on the bootstrap
 * seam, and a consumer that can write its own policy is not consuming one.
 *
 * A missing or malformed value is a **bounded refusal**, never a guessed set.
 * Showing a customer an assumed list of terms would put an agreement in front of
 * them that no published policy requires — and `GRD-008` would then refuse the
 * approval they gave. The operator's fix is to publish the dataset, and the
 * signal is the key's own state in `policy_configurations`.
 */
import { Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY,
  parseDesignApprovalAgreementsPolicy,
  type DesignApprovalAgreementsPolicy,
} from '../../domain/review/design-approval-agreements.policy';
import { DesignReviewTermsUnavailableError } from '../../domain/review/design-review.errors';

@Injectable()
export class DesignApprovalAgreementsPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  async require(): Promise<DesignApprovalAgreementsPolicy> {
    const version = await this.policies.currentValue(DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY);
    if (version === undefined) {
      throw new DesignReviewTermsUnavailableError();
    }
    const parsed = parseDesignApprovalAgreementsPolicy(version.value);
    if (!parsed.ok) {
      throw new DesignReviewTermsUnavailableError();
    }
    return parsed.policy;
  }
}
