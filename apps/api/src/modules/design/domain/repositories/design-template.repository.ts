/**
 * AGG-12 Design Template persistence contract (TBL-034..TBL-036).
 *
 * A store-authored template: a header, its published/draft versions, and the
 * private artwork assets behind its public preview.
 *
 * Carries **G-DB7-18** (a session may only clone a template that is
 * PUBLISHED at the moment of cloning — `loadPublished` is the single read
 * every clone path must go through).
 *
 * A version is immutable once published — enforced by an S24 trigger, so no
 * method here offers to edit one.
 */
import type { DesignTemplateState } from '@embroidery/database';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';

export type DesignTemplateId = string & { readonly __brand: 'DesignTemplateId' };
export type DesignTemplateVersionId = string & { readonly __brand: 'DesignTemplateVersionId' };

export interface DesignTemplate {
  readonly id: DesignTemplateId;
  readonly name: string;
  readonly slug: string;
  readonly description: string | undefined;
  readonly productId: ProductId | undefined;
  readonly productSideId: ProductSideId | undefined;
  readonly embroideryAreaId: EmbroideryAreaId | undefined;
  readonly status: DesignTemplateState;
  readonly currentVersion: number;
  readonly previewDerivativeId: string | undefined;
  /**
   * Added by `APP3-B03` for the Admin surface.
   *
   * `createdAt` is the keyset sort key the Admin list pages on, `updatedAt` is
   * the concurrency token the Admin contract hands back, and `archivedAt` is the
   * only way to tell a template archived long ago from one archived a moment
   * ago. All three were already columns; only the projection omitted them.
   */
  readonly archivedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DesignTemplateVersion {
  readonly id: DesignTemplateVersionId;
  readonly designTemplateId: DesignTemplateId;
  readonly version: number;
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  readonly publishedAt: Date | undefined;
  /** When the version row was written. Added by `APP3-B03` for the Admin read. */
  readonly createdAt: Date;
}

export interface CreateDesignTemplateInput {
  readonly id: DesignTemplateId;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly productId?: ProductId | undefined;
  readonly productSideId?: ProductSideId | undefined;
  readonly embroideryAreaId?: EmbroideryAreaId | undefined;
}

/**
 * One draft save (`APP3-B03A`).
 *
 * Separate from `PublishDesignTemplateVersionInput` rather than a nullable
 * `publishedAt` on it: `publishVersion` writes a version **and publishes it**,
 * setting the header to `PUBLISHED`, and widening it to sometimes not do that
 * would make one method mean two things. `IMP-D042` PO-04 keeps them apart too —
 * a save writes a version with `published_at` null, and publish sets that stamp
 * once, later, on a version that already exists.
 */
export interface SaveDesignTemplateDraftVersionInput {
  readonly id: DesignTemplateVersionId;
  readonly designTemplateId: DesignTemplateId;
  /**
   * The header counter the caller believes it is advancing from.
   *
   * `0` is the ordinary first save: `APP3-B03` creates a header with no version
   * at all, so the first document a Template ever holds is version 1.
   */
  readonly expectedCurrentVersion: number;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
}

export interface PublishDesignTemplateVersionInput {
  readonly id: DesignTemplateVersionId;
  readonly designTemplateId: DesignTemplateId;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  readonly publishedAt: Date;
}

/**
 * The Admin list query (`APP3-B03`).
 *
 * `status` is the only filter the header itself can answer without a join, and
 * `productId` the only scope filter that does not require resolving a public
 * name. Nothing here filters by document content: a list that had to read
 * documents to answer would be the N+1 §8 forbids.
 */
export interface ListDesignTemplatesInput {
  readonly filter: {
    readonly status?: DesignTemplateState | undefined;
    readonly productId?: ProductId | undefined;
  };
  /** Exclusive keyset position from the previous page. */
  readonly after?: { readonly createdAt: Date; readonly id: string } | undefined;
  /**
   * The page size. The adapter fetches `limit + 1` so `buildPage` can detect a
   * next page from the extra row; a caller never sees it.
   */
  readonly limit: number;
}

/**
 * One LC-24 lifecycle command (`APP3-B04`).
 *
 * `expectedCurrentVersion` is the concurrency token `IMP-D042` PO-03 requires.
 * It is the counter `APP3-B03A` already advances, rather than a new column: the
 * current immutable version *is* the publication subject, so a caller holding a
 * stale view of it is exactly the caller who must not transition.
 */
export interface DesignTemplateLifecycleInput {
  readonly id: DesignTemplateId;
  readonly expectedCurrentVersion: number;
}

/**
 * The one-time initial scope assignment (`APP3-B03B`).
 *
 * Carries the resolved triple and nothing else — no expected token. Every other
 * guarded write here takes one because its legal source state is a *range*: a
 * save may advance from any counter, a publish may transition from any version.
 * This one's legal source state is a single point — `DRAFT`, counter `0`, all
 * three columns null, no version rows — so a caller-supplied token could only
 * ever hold the value the server already requires, and a field whose only legal
 * value is `0` is a field that can only be wrong.
 */
export interface AssignDesignTemplateScopeInput {
  readonly id: DesignTemplateId;
  readonly productId: ProductId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
}

export const DESIGN_TEMPLATE_REPOSITORY = Symbol('DESIGN_TEMPLATE_REPOSITORY');

export interface DesignTemplateRepository {
  /** @requiresTransaction */
  create(input: CreateDesignTemplateInput): Promise<DesignTemplate>;

  /**
   * Publishes a new document version and bumps the header's counter
   * together, so `current_version` can never point past the last version
   * actually written.
   *
   * @requiresTransaction
   */
  publishVersion(input: PublishDesignTemplateVersionInput): Promise<DesignTemplateVersion>;

  /** Sets the public-listing preview to a watermark-safe derivative. @requiresTransaction */
  setPreviewDerivative(id: DesignTemplateId, previewDerivativeId: string): Promise<void>;

  /** Associates a private original artwork asset with the template. @requiresTransaction */
  attachAsset(id: DesignTemplateId, assetId: string): Promise<void>;

  /**
   * Writes one immutable draft version under a compare-and-set on the header
   * (`APP3-B03A`).
   *
   * Succeeds only when the Template exists, is `DRAFT`, and its `current_version`
   * is exactly `expectedCurrentVersion`; the new version and the advanced counter
   * are written together, so the counter can never point past the last version
   * actually written. `published_at` is null — publication is `APP3-B04`'s and
   * sets that stamp once.
   *
   * Throws `RECORD_NOT_FOUND` for an unknown Template and `STALE_WRITE` when the
   * Template is not `DRAFT` or the counter has moved. Both leave the row
   * untouched, which is what makes exactly one of two racing saves win.
   *
   * @requiresTransaction
   */
  saveDraftVersion(input: SaveDesignTemplateDraftVersionInput): Promise<DesignTemplateVersion>;

  /**
   * Ensures a `(template, asset)` association exists and reports whether this
   * call is the one that created it.
   *
   * The `created` flag is the whole point: `IMP-D046` PO-04 appends a
   * normalization request on a **new** association and on nothing else, so a
   * caller that could not tell an insert from a no-op would either re-request
   * work on every save or never request it at all. `attachAsset` cannot answer
   * it — it returns `void` and would raise on the unique constraint.
   *
   * @requiresTransaction
   */
  ensureAssetAssociation(
    id: DesignTemplateId,
    assetId: string,
  ): Promise<{ readonly designTemplateAssetId: string; readonly created: boolean }>;

  /**
   * Publishes the template's **current** version (`APP3-B04`, `TR-LC24-02`).
   *
   * Succeeds only when the template is `DRAFT` at exactly
   * `expectedCurrentVersion`. It creates no version — the publication subject is
   * the highest immutable version `APP3-B03A` already wrote — and it stamps that
   * version's `published_at` **only when it is null**, so a republication of the
   * same version keeps its original timestamp (`IMP-D042` PO-04: set once, never
   * cleared or rewritten).
   *
   * Throws `RECORD_NOT_FOUND` for an unknown template and `STALE_WRITE` when the
   * state or the counter has moved. Both leave every row untouched.
   *
   * @requiresTransaction
   */
  publishCurrentVersion(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void>;

  /**
   * Returns a published template to `DRAFT` (`TR-LC24-03`).
   *
   * The header only: `current_version` is preserved, every version row survives,
   * and no `published_at` is cleared — editing after unpublish creates a *new*
   * version rather than reopening the old one.
   *
   * @requiresTransaction
   */
  unpublish(input: DesignTemplateLifecycleInput): Promise<void>;

  /**
   * Archives from `DRAFT` or `PUBLISHED` (`TR-LC24-04`/`TR-LC24-05`).
   *
   * Durable retirement, distinct from unpublish and never a delete: versions,
   * their timestamps and every association survive. Guarded by source state and
   * the counter for the same reason the other two are — a read-then-update would
   * let a concurrent publish and archive both believe they won.
   *
   * @requiresTransaction
   */
  archive(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void>;

  /**
   * Returns an archived template to `DRAFT` (`TR-LC24-06`, `APP3-B04A`).
   *
   * The header only, and the exact inverse of what archive marked: `status` goes
   * back to `DRAFT` and `archived_at` — the *current* archive-state marker — is
   * cleared, which is what DB3 LC-24 spells out for this transition. The history
   * of the archive and the restore lives in Audit, where a marker that also had
   * to serve as a historical record could not.
   *
   * Everything else is preserved: `current_version`, every version row, every
   * `published_at`, the scope triple and every Asset association. Restore creates
   * nothing — a template that was archived with no version comes back with none.
   *
   * `ARCHIVED` is the only source state, so `ARCHIVED → PUBLISHED` is
   * unrepresentable here rather than merely unimplemented; republication is the
   * separate `publishCurrentVersion` and re-runs the whole GRD-T01 guard.
   *
   * @requiresTransaction
   */
  restore(input: DesignTemplateLifecycleInput & { readonly at: Date }): Promise<void>;

  /**
   * Assigns the placement scope of an unscoped Template, exactly once
   * (`APP3-B03B`).
   *
   * Succeeds only when the Template exists, is `DRAFT`, its `current_version` is
   * `0`, all three scope columns are null **and** it has no version rows. Every
   * one of those is part of the compare-and-set predicate, not a prior read: a
   * read-then-update would let two concurrent assignments both observe an
   * unscoped Template and both write, leaving the second one's triple over the
   * first one's with no record that either happened.
   *
   * The three columns are written together, so a partial scope — the state
   * `IMP-D042` PO-06 calls *wrong* rather than incomplete — cannot be produced
   * by an interrupted assignment.
   *
   * There is no matching clear or rescope method, and that absence is the
   * ruling: `B03B_SCOPE_RULING` is initial assignment only, because a document
   * already saved carries an immutable placement snapshot that a rescope would
   * silently invalidate.
   *
   * Throws `RECORD_NOT_FOUND` for an unknown Template and `STALE_WRITE` when the
   * Template is no longer assignable. Both leave every column untouched.
   *
   * @requiresTransaction
   */
  assignInitialScope(input: AssignDesignTemplateScopeInput): Promise<DesignTemplate>;

  findById(id: DesignTemplateId): Promise<DesignTemplate | undefined>;
  findBySlug(slug: string): Promise<DesignTemplate | undefined>;

  /**
   * Loads the template's current published version, or `undefined` if the
   * template is not PUBLISHED right now.
   *
   * The one read every clone path must use — a template that has since been
   * archived or is still a draft must not be clonable (G-DB7-18/GRD-028).
   */
  loadPublished(
    id: DesignTemplateId,
  ): Promise<{ template: DesignTemplate; version: DesignTemplateVersion } | undefined>;

  listAssetIds(id: DesignTemplateId): Promise<string[]>;

  /**
   * One keyset page of templates for the Admin surface (`APP3-B03`).
   *
   * Ordered `created_at DESC, id DESC` — newest first, with the tie-breaker DB5
   * requires because `created_at` is not unique. Offset paging is deliberately
   * not offered: a page would drift under a concurrent create and the operator
   * would see a row twice or miss one entirely.
   */
  list(input: ListDesignTemplatesInput): Promise<DesignTemplate[]>;

  /**
   * The template's highest version, whether or not it is published.
   *
   * `loadPublished` cannot answer this: it refuses a template that is not
   * `PUBLISHED` right now, which is every draft. The Admin detail read needs the
   * newest version of a `DRAFT` too — and must be able to learn there is none,
   * because `APP3-B03` creates a header with zero versions.
   */
  findLatestVersion(id: DesignTemplateId): Promise<DesignTemplateVersion | undefined>;
}
