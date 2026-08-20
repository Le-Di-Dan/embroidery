/**
 * The two Admin quotation drafting mutations (`APP6-B01`).
 *
 * ```text
 * POST /api/admin/quotations                        — adminQuotation_create
 * POST /api/admin/quotations/{quotationId}/versions — adminQuotation_addVersion
 * ```
 *
 * Two, and no third. There is no `/send`, `/accept`, `/reject` or generic
 * "set quotation status" route: `APP6-G01` §4 reaches `QUOTED`,
 * `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` **only** as a projection of
 * an owning aggregate's committed event, inside that event's own transaction, so
 * a route offering one as a target is the specific failure the phase is arranged
 * to prevent. Sending is `APP6-B03` and lands on its own surface.
 *
 * There is no `PUT`, `PATCH` or `DELETE` on a version either — and that is the
 * contract stating INV-02. A sent version's amounts are frozen; a revision is
 * version *n+1*, which is what the second route below creates. Nothing here can
 * address a version that already exists.
 *
 * ### Why `create` carries its request in the body
 *
 * `POST /admin/quotations` with `customRequestId` in the body, rather than
 * `POST /admin/custom-requests/{id}/quotations`: a quotation is its own resource
 * family with its own id, and every later operation in this domain
 * (`APP6-B02`'s history and detail, `APP6-B03`'s send) addresses a quotation,
 * not a request. Nesting the create alone would put one member of the domain
 * under a different root. `customRequestId` is a **subject**, not an authority —
 * the operator's identity is never in the body.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, plus `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on both handlers — the exact combination every Admin
 * mutation in this repository already uses, and both carry a body, so the JSON
 * content-type check has something to check. No cookie is parsed here, no
 * session is looked up, and neither handler accepts an operator identity: the
 * Admin id is bound by the guard and read from the request context inside the
 * use case.
 */
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
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
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import type { CustomRequestId } from '../../order/domain/repositories/custom-request.repository';
import { AddQuotationVersionUseCase } from '../application/drafting/add-quotation-version.use-case';
import { CreateQuotationDraftUseCase } from '../application/drafting/create-quotation-draft.use-case';
import type { DraftedVersionView } from '../application/drafting/draft-version.command';
import { guardedDrafting } from '../domain/drafting/quotation-drafting.errors';
import type { QuotationId } from '../domain/repositories/quotation.repository';
import {
  AddQuotationVersionBody,
  CreateQuotationDraftBody,
  QuotationIdParam,
} from './schemas/admin-quotation.request';
import {
  QuotationDraftedResponse,
  type QuotationDraftedPayload,
} from './schemas/admin-quotation.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const PRICING_400 =
  'Malformed body, or pricing this system cannot quote — a fractional đồng, an amount larger ' +
  'than the column, a total driven below zero, or an adjustment with no reason.';

const POLICY_503 =
  'The deposit policy has not been published, so no split can be derived. Nothing was written.';

const ORIGIN_403 = 'The request states an origin outside the Admin allowlist.';

const UNSUPPORTED_415 = 'Only application/json is accepted.';

@ApiTags('adminQuotation')
@ApiCookieAuth('adminSession')
@Controller('admin/quotations')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(QuotationDraftedResponse)
export class AdminQuotationController {
  constructor(
    private readonly drafts: CreateQuotationDraftUseCase,
    private readonly versions: AddQuotationVersionUseCase,
  ) {}

  /** 201 — a quotation and its first version are both created. */
  @Post()
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('QUOTATION_DRAFTED', 'Quotation drafted.')
  @ApiOperation({
    summary: 'Create the quotation for a request with its first draft version',
    description:
      'Creates the quotation for one custom request together with its first `DRAFT` version and ' +
      'the priced lines that explain it. The two commit together: there is no quotation without ' +
      'its first version. A request may hold exactly one quotation — a later price is a new ' +
      '**version** of it, not a second quotation.\n\n' +
      'Only the lines, the shipping fee and an optional adjustment are priced input. The line ' +
      'totals, the subtotal, the total and the deposit/remaining split are all derived: the ' +
      'split comes from published business policy, not from this request, and the amounts are ' +
      'exact decimal throughout — send them as strings.\n\n' +
      'This drafts only. The customer is not told, nothing is sent, no validity window starts ' +
      'and the request itself does not move.',
  })
  @ApiBody({ type: CreateQuotationDraftBody })
  @ApiResponse({
    status: 201,
    description: 'The quotation and the first version that were created.',
    schema: envelopeSchemaOf(QuotationDraftedResponse),
  })
  @ApiResponse({ status: 400, description: PRICING_400, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_403, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      '`REQUEST_NOT_QUOTABLE` — the request has not reached review, or has left the lifecycle. ' +
      '`QUOTATION_ALREADY_EXISTS` — it already has one; add a version to that instead.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 415, description: UNSUPPORTED_415, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 503, description: POLICY_503, schema: ERROR_SCHEMA })
  async create(@Body() body: CreateQuotationDraftBody): Promise<QuotationDraftedPayload> {
    return guardedDrafting(async () =>
      toPayload(
        await this.drafts.create({
          customRequestId: body.customRequestId as CustomRequestId,
          quantityTotal: body.quantityTotal,
          stitchCount: body.stitchCount,
          shippingFeeAmount: body.shippingFeeAmount,
          manualAdjustmentAmount: body.manualAdjustmentAmount,
          adjustmentReason: body.adjustmentReason,
          lineItems: body.lineItems,
        }),
      ),
    );
  }

  /** 201 — a version is always created, never updated. */
  @Post(':quotationId/versions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('QUOTATION_VERSION_DRAFTED', 'Quotation version drafted.')
  @ApiOperation({
    summary: 'Add a further draft version to an existing quotation',
    description:
      'Re-prices a quotation by adding the next `DRAFT` version with its own priced lines. It ' +
      'is an append: earlier versions — including any that were already sent — are left exactly ' +
      'as they are and stay readable, and there is no route anywhere that edits one. Version ' +
      'numbers are assigned by the server, consecutively, and are never reused.\n\n' +
      'The deposit split is read from published policy again for this version, so a version ' +
      'prices under the policy in force when it is drafted.\n\n' +
      'This drafts only: it sends nothing, starts no validity window and does not move the ' +
      'custom request.',
  })
  @ApiParam({ name: 'quotationId', format: 'uuid' })
  @ApiBody({ type: AddQuotationVersionBody })
  @ApiResponse({
    status: 201,
    description: 'The version that was created.',
    schema: envelopeSchemaOf(QuotationDraftedResponse),
  })
  @ApiResponse({ status: 400, description: PRICING_400, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_403, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such quotation.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description: '`QUOTATION_NOT_DRAFTABLE` — this quotation is closed to further versions.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 415, description: UNSUPPORTED_415, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 503, description: POLICY_503, schema: ERROR_SCHEMA })
  async addVersion(
    @Param() params: QuotationIdParam,
    @Body() body: AddQuotationVersionBody,
  ): Promise<QuotationDraftedPayload> {
    return guardedDrafting(async () =>
      toPayload(
        await this.versions.addVersion({
          quotationId: params.quotationId as QuotationId,
          quantityTotal: body.quantityTotal,
          stitchCount: body.stitchCount,
          shippingFeeAmount: body.shippingFeeAmount,
          manualAdjustmentAmount: body.manualAdjustmentAmount,
          adjustmentReason: body.adjustmentReason,
          lineItems: body.lineItems,
        }),
      ),
    );
  }
}

/**
 * The drafting receipt.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later — a `validUntil` or a `sentAt` added
 * for `APP6-B03` cannot reach this response by accident.
 */
function toPayload(view: DraftedVersionView): QuotationDraftedPayload {
  return {
    quotationId: view.quotationId,
    quotationCode: view.quotationCode,
    customRequestId: view.customRequestId,
    quotationStatus: view.quotationStatus,
    versionId: view.versionId,
    version: view.version,
    versionStatus: view.versionStatus,
    currencyCode: view.currencyCode,
    subtotalAmount: view.subtotalAmount,
    manualAdjustmentAmount: view.manualAdjustmentAmount,
    shippingFeeAmount: view.shippingFeeAmount,
    totalAmount: view.totalAmount,
    depositPercent: view.depositPercent,
    depositAmount: view.depositAmount,
    remainingAmount: view.remainingAmount,
    quantityTotal: view.quantityTotal,
    lineItemCount: view.lineItemCount,
  };
}
