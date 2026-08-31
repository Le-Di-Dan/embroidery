/**
 * What the gallery barrel does and does not publish (`APP11-A01`, `APP11-A02`).
 *
 * The boundary is consumer-driven: an operation crosses on the checkpoint that
 * consumes it. `APP11-A01` brought the list and the preview; `APP11-A02` brings
 * the editor's seven. That is a rule about *when*, not about *whether*, so what
 * this suite guards is the part that is not a schedule:
 *
 *  - the Admin app can reach exactly the gallery operations a delivered screen
 *    consumes, and each is a real callable function rather than a type-only
 *    re-export that would fail at runtime;
 *  - the **public** gallery and sitemap operations never cross into this
 *    boundary at all — an Admin screen reading the storefront's view of the
 *    same rows would be a second, unauthenticated source of truth;
 *  - nothing this checkpoint added is a lifecycle transition the API does not
 *    publish, so the UI cannot offer an archive, a restore or a deletion;
 *  - the lane selector crosses as a **value**, so a picker names its scope from
 *    the contract rather than from a literal that could drift.
 */
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

describe('what the boundary never publishes', () => {
  it('withholds every public gallery and sitemap operation', () => {
    // Not a scheduling decision. This barrel serves the Admin app, and no
    // checkpoint makes a second, unauthenticated view of the same rows correct.
    for (const name of Object.keys(surface)) {
      expect(name).not.toMatch(/^publicGallery/);
      expect(name).not.toMatch(/^publicSitemap/);
    }
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
