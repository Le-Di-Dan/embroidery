/**
 * The two Admin moderation mutations (`APP5-B05`).
 *
 * ```text
 * POST /api/admin/custom-requests/{requestId}/moderation-notes — adminCustomRequest_appendNote
 * POST /api/admin/custom-requests/{requestId}/transitions      — adminCustomRequest_transition
 * ```
 *
 * Two, and no third. There is no route per transition — no `/reject`,
 * `/cancel`, `/clarify` or `/review` — because five endpoints doing one thing
 * each would put the lifecycle in the URL space, where every future state would
 * demand another path and no single handler could enforce the subset. One
 * `transitions` collection with a target in the body keeps the state machine in
 * `request-moderation.policy.ts`, which is the only place it can be tested as a
 * whole.
 *
 * There is no `PUT`, `PATCH` or `DELETE` on a note either. TBL-041 is
 * append-only (CST-098), and the surface says so by having no route that could
 * address a single note.
 *
 * ### One published domain, two classes
 *
 * `AdminCustomRequestController` (`APP5-B04`) holds the reads; this holds the
 * writes. They are separate classes because the read model must not be able to
 * reach `transition()` — B04's module deliberately does not import the AGG-13
 * write repository — and `CONTROLLER_DOMAIN_KEYS` maps both onto
 * `adminCustomRequest` so a module-boundary decision does not name a public
 * identifier. The two B04 operation ids are untouched.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, plus `StaffOriginGuard` and
 * `StaffJsonBodyGuard` on both handlers — the exact combination every Admin
 * mutation in this repository already uses, and both of these carry a body, so
 * the JSON content-type check has something to check. No cookie is parsed here,
 * no session is looked up, and neither handler accepts an operator identity:
 * the Admin id is bound by the guard and read from the request context inside
 * the use case.
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
import { AppendModerationNoteUseCase } from '../application/moderation/append-moderation-note.use-case';
import { TransitionCustomRequestUseCase } from '../application/moderation/transition-custom-request.use-case';
import { guardedModeration } from '../domain/moderation/request-moderation.errors';
import type { CustomRequestId } from '../domain/repositories/custom-request.repository';
import {
  AppendModerationNoteBody,
  ModerationRequestIdParam,
  TransitionCustomRequestBody,
} from './schemas/admin-custom-request-moderation.request';
import {
  ModerationNoteAppendedResponse,
  RequestTransitionedResponse,
  type ModerationNoteAppendedPayload,
  type RequestTransitionedPayload,
} from './schemas/admin-custom-request-moderation.response';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminCustomRequest')
@ApiCookieAuth('adminSession')
@Controller('admin/custom-requests')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(ModerationNoteAppendedResponse, RequestTransitionedResponse)
export class AdminCustomRequestModerationController {
  constructor(
    private readonly notes: AppendModerationNoteUseCase,
    private readonly transitions: TransitionCustomRequestUseCase,
  ) {}

  /**
   * 201, because a note append always creates a row.
   *
   * Unlike the transition below it has no idempotent branch and no "already
   * existed" outcome: two identical notes are two notes, which is what
   * append-only evidence means.
   */
  @Post(':requestId/moderation-notes')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiSuccessCode('MODERATION_NOTE_APPENDED', 'Moderation note appended.')
  @ApiOperation({
    summary: 'Append an internal moderation note',
    description:
      'Records one internal note against a request. The note is **internal**: it is never shown ' +
      'to the customer and never leaves the Admin surface. Notes are append-only — there is no ' +
      'route to edit or remove one, and a changed decision is a new note. This appends nothing ' +
      'else: the request does not move, no transition is recorded and no notification is ' +
      'raised. The operator, the sequence and the timestamp are all derived server-side.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: AppendModerationNoteBody })
  @ApiResponse({
    status: 201,
    description: 'The appended note.',
    schema: envelopeSchemaOf(ModerationNoteAppendedResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed request id or body.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async appendNote(
    @Param() params: ModerationRequestIdParam,
    @Body() body: AppendModerationNoteBody,
  ): Promise<ModerationNoteAppendedPayload> {
    return guardedModeration(async () =>
      toNotePayload(
        await this.notes.append({
          requestId: params.requestId as CustomRequestId,
          kind: body.kind,
          note: body.note,
        }),
      ),
    );
  }

  /**
   * 200, not 201.
   *
   * A transition creates evidence but the resource it addresses is the request,
   * which already existed and was moved rather than created. It follows the
   * repository's other guarded Admin state changes, which answer 200.
   */
  @Post(':requestId/transitions')
  @UseGuards(StaffOriginGuard, StaffJsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('CUSTOM_REQUEST_TRANSITIONED', 'Custom request moved.')
  @ApiOperation({
    summary: 'Move a custom request through an allowed moderation transition',
    description:
      'Performs one moderation decision. The state the request is moving **from** is read and ' +
      'locked by the server and is never sent: give only the target and the justification it ' +
      'requires. Taking a request into review, or back into review after a clarification, needs ' +
      'nothing and carries no message to the customer. Asking for clarification, rejecting and ' +
      'cancelling each require an internal reason and a separate customer-visible reason, and ' +
      'the first two also require a moderation note — `CLARIFY` for a clarification, `REJECT` ' +
      'or `SPAM` for a rejection. The two reason texts stay separate everywhere: only the ' +
      'customer-visible one ever reaches the customer. Cancellation is available only before a ' +
      'request has been quoted. The move, its note and the durable record of it commit ' +
      'together or not at all. If another operator moderated the request first, this is refused ' +
      'with `REQUEST_TRANSITION_STALE` — reload the request and decide again.',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: TransitionCustomRequestBody })
  @ApiResponse({
    status: 200,
    description: 'The move that was applied.',
    schema: envelopeSchemaOf(RequestTransitionedResponse),
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed request id or body, an unavailable target status, or a missing required ' +
      '`internalReason`, `customerVisibleReason` or moderation note.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such custom request.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      '`INVALID_TRANSITION` — that move is not available from the state this request is in. ' +
      '`REQUEST_TRANSITION_STALE` — the request was moderated by someone else in the meantime.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 415,
    description: 'Only application/json is accepted.',
    schema: ERROR_SCHEMA,
  })
  async transition(
    @Param() params: ModerationRequestIdParam,
    @Body() body: TransitionCustomRequestBody,
  ): Promise<RequestTransitionedPayload> {
    return guardedModeration(async () =>
      toTransitionPayload(
        await this.transitions.transition({
          requestId: params.requestId as CustomRequestId,
          to: body.toStatus,
          internalReason: body.internalReason,
          customerVisibleReason: body.customerVisibleReason,
          moderationNote: body.moderationNote,
          moderationNoteKind: body.moderationNoteKind,
        }),
      ),
    );
  }
}

/**
 * The note receipt.
 *
 * Written field by field rather than spread, so the serializer has nowhere to
 * put a property the view type gains later.
 */
function toNotePayload(view: {
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly adminId: string;
  readonly createdAt: Date;
  readonly requestStatus: string;
}): ModerationNoteAppendedPayload {
  return {
    requestId: view.requestId,
    sequence: view.sequence,
    kind: view.kind,
    adminId: view.adminId,
    createdAt: view.createdAt.toISOString(),
    requestStatus: view.requestStatus,
  };
}

/** The transition receipt. Same rule: an internal field has nowhere to land. */
function toTransitionPayload(view: {
  readonly requestId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly moderationNoteSequence: number | undefined;
  readonly occurredAt: Date;
}): RequestTransitionedPayload {
  return {
    requestId: view.requestId,
    fromStatus: view.fromStatus,
    toStatus: view.toStatus,
    ...(view.moderationNoteSequence === undefined
      ? {}
      : { moderationNoteSequence: view.moderationNoteSequence }),
    occurredAt: view.occurredAt.toISOString(),
  };
}
