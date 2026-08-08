/**
 * The two Admin Design Template read operations (`APP3-B03` §8/§9).
 *
 * Keyset paging only, for the reason DB5 chose it for every launch-critical
 * list: an offset page drifts under a concurrent create, and an operator paging
 * through templates would see a row twice or miss one entirely.
 *
 * A malformed cursor is a client error and must never be treated as "start from
 * the beginning" — a caller paging through the catalog would silently restart
 * and process every template a second time.
 *
 * Neither read filters by lifecycle state unless asked to. This is the Admin
 * surface: `APP3-A02` needs to see drafts, published and archived templates
 * together and choose between them, so hiding archived rows by default would
 * make the archive filter untestable and the list a lie about what exists.
 * Public filtering is `APP3-B05`'s, against a different authority.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { DesignTemplateState } from '@embroidery/database';

import { designTemplateDraftError } from '../domain/design-template-draft.errors';
import type { ProductId } from '../../catalog/domain/repositories/placement-hierarchy.port';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplate,
  type DesignTemplateId,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import {
  toDetailView,
  toSummaryView,
  type TemplateDetailView,
  type TemplateListView,
} from './design-template-projection';

export interface ListTemplatesInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: DesignTemplateState | undefined;
  readonly productId?: string | undefined;
}

@Injectable()
export class DesignTemplateQuery {
  constructor(
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
  ) {}

  async detail(templateId: string): Promise<TemplateDetailView> {
    const template = await this.templates.findById(templateId as DesignTemplateId);
    if (template === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_NOT_FOUND');
    }
    // One extra read, and only on detail. A template `APP3-B03` created has no
    // version at all, and `undefined` here is the truthful answer the projection
    // turns into an absent field rather than a fabricated version 0.
    const version = await this.templates.findLatestVersion(template.id);
    return toDetailView(template, version);
  }

  /**
   * One keyset page, newest first.
   *
   * The page carries **no** version summary. Resolving the current version of
   * every row would be one query per template — the N+1 §8 forbids — and the
   * list is a chooser, not an editor: a caller that needs the document opens the
   * detail read for the one template it picked.
   */
  async list(input: ListTemplatesInput): Promise<TemplateListView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const rows = await this.templates.list({
      filter: {
        status: input.status,
        productId: input.productId as ProductId | undefined,
      },
      after,
      limit,
    });

    const page = buildPage(rows, limit, (template: DesignTemplate) => ({
      sortValue: template.createdAt.toISOString(),
      tieBreaker: template.id,
    }));

    return {
      items: page.items.map((template) => toSummaryView(template, undefined)),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasNext: page.nextCursor !== undefined,
    };
  }
}

function decodePosition(
  cursor: string | undefined,
): { readonly createdAt: Date; readonly id: string } | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_CURSOR_INVALID');
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw designTemplateDraftError('DESIGN_TEMPLATE_CURSOR_INVALID');
  }
}
