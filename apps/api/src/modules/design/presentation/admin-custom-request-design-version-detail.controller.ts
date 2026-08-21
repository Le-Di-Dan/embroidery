/**
 * The one exact-version Admin design detail read (`APP6-A02` §5–§7).
 *
 * ```text
 * GET /api/admin/custom-requests/{requestId}/design-versions/{versionId}
 *     — adminCustomRequestDesignVersion_detail
 * ```
 *
 * One operation, and it stays one. `APP6-A02` §5 authorizes exactly this and
 * nothing beside it: there is no design-case detail, no separate review-detail
 * route, no separate approval-snapshot route, no document-only route, no
 * `/current` shorthand and no generic status route. One exact-version read
 * satisfies the whole workbench — the document for `695:3`'s revision source,
 * the persisted feedback for `696:113`, and the frozen snapshot for `697:3` —
 * and splitting it into four would be four surfaces to authorize instead of one.
 *
 * ### Its own class, on the same domain family
 *
 * A separate controller from `AdminCustomRequestDesignVersionController`, for
 * the reason `APP6-B09` split its send controller out: a class per operation
 * family keeps each file inside the size limit and keeps each one's dependency
 * list honest — this one holds a read query and nothing else, where the
 * authoring controller holds `AuthorDesignVersionUseCase`. The published
 * operation id stays in the existing `adminCustomRequestDesignVersion` family,
 * because this *is* that surface: `@ApiTags` names the same domain and Swagger
 * mints `adminCustomRequestDesignVersion_detail` from it.
 *
 * ### It is a read, and structurally so
 *
 * No transaction, no lock, no version mutation, no request mutation, no audit
 * record, no outbox append and no grant work. The module behind it holds no
 * `TransactionManager`, no `OutboxEventStore`, no `DESIGN_CASE_REPOSITORY` and
 * no `APPROVAL_SNAPSHOT_REPOSITORY`, so none of those is merely unused here —
 * they are unreachable. No `StaffOriginGuard` and no `StaffJsonBodyGuard`: an
 * origin guard on a read and a JSON-body guard on a request with no body would
 * be cargo-cult decoration that later readers would copy onto routes where it
 * means something.
 *
 * ### Privacy posture
 *
 * `Cache-Control: no-store`, because the response carries a customer's Design
 * Document and their own words from a review decision. Nothing here renders,
 * rasterizes, produces a derivative or offers a download, and the document body
 * is never logged: the platform's request logging records route, method and
 * status and is unchanged.
 */
import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { ReadDesignVersionDetailQuery } from '../application/read-design-version-detail.query';
import type { DesignVersionId } from '../domain/repositories/design-case.repository';
import { guardedDesignVersionAction } from './design-version-http-errors';
import { DesignVersionDetailParams } from './schemas/admin-design-version-detail.request';
import {
  ApprovalAgreementResponse,
  ApprovalEvidenceResponse,
  DesignVersionDetailResponse,
  DesignVersionDetailReviewResponse,
  type DesignVersionDetailPayload,
} from './schemas/admin-design-version-detail.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Customer-private design evidence must never be cached by a shared proxy. */
const DESIGN_VERSION_CACHE_CONTROL = 'no-store';

@ApiTags('adminCustomRequestDesignVersion')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
@ApiExtraModels(
  DesignVersionDetailResponse,
  DesignVersionDetailReviewResponse,
  ApprovalEvidenceResponse,
  ApprovalAgreementResponse,
)
export class AdminCustomRequestDesignVersionDetailController {
  constructor(private readonly versions: ReadDesignVersionDetailQuery) {}

  @Get(':requestId/design-versions/:versionId')
  @Header('Cache-Control', DESIGN_VERSION_CACHE_CONTROL)
  @ApiSuccessCode('DESIGN_VERSION_DETAIL_READ', 'Design version retrieved.')
  @ApiOperation({
    summary: 'Get one exact design version, with its document, decisions and approval',
    description:
      'The exact version named by the path, resolved through this request’s own design-case ' +
      'pointer — no case id is accepted and no global version lookup exists, so a version ' +
      'belonging to another request answers exactly as one that does not exist. The persisted ' +
      'Design Document is returned verbatim, unmigrated and unrewritten, with the hash stored ' +
      'when it was sent (null for a draft that never was; nothing is recomputed). Customer ' +
      'decisions carry the customer’s own recorded words, read from the decision record and ' +
      'never inferred, summarised or taken from an audit entry. An approved version also ' +
      'carries its immutable Approval Snapshot — frozen contacts (masked), frozen product, ' +
      'side, area, dimensions, quantity and accepted agreement hashes — read from the snapshot ' +
      'itself rather than re-resolved from current rows. No session secret, grant, step-up ' +
      'challenge, token, storage key or derivative appears anywhere in the response. It is a ' +
      'read: nothing is written, no lock is taken, no state moves and no event is emitted.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The exact design version.',
    schema: envelopeSchemaOf(DesignVersionDetailResponse),
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed request or version id.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: 'No such custom request, or no such design version on it.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'This request has no resolvable design case.',
    schema: ERROR_SCHEMA,
  })
  async detail(@Param() params: DesignVersionDetailParams): Promise<DesignVersionDetailPayload> {
    return guardedDesignVersionAction(async () => {
      const view = await this.versions.read(
        params.requestId as CustomRequestId,
        params.versionId as DesignVersionId,
      );

      // Written field by field rather than spread, the rule `APP5-B04`,
      // `APP6-B07` and `APP6-B08` all follow: the view type has nowhere to put a
      // property it gains later, so a field added upstream cannot reach this
      // response by accident. `undefined` becomes `null` here, once, because the
      // contract publishes every field as always-present-and-possibly-null.
      return {
        versionId: view.versionId,
        designCaseId: view.designCaseId,
        version: view.version,
        status: view.status,
        parentVersionId: view.parentVersionId ?? null,
        documentSchemaVersion: view.documentSchemaVersion,
        branch: view.branch,
        productId: view.productId ?? null,
        productVariantId: view.productVariantId ?? null,
        productSideId: view.productSideId ?? null,
        embroideryAreaId: view.embroideryAreaId ?? null,
        placementSideLabel: view.placementSideLabel ?? null,
        placementAreaLabel: view.placementAreaLabel ?? null,
        physicalWidthMm: view.physicalWidthMm,
        physicalHeightMm: view.physicalHeightMm,
        current: view.current,
        sentAt: view.sentAt?.toISOString() ?? null,
        approvedAt: view.approvedAt?.toISOString() ?? null,
        documentHash: view.documentHash ?? null,
        document: view.document,
        reviews: view.reviews.map((review) => ({
          outcome: review.outcome,
          decidedAt: review.decidedAt.toISOString(),
          feedback: review.feedback ?? null,
        })),
        approval:
          view.approval === undefined
            ? null
            : {
                documentHash: view.approval.documentHash,
                approvedAt: view.approval.approvedAt.toISOString(),
                customerDisplayName: view.approval.customerDisplayName ?? null,
                maskedEmail: view.approval.maskedEmail ?? null,
                maskedPhone: view.approval.maskedPhone ?? null,
                reverified: view.approval.reverified,
                productName: view.approval.productName,
                variantLabel: view.approval.variantLabel ?? null,
                sideName: view.approval.sideName,
                areaName: view.approval.areaName,
                physicalWidthMm: view.approval.physicalWidthMm,
                physicalHeightMm: view.approval.physicalHeightMm,
                quantityTotal: view.approval.quantityTotal,
                branch: view.approval.branch,
                agreements: view.approval.agreements.map((agreement) => ({
                  agreementType: agreement.agreementType,
                  contentHash: agreement.contentHash,
                  acceptedAt: agreement.acceptedAt.toISOString(),
                })),
              },
      };
    });
  }
}
