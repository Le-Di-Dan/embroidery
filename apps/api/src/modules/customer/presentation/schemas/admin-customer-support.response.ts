/**
 * What the Admin Customer support read returns (`APP4-B07` §6).
 *
 * Four fields per contact and two about the Customer, and the absences are the
 * contract.
 *
 * **No raw, normalized or display contact value.** `maskedValue` is the only
 * representation of a contact anywhere in this response. The normalized form is
 * the value the `(kind, value)` uniqueness arbiter is built on, which makes it a
 * lookup key into the identity graph; the display form is whatever the customer
 * typed. Neither is needed to answer "is this contact verified?", and publishing
 * either would turn a support screen into a contact database — the exact outcome
 * `ADR-APP4-001` §2.3 introduced masking to prevent.
 *
 * **No `contactPointId`.** B07 has no per-contact operation — no edit, no
 * verify, no unverify, no primary rotation — so an id here would address nothing
 * that exists, and would be the natural thing for a later client to put in a
 * URL.
 *
 * **No `verifiedSource`.** It names the mechanism that verified a contact, and
 * no locked support authority asks for it.
 *
 * **No Business Profile, no merge history, no anonymization marker, no
 * `displayName`.** Named out of scope; merge and anonymization are DB10/CC-27
 * concerns with no Admin surface in this phase.
 *
 * **No credential of any kind.** No session, no verification code or digest, no
 * grant token or `token_hash`, no pepper. None of them has a projection
 * anywhere in APP4 and none is reachable from the query behind this schema.
 *
 * **No notification data.** Intents, attempts, outbox rows and recipients are
 * `APP4-B08`'s, and this response path loads none of them.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { ContactKind } from '@embroidery/database';

const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

/**
 * The published contact kinds.
 *
 * Declared here rather than imported as a value, following the rule
 * `secure-link-resolution.response.ts` records: the schema package re-exports
 * its unions as **types only**, so a presentation file cannot take the runtime
 * tuple without pulling an ORM value into the API's domain-facing layer.
 * `satisfies` and {@link PublishedContactKindsAreComplete} tie both directions
 * to the canonical union, so neither an invented kind nor a forgotten one
 * compiles.
 */
const PUBLISHED_CONTACT_KINDS = ['EMAIL', 'PHONE'] as const satisfies readonly ContactKind[];

/** Compile-time proof the published list omits no canonical kind. */
export type PublishedContactKindsAreComplete =
  Exclude<ContactKind, (typeof PUBLISHED_CONTACT_KINDS)[number]> extends never ? true : never;

export class AdminCustomerContactResponse {
  @ApiProperty({
    enum: PUBLISHED_CONTACT_KINDS,
    example: 'EMAIL',
    description: 'Whether this contact is an email address or a phone number.',
  })
  kind!: ContactKind;

  @ApiProperty({
    example: 'a***@vidu.com',
    description:
      'The masked contact, and the only form of it this API publishes. Deterministic and ' +
      'one-way: the same contact always masks the same way, so an operator can recognise it ' +
      'across screens, and it can never be turned back into an address or a number.',
  })
  maskedValue!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether this contact has completed a verification challenge. An unverified contact ' +
      'belongs to the Customer but has never proven reachable, and nothing is delivered to it.',
  })
  verified!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether this is the Customer’s primary contact — the default destination for ' +
      'a notification. Exactly one contact per Customer carries it.',
  })
  primary!: boolean;
}

export class AdminCustomerDetailResponse {
  @ApiProperty({ example: CUSTOMER_ID_EXAMPLE, description: 'The Customer.' })
  customerId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:00:00.000Z',
    description:
      'When this Customer identity was established. A Customer exists only as the result of a ' +
      'successful verification, so the presence of this instant *is* the verification fact — ' +
      'there is no unverified Customer for it to be absent on.',
  })
  verifiedAt!: string;

  @ApiProperty({
    type: [AdminCustomerContactResponse],
    description:
      'The Customer’s current contacts, primary first. Deactivated historical contacts are ' +
      'not listed: this is current support visibility, not a contact history.',
  })
  contacts!: AdminCustomerContactResponse[];
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminCustomerDetailPayload {
  readonly customerId: string;
  readonly verifiedAt: string;
  readonly contacts: readonly {
    readonly kind: ContactKind;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}
