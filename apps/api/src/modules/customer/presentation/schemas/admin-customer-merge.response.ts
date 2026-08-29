/**
 * What the merge lifecycle operations return (`APP10-B02` §7, §14).
 *
 * Two Customer cards, the case's own facts, and six counts. The absences are the
 * contract.
 *
 * **No raw, normalized or display contact value.** `maskedValue` is the only
 * representation of a contact anywhere here, produced by `APP4-P01`'s
 * `maskContact` inside Customer's own adapter before it reaches this layer. A
 * merge screen shows two people side by side, which is precisely the screen on
 * which a raw address would be most tempting and most damaging: it is the one
 * place an operator sees two customers' contacts at once.
 *
 * **No `contactId` on a merge participant.** `APP4-B07`'s reasoning, applied
 * again: an id is published when an operation is addressed by it, and no B02
 * operation addresses a contact. `APP10-B01` publishes one on the *support*
 * detail read because promote and deactivate need it; nothing here does.
 *
 * **No `notes`.** The operator's internal note is maintained on the support
 * surface and read back there. A merge comparison does not need it, and a second
 * publication of free text an operator typed is a second place it can leak from.
 *
 * **No `mergedIntoCustomerId` and no `anonymizedAt`.** Both participants are
 * proven live before a case is opened, and republishing the tombstone pointer
 * would invite a client to follow a merge chain the API deliberately refuses to
 * follow.
 *
 * **No credential of any kind.** No session, no verification code or digest, no
 * grant token or `token_hash`, no pepper. None is reachable from the query
 * behind this schema.
 *
 * **No list of the rows a merge would move.** The consequence preview publishes
 * counts. A list of a customer's orders, requests or assets would put three
 * other contexts' projections inside a Customer response, each with its own
 * fields to keep out, and an operator deciding whether two identities are one
 * person needs to know *how much* moves — not what each row says. Counts also
 * carry no PII, which is the point.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { ContactKind, CustomerMergeCaseState } from '@embroidery/database';

const CASE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6090';
const CUSTOMER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

/**
 * The published contact kinds and merge states.
 *
 * Declared here rather than imported as values, on the rule
 * `admin-customer-support.response.ts` records: the schema package re-exports
 * its unions as **types only**, so a presentation file cannot take the runtime
 * tuple without pulling an ORM value into the API's domain-facing layer.
 * `satisfies` and the completeness type below tie both directions to the
 * canonical unions, so neither an invented member nor a forgotten one compiles.
 */
const PUBLISHED_CONTACT_KINDS = ['EMAIL', 'PHONE'] as const satisfies readonly ContactKind[];

const PUBLISHED_MERGE_STATES = [
  'REQUESTED',
  'EXECUTED',
  'REJECTED',
] as const satisfies readonly CustomerMergeCaseState[];

/** Compile-time proof the published list omits no canonical state. */
export type PublishedMergeStatesAreComplete =
  Exclude<CustomerMergeCaseState, (typeof PUBLISHED_MERGE_STATES)[number]> extends never
    ? true
    : never;

export class MergeParticipantContactResponse {
  @ApiProperty({ enum: PUBLISHED_CONTACT_KINDS, example: 'EMAIL' })
  kind!: ContactKind;

  @ApiProperty({
    example: 'a***@vidu.com',
    description:
      'The masked contact, and the only form of it this API publishes. Deterministic and ' +
      'one-way, so an operator can recognise the same contact across two Customer cards ' +
      'without either address being disclosed.',
  })
  maskedValue!: string;

  @ApiProperty({ example: true, description: 'Whether this contact completed a challenge.' })
  verified!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether this is the Customer’s primary contact.',
  })
  primary!: boolean;
}

export class MergeParticipantResponse {
  @ApiProperty({ example: CUSTOMER_ID_EXAMPLE })
  customerId!: string;

  @ApiProperty({
    required: false,
    example: 'Nguyễn Minh An',
    description:
      'What this Customer calls themselves. Absent when they never supplied one, and never a ' +
      'substitute for the identifier — two Customers sharing a name is exactly the situation ' +
      'that produces a merge case.',
  })
  displayName?: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-14T09:00:00.000Z',
    description: 'When this identity was established. A Customer exists only verified.',
  })
  verifiedAt!: string;

  @ApiProperty({
    type: [MergeParticipantContactResponse],
    description:
      'The Customer’s current contacts, primary first. Deactivated historical contacts are not ' +
      'listed here — they are counted in the consequence preview, which is where the number of ' +
      'rows a merge moves belongs.',
  })
  contacts!: MergeParticipantContactResponse[];
}

/**
 * The published execution outcomes (APP10-B03 §19).
 *
 * Two values, on the precedent `adminNotificationIntent_replay` set with
 * CREATED / EXISTING: a replay of a merge that already happened is a success, and
 * the client is told which of the two it got, so an operator is never shown a
 * confirmation for work this request did not do.
 */
const PUBLISHED_MERGE_OUTCOMES = ['EXECUTED', 'ALREADY_EXECUTED'] as const;

export type AdminCustomerMergeOutcome = (typeof PUBLISHED_MERGE_OUTCOMES)[number];

/**
 * Business-profile readiness — the one preview member that describes **both**
 * Customers (`APP10-B03` §10.2).
 *
 * A bounded object rather than the `APP10-B02` boolean it replaces. At most one
 * profile may exist per Customer, so a merge whose two sides both have one cannot
 * be executed at all, and an operator has to see that before confirming rather
 * than as a refusal at the end of the workflow. The field is evolved rather than
 * joined by a second one beside it: two members answering overlapping questions
 * about one table is how a client comes to read the wrong one.
 *
 * Three flags and nothing else. No company name, no tax code, no billing contact:
 * all three are PII, none is needed to say that a conflict exists, and the query
 * behind this schema never selects them.
 */
export class MergeBusinessProfileReadinessResponse {
  @ApiProperty({
    example: true,
    description:
      'Whether the merged-away Customer has a business profile that would move to the ' +
      'surviving Customer.',
  })
  loserHasProfile!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether the surviving Customer already has one. At most one business profile may ' +
      'exist per Customer.',
  })
  survivorHasProfile!: boolean;

  @ApiProperty({
    example: false,
    description:
      'True when both Customers have a business profile. Executing the merge is refused ' +
      'while this holds — before anything is moved, revoked or tombstoned — because only a ' +
      'person can decide which profile is right.',
  })
  conflict!: boolean;
}

export class MergeConsequencePreviewResponse {
  @ApiProperty({
    example: 2,
    description:
      'Every contact point belonging to the merged-away Customer, deactivated ones included: ' +
      'each carries the Customer reference and each has to move.',
  })
  contactPoints!: number;

  @ApiProperty({
    example: 1,
    description:
      'The merged-away Customer’s ACTIVE secure access grants — the live links execution would ' +
      'revoke. Already expired or revoked grants open nothing and are not counted.',
  })
  activeSecureAccessGrants!: number;

  @ApiProperty({
    example: 3,
    description: 'Custom requests that would be repointed to the surviving Customer.',
  })
  customRequests!: number;

  @ApiProperty({
    example: 2,
    description: 'Orders that would be repointed to the surviving Customer.',
  })
  orders!: number;

  @ApiProperty({
    example: 5,
    description: 'Assets uploaded by the merged-away Customer that would be repointed.',
  })
  uploadedAssets!: number;

  @ApiProperty({
    type: MergeBusinessProfileReadinessResponse,
    description:
      'Whether a business profile would move, and whether it can. Both Customers are ' +
      'described: at most one profile may exist per Customer, so a merge whose two sides ' +
      'both have one is refused before anything is moved.',
  })
  businessProfile!: MergeBusinessProfileReadinessResponse;
}

export class AdminCustomerMergeCaseResponse {
  @ApiProperty({ example: CASE_ID_EXAMPLE })
  mergeCaseId!: string;

  @ApiProperty({
    enum: PUBLISHED_MERGE_STATES,
    example: 'REQUESTED',
    description:
      'REQUESTED until it is decided. REJECTED means an operator declined it and nothing was ' +
      'transferred. EXECUTED means the merge was performed.',
  })
  status!: CustomerMergeCaseState;

  @ApiProperty({
    example: 'Same person: the phone number was re-registered under a new email after a typo.',
    description: 'Why the operator opened this case. Their own words, stored once.',
  })
  reason!: string;

  @ApiProperty({
    example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6001',
    description: 'The Admin who opened the case, taken from their session, never from a body.',
  })
  requestedByAdminId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-28T09:00:00.000Z' })
  requestedAt!: string;

  @ApiProperty({
    required: false,
    format: 'date-time',
    example: '2026-08-28T10:15:00.000Z',
    description:
      'When the case left REQUESTED. Absent while it is still open. The operator’s reason for ' +
      'declining is not published here: the case carries one reason column and it holds why ' +
      'the case was raised, so the declining reason is recorded in the audit trail instead.',
  })
  decidedAt?: string;

  @ApiProperty({
    required: false,
    type: MergeParticipantResponse,
    description: 'The Customer that survives, with masked contacts.',
  })
  survivor?: MergeParticipantResponse;

  @ApiProperty({
    required: false,
    type: MergeParticipantResponse,
    description: 'The Customer that would be merged away, with masked contacts.',
  })
  loser?: MergeParticipantResponse;

  @ApiProperty({
    type: MergeConsequencePreviewResponse,
    description:
      'What executing this merge would attempt to move or revoke, counted from current rows on ' +
      'every read and stored nowhere. Advisory: rows arrive and leave between opening a case ' +
      'and executing it, and execution re-evaluates actual state inside its own transaction. ' +
      'Frozen commercial evidence — approval snapshots, quotation acceptances, design reviews, ' +
      'audit events and every append-only transition history — is deliberately excluded, ' +
      'because a merge never rewrites it.',
  })
  consequencePreview!: MergeConsequencePreviewResponse;
}

/**
 * What the execute operation publishes (`APP10-B03` §4).
 *
 * Three fields, and the absences are the contract: no count of what moved, no
 * list of the rows it touched, no Customer card and no contact of any kind. The
 * per-category counts are `customer_merge_events` — append-only evidence read
 * from the merge history, not from the response to the request that wrote it —
 * and the two Customers are read back through the detail operation, which a
 * client re-reads anyway to see the state it now has.
 */
export class AdminCustomerMergeExecutedResponse {
  @ApiProperty({ example: CASE_ID_EXAMPLE, description: 'The merge case that was executed.' })
  mergeCaseId!: string;

  @ApiProperty({
    enum: PUBLISHED_MERGE_STATES,
    example: 'EXECUTED',
    description:
      'Always EXECUTED — either this request performed the merge, or an earlier one had ' +
      'already performed it.',
  })
  status!: CustomerMergeCaseState;

  @ApiProperty({
    enum: PUBLISHED_MERGE_OUTCOMES,
    example: 'EXECUTED',
    description:
      'EXECUTED when this request performed the merge. ALREADY_EXECUTED when the case had ' +
      'already been executed and this request changed nothing: no ownership moved a second ' +
      'time, no access grant was revoked again, no Customer was tombstoned again, and ' +
      'neither a merge event nor an audit row was appended.',
  })
  outcome!: AdminCustomerMergeOutcome;
}

export class AdminCustomerMergeOpenedResponse {
  @ApiProperty({ example: CASE_ID_EXAMPLE, description: 'The merge case that was opened.' })
  mergeCaseId!: string;

  @ApiProperty({
    enum: PUBLISHED_MERGE_STATES,
    example: 'REQUESTED',
    description: 'Always REQUESTED. A case is born open and nothing has been transferred.',
  })
  status!: CustomerMergeCaseState;
}

/** The serialized participant projection. The only place its instant becomes a string. */
export interface MergeParticipantPayload {
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

export interface AdminCustomerMergeCasePayload {
  readonly mergeCaseId: string;
  readonly status: CustomerMergeCaseState;
  readonly reason: string;
  readonly requestedByAdminId: string;
  readonly requestedAt: string;
  readonly decidedAt?: string;
  readonly survivor?: MergeParticipantPayload;
  readonly loser?: MergeParticipantPayload;
  readonly consequencePreview: {
    readonly contactPoints: number;
    readonly activeSecureAccessGrants: number;
    readonly customRequests: number;
    readonly orders: number;
    readonly uploadedAssets: number;
    readonly businessProfile: {
      readonly loserHasProfile: boolean;
      readonly survivorHasProfile: boolean;
      readonly conflict: boolean;
    };
  };
}

export interface AdminCustomerMergeOpenedPayload {
  readonly mergeCaseId: string;
  readonly status: CustomerMergeCaseState;
}

export interface AdminCustomerMergeExecutedPayload {
  readonly mergeCaseId: string;
  readonly status: CustomerMergeCaseState;
  readonly outcome: AdminCustomerMergeOutcome;
}
