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
 * **No Business Profile, no merge history, no anonymization marker.** Named out
 * of scope; merge and anonymization are DB10/CC-27 concerns with no Admin
 * surface in this phase.
 *
 * **`displayName` is published, and it is the one identity field that is.** The
 * Product Owner authorized it for the A01 support screen, where it appears on
 * every approved Customer card: an operator answering a support ticket needs to
 * confirm they are looking at the right person, and a bare UUID does not let
 * them. It is the `customers.display_name` column and only that — never a
 * Business Profile company name, never a contact value used as a fallback, and
 * never derived from anything. It may be absent, because the column is nullable
 * and a Customer created from a verified contact alone has never supplied one.
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
    required: false,
    example: 'Nguyễn Minh An',
    description:
      'What this Customer calls themselves, from the Customer record alone. Absent when they ' +
      'never supplied one — a Customer exists from a verified contact, and a name is not part ' +
      'of that. It is not a Business Profile company name, not derived from a contact, and ' +
      'never a substitute for the identifier: two Customers may share a name.',
  })
  displayName?: string;

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
  readonly displayName?: string;
  readonly verifiedAt: string;
  readonly contacts: readonly {
    readonly kind: ContactKind;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}

/**
 * What the exact-contact resolver returns: one identifier.
 *
 * One field, and every absence is deliberate. The operation's whole job is to
 * turn a contact the operator already holds into the id the two support reads
 * need, so anything beyond that id would be a second projection of the Customer
 * competing with {@link AdminCustomerDetailResponse}.
 *
 * Specifically **not** here: the submitted contact in any form — raw, trimmed,
 * normalized *or masked*. Echoing even the mask would confirm to the caller
 * exactly which value matched, and returning the normalized form would hand back
 * the identity key the uniqueness arbiter is built on. Nor the
 * `contactPointId`, which addresses no operation; nor `displayName`, the
 * contacts or `verifiedAt`, which the detail read owns; nor any count, score or
 * "did you mean" hint, which would make a miss informative.
 *
 * A miss is a 404 carrying none of these, so the operation answers exactly one
 * question — *which Customer owns this exact verified contact* — and never the
 * question *does this address belong to anybody*, which it refuses to
 * distinguish from an unverified or deactivated one.
 */
export class AdminCustomerResolutionResponse {
  @ApiProperty({
    example: CUSTOMER_ID_EXAMPLE,
    description:
      'The Customer that owns the submitted contact. Exactly one, or a 404 — a verified ' +
      'contact belongs to one Customer by the uniqueness arbiter, so there is no list.',
  })
  customerId!: string;
}

/** The serialized resolver projection. Nowhere to put a contact. */
export interface AdminCustomerResolutionPayload {
  readonly customerId: string;
}
