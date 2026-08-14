/**
 * The one shape both `APP4-B04` operations answer with.
 *
 * The attempt endpoint and the status endpoint return the same component
 * because a successful attempt's answer *is* a status: the challenge is now
 * `VERIFIED`, and here is the expiry it kept. A second, near-identical response
 * class is how one of them later gains a field the other does not.
 *
 * Two facts plus the id. What is absent is the contract: **no code and no
 * digest**, no normalized or as-entered contact, no mask, no purpose, no
 * customer or contact-point id, no session id, no attempt count or history, no
 * notification, intent or outbox state, no policy object and no constraint
 * name. In particular:
 *
 * - **no `purpose`** — it would let anyone holding an id learn that a step-up
 *   was requested for that destination, which is a fact about the account's
 *   activity rather than about the caller;
 * - **no attempt count** — it would meter an attacker's remaining budget for
 *   them, and the client already knows how many times it has answered;
 * - **no `customerId`** — a status endpoint that named a customer would turn a
 *   challenge id into a lookup into the identity graph, and `APP4-B05` owns
 *   what a verified caller is allowed to do next.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { VerificationChallengeState } from '@embroidery/database';

const CHALLENGE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/**
 * The published LC-02 state set.
 *
 * Declared here rather than imported as a value, following the same rule
 * `admin-product-publication.response.ts` follows for `PRODUCT_STATES`: the
 * schema package re-exports its lifecycle unions as **types only**, so a
 * presentation file cannot take the runtime tuple without pulling an ORM value
 * into the API's domain-facing layer. `satisfies` and
 * {@link PublishedStatesAreComplete} tie both directions to the canonical union,
 * so neither an invented state nor a forgotten one compiles.
 */
const PUBLISHED_STATES = [
  'ISSUED',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const satisfies readonly VerificationChallengeState[];

/** Compile-time proof the published list omits no canonical state. */
export type PublishedStatesAreComplete =
  Exclude<VerificationChallengeState, (typeof PUBLISHED_STATES)[number]> extends never
    ? true
    : never;

export class VerificationChallengeStatusResponse {
  @ApiProperty({
    example: CHALLENGE_ID_EXAMPLE,
    description: 'The challenge this state describes.',
  })
  challengeId!: string;

  @ApiProperty({
    enum: PUBLISHED_STATES,
    example: 'ISSUED',
    description:
      'The lifecycle state. A challenge whose expiry has passed reads EXPIRED whether or not ' +
      'a sweep has run, so a client is never told to keep waiting on a code that can no ' +
      'longer be answered.',
  })
  state!: VerificationChallengeState;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:10:00.000Z',
    description: 'When the code stops being answerable. Absolute, and never extended.',
  })
  expiresAt!: string;
}

/** The serialized projection. The only place these instants become strings. */
export interface VerificationChallengeStatusView {
  readonly challengeId: string;
  readonly state: VerificationChallengeState;
  readonly expiresAt: string;
}
