# APP10-I01 — Storefront Zalo/Messenger Simple Handoff — Completion Report

## A. Verdict

```text
APP10-I01 = COMPLETE
PO_DECISION_REQUIRED = NONE
DESIGN_APPROVAL = FIG-APPROVAL-APP10-D01-PO-001
NEXT_CHECKPOINT = APP10-E01
```

### Figma read note

The `figma-desktop` MCP server did not connect in this session
(`ConnectionRefused`), and the hosted Figma MCP requires an interactive OAuth
grant. The design authority used is therefore the registry rows in
`docs/design/FIGMA_DESIGN_INDEX.md` §4 — `FIG-APP10-I01-FOOTER-DESKTOP`
(`842:3`), `FIG-APP10-I01-FOOTER-MOBILE` (`842:48`),
`FIG-APP10-I01-CTA-STATES` (`843:3`) and `FIG-APP10-I01-HANDOFF-SPEC`
(`843:44`), all `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP10-D01-PO-001` — together with the in-repo frame record in
`APP10-D01-COMPLETION-REPORT.md` §F, which states each frame's content
element by element. This is the same substitution `APP10-A02` recorded and is
a tooling limitation of the session, not a registry gap. **0 Figma nodes were
created, modified, moved, renamed or deleted**, and `node
tools/check-figma-design-index.mjs` passes (491 registry IDs, 491 node rows).

---

## B. Implemented Storefront surface

| File | Role |
|---|---|
| `apps/storefront/src/features/storefront-shell/components/storefront-contact-handoff.tsx` | **New.** The `Kết nối` group: one external anchor per configured channel. 65 lines. |
| `apps/storefront/src/features/storefront-shell/model/contact-handoff.ts` | **New.** The two configuration names, the URL validator, and the channel resolver. 141 lines. |
| `apps/storefront/src/features/storefront-shell/styles/_contact-handoff.scss` | **New.** Group, list and CTA styles, desktop and mobile. 106 lines. |
| `apps/storefront/src/features/storefront-shell/components/storefront-footer.tsx` | Renders `<StorefrontContactHandoff />` between the brand block and the rights line. |
| `apps/storefront/src/features/storefront-shell/model/storefront-shell-copy.ts` | Adds the `contactHandoff` copy block (heading, caption, two channel names). |
| `apps/storefront/src/features/storefront-shell/styles/storefront-shell.scss` | One `@use './contact-handoff';` line so the shell keeps a single leaf entry in `main.scss`. |

Placement: inside the **existing** `.storefront-shell__footer-inner`, which is
the approved `APP1-D02` footer composition (`405:2253` desktop / `409:2359`
mobile) that `FIG-APP10-I01-FOOTER-DESKTOP` extends. No new route, no new
layout, no new landmark outside the footer, and no portal or overlay.

The group is a `<section aria-labelledby>` with an `<h2>Kết nối</h2>` and a
`<ul>` of anchors — nothing else. Its length is the proof of its boundary.

---

## C. Configuration

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_ZALO_CONTACT_URL` | Absolute external Zalo destination. |
| `NEXT_PUBLIC_MESSENGER_CONTACT_URL` | Absolute external Messenger destination. |

Two bounded values. **No** provider registry, channel map, adapter interface or
generalized social-configuration framework was created; a third channel would be
a product decision, not a new row.

**Convention followed.** `NEXT_PUBLIC_` is the repository's marker for a value
that is safe in the browser (`.env.example` Storefront section: server-only
values carry no prefix). Both URLs are printed in the page a visitor reads, so
the prefix is honest rather than permissive. Both are accessed as static
`process.env.NEXT_PUBLIC_*` literals in `readContactHandoffConfig()`, because a
computed lookup is not substituted by Next and would silently hide both CTAs.

**Not secrets.** Neither name matches the `CLAUDE.md` §8a protected pattern
(`PASSWORD`/`PASSWD`/`SECRET`/`TOKEN`/`KEY`/`CREDENTIAL`/`PRIVATE`), and neither
was added to `.env-ignore` — marking a customer-visible fact as a secret would
be false. **No write of any kind was made to `.env`**; the two names were
documented in `.env.example` and wired through
`infrastructure/compose/docker-compose.dev.yml` as `${…:-}` pass-throughs, which
default to empty and therefore change nothing for an operator who sets neither.

**Validation** (`resolveExternalContactUrl`, never throws):

| Rule | Rejected value resolves to |
|---|---|
| present and non-blank | `undefined` |
| parses as an absolute URL | `undefined` |
| protocol is `https:` or `http:` | `undefined` |
| host is non-empty | `undefined` |
| carries no username/password | `undefined` |

What is rendered is `URL.href` — the parser's canonical form of a value already
proven to be an absolute http(s) URL — never operator text passed through
untouched.

**Missing / malformed behaviour** (`843:3`):

- one channel unusable → **only that CTA is omitted**; the other is unaffected;
- both unusable → **the whole group is not rendered** (`return null`: no
  heading, no empty `<section>`), and the footer is exactly its pre-I01 self;
- never rendered: a disabled button, `#`, `javascript:void(0)`, an empty
  `href`, or any configuration error text shown to a customer.

Unlike `STOREFRONT_PUBLIC_ORIGIN` in the worker, this configuration does **not**
fail closed on absence: a wrong origin mails a customer's token to another host,
whereas a missing contact URL costs one convenience link on a page whose
authoritative flows all still work. Failing the render would be strictly worse
than omitting the link. The reasoning is recorded in the module header so the
asymmetry with the worker validator is deliberate and readable.

---

## D. Zalo handoff

- **URL** — whatever the operator publishes in `NEXT_PUBLIC_ZALO_CONTACT_URL`,
  rendered unmodified as the anchor's `href`. Nothing is appended, prefixed or
  substituted.
- **External semantics** — `target="_blank"` with `rel="noopener noreferrer"`,
  the repository-standard attribute pair for a new browsing context.
- **Accessibility** — accessible name `Zalo Mở ứng dụng bên ngoài`, composed
  from visible text only (no `aria-label` overrides what is on screen, so voice
  control on the visible word "Zalo" works). The `↗` glyph is
  `aria-hidden="true"` and repeats the caption rather than carrying it, so the
  CTA is never icon-only. Minimum height `$size-touch-target-min` (44px), and a
  `:focus-visible` outline in `$color-action-primary` at 2px offset — the shell's
  existing focus treatment.
- **Not a launcher** — it looks and behaves like a link that leaves the site,
  which is what the visible caption states.

## E. Messenger handoff

Identical in every respect, from `NEXT_PUBLIC_MESSENGER_CONTACT_URL`, with
accessible name `Messenger Mở ứng dụng bên ngoài`. It renders second, matching
the approved footer order in `842:3`, and it is fully independent: either
channel renders without the other.

---

## F. Context handoff

**Not implemented — plain configured links are used deliberately.**

`FIG-APP10-I01-HANDOFF-SPEC` (`843:44`) permits an already-public
human-readable business reference (a request or order display code) in a
provider opening text. The shell footer renders on **every** Storefront route,
including the home page and the catalog, and receives no props: no request, no
order and no case is in hand at that boundary. Producing one would mean new
global state, a context provider or a backend read purely to decorate a footer
link — which §9 and §15 of the brief forbid, and which §10 warns is exactly the
architecture that later leaks an identifier.

So `contact-handoff.ts` composes **no query, no fragment and no opening text at
all**. There is no code path in the module that could append anything: the only
transformation applied to the configured value is `new URL(value).href`. The
test `renders the configured URL unmutated` asserts the rendered `href` is
byte-identical to the configured constant and contains neither `?` nor `#` nor
any part of `window.location.href`.

Per §9 and §21 this outcome is fully acceptable and is a deliberate choice, not
a deferral. If a future checkpoint wants the code attached, the right place is a
page-level surface that already holds it — not the shared footer.

---

## G. Scope fidelity

| Forbidden | Proof |
|---|---|
| Chatbot / embedded chat / AI assistant | The rendered footer contains 0 buttons, 0 textboxes, 0 dialogs and no `iframe`/`script`/`embed`/`object` — asserted in `storefront-contact-handoff.test.tsx`. |
| Provider SDK / third-party package | `apps/storefront/package.json` is **unchanged**; the source-boundary test asserts every import specifier in all three touched sources is **relative** — the feature imports no package at all. |
| Provider API / webhook / backend adapter | The same suite asserts no `fetch(`, no `axios` and no `/api/` in any touched source, and that no network call occurs during render. |
| New backend endpoint | 0 files changed under `apps/api`. |
| Inbox / read receipts / agent assignment / conversation persistence / message sync / unified messaging / campaign orchestration | Nothing is stored or read: the component holds no state, and the shell boundary suite still proves the feature touches no `localStorage`, `sessionStorage` or `document.cookie`. |
| New Storefront route | 12 `page.tsx` files before and after. |
| Floating launcher / chat drawer / provider page | `_contact-handoff.scss` declares no `position` and no `z-index` at all; the group is a flow child of `.storefront-shell__footer-inner`, asserted by `footer.contains(group)`. |
| Provider brand artwork | No image, SVG or font was added. The CTAs are type plus the neutral `↗` glyph, exactly as `APP10-D01` §F records (`FU-APP10-D01-06` keeps the option open if licensed assets ever land in the DS). |

---

## H. Existing footer preservation

- `storefront-shell-footer.test.tsx` — brand link to `/`, tagline and rights line
  all still assert green.
- `storefront-shell-render.test.tsx` — header/footer/nav landmarks, skip link,
  brand route and "only built areas are links" all unchanged.
- `storefront-shell-drawer.test.tsx` — mobile drawer unchanged.
- `storefront-shell-source.test.ts` — the shell architectural boundaries (no
  fetch, no API client, no storage, no inline styles, no CSS Modules, no second
  QueryClient/store, **no dead `href="#"`**, no not-found node) all still hold
  with the new files inside the scanned feature directory.
- With neither channel configured the footer DOM is its pre-I01 shape: one link,
  the brand.

No unrelated footer or company-contact debt was touched. The Storefront still
carries no address, phone number, e-mail or policy route
(`FU-APP10-D01-05` stays open, unchanged by I01).

### The one superseded assertion, narrowed

`storefront-shell-footer.test.tsx` → *"invents no contact, social, or policy
data"* previously read as *no contact channel may ever exist*. APP10-I01 and
`FIG-APPROVAL-APP10-D01-PO-001` supersede that reading. The test now clears both
variables first and keeps every original assertion — no `mailto:`, no `tel:`, no
`facebook|instagram|tiktok|zalo|twitter|youtube` href, exactly one footer link —
so the surviving rule is the one that was always the point: **the footer invents
no value**. The configured cases are proved in the new suite. Nothing was
deleted, weakened or disabled, and no other footer assertion was modified.

---

## I. Accessibility / responsive / security

**Accessibility** — meaningful accessible link names that include both the
channel and the handoff meaning; channel named in visible text; no icon-only
CTA; decorative `↗` hidden from assistive technology; native anchors, so
keyboard navigation and activation are the platform's; visible `:focus-visible`
outline; 44px minimum target preserved; the group is a labelled `region` so it
is reachable and announced as `Kết nối`.

**Responsive** — mobile-first. The list stacks vertically at the base width
(`FIG-APP10-I01-FOOTER-MOBILE`, 390) and becomes a row at the shell's existing
`$bp-footer` (768px) inside the footer's existing desktop row
(`FIG-APP10-I01-FOOTER-DESKTOP`, 1440). The breakpoint is mirrored from
`storefront-shell.scss` with a comment, following the pattern the repository
already uses for shell-derived breakpoints. No overlay, no fixed positioning, no
second DOM tree — layout only.

**Security** — no token, fragment secret, access grant, verification code,
customer id, internal UUID, raw e-mail, raw phone, session id or cookie can
reach either URL, because nothing at all is appended to it. Scheme allowlisting
keeps a `javascript:` or `data:` value written into configuration from becoming a
click target in every page footer. `rel="noopener noreferrer"` on both anchors.
No credential is read, logged or rendered; no `.env` write was made anywhere in
this checkpoint.

---

## J. Tests executed

Change-impact only. All commands run from `apps/storefront` unless noted.

| Command | Relevance | Result |
|---|---|---|
| `npx jest test/components/storefront-contact-handoff.test.tsx` | new — both configured, one missing, both missing, 8 malformed values, security boundary, source boundary | **PASS 18/18** |
| `npx jest test/components/storefront-shell-footer.test.tsx` | the narrowly updated absence assertion + footer copy | **PASS 3/3** |
| `npx jest test/components/storefront-shell-render.test.tsx` | shell landmarks/links regression — the footer is part of the shell | **PASS 8/8** |
| `npx jest test/components/storefront-shell-drawer.test.tsx` | shell regression | **PASS 6/6** |
| `npx jest test/boundary/storefront-shell-source.test.ts` | scans the whole shell feature dir, so it now covers both new sources | **PASS 8/8** |
| the five together | — | **PASS 5 suites / 43 tests** |
| `npx tsc --noEmit -p tsconfig.json` | new and changed Storefront sources | **PASS** |
| `npx sass … src/features/storefront-shell/styles/storefront-shell.scss` | the new SCSS partial actually compiles | **PASS** — 11 `footer-handoff` rules emitted |
| `node tools/check-figma-design-index.mjs` | frontend UI checkpoint gate | **PASS** (491 IDs / 491 rows / 22 tables) |
| `node tools/check-file-size.mjs` | new source and test files | 80 violations — **identical to HEAD**, 0 in APP10-I01 files |
| `node tools/check-styling-boundaries.mjs` | new SCSS partial | 25 violations — **identical to HEAD**, 0 in `_contact-handoff.scss` |

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
```

Not run, by instruction: the full Storefront suite, any Admin or API test, any
customer merge or customer profile suite, any DB check, and any
notification/payment/inventory regression.

### Inherited failure — reported, not repaired

`npx sass` over the Storefront **bundle entry** `src/styles/main.scss` fails:

```text
Error: "Unknown spacing step `14`. Approved steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128."
  apps/storefront/src/features/secure-final-payment/styles/_final-payment-tokens.scss 54:22
```

`$note-padding-block: styles.spacing(14)` is off the approved base-4 scale and
the `spacing()` function `@error`s on it. The file is `APP9-S01` (commit
`b561a96`), is untouched by this checkpoint and is unrelated to the footer, so
per §19 it is reported rather than fixed (`FU-APP10-I01-01`). The I01 stylesheet
itself compiles clean, proved above against `storefront-shell.scss`.

---

## K. Quality validation

- **Prettier** — `npx prettier --write` / `--check` over exactly the touched
  paths (`apps/storefront/src/features/storefront-shell`, both test files,
  `infrastructure/compose/docker-compose.dev.yml`). **All matched files use
  Prettier code style.** Nothing else in the repository was reformatted.
  `.env.example` has no Prettier parser and is not formatted by it.
- **ESLint** — `npx eslint src/features/storefront-shell
  test/components/storefront-contact-handoff.test.tsx
  test/components/storefront-shell-footer.test.tsx`. **0 findings.** No
  aggregate lint was run and no rule was disabled, suppressed or reconfigured.
- **SonarQube** — repository-global control, run by CI on the branch. Not
  invocable as a checkpoint command and not run here; nothing in this checkpoint
  suppresses, excludes or configures around it.

No repository-wide aggregate command was used and no unrelated functional test
was launched.

---

## L. Files changed

**New (4)**

```text
apps/storefront/src/features/storefront-shell/components/storefront-contact-handoff.tsx
apps/storefront/src/features/storefront-shell/model/contact-handoff.ts
apps/storefront/src/features/storefront-shell/styles/_contact-handoff.scss
apps/storefront/test/components/storefront-contact-handoff.test.tsx
```

**Modified (6)**

```text
apps/storefront/src/features/storefront-shell/components/storefront-footer.tsx
apps/storefront/src/features/storefront-shell/model/storefront-shell-copy.ts
apps/storefront/src/features/storefront-shell/styles/storefront-shell.scss
apps/storefront/test/components/storefront-shell-footer.test.tsx
.env.example
infrastructure/compose/docker-compose.dev.yml
```

**Documentation (2)**

```text
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md
docs/implementation/reports/APP10-I01-COMPLETION-REPORT.md   (this file)
```

File sizes: 141 / 65 / 106 / 219 lines for the four new files; the largest
changed file is `storefront-shell.scss` at 428 lines, **425 at HEAD** — the
overage is inherited (`APP1-S01A`) and the +3 lines are the comment, the `@use`
and a blank that keep the new rules out of it. `tools/check-file-size.mjs` scans TS/JS only and reports 0
APP10-I01 violations.

---

## M. Baseline delta

| Dimension | Before | After | Δ |
|---|---|---|---|
| Storefront routes (`page.tsx`) | 12 | 12 | **0** |
| Backend HTTP operations | unchanged | unchanged | **0** |
| Database migrations | unchanged | unchanged | **0** |
| OpenAPI document | unchanged | unchanged | **0** |
| Generated API client | unchanged | unchanged | **0** |
| Worker | unchanged | unchanged | **0** |
| Notification / payment subsystem | unchanged | unchanged | **0** |
| Runtime dependencies | unchanged | unchanged | **0** |
| Figma nodes / registry rows | 491 | 491 | **0** |
| Admin application | unchanged | unchanged | **0** |
| New public configuration values | 0 | 2 | **+2** (both non-secret) |

**Commit/push status:** not committed and not pushed. The working tree carries
this checkpoint's changes for human review, alongside the uncommitted `APP10-A01`
and `APP10-A02` artefacts already present at entry.

---

## N. Follow-ups (nonblocking)

| ID | Type | Item |
|---|---|---|
| `FU-APP10-I01-01` | Inherited defect | `apps/storefront/src/features/secure-final-payment/styles/_final-payment-tokens.scss:54` uses `styles.spacing(14)`, which is off the approved base-4 scale, so the Storefront `main.scss` bundle does not compile. Present at HEAD (`APP9-S01`, `b561a96`), unrelated to I01, not repaired here. |
| `FU-APP10-I01-02` | Content | Neither contact URL has a production value yet. Until an operator publishes them the `Kết nối` group is invisible in every environment — by design, and the only step left is configuration. |
| `FU-APP10-I01-03` | Product idea | If a page-level surface that already holds a public request/order code ever wants the escape hatch (`USER_FLOW_ARCHITECTURE` D3/D12), the opening-text handoff `843:44` permits belongs there, not in the shared footer. |
| `FU-APP10-D01-05` | Content (carried) | The Storefront footer still has no canonical company contact block. I01 adds two configured links only and does not close that gap. |
| `FU-APP10-D01-06` | Design (carried) | Zalo/Messenger brand marks remain unused; `842:3`/`842:48` can adopt licensed artwork later without a layout change. |

---

## O. Roadmap

`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` — the
single canonical APP10 status table — now reads:

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable event history | `COMPLETE` |
| `APP10-D01` | APP10 design package | `COMPLETE` / `PO APPROVED` |
| `APP10-A01` | Admin customer profile maintenance UI | `COMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `COMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `COMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `NEXT` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-E01 = NEXT
```

---

## P. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Approved D01 I01 design implemented | ✅ §B, §D, §E, §I |
| 2 | Zalo external CTA config-supported | ✅ §C, §D |
| 3 | Messenger external CTA config-supported | ✅ §C, §E |
| 4 | No backend endpoint added | ✅ §G, §M |
| 5 | No provider SDK/package added | ✅ §G — `package.json` unchanged |
| 6 | No chatbot / embedded chat | ✅ §G |
| 7 | No Storefront route added | ✅ §M — 12 → 12 |
| 8 | CTAs live in the approved footer area | ✅ §B |
| 9 | External-handoff meaning is clear | ✅ §D — visible caption on every CTA |
| 10 | Missing one config omits only that channel | ✅ §C, §J |
| 11 | Missing both omits the group | ✅ §C, §J |
| 12 | Malformed URL never rendered | ✅ §C, §J — 8 malformed cases |
| 13 | Existing footer remains functional | ✅ §H |
| 14 | Desktop matches the approved design | ✅ §I |
| 15 | Mobile matches the approved design | ✅ §I |
| 16 | Links are accessible | ✅ §I |
| 17 | No secret/token/internal UUID appended | ✅ §F, §I |
| 18 | No raw customer e-mail/phone appended | ✅ §F |
| 19 | Context limited to a public display reference | ✅ §F — none used |
| 20 | Plain links used where safe context is unavailable | ✅ §F |
| 21 | No OpenAPI/client/database/worker change | ✅ §M |
| 22 | Historical "no social links" assertion narrowed | ✅ §H |
| 23 | Focused change-impact tests pass | ✅ §J — 43/43 |
| 24 | Full Storefront suite not run | ✅ §J |
| 25 | Full monorepo tests not run | ✅ §J |
| 26 | Full E2E not run | ✅ §J |
| 27 | File-size limits satisfied | ✅ §L |
| 28 | Roadmap updated | ✅ §O |
| 29 | Completion report exists | ✅ this file |
| 30 | `PO_DECISION_REQUIRED = NONE` | ✅ §A |
| 31 | `APP10-E01 = NEXT` | ✅ §O |
