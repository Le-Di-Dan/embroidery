/**
 * What a resolved secure link returns (`APP4-B06` §10).
 *
 * Three fields, and the absences are the contract.
 *
 * **No token and no digest.** The API never echoes the credential it was given —
 * an echo would put it in the response body, the browser's memory, any client
 * cache and every error reporter that captures responses.
 *
 * **No `grantId`.** No delivered consumer needs one: `APP4-S02` renders the
 * request this link opens, and `APP4-B07` is Admin-side with its own reads. An
 * id published here would be the natural thing for a later client to put in a
 * URL, which is how an opaque credential's identifier becomes a logged one.
 *
 * **No `customerId`.** Naming a customer would turn a token into a lookup into
 * the identity graph — the same rule `VerificationChallengeStatusResponse`
 * states for a challenge id.
 *
 * **No contact, no notification state, no audit, no revoke reason, no lineage.**
 * A resolved link says *which request* and *for how long*, and stops.
 *
 * **No APP5/APP6/APP7 business content.** No quotation, no design version, no
 * payment, no available actions. None of it exists yet, and B06 may not invent
 * a shape those phases will have to honour.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { GrantScopeKind } from '@embroidery/database';

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/**
 * The published scope set.
 *
 * Declared here rather than imported as a value, following the rule
 * `verification-challenge-status.response.ts` records: the schema package
 * re-exports its unions as **types only**, so a presentation file cannot take
 * the runtime tuple without pulling an ORM value into the API's domain-facing
 * layer. `satisfies` and {@link PublishedScopesAreComplete} tie both directions
 * to the canonical union, so neither an invented scope nor a forgotten one
 * compiles.
 */
const PUBLISHED_SCOPES = ['REQUEST_ACCESS'] as const satisfies readonly GrantScopeKind[];

/** Compile-time proof the published list omits no canonical scope. */
export type PublishedScopesAreComplete =
  Exclude<GrantScopeKind, (typeof PUBLISHED_SCOPES)[number]> extends never ? true : never;

export class SecureLinkResolutionResponse {
  @ApiProperty({
    example: REQUEST_ID_EXAMPLE,
    description: 'The custom request this link grants access to.',
  })
  customRequestId!: string;

  @ApiProperty({
    enum: PUBLISHED_SCOPES,
    example: 'REQUEST_ACCESS',
    description:
      'What the grant covers. One value today; a link never carries a per-action scope, and ' +
      'sensitive actions require a fresh step-up verification instead.',
  })
  scopeKind!: GrantScopeKind;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description:
      'When the link stops working. Absolute, never extended, and enforced on every read — a ' +
      'grant past this instant resolves for nobody whether or not a sweep has run.',
  })
  expiresAt!: string;
}

/** The serialized projection. The only place this instant becomes a string. */
export interface SecureLinkResolutionView {
  readonly customRequestId: string;
  readonly scopeKind: GrantScopeKind;
  readonly expiresAt: string;
}
