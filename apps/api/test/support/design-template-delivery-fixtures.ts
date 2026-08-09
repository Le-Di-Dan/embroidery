/**
 * Seeding for published Template asset delivery (`APP3-B05A` §16, §21).
 *
 * `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` is still open: nothing in the
 * delivered system uploads a `TEMPLATE_SOURCE` original, and `APP3-B05A`
 * deliberately does not invent one — a production intake API written to make a
 * test pass is a surface nobody reviewed. So the Asset row and its normalized
 * derivative are inserted directly, exactly as `product-placement-fixtures.ts`
 * does for a Side background, and the object is written at the key the row
 * records so the two agree.
 *
 * Everything *above* the Asset goes through accepted boundaries: the Template is
 * created, scoped, saved and published by the real `APP3-B03`/`B03A`/`B03B`/`B04`
 * services. That matters — `design_template_assets` is written by the real save
 * path, so the association under test is the one production produces rather than
 * one this file invented.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { ApiIntegrationTestContext } from './api-integration-context';

/** Mirrors `public-media-context.ts`, which writes the object this addresses. */
function derivativeKey(assetId: string, kind: string): string {
  return `development/derivatives/${assetId}/${kind}.webp`;
}

const newId = (): string => crypto.randomUUID();

export interface SeedTemplateAssetOptions {
  readonly byteSize: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly mediaType?: string;
  readonly assetKind?: string;
  readonly assetClassification?: string;
  readonly assetStatus?: string;
  readonly derivativeKind?: string | null;
  readonly derivativeStatus?: string;
  readonly watermarked?: boolean;
  readonly withoutMetadata?: boolean;
}

export interface SeededTemplateAsset {
  readonly assetId: string;
  readonly derivativeId: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * One Template-artwork original with its editor-safe derivative row.
 *
 * The defaults are the eligible lane — `TEMPLATE_SOURCE` + `PRODUCTION_SENSITIVE`
 * + `ACCEPTED`, and a `READY`, unwatermarked `NORMALIZED` derivative carrying the
 * whole quartet. Every override exists so one term of the authorization can be
 * broken on its own.
 */
export async function seedTemplateAsset(
  ctx: ApiIntegrationTestContext,
  options: SeedTemplateAssetOptions,
): Promise<SeededTemplateAsset> {
  const assetId = newId();
  const derivativeId = newId();
  const widthPx = options.widthPx ?? 800;
  const heightPx = options.heightPx ?? 600;

  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
    values (${assetId}, ${options.assetKind ?? 'TEMPLATE_SOURCE'},
            ${options.assetClassification ?? 'PRODUCTION_SENSITIVE'},
            ${`development/originals/${assetId}/original.png`}, 'image/png', 51200,
            ${`sha256:${'a'.repeat(64)}`}, ${options.assetStatus ?? 'ACCEPTED'})
  `);

  if (options.derivativeKind === null) {
    return { assetId, derivativeId, widthPx, heightPx };
  }

  const kind = options.derivativeKind ?? 'NORMALIZED';
  const status = options.derivativeStatus ?? 'READY';
  const withMetadata = options.withoutMetadata !== true;

  await ctx.database.client.db.execute(sql`
    insert into asset_derivatives
      (id, asset_id, kind, status, storage_key, is_watermarked,
       width_px, height_px, media_type, byte_size)
    values (${derivativeId}, ${assetId}, ${kind}, ${status},
            ${status === 'READY' ? derivativeKey(assetId, kind) : null},
            ${options.watermarked === true},
            ${withMetadata ? widthPx : null},
            ${withMetadata ? heightPx : null},
            ${withMetadata ? (options.mediaType ?? 'image/webp') : null},
            ${withMetadata ? options.byteSize : null})
  `);

  return { assetId, derivativeId, widthPx, heightPx };
}

/** The canonical placement snapshot the seeded Product/Side/Area produces. */
export interface TemplatePlacement {
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

/**
 * A structurally valid v1 document placing the given artwork inside the area.
 *
 * The transform is well inside the seeded 400×300 px area at (100, 100), so
 * `GRD-T01`'s `WITHIN_AREA` condition holds and publication is refused for no
 * reason this suite did not intend.
 */
export function templateDocument(
  placement: TemplatePlacement,
  images: readonly SeededTemplateAsset[],
): unknown {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: placement.productSideId,
      embroideryAreaId: placement.embroideryAreaId,
      canvasWidthPx: 1000,
      canvasHeightPx: 1000,
      physicalWidthMm: 200,
      physicalHeightMm: 200,
      pxPerMm: 5,
    },
    elements: images.map((image, index) => ({
      id: `image-${String(index + 1)}`,
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: {
        x: 120 + index * 20,
        y: 120,
        width: 80,
        height: 60,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
      },
      assetId: image.assetId,
      derivativeId: image.derivativeId,
      intrinsicWidthPx: image.widthPx,
      intrinsicHeightPx: image.heightPx,
    })),
  };
}

/** The delivery address for one asset of one published Template version. */
export function templateAssetPath(slug: string, version: number, assetId: string): string {
  return `/api/public/design-templates/${slug}/versions/${String(version)}/assets/${assetId}`;
}
