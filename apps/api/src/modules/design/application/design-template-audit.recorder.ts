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

/**
 * The one-time initial scope assignment (`APP3-B03B`).
 *
 * Not an LC-24 transition either — the header is `DRAFT` before and after — but
 * it is the moment a Template stops being authorable-nowhere and becomes bound
 * to one exact Product Side and Area. Every document it will ever hold carries
 * that placement in an immutable snapshot, so an assignment that appeared with
 * no record of who made it would be unexplained provenance for every version
 * that follows.
 */
export const DESIGN_TEMPLATE_SCOPE_ASSIGNED_ACTION = 'design_template.scope_assigned';

/**
 * The three LC-24 transitions `APP3-B04` owns, and their audit actions.
 *
 * Publish and unpublish stay distinct codes and neither is ever recorded as the
 * other — the same rule `IMP-D035` locked for Products, for the same reason: an
 * operator reading the trail must be able to tell a template that came back for
 * editing from one that was retired. Archive is a third thing again, and is
 * never a delete.
 */
export type DesignTemplateLifecycleTransition =
  'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED' | 'RESTORED';

export const DESIGN_TEMPLATE_LIFECYCLE_ACTIONS: Record<DesignTemplateLifecycleTransition, string> =
  {
    PUBLISHED: 'design_template.published',
    UNPUBLISHED: 'design_template.unpublished',
    ARCHIVED: 'design_template.archived',
    // `TR-LC24-06` (`APP3-B04A`). A fourth distinct code, never folded into
    // unpublish: both land in `DRAFT`, and an operator reading the trail must be
    // able to tell a template that came back from retirement from one that was
    // simply taken off the storefront. The archive it reverses keeps its own row
    // — restore is a new fact, not a retraction of the old one.
    RESTORED: 'design_template.restored',
  };

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
   * One row per successful initial scope assignment (`APP3-B03B`).
   *
   * The summary carries where the Template came from — `from: 'UNSCOPED'`, which
   * is the only source state this operation accepts — and the exact triple it
   * was bound to. The scope ids are the subject of the change, so unlike every
   * other action here they belong in the record: an assignment trail that did
   * not say *which* placement was chosen would not explain the one thing that
   * happened.
   *
   * No reason: `IMP-D042` PO-03 requires one for archive and restore only, and
   * this command carries none, so a required reason would have to be fabricated.
   * No document, no Asset id, no storage fact, no Outbox payload — this
   * operation produces none of them.
   *
   * @requiresTransaction — the row must commit with the scope or not at all.
   */
  async recordScopeAssigned(input: {
    readonly templateId: string;
    readonly productId: string;
    readonly productSideId: string;
    readonly embroideryAreaId: string;
  }): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: DESIGN_TEMPLATE_SCOPE_ASSIGNED_ACTION,
      targetKind: DESIGN_TEMPLATE_KIND,
      targetId: input.templateId,
      summary: {
        from: 'UNSCOPED',
        productId: input.productId,
        productSideId: input.productSideId,
        embroideryAreaId: input.embroideryAreaId,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * One row per successful LC-24 lifecycle transition (`APP3-B04`).
   *
   * `IMP-D042` PO-03 audits **every** transition, so all four share one writer
   * and one bounded summary: where the template came from, where it went, and
   * which immutable version was the subject. A reason is carried only for
   * archive and restore, because PO-03 requires one for exactly those two — a
   * reason invented for publish would be evidence the server made up.
   *
   * Never the document, an Asset id, a storage fact, a credential or an outbox
   * payload.
   *
   * @requiresTransaction — the row must commit with the transition or not at all.
   */
  async recordLifecycle(input: {
    readonly templateId: string;
    readonly transition: DesignTemplateLifecycleTransition;
    readonly from: string;
    readonly to: string;
    readonly version: number;
    readonly reason?: string;
  }): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: DESIGN_TEMPLATE_LIFECYCLE_ACTIONS[input.transition],
      targetKind: DESIGN_TEMPLATE_KIND,
      targetId: input.templateId,
      summary: { from: input.from, to: input.to, version: input.version },
      ...(input.reason === undefined ? {} : { reason: input.reason }),
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
