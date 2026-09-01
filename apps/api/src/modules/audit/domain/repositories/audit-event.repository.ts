/**
 * Audit Event persistence contract (TBL-072, CON-150).
 *
 * Append-only business-action evidence (INV-14). An S24 trigger rejects UPDATE
 * and DELETE, so this contract offers neither.
 *
 * Carries **G-DB7-46** — the polymorphic target has no foreign key (REL-103),
 * because an audit row must outlive the thing it describes.
 */

/**
 * The closed set of things an audit event can be about.
 *
 * Validated at write time. The **id** is deliberately not resolved: the target
 * may legitimately be anonymized or retention-deleted later, and an audit row
 * that could not be written once its subject was gone would defeat the point.
 */
export const AUDIT_TARGET_KINDS = [
  'ADMIN_ACCOUNT',
  'CUSTOMER',
  'CUSTOM_REQUEST',
  'DESIGN_CASE',
  'DESIGN_VERSION',
  'APPROVAL_SNAPSHOT',
  'QUOTATION',
  'QUOTATION_VERSION',
  'ORDER',
  'PAYMENT_OBLIGATION',
  'PAYMENT_ATTEMPT',
  'REFUND',
  'PRODUCTION_JOB',
  'INVENTORY_RESERVATION',
  'SKU_STOCK',
  'ASSET',
  // `APP2-B03` — the target of `product.published` / `product.unpublished`
  // (LC-04 `TR-LC04-01`/`TR-LC04-05`, IMP-D035). `target_kind` is open text with
  // no CHECK by DB4 design, so this list is the application's own G-DB7-46
  // guard, not a schema constraint — adding a kind here needs no migration.
  'PRODUCT',
  // `APP3-B03` — the target of `design_template.created` (LC-24 `TR-LC24-01`,
  // IMP-D042 PO-03, which audits every transition). Same footing as `PRODUCT`
  // above: `target_kind` is open text with no CHECK by DB4 design, so this list
  // is the application's own G-DB7-46 guard and adding a kind needs no
  // migration.
  'DESIGN_TEMPLATE',
  'GALLERY_ENTRY',
  'CONTENT_PAGE',
  'AGREEMENT_VERSION',
  'POLICY_CONFIGURATION',
  'SECURE_ACCESS_GRANT',
  'NOTIFICATION_INTENT',
  // `APP4-B04` — the target of `verification.challenge.*` (LC-02
  // `TR-LC02-02`/`-03`/`-04`, `INV-14`). Same footing as `PRODUCT` and
  // `DESIGN_TEMPLATE` above: `target_kind` is open text with no CHECK by DB4
  // design, so this list is the application's own G-DB7-46 guard and adding a
  // kind needs no migration. The target is the **challenge**, not the customer:
  // an expiry or a lockout has no customer at all, and G-DB7-46 requires the
  // polymorphic target to have no foreign key precisely so an audit row can
  // outlive the transient row it describes.
  'CONTACT_VERIFICATION_CHALLENGE',
  // `APP10-B02` — the target of `customer.merge_case_opened` /
  // `customer.merge_case_rejected` (TBL-009). Same footing as `PRODUCT`,
  // `DESIGN_TEMPLATE` and `CONTACT_VERIFICATION_CHALLENGE` above: `target_kind`
  // is open text with no CHECK by DB4 design, so this list is the application's
  // own G-DB7-46 guard and adding a kind needs no migration. The target is the
  // **case**, not either customer: a merge case is about two identities and
  // neither is more its subject than the other, so filing the row under one
  // would hide the decision from the other's timeline. Both ids travel in the
  // summary.
  'CUSTOMER_MERGE_CASE',
  // `APP12-C02` — the target of `category.created` / `category.updated` /
  // `category.published` / `category.archived`. Same footing as `PRODUCT` above:
  // `target_kind` is open text with no CHECK by DB4 design, so this list is the
  // application's own G-DB7-46 guard and adding a kind needs no migration. The
  // taxonomy became operator-managed *data* at `APP12-C02`, so changing it is a
  // business action with an actor rather than a deployment with a changelog.
  'CATEGORY',
] as const;

export type AuditTargetKind = (typeof AUDIT_TARGET_KINDS)[number];

/**
 * Who acted.
 *
 * `adminId` is a bare reference with a real FK here (unlike the evidence rows
 * that deliberately have none); `systemJobKey` names an automated actor.
 */
export type AuditActor =
  | { readonly kind: 'ADMIN'; readonly adminId: string }
  | {
      readonly kind: 'CUSTOMER';
      readonly customerId: string;
      readonly grantId?: string | undefined;
    }
  | { readonly kind: 'SYSTEM'; readonly systemJobKey: string };

export interface AppendAuditEventInput {
  readonly occurredAt: Date;
  readonly actor: AuditActor;
  readonly action: string;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string;
  readonly reason?: string | undefined;
  /** Redacted already: an audit summary is not a place for PII or payloads. */
  readonly summary?: Record<string, unknown> | undefined;
  readonly failureCode?: string | undefined;
  readonly correlationId: string;
}

export interface AuditEvent {
  readonly action: string;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string;
  readonly actorKind: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export const AUDIT_EVENT_REPOSITORY = Symbol('AUDIT_EVENT_REPOSITORY');

export interface AuditEventRepository {
  /**
   * Appends one event.
   *
   * Joins the emitting use case's transaction when there is one, so the audit
   * trail and the action it describes commit together — an audited action that
   * rolled back would be a false record.
   */
  append(input: AppendAuditEventInput): Promise<void>;

  listByTarget(targetKind: AuditTargetKind, targetId: string): Promise<AuditEvent[]>;
  listByCorrelation(correlationId: string): Promise<AuditEvent[]>;
}
