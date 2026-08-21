/**
 * Authoring one formal DRAFT Design Version — `TR-LC08-01`, `APP6-B08`.
 *
 * ### One transaction, and the lock order is the phase's
 *
 * The request row is locked first and the design case second, matching
 * `APP6-B05` and `APP6-B03`. That order is not cosmetic: `TR-LC08-01`'s guard is
 * the request's LC-11 **status**, and an unlocked read of it is a decision made
 * about a value that may already have changed — a concurrent `APP6-B05`
 * cancellation committing between the check and the insert would leave a DRAFT
 * attached to a request no longer eligible for one. `createVersion` then takes
 * the case lock itself, so the two are always acquired in the same direction and
 * two operators authoring at once cannot deadlock.
 *
 * ### What this use case cannot do
 *
 * It holds no `CustomRequestRepository`, so there is no `transition()` in this
 * injector: authoring a draft cannot move a request, and `TR-LC11-08`
 * (`→ DESIGN_REVIEW`) stays `APP6-B09`'s. It holds no outbox and no notification
 * port, so `SE-004 design.review-ready` cannot be emitted here. It calls no
 * `sendForReview` and no `supersede` — a draft is authored, not sent, and
 * superseding the version under review is `TR-LC08-05`, which happens in B09's
 * send transaction where the two are atomic.
 *
 * ### Append, never edit
 *
 * Every successful call inserts a **new row**. There is no update path to a
 * previous version at any layer: `DesignCaseRepository` offers no version edit,
 * and CST-090's S24 trigger rejects a mutation of any non-DRAFT row regardless.
 * A revision is another `TR-LC08-01`, which is why the `DESIGN_REVIEW` state is
 * eligible at all.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../platform/request-context/request-context.service';
import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContext,
  type CustomRequestDesignContextPort,
} from '../../order/domain/repositories/custom-request-design-context.port';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { DesignVersionAuthoringError } from '../domain/design-version-authoring.errors';
import { isVersionAuthorableState } from '../domain/design-version-eligibility';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseId,
  type DesignCaseRepository,
  type DesignVersion,
  type DesignVersionId,
  type DesignVersionPlacement,
} from '../domain/repositories/design-case.repository';
import { DesignVersionAuditRecorder } from './design-version-audit.recorder';
import {
  DesignVersionBranchResolver,
  type ResolvedVersionBranch,
} from './design-version-branch.resolver';
import {
  FormalDesignVersionAuthority,
  type FormalDocumentOutcome,
} from './formal-design-version.authority';
import { requireAdminActorId } from './design-version-actor';

/**
 * What an operator may author, and nothing more.
 *
 * The Catalog identities are absent on purpose — all four are server-derived
 * from the request and its submitted session — as are the request id, the case
 * id, the customer, the Admin id, the status, the version number, the document
 * hash and every timestamp. The COP fields are the only placement facts a caller
 * supplies, and only because the customer-owned branch has no Catalog authority
 * to derive them from; they are ignored outright on the Catalog branch rather
 * than being allowed to override anything.
 */
export interface AuthorDesignVersionCommand {
  readonly customRequestId: CustomRequestId;
  readonly document: unknown;
  readonly placementSideLabel?: string | undefined;
  readonly placementAreaLabel?: string | undefined;
  readonly physicalWidthMm?: number | undefined;
  readonly physicalHeightMm?: number | undefined;
}

@Injectable()
export class AuthorDesignVersionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly requests: CustomRequestDesignContextPort,
    private readonly branches: DesignVersionBranchResolver,
    private readonly documents: FormalDesignVersionAuthority,
    private readonly audit: DesignVersionAuditRecorder,
    private readonly requestContext: RequestContextService,
  ) {}

  async author(command: AuthorDesignVersionCommand): Promise<DesignVersion> {
    // Resolved before anything else: an action with no operator behind it must
    // fail before it reads a request, not after it has written one.
    const adminId = requireAdminActorId(this.requestContext);

    return this.transactions.runInTransaction(async () => {
      const request = await this.requests.lockDesignContext(command.customRequestId);
      if (request === undefined) {
        throw new DesignVersionAuthoringError('REQUEST_NOT_FOUND');
      }
      if (!isVersionAuthorableState(request.status)) {
        throw new DesignVersionAuthoringError('REQUEST_NOT_DIGITIZING');
      }

      const designCase = await this.resolveCase(request);
      const branch = await this.branches.resolve(request);
      if (branch === undefined) {
        throw new DesignVersionAuthoringError('CATALOG_PLACEMENT_UNRESOLVED');
      }

      const placement = this.buildPlacement(branch, command);
      const outcome = this.validateDocument(branch, command, placement);
      if (!outcome.ok) {
        throw new DesignVersionAuthoringError('DOCUMENT_REJECTED', outcome.rejection);
      }

      const version = await this.cases.createVersion({
        id: newId() as DesignVersionId,
        designCaseId: designCase.id,
        // The **prepared** document, never the caller's object: P01 quantizes
        // and re-validates, and what geometry judged must be what is stored.
        designDocument: outcome.document as unknown as Record<string, unknown>,
        documentSchemaVersion: outcome.schemaVersion,
        placement,
        // The previous version of this case, when there is one. Lineage is read
        // from the case rather than accepted from the body: a caller-supplied
        // parent could name another case's version, and REL-046's FK would not
        // notice. The first version has no parent, and none is invented for it —
        // `parent_version_id` is nullable precisely so the root of a chain can
        // say so.
        parentVersionId: designCase.currentVersionId,
      });

      // G-DB7-02, in the version-create transaction the guard matrix names as one
      // of its two sites. The case header's pointer is TX-consistent with the
      // newest authored version (REL-044), so a case never reports a current
      // version older than the work actually on it. It is not a claim about
      // review state: `findVersionInReview` and the partial unique index remain
      // the only arbiters of what is under review (GRD-004), so advancing this
      // pointer while an older version is still SENT_FOR_REVIEW takes nothing
      // away from B09's arbitration.
      await this.cases.setCurrentVersion(designCase.id, version.id);

      await this.audit.recordCreated(
        {
          designVersionId: version.id,
          designCaseId: designCase.id,
          customRequestId: request.requestId,
          version: version.version,
          branch: branch.branch,
          documentSchemaVersion: version.documentSchemaVersion,
          parentVersionId: designCase.currentVersionId,
        },
        adminId,
      );

      return version;
    });
  }

  /**
   * The request's own design case, by its canonical pointer, both directions.
   *
   * `current_design_case_id` is followed rather than "the latest case for this
   * request" because the pointer is the canonical relation (G-DB7-09) and a
   * lookup by request would quietly pick a case even if the pointer named a
   * different one. The case is then required to name the request back: without
   * that second test a dangling or re-pointed pointer would attach this
   * request's artwork to somebody else's design thread. Neither failure is
   * repaired here — no case is created and none is rebound.
   */
  private async resolveCase(
    request: CustomRequestDesignContext,
  ): Promise<{ id: DesignCaseId; currentVersionId: DesignVersionId | undefined }> {
    if (request.currentDesignCaseId === undefined) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }
    const designCase = await this.cases.findById(request.currentDesignCaseId as DesignCaseId);
    if (designCase === undefined || designCase.customRequestId !== request.requestId) {
      throw new DesignVersionAuthoringError('DESIGN_CASE_UNRESOLVED');
    }
    return { id: designCase.id, currentVersionId: designCase.currentVersionId };
  }

  /**
   * The persisted placement, assembled from the derived branch.
   *
   * On the Catalog branch the body's COP fields are not merely unused — sending
   * them is a refusal. Silently ignoring them would let an operator believe they
   * had set a placement label or an envelope on a version that stores neither.
   */
  private buildPlacement(
    branch: ResolvedVersionBranch,
    command: AuthorDesignVersionCommand,
  ): DesignVersionPlacement {
    const suppliedCop =
      command.placementSideLabel !== undefined ||
      command.placementAreaLabel !== undefined ||
      command.physicalWidthMm !== undefined ||
      command.physicalHeightMm !== undefined;

    if (branch.branch === 'CATALOG') {
      if (suppliedCop) {
        throw new DesignVersionAuthoringError('PLACEMENT_INPUT_INVALID');
      }
      return {
        branch: 'CATALOG',
        productId: branch.productId,
        productVariantId: branch.productVariantId,
        productSideId: branch.productSideId,
        embroideryAreaId: branch.embroideryAreaId,
        // Catalog dimensions come from the Product Side, never from the body.
        physicalWidthMm: String(branch.authority.side.physicalWidthMm),
        physicalHeightMm: String(branch.authority.side.physicalHeightMm),
      };
    }

    const sideLabel = command.placementSideLabel?.trim();
    const areaLabel = command.placementAreaLabel?.trim();
    if (
      sideLabel === undefined ||
      sideLabel === '' ||
      areaLabel === undefined ||
      areaLabel === '' ||
      command.physicalWidthMm === undefined ||
      command.physicalHeightMm === undefined ||
      command.physicalWidthMm <= 0 ||
      command.physicalHeightMm <= 0
    ) {
      throw new DesignVersionAuthoringError('PLACEMENT_INPUT_INVALID');
    }
    return {
      branch: 'CUSTOMER_OWNED',
      customerOwnedProductId: branch.customerOwnedProductId,
      sideLabel,
      areaLabel,
      // The version's own frozen envelope (ADR-APP6-001 §3.3). Nothing reads
      // `customer_owned_products.physical_width_mm`/`physical_height_mm` here:
      // those describe the garment, and adopting them as bounds would claim the
      // whole item as the stitch area.
      physicalWidthMm: String(command.physicalWidthMm),
      physicalHeightMm: String(command.physicalHeightMm),
    };
  }

  private validateDocument(
    branch: ResolvedVersionBranch,
    command: AuthorDesignVersionCommand,
    placement: DesignVersionPlacement,
  ): FormalDocumentOutcome {
    if (branch.branch === 'CATALOG') {
      return this.documents.validateCatalog(command.document, branch.authority);
    }
    return this.documents.validateCustomerOwned(command.document, {
      physicalWidthMm: Number(placement.physicalWidthMm),
      physicalHeightMm: Number(placement.physicalHeightMm),
    });
  }
}
