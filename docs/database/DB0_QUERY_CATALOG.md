# DB0 — Query & Use-Case Catalog

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Enumerate the queries/use-cases that will shape DB5 (index & access-path design). DB0 does **not** design indexes.

---

## 1. Columns

- **Actor** — Public, Customer (secure), Admin, System/Worker.
- **Input/filter** — primary parameters.
- **Result** — expected output.
- **Freq** — approximate frequency at locked scale (20–100 products, <100
  orders/month, <10 concurrent editors): High / Medium / Low.
- **Consistency** — Strong (read-after-write critical) / Eventual-OK.
- **Security scope** — visibility boundary.
- **Tx sensitivity** — is it inside/adjacent to a critical transaction?
- **Owner** — candidate owning module.

## 2. Catalog

| ID | Use case | Actor | Input/filter | Result | Freq | Consistency | Security scope | Tx | Owner |
| -- | -------- | ----- | ------------ | ------ | ---- | ----------- | -------------- | -- | ----- |
| Q-01 | Public product listing | Public | category, availability, paging, sort/display order | product cards (name, price, image, availability) | High | Eventual-OK (revalidated) | public only | No | Catalog |
| Q-02 | Product detail by slug | Public | slug | product + variants + sides + areas + media + SEO | High | Eventual-OK | public only | No | Catalog |
| Q-03 | Variant & SKU availability | Public/Customer | productId | per-SKU availability (available/held/out) | High | Strong (near add-to-request) | public | No | Catalog/Inventory |
| Q-04 | Gallery listing | Public | type/style/need, paging | published gallery entries + SEO text | Medium | Eventual-OK | published only | No | Gallery |
| Q-05 | Published content/page lookup | Public | page type + slug | content page + SEO metadata | Medium | Eventual-OK | published/indexable | No | Content |
| Q-06 | Sitemap / indexable set | System | index flag | list of indexable URLs | Low | Eventual-OK | public | No | Content |
| Q-07 | Redirect resolution | Public | request path | redirect target | Low | Strong | public | No | Content |
| Q-08 | Secure link lookup | Customer | opaque token | resolved grant → request scope | High | Strong | scoped to owner | Adjacent | Customer |
| Q-09 | Request detail (customer view) | Customer (secure) | grant, requestId | request + current design version + current quotation + payment state | High | Strong | owner only | Adjacent | Order/Design/Quotation/Payment |
| Q-10 | Design version history | Customer/Admin | requestId | ordered versions + metadata (no export assets) | Medium | Strong | owner/admin | No | Design |
| Q-11 | Current review version | Customer | requestId | single version awaiting review | High | Strong | owner | Yes (single-active invariant) | Design |
| Q-12 | Quotation version history | Customer/Admin | requestId | ordered immutable quotation versions | Medium | Strong | owner/admin | No | Quotation |
| Q-13 | Current quotation | Customer | requestId | latest sent/accepted version + totals + deposit/remaining | High | Strong | owner | No | Quotation |
| Q-14 | Approval snapshot lookup | Admin/System | orderId/versionId | immutable approval snapshot | Medium | Strong | internal | Yes | Design/Order |
| Q-15 | Order lookup | Customer/Admin | orderId / requestId | order + items + state + shipping | High | Strong | owner/admin | Adjacent | Order |
| Q-16 | Payment reconciliation | Admin/System | provider ref / date range / status | attempts + obligations to reconcile | Medium | Strong | internal/financial | Yes | Payment |
| Q-17 | Pending deposit list | Admin | state = approved & deposit unpaid | orders awaiting deposit | Medium | Strong | internal | No | Order/Payment |
| Q-18 | Pending final payment list | Admin | state = production complete & remaining unpaid | orders awaiting final payment | Medium | Strong | internal | No | Order/Payment |
| Q-19 | Production queue | Admin | state = ready for production / in production | jobs with approved-design linkage | Medium | Strong | internal/production | Adjacent | Production |
| Q-20 | Admin low-stock dashboard | Admin | threshold | SKUs below threshold + reserved | Medium | Strong | internal | No | Inventory |
| Q-21 | Request listing by status | Admin | status, paging, sort | requests in a workflow state | High | Strong | internal | No | Order/Request |
| Q-22 | Admin dashboard aggregate | Admin | (composite: new/needs-clarify/awaiting-quote/digitizing/awaiting-response/awaiting-deposit/in-production/awaiting-final/low-stock/failed-payments/expiring-quotes/alerts) | counts + lists | High | Strong | internal | No | multiple (composed) |
| Q-23 | Failed / unmatched payments | Admin | status = failed/requires_review | attempts needing attention | Medium | Strong | internal/financial | No | Payment |
| Q-24 | Expiring quotations | Admin/System | validity window near expiry | quotations approaching expiry | Low | Eventual-OK | internal | No | Quotation |
| Q-25 | Session expiration cleanup | System/Worker | last-activity < now − TTL | expired sessions to delete/anonymize | Medium (scheduled) | Eventual-OK | internal | Yes (cleanup) | Design |
| Q-26 | Asset processing queue | System/Worker | inspection/derivative pending | assets to process | Medium | Eventual-OK | internal | Adjacent | Asset |
| Q-27 | Outbox relay scan | System/Worker | outbox pending | undispatched events | High (polled) | Strong (claim) | internal | Yes | (cross-cutting) |
| Q-28 | Idempotency key check | System | key + scope | prior result if present | High | Strong | internal | Yes | (cross-cutting) |
| Q-29 | Audit history lookup | Admin | target/actor/date range | ordered audit events | Low | Strong | internal | No | Audit |
| Q-30 | Signed asset access resolution | Customer/Admin | assetId + scope | short-lived signed URL for authorized derivative | High | Strong | scoped | No | Asset |
| Q-31 | Verification challenge lookup | System | contact + challenge | active challenge status | Medium | Strong | security-sensitive | Yes | Customer/Identity |
| Q-32 | Reservation-eligible check | System | sku, qty | availability under concurrent holds | Medium | Strong | internal | Yes | Inventory |
| Q-33 | Analytics event readiness (product view, start customizer, submit, approval, deposit, completed) | System | event type | event stream/counters | Medium | Eventual-OK | internal | No | (analytics — tool deferred) |

## 3. DB5-relevant observations (not designs)

- **Hot read paths** likely needing indexes: Q-01/Q-02 (catalog by
  category/slug/display order), Q-08 (token→grant, security-critical unguessable
  lookup), Q-21/Q-22 (request status dashboards), Q-16/Q-23 (payment by provider
  reference/status), Q-20 (low-stock threshold), Q-27/Q-28 (outbox/idempotency
  polling and uniqueness).
- **Uniqueness constraints implied by queries:** secure token (Q-08), idempotency
  key scope (Q-28), provider reference for reconciliation (Q-16), single active
  review version per request (Q-11 / INV-16).
- **Scheduled/worker scans:** Q-25, Q-26, Q-27 need efficient partial predicates
  (status = pending) — candidate partial indexes at DB5.
- **Strong-consistency reads adjacent to transactions:** Q-09, Q-11, Q-14, Q-16,
  Q-19, Q-32 — care needed with read models vs write path.

## 4. Roll-up

- **Total use cases cataloged:** 33 (Q-01 … Q-33).
- By actor: Public 7, Customer(secure) ~8, Admin ~12, System/Worker ~9 (several
  overlap actors).
- Index/access-path design for all of these is **DB5**; none is designed here.
