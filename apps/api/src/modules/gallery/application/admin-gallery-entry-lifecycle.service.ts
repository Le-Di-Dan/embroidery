/**
 * The three Admin gallery mutations that change media or lifecycle
 * (`APP11-B02` §7, §9, §10).
 *
 * One service rather than three, because all three are the *same* guarded
 * write: lock the entry root, compare the caller's concurrency token against
 * database truth, decide, write under a guard that re-tests both, and return
 * the refreshed authoring representation. Splitting them would mean three
 * copies of that sequence, and three chances for one of them to drift out of
 * the transaction.
 *
 * Four rules shape everything here:
 *
 * - **Replacement, never append.** `replaceAssets` stores the intended final
 *   order. An empty selection is a legitimate request that clears the entry's
 *   media; it is refused only by publication readiness, later, if the operator
 *   then tries to publish.
 * - **Validation before mutation.** Every asset in a selection is resolved and
 *   locked before a single association is written, so one bad id leaves the
 *   previous selection exactly as it was.
 * - **Readiness from persisted state.** Publish recomputes the closed
 *   requirement set from the locked row and the locked associations. Nothing
 *   the client echoed back is evidence of anything.
 * - **Unpublish is not archive and not delete.** It writes `status` and the
 *   token. Title, slug, description, the linked product, both SEO fields, every
 *   association and `archived_at` all survive untouched.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { adminGalleryEntryError } from '../domain/admin-gallery-entry.errors';
import {
  GALLERY_ENTRY_DRAFT_STATE,
  GALLERY_ENTRY_PUBLISHABLE_STATES,
  GALLERY_ENTRY_PUBLISHED_STATE,
  GALLERY_ENTRY_UNPUBLISHABLE_STATES,
} from '../domain/admin-gallery-entry.policy';
import { evaluateGalleryPublicationReadiness } from '../domain/admin-gallery-entry.readiness';
import {
  GALLERY_ENTRY_PUBLICATION_REPOSITORY,
  type GalleryEntryGuardedWriteInput,
  type GalleryEntryPublicationRepository,
} from '../domain/repositories/gallery-entry-publication.repository';
import {
  GALLERY_ENTRY_REPOSITORY,
  type AdminGalleryEntry,
  type GalleryEntryId,
  type GalleryEntryRepository,
} from '../domain/repositories/gallery-entry.repository';
import { toDetailView, type AdminGalleryEntryDetailView } from './admin-gallery-entry.projection';

/** Every B02 command carries the entry and the token it was loaded at. */
export interface AdminGalleryEntryGuardedCommand {
  readonly galleryEntryId: string;
  readonly expectedUpdatedAt: Date;
}

export interface ReplaceGalleryEntryAssetsCommand extends AdminGalleryEntryGuardedCommand {
  /** The intended final order. Empty clears the selection. */
  readonly assetIds: readonly string[];
}

/** The states each command may act on, and where it lands. */
const PUBLISH = {
  fromStates: GALLERY_ENTRY_PUBLISHABLE_STATES,
  toState: GALLERY_ENTRY_PUBLISHED_STATE,
  stateError: 'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED',
} as const;

const UNPUBLISH = {
  fromStates: GALLERY_ENTRY_UNPUBLISHABLE_STATES,
  toState: GALLERY_ENTRY_DRAFT_STATE,
  stateError: 'GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED',
} as const;

/**
 * Media replacement is allowed from the two states the phase owns as live
 * authoring states. Publishing is what the readiness rules gate; changing the
 * images of an entry that is already published is ordinary curation, not a
 * lifecycle change. `ARCHIVED` is absent: B02 mutates nothing about an archived
 * entry.
 */
const MEDIA_EDITABLE_STATES = [GALLERY_ENTRY_DRAFT_STATE, GALLERY_ENTRY_PUBLISHED_STATE] as const;

@Injectable()
export class AdminGalleryEntryLifecycleService {
  constructor(
    @Inject(GALLERY_ENTRY_PUBLICATION_REPOSITORY)
    private readonly lifecycle: GalleryEntryPublicationRepository,
    @Inject(GALLERY_ENTRY_REPOSITORY) private readonly entries: GalleryEntryRepository,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Replaces the complete ordered selection.
   *
   * The order of work is the contract: lock, check the token, resolve the whole
   * selection under a share lock, and only then write. A request naming one
   * ineligible image therefore changes nothing — there is no window in which
   * the old associations are gone and the new ones have not landed.
   */
  async replaceAssets(
    command: ReplaceGalleryEntryAssetsCommand,
  ): Promise<AdminGalleryEntryDetailView> {
    return this.transactions.runInTransaction(async () => {
      const guard = this.guardOf(command, MEDIA_EDITABLE_STATES);
      const entry = await this.requireLocked(guard);
      this.requireToken(entry, command.expectedUpdatedAt);

      const assetIds = this.requireDistinct(command.assetIds);
      const eligible = await this.lifecycle.lockEligibleAssetIds(assetIds);
      // Checked against the complete requested set rather than by comparing
      // counts: an absent id is either unknown or outside the public-media
      // boundary, and both are reported identically so this endpoint cannot
      // confirm that a customer's private artwork exists.
      if (assetIds.some((assetId) => !eligible.has(assetId))) {
        throw adminGalleryEntryError('GALLERY_ENTRY_ASSET_NOT_ELIGIBLE');
      }

      await this.lifecycle.replaceAssetLinks(entry.id, assetIds);
      // The root is touched even though no column of it changed: `updated_at`
      // is the token for the whole entry, and a selection change that left it
      // where it was would let a later reader believe nothing had happened.
      const written = await this.lifecycle.touchGuarded(guard);
      return this.project(written, guard);
    });
  }

  /** `DRAFT` to `PUBLISHED`, refused unless the entry is ready. */
  async publish(command: AdminGalleryEntryGuardedCommand): Promise<AdminGalleryEntryDetailView> {
    return this.transactions.runInTransaction(async () => {
      const guard = this.guardOf(command, PUBLISH.fromStates);
      const entry = await this.requireLocked(guard);
      this.requireToken(entry, command.expectedUpdatedAt);
      if (!(PUBLISH.fromStates as readonly string[]).includes(entry.status)) {
        throw adminGalleryEntryError(PUBLISH.stateError);
      }

      // Recomputed from the locked row and the locked associations — never from
      // a readiness answer the client is holding.
      const readiness = evaluateGalleryPublicationReadiness({
        title: entry.title,
        slug: entry.slug,
        description: entry.description,
        eligibleAssetCount: await this.lifecycle.countEligibleAttachedAssets(entry.id),
      });
      if (!readiness.eligible) {
        // Atomic refusal: nothing has been written, so the rollback that
        // follows has nothing to undo and the entry is exactly as it was.
        throw adminGalleryEntryError('GALLERY_ENTRY_PUBLICATION_NOT_READY', readiness.unsatisfied);
      }

      const written = await this.lifecycle.transitionGuarded({
        ...guard,
        toState: PUBLISH.toState,
      });
      return this.project(written, guard);
    });
  }

  /**
   * `PUBLISHED` back to `DRAFT`.
   *
   * Readiness is deliberately not re-run: withdrawing an entry from public view
   * must not depend on it still being publishable. An entry whose only image
   * was tombstoned after publication is exactly the one an operator most needs
   * to be able to unpublish.
   */
  async unpublish(command: AdminGalleryEntryGuardedCommand): Promise<AdminGalleryEntryDetailView> {
    return this.transactions.runInTransaction(async () => {
      const guard = this.guardOf(command, UNPUBLISH.fromStates);
      const entry = await this.requireLocked(guard);
      this.requireToken(entry, command.expectedUpdatedAt);
      if (!(UNPUBLISH.fromStates as readonly string[]).includes(entry.status)) {
        throw adminGalleryEntryError(UNPUBLISH.stateError);
      }

      const written = await this.lifecycle.transitionGuarded({
        ...guard,
        toState: UNPUBLISH.toState,
      });
      return this.project(written, guard);
    });
  }

  private guardOf(
    command: AdminGalleryEntryGuardedCommand,
    fromStates: readonly ('DRAFT' | 'PUBLISHED')[],
  ): GalleryEntryGuardedWriteInput {
    return {
      id: command.galleryEntryId as GalleryEntryId,
      expectedUpdatedAt: command.expectedUpdatedAt,
      fromStates,
    };
  }

  private async requireLocked(guard: GalleryEntryGuardedWriteInput): Promise<AdminGalleryEntry> {
    const entry = await this.lifecycle.lockAuthoringById(guard.id);
    if (entry === undefined) {
      throw adminGalleryEntryError('GALLERY_ENTRY_NOT_FOUND');
    }
    return entry;
  }

  /**
   * The token comparison, made against database truth rather than the request.
   *
   * Compared at millisecond precision because that is the precision the token
   * is published at. The guarded write re-checks the same thing, so this is a
   * fast, well-classified refusal, not the safety mechanism.
   */
  private requireToken(entry: AdminGalleryEntry, expectedUpdatedAt: Date): void {
    if (entry.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw adminGalleryEntryError('GALLERY_ENTRY_VERSION_CONFLICT');
    }
  }

  /**
   * Turns a guarded write's result into the Admin detail representation, or
   * explains why it matched nothing.
   *
   * The explanation is read inside the same transaction: a second read outside
   * the guard could observe a different state than the one the UPDATE tested,
   * which is the race the guard exists to close.
   */
  private async project(
    written: AdminGalleryEntry | undefined,
    guard: GalleryEntryGuardedWriteInput,
  ): Promise<AdminGalleryEntryDetailView> {
    if (written === undefined) {
      const reason = await this.lifecycle.explainGuardedMiss(guard);
      throw adminGalleryEntryError(
        reason === 'NOT_FOUND' ? 'GALLERY_ENTRY_NOT_FOUND' : 'GALLERY_ENTRY_VERSION_CONFLICT',
      );
    }
    return toDetailView(written, await this.entries.listAssetLinks(written.id));
  }

  /** Duplicates are a client mistake worth reporting, never silently collapsed. */
  private requireDistinct(assetIds: readonly string[]): readonly string[] {
    if (new Set(assetIds).size !== assetIds.length) {
      throw adminGalleryEntryError('GALLERY_ENTRY_ASSET_DUPLICATE');
    }
    return assetIds;
  }
}
