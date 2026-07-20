/**
 * CTX-CNT and CTX-GAL persistence against a real PostgreSQL instance
 * (DB7-CP3).
 *
 * TBL-064..TBL-069. The agreement guard G-DB7-01 and the effective-version
 * resolution GRD-008 depends on are the substantive parts; pages, redirects
 * and gallery entries are here because they complete the wave-A table
 * ownership.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AssetModule } from '../../../asset/asset.module';
import { ASSET_REPOSITORY } from '../../../asset/domain/repositories/asset.repository';
import type { AssetId, AssetRepository } from '../../../asset/domain/repositories/asset.repository';
import { GalleryModule } from '../../../gallery/gallery.module';
import { GALLERY_ENTRY_REPOSITORY } from '../../../gallery/domain/repositories/gallery-entry.repository';
import type {
  GalleryEntryId,
  GalleryEntryRepository,
} from '../../../gallery/domain/repositories/gallery-entry.repository';
import { ContentModule } from '../../content.module';
import { AGREEMENT_REPOSITORY } from '../../domain/repositories/agreement.repository';
import type {
  AgreementId,
  AgreementRepository,
  AgreementVersionId,
} from '../../domain/repositories/agreement.repository';
import {
  CONTENT_PAGE_REPOSITORY,
  REDIRECT_RULE_REPOSITORY,
} from '../../domain/repositories/content-page.repository';
import type {
  ContentPageId,
  ContentPageRepository,
  RedirectRuleRepository,
} from '../../domain/repositories/content-page.repository';

const HASH = `sha256:${'b'.repeat(64)}`;
const HOUR_MS = 60 * 60 * 1000;

describe('content and gallery persistence (integration)', () => {
  let context: PersistenceTestContext;
  let agreements: AgreementRepository;
  let pages: ContentPageRepository;
  let redirects: RedirectRuleRepository;
  let gallery: GalleryEntryRepository;
  let assets: AssetRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-content', [
      ContentModule,
      GalleryModule,
      AssetModule,
    ]);
    agreements = context.get(AGREEMENT_REPOSITORY);
    pages = context.get(CONTENT_PAGE_REPOSITORY);
    redirects = context.get(REDIRECT_RULE_REPOSITORY);
    gallery = context.get(GALLERY_ENTRY_REPOSITORY);
    assets = context.get(ASSET_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  async function seedAgreement(type = 'TERMS_OF_SERVICE'): Promise<AgreementId> {
    const agreement = await context.inTransaction(() =>
      agreements.ensureAgreement(type, 'Terms of Service'),
    );
    return agreement.id;
  }

  async function addAndPublish(
    agreementId: AgreementId,
    effectiveFrom = new Date(Date.now() - HOUR_MS),
  ) {
    const id = newId() as AgreementVersionId;
    return context.inTransaction(async () => {
      await agreements.addVersion({ id, agreementId, content: 'Terms text', language: 'vi' });
      return agreements.publishVersion(id, HASH, effectiveFrom);
    });
  }

  describe('agreement versioning', () => {
    it('creates the container idempotently', async () => {
      const first = await seedAgreement();
      const second = await seedAgreement();

      expect(second).toBe(first);
    });

    it('publishes a version, hashes it and makes it current', async () => {
      const agreementId = await seedAgreement();

      const published = await addAndPublish(agreementId);

      expect(published.status).toBe('PUBLISHED');
      expect(published.contentHash).toBe(HASH);
      await expect(agreements.currentVersion('TERMS_OF_SERVICE')).resolves.toMatchObject({
        id: published.id,
      });
    });

    it('supersedes the previous version so only one is ever published', async () => {
      const agreementId = await seedAgreement();
      const first = await addAndPublish(agreementId);

      const second = await addAndPublish(agreementId);

      expect(second.version).toBe(2);
      await expect(agreements.findVersion(first.id)).resolves.toMatchObject({
        status: 'SUPERSEDED',
      });
      await expect(agreements.currentVersion('TERMS_OF_SERVICE')).resolves.toMatchObject({
        id: second.id,
      });
    });

    it('refuses to publish a version twice, so a retired term cannot be resurrected', async () => {
      const agreementId = await seedAgreement();
      const published = await addAndPublish(agreementId);

      const error = await failureOf(() =>
        context.inTransaction(() => agreements.publishVersion(published.id, HASH, new Date())),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('refuses a version belonging to another agreement (G-DB7-01)', async () => {
      const mine = await seedAgreement('TERMS_OF_SERVICE');
      const theirs = await seedAgreement('PRIVACY_POLICY');
      const theirVersion = await addAndPublish(theirs);

      // The FK proves the version exists; only this read proves whose it is.
      const error = await failureOf(() =>
        context.inTransaction(() => agreements.setCurrentVersion(mine, theirVersion.id)),
      );

      expect(error.code).toBe('VERSION_BELONGS_TO_ANOTHER_AGREEMENT');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('refuses to make a draft current', async () => {
      const agreementId = await seedAgreement();
      const draftId = newId() as AgreementVersionId;
      await context.inTransaction(() =>
        agreements.addVersion({ id: draftId, agreementId, content: 'Draft', language: 'vi' }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => agreements.setCurrentVersion(agreementId, draftId)),
      );

      expect(error.code).toBe('VERSION_NOT_PUBLISHED');
    });

    it('clears the current pointer when the live version is withdrawn', async () => {
      const agreementId = await seedAgreement();
      const published = await addAndPublish(agreementId);

      await context.inTransaction(() => agreements.withdrawVersion(published.id, 'legal review'));

      // An approval resolving the effective set must not capture a pulled term.
      await expect(agreements.currentVersion('TERMS_OF_SERVICE')).resolves.toBeUndefined();
    });

    it('rejects a blank withdrawal reason, which the CHECK alone would accept', async () => {
      const agreementId = await seedAgreement();
      const published = await addAndPublish(agreementId);

      // `ck_agreement_versions__withdraw_reason_required` is a NOT NULL test,
      // and '' is not null — so the database would happily record a withdrawal
      // with no stated reason. The application closes that gap.
      const error = await failureOf(() =>
        context.inTransaction(() => agreements.withdrawVersion(published.id, '   ')),
      );

      expect(error.code).toBe('WITHDRAW_REASON_REQUIRED');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
      // The version is untouched: a rejected withdrawal must not half-apply.
      await expect(agreements.findVersion(published.id)).resolves.toMatchObject({
        status: 'PUBLISHED',
      });
    });

    it('numbers versions per agreement without gaps', async () => {
      const agreementId = await seedAgreement();

      await addAndPublish(agreementId);
      const second = await addAndPublish(agreementId);
      const third = await addAndPublish(agreementId);

      expect([second.version, third.version]).toEqual([2, 3]);
    });
  });

  describe('effective version resolution (GRD-008)', () => {
    it('returns the in-force version of each requested type in one query', async () => {
      const terms = await seedAgreement('TERMS_OF_SERVICE');
      const privacy = await seedAgreement('PRIVACY_POLICY');
      await addAndPublish(terms);
      await addAndPublish(privacy);

      const effective = await agreements.effectiveVersions(
        ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'],
        new Date(),
      );

      expect(effective).toHaveLength(2);
      expect(effective.every((version) => version.contentHash === HASH)).toBe(true);
    });

    it('omits a version not yet effective', async () => {
      const terms = await seedAgreement('TERMS_OF_SERVICE');
      await addAndPublish(terms, new Date(Date.now() + HOUR_MS));

      await expect(agreements.effectiveVersions(['TERMS_OF_SERVICE'], new Date())).resolves.toEqual(
        [],
      );
    });

    it('omits a type that has no published version, rather than inventing one', async () => {
      await seedAgreement('TERMS_OF_SERVICE');

      await expect(agreements.effectiveVersions(['TERMS_OF_SERVICE'], new Date())).resolves.toEqual(
        [],
      );
    });

    it('returns nothing for an empty request without querying', async () => {
      await expect(agreements.effectiveVersions([], new Date())).resolves.toEqual([]);
    });
  });

  describe('content pages and redirects', () => {
    it('creates and publishes a page', async () => {
      const id = newId() as ContentPageId;
      await context.inTransaction(() =>
        pages.create({ id, pageType: 'FAQ', slug: 'faq', title: 'FAQ' }),
      );

      const published = await context.inTransaction(() => pages.changeStatus(id, 'PUBLISHED'));

      expect(published.status).toBe('PUBLISHED');
      await expect(pages.findByTypeAndSlug('FAQ', 'faq')).resolves.toMatchObject({ id });
    });

    it('allows the same slug under different page types', async () => {
      await context.inTransaction(() =>
        pages.create({
          id: newId() as ContentPageId,
          pageType: 'FAQ',
          slug: 'shared',
          title: 'A',
        }),
      );

      await expect(
        context.inTransaction(() =>
          pages.create({
            id: newId() as ContentPageId,
            pageType: 'LANDING',
            slug: 'shared',
            title: 'B',
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a duplicate slug within one page type', async () => {
      await context.inTransaction(() =>
        pages.create({ id: newId() as ContentPageId, pageType: 'FAQ', slug: 'dup', title: 'A' }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          pages.create({ id: newId() as ContentPageId, pageType: 'FAQ', slug: 'dup', title: 'B' }),
        ),
      );

      expect(error.code).toBe('DUPLICATE_SLUG');
    });

    it('re-points an existing redirect instead of rejecting it', async () => {
      await context.inTransaction(() =>
        redirects.upsert({ sourcePath: '/old', targetPath: '/new', redirectKind: 'PERMANENT' }),
      );

      await context.inTransaction(() =>
        redirects.upsert({ sourcePath: '/old', targetPath: '/newer', redirectKind: 'PERMANENT' }),
      );

      await expect(redirects.resolve('/old')).resolves.toMatchObject({ targetPath: '/newer' });
    });

    it('stops resolving a deactivated redirect but keeps the row', async () => {
      await context.inTransaction(() =>
        redirects.upsert({ sourcePath: '/gone', targetPath: '/here', redirectKind: 'TEMPORARY' }),
      );

      await context.inTransaction(() => redirects.deactivate('/gone'));

      await expect(redirects.resolve('/gone')).resolves.toBeUndefined();
    });

    it('rejects an unknown redirect kind', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          redirects.upsert({
            sourcePath: '/bad',
            targetPath: '/x',
            redirectKind: 'SIDEWAYS' as never,
          }),
        ),
      );

      expect(error.diagnostics.constraint).toBe('ck_redirect_rules__kind_allowed');
    });
  });

  describe('gallery', () => {
    async function seedAsset(
      classification: 'PUBLIC' | 'CUSTOMER_PRIVATE',
      storageKey: string,
    ): Promise<AssetId> {
      const id = newId() as AssetId;
      await context.inTransaction(() =>
        assets.register({
          id,
          kind: classification === 'PUBLIC' ? 'GALLERY_MEDIA' : 'CUSTOMER_UPLOAD',
          classification,
          storageKey,
          mimeType: 'image/png',
          sizeBytes: 512n,
        }),
      );
      return id;
    }

    async function seedEntry(slug = 'showcase'): Promise<GalleryEntryId> {
      const id = newId() as GalleryEntryId;
      await context.inTransaction(() =>
        gallery.create({
          id,
          title: 'Showcase',
          slug,
          description: 'A finished piece',
          displayOrder: 1,
        }),
      );
      return id;
    }

    it('attaches a public asset', async () => {
      const entryId = await seedEntry();
      const assetId = await seedAsset('PUBLIC', 'gallery/one.png');

      await context.inTransaction(() => gallery.attachAsset(entryId, assetId, 1));

      await expect(gallery.listAssetIds(entryId)).resolves.toEqual([assetId]);
    });

    it('refuses to publish a customer-private asset', async () => {
      const entryId = await seedEntry('private-attempt');
      const assetId = await seedAsset('CUSTOMER_PRIVATE', 'uploads/private.png');

      // No FK expresses this. Without the check, a customer's artwork would be
      // published on a public page.
      const error = await failureOf(() =>
        context.inTransaction(() => gallery.attachAsset(entryId, assetId, 1)),
      );

      expect(error.code).toBe('ASSET_NOT_PUBLIC');
    });

    it('refuses to attach a deleted asset', async () => {
      const entryId = await seedEntry('deleted-attempt');
      const assetId = await seedAsset('PUBLIC', 'gallery/deleted.png');
      await context.inTransaction(() => assets.tombstone(assetId, 'CLEANUP', new Date()));

      const error = await failureOf(() =>
        context.inTransaction(() => gallery.attachAsset(entryId, assetId, 1)),
      );

      expect(error.code).toBe('ASSET_DELETED');
    });

    it('rejects the same asset twice on one entry', async () => {
      const entryId = await seedEntry('dup-asset');
      const assetId = await seedAsset('PUBLIC', 'gallery/dup.png');
      await context.inTransaction(() => gallery.attachAsset(entryId, assetId, 1));

      const error = await failureOf(() =>
        context.inTransaction(() => gallery.attachAsset(entryId, assetId, 2)),
      );

      expect(error.kind).toBe('CONFLICT');
    });

    it('rejects a duplicate entry slug', async () => {
      await seedEntry('taken-slug');

      const error = await failureOf(() => seedEntry('taken-slug'));

      expect(error.code).toBe('DUPLICATE_SLUG');
    });
  });
});
