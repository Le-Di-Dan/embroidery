# APP12 — Hardening, UAT and Production Readiness

## 0. Roadmap status

```text
ROADMAP_STATUS         = PROPOSED_FOR_PO_LOCK
ROADMAP_LOCK           = PENDING_PO_REVIEW
IMPLEMENTATION_STARTED = false
CHECKPOINTS            = 38
PROPOSED_NEXT          = APP12-P01
CORRECTION             = PRE_IMPLEMENTATION_AUDIT_C1 (2026-09-01)
```

### 0.0 Category taxonomy — dynamic (Product Owner, C1)

```text
CATEGORY_MODEL = DYNAMIC
ao-thun        = VALID
```

The APP2 four-value set (`thu-bong`, `khan`, `quan-ao`, `khac`) is the **initial
alpha public taxonomy baseline**, not a permanent domain ceiling. APP12
production authority supersedes that limitation so operators can grow the
taxonomy without a code deploy. `categories.slug` stays unique, stable and
format-validated (`^[a-z0-9-]+$`), and remains **immutable once published**.

This supersedes the taxonomy clauses of `IMP-D032` ("closed, provisioned root
set"; "no category HTTP operation is added") and `IMP-D038` ("exactly
`thu-bong`, `khan`, `quan-ao`, `khac`"), recorded by `APP12-P01`. Their other
clauses — slug immutability, `categorySlug` on the wire, the physical UUID never
exposed, `/kham-pha`, the `?category=` key — are retained.

### 0.1 Release strategy — Product Owner authority (2026-09-01)

```text
WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE
WAVE 2 = ALL CUSTOM EMBROIDERY
         customer-owned-product embroidery · catalog personalisation
         Design Studio / Editor · custom request intake · manual quotation
         design review and approval · deposit + remaining payment
         custom production and fulfilment
```

Terminology is locked: `READY_MADE_COMMERCE` is not `CUSTOMER_OWNED_PRODUCT`, not
`CUSTOM_REQUEST`, not `CATALOG_PERSONALISATION` and not `DESIGN_STUDIO`.

### 0.2 Bounded scope exception to §5

The Product Owner grants one explicit exception to this phase's "no new business
features" boundary: APP12 **may** implement the minimum production-grade
ready-made / base-product direct commerce capability required for Wave 1, because
Wave 1 cannot exist without it. The exception does **not** authorize marketplace,
promotions, discounts, coupons, wishlist, reviews, loyalty, multi-seller, B2B
ordering, complex merchandising, a third-party payment provider or any broader
ecommerce expansion. Every other §5 restriction remains in force.

### 0.3 Design policy amendment to §3

`NONE` no longer holds for ready-made commerce. One phase-level design package
(`APP12-D01`) is authorized for the ready-made journey **only**, delivered before
its frontend implementation. Unrelated Storefront screens are not redesigned, and
the Runtime Visual & Content UAT remains a defect-correction process rather than
a redesign programme. `PO-APP12-004` additionally grants bounded correction
authority over three contrast-failing design tokens.

### 0.4 Ready-Made lifecycle and shipping-fee authority (C1)

```text
SHIPPING_FEE = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT

AWAITING_SHIPPING_FEE → AWAITING_PAYMENT → READY_FOR_DELIVERY
                      → DELIVERED → COMPLETED
                      (+ ON_HOLD · CANCELLING · CANCELLED)
```

No automatic shipping calculation, no carrier quote, no fabricated flat rate. The
redundant `PAID` order state is removed — payment truth lives in the `FULL`
obligation, whose satisfaction is the authoritative transition to
`READY_FOR_DELIVERY`. A fee change while `FULL` is `PENDING` supersedes that
obligation and creates a successor; a fee edit after `FULL` is `SATISFIED` is
refused and requires the explicit cancellation/refund authority. Inventory is
reserved at durable order creation with an expiry; on expiry the reservation is
released, the order is cancelled and later payment verification is refused.

### 0.5 Roadmap authority

- [`APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md)
  — **current** proposed roadmap (§Q, 38 checkpoints), dynamic category
  architecture (§C–§E), shipping-fee authority (§F), corrected lifecycle (§G),
  reservation expiry (§H), route model (§I), checkpoint splits (§J–§O),
  follow-up ownership (§P).
- [`APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md)
  — retained. Ready-Made gap analysis (§Z4) and target journey (§Z5) stand; its
  §Z9 32-checkpoint roadmap is `SUPERSEDED_BY_PRE_IMPLEMENTATION_AUDIT_C1`.
- [`APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md)
  — retained evidence record. Its §T 20-checkpoint roadmap is
  `SUPERSEDED_BY_PO_APP12_READY_MADE_WAVE1_DECISION`.

```text
PO-APP12-001 … PO-APP12-006 = ALL RESOLVED
NEW_PO_DECISION_REQUIRED    = NONE
PO_INPUT_REQUIRED_BEFORE_R01 = canonical store address, opening hours, phone, e-mail
```

### 0.6 Proposed structure (C1)

```text
Wave 0   P01 · G01 · G02 · G03 · D01 · DB01
         C01 · C02 · C03 · A01
         B01 · B02 · B03 · B04 · B05
         S01 · S02 · S03 · A02
Wave 1   H01 · H02 · H03 · H04 · H05 · H06 · H07 · H08
         V01 · V02 · U01 · E01
R01      Ready-Made GO / NO-GO
Wave 2   W01 · W02 · W03 · W04
R02      Custom Embroidery GO / NO-GO
X01      Final APP12 closure
```

Namespace semantics: `Pxx` product/document authority · `Gxx` governance and
readiness · `Cxx` contract/category authority · `DBxx` database change control ·
`Dxx` design · `Bxx` backend · `Sxx` Storefront UI · `Axx` **Admin UI only** ·
`Hxx` hardening and release quality (**including accessibility, `H08`**) · `Vxx`
runtime visual/content UAT · `Uxx` business UAT · `Exx` cross-boundary
regression · `Rxx` release gate · `Xxx` closure.

**No APP12 checkpoint is executable until the Product Owner accepts this
roadmap.** `PROPOSED_NEXT` is not `NEXT`. Actual production deployment remains a
separately authorized operational action after either release gate.

Sections 1–9 below remain the locked phase authority, amended only by §0.2 and
§0.3; §6 stays as the pre-audit candidate record.

## 1. Outcome

Prove that the feature-complete system is secure, observable, recoverable, performant, accessible, operationally documented, and acceptable to business users before production approval.

## 2. Dependencies

APP0–APP11 complete; deployment environment and operational owners available.

## 3. Design policy

Classification: `NONE` for new product design. Only approved defect corrections are allowed. Material redesign requires a separate approved design change, not hidden hardening work.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Security and authorization audit.
- Upload/private asset abuse review.
- Payment/provider failure rehearsal.
- Performance/load/query validation at representative scale.
- Worker resilience/dead-letter/manual-review rehearsal.
- Observability dashboards/alerts/log redaction.
- Backup/restore and disaster recovery evidence inherited/verified for release.
- Accessibility, responsive, browser/device and SEO audit.
- UAT by roles and critical journeys.
- Deployment, rollback, incident and Admin runbooks.
- Production configuration/secret validation.
- Final regression and release candidate manifest.

## 5. Out of scope

- New business features.
- Broad visual redesign.
- Silent scope expansion to fix UAT preferences.
- Production launch without explicit approval.
- Claims of SLA/RPO/RTO beyond measured/approved evidence.

## 6. Candidate engineering checkpoints (pre-audit record)

> **Superseded pending lock.** These candidates were reconciled by the
> pre-implementation audit (KEEP / MERGE / SPLIT / REMOVE / REORDER / RENAME per
> candidate — see the audit report §S). They are retained here as the pre-audit
> record. The proposed replacement roadmap is in the audit report §T and is
> `PROPOSED_FOR_PO_LOCK`; neither set is executable before Product Owner
> acceptance.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP12-H01 — Authorization and security audit:** Audit endpoint/screen matrix, object ownership, secure grants, uploads, sessions, rate limits, secrets and redaction.
- **APP12-H02 — Performance and scalability validation:** Run representative API, SSR, DB, asset and worker workloads; fix only evidence-backed bottlenecks through separate checkpoints.
- **APP12-H03 — Resilience and failure rehearsal:** Exercise provider outage, duplicate callbacks, worker failure, poison jobs, storage errors and recovery/manual review.
- **APP12-H04 — Observability and alerting:** Complete metrics, logs, traces/correlation, dashboards and actionable alerts for critical journeys.
- **APP12-H05 — Accessibility and compatibility audit:** Audit keyboard, screen reader-critical paths, contrast, mobile, supported browsers and editor interactions.
- **APP12-H06 — SEO and public performance audit:** Validate crawl/index rules, metadata, structured data, Core Web Vitals-oriented budgets and cache behavior.
- **APP12-H07 — Operational runbooks:** Finalize deployment, migration, rollback, backup/restore, incident, payment reconciliation, worker/manual-review and Admin procedures.
- **APP12-U01 — Role-based UAT:** Execute approved scripts for Admin, customer and operational roles; defects become bounded correction checkpoints.
- **APP12-E01 — Full commerce regression:** Catalog → Studio → verification → request → review → quote → deposit → order → production → remaining payment → fulfillment → completion.
- **APP12-E02 — Negative/recovery regression:** Authorization denial, duplicate submit/callback, expired link, invalid design, stock race, provider outage and worker retry.
- **APP12-X01 — Production candidate closure:** Create release manifest, exact evidence, known limitations, rollback plan and explicit go/no-go decision request.

## 7. Critical end-to-end journey

The complete commerce journey and major negative/recovery journeys pass in a production-like environment. Operational staff can diagnose and recover defined failures using runbooks without unsafe database manipulation.

## 8. Exit gate

- All blocking security/UAT defects closed.
- Critical regression passes.
- Backup/restore and rollback evidence is current.
- Alerts/runbooks are actionable.
- No production claim exceeds evidence.
- Explicit production approval remains required.

## 9. Handoff

After APP12 PASS, the system is a Production Candidate. Actual production deployment is a separate authorized operational action.
