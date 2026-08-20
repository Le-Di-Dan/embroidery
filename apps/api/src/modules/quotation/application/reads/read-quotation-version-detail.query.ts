/**
 * One **exact** historical version and the lines that explain it
 * (`APP6-B02` §4B).
 *
 * ### It never substitutes the current version
 *
 * The version is addressed by its own id and loaded by that id. There is no
 * fallback to `current_version_id`, no "latest" branch and no repair path: if
 * the id names a version this quotation does not have, the answer is
 * `QUOTATION_VERSION_NOT_FOUND`, never a different version's price. That is the
 * property the whole checkpoint is for — an operator reading version 2 while
 * version 5 exists must see version 2's total, or the archive proves nothing.
 *
 * ### Ownership is proved, not assumed
 *
 * `loadVersion` addresses the versions table globally: a version id from
 * *another* quotation resolves perfectly well. The `quotationId` in the path is
 * therefore checked against `version.quotationId` before anything is projected —
 * the same G-DB7-03 containment the repository enforces on the write side, on
 * the read side, where its absence would let one request's URL serve another
 * customer's price. The mismatch and the missing row give the **same** answer
 * (`quotation-read.errors.ts`), so a wrong path cannot confirm that a version
 * exists elsewhere.
 *
 * ### The lines are the version's own
 *
 * `loadLineItems` is keyed on the version id, so a version with no lines returns
 * an empty list rather than borrowing its neighbour's — and the lines are
 * ordered by `position`, unique per version (CST-037), which makes the order
 * total and stable across reads.
 *
 * Read-only throughout: no transaction, no lock, no state change, no expiry
 * sweep and no pointer advance.
 */
import { Inject, Injectable } from '@nestjs/common';

import { quotationReadError } from '../../domain/reads/quotation-read.errors';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { projectLineItem, projectVersion } from './quotation-version.projection';
import type {
  QuotationHeaderView,
  QuotationLineItemView,
  QuotationVersionView,
} from './quotation-version.view';

export interface QuotationVersionDetailView {
  readonly quotation: QuotationHeaderView;
  readonly version: QuotationVersionView;
  readonly lineItems: readonly QuotationLineItemView[];
}

@Injectable()
export class ReadQuotationVersionDetail {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async read(
    quotationId: QuotationId,
    versionId: QuotationVersionId,
  ): Promise<QuotationVersionDetailView> {
    const quotation = await this.quotations.findById(quotationId);
    if (quotation === undefined) {
      throw quotationReadError('QUOTATION_NOT_FOUND');
    }

    const version = await this.quotations.loadVersion(versionId);
    if (version === undefined || version.quotationId !== quotation.id) {
      throw quotationReadError('QUOTATION_VERSION_NOT_FOUND');
    }

    const lineItems = await this.quotations.loadLineItems(version.id);

    return {
      quotation: {
        quotationId: quotation.id,
        quotationCode: quotation.code,
        customRequestId: quotation.customRequestId,
        quotationStatus: quotation.status,
        currentVersionId: quotation.currentVersionId,
      },
      version: projectVersion(version, quotation.currentVersionId),
      lineItems: lineItems.map(projectLineItem),
    };
  }
}
