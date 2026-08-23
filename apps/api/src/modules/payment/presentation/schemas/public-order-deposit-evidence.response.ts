/**
 * The published response shapes for customer transfer evidence (`APP7-B05` §18,
 * §27, §36).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one a browser holding a valid secure link is allowed
 * to see. The runtime views live beside the services that build them — one file
 * carrying both would make it easy to add a property to the response and forget
 * the schema, or the reverse.
 *
 * ### What is absent, and why each absence matters
 *
 * **Storage.** No `storageKey`, `objectKey`, `bucket`, `url`, `previewUrl`,
 * `thumbnailUrl`, `checksum` or content fingerprint. The stored idempotency
 * record carries several of those because a replay needs them; none is
 * projected, and this checkpoint publishes no binary route for one to point at.
 *
 * **Inspection internals.** No scanner name, no detector verdict, no failure
 * detail, no `inspectedAt`, no inspection event id. `assetStatus` says how far
 * the file has got and nothing about how that was decided.
 *
 * **Credentials and identity.** No token, digest, `grantId`, `stepUpChallengeId`,
 * `customerId`, `customRequestId`, `orderId`, `paymentObligationId`,
 * `attemptId`, `assetId` or idempotency key. The response echoes back nothing
 * that was presented to obtain it.
 *
 * **Payment.** No amount, currency, obligation status, order status, attempt
 * status, reconciliation, verification, refund or provider field. Uploading a
 * screenshot changes none of those, so a shape that mentioned one would invite
 * the reader to believe it had.
 *
 * ### `evidenceId` is the association, not the asset
 *
 * `payment_transfer_evidence.id`. The asset id is not published: no customer
 * operation takes one — this checkpoint adds no delete, no replace and no
 * content read — so it would be an identifier handed out for nothing.
 *
 * ### The upload response never claims more than happened
 *
 * `assetStatus` is `INSPECTING` there, always, because Tx B has just queued the
 * inspection and the inspector has not run. There is no `accepted`, `verified`,
 * `paid` or `confirmed` property and none could be added truthfully: inspection
 * is asynchronous, and only accepted Admin verification (`APP7-B04`) establishes
 * that money arrived.
 */
import { ApiProperty } from '@nestjs/swagger';

import { ACCEPTED_MEDIA_TYPES } from '../../../asset/domain/asset-intake.policy';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../../domain/evidence/transfer-evidence.policy';

const EVIDENCE_ID_EXAMPLE = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';

/** The four states a customer is entitled to distinguish. */
const PUBLIC_STATUSES = ['UPLOADED', 'INSPECTING', 'ACCEPTED', 'REJECTED'] as const;

const BYTE_SIZE = {
  example: 51_200,
  description: 'Server-measured size in bytes. Never the value a client declared.',
} as const;

export class TransferEvidenceUploadResponse {
  @ApiProperty({
    format: 'uuid',
    example: EVIDENCE_ID_EXAMPLE,
    description:
      'This submission’s own id. It identifies the image among the ones already submitted ' +
      'for this attempt; there is no operation that takes it back.',
  })
  evidenceId!: string;

  @ApiProperty({
    enum: ['INSPECTING'],
    example: 'INSPECTING',
    description:
      'Inspection has been queued, not completed. The image is recorded as submitted; ' +
      'whether it is usable is answered later by the status operation.',
  })
  assetStatus!: string;

  @ApiProperty({ enum: ACCEPTED_MEDIA_TYPES, example: 'image/png' })
  mediaType!: string;

  @ApiProperty(BYTE_SIZE)
  byteSize!: number;

  @ApiProperty({
    example: false,
    description:
      'True when this response replayed an earlier identical upload. A replay writes no ' +
      'second image, no second submission and no second inspection.',
  })
  replayed!: boolean;
}

export class TransferEvidenceItemResponse {
  @ApiProperty({ format: 'uuid', example: EVIDENCE_ID_EXAMPLE })
  evidenceId!: string;

  @ApiProperty({
    enum: PUBLIC_STATUSES,
    example: 'ACCEPTED',
    description:
      'How far inspection has got. REJECTED is terminal for the image and means only that ' +
      'the file was refused — it is not a failed payment, and it changes nothing about the ' +
      'transfer or the order.',
  })
  assetStatus!: string;

  @ApiProperty({ enum: ACCEPTED_MEDIA_TYPES, example: 'image/jpeg' })
  mediaType!: string;

  @ApiProperty(BYTE_SIZE)
  byteSize!: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-23T09:15:00.000Z',
    description: 'When the image was submitted. Nothing ever updates it.',
  })
  createdAt!: string;
}

export class TransferEvidenceListResponse {
  @ApiProperty({
    type: [TransferEvidenceItemResponse],
    maxItems: MAX_EVIDENCE_PER_ATTEMPT,
    description:
      `Every image submitted for this one attempt, oldest first — between zero and ` +
      `${MAX_EVIDENCE_PER_ATTEMPT} of them, so there is no page cursor. An empty list is an ` +
      'ordinary case: transfer evidence is optional and a payment with none is verified in ' +
      'exactly the same way. A retry opens a new attempt, which starts with an empty list of ' +
      'its own.',
  })
  evidence!: TransferEvidenceItemResponse[];
}
