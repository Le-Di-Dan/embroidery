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
}

export interface DesignTemplateVersion {
  readonly id: DesignTemplateVersionId;
  readonly designTemplateId: DesignTemplateId;
  readonly version: number;
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  readonly publishedAt: Date | undefined;
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
}
