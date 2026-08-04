/**
 * Live-database fixtures for the `APP3-B01` placement suites.
 *
 * Products come from the real `ProductDraftService`, so a fixture can never
 * build a product the delivered API could not. Assets and derivatives are
 * seeded with explicit SQL because APP3 has no editor-safe production path yet —
 * `APP3-W01` owns it — and that is also the only way to reproduce the *partial*
 * states the manifest must refuse.
 *
 * The canonical metadata quartet is written with the derivative rather than
 * after it: `ck_asset_derivatives__ready_normalized_metadata` refuses a READY
 * NORMALIZED row without all four, which is exactly the invariant IMP-D044
 * PO-12 asked for and the reason the manifest never has to guess a size.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import type { ApiIntegrationTestContext } from './api-integration-context';
import type { SideCommand } from '../../src/modules/catalog/application/product-placement.plan';

export interface SeedBackgroundOptions {
  /** Defaults to the editor-safe kind; pass another to prove it is refused. */
  readonly derivativeKind?: string | null;
  readonly derivativeStatus?: string;
  readonly assetStatus?: string;
  readonly mimeType?: string;
  readonly watermarked?: boolean;
  /** Omits the canonical quartet, which only a non-READY row may do. */
  readonly withoutMetadata?: boolean;
}

/**
 * Seeds one side-background asset in the `CATALOG_MEDIA` lane.
 *
 * Returns the asset id. With the defaults it is fully usable: ACCEPTED source,
 * a READY NORMALIZED derivative, unwatermarked, carrying width, height, media
 * type and byte size.
 */
export async function seedBackgroundAsset(
  ctx: ApiIntegrationTestContext,
  options: SeedBackgroundOptions = {},
): Promise<string> {
  const id = newId();
  const mimeType = options.mimeType ?? 'image/png';

  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
    values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
            ${`development/originals/${id}/original.png`}, ${mimeType}, 51200,
            ${`sha256:${'a'.repeat(64)}`}, ${options.assetStatus ?? 'ACCEPTED'})
  `);

  if (options.derivativeKind === null) {
    return id;
  }

  const kind = options.derivativeKind ?? 'NORMALIZED';
  const status = options.derivativeStatus ?? 'READY';
  const withMetadata = options.withoutMetadata !== true;

  await ctx.database.client.db.execute(sql`
    insert into asset_derivatives
      (id, asset_id, kind, status, storage_key, is_watermarked,
       width_px, height_px, media_type, byte_size)
    values (${newId()}, ${id}, ${kind}, ${status},
            ${status === 'READY' ? `development/derivatives/${id}/${kind}.webp` : null},
            ${options.watermarked === true},
            ${withMetadata ? 1000 : null}, ${withMetadata ? 1000 : null},
            ${withMetadata ? 'image/webp' : null}, ${withMetadata ? 40960 : null})
  `);

  return id;
}

/** A consistent 1000×1000 px / 200×200 mm side at 5 px per mm. */
export function sideCommand(overrides: Partial<SideCommand> = {}): SideCommand {
  return {
    code: 'front',
    name: 'Mặt trước',
    displayOrder: 0,
    backgroundAssetId: overrides.backgroundAssetId ?? '',
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    physicalWidthMm: 200,
    physicalHeightMm: 200,
    pxPerMm: 5,
    areas: [],
    ...overrides,
  };
}

/** An area well inside a 1000×1000 canvas. */
export function areaCommand(
  overrides: Partial<SideCommand['areas'][number]> = {},
): SideCommand['areas'][number] {
  return {
    code: 'chest',
    name: 'Ngực',
    displayOrder: 0,
    boundXPx: 100,
    boundYPx: 100,
    boundWidthPx: 400,
    boundHeightPx: 300,
    ...overrides,
  };
}

/**
 * Marks a Side as referenced, the way a Template would.
 *
 * Written with SQL because APP3 has no Template write API yet (`APP3-B03` owns
 * it) and the protection guard must still be provable now: the whole point of
 * IMP-D041 PO-07 is what happens *after* something references a placement.
 */
export async function seedTemplateReferencing(
  ctx: ApiIntegrationTestContext,
  productId: string,
  productSideId: string,
  embroideryAreaId: string,
): Promise<string> {
  const id = newId();
  await ctx.database.client.db.execute(sql`
    insert into design_templates
      (id, product_id, product_side_id, embroidery_area_id, name, slug, status, current_version)
    values (${id}, ${productId}, ${productSideId}, ${embroideryAreaId},
            ${`Mẫu thêu ${id.slice(-6)}`}, ${`mau-theu-${id.slice(-6)}`}, 'DRAFT', 1)
  `);
  return id;
}
