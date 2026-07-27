# APP2-D01 — Admin Assets Design Approval Record

**Approval ID:** FIG-APPROVAL-APP2-D01-ADMIN-001
**Product Owner review result:** PASSED — `PRODUCT_OWNER_APPROVED — FROZEN`
**Owning design checkpoint:** APP2-D01 (`reports/APP2-D01-COMPLETION-REPORT.md`)
**Ruling applied by:** APP2-D01-C1 (`reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md`), 2026-07-26
**Reconciled and recorded by:** APP2-D02 (`reports/APP2-D02-COMPLETION-REPORT.md`), 2026-07-27
**Recorded:** 2026-07-27

---

## 1. Statement

The Product Owner reviewed the APP2-D01 design package and returned
`PARTIAL_PRODUCT_OWNER_APPROVAL`: the **Admin** surfaces were **approved and
frozen**, the Storefront Product List was rejected, and the Storefront Product
Detail was withheld. `APP2-D01-C1` applied that ruling to Figma and to the
canonical registry prose.

This record is the canonical human-review evidence for the **Admin Assets**
subset that `APP2-A01` implements. It exists because the ruling had been recorded
only as prose in `FIGMA_DESIGN_INDEX.md` §4.3 and phase plan §6.2.1, while the
seven registry rows still carried `REVIEW_REQUIRED` and an empty evidence cell —
a divergence the `APP2-A01` implementation audit surfaced. `APP2-D02` reconciles
the rows to the ruling; it does not create or widen an approval.

## 2. Approved scope

The Admin Assets screen (`Tài sản hình ảnh`) inside the accepted APP1 Admin
shell: upload affordance, asset collection with lifecycle status, upload
progress, processing reconciliation, and safe rejection — desktop 1440 and
mobile 390.

**Not approved by this record:** Admin Product Draft, Admin Catalog, Admin
Publication (separately frozen under the same ruling but consumed by A02–A04),
and every Storefront row.

## 3. Approved registry entries (7)

These `docs/design/FIGMA_DESIGN_INDEX.md` §4.3 rows move
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence
`FIG-APPROVAL-APP2-D01-ADMIN-001`.

| Registry ID | State | Viewport | Node | Deep link |
|---|---|---|---|---|
| FIG-ADMIN-ASSETS-DESKTOP-DEFAULT | Default | Desktop 1440 | 426:13 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=426-13 |
| FIG-ADMIN-ASSETS-DESKTOP-EMPTY | Empty | Desktop 1440 | 429:6 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-6 |
| FIG-ADMIN-ASSETS-DESKTOP-UPLOADING | Uploading | Desktop 1440 | 429:89 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=429-89 |
| FIG-ADMIN-ASSETS-DESKTOP-PROCESSING | Processing | Desktop 1440 | 430:12 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-12 |
| FIG-ADMIN-ASSETS-DESKTOP-REJECTED | Rejected | Desktop 1440 | 430:98 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=430-98 |
| FIG-ADMIN-ASSETS-MOBILE-DEFAULT | Default | Mobile 390 | 432:18 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=432-18 |
| FIG-ADMIN-ASSETS-MOBILE-UPLOAD | Upload | Mobile 390 | 433:19 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=433-19 |

## 4. APP2-D02 reconciliation (2026-07-27)

The frozen package left two decisions unresolved, both proven by the `APP2-A01`
implementation audit and both closed by the Product Owner decisions that
`APP2-D02` applied to the same nodes:

1. **List continuation.** `adminAsset_list` returns `hasNext` + `nextCursor`, but
   no approved interaction consumed them. Decision: an explicit, user-triggered
   `Tải thêm tài sản` control — never infinite scroll, never silent truncation,
   never offset or page-number paging, and no total-count copy (the API exposes
   no total).
2. **Server-backed identity.** The frames displayed source filenames, which B01
   neither persists nor exposes. Decision: the media-format label
   (`Ảnh PNG`/`Ảnh JPEG`/`Ảnh WebP`, unknown → `Tài sản hình ảnh`) with a
   `{size} · {createdAt}` secondary line in `vi-VN`. `File.name` stays transient
   local upload state. No backend field is added and no filename is fabricated.

These are **in-place amendments to the approved nodes under the same approval**,
not a new design package. Layout hierarchy, shell, tokens, typography, status
language and the honest thumbnail placeholder are unchanged. Two structural
consequences are disclosed: the desktop Default frame grew `1024 → 1092` so the
continuation control is visible rather than clipped below the fold, and mobile
rows grew `80 → 95` to carry the second identity line.

The reconciled authority state is
**`PRODUCT_OWNER_APPROVED — FROZEN — D02_RECONCILED`**.

One new registered node supports the amendment:
`FIG-ADMIN-ASSETS-CONTINUATION-IDENTITY` (`484:272`), the continuation
loading/error/end-state and identity specification. It is an annotation, not a
competing screen authority.

## 5. Supersession / re-review rule

Promotion authorizes implementation of the exact approved nodes only. Any further
material change requires a new design revision entering `REVIEW_REQUIRED` and a
fresh Product Owner approval; implementation must not silently track edits to an
approved node. This record does not revive the rejected Storefront Product List
nodes (deleted at `APP2-D01-C1`) and does not approve the withheld Product Detail
nodes.

## 6. Provenance

This record captures a Product Owner decision only. It contains no personal
contact details and no conversation transcript.
