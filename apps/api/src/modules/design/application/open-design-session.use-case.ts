/**
 * Blank and clone Session bootstrap (`APP3-B07` §8–§10).
 *
 * The two modes converge deliberately: both resolve the same public placement,
 * both validate their document against the same `APP3-P01`/`APP3-P02`
 * authorities, both persist through the repository seams that already carry
 * `G-DB7-13` (valid placement chain) and `G-DB7-18` (Template PUBLISHED at clone
 * time). A clone is not a privileged path with fewer checks; it is the same path
 * with a different document source.
 *
 * There is no fallback from clone to blank. A caller who asked for a Template
 * and cannot have it gets a refusal, not a silently different session —
 * otherwise "my design opened empty" becomes the bug report for six different
 * causes.
 *
 * Expiry is `now + 30 days`, fixed at creation (`IMP-D043` PO-06). It is
 * computed once, from one clock, and passed to whichever repository seam runs.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSession,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import { DesignSessionSecretIssuer } from '../infrastructure/crypto/design-session-secret.issuer';
import { DesignDocumentAuthority, type DocumentRejection } from './design-document.authority';
import {
  DesignSessionScopeResolver,
  type ResolvedDesignScope,
} from './design-session-scope.resolver';
import {
  toSessionSnapshot,
  type DesignSessionLineageView,
  type DesignSessionSnapshotView,
} from './design-session-snapshot';

/** `IMP-D043` PO-06 — absolute, from `created_at`, never slid. */
export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export type OpenSessionRejection =
  'SCOPE_NOT_AVAILABLE' | 'TEMPLATE_NOT_AVAILABLE' | 'TEMPLATE_SCOPE_MISMATCH' | DocumentRejection;

export interface OpenSessionRequest {
  readonly productSlug: string;
  readonly sideCode: string;
  readonly areaCode: string;
  readonly templateSlug?: string | undefined;
}

export type OpenSessionOutcome =
  | {
      readonly ok: true;
      readonly snapshot: DesignSessionSnapshotView;
      readonly rawSecret: string;
      readonly expiresAt: Date;
    }
  | { readonly ok: false; readonly rejection: OpenSessionRejection };

@Injectable()
export class OpenDesignSessionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly scopes: DesignSessionScopeResolver,
    private readonly documents: DesignDocumentAuthority,
    private readonly secrets: DesignSessionSecretIssuer,
  ) {}

  async open(request: OpenSessionRequest, now: Date = new Date()): Promise<OpenSessionOutcome> {
    const scope = await this.scopes.resolve(request);
    if (scope === undefined) return { ok: false, rejection: 'SCOPE_NOT_AVAILABLE' };

    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const secret = this.secrets.issue();
    const id = newId() as DesignSessionId;

    const outcome =
      request.templateSlug === undefined
        ? await this.openBlank(id, scope, secret.secretHash, expiresAt)
        : await this.openClone(id, scope, secret.secretHash, expiresAt, request.templateSlug);

    if (!outcome.ok) return outcome;
    return {
      ok: true,
      snapshot: toSessionSnapshot(outcome.session, scope.view, outcome.lineage),
      rawSecret: secret.rawSecret,
      expiresAt,
    };
  }

  private async openBlank(
    id: DesignSessionId,
    scope: ResolvedDesignScope,
    sessionSecretHash: string,
    expiresAt: Date,
  ): Promise<
    | { readonly ok: true; readonly session: DesignSession; readonly lineage: undefined }
    | { readonly ok: false; readonly rejection: OpenSessionRejection }
  > {
    // Validated even though this server authored it: "correct by construction"
    // is a claim about code, and the check costs one pass over an empty array.
    const empty = this.documents.buildEmptyDocument(scope);
    const checked = this.documents.validate(empty, scope);
    if (!checked.ok) return { ok: false, rejection: checked.rejection };

    const session = await this.transactions.runInTransaction(() =>
      this.sessions.open({
        id,
        sessionSecretHash,
        productId: scope.productId as never,
        productSideId: scope.productSideId as never,
        embroideryAreaId: scope.embroideryAreaId as never,
        designDocument: checked.document as unknown as Record<string, unknown>,
        documentSchemaVersion: checked.schemaVersion,
        expiresAt,
      }),
    );
    return { ok: true, session, lineage: undefined };
  }

  private async openClone(
    id: DesignSessionId,
    scope: ResolvedDesignScope,
    sessionSecretHash: string,
    expiresAt: Date,
    templateSlug: string,
  ): Promise<
    | {
        readonly ok: true;
        readonly session: DesignSession;
        readonly lineage: DesignSessionLineageView;
      }
    | { readonly ok: false; readonly rejection: OpenSessionRejection }
  > {
    const template = await this.templates.findBySlug(templateSlug);
    if (template === undefined) return { ok: false, rejection: 'TEMPLATE_NOT_AVAILABLE' };

    const published = await this.templates.loadPublished(template.id);
    if (published === undefined) return { ok: false, rejection: 'TEMPLATE_NOT_AVAILABLE' };

    // `APP3-G02`: exact triple equality, no wildcard. A Template whose scope is
    // incomplete is not publishable, so an absent column here is a mismatch
    // rather than a permissive match.
    const compatible =
      published.template.productId === scope.productId &&
      published.template.productSideId === scope.productSideId &&
      published.template.embroideryAreaId === scope.embroideryAreaId;
    if (!compatible) return { ok: false, rejection: 'TEMPLATE_SCOPE_MISMATCH' };

    const checked = this.documents.validate(published.version.designDocument, scope);
    if (!checked.ok) return { ok: false, rejection: checked.rejection };

    // `cloneFromTemplate` re-reads `loadPublished` inside the transaction, so a
    // Template unpublished between this check and the write still refuses. The
    // copy it stores is the version's own document — a deep, independent value,
    // because JSONB is written by value and nothing links back to the Template.
    const session = await this.transactions.runInTransaction(() =>
      this.sessions.cloneFromTemplate({
        id,
        sessionSecretHash,
        templateId: template.id,
        productId: scope.productId as never,
        productSideId: scope.productSideId as never,
        embroideryAreaId: scope.embroideryAreaId as never,
        expiresAt,
      }),
    );

    return {
      ok: true,
      session,
      lineage: { templateSlug: template.slug, templateVersion: published.version.version },
    };
  }
}
