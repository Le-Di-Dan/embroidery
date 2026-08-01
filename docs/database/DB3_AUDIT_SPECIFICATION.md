# DB3 — Audit Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** BACKEND_CONVENTIONS §18 (actor/action/target/before-after/
timestamp/reason), INV-14, append-only (ADR-DB1-010), audit ≠ domain history
(DB2 §8.6), audit row viết **in-transaction** với use case (SE-019).
Retention: `audit` class (duration deferred O-012). Correlation/request ID
bắt buộc trên mọi row (envelope meta.requestId liên kết).

Actor classes: `admin` · `customer` (via grant — actor = CustomerId +
GrantId ref) · `system` (sweeps/relays/policy). Reason: **R** = bắt buộc.
Redaction: cột cuối. Before/after = summary refs/values, không dump payload.

| Audit action group | Trigger transitions | Actor | Reason | Before/after summary | Redaction |
|---|---|---|---|---|---|
| Admin login/security | LC-01 all; login events | admin/system | R (recovery/replace/lock-override) | account/session state | không log credential/OTP material |
| Customer verification | TR-LC02-02/03; link/create customer | customer/system | — | contact (masked) + link outcome | contact values masked; code never logged |
| Secure grant issue/revoke/reissue | TR-LC03-01/02; step-up success/failure | system/admin | R (admin revoke) | grant scope/state | token never logged (hashed ref only) |
| Product/catalog changes | TR-LC04-*; product/variant/SKU/side/area edits | admin | R (archive/unarchive **only**) | changed-field summary; publication transitions carry before/after status | — |
| Stock adjustment & override | inventory adjustments; GRD-023 override | admin | **R always** (`07 §10`) | qty before/after + reason | — |
| Design version create/send/decision/void | TR-LC08-01/02/03/07 | admin/customer | R (void) | version refs/state | document content never in audit (hash ref only) |
| Approval (critical) | TR-LC08-04 + snapshot creation | customer | — | version id + hashes + terms refs | contact snapshot masked in views |
| Quotation create/send/accept/supersede/expire/void | TR-LC12-* | admin/customer/system | R (void/cancel) | version + totals summary | — |
| Order creation/transition/hold/resume | TR-LC14-* | system/admin | **R:** hold, cancel, backward-looking corrections | from→to + guard facts refs | — |
| Payment callback/application | TR-LC16-03/04 | system | — | attempt state + provider event ref | **provider payload redacted** (REQ-PAY-007) |
| Manual reconcile / requires-review resolve | TR-LC16-05/06 | admin | **R** | resolved state + evidence refs | provider refs safe-view only |
| Refund lifecycle | TR-LC20-* | admin/system | **R** (approve/reject) | amount + target attempt | bank refs access-controlled |
| Reservation create/release/consume/expire | TR-LC17-* | system/admin | **R** (manual release/override) | qty + reservation refs | — |
| Production start/complete/cancel(rework) | TR-LC18-* | admin | **R** (cancel/rework) | job + approval refs | production file refs internal-only |
| Shipping edit/freeze/dispatch/deliver | shipping edits; TR-LC14-07/08 | admin | — (edits log before/after) | field summary | address masked in list views |
| Cancellation saga | GRD-020 trigger + mỗi compensation step | admin/customer/system | **R always** (+customer-visible reason riêng) | step + outcome | — |
| Customer merge | merge REQUESTED/EXECUTED/REJECTED | admin | **R always** | survivor/loser + transfer counts | PII masked |
| Anonymization/cleanup runs | retention sweeps | system | — (policy ref) | counts + criteria | no PII in summary |
| Agreement publish/supersede/withdraw | Agreement Version transitions | admin/system | **R** (withdraw) | version + hash | — |
| Notification terminal failure | TR-NTF-05 | system | — | intent ref + error class | params đã redacted by construction |
| Policy configuration changes | CON-144 version bump | admin | **R** | key + old/new value | secrets never in config values |
| Template publish/archive | template transitions | admin | R (archive) | template + version | — |
| Content/gallery publish/archive; redirect changes | publication transitions | admin | — | page/entry refs | — |

## Product publication actions (APP2-B03-G01, IMP-D035)

The Product/catalog row above covers `TR-LC04-*` as a group. The two publication
transitions need named actions because a reader must be able to tell "went
public" from "came back off public" without reconstructing it from a field diff.

Repository naming convention, taken from the implemented writers
(`staff.login.succeeded`, `staff.credential.rotated`): the `action` column holds
a **lowercase dot-namespaced** name, `target_kind` holds a **SCREAMING_SNAKE**
kind, and `actor.kind` is `ADMIN`.

| Transition | `action` | `target_kind` | `target_id` | before → after | `reason` |
|---|---|---|---|---|---|
| TR-LC04-01 publish | `product.published` | `PRODUCT` | productId | `DRAFT` → `PUBLISHED` | not required |
| TR-LC04-05 unpublish | `product.unpublished` | `PRODUCT` | productId | `PUBLISHED` → `DRAFT` | not required |

**Reason is deliberately not required for publish or unpublish.** The `R` on this
row applies to archive and unarchive only. A required reason has to be collected
from the operator, and the approved publication command carries a concurrency
token and nothing else — a mandatory reason would either be fabricated by the
server or force an unapproved field into the request.

`summary` stays bounded and safe: the before/after status and the correlation id
are enough. It must never carry the description, price, media, Asset ids,
storage facts, the full product record, credentials, cookies, authorization
headers, a raw error or SQL. Archive is **not** an unpublish action and must
never be recorded as one.

Code-level constants belong to `APP2-B03`; this section is the authority they
must match.

## Rules (locked)

1. **In-tx write:** audit row cùng transaction với transition (SE-019) —
   transition không audit được thì fail cả use case.
2. **Append-only:** không update/delete (GRD-024/DB trigger); corrections =
   new event tham chiếu event cũ.
3. **Attempted-invalid cũng audit:** guard failures đánh dấu AuditF trong
   guard catalog tạo audit event (actor + failure code) — phục vụ abuse
   forensics.
4. **Không nhân đôi domain history:** ledger/versions/callbacks/transitions
   tự chúng là history; audit chỉ ghi hành vi + refs.
5. **DB4 handoff:** append-only shape, actor refs (admin id / customer id +
   grant id / system job id), reason fields nullable-with-R-constraints per
   action class, correlation id. **DB7:** append-only + reason-required
   tests.
