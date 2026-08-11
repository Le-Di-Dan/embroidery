/**
 * TanStack Query keys for the Studio bootstrap route (`APP3-S01`).
 *
 * The compatibility triple is part of every Template key, and that is a
 * correctness requirement rather than a caching nicety. `APP3-B05` matches a
 * Template against one exact `productId + productSideId + embroideryAreaId` and
 * nothing wider, and it binds each keyset cursor to the scope it was issued
 * under. A key that omitted any of the three would let a response for one Side
 * settle into the cache of another, and would eventually replay a cursor the
 * server refuses.
 *
 * Because the triple is in the key, changing Side or Area does not merely
 * invalidate: it addresses a **different** query. An in-flight request for the
 * old placement can no longer write into the new one's cache entry no matter
 * when it lands, which is what makes the stale-response rule structural instead
 * of a race a component has to remember to guard.
 */
import type { StudioPlacementTriple } from './studio-placement';

/**
 * Page size for the Template picker. The API's own maximum is 100; requesting
 * explicitly keeps the client's window independent of a server-side default.
 */
export const STUDIO_TEMPLATE_PAGE_SIZE = 12;

function tripleKey(triple: StudioPlacementTriple): readonly string[] {
  return [triple.productId, triple.productSideId, triple.embroideryAreaId];
}

export const studioQueryKeys = {
  all: ['studio'] as const,
  placement: (slug: string) => [...studioQueryKeys.all, 'placement', slug] as const,
  templateList: (triple: StudioPlacementTriple) =>
    [...studioQueryKeys.all, 'templates', ...tripleKey(triple)] as const,
  templateDetail: (triple: StudioPlacementTriple, templateSlug: string) =>
    [...studioQueryKeys.all, 'template-detail', ...tripleKey(triple), templateSlug] as const,
  /**
   * The preview is keyed by Template slug **and version** as well as the asset,
   * because B05A only serves the version that is public right now: a key
   * without the version would keep serving a blob for a version the server has
   * already retired.
   */
  templateAsset: (templateSlug: string, version: number, assetId: string) =>
    [...studioQueryKeys.all, 'template-asset', templateSlug, String(version), assetId] as const,
  /**
   * The stage background (`APP3-S02`), keyed by the Product slug and the Side
   * code the **Session** resolved — the same pair that addresses the route.
   *
   * A key that named only the Product would let one Side's artwork be served
   * under another's, which on a stage is not a cosmetic slip: every element
   * would be drawn over the wrong garment.
   */
  sideBackground: (productSlug: string, sideCode: string) =>
    [...studioQueryKeys.all, 'side-background', productSlug, sideCode] as const,
  /**
   * One upload's processing state (`APP3-S06`), keyed by Session **and** Asset.
   *
   * Both halves, because both address the route. A key naming only the Asset
   * would let one Session's answer settle into another's cache entry on a
   * resume — and the answer it would settle as is `READY`, which the Studio acts
   * on by placing a picture.
   */
  sessionAssetStatus: (sessionId: string, assetId: string) =>
    [...studioQueryKeys.all, 'session-asset-status', sessionId, assetId] as const,
  /**
   * The editor-safe bytes of one Session image (`APP3-S06`).
   *
   * Keyed by Session, Asset **and** derivative. The derivative is in the key
   * because a replacement changes it: without it, replacing an image would go on
   * rendering the previous picture's cached blob under the new media identity,
   * which is the exact "stale image under a new element" failure the object-URL
   * lifecycle exists to prevent.
   */
  sessionAssetPreview: (sessionId: string, assetId: string, derivativeId: string) =>
    [...studioQueryKeys.all, 'session-asset-preview', sessionId, assetId, derivativeId] as const,
} as const;
