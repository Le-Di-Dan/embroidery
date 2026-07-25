# APP1-D02 — Storefront Design Approval Record

**Approval ID:** FIG-APPROVAL-APP1-D02-STOREFRONT-001
**Product Owner review result:** PASSED
**Owning design checkpoint:** APP1-D02 (`reports/APP1-D02-COMPLETION-REPORT.md`)
**Recorded by implementation checkpoint:** APP1-S01A
**Recorded:** 2026-07-25

---

## 1. Statement

The Product Owner reviewed the complete APP1-D02 Storefront shell and not-found
design package in Figma (section `405:2224` on page `APP_01`) and approved it for
implementation. This record is the canonical human-review evidence; there is no
separate approval checkpoint. It is recorded by the first consuming
implementation slice, `APP1-S01A`, before any frontend code is written.

## 2. Approved scope

- Shared Storefront **application shell**: responsive header/navigation/footer,
  mobile navigation drawer, and the `<main>` page-content slot.
- Storefront **not-found boundary** (`/404`) — desktop and mobile — approved for
  design, implemented by `APP1-S01B` (not `APP1-S01A`).
- Shell **implementation & accessibility notes** frame (handoff reference).

The package is a `SUPPLEMENT`: a standalone, implementation-ready shell extracted
from the approved Homepage (`183:7` / `189:266` / `191:412`) and composed from the
approved design-system Header/Footer/MobileMenu/Button. It does **not** re-approve
the Homepage or any business capability.

## 3. Approved registry entries (7)

These `docs/design/FIGMA_DESIGN_INDEX.md` §4.2 rows move
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence
`FIG-APPROVAL-APP1-D02-STOREFRONT-001`.

### 3.1 Storefront shell (5) — consumed by APP1-S01A

| Registry ID | State | Viewport | Node | Deep link |
|---|---|---|---|---|
| FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT | Default | Desktop 1440 | 405:2225 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-2225 |
| FIG-STOREFRONT-SHELL-TABLET-DEFAULT | Default | Tablet 1024 | 405:3733 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3733 |
| FIG-STOREFRONT-SHELL-MOBILE-DEFAULT | Default | Mobile 390 | 405:3786 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=405-3786 |
| FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN | Navigation Open | Mobile 390 | 410:2311 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=410-2311 |
| FIG-STOREFRONT-SHELL-NOTES | Handoff notes | Reference | 412:2396 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=412-2396 |

### 3.2 Storefront not-found (2) — implemented by APP1-S01B (not here)

| Registry ID | State | Viewport | Node | Deep link |
|---|---|---|---|---|
| FIG-STOREFRONT-NOTFOUND | Default | Desktop 1440 | 411:2337 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-2337 |
| FIG-STOREFRONT-NOTFOUND-MOBILE | Default | Mobile 390 | 411:3851 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=411-3851 |

## 4. Explicit exclusions

- The Homepage shell-reference rows (`FIG-STOREFRONT-SHELL-DESKTOP`,
  `FIG-STOREFRONT-SHELL-TABLET`, `FIG-STOREFRONT-SHELL-MOBILE`) remain
  `SUPERSEDED`; the Homepage frames are valid Homepage references, **not** the
  shell implementation target, and are not revived by this approval.
- No Homepage or business-section design is approved here.
- No design-system (`FIG-FILE-DS`) row changes; DS catalog stays `APPROVED`.
- No Admin (`§4.1`) row changes.

## 5. Implementation split

`APP1-S01` is split into two reviewable frontend slices:

- **APP1-S01A** — shared shell + responsive navigation (this consumer). Uses the
  five §3.1 shell rows. Does **not** implement not-found.
- **APP1-S01B** — Storefront not-found boundary. Uses the two §3.2 not-found rows.

## 6. Supersession / re-review rule

Promotion to `APPROVED_FOR_IMPLEMENTATION` authorizes implementation of the exact
approved nodes only. Any material change to an approved node requires a new design
revision (a new frame entering `REVIEW_REQUIRED`) and a fresh Product Owner
approval; implementation must not silently track edits to an approved node. The
superseded Homepage rows must not be promoted or implemented as the shell.

## 7. Provenance

This record captures a Product Owner decision only. It contains no personal
contact details and no conversation transcript.
