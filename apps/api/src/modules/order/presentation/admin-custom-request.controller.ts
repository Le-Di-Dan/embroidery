/**
 * The two Admin request reads (`APP5-B04`).
 *
 * ```text
 * GET /api/admin/custom-requests              — adminCustomRequest_list
 * GET /api/admin/custom-requests/{requestId}  — adminCustomRequest_detail
 * ```
 *
 * Two, and no third. Moderation notes and the transition history are returned
 * *inside* the detail rather than as separate collections (§3): they are
 * evidence an operator reads with the request, not resources addressed on their
 * own, and publishing `/notes` now would fix a URL `APP5-B05` has to write to
 * before it knows what appending one looks like.
 *
 * There is no mutation here — no transition, no note append, no cancel, reject
 * or clarify, and no grant issue. The class holds two collaborators and both are
 * queries.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` is the exact guard `GET /api/staff/me` and every
 * Admin catalogue, template and customer-support route already use. This
 * controller parses no cookie, looks up no session and accepts no
 * caller-supplied Admin id: the operator's identity is derived server-side by
 * the guard and is never a parameter (§4). There is no role check because there
 * is no role model — APP1-B01 is a binary authenticated-admin gate, and
 * inventing a permission matrix here would be a security model with no authority
 * behind it.
 *
 * Both routes are `GET`, and both are safe: the queue's filters are query
 * parameters because none of them is a secret — a request code, a status, a
 * date range — with one exception. `contact` **is** a real person's address, so
 * it is documented as the one parameter an operator should expect to see in a
 * gateway access log, and it is never echoed back in the response.
 */
import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiSuccessCode } from '../../../platform/http-response/api-envelope.decorators';
import {
  ENVELOPE_SCHEMA_NAMES,
  envelopeSchemaOf,
} from '../../../openapi/envelope-schema.augmentation';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import {
  ReadAdminRequestDetail,
  type AdminRequestDetailView,
} from '../application/admin/read-admin-request-detail.query';
import {
  ReadAdminRequestQueue,
  type AdminRequestQueueView,
} from '../application/admin/read-admin-request-queue.query';
import { guardedAdminRequestRead } from '../domain/admin/admin-request-read.errors';
import {
  AdminCatalogSubjectResponse,
  AdminCustomRequestDetailResponse,
  AdminCustomerOwnedSubjectResponse,
  AdminRequestAssetResponse,
  AdminRequestContactResponse,
  AdminRequestCustomerResponse,
  AdminRequestModerationNoteResponse,
  AdminRequestQuantityLineResponse,
  AdminRequestTransitionResponse,
  type AdminCustomRequestDetailPayload,
} from './schemas/admin-custom-request-detail.response';
import {
  AdminCustomRequestQueueItemResponse,
  AdminCustomRequestQueueResponse,
  PUBLISHED_REQUEST_STATES,
  type AdminCustomRequestQueueViewPayload,
} from './schemas/admin-custom-request-queue.response';
import {
  AdminCustomRequestIdParam,
  ListAdminCustomRequestsQuery,
  REQUEST_SUBJECT_KINDS,
  listAdminCustomRequestsQuerySchema,
} from './schemas/admin-custom-request.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

/** A moderation queue must never be cached by a shared proxy. */
const ADMIN_REQUEST_CACHE_CONTROL = 'no-store';

@ApiTags('adminCustomRequest')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminCustomRequestQueueResponse,
  AdminCustomRequestQueueItemResponse,
  AdminCustomRequestDetailResponse,
  AdminRequestCustomerResponse,
  AdminRequestContactResponse,
  AdminCatalogSubjectResponse,
  AdminCustomerOwnedSubjectResponse,
  AdminRequestQuantityLineResponse,
  AdminRequestAssetResponse,
  AdminRequestTransitionResponse,
  AdminRequestModerationNoteResponse,
)
export class AdminCustomRequestController {
  constructor(
    private readonly queue: ReadAdminRequestQueue,
    private readonly details: ReadAdminRequestDetail,
  ) {}

  @Get()
  @Header('Cache-Control', ADMIN_REQUEST_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOM_REQUEST_QUEUE_READ', 'Custom request queue retrieved.')
  @ApiOperation({
    summary: 'List custom requests for triage',
    description:
      'Keyset-paginated, newest first, with a stable `id` tie-breaker so a page boundary cannot ' +
      'repeat or skip a row under concurrent submissions. There is no offset paging and no ' +
      'total count. With no `status` filter the page carries the pre-quotation triage set — ' +
      'NEW, UNDER_REVIEW and NEEDS_CLARIFICATION — and `appliedStatuses` states which ones were ' +
      'used; naming any canonical status explicitly returns it truthfully, including the APP6 ' +
      'states this surface offers no action in. The customer filter is an **exact** contact ' +
      'lookup, normalized by the canonical rules: there is no partial, prefix or fuzzy search, ' +
      'and a contact matching nobody returns an empty page rather than an error.',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous page.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    isArray: true,
    enum: PUBLISHED_REQUEST_STATES,
    description: 'Repeatable. Defaults to the triage set when omitted.',
  })
  @ApiQuery({ name: 'subjectKind', required: false, enum: REQUEST_SUBJECT_KINDS })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'One whole request code, matched exactly. Case is normalized.',
  })
  @ApiQuery({ name: 'submittedFrom', required: false, schema: { format: 'date-time' } })
  @ApiQuery({ name: 'submittedTo', required: false, schema: { format: 'date-time' } })
  @ApiQuery({
    name: 'contactKind',
    required: false,
    enum: ['EMAIL', 'PHONE'],
    description: 'Required together with `contact`.',
  })
  @ApiQuery({
    name: 'contact',
    required: false,
    description:
      'One exact email or phone number. Matched whole against verified, current contacts and ' +
      'never echoed in the response.',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of requests awaiting triage.',
    schema: envelopeSchemaOf(AdminCustomRequestQueueResponse),
  })
  @ApiResponse({ status: 400, description: 'Invalid cursor or filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  async list(
    @Query() query: ListAdminCustomRequestsQuery,
  ): Promise<AdminCustomRequestQueueViewPayload> {
    // The global pipe already validated this query against the same schema; the
    // second parse is the *TypeScript* narrowing boundary, not a second semantic
    // authority. Both use one schema, so the two can never disagree.
    const input = listAdminCustomRequestsQuerySchema.parse(query);

    return guardedAdminRequestRead(async () =>
      toQueuePayload(
        await this.queue.list({
          cursor: input.cursor,
          limit: input.limit,
          statuses: input.status,
          subjectKind: input.subjectKind,
          code: input.code,
          submittedFrom:
            input.submittedFrom === undefined ? undefined : new Date(input.submittedFrom),
          submittedTo: input.submittedTo === undefined ? undefined : new Date(input.submittedTo),
          contactKind: input.contactKind,
          contact: input.contact,
        }),
      ),
    );
  }

  @Get(':requestId')
  @Header('Cache-Control', ADMIN_REQUEST_CACHE_CONTROL)
  @ApiSuccessCode('ADMIN_CUSTOM_REQUEST_DETAIL_READ', 'Custom request retrieved.')
  @ApiOperation({
    summary: 'Get one custom request with its moderation evidence',
    description:
      'Everything an operator needs to decide the next moderation action: the request root, the ' +
      'customer with masked contacts, the single subject branch — a catalog product with its ' +
      'variant and design-session provenance, or the customer-owned item with its dimensions — ' +
      'the quantity breakdown, the attachment metadata, the full transition history and the ' +
      'internal moderation notes. It is a read: nothing is written, no status moves and no ' +
      'audit event is appended. The internal and customer-visible reasons are separate fields ' +
      'and stay separate. No token, digest, session secret or object-storage key appears ' +
      'anywhere in the response, and no action is offered — `APP5-B05` owns the transitions. ' +
      'The one APP6 field is `quotationId`: a locator saying whether this request has a ' +
      'quotation and where `APP6-B02` can be asked about it, with no price, version or state.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The request and its moderation evidence.',
    schema: envelopeSchemaOf(AdminCustomRequestDetailResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  async detail(
    @Param() params: AdminCustomRequestIdParam,
  ): Promise<AdminCustomRequestDetailPayload> {
    return guardedAdminRequestRead(async () =>
      toDetailPayload(await this.details.read(params.requestId)),
    );
  }
}

/**
 * The queue projection.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later.
 */
function toQueuePayload(view: AdminRequestQueueView): AdminCustomRequestQueueViewPayload {
  return {
    items: view.items.map((item) => ({
      requestId: item.requestId,
      code: item.code,
      status: item.status,
      subjectKind: item.subjectKind,
      subjectSummary: item.subjectSummary,
      customerId: item.customerId,
      customerDisplayName: item.customerDisplayName,
      submittedAt: item.submittedAt.toISOString(),
      totalQuantity: item.totalQuantity,
    })),
    nextCursor: view.nextCursor,
    hasNext: view.hasNext,
    appliedStatuses: view.appliedStatuses,
  };
}

/** The detail projection. Same rule: an internal field has nowhere to land. */
function toDetailPayload(view: AdminRequestDetailView): AdminCustomRequestDetailPayload {
  return {
    requestId: view.requestId,
    code: view.code,
    status: view.status,
    submittedAt: view.submittedAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    customerNote: view.customerNote,
    internalReason: view.internalReason,
    customerVisibleReason: view.customerVisibleReason,
    customer:
      view.customer === undefined
        ? undefined
        : {
            customerId: view.customer.customerId,
            displayName: view.customer.displayName,
            verifiedAt: view.customer.verifiedAt.toISOString(),
            contacts: view.customer.contacts.map((contact) => ({
              kind: contact.kind,
              maskedValue: contact.maskedValue,
              verified: contact.verified,
              primary: contact.primary,
            })),
          },
    subject: view.subject,
    quantities: view.quantities.map((line) => ({
      productVariantId: line.productVariantId,
      sizeLabel: line.sizeLabel,
      quantity: line.quantity,
    })),
    totalQuantity: view.totalQuantity,
    assets: view.assets.map((asset) => ({
      assetId: asset.assetId,
      role: asset.role,
      linkedAt: asset.linkedAt.toISOString(),
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      status: asset.status,
    })),
    transitions: view.transitions.map((transition) => ({
      sequence: transition.sequence,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorKind: transition.actorKind,
      actorAdminId: transition.actorAdminId,
      actorCustomerId: transition.actorCustomerId,
      internalReason: transition.internalReason,
      customerVisibleReason: transition.customerVisibleReason,
      occurredAt: transition.occurredAt.toISOString(),
    })),
    moderationNotes: view.moderationNotes.map((note) => ({
      sequence: note.sequence,
      kind: note.kind,
      note: note.note,
      adminId: note.adminId,
      createdAt: note.createdAt.toISOString(),
    })),
    // `undefined` becomes an explicit `null`: the field is published as always
    // present, and a key the serializer dropped would read as "not in this
    // version of the contract" rather than "this request has no quotation".
    quotationId: view.quotationId ?? null,
  };
}
