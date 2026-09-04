/**
 * The media lane of the `APP12-H06` SEO fixture.
 *
 * Split out of `h06-seo-fixture.mjs` when that file crossed the 400-line source
 * limit, and split here rather than at an arbitrary line because these are the
 * two things the SEO matrix needs but does not reason about: how a real WebP is
 * produced, and what rows an Asset needs before a public delivery route will
 * serve it. The catalog file next door decides *which* Products and categories
 * exist and *what* they claim; this one decides only that an image is real.
 */
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';

export const MEDIA_TYPE = 'image/webp';

/**
 * The classification each media lane's parent Asset carries.
 *
 * Catalog media is `PRODUCTION_SENSITIVE` — the original is never served, only
 * the WebP derivative is — while gallery media is `PUBLIC`. Both delivery
 * repositories compare this column exactly, so one value used for both yields a
 * 200 page with an empty `media` array and an SEO run that proves nothing about
 * images. Recorded by `APP12-H05`, which lost a first seeding to it.
 */
const ASSET_CLASSIFICATION_BY_KIND = Object.freeze({
  CATALOG_MEDIA: 'PRODUCTION_SENSITIVE',
  GALLERY_MEDIA: 'PUBLIC',
});

/** The two catalog display derivatives the public renditions map to. */
const DERIVATIVE_SPECS = Object.freeze([
  Object.freeze({ kind: 'THUMBNAIL', rendition: 'thumbnail', edgePx: 400 }),
  Object.freeze({ kind: 'CATALOG_PREVIEW', rendition: 'catalog-preview', edgePx: 800 }),
]);

/**
 * A deterministic low-frequency RGB field.
 *
 * H06 measures head tags rather than byte budgets, so this is deliberately
 * simpler and smaller than `h05-media-generator.mjs`: what the run needs from an
 * image is that it is a **real, retrievable** WebP with honest intrinsic
 * dimensions, which is what `§10` asks and all it asks. Reusing the H05 pool
 * would have generated 12 photographic sources at 1600px to prove a
 * `content-type`.
 */
function rawField(edgePx, seed) {
  const data = Buffer.allocUnsafe(edgePx * edgePx * 3);
  for (let y = 0; y < edgePx; y += 1) {
    for (let x = 0; x < edgePx; x += 1) {
      const offset = (y * edgePx + x) * 3;
      data[offset] = (x + seed * 40) % 256;
      data[offset + 1] = (y + seed * 25) % 256;
      data[offset + 2] = (x + y) % 256;
    }
  }
  return data;
}

/**
 * One image, at both display sizes, as real WebP bytes.
 *
 * @param {{ sharp: unknown, seed: number }} params
 */
export async function generateRenditions({ sharp, seed }) {
  const renditions = [];
  for (const spec of DERIVATIVE_SPECS) {
    const body = await sharp(rawField(spec.edgePx, seed), {
      raw: { width: spec.edgePx, height: spec.edgePx, channels: 3 },
    })
      .webp({ quality: 80 })
      .toBuffer();
    renditions.push({
      kind: spec.kind,
      rendition: spec.rendition,
      widthPx: spec.edgePx,
      heightPx: spec.edgePx,
      body,
      checksum: `sha256:${createHash('sha256').update(body).digest('hex')}`,
    });
  }
  return renditions;
}

/**
 * Inserts one Asset with both derivatives `READY`, and records the object
 * bodies the caller must put in storage.
 *
 * `width_px`/`height_px` are the derivative's true dimensions — the intrinsic
 * facts `APP12-H05-C1` made the public contract publish. A fixture that declared
 * a size it did not produce would be the kind of harness fault H05 §19 names.
 */
export async function insertAsset(client, { kind, storagePrefix, renditions, objects }) {
  const assetId = randomUUID();
  const derivatives = renditions.map((rendition) => {
    const storageKey = `${storagePrefix}/${assetId}/${rendition.rendition}.webp`;
    objects.push({ storageKey, body: rendition.body, contentType: MEDIA_TYPE });
    return { ...rendition, id: randomUUID(), storageKey };
  });
  const largest = derivatives.reduce((a, b) => (a.body.byteLength >= b.body.byteLength ? a : b));

  await client.query(
    `insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'ACCEPTED')`,
    [
      assetId,
      kind,
      ASSET_CLASSIFICATION_BY_KIND[kind],
      // The uploaded ORIGINAL, which no public route ever serves.
      `${storagePrefix}/${assetId}/source.webp`,
      MEDIA_TYPE,
      largest.body.byteLength,
      largest.checksum,
    ],
  );

  for (const derivative of derivatives) {
    await client.query(
      `insert into asset_derivatives
         (id, asset_id, kind, status, storage_key, checksum, is_watermarked,
          width_px, height_px, media_type, byte_size)
       values ($1, $2, $3, 'READY', $4, $5, false, $6, $7, $8, $9)`,
      [
        derivative.id,
        assetId,
        derivative.kind,
        derivative.storageKey,
        derivative.checksum,
        derivative.widthPx,
        derivative.heightPx,
        MEDIA_TYPE,
        derivative.body.byteLength,
      ],
    );
  }

  return assetId;
}
