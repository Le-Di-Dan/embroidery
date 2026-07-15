# DB3 — Derived State Catalog

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Rule (locked):** derived states không bao giờ là transition source trừ khi
được khóa rõ ở đây (không có ngoại lệ nào được khóa). Persist-vs-compute là
quyết định DB4 per row; mọi derived state recomputable từ source facts.

| Derived state | Source facts | Owner (compute) | Staleness tolerance | Query owner | Notes |
|---|---|---|---|---|---|
| SKU availability (AVAILABLE/OUT_OF_STOCK) | balance projection (ledger+holds+reservations) + catalog manual override | INV (số liệu) + CAT (display) | display-only; reservation correctness dùng locked reads (GRD-014), không dùng projection | Q-03 | precedence: override OUT_OF_STOCK wins; override không thể ép AVAILABLE khi computed ≤ 0 |
| Inventory balance (available/held/sold) | ledger entries + active holds/reservations | INV | near-real-time; recomputable | Q-20, Q-32 | DB4 quyết định materialized row vs computed |
| "Fully paid" per order | 2 obligations SATISFIED | PAY | tx-accurate khi gate (GRD-016 đọc obligations, không đọc derived) | Q-15/17/18 | never stored as authority |
| Production readiness | approval + deposit SATISFIED + reservation RESERVED + order state | ORD/PRD | gate reads in-tx (GRD-015) | Q-19 | dashboard hint only |
| Shipping/dispatch readiness | production completed + remaining SATISFIED + shipping detail complete | ORD | gate reads in-tx (GRD-016/017) | Q-15 | |
| Request "awaiting customer" / "awaiting admin" buckets | request state + version SENT_FOR_REVIEW + quotation SENT | ORD/DSN/QUO compose | dashboard tolerance (seconds–minutes) | Q-21/Q-22 | pure projection |
| Admin dashboard counters (12 buckets `07 §2`) | request/order/payment/inventory states | read composition (CON-170) | minutes OK | Q-22 | never an aggregate |
| Pending review (customer side) | version SENT_FOR_REVIEW | DSN | real-time read | Q-11 | LC-09 derived |
| Quotation "expiring soon" | validity window vs now | QUO | sweep cadence | Q-24 | feeds SE-015 |
| Customer verified status | ≥1 verified contact link | CUS | tx-accurate at GRD-001 | Q-31 | |
| Agreement EFFECTIVE | PUBLISHED + effective window + not superseded/withdrawn | CNT | tx-read at GRD-008 | — | derived, not stored state |
| Grant usable | ACTIVE + not expired (clock) | CUS | tx-read at GRD-002 | Q-08 | expiry sweep chỉ là hygiene; guard đọc timestamp |
| Order "cancellable stage" (S1–S9) | order/request state + payment/production facts | ORD | tx-read at GRD-020 | — | policy matrix áp lên facts |
| Low stock | balance vs threshold | INV | dashboard tolerance | Q-20 | |
| Sitemap/indexable set | publication states + index flags | CNT/CAT/GAL | rebuild cadence | Q-06 | |
| Payment attempt "requires attention" list | REQUIRES_REVIEW + FAILED states | PAY | dashboard | Q-23 | states là authoritative; list là projection |

**Guard rule nhắc lại:** mọi guard (GRD-xxx) đọc **source facts trong
transaction**, không đọc derived rows — derived chỉ phục vụ đọc/hiển thị.
DB4 quyết định persist các projection nào (balance là ứng viên duy nhất có
lý do hiệu năng ở scale này).
