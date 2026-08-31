/**
 * What the gallery barrel does and does not publish (`APP11-A01`, `APP11-A02`,
 * `APP11-S02`).
 *
 * The boundary is consumer-driven: an operation crosses on the checkpoint that
 * consumes it. `APP11-A01` brought the Admin list and the preview; `APP11-A02`
 * brought the editor's seven; `APP11-S02` brings the public list the Storefront
 * feed reads. That is a rule about *when*, not about *whether*, so what this
 * suite guards is the part that is not a schedule:
 *
 *  - the Admin app can reach exactly the gallery operations a delivered screen
 *    consumes, and each is a real callable function rather than a type-only
 *    re-export that would fail at runtime;
 *  - the Storefront can reach exactly the public gallery reads its delivered
 *    surfaces consume — the feed's list (`APP11-S02`) and the entry page's
 *    detail resolver (`APP11-S03`) — and nothing beyond them: the sitemap
 *    family is technical SEO spanning two domains, so `APP11-S04` released it
 *    on its own `./seo` barrel and it must not appear on this one;
 *  - no gallery **media-byte** operation crosses, public or Admin-anonymous:
 *    image bytes reach a page through a server-composed relative path, never
 *    through application code streaming a `Blob`;
 *  - nothing this checkpoint added is a lifecycle transition the API does not
 *    publish, so the UI cannot offer an archive, a restore or a deletion;
 *  - the lane selector crosses as a **value**, so a picker names its scope from
 *    the contract rather than from a literal that could drift.
 */
import * as galleryBarrel from './gallery';
import * as index from './index';

const surface = index as unknown as Record<string, unknown>;

/** Everything a delivered Admin gallery screen calls. */
const ADMIN_GALLERY_OPERATIONS = [
  // APP11-A01 — the list and its cover preview.
  'adminGalleryEntryList',
  'adminGalleryAssetPreview',
  // APP11-A02 — the editor.
  'adminGalleryEntryCreate',
  'adminGalleryEntryDetail',
  'adminGalleryEntryUpdate',
  'adminGalleryEntryReplaceAssets',
  'adminGalleryEntryPublish',
  'adminGalleryEntryUnpublish',
  'adminGalleryAssetCreate',
] as const;

describe('the Admin gallery surface', () => {
  it('publishes every operation a delivered screen consumes, as a callable', () => {
    for (const operation of ADMIN_GALLERY_OPERATIONS) {
      expect(typeof surface[operation]).toBe('function');
    }
  });

  it('publishes the lifecycle vocabulary as values, not as types alone', () => {
    // The editor branches on the status and the list filters by it; deriving
    // either from a hand-kept list is how the two drift apart.
    expect(surface['AdminGalleryEntryListStatus']).toEqual({
      DRAFT: 'DRAFT',
      PUBLISHED: 'PUBLISHED',
      ARCHIVED: 'ARCHIVED',
    });
    expect(surface['AdminGalleryEntryDetailResponseStatus']).toEqual({
      DRAFT: 'DRAFT',
      PUBLISHED: 'PUBLISHED',
      ARCHIVED: 'ARCHIVED',
    });
  });

  it('publishes the asset lane selector as a value', () => {
    // Both pickers name their lane explicitly. An omitted scope means CATALOG,
    // so a picker that relied on the default would look exactly like one that
    // worked while offering the wrong images.
    expect(surface['AdminAssetListScope']).toEqual({ CATALOG: 'CATALOG', GALLERY: 'GALLERY' });
    expect(surface['AdminAssetDetailScope']).toEqual({ CATALOG: 'CATALOG', GALLERY: 'GALLERY' });
  });

  it('publishes the asset lane vocabulary a consumer must compare against', () => {
    // The intake enums are single-member by design and cannot name the gallery
    // lane a read now returns, so the response enums cross beside them.
    expect(surface['AdminAssetDetailResponseKind']).toEqual({
      CATALOG_MEDIA: 'CATALOG_MEDIA',
      GALLERY_MEDIA: 'GALLERY_MEDIA',
    });
    expect(surface['AdminAssetDetailResponseClassification']).toEqual({
      PRODUCTION_SENSITIVE: 'PRODUCTION_SENSITIVE',
      PUBLIC: 'PUBLIC',
    });
  });
});

describe('the public gallery surface', () => {
  it('publishes the reads the delivered Storefront screens consume', () => {
    // Consumer-driven release: the list crossed with `APP11-S02` (the feed at
    // /bo-suu-tap) and the detail resolver crosses with `APP11-S03` (the entry
    // page at /bo-suu-tap/[slug]) — not when `APP11-B03` delivered either.
    expect(typeof surface['publicGalleryEntryList']).toBe('function');
    expect(typeof surface['publicGalleryEntryDetail']).toBe('function');
  });
});

describe('what the boundary never publishes', () => {
  it('withholds every public gallery operation no delivered surface consumes', () => {
    // `publicGalleryEntryAsset` streams bytes as a Blob. The browser reaches
    // that route by rendering the relative `coverUrl`/`assets[].url` the list
    // and detail responses already return, so an exported function would be one
    // no correct consumer could call — an `<img src>` cannot be a Blob. This is
    // not a scheduling rule and `APP11-S03` does not relax it.
    expect(surface['publicGalleryEntryAsset']).toBeUndefined();
  });

  it('keeps the sitemap family off the gallery barrel', () => {
    // The operation is released — `APP11-S04` consumes it — but from `./seo`,
    // because it answers one question spanning Catalog and Gallery and belongs
    // to neither. So what this asserts is where it lives, not whether it
    // exists: the package root re-exports both barrels, and only the module
    // namespace of this one can tell them apart.
    for (const name of Object.keys(galleryBarrel)) {
      expect(name).not.toMatch(/^publicSitemap/);
    }
    // And it really is on the package boundary, from the barrel that owns it.
    expect(typeof surface['publicSitemapEntryList']).toBe('function');
  });

  it('publishes no gallery lifecycle transition the API does not have', () => {
    // There is no archive, restore or asset-deletion operation to expose, which
    // is why the editor can offer none. `FU-APP11-B03A-01` stays open.
    for (const absent of [
      'adminGalleryEntryArchive',
      'adminGalleryEntryRestore',
      'adminGalleryEntryDelete',
      'adminGalleryAssetDelete',
    ]) {
      expect(surface[absent]).toBeUndefined();
    }
  });

  it('exposes no storage, credential or provider surface', () => {
    for (const name of Object.keys(surface)) {
      expect(name).not.toMatch(/bucket|minio|s3|presign|signedUrl|storageKey/i);
    }
  });
});
