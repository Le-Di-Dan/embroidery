# DB4 — Context Schema: Design & Ordering (CTX-DSN / CTX-ORD)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-025..036 (Design), TBL-037..049 (Ordering).

## 1. Design structures

| Table | Role |
|---|---|
| `design_sessions` + `design_session_assets` (TBL-025/026) | temporary guest-capable editor state; jsonb working document + `document_schema_version`; `autosave_revision` optimistic marker (CC-01); template clone origin (id + version, provenance only) |
| `design_cases` (TBL-027) | one design thread per request (CST-020); `current_version_id` pointer |
| `design_versions` (TBL-028) + `design_version_assets` (TBL-029) | formal versions; document frozen + JCS/SHA-256 `document_hash` at send (ADR-DB1-012); parent chain; **partial unique single-active-review** (CST-022, INV-16); immutable once sent (CST-090) |
| `design_reviews` (TBL-030) | append-only APPROVE/REQUEST_REVISION decisions with grant/step-up evidence |
| `approval_snapshots` (+ thread colors, agreement acceptances; TBL-031..033) | immutable approval evidence per `06 §9`: exact version ref + document/preview hashes + product/variant/side/area refs **and display copies** + dimensions + quantity + frozen contact snapshot + grant/step-up refs + per-type agreement version + content hash (GRD-008) |
| `design_templates` (+ versions, assets; TBL-034..036) | store-authored templates; optional product/side/area scope (also feeds catalog display suggestions); publish bumps `current_version` and freezes a version row; clone-on-use never links live |

## 2. Ordering structures

| Table | Role |
|---|---|
| `custom_requests` (TBL-037) | case root; code; LC-11 states incl. **QUOTE_ACCEPTED** (authoritative column); current design-case/quotation pointers; store-product subject XOR COP |
| `customer_owned_products` (TBL-038) | COP 0..1 per request; **no SKU/stock columns by construction** (INV-13) |
| `custom_request_quantity_breakdowns` (TBL-039) | relational storage of the Quantity Breakdown VO — **explicitly not a resurrected Request Item aggregate** (CON-075 remains rejected): no lifecycle, no commercial fields, mutable only until QUOTED |
| `custom_request_assets` / `request_moderation_notes` / `custom_request_transitions` (TBL-040..042) | associations, append-only moderation, Tier A transition history |
| `orders` (TBL-043) | fulfillment root; LC-14 11 states incl. **ON_HOLD/CANCELLING** (authoritative column); unique request→order (CST-030); `accepted_quotation_version_id` frozen ref; `current_approval_snapshot_id` audited pointer |
| `order_items` (TBL-044) | immutable per-line commercial snapshot (SKU or COP subject, CST-067) with NOT NULL approval ref |
| `order_transitions` (TBL-045) | Tier A history: state changes, delivery events, saga steps, shipping freeze, pointer moves, post-freeze corrections |
| `order_cancellation_requests` (TBL-046) | manual-review record (stage/initiator/decision + step-up evidence) |
| `shipping_details` / `shipping_snapshots` / `shipping_fee_acknowledgements` (TBL-047..049) | mutable prep record → immutable dispatch snapshot + fee-change acknowledgement evidence (see [`DB4_SCHEMA_PRODUCTION_SHIPPING.md`](./DB4_SCHEMA_PRODUCTION_SHIPPING.md) for freeze mechanics) |

## 3. Modeling assertions (task §15.3)

1. **Design document integrity:** jsonb payload + `document_schema_version`
   + `document_hash` (`sha256:<hex>`, CST-070/074) on every version;
   canonicalization owned by `packages/design-document` (ADR-DB1-012);
   hashes never recomputed against mutated content because sent rows are
   trigger-frozen (CST-090).
2. **One active review:** CST-022 partial unique is the DB arbiter for
   INV-16/GRD-004/CC-03 (D7-04, D8-09).
3. **Approved immutable & terminal:** CST-090/091 triggers + no
   APPROVED→* transition (GRD-019); corrections = new version, new approval
   (INV-01/17).
4. **Request QUOTE_ACCEPTED per DB3:** stored in `custom_requests.status`
   CHECK set — the digitizing gate (GRD-005) reads it in-tx.
5. **Order ON_HOLD / CANCELLING:** stored in `orders.status` CHECK set;
   hold reason column [R]; saga steps recorded as `order_transitions`
   SAGA_STEP rows — saga is resumable without a dedicated saga-state table
   (optional per DB3, not created).
6. **Order creation boundary (ADR-DB3-001 r7):** one tx creates order +
   items + both obligations; the schema supports idempotency via CST-030 +
   `order.create` idempotency record; items copy values (INV-12), never
   reference live prices.
7. **Session safety:** `autosave_revision` optimistic marker (GRD-027);
   session family is hard-TTL deleted (cascade-temp REL-042); submission
   handover stamps `submitted_request_id` and the request stamps
   `submitted_session_id` (provenance both ways).
8. **Template independence:** clones copy the document into the session;
   `template_id + template_version` are provenance-only columns (REL-041);
   template updates create new version rows and never touch sessions or
   design versions (D7-14).

## 4. State & history

LC-07/08/09/10/11/14/19/21 mapped in
[`DB4_STATE_AND_TRANSITION_STORAGE.md`](./DB4_STATE_AND_TRANSITION_STORAGE.md):
design = Tier B (version rows + reviews + timestamps); request/order = Tier
A dedicated transition tables; approval = exists-or-not snapshot (LC-10).
