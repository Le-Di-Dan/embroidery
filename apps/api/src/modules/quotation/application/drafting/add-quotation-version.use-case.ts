/**
 * Adding a further DRAFT version to an existing quotation
 * (`TR-LC12-01`, `APP6-B01`).
 *
 * This is the revision path, and its whole correctness argument is that it has
 * no way to express the alternative. There is no version id on the way in, no
 * update method on the repository port, and nothing here reads a historical
 * version at all — a `SENT` version cannot be repriced in place because no code
 * path addresses one. What the operator gets instead is version *n+1*, `DRAFT`,
 * with its own line items, while every earlier version stays exactly as it was
 * and remains readable (`APP6-B02`).
 *
 * The quotation row is locked by `addVersion` before the next version number is
 * read, so two operators revising at once produce two consecutive versions
 * rather than one lost write.
 *
 * Nothing here sends, freezes, advances `current_version_id`, sets a validity
 * window, emits `quotation.sent` or moves the custom request.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { QuotationDraftingError } from '../../domain/drafting/quotation-drafting.errors';
import { isDraftableQuotationState } from '../../domain/drafting/quotation-eligibility';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
} from '../../domain/repositories/quotation.repository';
import { QuotationDepositPolicyReader } from '../../infrastructure/policy/quotation-deposit-policy.reader';
import type { DraftVersionCommand, DraftedVersionView } from './draft-version.command';
import { requireAdminActorId } from './quotation-actor';
import { QuotationVersionDrafter } from './quotation-version.drafter';

export interface AddQuotationVersionCommand extends DraftVersionCommand {
  readonly quotationId: QuotationId;
}

@Injectable()
export class AddQuotationVersionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    private readonly depositPolicy: QuotationDepositPolicyReader,
    private readonly drafter: QuotationVersionDrafter,
    private readonly requestContext: RequestContextService,
  ) {}

  async addVersion(command: AddQuotationVersionCommand): Promise<DraftedVersionView> {
    requireAdminActorId(this.requestContext);

    // The deposit share is re-read per call rather than copied from the previous
    // version: a new version prices under the policy published *now*, which is
    // the whole reason the split is configuration and not a constant.
    const policy = await this.depositPolicy.require();

    return this.transactions.runInTransaction(async () => {
      const quotation = await this.quotations.findById(command.quotationId);
      if (quotation === undefined) {
        throw new QuotationDraftingError('QUOTATION_NOT_FOUND');
      }
      if (!isDraftableQuotationState(quotation.status)) {
        throw new QuotationDraftingError('QUOTATION_NOT_DRAFTABLE');
      }
      return this.drafter.draft(quotation, command, policy);
    });
  }
}
