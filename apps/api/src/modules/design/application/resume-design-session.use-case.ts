/**
 * Session resume with atomic secret rotation (`APP3-B07` §12, `IMP-D043` PO-04).
 *
 * The authorization itself is `APP3-B06A`'s — this use case never parses a
 * cookie, computes an HMAC or checks an Origin. It receives an already-authorized
 * session and does exactly one thing: replace the credential.
 *
 * Rotation is one guarded UPDATE keyed on the *current* digest, so two resumes
 * presenting the same old secret cannot both win; the loser matches zero rows
 * and gets the same non-enumerating refusal as any other failed authorization.
 * The old digest is overwritten rather than kept, which is what "no
 * previous-secret grace window" means physically — there is nowhere left for the
 * old secret to verify from.
 *
 * `expires_at` and `autosave_revision` are untouched: resume does not extend the
 * absolute TTL (PO-06) and is not a document write.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import {
  DESIGN_SESSION_REPOSITORY,
  type DesignSessionId,
  type DesignSessionRepository,
} from '../domain/repositories/design-session.repository';
import {
  DESIGN_TEMPLATE_REPOSITORY,
  type DesignTemplateId,
  type DesignTemplateRepository,
} from '../domain/repositories/design-template.repository';
import { DesignSessionSecretIssuer } from '../infrastructure/crypto/design-session-secret.issuer';
import { toSessionSnapshot, type DesignSessionSnapshotView } from './design-session-snapshot';

export type ResumeOutcome =
  | {
      readonly ok: true;
      readonly snapshot: DesignSessionSnapshotView;
      readonly rawSecret: string;
      readonly expiresAt: Date;
    }
  | { readonly ok: false };

@Injectable()
export class ResumeDesignSessionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DESIGN_SESSION_REPOSITORY) private readonly sessions: DesignSessionRepository,
    @Inject(DESIGN_TEMPLATE_REPOSITORY) private readonly templates: DesignTemplateRepository,
    private readonly secrets: DesignSessionSecretIssuer,
  ) {}

  async resume(sessionId: string, now: Date = new Date()): Promise<ResumeOutcome> {
    const current = await this.sessions.findById(sessionId as DesignSessionId);
    if (current === undefined) return { ok: false };

    const next = this.secrets.issue();
    const rotated = await this.transactions.runInTransaction(() =>
      this.sessions.rotateSecret({
        id: sessionId as DesignSessionId,
        // The digest read a moment ago is the guard. If a concurrent resume
        // already rotated, this matches nothing and that caller keeps the only
        // live cookie.
        expectedSecretHash: current.sessionSecretHash,
        nextSecretHash: next.secretHash,
        at: now,
      }),
    );
    if (rotated === undefined) return { ok: false };

    const lineage =
      rotated.templateId === undefined || rotated.templateVersion === undefined
        ? undefined
        : await this.describeLineage(rotated.templateId, rotated.templateVersion);

    return {
      ok: true,
      // `scope` is omitted: see `DesignSessionSnapshotView`. The document's own
      // placement snapshot still carries the canvas geometry, so a resumed
      // Studio is not left without it.
      snapshot: toSessionSnapshot(rotated, undefined, lineage),
      rawSecret: next.rawSecret,
      expiresAt: rotated.expiresAt,
    };
  }

  /** Lineage as a public slug and an integer stamp — never the Version row id. */
  private async describeLineage(
    templateId: string,
    templateVersion: number,
  ): Promise<{ templateSlug: string; templateVersion: number } | undefined> {
    const template = await this.templates.findById(templateId as DesignTemplateId);
    return template === undefined ? undefined : { templateSlug: template.slug, templateVersion };
  }
}
