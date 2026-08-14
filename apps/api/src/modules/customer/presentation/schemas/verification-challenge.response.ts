/**
 * The one shape both public verification operations answer with (`APP4-B03`).
 *
 * Issue and resend return the same component because they return the same fact:
 * a challenge is now open for you, here is when it dies and here is when you may
 * ask for another. Two hand-written copies is how one of them later gains a
 * field and the other silently stops describing what it sends.
 *
 * Three fields, and the third is the reason this is not just an id. Without
 * `resendAvailableAt` a Storefront would have to hard-code the 60-second
 * cooldown, which is a policy value the operator can change through an append —
 * and the UI would then be wrong with no code change anywhere near it.
 *
 * What is absent is the contract: **no code and no digest**, no normalized or
 * as-entered contact, no masked recipient, no customer or contact-point id, no
 * notification intent id, no outbox event id, no envelope, ciphertext or key
 * material, no attempt count, no policy object and no constraint name. Nothing
 * here differs between a target that belongs to a customer and one that does
 * not, and nothing distinguishes a challenge this call created from one it found
 * already open.
 */
import { ApiProperty } from '@nestjs/swagger';

const CHALLENGE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

export class VerificationChallengeResponse {
  @ApiProperty({
    example: CHALLENGE_ID_EXAMPLE,
    description:
      'The open challenge for this destination and purpose. The same value is returned ' +
      'while that challenge stays live.',
  })
  challengeId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:10:00.000Z',
    description: 'When the code stops being answerable. Absolute, and never extended.',
  })
  expiresAt!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:01:00.000Z',
    description:
      'The earliest instant a resend is accepted for this challenge, derived from the ' +
      'configured cooldown so a client never hard-codes it.',
  })
  resendAvailableAt!: string;
}

/** The serialized projection. The only place these instants become strings. */
export interface VerificationChallengeView {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
}
