/**
 * What the two customer design decisions return (`APP6-B11` §5).
 *
 * ### What is absent from both
 *
 * No Design Document and no element — the customer already has it, and echoing
 * the approved artwork back would put a second copy on the wire for no reader.
 * No agreement prose. No storage key, bucket, provider URL, derivative id,
 * preview hash or asset id: B11 renders nothing and streams nothing. No customer
 * id, contact, secure link, grant id, token or digest. No step-up challenge id —
 * it is server-derived, and returning it would hand a client the one value the
 * body deliberately refuses to accept. No design case id. No order id, payment
 * obligation, reservation or production job: APP6 stops at `design.approved`,
 * and a field here would be a surface for APP7's work to leak through before it
 * exists.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const VERSION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const SNAPSHOT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6075';
const HASH_EXAMPLE = 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

export class DesignApprovedResponse {
  @ApiProperty({
    format: 'uuid',
    example: VERSION_ID_EXAMPLE,
    description: 'The exact version that was approved — the one this request named.',
  })
  versionId!: string;

  @ApiProperty({ example: 3, description: 'The version number within this design case.' })
  version!: number;

  @ApiProperty({
    enum: schema.DESIGN_VERSION_STATES,
    example: 'APPROVED',
    description:
      'The stored LC-08 state after the move, read back off the row. An approved version is ' +
      'immutable from here: a later change is a new version, never an edit of this one.',
  })
  versionStatus!: string;

  @ApiProperty({
    format: 'uuid',
    example: SNAPSHOT_ID_EXAMPLE,
    description:
      'The Approval Snapshot this approval froze — the immutable evidence that authorises ' +
      'everything downstream, and the aggregate the `design.approved` event names. Exactly ' +
      'one exists per design version, and it is never updated or deleted.',
  })
  approvalSnapshotId!: string;

  @ApiProperty({
    example: HASH_EXAMPLE,
    description:
      'The document hash the approval is bound to — the value stored when the version was ' +
      'sent, copied into the snapshot. Equal to the `documentHash` submitted, because an ' +
      'approval whose hashes disagreed was refused rather than recorded.',
  })
  documentHash!: string;

  @ApiProperty({
    enum: schema.CUSTOM_REQUEST_STATES,
    example: 'APPROVED',
    description:
      'The custom request’s state after the approval projected it. A **report** of a system ' +
      'projection, never a command: no field in the request body can ask for it, and the ' +
      'transition is recorded with a system actor because the approval committed.',
  })
  requestStatus!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description:
      'When the approval committed. The same instant the decision record, the snapshot and ' +
      'its agreement acceptances all carry: one clock, so the evidence cannot disagree with ' +
      'itself.',
  })
  approvedAt!: string;

  @ApiProperty({
    example: false,
    description:
      'Whether this call re-served an earlier approval of the same version instead of ' +
      'performing one. A double submission and a retry after a dropped response both answer ' +
      '`true`, with the identical snapshot id: approval is claimed once per version, and no ' +
      'second snapshot, acceptance row, request transition, audit row or event is ever ' +
      'appended.',
  })
  replayed!: boolean;
}

export class DesignRevisionRequestedResponse {
  @ApiProperty({
    format: 'uuid',
    example: VERSION_ID_EXAMPLE,
    description: 'The exact version the customer asked to have revised.',
  })
  versionId!: string;

  @ApiProperty({ example: 3, description: 'The version number within this design case.' })
  version!: number;

  @ApiProperty({
    enum: schema.DESIGN_VERSION_STATES,
    example: 'REVISION_REQUESTED',
    description:
      'The stored LC-08 state after the move. This state **is** the record of the decision: ' +
      'a second decision on this version is refused rather than duplicated, whichever ' +
      'decision it is.',
  })
  versionStatus!: string;

  @ApiProperty({
    enum: schema.CUSTOM_REQUEST_STATES,
    example: 'DESIGN_REVIEW',
    description:
      'The custom request’s state, which this decision did **not** change. Asking for a ' +
      'revision moves the design version only: the request stays in the design-review stage ' +
      'where the workshop authors and sends the next version, no transition row is written, ' +
      'and there is no self-transition. Published so a screen cannot infer a move that never ' +
      'happened.',
  })
  requestStatus!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-21T09:00:00.000Z',
    description: 'When the decision committed. The same instant the decision record carries.',
  })
  decidedAt!: string;

  // No `nextVersionId` and no draft: `APP6-B08` owns revision authoring, and at
  // the instant this commits the workshop has authored nothing.
}

/** The serialised shapes the controller returns; mirror the classes above exactly. */
export interface DesignApprovedHttpView {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly approvalSnapshotId: string;
  readonly documentHash: string;
  readonly requestStatus: string;
  readonly approvedAt: string;
  readonly replayed: boolean;
}

export interface DesignRevisionRequestedHttpView {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly requestStatus: string;
  readonly decidedAt: string;
}
