/**
 * Row → domain mapping for the Admin product-draft surface.
 *
 * The single boundary at which a joined catalog row becomes a domain object.
 * Money stays a string the whole way through: `numeric` must never be turned
 * into a JavaScript number (`CLAUDE.md` §5, ADR-DB1 money model).
 *
 * Nullable columns become `undefined` rather than `null`, so the domain has one
 * absent value instead of two.
 */
import type { ProductState } from '@embroidery/database';

import type {
  ProductDraft,
  ProductDraftId,
  ProductDraftMedia,
} from '../../domain/repositories/product-draft.repository';

/** The product row joined to its category, as the repository selects it. */
export interface ProductDraftJoinedRow {
  readonly id: string;
  readonly categoryId: string;
  readonly categorySlug: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly status: string;
  readonly displayOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toProductDraft(row: ProductDraftJoinedRow): ProductDraft {
  return {
    id: row.id as ProductDraftId,
    categoryId: row.categoryId,
    categorySlug: row.categorySlug,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    basePriceAmount: row.basePriceAmount,
    currencyCode: row.currencyCode,
    status: row.status as ProductState,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One media link joined to the safe identity fields of its Asset. */
export interface ProductDraftMediaJoinedRow {
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
  readonly mediaType: string;
  readonly byteSize: bigint;
  readonly status: string;
  readonly assetCreatedAt: Date;
}

export function toProductDraftMedia(row: ProductDraftMediaJoinedRow): ProductDraftMedia {
  return {
    assetId: row.assetId,
    role: row.role,
    displayOrder: row.displayOrder,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    status: row.status,
    assetCreatedAt: row.assetCreatedAt,
  };
}
