/**
 * What the two Admin moderation mutations return (`APP5-B05` §4, §8).
 *
 * Both are receipts, not projections. Neither re-serves the request — the
 * operator already has `GET /api/admin/custom-requests/{requestId}` for that,
 * and answering a mutation with a whole detail would make this file a second
 * authority on what a request looks like, one `APP5-B04` would have to be kept
 * in step with forever.
 *
 * What is absent is the point. No customer id, no contact value, no grant, no
 * token, no digest, no storage key, no session secret, no correlation id, and no
 * APP6 field. The `adminId` on a note receipt is the operator's own, derived
 * server-side from their session — it is not an identity they learned here.
 *
 * The two reason texts appear on neither response. They were the operator's own
 * input a moment earlier, echoing them proves nothing, and a response object
 * carrying both is one refactor away from carrying them into a customer-facing
 * mapper.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  APP5_NOTE_KINDS,
  APP5_TRANSITION_TARGETS,
} from '../../domain/moderation/request-moderation.policy';

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const ADMIN_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0b';

export class ModerationNoteAppendedResponse {
  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({
    example: 3,
    description:
      'The append sequence the database assigned. Notes are append-only: this number never ' +
      'refers to a row that can be edited or removed.',
  })
  sequence!: number;

  @ApiProperty({ enum: APP5_NOTE_KINDS, example: 'NOTE' })
  kind!: string;

  @ApiProperty({
    format: 'uuid',
    example: ADMIN_ID_EXAMPLE,
    description: 'The operator, derived from their session. Never accepted from the request.',
  })
  adminId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T10:05:00.000Z' })
  createdAt!: string;

  @ApiProperty({
    example: 'UNDER_REVIEW',
    description:
      'The status the request still has. A note moves nothing and appends no transition, and ' +
      'this field is here so a client can see that rather than assume it.',
  })
  requestStatus!: string;
}

export class RequestTransitionedResponse {
  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({
    example: 'UNDER_REVIEW',
    description: 'The state the request was in. Read and locked by the server, never sent.',
  })
  fromStatus!: string;

  @ApiProperty({ enum: APP5_TRANSITION_TARGETS, example: 'NEEDS_CLARIFICATION' })
  toStatus!: string;

  @ApiPropertyOptional({
    example: 4,
    description: 'The note this decision filed, when it filed one.',
  })
  moderationNoteSequence?: number;

  @ApiProperty({ format: 'date-time', example: '2026-08-16T10:00:00.000Z' })
  occurredAt!: string;
}

export interface ModerationNoteAppendedPayload {
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly adminId: string;
  readonly createdAt: string;
  readonly requestStatus: string;
}

export interface RequestTransitionedPayload {
  readonly requestId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly moderationNoteSequence?: number | undefined;
  readonly occurredAt: string;
}
