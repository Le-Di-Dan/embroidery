/**
 * The two Admin notification delivery operations (`APP4-B08`).
 *
 * ```text
 * GET  /api/admin/notification-intents                  — adminNotificationIntent_list
 * POST /api/admin/notification-intents/{intentId}/replay — adminNotificationIntent_replay
 * ```
 *
 * Two, and no third. There is no message-body view, no provider console, no
 * customer notification history and no template editor. There is also no
 * `/retry`: `retry` names what `APP4-W01` does automatically to the *same*
 * delivery, and this route creates a new one. IMP-D049 PO-10 locks three
 * contracts to three names precisely so an operator reading an audit trail can
 * tell which of them happened.
 *
 * ### Authentication is APP1's, unchanged
 *
 * `AuthenticatedAdminGuard` at controller level, so both handlers are behind it.
 * The replay mutation adds `StaffOriginGuard`, following the exact precedent of
 * `DELETE /api/staff/session`: APP1 applies the Origin allowlist to every staff
 * mutation, and the JSON content-type guard only to the ones that *carry a
 * body*. This one carries none, so requiring `application/json` would be a
 * ceremony with nothing to check.
 *
 * ### The replay takes no input but the path
 *
 * No body, no query, no header. Everything the replay needs — the template, the
 * channel, the masked recipient, the business reference, the sealed envelope —
 * is read from the persisted records, so there is no field through which a
 * caller could point a customer's credential at a different destination.
 */
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import {
  AdminNotificationIntentQuery,
  type AdminNotificationIntentView,
} from '../application/admin-notification-intent.query';
import {
  ReplayNotificationDeliveryUseCase,
  type ReplayNotificationDeliveryResult,
} from '../application/replay-notification-delivery.use-case';
import { ADMIN_NOTIFICATION_CACHE_CONTROL } from '../domain/replay/admin-notification.policy';
import { guardedReplayOperation } from '../domain/replay/manual-replay.errors';
import type { IntentId } from '../domain/repositories/notification-intent.repository';
import {
  AdminNotificationAttemptResponse,
  AdminNotificationIntentListResponse,
  AdminNotificationIntentResponse,
  NotificationReplayResponse,
  PUBLISHED_INTENT_STATES,
  type AdminNotificationIntentListPayload,
  type NotificationReplayPayload,
} from './schemas/admin-notification-intent.response';
import {
  ListNotificationIntentsQuery,
  NotificationIntentIdParam,
} from './schemas/admin-notification-intent.request';

const ERROR_SCHEMA = { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` };

@ApiTags('adminNotificationIntent')
@ApiCookieAuth('adminSession')
@Controller('admin/notification-intents')
@UseGuards(AuthenticatedAdminGuard)
// Registered once for the controller: referencing a component from a response is
// not the same as publishing it, and without this the document carries dangling
// `$ref`s the generated client cannot name.
@ApiExtraModels(
  AdminNotificationAttemptResponse,
  AdminNotificationIntentResponse,
  AdminNotificationIntentListResponse,
  NotificationReplayResponse,
)
export class AdminNotificationIntentController {
  constructor(
    private readonly query: AdminNotificationIntentQuery,
    private readonly replayer: ReplayNotificationDeliveryUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', ADMIN_NOTIFICATION_CACHE_CONTROL)
  @ApiSuccessCode('NOTIFICATION_INTENT_LIST_READ', 'Notifications retrieved.')
  @ApiOperation({
    summary: 'List notification deliveries',
    description:
      'The most recent notifications, newest first, optionally filtered to one lifecycle ' +
      'state. Answers "was it sent, and why did it fail" and nothing else: each entry carries ' +
      'the masked destination, the template used, and the append-only attempt timeline with a ' +
      'bounded failure class per attempt. There is no message body, no provider response, no ' +
      'recipient beyond the mask, and no search — the mask exists so an operator can recognise ' +
      'a destination, not look one up.',
  })
  @ApiQuery({ name: 'status', required: false, enum: PUBLISHED_INTENT_STATES })
  @ApiResponse({
    status: 200,
    description: 'One bounded page of notifications.',
    schema: envelopeSchemaOf(AdminNotificationIntentListResponse),
  })
  @ApiResponse({ status: 400, description: 'Unknown status filter.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  async list(
    @Query() query: ListNotificationIntentsQuery,
  ): Promise<AdminNotificationIntentListPayload> {
    return toListPayload(
      await this.query.list({
        ...(query.status === undefined ? {} : { status: query.status }),
      }),
    );
  }

  /**
   * 200, not 201 and not 202.
   *
   * Not 201, because a duplicate replay creates nothing and returns the record
   * that already exists — the operation is idempotent, and answering "Created"
   * to a call that created nothing would be false. Not 202, because no Admin
   * async-operation convention exists in this repository to follow; 200 is the
   * canonical code its guarded POST mutations already use.
   */
  @Post(':intentId/replay')
  @UseGuards(StaffOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiSuccessCode('NOTIFICATION_DELIVERY_REPLAYED', 'Delivery replayed.')
  @ApiOperation({
    summary: 'Replay a failed notification delivery',
    description:
      'Re-sends an existing notification whose delivery failed terminally. This is a ' +
      '**transport** replay: the original code or link is re-delivered exactly as it was ' +
      'sealed, and nothing new is minted. The original notification stays FAILED and its ' +
      'dead-lettered delivery record is left untouched — a new notification is created ' +
      'instead, with a fresh delivery budget. Replaying twice returns the same replay rather ' +
      'than sending again. If the code or link is no longer valid, the request is refused with ' +
      '`REISSUE_REQUIRED` and the operator must issue a new one through the customer flow.',
  })
  @ApiParam({ name: 'intentId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'The replay notification, queued for delivery.',
    schema: envelopeSchemaOf(NotificationReplayResponse),
  })
  @ApiResponse({ status: 400, description: 'Malformed notification id.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'No live Admin session.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'The request states an origin outside the Admin allowlist.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No such notification.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 409,
    description:
      '`REPLAY_NOT_APPLICABLE` — the notification did not fail delivery, so there is nothing ' +
      'to replay. `REISSUE_REQUIRED` — the code or link it carries has expired, been used, ' +
      'been revoked or been superseded; issue a new one instead. ' +
      '`REPLAY_SOURCE_UNAVAILABLE` — there is no single dead-lettered delivery record to ' +
      'replay from.',
    schema: ERROR_SCHEMA,
  })
  async replay(@Param() params: NotificationIntentIdParam): Promise<NotificationReplayPayload> {
    return guardedReplayOperation(async () =>
      toReplayPayload(await this.replayer.replay({ intentId: params.intentId as IntentId })),
    );
  }
}

/**
 * The list projection.
 *
 * A function whose return type has nowhere to put `params`, an envelope, a
 * provider body, a contact-point id or a raw recipient — so no later edit to the
 * view can leak one without also changing this function.
 */
function toListPayload(
  intents: readonly AdminNotificationIntentView[],
): AdminNotificationIntentListPayload {
  return {
    intents: intents.map((intent) => ({
      intentId: intent.intentId,
      status: intent.status,
      channel: intent.channel,
      recipientMasked: intent.recipientMasked,
      templateKey: intent.templateKey,
      templateVersion: intent.templateVersion,
      createdAt: intent.createdAt.toISOString(),
      attempts: intent.attempts.map((attempt) => ({
        attemptedAt: attempt.attemptedAt.toISOString(),
        channel: attempt.channel,
        outcome: attempt.outcome,
        ...(attempt.errorClass === undefined ? {} : { errorClass: attempt.errorClass }),
      })),
    })),
  };
}

/**
 * The replay projection. Two fields, and `created` is deliberately dropped:
 * whether this call or an earlier one made the replay is an implementation
 * detail of idempotency, and publishing it would invite a client to branch on it.
 */
function toReplayPayload(result: ReplayNotificationDeliveryResult): NotificationReplayPayload {
  return { replayIntentId: result.replayIntentId, status: result.status };
}
