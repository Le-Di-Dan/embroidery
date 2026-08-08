/**
 * The durable evidence a Design Template header creation leaves (`APP3-B03`
 * §11).
 *
 * `IMP-D042` PO-03 rules that **every** LC-24 transition is Admin-only, audited
 * and concurrency-protected, and `TR-LC24-01` create is one of the six. So this
 * exists even though the Catalog product-draft create it otherwise mirrors
 * writes no audit row: the two are not the same rule, and PO-03 is the binding
 * one for Templates.
 *
 * The write joins the caller's transaction. A template that appeared without its
 * audit row would be an unexplained change, and PO-03 requires status mutation
 * and Audit evidence to be atomic.
 *
 * There is deliberately **no outbox event**. PO-03 speaks of *"any future Outbox
 * consequence"* — creating a private draft has none: nothing becomes public,
 * no asset needs processing, and no consumer exists to notify. The first
 * Template event with a real consumer is the normalization request `APP3-B03A`
 * appends beside its Asset association, and inventing one here would be an
 * endpoint announcing work nobody does.
 *
 * The reads (`list`, `detail`) write nothing. Read auditing is not a convention
 * this repository has, and inventing it for one Admin surface would produce a
 * table nobody queries and a per-request write on the hottest path.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';

/** The audit `target_kind` for a Design Template. */
const DESIGN_TEMPLATE_KIND = 'DESIGN_TEMPLATE' as const;

/** `TR-LC24-01`. Lowercase dot-namespaced, as `DB3_AUDIT_SPECIFICATION.md` locks. */
export const DESIGN_TEMPLATE_CREATED_ACTION = 'design_template.created';

/**
 * The draft save (`APP3-B03A`).
 *
 * A version save is not one of LC-24's six transitions — the header stays
 * `DRAFT` throughout — so PO-03's "every transition is audited" does not reach
 * it. It is audited anyway because an immutable version is durable evidence a
 * later publication freezes and a customer eventually clones, and a version that
 * appeared with no record of who wrote it would be unexplained provenance. The
 * action is named for what happened, not for a transition that did not.
 */
export const DESIGN_TEMPLATE_VERSION_SAVED_ACTION = 'design_template.version_saved';

export interface RecordTemplateCreatedInput {
  readonly templateId: string;
  /** Server-owned public address; safe, and the only way to identify the row later. */
  readonly slug: string;
}

@Injectable()
export class DesignTemplateAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — the row must commit with the template or not at all. */
  async recordCreated(input: RecordTemplateCreatedInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: DESIGN_TEMPLATE_CREATED_ACTION,
      targetKind: DESIGN_TEMPLATE_KIND,
      targetId: input.templateId,
      // Bounded and safe: the resulting state and the public address. Never the
      // name, the description, the scope ids, a Design Document — B03 has none
      // to leak — an Asset id, a storage fact, a credential or a raw error.
      summary: { to: 'DRAFT', slug: input.slug },
      // No `reason`: `IMP-D042` PO-03 requires one for archive and restore only,
      // and the create command carries none, so a required reason here would
      // have to be fabricated by the server.
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * One row per successful draft version save.
   *
   * The summary carries the version number and nothing else. Not the document —
   * `IMP-D044` documents run to 512 KiB and an audit summary is not a place for a
   * payload — not the asset ids it references, not a storage fact, and not the
   * name, which the header already records.
   *
   * @requiresTransaction — the row must commit with the version or not at all.
   */
  async recordDraftVersionSaved(input: {
    readonly templateId: string;
    readonly version: number;
  }): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: DESIGN_TEMPLATE_VERSION_SAVED_ACTION,
      targetKind: DESIGN_TEMPLATE_KIND,
      targetId: input.templateId,
      summary: { version: input.version },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * Never derived from the request body: the actor is whatever authentication
   * established, and there is no fallback — an unattributable creation must fail
   * rather than be filed against a fabricated identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      // The guard admits only an authenticated Admin, so this is unreachable
      // through HTTP; it stays a hard stop rather than a silent coercion.
      throw new Error('Writing design template evidence requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}
