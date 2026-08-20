/**
 * The two Admin quotation reads (`APP6-B02`).
 *
 * ```text
 * GET /api/admin/quotations/{quotationId}/versions             — adminQuotation_versionHistory
 * GET /api/admin/quotations/{quotationId}/versions/{versionId} — adminQuotation_versionDetail
 * ```
 *
 * Two, and no third. There is no `/current` shortcut — that would be a second
 * way to address a version, and the pointer it would follow is not advanced
 * until `APP6-B03` — and no `/line-items` collection: lines are evidence read
 * *with* a version, not a resource addressed on its own, and publishing the URL
 * now would fix a path before anything needs it.
 *
 * ### A separate controller from `APP6-B01`'s, deliberately
 *
 * `AdminQuotationController` holds the two drafting mutations and states in its
 * own contract test that it exposes exactly two handlers. Reads compose beside
 * it against the same repository port, which is the shape `quotation-drafting.
 * module.ts` anticipated: a read surface that shares a class with a write
 * surface acquires the write surface's guards, its DI and eventually its
 * transaction.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level — the same guard every Admin
 * read in this repository uses, and the whole gate. `StaffOriginGuard` and
 * `StaffJsonBodyGuard` are **absent** on purpose: they are mutation guards. A
 * JSON body guard on a GET has no body to check, and the CSRF-shaped origin
 * check protects state-changing requests; adding either here would be cargo,
 * and the second would reject a perfectly legitimate read from a browser that
 * sent no origin. Neither handler accepts an operator identity — the Admin is
 * bound server-side by the guard and is not a parameter.
 *
 * ### Nothing here writes
 *
 * No transaction is opened, no lock taken, no state advanced, no pointer set,
 * no transition or outbox row appended, and no version expired because its
 * `valid_until` has passed. Reading a quotation is not an event, and the APP6
 * expiry sweep stays deferred rather than arriving through a GET.
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
import { ReadQuotationVersionDetail } from '../application/reads/read-quotation-version-detail.query';
import { ReadQuotationVersionHistory } from '../application/reads/read-quotation-version-history.query';
import type {
  QuotationHeaderView,
  QuotationLineItemView,
  QuotationVersionView,
} from '../application/reads/quotation-version.view';
import { guardedQuotationRead } from '../domain/reads/quotation-read.errors';
import type { QuotationId, QuotationVersionId } from '../domain/repositories/quotation.repository';
import { QuotationIdParam } from './schemas/admin-quotation.request';
import { QuotationVersionParams } from './schemas/admin-quotation-version.request';
import {
  AdminQuotationHeaderResponse,
  AdminQuotationLineItemResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationVersionHistoryResponse,
  AdminQuotationVersionResponse,
  type AdminQuotationHeaderPayload,
  type AdminQuotationLineItemPayload,
  type AdminQuotationVersionDetailPayload,
  type AdminQuotationVersionHistoryPayload,
  type AdminQuotationVersionPayload,
} from './schemas/admin-quotation-version.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** Pricing an operator is deciding from must never be held by a shared proxy. */
const QUOTATION_READ_CACHE_CONTROL = 'no-store';

const UNAUTHENTICATED_401 = 'No live Admin session.';

@ApiTags('adminQuotation')
@ApiCookieAuth('adminSession')
@Controller('admin/quotations')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminQuotationVersionHistoryResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationHeaderResponse,
  AdminQuotationVersionResponse,
  AdminQuotationLineItemResponse,
)
export class AdminQuotationVersionController {
  constructor(
    private readonly history: ReadQuotationVersionHistory,
    private readonly detail: ReadQuotationVersionDetail,
  ) {}

  @Get(':quotationId/versions')
  @Header('Cache-Control', QUOTATION_READ_CACHE_CONTROL)
  @ApiSuccessCode('QUOTATION_VERSION_HISTORY_READ', 'Quotation version history retrieved.')
  @ApiOperation({
    summary: 'List every version of one quotation',
    description:
      'The complete version history, oldest first by version number — the order the database ' +
      'assigned them in, consecutively and without reuse. It is not paginated and nothing is ' +
      'filtered out: a superseded, expired or rejected version stays in the history exactly as ' +
      'it was priced.\n\n' +
      'Each entry carries that version’s **own** recorded facts — its amounts, the deposit ' +
      'share it was priced at, its adjustment and the reason for it, and the timestamps it ' +
      'actually reached. Nothing is recalculated and nothing is re-derived from current ' +
      'business policy, so a version drafted under an older deposit split still reads as that ' +
      'split. Amounts are exact decimal strings.\n\n' +
      'This is a read. It sends nothing, moves no version, advances no pointer and does not ' +
      'expire an offer whose validity has lapsed.',
  })
  @ApiParam({ name: 'quotationId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The quotation and every version of it.',
    schema: envelopeSchemaOf(AdminQuotationVersionHistoryResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed identifier.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: UNAUTHENTICATED_401, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description: '`QUOTATION_NOT_FOUND` — no such quotation.',
    schema: ERROR_SCHEMA,
  })
  async versionHistory(
    @Param() params: QuotationIdParam,
  ): Promise<AdminQuotationVersionHistoryPayload> {
    return guardedQuotationRead(async () => {
      const view = await this.history.read(params.quotationId as QuotationId);
      return {
        quotation: toHeaderPayload(view.quotation),
        versions: view.versions.map(toVersionPayload),
      };
    });
  }

  @Get(':quotationId/versions/:versionId')
  @Header('Cache-Control', QUOTATION_READ_CACHE_CONTROL)
  @ApiSuccessCode('QUOTATION_VERSION_READ', 'Quotation version retrieved.')
  @ApiOperation({
    summary: 'Read one exact quotation version with its priced lines',
    description:
      'Returns the version named by `versionId` — **that** version, never the current or the ' +
      'latest one — together with its own frozen lines, ordered by position. A version ' +
      'belonging to a different quotation is not readable through this path: it answers ' +
      '`QUOTATION_VERSION_NOT_FOUND`, the same answer a version that does not exist gets.\n\n' +
      'Every figure is the one recorded when the version was drafted: the line totals, the ' +
      'subtotal, the adjustment and its reason, the total, and the deposit split with the ' +
      'percentage it was priced at. None of it is recomputed and none of it is re-read from ' +
      'today’s policy, which is what makes an older version explainable rather than merely ' +
      'present. Amounts are exact decimal strings.\n\n' +
      'This is a read, with no effect on the version, the quotation or the request.',
  })
  @ApiParam({ name: 'quotationId', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The exact version and its line items.',
    schema: envelopeSchemaOf(AdminQuotationVersionDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed identifier.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: UNAUTHENTICATED_401, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      '`QUOTATION_NOT_FOUND` — no such quotation. `QUOTATION_VERSION_NOT_FOUND` — this ' +
      'quotation has no version with that id.',
    schema: ERROR_SCHEMA,
  })
  async versionDetail(
    @Param() params: QuotationVersionParams,
  ): Promise<AdminQuotationVersionDetailPayload> {
    return guardedQuotationRead(async () => {
      const view = await this.detail.read(
        params.quotationId as QuotationId,
        params.versionId as QuotationVersionId,
      );
      return {
        quotation: toHeaderPayload(view.quotation),
        version: toVersionPayload(view.version),
        lineItems: view.lineItems.map(toLinePayload),
      };
    });
  }
}

function toHeaderPayload(view: QuotationHeaderView): AdminQuotationHeaderPayload {
  return {
    quotationId: view.quotationId,
    quotationCode: view.quotationCode,
    customRequestId: view.customRequestId,
    quotationStatus: view.quotationStatus,
    currentVersionId: view.currentVersionId ?? null,
  };
}

/**
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later: a customer id, a grant or a secure
 * token added for `APP6-B04` cannot reach this response by accident.
 *
 * Every amount crosses unchanged — no `Number()`, no `toFixed`, no rounding.
 * `Date` becomes an ISO-8601 string and `undefined` becomes `null`, which is the
 * repository's convention for a fact that does not exist yet.
 */
function toVersionPayload(view: QuotationVersionView): AdminQuotationVersionPayload {
  return {
    versionId: view.versionId,
    version: view.version,
    status: view.status,
    quantityTotal: view.quantityTotal,
    stitchCount: view.stitchCount ?? null,
    currencyCode: view.currencyCode,
    subtotalAmount: view.subtotalAmount,
    manualAdjustmentAmount: view.manualAdjustmentAmount,
    adjustmentReason: view.adjustmentReason ?? null,
    shippingFeeAmount: view.shippingFeeAmount,
    totalAmount: view.totalAmount,
    depositPercent: view.depositPercent,
    depositAmount: view.depositAmount,
    remainingAmount: view.remainingAmount,
    validFrom: view.validFrom?.toISOString() ?? null,
    validUntil: view.validUntil?.toISOString() ?? null,
    sentAt: view.sentAt?.toISOString() ?? null,
    acceptedAt: view.acceptedAt?.toISOString() ?? null,
    supersededAt: view.supersededAt?.toISOString() ?? null,
    expiredAt: view.expiredAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
    current: view.current,
  };
}

function toLinePayload(view: QuotationLineItemView): AdminQuotationLineItemPayload {
  return {
    position: view.position,
    lineKind: view.lineKind,
    description: view.description,
    skuId: view.skuId ?? null,
    quantity: view.quantity,
    unitPriceAmount: view.unitPriceAmount,
    lineTotalAmount: view.lineTotalAmount,
  };
}
