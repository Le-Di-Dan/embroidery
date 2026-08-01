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
  'GALLERY_ENTRY',
  'CONTENT_PAGE',
  'AGREEMENT_VERSION',
  'POLICY_CONFIGURATION',
  'SECURE_ACCESS_GRANT',
  'NOTIFICATION_INTENT',
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
