# APP6-G01 — Design Review, Approval and Quotation Authority

**Checkpoint:** `APP6-G01` · **Decision:** `IMP-D051` · **Date:** 2026-08-19
**ADR:** [`../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md`](../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md)
**Entry:** `APP6-R00 = COMPLETE` (`c7d0b9b`), accepted by the Product Owner.

This document is the authority every later APP6 checkpoint reads instead of
re-deciding. It creates no runtime code, no schema, no migration, no OpenAPI
artifact and no Figma node. Where an accepted source already rules, this
document **cites** it rather than restating it as a new decision.

---

## 1. Scope of authority

Locked here: COP design-context semantics (ADR-APP6-001); Catalog-versus-COP
geometry; Approval Snapshot evidence; the five APP6 LC-11 transitions; design
review rendering; secure-grant reuse; quotation validity and effective expiry;
the deposit policy handoff; the approval agreement type set and its canonical
content;
idempotency bindings; concurrency and error mappings; event and side-effect
ownership; and the exact `APP6-DB01` schema handoff.

Not locked here, and not reopened: `APP6-R00`; APP5 closure; every DB-era ADR
and specification; APP7 order and payment behaviour.

---

## 2. Source-of-truth used

| Source | What it settled |
|---|---|
| `docs/implementation/audits/APP6_PHASE_ENTRY_AUDIT.md`, `../reports/APP6-R00-COMPLETION-REPORT.md` | Entry facts, capability inventory, roadmap |
| `docs/adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md` | Option A commercial ordering; rules 1–8 |
| `docs/adr/database/ADR-DB3-003-POST-APPROVAL-PRODUCTION-REVISION.md` | Post-approval revision is a new version |
| `docs/adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md` | Single `REQUEST_ACCESS` scope; locked sensitive-action set (r4) |
| `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` | LC-08, LC-11, LC-12 transition rows |
| `docs/database/DB3_TRANSITION_GUARD_CATALOG.md` | GRD-002…GRD-008 |
| `docs/database/DB3_CONCURRENCY_SPECIFICATION.md` | CC-02…CC-06, CC-16 |
| `docs/database/DB3_IDEMPOTENCY_SPECIFICATION.md` | `quotation.accept`, `design.approve` bindings |
| `docs/database/DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` | SE-004, SE-005, SE-015 |
| `docs/database/DB3_AGREEMENT_ACCEPTANCE_SPEC.md` | GRD-008 semantics and the baseline required type set |
| `docs/04-BUSINESS-RULES.md` BR-005, `docs/12-DECISION-LOG.md` D-013/D-014 | 40 / 60 split |
| `docs/01-PRODUCT-REQUIREMENTS.md` §2.1 | The four policy pages |
| Schema source: `design-versions.ts`, `approval-snapshots.ts`, `quotation-versions.ts`, `customer-owned-products.ts`, `design-sessions.ts`, `order-items.ts`, `production-specifications.ts`, `agreements.ts`, `policy-configurations.ts`, `secure-access-grants.ts` | Physical truth |
| Package source: `packages/design-document`, `packages/design-engine` | Document shape and geometry |
| API source: `apps/api/src/platform/policy/publish-app4-policy.use-case.ts`, `packages/database/src/seed/app4-policy-dataset.ts`, `packages/database/seed/app4-policy-configuration.seed.json` | The delivered policy-dataset convention |
| API source: `apps/api/src/modules/customer/domain/grant/secure-link.errors.ts` | The delivered public error vocabulary |

---

## 3. Product Owner rulings — reconciliation

| Ruling | Disposition | Evidence |
|---|---|---|
| **PO-G01-01** COP is a real branch, never a fake Catalog branch | `APPLIED` | ADR-APP6-001 §3.1–§3.2; INV-13; TBL-038 |
| **PO-G01-02** COP geometry is the frozen formal-version envelope | `APPLIED` | ADR-APP6-001 §3.3; `customer_owned_products.physical_*_mm` are nullable and describe the item |
| **PO-G01-03** COP snapshot uses truthful human evidence | `APPLIED`, with one narrow persisted field pair | ADR-APP6-001 §3.6–§3.7; `approval_snapshots.product_name`/`side_name`/`area_name` are already frozen text, not FKs |
| **PO-G01-04** Effective quote expiry is independent of the sweep | `APPLIED`; the equality convention is **confirmed against delivered code**, not assumed | §6.3. `now >= expiresAt` is the delivered convention in `submit-verification-attempt.use-case.ts`, `read-verification-challenge-status.query.ts` and `challenge-intake.authorizer.ts` |
| **PO-G01-05** Minimal approval agreement set | **`SUPERSEDED_BY_STRONGER_EXISTING_AUTHORITY`** — for the type set *and* for the content. Corrected by `APP6-G01-C1` | `DB3_AGREEMENT_ACCEPTANCE_SPEC.md` §2.1 already locks the required set as policy config with a payment + return baseline. The workflow consent is **not** a payment or return policy and cannot be published under either type (§5.2); the content comes from accepted policy authority instead (§5.5, §5.6) |
| **PO-G01-06** Quotation validity | `APPLIED` — no accepted concrete duration exists (`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` records the window as `[cfg]`), so the 7-calendar-day fallback is used | §6.1 |
| **PO-G01-07** Deposit 40 % is policy handoff only | `APPLIED`, with one clarification: `quotation_versions.deposit_percent`/`deposit_amount`/`remaining_amount` are `NOT NULL` **pricing** columns under CST-064, so APP6 writes the split. It creates no Order, obligation, attempt or collection | §6.4 |
| **PO-G01-08** Review rendering is client-side | `APPLIED` | §8 |
| **PO-G01-09** Secure access reuses `REQUEST_ACCESS` | `APPLIED` | §7; `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']` is a closed single-value set |
| **PO-G01-10** System projection rule | `APPLIED` | §4 |

No irreconcilable conflict was found.

```text
TRUE_PO_DECISION = none
```

---

## 4. Lifecycle projection table — the five APP6 LC-11 transitions

| Transition | Actor | Owning aggregate / use case | Precondition / guard | Transaction boundary | Audit evidence | Outbox / event | Directly commandable? | Error mapping |
|---|---|---|---|---|---|---|---|---|
| `TR-LC11-05` `UNDER_REVIEW → QUOTED` | **system** | Quotation send (`TR-LC12-02`), `APP6-B03` | Totals valid; validity window set; version frozen (INV-02) | The **same** transaction that freezes the version, sets the current pointer and supersedes the prior sent version | Request transition row + quotation audit | `SE-004` `quotation.sent`, after commit | **No** | Not reachable by command; an attempt is `INVALID_TRANSITION` |
| `TR-LC11-06` `QUOTED → QUOTE_ACCEPTED` | **system** | Quotation acceptance (`TR-LC12-03`), `APP6-B05` | GRD-002, GRD-003, **GRD-006** | The **same** transaction that records the acceptance evidence | Request transition row + critical acceptance audit | none required by DB3 (§9) | **No** | `SECURE_LINK_UNAVAILABLE`, `REVERIFICATION_REQUIRED`, `QUOTE_VERSION_STALE` |
| `TR-LC11-07` `QUOTE_ACCEPTED → DIGITIZING` | **admin** | Request transition, `APP6-B06` | **GRD-005** — request is `QUOTE_ACCEPTED`, no override (ADR-DB3-001 r1) | Its own transaction on the request row | Request transition row, actor server-derived | none | **Yes — the only one** | `QUOTE_NOT_ACCEPTED`; wrong source state `INVALID_TRANSITION` |
| `TR-LC11-08` `DIGITIZING → DESIGN_REVIEW` | **system** | Send version for review (`TR-LC08-02`), `APP6-B09` | **GRD-004** single active review; document canonicalised and hashed | The **same** transaction that freezes the document, marks the version and supersedes the prior one | Request transition row + design audit | `SE-004` `design.review-ready`, after commit | **No** | `REVIEW_ALREADY_ACTIVE` |
| `TR-LC11-09` `DESIGN_REVIEW → APPROVED` | **system** | Design approval (`TR-LC08-04`), `APP6-B11` | GRD-002, GRD-003, **GRD-007**, **GRD-008** | The **same** transaction that creates the Approval Snapshot | Request transition row + critical approval audit | `SE-005` `design.approved`, after commit | **No** | `SECURE_LINK_UNAVAILABLE`, `REVERIFICATION_REQUIRED`, `APPROVAL_VERSION_MISMATCH`, `TERMS_NOT_ACCEPTED`, `INVALID_TRANSITION` |

### 4.1 The projection rule (locked)

`QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` are reached **only**
as a projection of the owning aggregate's committed event, inside that event's
own transaction.

- No follow-up "sync state" API exists or may be added.
- No generic "set request state" use case exists or may be added.
- No APP6 screen, contract or Admin action may offer one of the four as a
  selectable transition target.
- `APP6-B06` widens the delivered `APP5-B05` transition endpoint's
  **application-layer** allow-list by exactly one target, `DIGITIZING`, and
  publishes **no new HTTP operation**. Widening it by any of the four system
  targets is the specific failure this checkpoint exists to prevent.

---

## 5. Agreement authority

### 5.1 Required type set

`DB3_AGREEMENT_ACCEPTANCE_SPEC.md` §2.1 already locks the shape: the required
set is **policy configuration** (CON-144) so business may change it without a
schema change, with a **payment-policy + return-policy baseline**. That is
stronger, already-accepted authority than PO-G01-05's `DESIGN_APPROVAL_TERMS`
fallback, so the baseline is preserved. Under the repository's closed-set
naming convention (`REQUEST_ACCESS`, `NOTIFICATION_INTENT`) and the four policy
pages of `01 §2.1`, the literals are:

```text
design_approval.agreements.requiredAgreementTypes = [PAYMENT_POLICY, RETURN_POLICY]
```

`agreements.agreement_type` carries no `CHECK` (COL-TBL068-01, deliberately
config-extensible), so this is data, not schema.

### 5.2 Exact-design confirmation is **not** one of the agreements

`APP6-G01-C1` corrects an inconsistency in the first attempt, which kept
PO-G01-05's workflow consent as a "content floor" for the two required
agreements. That is semantically invalid: the workflow consent is about the
exact design version, later production reliance, re-approval after a change and
the absence of payment at approval. **None of that is a payment policy and
none of it is a return policy**, so it can never be published under
`PAYMENT_POLICY` or `RETURN_POLICY`, and it cannot satisfy the stronger
required set.

```text
exact design approval confirmation  !=  PAYMENT_POLICY
exact design approval confirmation  !=  RETURN_POLICY
```

The confirmation is **approval action semantics**, already enforced by
mechanism rather than by prose, and no third agreement type is invented to
store it:

| PO-G01-05 point | Where it is actually enforced |
|---|---|
| 1 — consent is to the exact design version shown | **GRD-007**: submitted version id + document hash must match the stored pair, in transaction |
| 2 — later production may rely on the approved design after APP7 gates | **BR-010** production integrity + **GRD-009** order-creation guard; also stated in `PAYMENT_POLICY` §5.6.1 |
| 3 — a later design change requires a new version and new approval | **BR-009**, **ADR-DB3-003**, **ADR-APP6-001 §3.5**; `uq_approval_snapshots__version` |
| 4 — approval collects no payment and creates no order | **ADR-DB3-001 r2/r7**: the Order and both obligations are APP7's, behind GRD-009 |
| 5 — the exact agreement version is stored in immutable approval evidence | **`approval_snapshot_agreement_acceptances`** + CST-091 |

`APP6-S02` may show the confirmation as approval-screen copy — *"you are
approving this exact design version"* — bound to the version and hash it
displays. It is never a versioned agreement, is never hashed into the required
set, and `DESIGN_APPROVAL_TERMS` is **not** reintroduced as a required type.

### 5.3 Binding rules

| Rule | Ruling |
|---|---|
| Effective version retrieval | `EFFECTIVE` is derived — `PUBLISHED`, inside its effective window, not superseded or withdrawn. Exactly one effective version per type at any instant |
| What the customer sees | `APP6-B10` returns the effective version — id, type, and content hash — **alongside the exact design version**, in the same read. The customer never approves against a set they were not shown |
| What approval submits | `APP6-B11` submits the exact `agreementVersionId` set plus each content hash |
| Verification | GRD-008 in transaction: the submitted set must equal the current required set, each version must still be effective, and each content hash must match. Any mismatch is `TERMS_NOT_ACCEPTED` and the client re-reads |
| Snapshot | The exact accepted `agreement_version_id` + frozen `agreement_type` + content hash + acceptance timestamp per type |
| Later publication | Never mutates historical evidence. A withdrawn or superseded version is retained while referenced (ADR-DB1-011). A published change forces re-consent only through a **new approval event** (ADR-DB3-003) |
| Quotation acceptance | Requires **no** separate terms acceptance — one ceremony at approval (`DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.4) |

### 5.4 Publication owner

No agreement publication path is delivered. Following the APP4 precedent
exactly — `APP4-G01` shipped the dataset, `APP4-B01-C1` shipped the reader and
the publishing use case attached to the one Admin-bearing path — agreement
publication is owned by **`APP6-B10`**, the first checkpoint that needs an
effective version to return. It adds no HTTP operation.

**Authoring is not deferred with it.** `APP6-G01-C1` locks the canonical
source and the exact content per type in §5.5 and §5.6, so `APP6-B10` publishes
what is written there and writes no policy of its own. If accepted policy
authority changes before B10 runs, B10 republishes from the changed source and
says so; it never drafts.

---

### 5.5 Canonical content source per required type

The repository contains **no approved customer-facing policy prose**. The four
policy pages of `01 §2.1` are a Content-module requirement with no delivered
content, and `ADR-DB3-002` stage S9 explicitly defers post-delivery returns to
*"the published return-policy content page"* that does not exist yet.

What the repository does contain is the locked **structured rules**. Under
PO-G01-C1-05 this checkpoint therefore publishes one minimal, fully
source-traceable rendering per type, in §5.6. It is deterministic authority
normalization, not drafting: every normative sentence maps to a named accepted
rule, and no right, obligation, fee, refund guarantee, warranty, liability
clause, waiver, cancellation right, payment timing or exception is introduced
that is not already accepted.

| Agreement type | Canonical source | Disposition |
|---|---|---|
| `PAYMENT_POLICY` | `docs/04-BUSINESS-RULES.md` BR-004, BR-005, BR-006, BR-008, BR-010 · `docs/12-DECISION-LOG.md` D-012, D-013, D-014 · `docs/adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md` rules 2, 3, 4, 7, 8 · `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §6 · `IMP-D051` PO-03 (validity) · `ck_quotation_versions__currency_vnd` | **NORMALIZED** from structured rules — no approved prose exists |
| `RETURN_POLICY` | `docs/adr/database/ADR-DB3-002-CANCELLATION-REFUND-POLICY.md` stage matrix S1–S9 and locked mechanics 1–6 · `docs/04-BUSINESS-RULES.md` BR-009 · `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §10, §11 · `docs/adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md` r4 | **NORMALIZED** from structured rules — no approved prose exists |

Neither source is `TBD`, and neither depends on future unspecified Product
Owner content.

**One bounded limitation, stated rather than hidden.** `ADR-DB3-002` is
*"Accepted with Deferred Parameters"*: the default refund **amount** rules per
stage are `CON-144` policy configuration the business has not signed off
(`IMP-O008`, owner APP9). §5.6.2 therefore publishes the locked
**dispositions** — refundable, refundable minus the digitizing-fee line,
non-refundable — and never a number the repository has not locked, and it
states that the final amount is the shop's reasoned, recorded decision, which
is locked mechanic 4. When those values are signed off, a **new** agreement
version is published; historical approval evidence is untouched (§5.3), and
future approvals bind the new version.

**Language.** `DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.3 locks MVP single-language
Vietnamese, so the customer-facing content below is Vietnamese. The trace
tables are the reviewable mapping.

### 5.6 Canonical content

Each block is the exact content `APP6-B10` publishes as version 1 of its type.
Publication computes the content hash; the hash is not fixed here, because
canonicalisation belongs to the publisher (ADR-DB1-012 direction,
`DB3_AGREEMENT_ACCEPTANCE_SPEC` §1).

#### 5.6.1 `PAYMENT_POLICY` — Chính sách thanh toán

> **P1.** Báo giá do cửa hàng lập thủ công. Các yếu tố tính giá có thể gồm kích
> thước thực tế, số lượng màu, số mũi ước tính, số lượng sản phẩm, giá sản phẩm
> nền, phí digitizing, phí vận chuyển và điều chỉnh thủ công.
>
> **P2.** Mọi số tiền được tính bằng VND.
>
> **P3.** Một báo giá đã gửi có hiệu lực để chấp nhận trong 7 ngày theo lịch kể
> từ thời điểm cửa hàng gửi. Quá thời hạn này, báo giá không còn chấp nhận được
> và cần một báo giá mới.
>
> **P4.** Việc duyệt mẫu thiết kế **không** thu bất kỳ khoản tiền nào và
> **không** tự tạo đơn hàng.
>
> **P5.** Đơn hàng được tạo sau khi quý khách duyệt đúng phiên bản thiết kế và
> báo giá đang có hiệu lực đã được chấp nhận. Khi đó phát sinh hai nghĩa vụ
> thanh toán độc lập: tiền cọc và phần còn lại.
>
> **P6.** Tiền cọc bằng **40%** tổng giá trị của báo giá đã được chấp nhận, và
> chỉ phát sinh sau khi thiết kế được duyệt.
>
> **P7.** Phần còn lại bằng **60%** và phải được thanh toán trước khi giao hàng.
>
> **P8.** Sản xuất chỉ thực hiện theo đúng phiên bản thiết kế đã được duyệt.
>
> **P9.** Nếu sau khi chấp nhận báo giá có thay đổi làm phát sinh báo giá mới,
> quý khách cần chấp nhận lại báo giá mới. Báo giá đã chấp nhận trước đó được
> giữ nguyên làm lịch sử.
>
> **P10.** Chỉ thao tác duyệt qua liên kết an toàn của cửa hàng mới có giá trị.
> Tin nhắn Zalo hoặc Messenger không phải là căn cứ xác nhận.
>
> **P11.** Chính sách này không quy định phương thức thanh toán cụ thể; cửa
> hàng thông báo phương thức khi nghĩa vụ thanh toán phát sinh.

| Sentence | Accepted source |
|---|---|
| P1 | BR-004 pricing inputs, the accepted list |
| P2 | `ck_quotation_versions__currency_vnd` (`currency_code = 'VND'`) |
| P3 | `IMP-D051` PO-03 / `quotation.validity.validityDays = 7`; §6.1, §6.3 |
| P4 | ADR-DB3-001 r2 and r7 — the Order and both obligations are created at APP7, behind GRD-009 |
| P5 | ADR-DB3-001 r7, r8; INV-04 two independent obligations; `06 §6` |
| P6 | BR-005; D-013; ADR-DB3-001 r3, the percentage coming from policy configuration |
| P7 | BR-006; D-014 |
| P8 | BR-010 production version integrity |
| P9 | ADR-DB3-001 r4; INV-02 sent-version immutability |
| P10 | BR-008; D-012 |
| P11 | `IMP-O007` — the payment provider is an open decision owned by APP7. The sentence adds no obligation and states only that the method is communicated later |

#### 5.6.2 `RETURN_POLICY` — Chính sách đổi trả và huỷ đơn

> **R1.** Thiết kế đã được duyệt không được chỉnh sửa. Mọi thay đổi sau khi
> duyệt tạo ra một phiên bản mới và cần được duyệt lại.
>
> **R2.** Trước khi cửa hàng gửi báo giá, hoặc sau khi đã gửi nhưng quý khách
> chưa chấp nhận: có thể huỷ, không phát sinh khoản tiền nào.
>
> **R3.** Sau khi chấp nhận báo giá và trước khi duyệt thiết kế: có thể huỷ.
> Chưa có tiền cọc nên không phát sinh hoàn tiền.
>
> **R4.** Sau khi duyệt thiết kế nhưng chưa thanh toán tiền cọc: có thể huỷ.
> Hai nghĩa vụ thanh toán được huỷ và không phát sinh khoản tiền nào.
>
> **R5.** Sau khi tiền cọc đã được xác nhận và trước khi bắt đầu sản xuất: yêu
> cầu huỷ được cửa hàng xét duyệt thủ công. Mặc định, tiền cọc được hoàn lại
> sau khi trừ khoản phí digitizing ghi trong báo giá đã chấp nhận.
>
> **R6.** Trong khi đang sản xuất: yêu cầu huỷ được xét duyệt thủ công. Mặc
> định tiền cọc không được hoàn, vì vật tư và công đã được sử dụng.
>
> **R7.** Sau khi sản xuất hoàn tất và trước khi thanh toán phần còn lại: mặc
> định tiền cọc không được hoàn.
>
> **R8.** Sau khi đã thanh toán phần còn lại nhưng chưa gửi hàng, việc huỷ chỉ
> được cửa hàng thực hiện trong trường hợp ngoại lệ.
>
> **R9.** Sau khi hàng đã được gửi hoặc đã giao, đơn hàng không thể huỷ. Khiếu
> nại và đổi trả được cửa hàng xử lý thủ công.
>
> **R10.** Mọi lần huỷ đều phải có lý do và được cửa hàng ghi nhận.
>
> **R11.** Số tiền hoàn lại cuối cùng là quyết định có ghi rõ lý do của cửa
> hàng trong khuôn khổ chính sách này. Mọi khoản hoàn tiền đều được lập thành
> bản ghi hoàn tiền.
>
> **R12.** Yêu cầu huỷ của quý khách được gửi qua liên kết an toàn của cửa
> hàng. Từ giai đoạn sau khi tiền cọc đã được xác nhận trở đi, quý khách cần
> xác thực lại trước khi gửi yêu cầu.

| Sentence | Accepted source |
|---|---|
| R1 | BR-009; ADR-DB3-003; `06 §10` |
| R2 | ADR-DB3-002 stages **S1**, **S2** |
| R3 | ADR-DB3-002 stage **S3** |
| R4 | ADR-DB3-002 stage **S4** |
| R5 | ADR-DB3-002 stage **S5** + mechanic 2 manual review. Disposition only; the amount rule stays `CON-144` configuration (§5.5) |
| R6 | ADR-DB3-002 stage **S6** + mechanic 2 |
| R7 | ADR-DB3-002 stage **S7** |
| R8 | ADR-DB3-002 stage **S8** — admin-only exceptional |
| R9 | ADR-DB3-002 stage **S9**; `06 §11` |
| R10 | ADR-DB3-002 mechanic 1 — a reason is mandatory for every cancellation |
| R11 | ADR-DB3-002 mechanics 3 and 4 — a Refund Record carries amount, reason and approver; refunds are records, not provider automation |
| R12 | ADR-DB3-002 mechanic 1; ADR-DB3-004 r4, whose locked sensitive set includes customer-initiated cancellation from S5 onward |

**APP6 builds none of this.** Publishing the return policy is not building
cancellation: customer-initiated cancellation and the LC-21 compensation saga
stay routed to APP9 (`APP6-R00` §7), and **no APP6 screen offers a cancellation
control**. The content states the accepted rules the customer consents to at
approval; the machinery that executes them belongs to another phase.

## 6. Quotation policy authority

### 6.1 Validity

No accepted concrete duration exists: `DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md`
and `DB5_ARCHIVE_RETENTION_INDEXING.md` both record the validity window as
`[cfg]`. PO-G01-06's fallback therefore applies.

```text
quotation.validity.validityDays = 7   (calendar days)
```

`valid_from` is the **committed send instant** of `TR-LC12-02`, using the
repository's `instant` (`timestamptz`) convention; `valid_until` is
`valid_from + 7 calendar days`. CST-064 already requires
`valid_from < valid_until`, and COL-TBL051-18 already requires both at send.
The expiry **sweep** (`TR-LC12-05`, `SE-015`) stays out of APP6.

### 6.2 Exact money

Locked, end to end, with no new mechanism: `numeric(14,2)` in PostgreSQL →
string across the repository port → string in the application layer → string in
the HTTP envelope → string in the generated client → string in the UI.

- No `number`, no `parseFloat`, no arithmetic in JavaScript on an amount that
  is persisted or displayed.
- `deposit_percent` is `numeric(5,2)`; the split is computed **in the database
  layer or from decimal-exact values**, never in JavaScript floating point.
- CST-064 is the arbiter: `deposit_amount + remaining_amount = total_amount`
  and `total = subtotal + adjustment + shipping fee`.
- `currency_code` is `'VND'` by `CHECK`; no currency is selectable.
- Every new APP6 nullable-string OpenAPI property is declared
  `@ApiProperty({ type: String, nullable: true })`, so APP6 adds none of the
  debt `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` records.

### 6.3 Effective expiry

```text
effective_expired  =  now >= valid_until
```

evaluated whenever the version is otherwise sent and acceptance-eligible.
Equality means expired; this is not a new convention — it is the delivered one
(`now >= challenge.expiresAt` in three APP4 call sites).

| Surface | Behaviour |
|---|---|
| `APP6-B05` acceptance | Rejects after `valid_until` **in transaction**, under the version row lock, regardless of the persisted status |
| `APP6-B04` secure read | Exposes effective expiry even when the persisted status is still `SENT` |
| `APP6-S01` Storefront | Renders expiry from the backend contract/state; it computes no expiry of its own from a clock |
| Sweep | May normalise persistence later. It is **never** the correctness arbiter |

### 6.4 Deposit

```text
quotation.deposit.depositPercent   = 40
quotation.deposit.remainingPercent = 60
```

BR-005 and D-013/D-014, preserved unchanged as policy authority. APP6 writes
the `deposit_percent` / `deposit_amount` / `remaining_amount` split onto the
quotation version because CST-064 makes those columns `NOT NULL` pricing facts.
APP6 creates **no** Order, **no** payment obligation, **no** payment attempt and
**no** collection — ADR-DB3-001 r7 places all of that in APP7 behind GRD-009.

### 6.5 Policy dataset

Values live in `packages/database/seed/app6-policy-configuration.seed.json`,
versioned through `policy_configurations` / `policy_configuration_versions`
(TBL-076 / TBL-077) — the delivered versioned-policy infrastructure. No new
policy system is introduced. `APP6-G01` ships **data only**; the reader and the
publishing caller are `APP6-B01`, exactly as `APP4-G01` shipped its dataset and
`APP4-B01-C1` shipped the reader and publisher.

---

## 7. Secure access authority

Reuse, without extension:

- **Scope kind:** `REQUEST_ACCESS`. `GRANT_SCOPE_KINDS` is a closed
  single-value set (ADR-DB3-004 r1). APP6 introduces **no** quote-specific or
  design-specific grant kind, **no** new token format, and **no** customer
  account or password.
- **Architecture:** the delivered APP4 secure grant, secure link, resolution
  and step-up services.

| APP6 action | Grant | Step-up (GRD-003) | Owner |
|---|---|---|---|
| View quotation | required | no | `APP6-B04` |
| Accept quotation | required | **yes** — ADR-DB3-004 r4 locked sensitive set | `APP6-B05` |
| Reject quotation | required | no — TR-LC12-06 lists GRD-002 only | `APP6-B05` |
| View exact design under review | required | no | `APP6-B10` |
| Approve design | required | **yes** — locked sensitive set | `APP6-B11` |
| Request revision | required | no — TR-LC08-03 lists GRD-002 only | `APP6-B11` |

Every sensitive write re-checks, **inside its own transaction**: grant status
and expiry (CC-16, a committed revoke wins), scope and request-target ownership
(INV-08), step-up freshness within the window where required, and exact-version
eligibility (GRD-006 or GRD-007).

- **Customer identity is derived from the grant.** No client-supplied
  `customerId` is ever authority, in any APP6 operation.
- **Admin identity is server-derived.** No client-supplied `adminId`.
- The token travels in the **request body of a POST**, never in a query
  string, path, browser history or server log — the delivered APP5-B03 pattern.
- The fragment is stripped before any request on `APP6-S01` and `APP6-S02`.
- **Public error vocabulary:** every grant-validity failure — read *or* write,
  and covering unknown, expired, revoked, wrong target and wrong scope —
  answers with the single delivered non-enumerating
  `SECURE_LINK_UNAVAILABLE`. `GRANT_INVALID` remains the DB3-internal guard
  name. `REVERIFICATION_REQUIRED` is returned **only** when the grant is valid
  and step-up alone is missing, because the customer must be able to act on it.

---

## 8. Rendering authority

```text
safe formal design document
  → the delivered APP3 native-SVG renderer (IMP-D026, ADR-APP0-001)
  → the delivered APP3-S09 runtime watermark
  → the customer review UI
```

Locked:

- **No APP6 server-side design→raster pipeline** is created.
  `design_versions.preview_derivative_id` and `preview_hash` remain `NULL` on
  the APP6 path; both columns are already nullable, so nothing is worked
  around.
- **No export and no download path** on the customer review surface.
- **No generic private-asset endpoint**, and no storage key, bucket name or
  provider URL is ever exposed in a response.
- The document delivered to the review UI is the **safe** formal document —
  what `APP6-B10` publishes, never a raw private original.
- Reversible: a preview derivative can be added later without remodelling, as
  both columns already exist.

| Proof owner | What it must prove |
|---|---|
| `APP6-B10` | The safe secure review read: exact version only, no storage key, no private original |
| `APP6-S02` | Renders the exact version, applies the watermark, offers no export path |
| `APP6-E01` | Focused acceptance across the journey, catalogue and COP |

---

## 9. Event and side-effect authority

Only the events accepted authority already requires. None is created for
symmetry.

| Event | Required? | Owning transaction | Outbox timing | Notification consequence | Consumer | Boundary |
|---|---|---|---|---|---|---|
| `quotation.sent` (`SE-004`) | **yes** | `TR-LC12-02` send | after commit | Customer secure-link notification carrying the quotation | APP4 notification worker | Amounts may appear; no document content |
| `design.review-ready` (`SE-004`) | **yes** | `TR-LC08-02` send for review | after commit | Customer secure-link notification | APP4 notification worker | No document content |
| `design.revision-requested` (`SE-004`) | **yes** | `TR-LC08-03` | after commit | Admin alert | Admin surface | — |
| `design.approved` (`SE-005`) | **yes** | `TR-LC08-04` approval | after commit | Approval confirmation | **APP7** order creation trigger + notification | **APP6 emits it and stops.** APP6 creates no Order, no obligation and no payment |
| `quotation.accepted` | **no** | — | — | — | — | `SE-004` does not list it; `TR-LC12-03` records evidence and audit, and APP7 reads the accepted version. Not created |
| `quotation.rejected` | **no** as an outbox event | `TR-LC12-06` | — | Admin alert through the delivered admin surface | — | `SE-004` does not list it. Not created |
| `SE-015` quote-expiry sweep | **out of APP6 scope** | — | — | Optional expiry notice | later phase | Correctness never depends on it (§6.3) |

External notification provider selection remains deferred (IMP-O006, routed to
APP12). The provider-neutral recording adapter is sufficient workflow evidence.

---

## 10. Idempotency authority

The bindings are already accepted in `DB3_IDEMPOTENCY_SPECIFICATION.md`. They
are confirmed, not replaced, and no new infrastructure is introduced —
`idempotency_records` and the delivered claim mechanism are reused.

| Action | Namespace | Scope | Fingerprint | Replay returns |
|---|---|---|---|---|
| Quotation acceptance | `quotation.accept` | the exact quotation **version** | version id + accepted total | the existing acceptance evidence |
| Design approval | `design.approve` | the exact design **version** | version id + document hash + terms version | the existing Approval Snapshot |

Dispositions for the remaining APP6 actions:

| Action | Disposition |
|---|---|
| Revision request (`TR-LC08-03`) | **Natural, not a namespace.** One decision per version; a second decision on a decided version loses to CC-04 and returns `INVALID_TRANSITION` with the recorded first decision |
| Quotation reject (`TR-LC12-06`) | **Natural.** The version's terminal state is the record; a repeat on a `REJECTED` version is `INVALID_TRANSITION` |
| Send for review, duplicate or concurrent (`TR-LC08-02`) | **Natural, arbitrated by `uq_design_versions__case__sent_for_review`.** A resend of the same version replays; a second version's send loses and maps to `REVIEW_ALREADY_ACTIVE` |
| Quotation send, duplicate or concurrent (`TR-LC12-02`) | **Natural.** `TR-LC12-02` records "resend replays"; a version already `SENT` is not re-frozen and not re-priced, and the current pointer is not re-advanced |

---

## 11. Concurrency and error authority

| Scenario | Database arbiter | Transaction lock / check | Public application error | Idempotent replay | Proof owner |
|---|---|---|---|---|---|
| **CC-03** simultaneous send-for-review | `uq_design_versions__case__sent_for_review` partial unique index | Constraint failure inside the send transaction; GRD-004 | `REVIEW_ALREADY_ACTIVE` | n/a — natural | `APP6-B09` |
| **CC-02** approval vs a superseding version | design version row | `FOR UPDATE` on the version + in-transaction state check; GRD-007 | `APPROVAL_VERSION_MISMATCH` | replay returns the snapshot if the approval itself already committed | `APP6-B11` |
| **CC-04** approval vs revision request | design version row | `FOR UPDATE`; first decision wins | `INVALID_TRANSITION`, naming the recorded first decision | n/a | `APP6-B11` |
| **CC-05** stale quotation acceptance | quotation version row | `FOR UPDATE` + in-transaction state/current-pointer check; GRD-006 | `QUOTE_VERSION_STALE` | n/a — the stale version never accepted | `APP6-B05` |
| **CC-06** expiry vs acceptance | quotation version row | `FOR UPDATE`; committed-first wins; `now >= valid_until` evaluated in transaction | `QUOTE_VERSION_STALE` | n/a | `APP6-B05` |
| **CC-16** grant revoke vs sensitive action | `secure_access_grants` row | Grant status re-read **inside** the action transaction (ADR-DB3-004 r9); a committed revoke wins | `SECURE_LINK_UNAVAILABLE` | n/a | `APP6-B05`, `APP6-B11` |
| Duplicate quotation acceptance | `idempotency_records` claim | Claim taken before the write | `200`-class replay, not an error | **yes** — the acceptance evidence | `APP6-B05` |
| Duplicate design approval | `idempotency_records` claim | Claim taken before the write | `200`-class replay, not an error | **yes** — the Approval Snapshot | `APP6-B11` |
| Digitizing command on a non-accepted request | `custom_requests` row | `FOR UPDATE` + GRD-005 | `QUOTE_NOT_ACCEPTED` | n/a | `APP6-B06` |
| Request-state race caused by a design or quotation event | `custom_requests` row | The row is contended **inside** the owning transaction; the projection lives there, never in a second call | `INVALID_TRANSITION` | n/a | `APP6-B03`, `B05`, `B09`, `B11` |

`REVIEW_ALREADY_ACTIVE` is the only one of these already present in the
delivered error-mapping catalogue (`DB7_ERROR_MAPPING_CATALOG.md`); the rest
carry their DB3 guard names, and each owning checkpoint publishes the code
exactly as named here rather than inventing a synonym.

---

## 12. `APP6-DB01` handoff

```text
DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
```

The eight authorised schema operations, the branch `CHECK` shapes, FK delete
behaviour, branch completeness, index and uniqueness impact, backfill
behaviour, and migration safety and reversibility are published in full in
**ADR-APP6-001 §4**. `APP6-DB01` implements exactly that list and nothing else.

Two items are explicitly **not** part of the DB01 contract:

1. The `packages/design-document` placement widening (ADR-APP6-001 §3.4) —
   owner `APP6-B08`. It is a package change, not a schema change.
2. Any COP-lookup index — a later access-path decision, not a correctness one.

---

## 13. What this checkpoint did not do

- No API controller, use case, module, service or DTO.
- No `apps/admin` or `apps/storefront` change.
- No worker behaviour.
- No schema file, no SQL, no migration. Migration count stays **35**.
- No OpenAPI artifact and no generated-client regeneration.
- No Figma node and no `FIGMA_DESIGN_INDEX.md` row. `APP_06` stays at zero.
- No APP7 order or payment logic.
- No root `package.json` script.
