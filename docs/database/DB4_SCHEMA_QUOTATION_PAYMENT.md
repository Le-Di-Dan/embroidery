# DB4 — Context Schema: Quotation & Payment (CTX-QUO / CTX-PAY)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-050..053 (Quotation), TBL-054..058 (Payment).

## 1. Quotation structures

| Table | Role |
|---|---|
| `quotations` (TBL-050) | header: code, 1–1 request ref, LC-12 state, current-version pointer |
| `quotation_versions` (TBL-051) | immutable-once-sent full pricing snapshot: pricing inputs (stitch count, color count, dimensions, quantity), display product snapshot, subtotal/adjustment/shipping-fee/total, deposit percent + deposit/remaining split, validity window, state timestamps |
| `quotation_line_items` (TBL-052) | frozen lines with `line_kind` (incl. DIGITIZING_FEE for the S5 refund default) |
| `quotation_acceptances` (TBL-053) | append-only acceptance evidence: unique per version, grant + step-up refs, accepted total |

### Assertions

1. **Pricing inputs relational** (no JSONB): stitch_count, color_count,
   dimensions, quantity are columns with CHECKs (CST-065/066).
2. **GAP-10 closed here:** `stitch_count` is an **admin-entered quotation
   pricing input** — integer ≥ 0, nullable while DRAFT, required before
   send (send guard; CK candidate CST-065), never derived/computed (no
   stitch engine exists, `00 §8`), corrections create a new version
   (INV-02), entry audited with actor=admin, and it lives **only** in the
   quotation version — the design document is never an authoritative
   pricing source.
3. **Shipping fee snapshot:** `shipping_fee_amount` frozen in the version
   (quoted fee, BR-004); the final fee freezes separately in the shipping
   snapshot (dual-snapshot by design, DB3 shipping spec §1.3).
4. **Validity/expiry:** `valid_from/valid_until` + CK ordering; expiry
   sweep contends with acceptance in-tx (CC-06/D8-10).
5. **Version history = structural** (Tier B): version rows + parent chain
   (REL-067) + acceptance evidence + state timestamps; supersede on new
   send (TR-LC12-04); re-acceptance after change binds the exact new
   version (GRD-006, CST-038).
6. **Derivation checks:** total = subtotal + adjustment + shipping fee;
   deposit + remaining = total; percent bounds (CST-064; ADR-DB4-001 r5).

## 2. Payment structures

| Table | Role |
|---|---|
| `payment_obligations` (TBL-054) | deposit and remaining as **two independent rows** (`kind`), partial-unique one live per (order, kind) (CST-039, INV-04); supersede chain for recalculation; `satisfied_by_attempt_id` exactly-once evidence |
| `payment_attempts` (TBL-055) | provider-agnostic attempts (LC-16 states); attempt → exactly one obligation (CON-106 allocation = FK REL-084) |
| `payment_provider_events` (TBL-056) | append-only verified callback evidence: unique (provider, event ref) (CST-040), redacted jsonb payload, provider-reported amount/currency for exact verification, `application_outcome` records duplicate/out-of-order handling |
| `payment_reconciliations` (TBL-057) | append-only manual reconciliation + obligation-recalculation/carry-over records (ADR-DB3-002/003) |
| `refunds` (TBL-058) | reviewed refund records (LC-20); amounts immutable after creation; manual execution evidence (`transfer_reference` required at EXECUTED) |

### Assertions

1. **Accepted version links order/payment creation:**
   `orders.accepted_quotation_version_id` +
   `payment_obligations.source_quotation_version_id` (REL-073/082) tie both
   obligations to the accepted total (ADR-DB3-001 r3/7).
2. **Duplicate/out-of-order representable:** every received event is
   appended (evidence) even when it applies nothing
   (`application_outcome = RECORDED_NO_OP/ESCALATED`); attempt states never
   regress (CST-118); contradictions escalate to REQUIRES_REVIEW
   (CC-07/08, D8-01/02).
3. **Idempotency:** CST-040 + `idempotency_records` (`payment.callback`
   keyed by server-side provider event id) are the double-apply arbiters
   (INV-07); redirect returns are never a success path (INV-15 — no schema
   field represents "redirect success").
4. **Reconciliation append-only:** REQUIRES_REVIEW resolution and
   obligation recalculation are new reconciliation rows with mandatory
   reason (CST-098, D7-10); nothing overwrites a succeeded attempt —
   refunds advance the attempt to REFUNDED/PARTIALLY_REFUNDED only via an
   EXECUTED refund record (TR-LC16-07).
5. **Currency/amount exact:** numeric(14,2) + `currency_code` per
   ADR-DB4-001; refund ≤ refundable is TX/App (CST-117, GRD-021).

## 3. State & history

LC-12/13/15/16/20 mapped in
[`DB4_STATE_AND_TRANSITION_STORAGE.md`](./DB4_STATE_AND_TRANSITION_STORAGE.md);
payment/quotation history is Tier B structural per ADR-DB4-002 (provider
events + reconciliations + refunds + acceptance rows + state timestamps).
"Fully paid" stays derived (never stored) per DB3 derived-state catalog.
