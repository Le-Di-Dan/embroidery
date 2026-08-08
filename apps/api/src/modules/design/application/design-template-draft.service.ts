/**
 * Design Template header creation (`APP3-B03` §4).
 *
 * One command, and it is deliberately small: create the header in `DRAFT` and
 * nothing else. `B03_CONTRACT_RULING = OPTION_2_SPLIT_DRAFT_SAVE_INTO_APP3_B03A`
 * put the document save, the immutable version, the Template Asset association
 * and the normalization-request producer in `APP3-B03A`, so a template this
 * service creates legitimately has **zero versions** until that checkpoint runs.
 *
 * The event type itself is deliberately not spelled out anywhere in this file:
 * `APP3-G06`'s gate refuses any `apps/api/**` source that names it outside the
 * checkpoints allowed to produce it, and that allow-list is by filename, not by
 * whether the mention happens to be prose.
 *
 * That is not a gap being papered over. `IMP-D042` PO-07 already requires *at
 * least one immutable version* before publish, so `APP3-B04` cannot publish a
 * header-only Template, and fabricating a version 1 here to make the row look
 * complete would create exactly the empty-document state PO-04 says a save
 * produces — without a save having happened.
 */
import { Injectable, Inject } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';
import { newId } from '@embroidery/database';

import { designTemplateDraftError } from '../domain/design-template-draft.errors';
import { deriveTemplateSlugBase, deriveTemplateSlugFallback } from '../domain/design-template-slug';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplateId,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import { DesignTemplateAuditRecorder } from './design-template-audit.recorder';
import { DesignTemplateScopeAuthority } from './design-template-scope.authority';
import { toDetailView, type TemplateDetailView } from './design-template-projection';

export interface CreateTemplateCommand {
  readonly name: string;
  readonly description?: string | undefined;
  readonly productId?: string | undefined;
  readonly productSideId?: string | undefined;
  readonly embroideryAreaId?: string | undefined;
}

@Injectable()
export class DesignTemplateDraftService {
  constructor(
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly scopes: DesignTemplateScopeAuthority,
    private readonly audit: DesignTemplateAuditRecorder,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Creates one `DRAFT` header.
   *
   * The scope is resolved **before** the transaction opens: it is a read against
   * the Catalog placement port, and holding a write transaction open across it
   * would widen the window for no benefit.
   */
  async create(command: CreateTemplateCommand): Promise<TemplateDetailView> {
    const scope = await this.scopes.resolve({
      productId: command.productId,
      productSideId: command.productSideId,
      embroideryAreaId: command.embroideryAreaId,
    });

    const id = newId() as DesignTemplateId;
    const slug = await this.reserveSlug(command.name, id);

    const template = await this.transactions.runInTransaction(async () => {
      const created = await this.templates.create({
        id,
        name: command.name,
        slug,
        ...(command.description === undefined ? {} : { description: command.description }),
        ...(scope === undefined
          ? {}
          : {
              productId: scope.productId,
              productSideId: scope.productSideId,
              embroideryAreaId: scope.embroideryAreaId,
            }),
      });

      await this.audit.recordCreated({ templateId: created.id, slug: created.slug });
      return created;
    });

    // `undefined` version, always: this command writes no version row, and
    // reading one back would only ever return nothing.
    return toDetailView(template, undefined);
  }

  /**
   * Reserves the public address: the readable base first, then exactly one
   * id-derived fallback.
   *
   * Two attempts and no loop. A loop would turn a genuine collision storm into
   * an unbounded query burst, and the fallback is derived from the template's
   * own id, so it can only collide with a row that already has this id — which
   * the primary key makes impossible.
   */
  private async reserveSlug(name: string, id: DesignTemplateId): Promise<string> {
    const base = deriveTemplateSlugBase(name);
    if (!(await this.slugTaken(base))) {
      return base;
    }
    const fallback = deriveTemplateSlugFallback(base, id);
    if (!(await this.slugTaken(fallback))) {
      return fallback;
    }
    throw designTemplateDraftError('DESIGN_TEMPLATE_SLUG_CONFLICT');
  }

  private async slugTaken(slug: string): Promise<boolean> {
    return (await this.templates.findBySlug(slug)) !== undefined;
  }
}
