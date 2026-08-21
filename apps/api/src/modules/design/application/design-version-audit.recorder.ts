/**
 * The durable evidence a formal Design Version creation leaves
 * (`APP6-B08` §15).
 *
 * `DB3_AUDIT_SPECIFICATION.md` lists *"Design version create/send/decision/void —
 * TR-LC08-01/02/03/07"* as audited, and `DB3_LIFECYCLE_SPECIFICATIONS.md` marks
 * `TR-LC08-01`'s Audit column **yes**. So this is not a judgement call, and the
 * write joins the caller's transaction: a version that appeared without its audit
 * row would be unexplained provenance for everything frozen onto it later.
 *
 * ## The document is not in the audit row
 *
 * The same specification line says, verbatim, *"document content never in audit
 * (hash ref only)"*. The summary below therefore carries version refs and branch
 * facts and nothing else — no `design_document`, no element, no customer text. A
 * hash is not carried either, and cannot be: a DRAFT has none until
 * `TR-LC08-02`, and inventing one here would put a value in the trail that
 * matches nothing.
 *
 * ## There is deliberately no outbox event
 *
 * `SE-004 design.review-ready` is `APP6-B09`'s, emitted when a version is *sent*.
 * A draft has no consumer: no customer is notified, nothing becomes visible
 * outside the Admin surface, and no asynchronous work is owed. Emitting one here
 * would be an endpoint announcing work nobody does — and, worse, would tell a
 * customer about a design that has not been sent to them.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { DesignCaseId, DesignVersionId } from '../domain/repositories/design-case.repository';

/** `TR-LC08-01`. Lowercase dot-namespaced, as `DB3_AUDIT_SPECIFICATION.md` locks. */
export const DESIGN_VERSION_CREATED_ACTION = 'design_version.created';

export interface DesignVersionAuditFacts {
  readonly designVersionId: DesignVersionId;
  readonly designCaseId: DesignCaseId;
  readonly customRequestId: string;
  readonly version: number;
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly documentSchemaVersion: number;
  readonly parentVersionId: DesignVersionId | undefined;
}

@Injectable()
export class DesignVersionAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly clock: AuditClock,
    private readonly requestContext: RequestContextService,
  ) {}

  /** @requiresTransaction — atomic with the version it explains. */
  async recordCreated(facts: DesignVersionAuditFacts, adminId: string): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action: DESIGN_VERSION_CREATED_ACTION,
      // The **version**, not the case or the request: the audited fact is that
      // this row came into existence, and `AUDIT_TARGET_KINDS` has carried
      // `DESIGN_VERSION` since DB7 for exactly this transition.
      targetKind: 'DESIGN_VERSION',
      targetId: facts.designVersionId,
      summary: {
        designCaseId: facts.designCaseId,
        customRequestId: facts.customRequestId,
        version: facts.version,
        branch: facts.branch,
        documentSchemaVersion: facts.documentSchemaVersion,
        parentVersionId: facts.parentVersionId ?? null,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
