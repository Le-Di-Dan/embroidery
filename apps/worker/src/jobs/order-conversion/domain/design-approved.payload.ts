/**
 * The `design.approved` (SE-005) payload contract, as the consumer reads it
 * (`APP7-W01` §3).
 *
 * `APP6-B11` appends this row in the approval transaction and calls it "the
 * APP7 hand-off" in its own source. The payload it writes carries nine fields;
 * this consumer requires exactly the two that identify **which** approval to
 * convert, and deliberately reads nothing else from it.
 *
 * That is not laziness, it is the rule `APP7-W01` §3 states: *"The event payload
 * is a lookup key, not a replacement for persisted authority."* Every commercial
 * and design fact the order freezes — the branch, the labels, the quantity, the
 * document hash, the money — is re-read from the rows that own it inside the
 * conversion transaction. A payload copy could only ever be a second opinion
 * about a value the database already holds, and the first time the two
 * disagreed the order would freeze the copy.
 *
 * The version is checked by the runtime before this file is reached
 * (`payloadSchemaVersion`), so a producer ahead of this build is
 * `JOB_SCHEMA_UNSUPPORTED` and terminal rather than a malformed-payload guess.
 */
import type { PayloadValidationResult } from '../../../runtime/registry/job-handler';

/** `SE-005`, exactly as `design-decision.recorder.ts` writes it. */
export const DESIGN_APPROVED_EVENT_TYPE = 'design.approved';

/** `DESIGN_DECISION_PAYLOAD_VERSION` — the producer's own constant. */
export const DESIGN_APPROVED_PAYLOAD_VERSION = 1;

/** The aggregate `SE-005` names: "per (approval snapshot)". */
export const APPROVAL_SNAPSHOT_AGGREGATE_KIND = 'APPROVAL_SNAPSHOT';

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'order-conversion:v1:';

/** The lookup key, and nothing else. */
export interface DesignApprovedLookup {
  readonly approvalSnapshotId: string;
  readonly customRequestId: string;
}

export function parseDesignApprovedPayload(
  payload: unknown,
): PayloadValidationResult<DesignApprovedLookup> {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  const record = payload as Record<string, unknown>;
  const approvalSnapshotId = record['approvalSnapshotId'];
  const customRequestId = record['customRequestId'];
  if (!isIdentifier(approvalSnapshotId) || !isIdentifier(customRequestId)) {
    return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' };
  }
  return { valid: true, payload: { approvalSnapshotId, customRequestId } };
}

/**
 * The durable effect's identity: the approval snapshot.
 *
 * The **approval**, never the outbox event id. `APP7-R00` §11 warned that
 * `design.approved` rows have been accumulating unconsumed, and `SE-005` is
 * "per (approval snapshot)" — so two rows naming one approval are two
 * deliveries of one effect, and keying on the row id would make the second look
 * like new work. The same reasoning `APP4-W01` used to reach the opposite
 * answer for a replayed notification, which genuinely *is* a new effect.
 */
export function deriveOrderConversionEffectKey(payload: DesignApprovedLookup): string {
  return `${EFFECT_KEY_PREFIX}${payload.approvalSnapshotId}`;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
