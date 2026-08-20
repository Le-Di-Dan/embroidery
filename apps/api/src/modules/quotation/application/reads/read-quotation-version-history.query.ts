/**
 * Every version of one quotation, oldest first (`APP6-B02` §4A).
 *
 * The whole history, not a page. A quotation is re-priced a handful of times by
 * an operator sitting with a customer — the `uq_quotation_versions__quotation_
 * version` cardinality is single digits — so a cursor here would be paging
 * machinery guarding a set that fits on one screen, and an operator comparing
 * version 2 against version 5 would have to fetch twice to do it.
 *
 * ### Ordering is the version number
 *
 * `listVersions` orders by `version` ascending, and that is chronology: the
 * number is assigned `latest + 1` under a `FOR UPDATE` lock on the quotation, so
 * it is monotonic per quotation and never reused (CST-036). Ordering by
 * `created_at` would be the same sequence with a tie nothing breaks, and
 * ordering by status would put the reading of a history at the mercy of a later
 * transition.
 *
 * ### It reads, and it is a read
 *
 * No transaction, no lock, no write. Nothing here advances
 * `current_version_id`, expires a version whose `valid_until` has passed, or
 * records that the history was looked at. Expiry-on-read would be exactly the
 * mutation `APP6-R00` deferred, arriving through a GET.
 */
import { Inject, Injectable } from '@nestjs/common';

import { quotationReadError } from '../../domain/reads/quotation-read.errors';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
} from '../../domain/repositories/quotation.repository';
import { projectVersion } from './quotation-version.projection';
import type { QuotationHeaderView, QuotationVersionView } from './quotation-version.view';

export interface QuotationVersionHistoryView {
  readonly quotation: QuotationHeaderView;
  readonly versions: readonly QuotationVersionView[];
}

@Injectable()
export class ReadQuotationVersionHistory {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async read(quotationId: QuotationId): Promise<QuotationVersionHistoryView> {
    const quotation = await this.quotations.findById(quotationId);
    if (quotation === undefined) {
      throw quotationReadError('QUOTATION_NOT_FOUND');
    }

    const versions = await this.quotations.listVersions(quotationId);

    return {
      quotation: {
        quotationId: quotation.id,
        quotationCode: quotation.code,
        customRequestId: quotation.customRequestId,
        quotationStatus: quotation.status,
        currentVersionId: quotation.currentVersionId,
      },
      versions: versions.map((version) => projectVersion(version, quotation.currentVersionId)),
    };
  }
}
