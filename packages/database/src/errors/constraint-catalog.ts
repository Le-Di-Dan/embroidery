/**
 * Named physical arbiters that carry a specific business meaning (DB7-CP2).
 *
 * The schema has 63 uniqueness arbiters (50 UNIQUE constraints + 13 partial
 * unique indexes) and 189 CHECK constraints. Mapping all 189 individually would
 * be noise: a CHECK rejection is always "this value is not allowed here", and
 * the deterministic family rules in `map-database-error.ts` say that safely.
 *
 * What *is* listed here is every arbiter whose rejection a use case must be
 * able to tell apart from a generic duplicate — the "critical business
 * arbiters" of DB7 §9.4. Three of them are not errors at all: a duplicate
 * idempotency claim, provider event or notification intent is the *expected*
 * signal to replay the earlier outcome, which is why `replayable` exists.
 *
 * Adding a row here is a deliberate act: an arbiter with no entry falls back to
 * the family rule, which is correct but generic.
 */
import type { PersistenceErrorKind } from './persistence-error';

export interface ConstraintMeaning {
  readonly kind: PersistenceErrorKind;
  /** Stable, client-safe code. */
  readonly code: string;
  /** Client-safe message. Never interpolates a database value. */
  readonly message: string;
  /** A duplicate here means "replay the earlier result", not "fail". */
  readonly replayable?: boolean;
}

const conflict = (code: string, message: string, replayable = false): ConstraintMeaning => ({
  kind: 'CONFLICT',
  code,
  message,
  replayable,
});

/**
 * Keyed by the exact constraint/index name the server reports.
 *
 * Names come from the DB6 schema modules; a typo here silently degrades to the
 * family rule, so `constraint-catalog.spec.ts` asserts every key exists in the
 * live schema.
 */
export const CONSTRAINT_MEANINGS: Readonly<Record<string, ConstraintMeaning>> = {
  // ---- Platform primitives: duplicates are replay signals, not failures ----
  uq_idempotency_records__namespace_scope_key: conflict(
    'IDEMPOTENCY_KEY_IN_USE',
    'This operation has already been claimed with the same idempotency key.',
    true,
  ),
  uq_payment_provider_events__provider_key__provider_event_ref: conflict(
    'PROVIDER_EVENT_ALREADY_RECORDED',
    'This provider event has already been recorded.',
    true,
  ),
  uq_notification_intents__intent_key: conflict(
    'NOTIFICATION_INTENT_ALREADY_EXISTS',
    'A notification intent already exists for this key.',
    true,
  ),
  uq_background_job_attempts__kind_key_attempt: conflict(
    'JOB_ATTEMPT_ALREADY_RECORDED',
    'This job attempt has already been recorded.',
    true,
  ),

  // ---- Conversion gates (GRD-009, GRD-013, GRD-015) ----
  uq_orders__request: conflict(
    'ORDER_ALREADY_EXISTS_FOR_REQUEST',
    'An order already exists for this request.',
  ),
  uq_orders__code: conflict('DUPLICATE_ORDER_CODE', 'That order code is already in use.'),
  uq_quotations__request: conflict(
    'QUOTATION_ALREADY_EXISTS_FOR_REQUEST',
    'A quotation already exists for this request.',
  ),
  uq_quotation_acceptances__qversion: conflict(
    'QUOTATION_VERSION_ALREADY_ACCEPTED',
    'This quotation version has already been accepted.',
  ),
  uq_approval_snapshots__version: conflict(
    'DESIGN_VERSION_ALREADY_APPROVED',
    'This design version has already been approved.',
  ),
  uq_production_jobs__order_approval_snapshot: conflict(
    'PRODUCTION_JOB_ALREADY_EXISTS',
    'A production job already exists for this order and approval.',
  ),
  uq_production_specifications__job: conflict(
    'PRODUCTION_SPECIFICATION_ALREADY_FROZEN',
    'This production job already has a frozen specification.',
  ),
  uq_shipping_snapshots__order: conflict(
    'SHIPPING_ALREADY_DISPATCHED',
    'This order has already been dispatched.',
  ),

  // ---- Single-active-state arbiters (partial unique indexes) ----
  uq_design_versions__case__sent_for_review: conflict(
    'REVIEW_ALREADY_ACTIVE',
    'Another version of this design is already awaiting review.',
  ),
  uq_inventory_soft_holds__request_stock__held: conflict(
    'SOFT_HOLD_ALREADY_ACTIVE',
    'An active hold already exists for this request and SKU.',
  ),
  uq_inventory_reservations__order_stock__reserved: conflict(
    'RESERVATION_ALREADY_ACTIVE',
    'An active reservation already exists for this order and SKU.',
  ),
  uq_payment_obligations__order_kind__live: conflict(
    'OBLIGATION_ALREADY_ACTIVE',
    'A live payment obligation of this kind already exists for the order.',
  ),
  uq_secure_access_grants__customer_request__active: conflict(
    'GRANT_ALREADY_ACTIVE',
    'An active access grant already exists for this customer and request.',
  ),
  uq_secure_access_grants__customer_order__active: conflict(
    'GRANT_ALREADY_ACTIVE',
    'An active access grant already exists for this customer and order.',
  ),
  uq_verification_challenges__kind_value_purpose__issued: conflict(
    'CHALLENGE_ALREADY_OPEN',
    'A verification challenge is already open for this contact and purpose.',
  ),
  uq_order_cancellation_requests__order__pending: conflict(
    'CANCELLATION_ALREADY_PENDING',
    'A cancellation request is already pending for this order.',
  ),
  uq_customer_merge_cases__survivor_loser__requested: conflict(
    'MERGE_CASE_ALREADY_OPEN',
    'A merge case is already open for this pair of customers.',
  ),
  uq_admin_accounts__status__active: conflict(
    'ADMIN_ACCOUNT_ALREADY_ACTIVE',
    'An active administrator account already exists.',
  ),
  uq_customer_contact_points__customer__primary: conflict(
    'PRIMARY_CONTACT_ALREADY_SET',
    'This customer already has a primary contact point.',
  ),
  uq_customer_contact_points__kind_value__verified: conflict(
    'CONTACT_ALREADY_VERIFIED',
    'This contact is already verified for another customer.',
  ),
  uq_asset_derivatives__asset_kind__not_failed: conflict(
    'DERIVATIVE_ALREADY_EXISTS',
    'A derivative of this kind already exists for the asset.',
  ),

  // ---- Identity / secret lookups ----
  uq_admin_accounts__email: conflict(
    'DUPLICATE_ADMIN_EMAIL',
    'That administrator email is already registered.',
  ),
  uq_admin_sessions__token_hash: conflict(
    'SESSION_TOKEN_COLLISION',
    'Could not issue the session; please retry.',
  ),
  uq_secure_access_grants__token_hash: conflict(
    'GRANT_TOKEN_COLLISION',
    'Could not issue the access grant; please retry.',
  ),
  uq_design_sessions__session_secret_hash: conflict(
    'SESSION_SECRET_COLLISION',
    'Could not open the design session; please retry.',
  ),

  // ---- Version-sequence arbiters ----
  uq_design_versions__case_version: conflict(
    'DESIGN_VERSION_NUMBER_TAKEN',
    'That design version number already exists for this case.',
  ),
  uq_quotation_versions__quotation_version: conflict(
    'QUOTATION_VERSION_NUMBER_TAKEN',
    'That quotation version number already exists for this quotation.',
  ),
  uq_agreement_versions__agreement_version: conflict(
    'AGREEMENT_VERSION_NUMBER_TAKEN',
    'That agreement version number already exists.',
  ),
  uq_policy_configuration_versions__config_version: conflict(
    'POLICY_VERSION_NUMBER_TAKEN',
    'That configuration version number already exists.',
  ),
  uq_design_template_versions__template_version: conflict(
    'TEMPLATE_VERSION_NUMBER_TAKEN',
    'That template version number already exists.',
  ),

  // ---- One-to-one owner arbiters ----
  uq_design_cases__request: conflict(
    'DESIGN_CASE_ALREADY_EXISTS',
    'This request already has a design case.',
  ),
  uq_customer_owned_products__request: conflict(
    'CUSTOMER_PRODUCT_ALREADY_SET',
    'This request already has a customer-supplied product.',
  ),
  uq_shipping_details__order: conflict(
    'SHIPPING_DETAILS_ALREADY_EXIST',
    'This order already has shipping details.',
  ),
  uq_sku_stocks__sku: conflict(
    'STOCK_RECORD_ALREADY_EXISTS',
    'This SKU already has a stock record.',
  ),
  uq_business_profiles__customer: conflict(
    'BUSINESS_PROFILE_ALREADY_EXISTS',
    'This customer already has a business profile.',
  ),

  // ---- Public identifiers ----
  uq_products__slug: conflict('DUPLICATE_SLUG', 'That slug is already in use.'),
  uq_categories__slug: conflict('DUPLICATE_SLUG', 'That slug is already in use.'),
  uq_gallery_entries__slug: conflict('DUPLICATE_SLUG', 'That slug is already in use.'),
  uq_design_templates__slug: conflict('DUPLICATE_SLUG', 'That slug is already in use.'),
  uq_content_pages__page_type_slug: conflict(
    'DUPLICATE_SLUG',
    'That slug is already in use for this page type.',
  ),
  uq_redirect_rules__source_path: conflict(
    'DUPLICATE_REDIRECT_SOURCE',
    'A redirect already exists for that path.',
  ),
  uq_custom_requests__code: conflict(
    'DUPLICATE_REQUEST_CODE',
    'That request code is already in use.',
  ),
  uq_quotations__code: conflict(
    'DUPLICATE_QUOTATION_CODE',
    'That quotation code is already in use.',
  ),
  uq_skus__code: conflict('DUPLICATE_SKU_CODE', 'That SKU code is already in use.'),
  uq_assets__storage_key: conflict(
    'DUPLICATE_STORAGE_KEY',
    'That storage key is already registered.',
  ),
  uq_asset_derivatives__storage_key__set: conflict(
    'DUPLICATE_STORAGE_KEY',
    'That storage key is already registered.',
  ),
  uq_agreements__agreement_type: conflict(
    'AGREEMENT_TYPE_ALREADY_EXISTS',
    'An agreement already exists for that policy type.',
  ),
  uq_policy_configurations__config_key: conflict(
    'POLICY_KEY_ALREADY_EXISTS',
    'A configuration already exists for that key.',
  ),
};

/** Every arbiter this catalog names. Used by the coverage test. */
export const CATALOGUED_CONSTRAINTS: readonly string[] = Object.keys(CONSTRAINT_MEANINGS);
