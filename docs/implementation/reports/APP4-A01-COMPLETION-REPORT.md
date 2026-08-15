# APP4-A01 — Admin customer access support · Completion report

## A. Verdict

```text
BLOCKED_BY_AUTHORITY — ADMIN_CUSTOMER_CONTEXT_SOURCE_ABSENT
BLOCKED_BY_AUTHORITY — ADMIN_NOTIFICATION_CUSTOMER_BINDING_ABSENT
BLOCKED_BY_AUTHORITY — ADMIN_REPLAY_OUTCOME_SOURCE_ABSENT
```

`APP4-A01` stopped at the three §7/§8/§9 preflight gates before any Admin source
file was created. All three gates fail, independently, on the same underlying
cause: the approved `APP4-D01` A01 frames were drawn against a Customer-support
screen richer than the one `APP4-B07` and `APP4-B08` actually publish.

No runtime source, no test, no checker and no `packages/api-client` export was
written. The only artifact of this checkpoint is this report.

Every registry precondition **passed** — this is not a design-approval failure.
All 18 A01 rows are `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP4-D01-PO-001`. The blocks are design↔contract divergences that
only surface when the approved frames are read against the generated client, and
resolving any of them is a Product Owner decision, not an implementation choice.

**No full regression/test chain was run.**

---

## B. Accepted entry, as verified

| Entry condition | Verified | Evidence |
| --- | --- | --- |
| `APP4-D01 = COMPLETE — PRODUCT_OWNER_APPROVED` | yes | `docs/design/FIGMA_DESIGN_INDEX.md` rows 690–707 |
| All A01 rows `APPROVED_FOR_IMPLEMENTATION` | yes | 18/18 rows, approval `FIG-APPROVAL-APP4-D01-PO-001`, dated 2026-08-15 |
| `APP4-B07 = PASS` | yes | `APP4-B07-COMPLETION-REPORT.md` |
| `APP4-B08 = PASS` | yes | `APP4-B08-COMPLETION-REPORT.md` |
| `APP4-S01 = PASS`, `APP4-S02 = PASS` | yes | commits `7cd3031`, `82ebe0c` and their evidence commits |
| `NO_APP4_MIGRATION` | unchanged | no persistence touched by this checkpoint |
| 0 backend endpoints, no OpenAPI change | held | nothing was written |
| APP1 Admin auth/session reused unchanged | held | nothing was written |

Working tree at entry: clean, branch `production`, `HEAD = e63d9c1`.

---

## C. Approved registry rows read

All 18 rows resolve to file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_04`,
sub-section `04 — A01 · Admin Customer Access Support` (`621:8`), owner
`APP4-D01`, status `APPROVED_FOR_IMPLEMENTATION`, approval
`FIG-APPROVAL-APP4-D01-PO-001`:

| Node | Registry ID | State |
| --- | --- | --- |
| `631:3` | FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADING | Initial loading |
| `631:45` | FIG-ADMIN-CUSTOMERACCESS-DESKTOP-OVERVIEW | Customer/contact loaded |
| `631:124` | FIG-ADMIN-GRANT-DESKTOP-NONE | No active grant |
| `631:189` | FIG-ADMIN-GRANT-DESKTOP-ACTIVE | Active grant |
| `631:251` | FIG-ADMIN-GRANT-DESKTOP-REVOKECONFIRM | Revoke confirmation — reason required |
| `631:326` | FIG-ADMIN-GRANT-DESKTOP-REVOKING | Revoking |
| `632:3` | FIG-ADMIN-GRANT-DESKTOP-REVOKED | Revoke success |
| `632:59` | FIG-ADMIN-GRANT-DESKTOP-CONFLICT | Revoke conflict |
| `632:108` | FIG-ADMIN-DELIVERY-DESKTOP-NOFAILURE | No delivery failure |
| `632:169` | FIG-ADMIN-DELIVERY-DESKTOP-TERMINALFAILURE | Terminal notification failure |
| `632:246` | FIG-ADMIN-DELIVERY-DESKTOP-REPLAYCONFIRM | Manual replay confirmation |
| `632:329` | FIG-ADMIN-DELIVERY-DESKTOP-REPLAYING | Replay submitting |
| `633:3` | FIG-ADMIN-DELIVERY-DESKTOP-REPLAYED | Replay success |
| `633:86` | FIG-ADMIN-DELIVERY-DESKTOP-REPLAYDUPLICATE | Duplicate/concurrent replay |
| `633:147` | FIG-ADMIN-DELIVERY-DESKTOP-REISSUEREQUIRED | REISSUE_REQUIRED |
| `633:226` | FIG-ADMIN-CUSTOMERACCESS-DESKTOP-LOADERROR | Data-load error |
| `633:253` | FIG-ADMIN-CUSTOMERACCESS-DESKTOP-NOTFOUND | Empty/not found |
| `633:277` | FIG-ADMIN-CUSTOMERACCESS-NARROW-1280 | Narrow-desktop 1280 reference |

The Figma registry checker was **not** run: the registry did not change
(`CLAUDE.md` §3, `VALIDATION_GOVERNANCE.md` — scoped, not global).

---

## D. Block 1 — `ADMIN_CUSTOMER_CONTEXT_SOURCE_ABSENT`

### D.1 What §7 requires

A known `customerId` must reach `/support/customer-access` through one of
exactly three authoritative sources: an approved Customer-ID input in the frame,
an established Admin deep-link/query-context, or an existing parent Admin
workflow. Customer search by email, phone or masked contact is forbidden
outright, and A01 may not create a backend search API.

### D.2 Source 1 — approved input control: **absent**

Every layer name in section `621:8` was enumerated. The section contains exactly
two layers named `Field`, both inside the revoke confirmation dialog
(`Field Lý do thu hồi` — the revoke reason). There is **no** Customer-ID input,
search box, combobox or lookup control in any of the 18 frames.

`Row Mã khách hàng` is not a control. In `631:45` it is a label/value pair —
node `631:65` (label `Mã khách hàng`) beside node `631:66` (value
`KH-2026-0418`), both `text` nodes inside a read-only row, matching the
`Row Tên hiển thị` / `Row Email (chính)` rows around it.

The loading frame `631:3` confirms the intent: it renders skeleton bars for a
Customer that is *already being fetched* (`Loading skeleton` → `Skeleton bar 1…5`
inside `Card Khách hàng & liên hệ`). There is no "choose a customer" step before
it in the approved flow.

### D.3 Source 2 — Admin deep-link/query-context: **absent**

The topbar in all 18 frames displays the bare route `/support/customer-access`
(e.g. node `631:58`, `633:266`). No frame shows a path segment or a query
parameter, and no spec strip mentions one. The Admin app has no established
customer deep-link convention to inherit: its parameterised routes are
`products/[productId]` and `design-templates/[templateId]` only.

Inventing a `?customerId=` parameter would not be reading an authority — it
would be authoring the entry mechanism A01 is forbidden to invent, and it would
directly contradict the approved not-found copy quoted below.

### D.4 Source 3 — parent Admin workflow: **absent**

`apps/admin/src/app/(protected)` carries `assets`, `products`,
`design-templates` and the dashboard. `apps/admin/src/features` carries
`admin-shell`, `assets`, `design-template-editor`, `design-template-lifecycle`,
`design-templates`, `product-placement`, `products`, `staff-auth`.

A repository-wide search for `customer` across `apps/admin/src` returns **two**
hits, both prose in code comments
(`design-template-lifecycle/components/lifecycle-dialog.tsx:15`,
`lifecycle-confirm-dialog.tsx:21`). No Admin screen holds, selects or routes a
Customer ID. The Admin sidebar drawn in every A01 frame confirms this: `Tài sản`,
`Sản phẩm`, `Mẫu thiết kế`, `Hỗ trợ truy cập` — no customer-bearing parent.

### D.5 What the design actually specifies — and why it cannot be built

The approved empty/not-found frame `633:253` states the entry mechanism in its
body copy, node `633:272`:

> Hãy kiểm tra lại **email hoặc số điện thoại đã nhập**. Khách hàng chỉ tồn tại
> sau khi có một liên hệ được xác minh.

("Re-check the email or phone number **you entered**.")

The approved design therefore specifies entry by **contact lookup** — the one
mechanism §7 prohibits by name, and the one `APP4-B07` deliberately does not
provide. `APP4-B07-COMPLETION-REPORT.md` publishes exactly three operations, none
of which resolves a contact to a Customer:

```text
GET  /api/admin/customers/{customerId}
GET  /api/admin/customers/{customerId}/grants
POST /api/admin/secure-grants/{grantId}/revoke
```

Both reads require the `customerId` the screen has no approved way to obtain.
Building the lookup the frame describes would require a backend search endpoint,
which §7 forbids A01 from creating, and which the phase-entry audit put out of
scope for B07 ("Out of scope: … search across all customers").

The screen cannot load its primary subject. This block is fatal on its own —
blocks 2 and 3 are recorded because they are independent and the Product Owner
should rule on all three at once rather than serially.

---

## E. Block 2 — `ADMIN_NOTIFICATION_CUSTOMER_BINDING_ABSENT`

### E.1 What the design claims

§8 permits an independent global failure-support region, and blocks only if D01
claims the listed notifications belong to the loaded Customer. D01 makes that
claim, three ways:

1. **Layout.** In every notification frame the `Card Gửi thông báo` sits in the
   right column of the loaded-Customer screen, beside
   `Card Khách hàng & liên hệ` in the left column and `Card Quyền truy cập an
   toàn` above it. It is one region of one Customer's screen, not a separate
   surface.
2. **Cardinality.** The card renders exactly **one** notification with scalar
   rows (`Row Kênh`, `Row Người nhận`, `Row Mẫu`, `Row Lần thử`) and a single
   attempt timeline. There is no multi-row list, no cross-Customer table and no
   status filter control anywhere in the section.
3. **Identity.** `Row Người nhận` in `631:45` (node `631:113`), `632:169`,
   `633:3` and `633:86` (node `633:131`) all read `b***@vidu.com` — identical to
   the loaded Customer's primary email mask in the same frame (node `631:74`).
   The spec strip `631:123` names the three regions as one screen: "Ba vùng:
   khách hàng/liên hệ, quyền truy cập, gửi thông báo."

### E.2 What the contract publishes

`AdminNotificationIntentResponse` carries `intentId`, `status`, `channel`,
`recipientMasked`, `templateKey`, `templateVersion`, `createdAt` and `attempts`.
There is **no** `customerId`, `contactPointId` or any other Customer reference.
`AdminNotificationIntentListParams` carries `status` and nothing else.

This is deliberate. `APP4-B08-COMPLETION-REPORT.md` §D:

> There is deliberately **no** recipient, customer, template, provider or
> free-text search parameter, no date range and no cursor.

The only field that could tie a notification to the loaded Customer is
`recipientMasked` — and §8 forbids correlating by recipient mask, timing,
channel, template or position. The mask is explicitly documented as a
recognition aid, not a lookup key ("the mask exists so an operator can recognise
a destination, not look one up"), and it is frozen at creation rather than
re-derived, so it is not even a reliable join key.

No authoritative relationship exists. Per §8, A01 stops rather than guessing.

---

## F. Block 3 — `ADMIN_REPLAY_OUTCOME_SOURCE_ABSENT`

### F.1 The distinction D01 requires

`633:3` and `633:86` are separate approved states with materially different
content, not two renderings of one state:

| | `633:3` Replay success | `633:86` Duplicate/concurrent |
| --- | --- | --- |
| Alert | `Alert success` | `Alert info` |
| Title | — | `Lượt gửi lại này đã tồn tại` ("this replay already exists") |
| Body | — | "Yêu cầu của bạn quy về đúng lượt gửi lại đang chạy — **không có lượt thứ hai nào được tạo**." |
| Badge | `Lượt gửi lại · đã gửi` | `Lượt gửi lại · đang xử lý` |

Node `633:122`/`633:123` assert to the operator that **no second replay was
created**. That is a created-vs-existing claim. Showing it after a first replay,
or omitting it after a duplicate, states something false about what the system
just did.

### F.2 What the contract publishes

```ts
export interface NotificationReplayResponse {
  replayIntentId: string;
  status: NotificationReplayResponseStatus; // 'PENDING' — single-valued
}
```

The outcome exists in the backend — `APP4-B08-COMPLETION-REPORT.md` §D row 4
records `createIdempotent(input) → { outcome: 'created' | 'replay', intent }` —
but it is **not published**. The HTTP response is byte-identical for a first
replay and a duplicate: same shape, same single-valued `PENDING`, same
`replayIntentId`. B08 §I confirms this is intentional and symmetric:

> **Sequential duplicate:** the second call returns the same `replayIntentId` …
> **Concurrent duplicate:** two parallel HTTP calls … both `200` with the same
> `replayIntentId`.

### F.3 Why the local-sequence fallback does not close it

§9 allows `633:86` if it is implementable from an already-authoritative local
sequence explicitly represented by D01. It is not, for the case D01 names.

A same-session second submit could be resolved locally — the client holds the
`replayIntentId` from its own prior success, and the contract's idempotency
guarantee makes an identical id conclusive. But `633:86`'s own spec strip
(`633:146`) and its registry state name the **concurrent** case:

> Hai yêu cầu gửi lại cho cùng một lần thất bại quy về MỘT lượt nhờ khoá tất
> định

and the status line reads "trạng thái: gửi lại **trùng / đồng thời**"
(duplicate / **concurrent**). A concurrent replay raised by another operator or
another tab leaves this session with no prior record, and the response cannot
distinguish it. Detecting it would require inferring from timing or local status
— exactly what §9 forbids.

Collapsing `633:86` into `633:3` would silently discard an approved semantic
state; extending B08 to publish the outcome is a contract change requiring
Product Owner review. A01 does neither.

---

## G. A fourth divergence, recorded but not blocking

Every A01 frame's Customer card renders `Row Tên hiển thị` with a display name
(node `631:69` — `Nguyễn Minh An`). `AdminCustomerDetailResponse` publishes
`customerId`, `verifiedAt` and `contacts` only.

The omission is deliberate, not an oversight. `APP4-B07-COMPLETION-REPORT.md`
row 3 records that the domain `Customer` carries `displayName` and that **B07
publishes `id` and `verifiedAt` only**; line 131 lists `displayName` among the
fields withheld from the support surface alongside `verifiedSource`, Business
Profile, merge and anonymization state.

This is not raised as a separate blocker: §11 already binds A01 to B07-safe data,
so the row would simply be omitted. It is recorded here because it is the same
class of divergence as blocks 1–3, it sits on the same card, and the Product
Owner ruling on those should settle whether the row is dropped from the frames or
`displayName` is deliberately promoted onto the support contract.

---

## H. Boundary evidence — nothing was written

| Boundary | State |
| --- | --- |
| Backend / worker / DB / schema / migrations / OpenAPI | untouched |
| Generated client (`packages/api-client/src/generated/**`) | untouched, not regenerated |
| `packages/api-client/src/index.ts` | untouched — no A01 export added |
| `apps/admin/**` | untouched — no route, feature, component, hook or test |
| `tools/check-app4-a01.mjs`, `tools/check-app4-a01.test.mjs` | not created |
| Figma | not modified; registry unchanged |

The five B07/B08 operations A01 would have consumed exist in the generated client
under the names §22 anticipated — `adminCustomerSupportDetail` (`:143`),
`adminCustomerSupportGrants` (`:157`), `adminNotificationIntentList` (`:338`),
`adminNotificationIntentReplay` (`:352`), `adminSecureGrantRevoke` (`:560`) in
`packages/api-client/src/generated/embroidery-api.ts` — and **none** is currently
exported from `packages/api-client/src/index.ts`. Adding those narrow exports is
the first step once the blocks are resolved; it was not done speculatively.

---

## I. Validation ledger

No validation command was run, and none was justified: no source file changed.
Per `docs/implementation/VALIDATION_GOVERNANCE.md` §3, validations are selected
by change impact, and this checkpoint's only change is this document.

| §32 item | Run | Why not |
| --- | --- | --- |
| 1 A01 component/security/cache tests | no | no component exists |
| 2 Admin typecheck | no | no TS change |
| 3 Scoped Admin ESLint | no | no Admin source change |
| 4 A01 checker + checker tests | no | checker not created |
| 5 API-client public-boundary smoke | no | `index.ts` unchanged |
| 6 Admin route checker | no | no route facts changed |
| 7 A01 runtime/browser journey | no | nothing to exercise |
| 8 Scoped Prettier | yes | this report |
| 9 Report-secret checker | yes | this report |
| 10 Staged whitespace check | yes | this commit |

Commands actually run are listed in §K.

**No full regression/test chain was run.**

---

## J. Report secret boundary

This report contains no raw contact, no verification code, no token, no digest,
no ciphertext, no Admin session credential and no secret environment value. Every
contact string quoted (`b***@vidu.com`, `+84 ••• ••• 4821`) is a **masked
placeholder rendered in the Figma design**, not a real contact and not
reversible. `KH-2026-0418` and `YC-2026-0311` are design placeholder identifiers.

---

## K. Files changed and git evidence

```text
docs/implementation/reports/APP4-A01-COMPLETION-REPORT.md   (new)
```

One commit, documentation only. `feat(admin): implement APP4 customer access
support` (§38 commit A) was **not** created: there is no implementation to
commit. Nothing was pushed, amended or squashed.

---

## L. Follow-ups

**Raised by this checkpoint** — each needs a Product Owner ruling:

- `FU-APP4-A01-CUSTOMER-CONTEXT-01` — how a known `customerId` reaches
  `/support/customer-access`. The approved design specifies contact lookup, which
  §7 forbids and B07 does not serve. Candidate resolutions: (1) add an approved
  Customer-ID input to the A01 frames and re-approve the affected rows;
  (2) establish an Admin deep-link carrying `customerId` and amend the not-found
  copy in `633:253`, which currently describes an entered email/phone;
  (3) authorise a B07 contact-resolution endpoint under an explicit
  anti-enumeration ruling — a scope change to a `PASS`ed checkpoint.
- `FU-APP4-A01-NOTIFICATION-BINDING-01` — whether the notification region is
  Customer-bound (needs an authoritative B08 relationship) or global (needs the
  D01 frames restated so the card is not read as belonging to the loaded
  Customer).
- `FU-APP4-A01-REPLAY-OUTCOME-01` — whether B08 publishes the
  `created | replay` outcome it already computes, or `633:86` is withdrawn as an
  approved state.
- `FU-APP4-A01-DISPLAY-NAME-01` — `Row Tên hiển thị` is drawn in every A01 frame
  but deliberately withheld by B07 (§G).

**Carried forward unchanged** (§31), not broadened:

- `FU-APP4-B02-GATE-SCOPE-01` — B02 stale checker; **not** repaired here.
- `FU-APP4-DEV-API-IMAGE-01` — dev API image; **not** repaired here.
- S01 follow-ups; S02 live-journey and live-region follow-ups; the B08
  worker-journey follow-up. These remain E01-owned live-journey items and are not
  deduplicated here, since A01 produced no live journey to merge them against.

---

## M. Status and next checkpoint

```text
APP4-A01 = BLOCKED_BY_AUTHORITY
APP4-E01 = NOT READY — blocked behind APP4-A01
```

`APP4-E01` was **not** started. `APP4-X01` and `APP5`–`APP7` were not started.

A01 resumes once the Product Owner rules on
`FU-APP4-A01-CUSTOMER-CONTEXT-01` (fatal on its own),
`FU-APP4-A01-NOTIFICATION-BINDING-01` and `FU-APP4-A01-REPLAY-OUTCOME-01`.
