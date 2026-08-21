/**
 * The request's design-version history, with review outcomes (`APP6-B08` §16).
 *
 * A read, and structurally so: it opens no transaction — nothing in this class
 * can, because it holds no `TransactionManager` — takes no row lock, and calls
 * no method that writes. The unlocked `findDesignContext` is used rather than
 * `lockDesignContext` deliberately: `FOR UPDATE` on a GET would serialise an
 * Admin screen against every concurrent write to the same request, for a
 * consistency guarantee a history list does not need.
 *
 * The case is resolved through the request's canonical pointer and must name the
 * request back, exactly as authoring does. Both directions matter here too: a
 * caller supplies no case id, so a foreign case is unreachable rather than
 * merely refused.
 *
 * **Eligibility is not re-checked.** Reading the history of a request that is
 * `APPROVED`, `CANCELLED` or still `QUOTED` is legitimate — `TR-LC08-01`'s state
 * guard governs authoring a version, not looking at ones that already exist, and
 * applying it here would blank the history of every settled request.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContextPort,
} from '../../order/domain/repositories/custom-request-design-context.port';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { DesignVersionAuthoringError } from '../domain/design-version-authoring.errors';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseId,
  type DesignCaseRepository,
  type DesignVersionId,
} from '../domain/repositories/design-case.repository';
import { projectVersion, type DesignVersionView } from './design-version.projection';

export interface DesignVersionHistoryView {
  readonly designCaseId: string;
  readonly versions: readonly DesignVersionView[];
}

@Injectable()
export class ListDesignVersionsQuery {
  constructor(
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly requests: CustomRequestDesignContextPort,
  ) {}

  async list(customRequestId: CustomRequestId): Promise<DesignVersionHistoryView> {
    const request = await this.requests.findDesignContext(customRequestId);
    if (request === undefined) {
      throw new DesignVersionAuthoringError('REQUEST_NOT_FOUND');
    }
    if (request.currentDesignCaseId === undefined) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }

    const designCase = await this.cases.findById(request.currentDesignCaseId as DesignCaseId);
    if (designCase === undefined || designCase.customRequestId !== request.requestId) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }

    const [versions, reviews] = await Promise.all([
      // Ascending by version number, as the repository already orders it: the
      // history reads oldest-first, and every version ever authored stays
      // visible — superseded and void ones included. A list that hid them would
      // be a list that could not explain how the current one was arrived at.
      this.cases.listVersions(designCase.id),
      this.cases.listReviews(designCase.id),
    ]);

    // Grouped once rather than filtered per version, so the projection stays
    // linear in the number of reviews instead of quadratic, and each version's
    // reviews keep the repository's deterministic chronological order.
    const byVersion = new Map<DesignVersionId, typeof reviews>();
    for (const review of reviews) {
      const bucket = byVersion.get(review.designVersionId);
      if (bucket === undefined) byVersion.set(review.designVersionId, [review]);
      else bucket.push(review);
    }

    return {
      designCaseId: designCase.id,
      versions: versions.map((version) =>
        projectVersion(version, designCase.currentVersionId, byVersion.get(version.id) ?? []),
      ),
    };
  }
}
