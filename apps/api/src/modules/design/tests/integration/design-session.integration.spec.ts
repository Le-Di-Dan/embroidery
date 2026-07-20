/**
 * AGG-09 Design Session persistence against a real PostgreSQL instance
 * (DB7-CP5).
 *
 * TBL-025, TBL-026 and guards G-DB7-13 (placement chain), G-DB7-18 (clone
 * requires a PUBLISHED template) and G-DB7-19 (session must be ACTIVE and
 * unexpired, optimistic `autosaveRevision` concurrency).
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { DesignModule } from '../../design.module';
import { DESIGN_SESSION_REPOSITORY } from '../../domain/repositories/design-session.repository';
import type {
  DesignSession,
  DesignSessionId,
  DesignSessionRepository,
} from '../../domain/repositories/design-session.repository';
import { DESIGN_TEMPLATE_REPOSITORY } from '../../domain/repositories/design-template.repository';
import type {
  DesignTemplateId,
  DesignTemplateRepository,
  DesignTemplateVersionId,
} from '../../domain/repositories/design-template.repository';
import { seedDesignChain } from './design-fixture';
import type { DesignFixture } from './design-fixture';

describe('design session persistence (integration)', () => {
  let context: PersistenceTestContext;
  let sessions: DesignSessionRepository;
  let templates: DesignTemplateRepository;
  let fixture: DesignFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp5-design-session', [DesignModule]);
    sessions = context.get(DESIGN_SESSION_REPOSITORY);
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

  const inHour = () => new Date(Date.now() + 60 * 60 * 1000);

  function openSession(target = fixture): Promise<DesignSession> {
    const id = newId() as DesignSessionId;
    return context.inTransaction(() =>
      sessions.open({
        id,
        sessionSecretHash: `hash-${id}`,
        productId: target.placement.productId,
        productVariantId: target.placement.productVariantId,
        productSideId: target.placement.productSideId,
        embroideryAreaId: target.placement.embroideryAreaId,
        designDocument: { elements: [] },
        documentSchemaVersion: 1,
        expiresAt: inHour(),
      }),
    );
  }

  async function publishedTemplate(): Promise<DesignTemplateId> {
    const templateId = newId() as DesignTemplateId;
    await templates.create({ id: templateId, name: 'Fixture Template', slug: `tpl-${templateId}` });
    await context.inTransaction(() =>
      templates.publishVersion({
        id: newId() as DesignTemplateVersionId,
        designTemplateId: templateId,
        designDocument: { elements: ['logo'] },
        documentSchemaVersion: 1,
        publishedAt: new Date(),
      }),
    );
    return templateId;
  }

  describe('opening (G-DB7-13)', () => {
    it('opens a blank session against a valid placement chain', async () => {
      const session = await openSession();

      expect(session.status).toBe('ACTIVE');
      expect(session.autosaveRevision).toBe(0);
    });

    it('rejects a placement chain that does not resolve', async () => {
      const other = await seedDesignChain(context, '2');

      const error = await failureOf(() =>
        openSession({
          ...fixture,
          placement: { ...fixture.placement, productSideId: other.placement.productSideId },
        }),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });
  });

  describe('cloning from a template (G-DB7-18)', () => {
    it('clones the published document and stamps provenance', async () => {
      const templateId = await publishedTemplate();
      const id = newId() as DesignSessionId;

      const session = await context.inTransaction(() =>
        sessions.cloneFromTemplate({
          id,
          sessionSecretHash: `hash-${id}`,
          templateId,
          productId: fixture.placement.productId,
          productVariantId: fixture.placement.productVariantId,
          productSideId: fixture.placement.productSideId,
          embroideryAreaId: fixture.placement.embroideryAreaId,
          expiresAt: inHour(),
        }),
      );

      expect(session.templateId).toBe(templateId);
      expect(session.templateVersion).toBe(1);
      expect(session.designDocument).toEqual({ elements: ['logo'] });
    });

    it('refuses to clone a template that is still a draft', async () => {
      const templateId = newId() as DesignTemplateId;
      await templates.create({ id: templateId, name: 'Draft', slug: `tpl-${templateId}` });
      const id = newId() as DesignSessionId;

      const error = await failureOf(() =>
        context.inTransaction(() =>
          sessions.cloneFromTemplate({
            id,
            sessionSecretHash: `hash-${id}`,
            templateId,
            productId: fixture.placement.productId,
            productVariantId: fixture.placement.productVariantId,
            productSideId: fixture.placement.productSideId,
            embroideryAreaId: fixture.placement.embroideryAreaId,
            expiresAt: inHour(),
          }),
        ),
      );

      expect(error.code).toBe('TEMPLATE_NOT_PUBLISHED');
    });
  });

  describe('autosave (G-DB7-19)', () => {
    it('saves the document and advances the revision', async () => {
      const session = await openSession();

      const saved = await context.inTransaction(() =>
        sessions.saveDocument({
          id: session.id,
          designDocument: { elements: ['stitch'] },
          documentSchemaVersion: 1,
          expectedRevision: 0,
        }),
      );

      expect(saved.autosaveRevision).toBe(1);
    });

    it('rejects a stale revision instead of overwriting a newer save', async () => {
      const session = await openSession();
      await context.inTransaction(() =>
        sessions.saveDocument({
          id: session.id,
          designDocument: { elements: ['stitch'] },
          documentSchemaVersion: 1,
          expectedRevision: 0,
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          sessions.saveDocument({
            id: session.id,
            designDocument: { elements: ['stale'] },
            documentSchemaVersion: 1,
            expectedRevision: 0,
          }),
        ),
      );

      expect(error.code).toBe('STALE_WRITE');
    });

    it('refuses to autosave a submitted session', async () => {
      const session = await openSession();
      await context.inTransaction(() =>
        sessions.submit(session.id, fixture.customRequestId, new Date()),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          sessions.saveDocument({
            id: session.id,
            designDocument: { elements: ['late'] },
            documentSchemaVersion: 1,
            expectedRevision: 0,
          }),
        ),
      );

      expect(error.code).toBe('STALE_WRITE');
    });
  });

  describe('submit and expire', () => {
    it('marks the session submitted with the handoff request', async () => {
      const session = await openSession();

      const submitted = await context.inTransaction(() =>
        sessions.submit(session.id, fixture.customRequestId, new Date()),
      );

      expect(submitted.status).toBe('SUBMITTED');
      expect(submitted.submittedRequestId).toBe(fixture.customRequestId);
    });

    it('is no longer found by an active-secret lookup once expired', async () => {
      const session = await openSession();

      await context.inTransaction(() => sessions.expire(session.id, new Date()));

      await expect(
        sessions.findActiveBySecretHash(session.sessionSecretHash),
      ).resolves.toBeUndefined();
    });
  });

  describe('assets', () => {
    it('associates an uploaded asset', async () => {
      const session = await openSession();

      await context.inTransaction(() => sessions.attachAsset(session.id, fixture.assetId));

      await expect(sessions.listAssetIds(session.id)).resolves.toEqual([fixture.assetId]);
    });
  });
});
