# DB4 — Logical Relational Diagrams

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Nature:** Mermaid ER diagrams at logical level — table names, key
reference labels, cardinality. No SQL/index/Drizzle/migration syntax.
Cardinality: `||` one · `o|` zero-or-one · `o{` zero-or-many · `|{`
one-or-many. Dashed (`..`) = cross-context identity/snapshot reference.

## 1. Identity & Customer

```mermaid
erDiagram
  admin_accounts ||--o{ admin_credentials : "credential of"
  admin_accounts ||--o{ admin_sessions : "session of"
  customers ||--o{ customer_contact_points : "contact of"
  customers ||--o| business_profiles : "b2b profile"
  customer_contact_points ||--o{ contact_verification_challenges : "challenged"
  contact_verification_challenges ||--o{ contact_verification_attempts : "attempt"
  customers ||--o{ secure_access_grants : "granted to"
  secure_access_grants }o..|| custom_requests : "scoped to request"
  customers ||--o{ customer_merge_cases : "survivor or loser"
  customer_merge_cases ||--o{ customer_merge_events : "step evidence"
  customers ||--o| customers : "merged into"
```

## 2. Catalog, Inventory & Asset

```mermaid
erDiagram
  categories ||--o{ products : "categorizes"
  products ||--o{ product_variants : "variant"
  product_variants ||--o{ skus : "sku definition"
  products ||--o{ product_sides : "side"
  product_sides ||--o{ embroidery_areas : "area"
  products ||--o{ product_media : "media assoc"
  product_media }o..|| assets : "asset ref"
  product_sides }o..|| assets : "background ref"
  skus ||--o| sku_stocks : "stock row"
  sku_stocks ||--o{ inventory_ledger_entries : "movement"
  sku_stocks ||--o{ inventory_soft_holds : "soft hold"
  sku_stocks ||--o{ inventory_reservations : "reservation"
  inventory_soft_holds }o..|| custom_requests : "held for"
  inventory_reservations }o..|| orders : "reserved for"
  assets ||--o{ asset_inspections : "inspection"
  assets ||--o{ asset_derivatives : "derivative"
```

## 3. Design, Request & Approval

```mermaid
erDiagram
  design_sessions }o..o| design_templates : "clone origin"
  design_sessions ||--o{ design_session_assets : "upload assoc"
  design_session_assets }o..|| assets : "asset ref"
  custom_requests ||--|| design_cases : "design thread"
  custom_requests ||--o| customer_owned_products : "cop subject"
  custom_requests ||--o{ custom_request_quantity_breakdowns : "qty line"
  custom_requests ||--o{ custom_request_assets : "attachment assoc"
  custom_requests ||--o{ request_moderation_notes : "moderation"
  custom_requests ||--o{ custom_request_transitions : "transition"
  design_cases ||--o{ design_versions : "version"
  design_versions ||--o| design_versions : "parent version"
  design_versions ||--o{ design_version_assets : "asset assoc"
  design_versions }o..o| asset_derivatives : "preview ref"
  design_versions ||--o{ design_reviews : "review decision"
  design_versions ||--o| approval_snapshots : "approval evidence"
  approval_snapshots ||--o{ approval_snapshot_thread_colors : "thread color"
  approval_snapshots ||--o{ approval_snapshot_agreement_acceptances : "terms acceptance"
  approval_snapshot_agreement_acceptances }o..|| agreement_versions : "version plus hash"
  design_templates ||--o{ design_template_versions : "published version"
  design_templates ||--o{ design_template_assets : "artwork assoc"
```

## 4. Quotation, Order & Payment

```mermaid
erDiagram
  custom_requests ||--|| quotations : "priced by"
  quotations ||--o{ quotation_versions : "version"
  quotation_versions ||--o| quotation_versions : "parent version"
  quotation_versions ||--o{ quotation_line_items : "line"
  quotation_versions ||--o| quotation_acceptances : "acceptance evidence"
  custom_requests ||--o| orders : "one order"
  orders }o..|| customers : "customer ref"
  orders }o..|| quotation_versions : "accepted version"
  orders }o..|| approval_snapshots : "current approval pointer"
  orders ||--o{ order_items : "frozen line"
  order_items }o..|| approval_snapshots : "approval ref"
  order_items }o..o| skus : "sku ref"
  orders ||--o{ order_transitions : "transition and saga step"
  orders ||--o{ order_cancellation_requests : "cancellation review"
  orders ||--o{ payment_obligations : "deposit and remaining"
  payment_obligations }o..|| quotation_versions : "amount source"
  payment_obligations ||--o{ payment_attempts : "attempt"
  payment_obligations ||--o| payment_obligations : "superseded by"
  payment_attempts ||--o{ payment_provider_events : "callback evidence"
  payment_attempts ||--o{ payment_reconciliations : "reconciliation"
  payment_attempts ||--o{ refunds : "refund record"
  refunds }o..o| order_cancellation_requests : "saga linkage"
```

## 5. Production & Shipping

```mermaid
erDiagram
  orders ||--o{ production_jobs : "job"
  production_jobs }o..|| approval_snapshots : "exact approval"
  production_jobs ||--|| production_specifications : "frozen spec"
  production_jobs ||--o| production_jobs : "reworked from"
  production_jobs ||--o{ production_artifacts : "artifact assoc"
  production_artifacts }o..|| assets : "asset ref"
  production_jobs ||--o{ production_notes : "note"
  production_jobs ||--o{ production_job_transitions : "transition"
  orders ||--o| shipping_details : "prep record"
  shipping_details ||--o| shipping_snapshots : "frozen at dispatch"
  orders ||--o{ shipping_fee_acknowledgements : "fee acknowledgement"
```

## 6. Content, Gallery & Agreement

```mermaid
erDiagram
  gallery_entries ||--o{ gallery_entry_assets : "media assoc"
  gallery_entry_assets }o..|| assets : "public derivative ref"
  gallery_entries }o..o| products : "seo link"
  agreements ||--o{ agreement_versions : "immutable version"
  agreement_versions ||--o{ approval_snapshot_agreement_acceptances : "accepted in approvals"
  content_pages {
    text page_type
    text slug
  }
  redirect_rules {
    text source_path
    text target_path
  }
```

## 7. Notification, Audit & Platform

```mermaid
erDiagram
  notification_intents ||--o{ notification_delivery_attempts : "delivery try"
  notification_intents }o..o| customer_contact_points : "recipient ref"
  notification_intents }o..o| outbox_events : "source event"
  policy_configurations ||--o{ policy_configuration_versions : "versioned value"
  audit_events {
    text action
    text target_kind
    text target_id
  }
  outbox_events {
    text event_type
    text aggregate_kind
    text aggregate_id
  }
  idempotency_records {
    text operation_namespace
    text scope_key
  }
  background_job_attempts {
    text job_kind
    text job_key
  }
```

Note: standalone entities in §6/§7 carry no intra-diagram relationship
lines because their targets are justified polymorphic references without
physical FKs (audit target, outbox aggregate ref — REL-103/104).
