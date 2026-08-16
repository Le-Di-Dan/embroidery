/**
 * Persistence contract for the APP5 intake cleanup sweep (`APP5-B02` §7).
 *
 * Three operations, one per step of the two-phase tombstone the schema already
 * defines (ADR-DB1-011): mark the row for deletion, list the rows whose binary
 * still exists, and record that a binary is gone. There is no "delete an asset"
 * operation and there must not be — a single call that removed the row and the
 * object together would have to choose which to do first, and either order
 * loses something on a crash. Marking first is what makes the object findable
 * again after one.
 *
 * Every query is scoped to the APP5 intake lane. That scope is not a
 * convenience filter: `intake_expires_at` is the only due-time column on the
 * assets table, and a sweep that trusted it alone would be one schema change
 * away from deleting a lane it was never authorized to touch.
 */

export interface ExpiredIntakeAsset {
  readonly assetId: string;
  /** The internal object reference. Never logged, never published. */
  readonly storageKey: string;
}

export const INTAKE_CLEANUP_REPOSITORY = Symbol('INTAKE_CLEANUP_REPOSITORY');

export interface IntakeCleanupRepository {
  /**
   * Phase 1 — moves due, unbound intake assets to `DELETION_PENDING` and stamps
   * `deletion_requested_at`. Returns how many moved.
   *
   * Eligibility, all of it required:
   *
   * - `intake_expires_at` is set and in the past — the durable due time
   *   `APP5-DB01` added, which survives the challenge's own hard deletion;
   * - the row is a live `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` asset;
   * - it is not already `DELETION_PENDING` or `DELETED`, so a rerun is a no-op
   *   rather than a second stamp that would restart the phase-2 clock;
   * - **no `custom_request_assets` row references it.** A bound asset is
   *   submitted evidence: `APP5-G01` retains it with the request, and its
   *   intake window stopped being the thing that governs its life the moment
   *   `APP5-B01` bound it.
   *
   * `uploaded_via_challenge_id` is deliberately **not** part of eligibility.
   * The FK is `ON DELETE SET NULL` over a hard-TTL-deleted parent, so requiring
   * it would make every asset become ineligible at exactly the moment its
   * challenge was swept — which is the moment cleanup becomes necessary.
   *
   * @requiresTransaction
   */
  markExpiredForDeletion(now: Date, limit: number): Promise<number>;

  /**
   * The rows whose binary still has to be removed — `DELETION_PENDING` intake
   * assets with no `deleted_at` yet.
   *
   * Read outside a transaction on purpose: the object deletion that follows is
   * a network call, and holding a database transaction across it would pin a
   * connection for the length of a remote round trip. The phase-3 write guards
   * on the state it expects, so a row another pass already finished is a no-op
   * rather than a conflict.
   */
  listPendingDeletion(limit: number): Promise<readonly ExpiredIntakeAsset[]>;

  /**
   * Phase 2 — records that the binary is gone: `deleted_at` is stamped and the
   * row becomes `DELETED`.
   *
   * Called **only after** the object store has confirmed removal, because
   * `deleted_at` means "the binary is confirmed deleted" and nothing else. The
   * metadata row survives as a tombstone so audit and retention can still see
   * what existed (INV-09/INV-10).
   *
   * @requiresTransaction
   */
  markBinaryDeleted(assetId: string, at: Date): Promise<void>;
}
