/**
 * What the Admin design-version send returns (`APP6-B09` §18).
 *
 * A small class of its own rather than a reuse of `APP6-B08`'s
 * `DesignVersionResponse`. That one is a **history row**: it publishes the whole
 * placement, both branches' nullable field groups, a `current` marker and the
 * recorded review outcomes, and it deliberately carries no `documentHash`
 * because a draft has none. A send reports the opposite selection — the hash it
 * just created, the request state it just projected, and what it superseded —
 * and bending the list DTO to carry those would put four always-null fields on
 * every history row to serve one mutation.
 *
 * ### Every nullable-free field states its type
 *
 * There is nothing optional here: a committed send has a hash, an instant and a
 * status, and a replay reports the ones the earlier send committed. The one
 * collection is an array that is simply empty when nothing was superseded, so no
 * client has to distinguish "absent" from "none".
 *
 * ### What is absent
 *
 * No design document, no element, no customer text. No storage key, derivative
 * id, preview hash or provider reference. No customer id, contact, secure link,
 * grant id, token or step-up challenge. No Approval Snapshot and no agreement:
 * those are `APP6-B10`/`B11`, and a field here would be a surface for them to
 * leak through before they exist.
 */
import { ApiProperty } from '@nestjs/swagger';

const REQUEST_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6070';
const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CASE_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';

export class DesignVersionSentResponse {
  @ApiProperty({ format: 'uuid', example: REQUEST_ID_EXAMPLE })
  requestId!: string;

  @ApiProperty({ format: 'uuid', example: CASE_ID_EXAMPLE })
  designCaseId!: string;

  @ApiProperty({ format: 'uuid', example: VERSION_ID_EXAMPLE })
  versionId!: string;

  @ApiProperty({ example: 1, description: 'Monotonic within the design case.' })
  version!: number;

  @ApiProperty({
    enum: ['SENT_FOR_REVIEW'],
    description:
      'LC-08 state after the send. Always `SENT_FOR_REVIEW` — a send that could not reach it ' +
      'refuses instead, and nothing partial is committed.',
  })
  versionStatus!: string;

  @ApiProperty({
    enum: ['DESIGN_REVIEW'],
    description:
      'The request’s LC-11 state after the send. Reported, never commanded: `DESIGN_REVIEW` is ' +
      'reached only as a projection of this committed send (`TR-LC11-08`), and no request body ' +
      'exists through which a caller could name it.',
  })
  requestStatus!: string;

  @ApiProperty({
    description:
      'True when this send projected `TR-LC11-08` (the request was `DIGITIZING`). False for a ' +
      'revision send on a request already in `DESIGN_REVIEW`: LC-11 has no self-transition, so ' +
      'no transition row was appended.',
  })
  requestTransitioned!: boolean;

  @ApiProperty({
    enum: ['CATALOG', 'CUSTOMER_OWNED'],
    description:
      'The frozen placement branch, derived from the persisted row. A version can never switch ' +
      'branch at send; a disagreement refuses.',
  })
  branch!: string;

  @ApiProperty({
    example: 1,
    description: 'The stored document’s schema version, unchanged by the send.',
  })
  documentSchemaVersion!: number;

  @ApiProperty({
    example: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    description:
      'SHA-256 over the canonical (JCS) bytes of the **persisted** document, computed at send ' +
      'and stored on the version. This is the exact value an approval is later bound to ' +
      '(`GRD-007`). No caller-supplied hash is accepted anywhere.',
  })
  documentHash!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'The committed send instant.' })
  sentAt!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'The versions this send marked `SUPERSEDED` under `TR-LC08-05` — revision-requested ' +
      'predecessors on the same design case. Empty when there were none, and always empty on a ' +
      'replay. A version already awaiting review is never superseded to make room: that is ' +
      '`REVIEW_ALREADY_ACTIVE`.',
  })
  supersededVersionIds!: string[];

  @ApiProperty({
    description:
      'True when this exact version was already the one awaiting review, so the call replayed ' +
      'the committed result and wrote nothing — no re-hash, no new instant, no transition, no ' +
      'audit row and no notification.',
  })
  replayed!: boolean;
}

export interface DesignVersionSentPayload {
  readonly sent: DesignVersionSentResponse;
}
