# DB3 — Completeness Matrix

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Statuses:** `complete` · `complete-DP` (complete with deferred parameter —
chỉ config values: TTL/retention/retry counts/provider mappings) ·
`unresolved`. **Unresolved count: 0.**

## A. Lifecycles (23 DB0 + DB2 additions)

| LC | Owner | Spec section | States/TR | Guards | INV | Audit | Idem | Conc | DB4 | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LC-01 (+session) | IDN/AGG-01 | master §LC-01 | 5 TR | 025/026-analog | REQ-IDN | yes | yes | low | §1/§2 | D7-01/13 | complete-DP (lockout values) |
| LC-02 | CUS/AGG-03 | §LC-02 | 5 TR | 001/026 | INV-19 | yes | yes | CC-17 | §2/§3 | D8-21 | complete-DP (limits) |
| LC-03 | CUS/AGG-04 | §LC-03 + ADR-DB3-004 | 3 TR | 002/003 | INV-08 | yes | yes | CC-16 | §2/§3 | D8-20 | complete-DP (expiry values) |
| LC-04 | CAT/AGG-06 | §LC-04 | 6 TR | 025 | INV-12 | yes | — | low | §1 | D7-01 | complete |
| LC-05 | derived | §LC-05 + derived catalog | n/a | 014 reads | INV-18 | n/a | n/a | n/a | projection note | — | complete |
| LC-06 | AST/AGG-08 | §LC-06 | 6 TR | 024 | INV-09/10/22 | yes | yes | CC-19 | §2/§3 | D8-23 | complete-DP (retry counts) |
| LC-07 | DSN/AGG-09 | §LC-07 | 5 TR | 027 | REQ-SESS | cleanup | yes | CC-01 | §3 | D8-22 | complete-DP (TTL O-008) |
| LC-08 | DSN/AGG-10 | §LC-08 | 7 TR | 004/007/008 | INV-01/16/17 | yes | yes | CC-02/03/04 | §2 | D7-03/04, D8-08/09 | complete |
| LC-09 | DSN (records) | §LC-09 | via LC-08 | 002/003 | — | yes | yes | CC-04 | outcome values | D8-08 | complete |
| LC-10 | DSN/AGG-11 | §LC-10 | creation-only | 007/008 | INV-01/03 | critical | yes | CC-02 | §2/§3 | D7-07 | complete |
| LC-11 | ORD/AGG-13 | §LC-11 | 11 TR | 001/005/020 | INV-13 | yes | yes | CC-18 | §1 | D8-21 | complete |
| LC-12/13 | QUO/AGG-14 | §LC-12/13 | 8 TR | 006 | INV-02/12 | yes | yes | CC-05/06/28 | §1/§2 | D7-03, D8-10/11 | complete-DP (validity values) |
| LC-14 | ORD/AGG-15 | §LC-14 + ADR-DB3-001/002/003 | 12 TR | 009/015..018/020/022 | INV-04/06/12/19 | yes | yes | CC-11..15 | §1/§3 | D8-12..15/19 | complete |
| LC-15 | PAY/AGG-16 | §LC-15 | 4 TR | 010 | INV-04 | yes | yes | CC-10 | §1/§3 | D8-04 | complete |
| LC-16 | PAY/AGG-16 | §LC-16 | 7 TR | 011/012 | INV-07/15 | critical | yes | CC-07/08/09 | §2 | D8-01..03 | complete-DP (provider mapping O-006) |
| LC-17 | INV/AGG-07 | §LC-17 + ADR-DB1-018 | 7 TR | 013/014/023 | INV-05/18 | yes | yes | CC-20..24 | §2/§3 | D8-05..07/24 | complete-DP (TTL values) |
| LC-18 | PRD/AGG-17 | §LC-18 + ADR-DB3-003 | 4 TR | 015/022 | INV-03/06 | yes | yes | CC-12 | §3 | D8-13 | complete |
| LC-19 | ORD-embedded | §LC-19 + shipping spec | freeze TR | 016/017 | INV-06 | yes | yes | CC-14/15 | §3 | D8-14/15 | complete |
| LC-20 | PAY records | §LC-20 + ADR-DB3-002 | 4 TR | 021 | — | yes R | yes | CC-09 | §3 | D8-03 | complete-DP (defaults config) |
| LC-21 | ORD saga | §LC-21 + compensation spec | saga | 020 | INV-18/19 | yes R | yes | CC-13 | §3 | D8-19 | complete-DP (stage defaults config) |
| LC-22 | PLT | §LC-22 | 4 TR | 029 | INV-23 | ops | consumers | CC-25 | §2 exception | D8-17 | complete-DP (retry counts) |
| LC-23 | PLT | §LC-23 + ADR-DB1-017 | 3 states | 012/030 | INV-24 | ops | is-mechanism | all | §2 | D7-08, D8-25 | complete-DP (TTL classes values) |
| LC-24 | DSN/AGG-12 | §LC-24 | 6 TR | — | GRD-028 | yes | yes | token | §1 | D7-18 | complete (IMP-D042) |
| +Notification Intent/Attempt | NTF/AGG-22 | notification spec | 6 TR | 012 | ADR-DB2-003 | terminal-failure | yes | CC-26 | shapes | D7-12, D8-16 | complete-DP (retry/retention) |
| +Agreement Version | CNT/AGG-21 | agreement spec | 4 states | 008 | GAP-09 | yes R | — | publish race | §2 | D7-13 | complete |
| +Design Template | DSN/AGG-12 | master (additional) | 3 states | 028 | GAP-08 | yes | — | low | — | D7-14 | complete |
| +Shipping Detail freeze | ORD | shipping spec | 2 states | 017/024 | ADR-DB2-002 | yes | yes | CC-15 | §3 | D7-03, D8-14 | complete |
| +Customer Merge | CUS | merge spec | 3 states | 025 | ADR-DB2-001 | yes R | yes | CC-27 | merge history | D8-18 | complete |
| +Job Attempt/Dead Letter | PLT | master (additional) | outcomes | — | REQ-OUTBOX-002 | ops | yes | CC-19 | append | D8-23 | complete-DP (retry counts) |

## B. Decisions & gaps

| Item | Resolution | Status |
|---|---|---|
| DEC-16 / GAP-03 | ADR-DB3-001 (Option A: acceptance→digitizing; approval→order+obligations) | complete |
| DEC-22 / GAP-04 | ADR-DB3-002 (stage matrix S1–S9 + saga) | complete-DP (refund defaults = config) |
| DEC-23 | ADR-DB3-003 (hold-and-supersede; deposit carry-over + recalc) | complete-DP (hold TTL) |
| DEC-26 / GAP-12 | ADR-DB3-004 (grant model + sensitive set + step-up) | complete-DP (durations/limits) |
| GAP-01 | Final state names (§A + DB4 handoff §1; synonym eliminations documented) | complete |
| GAP-09 (DB3) | Agreement acceptance spec (GRD-008, evidence, withdrawn handling) | complete-DP (type set = config) |

## C. Invariants

35/35 mapped với primary + defense layers, DB4 handoff, DB7/DB8 owner
([`DB3_INVARIANT_ENFORCEMENT_PLAN.md`](./DB3_INVARIANT_ENFORCEMENT_PLAN.md)); 0 open.

## D. Cross-checks

- **Transaction candidates (DB2 ×16):** tất cả xuất hiện trong lifecycle TRs
  + orchestration phases (submission, version/send, approval, quote
  version/accept, order create, callback, satisfaction, reserve,
  release/consume, production start/complete, delivery, cancel saga, outbox
  enqueue, session handover, contact link) — mapped.
- **Workflows W1–W7:** phases 1–7 orchestration doc — mapped.
- **Guards:** GRD-001..030 đều được ≥1 transition sử dụng (catalog cột
  "Used by"); mọi guard bắt buộc của task §14 có mặt.
- **Side effects:** SE-001..020 phủ danh sách tối thiểu task §15 (incl.
  analytics emission, relay, sweeps).
- **DB7/DB8:** D7-01..15, D8-01..25 phủ mọi CC-01..28 + danh sách task §26.

## E. Deferred parameters (all owned — CON-144 unless noted)

TTL/durations: session (O-008), grant/step-up, holds/reservations,
idempotency classes, notification retention, quotation validity, hold-release
(revision). Counts: retries (outbox/notification/jobs), challenge attempts/
cooldowns, lockout. Business values: refund stage defaults, agreement type
set, deposit split values (đã có D-013/014), code formats. Provider-specific:
payment state mapping (O-006), OTP channels (O-005). **Owner:** business +
config checkpoint; **acceptance:** configured trước khi feature tương ứng
ship (per DB1/DB2 registers #1–21 + các mục trên).
