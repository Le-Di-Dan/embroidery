/**
 * The two Admin read operations (`APP2-B01` §19).
 *
 * Both are scoped to `CATALOG_MEDIA` + `PRODUCTION_SENSITIVE` in the query
 * itself rather than filtered after loading. A post-filter would still have
 * fetched a customer's private asset into the process, and a paging bug would
 * then leak it; scoping in SQL means the row is never selected at all.
 *
 * A scoped miss is reported as `ASSET_NOT_FOUND`, exactly like a non-existent
 * id — otherwise the endpoint would confirm the existence of assets the caller
 * is not allowed to see.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, InvalidCursorError, resolveLimit } from '@embroidery/persistence';
import type { AssetState } from '@embroidery/database';

import { assetIntakeError } from '../domain/asset-intake.errors';
import { INTAKE_ASSET_KIND, INTAKE_CLASSIFICATION } from '../domain/asset-intake.policy';
import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../domain/repositories/asset.repository';
import { toDetailView, type AssetDetailView, type AssetListView } from './asset-projection';

const SCOPE = { kind: INTAKE_ASSET_KIND, classification: INTAKE_CLASSIFICATION } as const;

export interface ListAssetsInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: AssetState | undefined;
  readonly mediaType?: string | undefined;
}

@Injectable()
export class AssetCatalogQuery {
  constructor(@Inject(ASSET_REPOSITORY) private readonly repository: AssetRepository) {}

  async detail(assetId: string): Promise<AssetDetailView> {
    const asset = await this.repository.findScoped(assetId as AssetId, SCOPE);
    if (asset === undefined) {
      throw assetIntakeError('ASSET_NOT_FOUND');
    }
    return toDetailView(asset);
  }

  async list(input: ListAssetsInput): Promise<AssetListView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const rows = await this.repository.listScoped({
      filter: {
        ...SCOPE,
        status: input.status,
        mimeType: input.mediaType,
      },
      after,
      limit,
    });

    // The cursor carries the ordering values of the last row returned, so the
    // next page resumes at exactly the boundary this page stopped at.
    const page = buildPage(rows, limit, (asset: Asset) => ({
      sortValue: asset.createdAt.toISOString(),
      tieBreaker: asset.id,
    }));

    return {
      items: page.items.map(toDetailView),
      nextCursor: page.nextCursor,
      hasNext: page.nextCursor !== undefined,
    };
  }
}

/**
 * Decodes the opaque cursor into an ordering position.
 *
 * A malformed cursor is a client error, not a server fault, and it must not be
 * silently treated as "start from the beginning" — a caller paging through a
 * list would silently restart and process every row twice.
 */
function decodePosition(
  cursor: string | undefined,
): { readonly createdAt: Date; readonly id: string } | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidCursorError();
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }
}
