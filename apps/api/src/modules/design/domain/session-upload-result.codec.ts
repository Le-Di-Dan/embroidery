/**
 * The two shapes a Session upload's idempotency record can hold (`APP3-B06B`).
 *
 * An allocation is written *before* any byte is read, so a crash-retry recovers
 * the same asset identity and the same object key instead of minting a second
 * one. A completed record is written in the durable transaction and is what a
 * replay answers from.
 *
 * They are decoded rather than cast on the way **out** as well as the way in.
 * The record is JSON in a shared table: nothing in the type system stops a
 * different producer, an older deployment or a partial write from putting some
 * other object there, and a replay that trusted the shape would answer with
 * `undefined` fields rather than refusing.
 *
 * The completed record carries `designSessionAssetId` and `sessionRevision`
 * because the replay must return the **same** answer as the original — re-reading
 * the session would report a *later* revision, which would make one idempotency
 * key produce two different responses.
 */
import { z } from 'zod';

export const SESSION_UPLOAD_RESULT_SCHEMA_VERSION = 1;

const id = z.string().min(1);

const allocationSchema = z
  .object({
    schemaVersion: z.literal(SESSION_UPLOAD_RESULT_SCHEMA_VERSION),
    kind: z.literal('DESIGN_SESSION_UPLOAD_ALLOCATION'),
    assetId: id,
    sessionId: id,
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    claimToken: id,
  })
  .strict();

const completedSchema = z
  .object({
    schemaVersion: z.literal(SESSION_UPLOAD_RESULT_SCHEMA_VERSION),
    kind: z.literal('DESIGN_SESSION_UPLOAD_COMPLETED'),
    assetId: id,
    sessionId: id,
    bucketAlias: z.literal('ORIGINALS'),
    objectKey: id,
    designSessionAssetId: id,
    sessionRevision: z.number().int().nonnegative(),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    byteSize: z.number().int().positive(),
    checksum: id,
    contentFingerprint: id,
    inspectionEventId: id,
    normalizationEventId: id,
  })
  .strict();

export type SessionUploadAllocation = z.infer<typeof allocationSchema>;
export type SessionUploadCompleted = z.infer<typeof completedSchema>;

export function decodeSessionAllocation(value: unknown): SessionUploadAllocation {
  return allocationSchema.parse(value);
}

export function decodeSessionCompleted(value: unknown): SessionUploadCompleted {
  return completedSchema.parse(value);
}

/** True when a stored record is a completed one, without throwing on the other. */
export function isSessionCompleted(value: unknown): value is SessionUploadCompleted {
  return completedSchema.safeParse(value).success;
}
