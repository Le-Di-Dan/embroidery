/**
 * The LC-24 transitions.
 *
 *   publish    DRAFT → PUBLISHED            TR-LC24-02   APP3-B04
 *   unpublish  PUBLISHED → DRAFT            TR-LC24-03   APP3-B04
 *   archive    DRAFT|PUBLISHED → ARCHIVED   TR-LC24-04/05 APP3-B04
 *   restore    ARCHIVED → DRAFT             TR-LC24-06   APP3-B04A
 *
 * Restore joins the other three here rather than opening a use case of its own.
 * `B04_LIFECYCLE_ROUTING_RULING` split the *checkpoint*, not the concept: all
 * four are one guarded header change plus one audit row, and a second class
 * would have duplicated `require`, `project` and `guarded` — the three pieces
 * that make a stale compare-and-set answer a conflict instead of a 500.
 *
 * All four share one shape. The expensive read-only work happens **before** the
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

/**
 * The two reason-bearing commands (`IMP-D042` PO-03).
 *
 * One interface for both rather than two identical ones: the reason is required
 * of archive and restore for the same rule and to the same bound, and two
 * declarations would be two places for that rule to drift.
 */
export interface ReasonedLifecycleCommand extends LifecycleCommand {
  readonly reason: string;
}

export type ArchiveCommand = ReasonedLifecycleCommand;
export type RestoreCommand = ReasonedLifecycleCommand;

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

  /**
   * `TR-LC24-06` — `ARCHIVED → DRAFT` (`APP3-B04A`).
   *
   * Deliberately **no** publication guard. GRD-T01 belongs to publish, and a
   * restore that had to be publishable could never rescue the template that most
   * needs restoring: one archived precisely because its Side was retired, its
   * document went stale or its asset was withdrawn. Restore returns retained
   * data to the only editable state; whether it may be published again is asked
   * later, by publish, against the rules of that moment.
   *
   * Nothing is repaired on the way back either. A scope pointing at a retired
   * Side comes back exactly as it was, because a server that silently rewrote it
   * would be choosing a placement no Admin asked for — and every stored version
   * carries the old one in an immutable snapshot regardless.
   */
  async restore(command: RestoreCommand): Promise<TemplateDetailView> {
    const template = await this.require(command.templateId);
    if (template.status !== 'ARCHIVED') {
      throw designTemplateDraftError('DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED');
    }

    const at = new Date();
    await this.transactions.runInTransaction(async () => {
      await this.guarded(() =>
        this.templates.restore({
          id: template.id,
          expectedCurrentVersion: command.expectedCurrentVersion,
          at,
        }),
      );
      await this.audit.recordLifecycle({
        templateId: template.id,
        transition: 'RESTORED',
        from: 'ARCHIVED',
        to: 'DRAFT',
        // The retained counter, unchanged by the transition. Zero is a real
        // answer: a header archived before its first save comes back with none.
        version: template.currentVersion,
        // `IMP-D042` PO-03 requires a reason for archive and restore, and for
        // neither of the other two.
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
