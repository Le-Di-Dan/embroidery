/**
 * The one Admin quotation send mutation (`APP6-B03`).
 *
 * ```text
 * POST /api/admin/quotations/{quotationId}/versions/{versionId}/send
 *   — adminQuotation_sendVersion
 * ```
 *
 * One, and no second. There is no `/resend`: re-issuing the same version is the
 * *same* command and replays through this route, and a separate verb would be a
 * second way to express one intent whose two implementations would drift. There
 * is no `/current/send` shortcut either — a send addresses the exact version
 * being frozen, so the operator's URL states which price went out.
 *
 * ### The command is a send, not a status
 *
 * `APP6-G01` §4.1 reaches `QUOTED` **only** as a projection of the owning
 * aggregate's committed event. This publishes no generic transition target, no
 * `POST /requests/{id}/quoted`, and no body through which one could be named:
 * `QUOTED` appears in the response as a *reported* state and nowhere as an
 * input. `APP5-B05`'s Admin transition allow-list is untouched by this
 * checkpoint.
 *
 * ### A separate controller from `APP6-B01`'s and `APP6-B02`'s
 *
 * The drafting and read classes each state in their own contract test that they
 * expose exactly two handlers, and the read module deliberately holds no
 * transaction manager. The send is a third surface with a fourth dependency set
 * — the order repository, the outbox, the audit repository and the validity
 * policy — so it composes its own module around the same AGG-14 port. All three
 * classes remain one published domain through `CONTROLLER_DOMAIN_KEYS`, so no
 * accepted operation id is reissued by the split.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level and `StaffOriginGuard` on the
 * handler — the CSRF-shaped origin check every Admin mutation in this repository
 * carries. `StaffJsonBodyGuard` is **absent**, and deliberately: this operation
 * has no body, so there is no content type to check and requiring
 * `application/json` would reject a perfectly legitimate bodyless POST.
 *
 * The absence of a body is itself the contract. The operator identity, the send
 * instant, the validity window, the totals and the target state are all
 * server-derived; there is no field through which a caller could supply one, so
 * they cannot be supplied by mistake or on purpose.
 */
import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
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
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { SendQuotationVersionUseCase } from '../application/sending/send-quotation-version.use-case';
import type { QuotationSentView } from '../application/sending/quotation-sent.view';
import { guardedQuotationSend } from '../domain/sending/quotation-send.errors';
import type { QuotationId, QuotationVersionId } from '../domain/repositories/quotation.repository';
import { QuotationVersionParams } from './schemas/admin-quotation-version.request';
import {
  AdminQuotationSentResponse,
  type AdminQuotationSentPayload,
} from './schemas/admin-quotation-send.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

const UNAUTHENTICATED_401 = 'No live Admin session.';

const ORIGIN_403 = 'The request states an origin outside the Admin allowlist.';

@ApiTags('adminQuotation')
@ApiCookieAuth('adminSession')
@Controller('admin/quotations')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(AdminQuotationSentResponse)
export class AdminQuotationSendController {
  constructor(private readonly sender: SendQuotationVersionUseCase) {}

  /** 200 — the version is frozen and the customer's current price is this one. */
  @Post(':quotationId/versions/:versionId/send')
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('QUOTATION_SENT', 'Quotation sent.')
  @ApiOperation({
    summary: 'Send one exact quotation version to the customer',
    description:
      'Freezes the version named by `versionId` — **that** version, never the latest one — and ' +
      'makes it the price the customer is looking at. One transaction does all of it: the ' +
      'version becomes `SENT` with its validity window, any previously sent version becomes ' +
      '`SUPERSEDED`, the quotation points at this version, the request points at this ' +
      'quotation, and the request moves to `QUOTED` when it was under review. Nothing partial ' +
      'survives a failure.\n\n' +
      'Nothing is re-priced. The lines, the subtotal, the total and the deposit split are the ' +
      'ones the version was drafted with; the send adds `sentAt`, `validFrom` and `validUntil` ' +
      'and touches no amount. The validity window comes from published business policy, not ' +
      'from this request — there is no body, and the operator supplies nothing but the two ' +
      'identifiers in the path.\n\n' +
      'Sending the same version twice is safe and is the intended way to re-issue it: the ' +
      'second call replays, returning the committed result without re-freezing it, moving a ' +
      'date, changing a pointer or notifying the customer again. A version that has been ' +
      'superseded, accepted, rejected, expired or voided cannot be sent — draft a new version ' +
      'instead.',
  })
  @ApiParam({ name: 'quotationId', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The sent version, its lines, and where the request now stands.',
    schema: envelopeSchemaOf(AdminQuotationSentResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed identifier.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: UNAUTHENTICATED_401, schema: ERROR_SCHEMA })
  @ApiResponse({ status: 403, description: ORIGIN_403, schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 404,
    description:
      '`QUOTATION_NOT_FOUND` — no such quotation. `QUOTATION_VERSION_NOT_FOUND` — this ' +
      'quotation has no version with that id.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      '`QUOTATION_VERSION_NOT_SENDABLE` — the version is not a draft and is not the current ' +
      'sent one. `REQUEST_NOT_SENDABLE` — the request is not in a state a quotation can be ' +
      'sent from. `REQUEST_TRANSITION_STALE` — the request changed state first; nothing was ' +
      'written.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description: 'The validity policy has not been published. Nothing was written.',
    schema: ERROR_SCHEMA,
  })
  async sendVersion(@Param() params: QuotationVersionParams): Promise<AdminQuotationSentPayload> {
    return guardedQuotationSend(async () => {
      const view = await this.sender.send({
        quotationId: params.quotationId as QuotationId,
        versionId: params.versionId as QuotationVersionId,
      });
      return toSentPayload(view);
    });
  }
}

/**
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later: a customer id, a grant or a secure
 * token added for `APP6-B04` cannot reach this response by accident.
 *
 * Every amount crosses unchanged — no `Number()`, no `toFixed`, no rounding.
 * `Date` becomes an ISO-8601 string and `undefined` becomes `null`.
 */
function toSentPayload(view: QuotationSentView): AdminQuotationSentPayload {
  return {
    quotation: {
      quotationId: view.quotation.quotationId,
      quotationCode: view.quotation.quotationCode,
      customRequestId: view.quotation.customRequestId,
      quotationStatus: view.quotation.quotationStatus,
      currentVersionId: view.quotation.currentVersionId ?? null,
    },
    version: {
      versionId: view.version.versionId,
      version: view.version.version,
      status: view.version.status,
      quantityTotal: view.version.quantityTotal,
      stitchCount: view.version.stitchCount ?? null,
      currencyCode: view.version.currencyCode,
      subtotalAmount: view.version.subtotalAmount,
      manualAdjustmentAmount: view.version.manualAdjustmentAmount,
      adjustmentReason: view.version.adjustmentReason ?? null,
      shippingFeeAmount: view.version.shippingFeeAmount,
      totalAmount: view.version.totalAmount,
      depositPercent: view.version.depositPercent,
      depositAmount: view.version.depositAmount,
      remainingAmount: view.version.remainingAmount,
      validFrom: view.version.validFrom?.toISOString() ?? null,
      validUntil: view.version.validUntil?.toISOString() ?? null,
      sentAt: view.version.sentAt?.toISOString() ?? null,
      acceptedAt: view.version.acceptedAt?.toISOString() ?? null,
      supersededAt: view.version.supersededAt?.toISOString() ?? null,
      expiredAt: view.version.expiredAt?.toISOString() ?? null,
      createdAt: view.version.createdAt.toISOString(),
      current: view.version.current,
    },
    lineItems: view.lineItems.map((line) => ({
      position: line.position,
      lineKind: line.lineKind,
      description: line.description,
      skuId: line.skuId ?? null,
      quantity: line.quantity,
      unitPriceAmount: line.unitPriceAmount,
      lineTotalAmount: line.lineTotalAmount,
    })),
    requestStatus: view.requestStatus,
    requestTransitioned: view.requestTransitioned,
    replayed: view.replayed,
  };
}
