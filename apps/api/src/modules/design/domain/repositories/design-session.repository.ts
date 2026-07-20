/**
 * AGG-09 Design Session persistence contract (TBL-025, TBL-026).
 *
 * One temporary guest/customer editor session: a working document plus an
 * autosave marker. Not a customer (ADR-DB2-001) — identity is
 * `sessionSecretHash` only, never the raw secret.
 *
 * Carries **G-DB7-13** (the placement chain a session opens against must
 * resolve into one valid chain, via `PlacementHierarchyPort`), **G-DB7-18**
 * (cloning requires the source template to be PUBLISHED at clone time — this
 * repository calls `DesignTemplateRepository.loadPublished`, never reads
 * template rows itself), and **G-DB7-19** (a session must be ACTIVE and
 * unexpired to autosave, and `autosaveRevision` is the optimistic marker: a
 * stale write conflicts rather than silently overwriting a newer one —
 * `STALE_WRITE`; concurrent-autosave races themselves are DB8's, CC-01).
 */
import type { DesignSessionState } from '@embroidery/database';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { DesignTemplateId } from './design-template.repository';

export type DesignSessionId = string & { readonly __brand: 'DesignSessionId' };

export interface DesignSession {
  readonly id: DesignSessionId;
  readonly sessionSecretHash: string;
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId | undefined;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  readonly designDocument: unknown;
  readonly documentSchemaVersion: number;
  readonly autosaveRevision: number;
  readonly templateId: DesignTemplateId | undefined;
  readonly templateVersion: number | undefined;
  readonly status: DesignSessionState;
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly submittedRequestId: string | undefined;
}

export interface OpenDesignSessionInput {
  readonly id: DesignSessionId;
  readonly sessionSecretHash: string;
  readonly productId: ProductId;
  readonly productVariantId?: ProductVariantId | undefined;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  readonly expiresAt: Date;
}

export interface CloneFromTemplateInput {
  readonly id: DesignSessionId;
  readonly sessionSecretHash: string;
  readonly templateId: DesignTemplateId;
  readonly productId: ProductId;
  readonly productVariantId?: ProductVariantId | undefined;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
  readonly expiresAt: Date;
}

export interface SaveDocumentInput {
  readonly id: DesignSessionId;
  readonly designDocument: Record<string, unknown>;
  readonly documentSchemaVersion: number;
  /** The revision the caller last read; must match the stored one exactly. */
  readonly expectedRevision: number;
}

export const DESIGN_SESSION_REPOSITORY = Symbol('DESIGN_SESSION_REPOSITORY');

export interface DesignSessionRepository {
  /**
   * Opens a blank session, validating its placement chain first (G-DB7-13).
   *
   * @requiresTransaction
   */
  open(input: OpenDesignSessionInput): Promise<DesignSession>;

  /**
   * Opens a session by copying a template's currently published document.
   *
   * The template must be PUBLISHED at this instant (G-DB7-18) — resolved via
   * `DesignTemplateRepository.loadPublished`, not a raw read of the template
   * table. `(templateId, templateVersion)` is stamped as provenance only;
   * later template publishes never touch this session.
   *
   * @requiresTransaction
   */
  cloneFromTemplate(input: CloneFromTemplateInput): Promise<DesignSession>;

  /**
   * Autosaves the working document with optimistic concurrency.
   *
   * The session must be ACTIVE and not expired (G-DB7-19). A revision
   * mismatch throws `STALE_WRITE` rather than overwriting a newer save.
   *
   * @requiresTransaction
   */
  saveDocument(input: SaveDocumentInput): Promise<DesignSession>;

  /** Associates an uploaded asset with the session. @requiresTransaction */
  attachAsset(id: DesignSessionId, assetId: string): Promise<void>;

  /** Marks the session SUBMITTED and links the request it handed off to. @requiresTransaction */
  submit(id: DesignSessionId, customRequestId: string, at: Date): Promise<DesignSession>;

  /** Marks an unclaimed session EXPIRED past its TTL. @requiresTransaction */
  expire(id: DesignSessionId, at: Date): Promise<void>;

  findById(id: DesignSessionId): Promise<DesignSession | undefined>;
  findActiveBySecretHash(sessionSecretHash: string): Promise<DesignSession | undefined>;
  listAssetIds(id: DesignSessionId): Promise<string[]>;
}
