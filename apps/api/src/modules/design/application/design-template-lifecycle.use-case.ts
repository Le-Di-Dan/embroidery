/**
 * The three LC-24 transitions `APP3-B04` owns.
 *
 *   publish    DRAFT → PUBLISHED            TR-LC24-02
 *   unpublish  PUBLISHED → DRAFT            TR-LC24-03
 *   archive    DRAFT|PUBLISHED → ARCHIVED   TR-LC24-04 / TR-LC24-05
 *
 * `ARCHIVED → DRAFT` is deliberately absent: `B04_LIFECYCLE_ROUTING_RULING`
 * routes restore to `APP3-B04A`, so this checkpoint stays at three operations
 * rather than becoming the four-into-three contract the B03 split already had to
 * resolve once.
 *
 * All three share one shape. The expensive read-only work happens **before** the
 * transaction — publication readiness is a query and a computation — and the
 * transaction contains only the guarded state change and its audit row. The
 * repository's compare-and-set is what actually enforces the source state; the
 * reads above it are advisory, and exist so a template that plainly cannot
 * transition is refused without doing the work.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { designTemplateDraftError } from '../domain/design-template-draft.errors';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplate,
  type DesignTemplateId,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import { DesignTemplateAuditRecorder } from './design-template-audit.recorder';
import { TemplatePublicationAuthority } from './template-publication.authority';
import { toDetailView, type TemplateDetailView } from './design-template-projection';

export interface LifecycleCommand {
  readonly templateId: string;
  readonly expectedCurrentVersion: number;
}

export interface ArchiveCommand extends LifecycleCommand {
  readonly reason: string;
}

/** A template that is in the right state but not ready to publish. */
export class TemplateNotPublishableError extends Error {
  constructor(readonly refusal: string) {
    super('This design template is not ready to be published yet.');
    this.name = 'TemplateNotPublishableError';
  }
}

@Injectable()
export class DesignTemplateLifecycleUseCase {
  constructor(
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly publication: TemplatePublicationAuthority,
    private readonly audit: DesignTemplateAuditRecorder,
    private readonly transactions: TransactionManager,
  ) {}

  async publish(command: LifecycleCommand): Promise<TemplateDetailView> {
    const template = await this.require(command.templateId);
    if (template.status !== 'DRAFT') {
      throw designTemplateDraftError('DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED');
    }

    const version = await this.templates.findLatestVersion(template.id);
    const outcome = await this.publication.evaluate(template, version);
    if (!outcome.ok) {
      // Nothing has been written: the whole guard is a read, so a refusal leaves
      // the template exactly as the Admin left it.
      throw new TemplateNotPublishableError(outcome.refusal);
    }

    const at = new Date();
    await this.transactions.runInTransaction(async () => {
      await this.guarded(() =>
        this.templates.publishCurrentVersion({
          id: template.id,
          expectedCurrentVersion: command.expectedCurrentVersion,
          at,
        }),
      );
      await this.audit.recordLifecycle({
        templateId: template.id,
        transition: 'PUBLISHED',
        from: 'DRAFT',
        to: 'PUBLISHED',
        version: outcome.version.version,
      });
    });

    return this.project(template.id);
  }

  async unpublish(command: LifecycleCommand): Promise<TemplateDetailView> {
    const template = await this.require(command.templateId);
    if (template.status !== 'PUBLISHED') {
      throw designTemplateDraftError('DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED');
    }

    await this.transactions.runInTransaction(async () => {
      await this.guarded(() =>
        this.templates.unpublish({
          id: template.id,
          expectedCurrentVersion: command.expectedCurrentVersion,
        }),
      );
      await this.audit.recordLifecycle({
        templateId: template.id,
        transition: 'UNPUBLISHED',
        from: 'PUBLISHED',
        to: 'DRAFT',
        version: template.currentVersion,
      });
    });

    return this.project(template.id);
  }

  async archive(command: ArchiveCommand): Promise<TemplateDetailView> {
    const template = await this.require(command.templateId);
    if (template.status !== 'DRAFT' && template.status !== 'PUBLISHED') {
      throw designTemplateDraftError('DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED');
    }
    const from = template.status;

    const at = new Date();
    await this.transactions.runInTransaction(async () => {
      await this.guarded(() =>
        this.templates.archive({
          id: template.id,
          expectedCurrentVersion: command.expectedCurrentVersion,
          at,
        }),
      );
      await this.audit.recordLifecycle({
        templateId: template.id,
        transition: 'ARCHIVED',
        from,
        to: 'ARCHIVED',
        version: template.currentVersion,
        // `IMP-D042` PO-03 requires a reason for archive and restore, and for
        // neither of the other two — so it is carried here and nowhere else.
        reason: command.reason,
      });
    });

    return this.project(template.id);
  }

  private async require(templateId: string): Promise<DesignTemplate> {
    const template = await this.templates.findById(templateId as DesignTemplateId);
    if (template === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  /** The durable truth after the transition, never the pre-read row. */
  private async project(id: DesignTemplateId): Promise<TemplateDetailView> {
    const template = await this.templates.findById(id);
    if (template === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
    }
    return toDetailView(template, await this.templates.findLatestVersion(id));
  }

  /**
   * The repository's compare-and-set failure, as the feature's own refusal.
   *
   * A `PersistenceError` reaching the controller untranslated would answer 500
   * against a published 409 — the `APP3-B06B-C1` defect, wired correctly here
   * from the start.
   */
  private async guarded(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error: unknown) {
      if (!isPersistenceError(error)) throw error;
      if (error.code === 'RECORD_NOT_FOUND') {
        throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
      }
      throw error.code === 'STALE_WRITE'
        ? designTemplateDraftError('DESIGN_TEMPLATE_VERSION_CONFLICT')
        : error;
    }
  }
}
