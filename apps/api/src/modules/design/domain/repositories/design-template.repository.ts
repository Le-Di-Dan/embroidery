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

  /** @requiresTransaction */
  archive(id: DesignTemplateId, at: Date): Promise<void>;

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
