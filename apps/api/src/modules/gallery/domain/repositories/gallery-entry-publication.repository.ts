/**
 * Gallery media-selection and publication persistence contract
 * (`APP11-B02`, AGG-18 / LC-04).
 *
 * A second, narrow port beside the DB7 `GalleryEntryRepository`, for the same
 * reason `ProductPublicationRepository` sits beside `ProductDraftRepository`:
 * the facts these three operations need — a locked entry root, the eligible
 * subset of a selection, an ordered replacement, a guarded transition — are
 * read and written together, under locks, inside one transaction. Widening the
 * authoring port with locking reads would hand every existing consumer a
 * surface it must not use casually, and would push a single adapter file past
 * the `CLAUDE.md` §6 limit.
 *
 * Three rules shape the whole contract:
 *
 * - **Batched, never per-item.** A selection of twenty images costs the same
 *   number of round trips as one image.
 * - **Locked, not merely read.** Every fact a decision depends on is read under
 *   a lock inside the caller's transaction. A plain read at `READ COMMITTED`
 *   would let a concurrent reclassification or transition commit between the
 *   check and the write.
 * - **Guarded, never read-then-write.** Identity, allowed source states and the
 *   exact `updated_at` all travel into the same UPDATE, so the state a
 *   pre-flight check saw is the state the write tests.
 */
import type { GalleryEntryState } from '@embroidery/database';

import type { AdminGalleryEntry, GalleryEntryId } from './gallery-entry.repository';

/** Why a guarded write matched no row. */
export type GalleryEntryGuardedMiss = 'NOT_FOUND' | 'STATE' | 'STALE';

export interface GalleryEntryGuardedWriteInput {
  readonly id: GalleryEntryId;
  /** Database truth this write may overwrite; the new token is database-owned. */
  readonly expectedUpdatedAt: Date;
  /** The states the write is allowed to act on. */
  readonly fromStates: readonly GalleryEntryState[];
}

export interface GalleryEntryTransitionInput extends GalleryEntryGuardedWriteInput {
  readonly toState: GalleryEntryState;
}

export const GALLERY_ENTRY_PUBLICATION_REPOSITORY = Symbol('GALLERY_ENTRY_PUBLICATION_REPOSITORY');

export interface GalleryEntryPublicationRepository {
  /**
   * The authoring row with the entry root locked `FOR UPDATE`.
   *
   * Exclusive, because every caller of this method intends to write the row;
   * taking that lock first is what makes two concurrent publications of one
   * entry serialise rather than both reading the same stale status.
   *
   * @requiresTransaction
   */
  lockAuthoringById(id: GalleryEntryId): Promise<AdminGalleryEntry | undefined>;

  /**
   * The subset of the supplied asset ids that may appear on a public gallery
   * page, read in one statement and locked `FOR SHARE`.
   *
   * The eligibility predicate is exactly the one the delivered AGG-18
   * `attachAsset` enforces — classification `PUBLIC`, and the asset not
   * tombstoned — so the batch replacement and the single-row attach can never
   * disagree about what may be published. An id that names no asset at all is
   * simply absent from the result, exactly as an ineligible one is, so the
   * caller cannot use this to discover that a private asset exists.
   *
   * Share mode: the caller only needs those rows to stay as they are until
   * commit, and an exclusive lock would serialise unrelated gallery edits that
   * happen to share an image.
   *
   * @requiresTransaction
   */
  lockEligibleAssetIds(assetIds: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * How many of the entry's **currently stored** associations are still
   * eligible, under the same lock and the same predicate.
   *
   * The readiness input for publish, which must be computed from persisted
   * state rather than from anything the client sent.
   *
   * @requiresTransaction
   */
  countEligibleAttachedAssets(id: GalleryEntryId): Promise<number>;

  /**
   * Replaces the whole ordered selection for one entry.
   *
   * Complete replacement rather than a diff: the request carries the intended
   * final order, and applying it as a set of adds and removes would leave a
   * window in which the stored order is neither the old one nor the new one.
   * Positions are the zero-based request order, so position 0 is the cover.
   *
   * Deletes associations only — never an Asset, a derivative or a stored
   * object.
   *
   * @requiresTransaction
   */
  replaceAssetLinks(id: GalleryEntryId, assetIds: readonly string[]): Promise<void>;

  /**
   * Advances the concurrency token, guarded on identity, state and the exact
   * token — without changing any authoring field.
   *
   * The media replacement's write to the entry root. The row is touched even
   * though no column of it changed, because `updated_at` is the token for the
   * whole entry: a selection change that left the token where it was would let
   * a later reader believe the entry had not changed.
   *
   * @requiresTransaction
   */
  touchGuarded(input: GalleryEntryGuardedWriteInput): Promise<AdminGalleryEntry | undefined>;

  /**
   * The guarded lifecycle transition.
   *
   * Writes `status` and `updated_at` and nothing else — never `archived_at`,
   * never an authoring field, never an association. Unpublish is not archive,
   * and publish does not clear an archive fact it did not create.
   *
   * @requiresTransaction
   */
  transitionGuarded(input: GalleryEntryTransitionInput): Promise<AdminGalleryEntry | undefined>;

  /**
   * Why a guarded write matched nothing, read in the same transaction.
   *
   * The repository reports the reason rather than the caller re-reading the
   * row: a second read outside the guard could observe a different state than
   * the one the UPDATE actually tested, which is the race the guard exists to
   * close.
   *
   * @requiresTransaction
   */
  explainGuardedMiss(input: GalleryEntryGuardedWriteInput): Promise<GalleryEntryGuardedMiss>;
}
