/**
 * One exact Design Version, with its document, its review feedback and its
 * approval evidence (`APP6-A02` §5, §6).
 *
 * A read, and structurally so: it opens no transaction — nothing in this class
 * can, because it holds no `TransactionManager` — takes no row lock, and calls
 * no method that writes. `DESIGN_VERSION_DETAIL_PORT` offers four SELECTs and
 * nothing else, so `createVersion`, `sendForReview`, `recordReview`, `approve`,
 * a request transition and an outbox append are not merely unused here: they are
 * unreachable.
 *
 * ## Resolution
 *
 * ```text
 * Authenticated Admin
 *   → requestId
 *   → custom_requests.current_design_case_id
 *   → the exact Design Case, which must name the request back
 *   → versionId, matched **within that case**
 * ```
 *
 * No caller supplies a `designCaseId` and no global version lookup exists, so a
 * foreign version is not refused — it is unreachable. Both directions of the
 * case↔request pointer are checked for the reason `ListDesignVersionsQuery`
 * records: a caller supplies no case id, so a foreign case must be impossible
 * rather than merely rejected.
 *
 * ## Eligibility is not re-checked
 *
 * Reading a version of a request that is `APPROVED`, `CANCELLED` or still
 * `QUOTED` is legitimate, exactly as reading its history is. `TR-LC08-01`'s
 * state guard governs *authoring* a version, and applying it here would blank
 * the approved snapshot of every settled request — which is the one screen an
 * operator most needs after the work is done.
 *
 * ## Unknown and foreign are the same answer
 *
 * A version id naming no row and a version id naming another case's row both
 * raise `DESIGN_VERSION_NOT_FOUND`. Distinguishing them would confirm the
 * existence of a design version on a request this operator addressed by
 * guessing.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContextPort,
} from '../../order/domain/repositories/custom-request-design-context.port';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { DesignVersionAuthoringError } from '../domain/design-version-authoring.errors';
import type { DesignCaseId, DesignVersionId } from '../domain/repositories/design-case.repository';
import {
  DESIGN_VERSION_DETAIL_PORT,
  type DesignVersionDetailPort,
} from '../domain/repositories/design-version-detail.port';
import {
  projectVersionDetail,
  type DesignVersionDetailView,
} from './design-version-detail.projection';

@Injectable()
export class ReadDesignVersionDetailQuery {
  constructor(
    @Inject(DESIGN_VERSION_DETAIL_PORT) private readonly versions: DesignVersionDetailPort,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly requests: CustomRequestDesignContextPort,
  ) {}

  async read(
    customRequestId: CustomRequestId,
    versionId: DesignVersionId,
  ): Promise<DesignVersionDetailView> {
    const request = await this.requests.findDesignContext(customRequestId);
    if (request === undefined) {
      throw new DesignVersionAuthoringError('REQUEST_NOT_FOUND');
    }
    if (request.currentDesignCaseId === undefined) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }

    const designCase = await this.versions.findCase(request.currentDesignCaseId as DesignCaseId);
    if (designCase === undefined || designCase.customRequestId !== request.requestId) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }

    const version = await this.versions.findVersion(designCase.id, versionId);
    if (version === undefined) {
      throw new DesignVersionAuthoringError('DESIGN_VERSION_NOT_FOUND');
    }

    // The approval is looked up before its agreements because the acceptance
    // rows hang off the snapshot id, not the version id. An unapproved version
    // therefore costs one query, not two, and never asks for the children of a
    // snapshot that does not exist.
    const [reviews, approval] = await Promise.all([
      this.versions.listReviews(version.id),
      this.versions.findApproval(version.id),
    ]);
    const agreements =
      approval === undefined ? [] : await this.versions.listAgreements(approval.id);

    return projectVersionDetail({
      version,
      currentVersionId: designCase.currentVersionId,
      reviews,
      approval,
      agreements,
    });
  }
}
