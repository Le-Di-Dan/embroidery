# APP1-D01 — Admin Design Approval Record

**Approval ID:** FIG-APPROVAL-APP1-D01-ADMIN-001
**Product Owner review result:** PASSED
**Owning design checkpoint:** APP1-D01 (`reports/APP1-D01-COMPLETION-REPORT.md`)
**Recorded by implementation checkpoint:** APP1-A01
**Recorded:** 2026-07-25

---

## 1. Statement

The Product Owner reviewed the APP1 Admin login and authenticated shell designs
and approved them for implementation. This record is the canonical human-review
evidence; there is no separate approval checkpoint. `APP1-D01-A1` (a proposed
standalone approval checkpoint) is **superseded** by this record and must not be
executed.

## 2. Approved scope

- Admin **login** screen (all designed states, all designed viewports).
- Admin authenticated **shell** screen (all designed states, all designed
  viewports) — approved for the later `APP1-A02` checkpoint; not implemented by
  `APP1-A01`.

## 3. Approved registry entries (13)

These `docs/design/FIGMA_DESIGN_INDEX.md` §4.1 rows move
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence
`FIG-APPROVAL-APP1-D01-ADMIN-001`.

### 3.1 Admin login (7) — owned by APP1-A01

| Registry ID | State | Viewport | Node | Deep link |
|---|---|---|---|---|
| FIG-ADMIN-LOGIN-DESKTOP-DEFAULT | Default | Desktop 1440 | 375:12 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=375-12 |
| FIG-ADMIN-LOGIN-DESKTOP-SUBMITTING | Submitting | Desktop 1440 | 382:9 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-9 |
| FIG-ADMIN-LOGIN-DESKTOP-VALIDATION | Validation Error | Desktop 1440 | 382:34 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-34 |
| FIG-ADMIN-LOGIN-DESKTOP-AUTHFAILED | Auth Failed | Desktop 1440 | 382:59 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-59 |
| FIG-ADMIN-LOGIN-DESKTOP-RATELIMITED | Rate Limited | Desktop 1440 | 382:84 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=382-84 |
| FIG-ADMIN-LOGIN-MOBILE-DEFAULT | Default | Mobile 390 | 380:8 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=380-8 |
| FIG-ADMIN-LOGIN-MOBILE-ERROR | Error | Mobile 390 | 383:9 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=383-9 |

### 3.2 Admin shell (6) — owned by APP1-A02 (not implemented here)

| Registry ID | State | Viewport | Node |
|---|---|---|---|
| FIG-ADMIN-SHELL-DESKTOP-DEFAULT | Default | Desktop 1440 | 385:10 |
| FIG-ADMIN-SHELL-DESKTOP-LOADING | Current-Staff Loading | Desktop 1440 | 387:11 |
| FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED | Session Expired | Desktop 1440 | 387:40 |
| FIG-ADMIN-SHELL-MOBILE-DEFAULT | Default | Mobile 390 | 389:14 |
| FIG-ADMIN-SHELL-MOBILE-NAVOPEN | Navigation Open | Mobile 390 | 390:14 |
| FIG-ADMIN-SHELL-MOBILE-SESSIONEXPIRED | Session Expired | Mobile 390 | 396:15 |

## 4. Explicit exclusions

- The three APP1-D01 annotation frames (`FIG-APP1D01-REUSE-MAP`,
  `FIG-APP1D01-RESPONSIVE-NOTES`, `FIG-APP1D01-IMPL-ANNOTATIONS`) remain
  `REVIEW_REQUIRED`; they are design notes, not implementable screens.
- No design-system (`FIG-FILE-DS`) row changes; DS catalog stays `APPROVED`.

## 5. Storefront non-approval

This approval applies **only** to APP1 Admin login and Admin shell. Every
Storefront artifact stays unapproved:

- Storefront shell rows `FIG-STOREFRONT-SHELL-{DESKTOP,TABLET,MOBILE}` remain
  `DRAFT`.
- `FIG-STOREFRONT-NOTFOUND` remains `MISSING`.
- The Storefront reuse-map annotation remains `REVIEW_REQUIRED`.

`APP1-S01` stays `BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`.

## 6. Implementation interpretation notes

- **Mobile-error frame (`FIG-ADMIN-LOGIN-MOBILE-ERROR`, 383:9)** demonstrates the
  mobile visual language for **both** field-validation errors and generic
  authentication failure. At runtime these stay distinct: `400 BAD_REQUEST` with
  `errors[]` renders field-level messages; `401 STAFF_LOGIN_FAILED` renders one
  generic form-level alert. They are never shown together unless the backend
  returns both (the current contract does not).
- **DS component references** (`Header`, `Footer`, `MobileMenu`, `NavLink`,
  `SearchBar`) are registry/catalog references, not instances embedded in every
  login frame. The login frames visibly instantiate the DS **Button** and a
  composed **Input** (no DS Input component exists — gap `FIG-DS-INPUT`).
- **Token gaps** surfaced during implementation: the DS defines `text/inverse`
  (white) and `action/disabled` (#d6d3d1) semantically, but `@embroidery/styles`
  does not yet expose `$color-text-inverse` or `$color-action-disabled`. A01 maps
  them to the value-identical existing tokens (`$color-surface-primary` #ffffff,
  `$color-border-secondary` #d6d3d1) rather than hard-coding hex; adding the
  missing tokens is a follow-up.

## 7. Re-review / supersession rule

If any approved Admin node is materially changed, it returns to `REVIEW_REQUIRED`
and requires a fresh Product Owner approval (new approval ID) before further
implementation. This record does not authorize implementing any node other than
the 13 listed above, and does not extend to any Storefront or DS artifact.
