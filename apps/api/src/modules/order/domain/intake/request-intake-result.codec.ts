/**
 * The two shapes an APP5 intake idempotency record can hold (`APP5-B02`).
 *
 * Same two-record design as the Session lane, for the same reason: the
 * allocation is written *before* any byte is read, so a crash-retry recovers
 * the same asset identity and the same object key instead of minting a second
 * one, and the completed record is what a replay answers from.
 *
 * Both are decoded rather than cast on the way **out** as well as in. The
 * record is JSON in a table several producers write to; a replay that trusted
 * the shape would answer with `undefined` fields rather than refusing.
 *
 * Neither record carries the customer id, the challenge id, the bucket
 * credentials or anything derived from them. The allocation holds the object
 * key because the retry has to land on the same object — but nothing in this
 * module is ever projected to a client; the response view is built separately
 * and deliberately narrower.
 */
import { z } from 'zod';

import { REQUEST_INTAKE_ROLES } from './request-intake.policy';

export const REQUEST_INTAKE_RESULT_SCHEMA_VERSION = 1;

const id = z.string().min(1);

const allocationSchema = z
  .object({
    schemaVersion: z.literal(REQUEST_INTAKE_RESULT_SCHEMA_VERSION),
    kind: z.literal('CUSTOM_REQUEST_INTAKE_ALLOCATION'),
    assetId: id,
    role: z.enum(REQUEST_INTAKE_ROLES),
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    claimToken: id,
  })
  .strict();

const completedSchema = z
  .object({
    schemaVersion: z.literal(REQUEST_INTAKE_RESULT_SCHEMA_VERSION),
    kind: z.literal('CUSTOM_REQUEST_INTAKE_COMPLETED'),
    assetId: id,
    role: z.enum(REQUEST_INTAKE_ROLES),
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    byteSize: z.number().int().positive(),
    checksum: id,
    contentFingerprint: id,
    inspectionEventId: id,
  })
  .strict();

export type RequestIntakeAllocation = z.infer<typeof allocationSchema>;
export type RequestIntakeCompleted = z.infer<typeof completedSchema>;

export function decodeRequestIntakeAllocation(value: unknown): RequestIntakeAllocation {
  return allocationSchema.parse(value);
}

export function decodeRequestIntakeCompleted(value: unknown): RequestIntakeCompleted {
  return completedSchema.parse(value);
}
