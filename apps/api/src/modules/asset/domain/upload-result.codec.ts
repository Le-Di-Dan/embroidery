/**
 * The closed, versioned `idempotency_records.result` union (`ADR-APP2-001` §4.2f-2).
 *
 * This is **internal persistence data**, never an API response body. Decoding is
 * strict in both directions: `.strict()` rejects an unknown field rather than
 * ignoring it, and every field is shape-validated, because a result that has
 * drifted is the one input that could make the service resurrect the wrong
 * asset identity or hand a caller someone else's receipt.
 *
 * There is no compatibility fallback and no coercion of unversioned JSON: APP2
 * has no legacy production data, so a document that does not decode is a defect
 * to fail on (`IDEMPOTENCY_RESULT_INVALID`), not a shape to guess at.
 */
import { z } from 'zod';

import { assetIntakeError } from './asset-intake.errors';
import { ACCEPTED_MEDIA_TYPES, MAX_UPLOAD_BYTES } from './asset-intake.policy';
import { SHA256_PATTERN } from './canonical-json';

export const UPLOAD_RESULT_SCHEMA_VERSION = 1;

export const UPLOAD_RESULT_KINDS = ['ASSET_UPLOAD_ALLOCATION', 'ASSET_UPLOAD_COMPLETED'] as const;

/** RFC 9562 UUIDv7 — the same shape the object-key builder enforces. */
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** `crypto.randomUUID()` is v4; the claim token is only required to be a UUID. */
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sha256 = z.string().regex(SHA256_PATTERN);
const assetId = z.string().regex(UUID_V7);
const objectKey = z.string().min(1).max(512);

const allocationSchema = z
  .object({
    schemaVersion: z.literal(UPLOAD_RESULT_SCHEMA_VERSION),
    kind: z.literal('ASSET_UPLOAD_ALLOCATION'),
    assetId,
    // The alias, never a bucket name: a result that could name a bucket would
    // let a drifted document redirect a write.
    bucketAlias: z.literal('ORIGINALS'),
    objectKey,
    claimToken: z.string().regex(UUID_ANY),
    requestFingerprintVersion: z.literal(1),
  })
  .strict();

const completedSchema = z
  .object({
    schemaVersion: z.literal(UPLOAD_RESULT_SCHEMA_VERSION),
    kind: z.literal('ASSET_UPLOAD_COMPLETED'),
    assetId,
    bucketAlias: z.literal('ORIGINALS'),
    objectKey,
    mediaType: z.enum(ACCEPTED_MEDIA_TYPES),
    // Bounded by the approved maximum: a stored size above it cannot be a
    // result this system ever wrote.
    byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    checksum: sha256,
    contentFingerprint: sha256,
    assetStatus: z.literal('INSPECTING'),
    // `outbox_events.id` is a sequence; it is carried as a decimal string so a
    // value beyond `Number.MAX_SAFE_INTEGER` cannot be silently rounded.
    inspectionEventId: z.string().regex(/^[1-9][0-9]{0,18}$/),
  })
  .strict();

export type AssetUploadAllocation = z.infer<typeof allocationSchema>;
export type AssetUploadCompleted = z.infer<typeof completedSchema>;
export type AssetUploadResult = AssetUploadAllocation | AssetUploadCompleted;

/**
 * Decodes a stored allocation, or throws `IDEMPOTENCY_RESULT_INVALID`.
 *
 * The Zod issue is deliberately discarded: it would carry the stored values,
 * and this error is reported to a client.
 */
export function decodeAllocation(stored: unknown): AssetUploadAllocation {
  const parsed = allocationSchema.safeParse(stored);
  if (!parsed.success) {
    throw assetIntakeError('IDEMPOTENCY_RESULT_INVALID');
  }
  return parsed.data;
}

export function decodeCompleted(stored: unknown): AssetUploadCompleted {
  const parsed = completedSchema.safeParse(stored);
  if (!parsed.success) {
    throw assetIntakeError('IDEMPOTENCY_RESULT_INVALID');
  }
  return parsed.data;
}

/**
 * Enforces the state/result invariant before either decoder runs.
 *
 * `IN_PROGRESS` must carry an allocation and `COMPLETED` must carry a completed
 * result; a row where those disagree is contradictory evidence, and continuing
 * from it would mean trusting one of two mutually exclusive stories.
 */
export function decodeResultForState(
  status: 'IN_PROGRESS' | 'COMPLETED',
  stored: unknown,
): AssetUploadResult {
  return status === 'IN_PROGRESS' ? decodeAllocation(stored) : decodeCompleted(stored);
}
