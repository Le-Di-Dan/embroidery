/**
 * AGG-19 Content Page and AGG-20 Redirect Rule persistence contracts
 * (TBL-066, TBL-067).
 *
 * Two small aggregates with genuinely separate lifecycles: a redirect outlives
 * the page it once pointed at, which is the whole point of having one.
 */
import type { ContentPageState, ContentPageType, RedirectKind } from '@embroidery/database';

export type ContentPageId = string & { readonly __brand: 'ContentPageId' };
export type RedirectRuleId = string & { readonly __brand: 'RedirectRuleId' };

export interface ContentPage {
  readonly id: ContentPageId;
  readonly pageType: ContentPageType;
  readonly slug: string;
  readonly title: string;
  readonly body: string | undefined;
  readonly status: ContentPageState;
  readonly isIndexable: boolean;
}

export interface RedirectRule {
  readonly id: RedirectRuleId;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly redirectKind: RedirectKind;
  readonly isActive: boolean;
}

export interface CreateContentPageInput {
  readonly id: ContentPageId;
  readonly pageType: ContentPageType;
  readonly slug: string;
  readonly title: string;
  readonly body?: string | undefined;
}

export interface UpsertRedirectInput {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly redirectKind: RedirectKind;
}

export const CONTENT_PAGE_REPOSITORY = Symbol('CONTENT_PAGE_REPOSITORY');
export const REDIRECT_RULE_REPOSITORY = Symbol('REDIRECT_RULE_REPOSITORY');

export interface ContentPageRepository {
  /** @requiresTransaction */
  create(input: CreateContentPageInput): Promise<ContentPage>;
  /** @requiresTransaction */
  updateBody(id: ContentPageId, title: string, body: string | undefined): Promise<ContentPage>;
  /** @requiresTransaction */
  changeStatus(id: ContentPageId, status: ContentPageState): Promise<ContentPage>;

  findByTypeAndSlug(pageType: ContentPageType, slug: string): Promise<ContentPage | undefined>;
  findById(id: ContentPageId): Promise<ContentPage | undefined>;
}

export interface RedirectRuleRepository {
  /** @requiresTransaction — re-pointing an existing source is an update, not a duplicate. */
  upsert(input: UpsertRedirectInput): Promise<RedirectRule>;
  /** @requiresTransaction */
  deactivate(sourcePath: string): Promise<void>;

  /** Resolves an incoming path. Active rules only. */
  resolve(sourcePath: string): Promise<RedirectRule | undefined>;
}
