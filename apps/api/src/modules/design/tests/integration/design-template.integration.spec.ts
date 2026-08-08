/**
 * AGG-12 Design Template persistence against a real PostgreSQL instance
 * (DB7-CP5).
 *
 * TBL-034..TBL-036 and guard G-DB7-18 (a session may only clone a template
 * that is PUBLISHED at the moment of cloning).
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { DesignModule } from '../../design.module';
import { DESIGN_TEMPLATE_REPOSITORY } from '../../domain/repositories/design-template.repository';
import type {
  DesignTemplateId,
  DesignTemplateRepository,
  DesignTemplateVersionId,
} from '../../domain/repositories/design-template.repository';
import { seedDesignChain } from './design-fixture';
import type { DesignFixture } from './design-fixture';

describe('design template persistence (integration)', () => {
  let context: PersistenceTestContext;
  let templates: DesignTemplateRepository;
  let fixture: DesignFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp5-design-template', [DesignModule]);
    templates = context.get(DESIGN_TEMPLATE_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedDesignChain(context);
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

  function createTemplate(slug = `tpl-${newId()}`): Promise<{ id: DesignTemplateId }> {
    const id = newId() as DesignTemplateId;
    return templates.create({ id, name: 'Fixture Template', slug });
  }

  function publish(
    id: DesignTemplateId,
  ): Promise<{ id: DesignTemplateVersionId; version: number }> {
    return context.inTransaction(() =>
      templates.publishVersion({
        id: newId() as DesignTemplateVersionId,
        designTemplateId: id,
        designDocument: { elements: ['logo'] },
        documentSchemaVersion: 1,
        publishedAt: new Date(),
      }),
    );
  }

  describe('creation', () => {
    it('creates a draft template', async () => {
      const { id } = await createTemplate();

      await expect(templates.findById(id)).resolves.toMatchObject({
        status: 'DRAFT',
        currentVersion: 0,
      });
    });

    it('rejects a duplicate slug', async () => {
      const slug = `tpl-dup-${newId()}`;
      await createTemplate(slug);

      const error = await failureOf(() => createTemplate(slug));
      expect(error.kind).toBe('CONFLICT');
    });
  });

  describe('publishing (G-DB7-18)', () => {
    it('publishes the first version and bumps the counter, publishing the header', async () => {
      const { id } = await createTemplate();

      const version = await publish(id);

      expect(version.version).toBe(1);
      await expect(templates.findById(id)).resolves.toMatchObject({
        status: 'PUBLISHED',
        currentVersion: 1,
      });
    });

    it('publishes a second version and advances the counter', async () => {
      const { id } = await createTemplate();
      await publish(id);

      const second = await publish(id);

      expect(second.version).toBe(2);
      await expect(templates.findById(id)).resolves.toMatchObject({ currentVersion: 2 });
    });

    it('loads the published version through loadPublished, not a draft', async () => {
      const { id } = await createTemplate();

      await expect(templates.loadPublished(id)).resolves.toBeUndefined();

      await publish(id);

      const loaded = await templates.loadPublished(id);
      expect(loaded?.template.status).toBe('PUBLISHED');
      expect(loaded?.version.version).toBe(1);
    });

    it('stops resolving as published once archived', async () => {
      const { id } = await createTemplate();
      await publish(id);

      // `APP3-B04` narrowed archive to a guarded lifecycle command: the source
      // state and the expected counter are now part of the contract.
      await templates.archive({ id, expectedCurrentVersion: 1, at: new Date() });

      await expect(templates.loadPublished(id)).resolves.toBeUndefined();
    });

    it('rejects a mutation of a published version via the S24 trigger', async () => {
      const { id } = await createTemplate();
      await publish(id);
      const loaded = await templates.loadPublished(id);

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperTemplateVersion', () =>
          context.disposable.client.db.execute(
            sql`update design_template_versions set document_schema_version = 99 where id = ${loaded?.version.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });

  describe('assets', () => {
    it('associates a private artwork asset', async () => {
      const { id } = await createTemplate();

      await context.inTransaction(() => templates.attachAsset(id, fixture.assetId));

      await expect(templates.listAssetIds(id)).resolves.toEqual([fixture.assetId]);
    });

    it('rejects the same asset associated twice', async () => {
      const { id } = await createTemplate();
      await context.inTransaction(() => templates.attachAsset(id, fixture.assetId));

      const error = await failureOf(() =>
        context.inTransaction(() => templates.attachAsset(id, fixture.assetId)),
      );
      expect(error.kind).toBe('CONFLICT');
    });
  });
});
