# Master Application Roadmap

## 1. Strategy

The implementation stage is ordered by dependency and business value. Admin authoring/operations lead the Storefront by one capability; both are completed inside the same business phase. Design is audited per phase and produced as a whole package only when needed.

## 2. Ordered phases

| Phase | Name | Primary outcome | Design expectation |
|---|---|---|---|
| APP0 | Application Delivery Foundation | Reviewable delivery system, Swagger/OpenAPI, generated client, SCSS foundation, testing and technical spikes. | `NONE` except technical UI/style verification. |
| APP1 | Staff Access and Application Shells | Secure Admin login, permission-aware shell, Storefront shell. | Audit; likely `SUPPLEMENT` for Admin shell. |
| APP2 | Assets and Catalog Publication | Admin publishes products/assets; Storefront lists and displays published products. | Audit existing public UI; Admin likely `NEW/SUPPLEMENT`. |
| APP3 | Design Templates and 2D Design Studio | Admin publishes compatible templates; customer creates watermark-protected 2D customization. | Audit existing studio design; package gaps as one phase. |
| APP4 | Customer Identity, Verification, Secure Access and Notification Core | Customer/contact foundation and secure links support later review/payment journeys. | Limited customer-facing package if missing; Admin operations may need design. |
| APP5 | Custom Requests and Customer-Owned Products | Customer submits embroidery request; Admin triages and manages it. | Whole request journey package when gaps exist. |
| APP6 | Design Review, Approval and Quotation | Versioned design review, secure approval and immutable quotation workflow. | Whole Admin/customer review and quotation package. |
| APP7 | Deposit Payment and Order Creation | Verified deposit converts approved quote into an order safely. | Payment/status package only after provider UX is known. |
| APP8 | Inventory Reservation and Production Operations | Order reserves inventory and moves through production with concurrency safety. | Mostly Admin; design package if production board absent. |
| APP9 | Remaining Payment, Fulfillment and Completion | Remaining obligation, fulfillment freeze, completion/cancellation/refund according to locked policy. | Customer order/payment and Admin fulfillment package. |
| APP10 | Customer Operations and Communication | Profiles, merge, notification operations, simple Zalo/Messenger handoff. | Admin/customer operations package as needed. |
| APP11 | Gallery, Content, SEO and Store Presentation | Public content/discovery and operational content management. | Reuse existing public designs; supplement CMS/Admin gaps. |
| APP12 | Hardening, UAT and Production Readiness | Security, resilience, performance, observability, runbooks and go-live evidence. | No broad redesign; only defect corrections. |

## 3. Dependency chain

```text
APP0
→ APP1
→ APP2
→ APP3
→ APP4
→ APP5
→ APP6
→ APP7
→ APP8
→ APP9
→ APP10
→ APP11
→ APP12
```

Some discovery/design work for the next phase may run while engineering implements the current phase, but implementation dependencies remain ordered unless an explicit re-plan proves independence.

## 4. First implementation target

After APP0 and APP1 foundations, the first full business vertical slice is:

```text
Admin login
→ upload/process asset
→ create product draft
→ publish product
→ Storefront server-renders product list/detail
→ unpublish removes public visibility
```

This slice proves authentication, authorization, application services, persistence, object storage, worker processing, Swagger/client, Admin, Storefront, SSR/SEO, SCSS, gateway, logging and E2E integration.

## 5. Phase planning depth

Detailed candidate checkpoints are in `phases/APP*.md`. They are a roadmap, not authorization to execute more than one checkpoint at a time.

Exact endpoints may be corrected during the phase contract audit when repository truth requires it, but corrections must preserve:

- Phase outcome.
- Five-endpoint maximum.
- Human review boundaries.
- Existing lifecycle/database semantics.
- Vertical delivery order.

## 6. Current phase status

This section is the canonical phase-status record for the application stage. Status values come from `11-TRACEABILITY-AND-STATUS-MATRIX.md` §3.

| Phase | Status | Evidence |
|---|---|---|
| APP0 | `COMPLETE` | Closed at `APP0-X01`; all 18 preceding checkpoints complete. Report: [`reports/APP0-X01-COMPLETION-REPORT.md`](./reports/APP0-X01-COMPLETION-REPORT.md); plan: [`phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md`](./phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md). |
| APP1 | `READY_FOR_ENGINEERING` — **not started** | Unblocked by APP0 closure. Plan: [`phases/APP1-STAFF-ACCESS-AND-SHELLS.md`](./phases/APP1-STAFF-ACCESS-AND-SHELLS.md). Closure owner for milestone **R0**. |
| APP2–APP12 | `NOT_STARTED` | Dependency-ordered per §3. |

APP0 closure is a **foundation** milestone, not a release: R0 closes at APP1 (`09-RELEASE-AND-MILESTONE-POLICY.md` §2) and production readiness remains APP12's (IMP-D015).
