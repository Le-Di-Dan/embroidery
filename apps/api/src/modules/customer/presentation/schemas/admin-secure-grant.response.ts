/**
 * What the Admin grant list returns (`APP4-B07` §9).
 *
 * Five fields, and the absences are the contract.
 *
 * **No `token` and no `tokenHash`.** The token is never persisted at all, and
 * the digest — which looks like the safe half of the pair — is the exact value
 * `resolveActive` looks a grant up by (CST-008 / IDX-007). Publishing it to a
 * support screen would hand anyone who can read that screen, or its browser
 * cache, or a screenshot in a ticket, the lookup key for a live credential. It
 * is not selected by the repository read behind this schema, so it is not merely
 * omitted here — it never arrives.
 *
 * **No `revokeReason` and no `supersededByGrantId`.** The reason a previous
 * operator typed is audit-trail content, and the supersession pointer is another
 * grant's id. Neither is needed to answer "is this link still live?".
 *
 * **No recipient, no notification intent, attempt or outbox id.** `APP4-B08`
 * owns delivery visibility, and this response path joins none of those tables.
 *
 * **No APP5/APP6/APP7 business content.** `customRequestId` is published as an
 * opaque reference so an operator can correlate a link with a ticket; the
 * request's contents, its quotation, its designs and its payments are other
 * phases' and have no shape yet that B07 may pre-empt.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { GrantScopeKind, SecureAccessGrantState } from '@embroidery/database';

const GRANT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';

/**
 * The published scope set and state set.
 *
 * Declared here rather than imported as values, for the reason
 * `secure-link-resolution.response.ts` records: the schema package re-exports
 * its unions as types only, and a presentation file must not pull an ORM runtime
 * value in. The `satisfies` clauses and the two completeness proofs tie both
 * directions to the canonical unions.
 */
const PUBLISHED_SCOPES = ['REQUEST_ACCESS'] as const satisfies readonly GrantScopeKind[];
const PUBLISHED_STATES = [
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
] as const satisfies readonly SecureAccessGrantState[];

/** Compile-time proof neither published list omits a canonical member. */
export type PublishedGrantScopesAreComplete =
  Exclude<GrantScopeKind, (typeof PUBLISHED_SCOPES)[number]> extends never ? true : never;
export type PublishedGrantStatesAreComplete =
  Exclude<SecureAccessGrantState, (typeof PUBLISHED_STATES)[number]> extends never ? true : never;

export class AdminSecureGrantResponse {
  @ApiProperty({ example: GRANT_ID_EXAMPLE, description: 'The grant.' })
  grantId!: string;

  @ApiProperty({
    example: REQUEST_ID_EXAMPLE,
    description: 'The custom request this grant authorises access to. An opaque reference.',
  })
  customRequestId!: string;

  @ApiProperty({
    enum: PUBLISHED_SCOPES,
    example: 'REQUEST_ACCESS',
    description: 'What the grant covers. One value today; a grant carries no per-action scope.',
  })
  scopeKind!: GrantScopeKind;

  @ApiProperty({
    enum: PUBLISHED_STATES,
    example: 'ACTIVE',
    description:
      'The persisted lifecycle state. Read it together with `expiresAt`: expiry is enforced ' +
      'on every use rather than by a background sweep, so a grant may still be stored as ' +
      'ACTIVE after its `expiresAt` has passed and yet open nothing. ACTIVE **and** ' +
      '`expiresAt` in the future is the only combination that is still live.',
  })
  status!: SecureAccessGrantState;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description:
      'When the link stops working. Absolute and never extended; enforced on every read ' +
      'whatever the stored status says.',
  })
  expiresAt!: string;
}

export class AdminCustomerGrantsResponse {
  @ApiProperty({
    type: [AdminSecureGrantResponse],
    description:
      'Every grant belonging to this Customer, newest first, whatever its state — a revoked ' +
      'or expired grant is exactly what explains a link that stopped working. Scoped to the ' +
      'Customer in the path; there is no cross-Customer or global grant listing.',
  })
  grants!: AdminSecureGrantResponse[];
}

/** The serialized projection. The only place these instants become strings. */
export interface AdminCustomerGrantsPayload {
  readonly grants: readonly {
    readonly grantId: string;
    readonly customRequestId: string;
    readonly scopeKind: GrantScopeKind;
    readonly status: SecureAccessGrantState;
    readonly expiresAt: string;
  }[];
}
