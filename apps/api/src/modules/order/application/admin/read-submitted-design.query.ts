/**
 * The Admin read of one request's submitted design source (`APP6-B07`).
 *
 * The flow is request-truth-first, and the order is the contract:
 *
 * ```text
 * resolve the exact request by the id the operator typed
 *   -> absent request        : REQUEST_NOT_FOUND, the canonical Admin answer
 *   -> read the server-owned submitted_session_id
 *      -> absent pointer     : empty source (every COP request, by design)
 *      -> present pointer    : find that exact session, correlated back to the
 *                              request and still SUBMITTED
 *         -> no such row     : empty source (purged, or no longer evidence)
 *         -> otherwise       : the persisted document, as persisted
 * ```
 *
 * It never starts from a session lookup. `submitted_session_id` is provenance:
 * it selects the source *after* the request has been authorised, and is never an
 * authorization input on its own (`G01-D09`). The caller supplies no session id
 * at all, so there is no value it could substitute.
 *
 * ## Why absence is a success
 *
 * Three distinct facts collapse to one empty result — a request that never had a
 * Design Session, one whose session has been TTL-swept, and one whose pointed row
 * is no longer truthful submitted evidence. That is `APP6-B07` §6 and §12: a
 * customer-owned-product request *correctly* has no design source, so reporting
 * it as an error would make the normal case look broken, and distinguishing the
 * other two would publish the retention schedule to no operator's benefit. What
 * is never done is the alternative — fabricating a placement, a blank document or
 * a Catalog default so the field is populated.
 *
 * ## No document work here
 *
 * The stored document crosses as it was persisted. It is not re-validated,
 * re-quantized, canonicalized, hashed or rendered: `APP6-B07` returns source
 * data, and `APP6-B08` is the checkpoint that turns it into a formal Design
 * Version. Validating here would also be a second acceptance authority beside
 * `APP3-P01`'s.
 */
import { Inject, Injectable } from '@nestjs/common';

import { adminRequestReadError } from '../../domain/admin/admin-request-read.errors';
import {
  CUSTOM_REQUEST_DESIGN_SOURCE_PORT,
  type CustomRequestDesignSourcePort,
} from '../../domain/repositories/custom-request-design-source.port';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import {
  SUBMITTED_DESIGN_SOURCE_REPOSITORY,
  type SubmittedDesignSource,
  type SubmittedDesignSourceRepository,
} from '../../../design/domain/repositories/submitted-design-source.repository';

/** The whole answer: one optional source, and no request facts beside it. */
export interface SubmittedDesignView {
  readonly submittedDesign: SubmittedDesignSource | undefined;
}

@Injectable()
export class ReadSubmittedDesign {
  constructor(
    @Inject(CUSTOM_REQUEST_DESIGN_SOURCE_PORT)
    private readonly requests: CustomRequestDesignSourcePort,
    @Inject(SUBMITTED_DESIGN_SOURCE_REPOSITORY)
    private readonly sources: SubmittedDesignSourceRepository,
  ) {}

  async read(requestId: string): Promise<SubmittedDesignView> {
    const pointer = await this.requests.findDesignSourcePointer(requestId as CustomRequestId);
    if (pointer === undefined) {
      throw adminRequestReadError('REQUEST_NOT_FOUND');
    }
    if (pointer.submittedSessionId === undefined) {
      return { submittedDesign: undefined };
    }

    // Both ids come from the server: the one the request stores, and the one the
    // request *is*. The port requires both, so the row it returns is the pointed
    // one or none at all.
    const source = await this.sources.findSubmittedSource({
      sessionId: pointer.submittedSessionId,
      requestId: pointer.requestId,
    });
    return { submittedDesign: source };
  }
}
