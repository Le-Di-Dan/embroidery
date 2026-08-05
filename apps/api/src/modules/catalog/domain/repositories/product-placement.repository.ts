/**
 * Product placement persistence contract (`APP3-B01`; IMP-D041, IMP-D044).
 *
 * Placement is a **Product-aggregate** concern (PO-01), so the port lives with
 * the other catalog repositories and the Design module never sees it.
 *
 * Two properties are contractual rather than incidental:
 *
 * - **Numeric columns cross this boundary as strings.** `numeric` is arbitrary
 *   precision and `physical_width_mm` is a measurement the store authored;
 *   turning it into a double here and back on write would silently re-round the
 *   operator's value. Conversion to `number` happens once, in the projection
 *   that feeds geometry and the wire.
 * - **Nothing here deletes.** IMP-D041 PO-07 makes retirement the removal path
 *   and a referenced row can never be hard-deleted, so no `delete` exists to be
 *   called by mistake.
 */
import type { EmbroideryAreaId, ProductId, ProductSideId } from './placement-hierarchy.port';

/** A `product_sides` row, exactly as stored. */
export interface PlacementSideRow {
  readonly id: ProductSideId;
  readonly productId: ProductId;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly pxPerMm: string;
  readonly retiredAt: Date | undefined;
  readonly supersededById: ProductSideId | undefined;
}

/** An `embroidery_areas` row, exactly as stored. */
export interface PlacementAreaRow {
  readonly id: EmbroideryAreaId;
  readonly productSideId: ProductSideId;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: string;
  readonly boundYPx: string;
  readonly boundWidthPx: string;
  readonly boundHeightPx: string;
  readonly maxWidthMm: string | undefined;
  readonly maxHeightMm: string | undefined;
  readonly retiredAt: Date | undefined;
  readonly supersededById: EmbroideryAreaId | undefined;
}

/** The Product a placement hangs from, with its concurrency token. */
export interface PlacementProduct {
  readonly id: ProductId;
  readonly slug: string;
  readonly status: string;
  readonly updatedAt: Date;
}

/** Everything the Admin read projects: active **and** retired rows. */
export interface PlacementSnapshot {
  readonly product: PlacementProduct;
  readonly sides: readonly PlacementSideRow[];
  readonly areas: readonly PlacementAreaRow[];
}

/** The outcome of the guarded product touch that opens a replace. */
export type PlacementLockResult =
  | { readonly ok: true; readonly product: PlacementProduct }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'VERSION' };

export interface CreateSideInput {
  readonly id: ProductSideId;
  readonly productId: ProductId;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly pxPerMm: string;
}

export interface CreateAreaInput {
  readonly id: EmbroideryAreaId;
  readonly productSideId: ProductSideId;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: string;
  readonly boundYPx: string;
  readonly boundWidthPx: string;
  readonly boundHeightPx: string;
  readonly maxWidthMm: string | undefined;
  readonly maxHeightMm: string | undefined;
}

/**
 * The columns a retained row may be asked to change.
 *
 * Geometry is present because an **unreferenced** row is still freely editable
 * (PO-07 makes it immutable only from first reference). The database decides
 * which world a given row is in; the application does not pre-judge it, because
 * a reference can appear between the check and the write.
 */
export interface UpdateSideFields {
  readonly code?: string;
  readonly name?: string;
  readonly displayOrder?: number;
  readonly backgroundAssetId?: string;
  readonly imageWidthPx?: number;
  readonly imageHeightPx?: number;
  readonly physicalWidthMm?: string;
  readonly physicalHeightMm?: string;
  readonly pxPerMm?: string;
}

export interface UpdateAreaFields {
  readonly code?: string;
  readonly name?: string;
  readonly displayOrder?: number;
  readonly boundXPx?: string;
  readonly boundYPx?: string;
  readonly boundWidthPx?: string;
  readonly boundHeightPx?: string;
  readonly maxWidthMm?: string | null;
  readonly maxHeightMm?: string | null;
}

/** One active side of a published Product, plus whether its background works. */
export interface PublicPlacementSideRow {
  readonly id: ProductSideId;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly pxPerMm: string;
  /**
   * The canonical derivative metadata when this side's `background_asset_id`
   * resolves to a deliverable editor-safe derivative, and `undefined` otherwise
   * (IMP-D044 PO-07; `APP3-B02` §7).
   *
   * All four fields or none. `APP3-B01` carried a boolean here because there was
   * no delivery route to describe; `APP3-B02` needs the intrinsic dimensions a
   * Studio canvas is sized from, and the media type and byte size a client plans
   * a fetch with. What is still absent is every private fact — the asset id, its
   * storage key and the derivative's key and id — so the widening adds the
   * Studio's contract without adding a leak.
   *
   * `undefined` is the same answer for every failing reason, exactly as the
   * boolean's `false` was, and it is what makes `studioEligible` false.
   */
  readonly background: PublicPlacementBackgroundRow | undefined;
}

/**
 * The deliverable background's canonical metadata (IMP-D044 PO-07).
 *
 * Exactly the quartet `asset_derivatives` carries for a READY NORMALIZED row,
 * and nothing else. These are the **derivative's intrinsic** dimensions — the
 * real pixel size of the image a Studio will paint — and are deliberately not
 * the Side's `imageWidthPx`/`imageHeightPx`, which are the operator's authored
 * placement canvas. The two are separate facts and substituting one for the
 * other would put a design on geometry nobody chose.
 */
export interface PublicPlacementBackgroundRow {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly mediaType: string;
  readonly byteSize: number;
}

export interface PublicPlacement {
  readonly productId: ProductId;
  readonly slug: string;
  readonly sides: readonly PublicPlacementSideRow[];
  readonly areas: readonly PlacementAreaRow[];
}

export const PRODUCT_PLACEMENT_REPOSITORY = Symbol('PRODUCT_PLACEMENT_REPOSITORY');

export interface ProductPlacementRepository {
  /** The Admin authoring model: every side and area, retired ones included. */
  findPlacement(productId: ProductId): Promise<PlacementSnapshot | undefined>;

  /**
   * Opens a replace by touching the Product row under its concurrency token.
   *
   * This is the whole concurrency story and it is deliberately one statement:
   * the `WHERE id = ? AND updated_at = ?` proves nothing changed since the
   * caller read, and the resulting row lock serialises two replaces of the same
   * Product for the rest of the transaction. A read, a decision and then a write
   * would let a second replace commit in between and the guard would have proved
   * nothing.
   *
   * @requiresTransaction
   */
  lockProductForReplace(
    productId: ProductId,
    expectedUpdatedAt: Date,
  ): Promise<PlacementLockResult>;

  /** The current rows, read inside the transaction the lock opened. */
  loadPlacement(productId: ProductId): Promise<Omit<PlacementSnapshot, 'product'>>;

  /** @requiresTransaction */
  createSide(input: CreateSideInput): Promise<PlacementSideRow>;
  /** @requiresTransaction */
  createArea(input: CreateAreaInput): Promise<PlacementAreaRow>;
  /** @requiresTransaction */
  updateSide(id: ProductSideId, fields: UpdateSideFields): Promise<void>;
  /** @requiresTransaction */
  updateArea(id: EmbroideryAreaId, fields: UpdateAreaFields): Promise<void>;

  /**
   * Retires a row, optionally naming the row that replaces it.
   *
   * Not a delete and never one: the retired row stays readable so an existing
   * Template, Session or approval snapshot still resolves what it referenced.
   *
   * @requiresTransaction
   */
  retireSide(id: ProductSideId, at: Date, supersededById?: ProductSideId): Promise<void>;
  /** @requiresTransaction */
  retireArea(id: EmbroideryAreaId, at: Date, supersededById?: EmbroideryAreaId): Promise<void>;

  /**
   * The public manifest source: active placement of a publicly visible Product.
   *
   * `undefined` for an unknown slug, a draft, an archived product and a product
   * whose category is not public alike — the row never arrives, so no caller can
   * forget to filter it out.
   */
  findPublicPlacement(slug: string): Promise<PublicPlacement | undefined>;
}
