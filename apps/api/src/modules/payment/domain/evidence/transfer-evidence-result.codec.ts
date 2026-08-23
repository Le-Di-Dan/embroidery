/**
 * The two shapes an evidence intake idempotency record can hold (`APP7-B05`).
 *
 * The same two-record design the three shipped lanes use, for the same reason:
 * the allocation is written *before* any byte is read, so a crash-retry recovers
 * the same asset identity and the same object key instead of minting a second
 * one, and the completed record is what a replay answers from.
 *
 * Both are decoded rather than cast on the way **out** as well as in. The record
 * is JSON in a table several producers write to, and a replay that trusted the
 * shape would answer with `undefined` fields rather than refusing.
 *
 * Neither record carries the token, its digest, the grant id, the step-up
 * challenge id, the customer id or the raw `Idempotency-Key`. The allocation
 * holds the object key because a retry has to land on the same object, and the
 * completed record holds the association id because that is what a replay must
 * return without writing a second row — nothing in this module is projected to a
 * client, and the response view is built separately and deliberately narrower.
 */
import { z } from 'zod';

const id = z.string().min(1);

export const TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION = 1;

const allocationSchema = z
  .object({
    schemaVersion: z.literal(TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION),
    kind: z.literal('PAYMENT_TRANSFER_EVIDENCE_ALLOCATION'),
    assetId: id,
    /** Allocated before the stream so Tx B's insert is itself replay-stable. */
    evidenceId: id,
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    claimToken: id,
  })
  .strict();

const completedSchema = z
  .object({
    schemaVersion: z.literal(TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION),
    kind: z.literal('PAYMENT_TRANSFER_EVIDENCE_COMPLETED'),
    assetId: id,
    evidenceId: id,
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    byteSize: z.number().int().positive(),
    checksum: id,
    contentFingerprint: id,
    inspectionEventId: id,
  })
  .strict();

export type TransferEvidenceAllocation = z.infer<typeof allocationSchema>;
export type TransferEvidenceCompleted = z.infer<typeof completedSchema>;

export function decodeTransferEvidenceAllocation(value: unknown): TransferEvidenceAllocation {
  return allocationSchema.parse(value);
}

export function decodeTransferEvidenceCompleted(value: unknown): TransferEvidenceCompleted {
  return completedSchema.parse(value);
}
