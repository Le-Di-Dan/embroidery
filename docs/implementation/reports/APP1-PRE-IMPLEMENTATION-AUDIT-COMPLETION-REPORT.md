# APP1 — Pre-Implementation Audit — Completion Report

Checkpoint `APP1-AUDIT — Pre-implementation audit and checkpoint specification`.
Documentation and planning only; no implementation. **Verdict: `PASS`.**

## A. Preflight and APP0 revalidation

- **Initial HEAD `945aae3`** (`docs(app0): record final closure evidence`), branch
  `production`, working tree clean, nothing pushed.
- APP0-X01 chain read from Git: **Commit A `af4b569`** (`docs(app0): close
  application delivery foundation`), **Commit B `945aae3`** (evidence + report).
- Report present: `reports/APP0-X01-COMPLETION-REPORT.md`. APP0 = `COMPLETE`
  (`PASS_WITH_FOLLOW_UPS`); APP1 = `READY_FOR_ENGINEERING`, not started; no APP1
  implementation exists (only APP0 placeholder shells).
- Browser-free gates re-run at HEAD and again post-Commit-A: `pnpm quality` = 0,
  `pnpm check:e2e` = 0, `pnpm check:openapi` = 0, `pnpm check:api-client` = 0.
  `pnpm quality:e2e` not re-run (browser cost); X01 §E proved it, this docs-only
  audit revalidated the browser-free set. **`APP0_CLOSURE_REVALIDATION = PASS`.**

## B. Canonical APP1 scope

- **Actors:** single **ADMIN** operator + **ANONYMOUS** storefront visitor.
  Customer identity is APP4 (out of scope).
- **Apps:** Admin (login + authenticated shell) and Storefront (public shell),
  Admin leading by one capability (IMP-D007).
- **Authorization:** binary **authenticated-admin vs anonymous**. REQ-IDN-001
  locks *one active admin, no role matrix* (BR-016, D-018) — **no permission
  matrix is built**.
- **Session:** issue on login, hashed-token lookup, expiry-on-read, revoke on
  logout, revoke-all on lock/disable. **Audit:** login/logout/failure on
  `audit_events` via the `bindActor()` seam. **Worker:** none. **Migration:** none.
- **Non-scope:** customer flows, any role/permission matrix, feature surfaces/nav,
  MFA/OTP delivery, password reset unless `APP1-DEC-AUTH` rules it in.

## C. Design classification

**`SUPPLEMENT`** — **`NEW`** Admin login + authenticated shell (no existing Figma
artifact), **`REUSE`** approved Storefront foundation for the public shell. One
phase-level design package `APP1-D01` (IMP-D003) gates admin frontend checkpoints.
No visual design produced here.

## D. Current implementation and gaps

- **Reusable:** identity schema (`admin_accounts`/`admin_credentials`/
  `admin_sessions`) + wired Drizzle repositories (`apps/api/src/modules/identity`);
  `audit_events` + audit module; `bindActor()`/`AuditClock` seam; request-id
  context; envelope + safe errors; Orval generated client; T01/T02A/T02B harnesses.
- **Placeholder:** Admin and Storefront app shells (root layout + metadata +
  `main.scss` only).
- **Missing (built by APP1):** credential hashing + session-token generation
  (blocked on `APP1-DEC-AUTH`); auth use cases/controllers; authenticated-admin
  guard; validation→`errors[]` (FU-A03); login/shell UI; access E2E.

## E. Checkpoint map

`DEC-AUTH → D01 → B01 → B02 → A01 → A02 → S01 → E01 → X01` (9 checkpoints; scope,
tests, artifacts, and acceptance per phase plan §7).

| ID | Type | Endpoints/Screen | Predecessors |
|---|---|---|---|
| APP1-DEC-AUTH | decision | resolve IMP-O001/DEC-29 (hashing, session, cookie/CSRF, rate-limit, bootstrap) | APP0 |
| APP1-D01 | design | login + admin shell + storefront reuse map (one package) | APP0 |
| APP1-B01 | backend | `login`, `logout` (2) | DEC-AUTH |
| APP1-B02 | backend | `refresh/renew`, `current-staff` + guard (≤3) | B01 |
| APP1-A01 | frontend | Admin login screen | B01, D01 |
| APP1-A02 | frontend | Admin application shell | B02, D01 |
| APP1-S01 | frontend | Storefront application shell | D01 |
| APP1-E01 | E2E | access journeys through real gateway | A02, S01 |
| APP1-X01 | closure | security/contract/UI/log audit + R0 eval + APP2 handoff | E01 |

Backend ≤3 endpoints each (IMP-D004); frontend one screen/capability (IMP-D005);
one human-review boundary each; no role/permission endpoints (REQ-IDN-001).

## F. Database, security, and open-decision position

- **Migration: none.** Identity tables + repositories exist (DB7, 78-table
  baseline). `credential_kind` stays CHECK-free until DEC-29 (DB4 COL-TBL002-02).
  A DB checkpoint appears **only if** `APP1-DEC-AUTH` selects persistent lockout
  counters (no attempt/rate-limit table exists today).
- **Locked, not reopened:** request-id/context (IMP-D020), actor/audit (IMP-D021),
  logging/redaction (IMP-D022), envelope (B03), styling (IMP-D010/D011).
- **Open (isolated):** IMP-O001/DEC-29 auth provider → `APP1-DEC-AUTH` before any
  backend code. The persisted model (`admin_sessions.token_hash` +
  `findActiveByTokenHash`) constrains it to **server-side revocable sessions**;
  stateless-JWT-only auth is excluded.

## G. APP0 follow-up routing

Activated and assigned: **FU-A03** → B01; **FU-A08** → B01 (re-check B02);
**FU-A14** → A01; **FU-A19** → D01; **FU-A20** → D01/S01. Package-boundary
**FU-A01/FU-A02/FU-A05/FU-A12** are gated on a runtime-loadable package APP1 does
not build ⇒ **remain deferred**, ownership unchanged. All other follow-ups keep
their APP2/APP3/APP12/documentation owners.

## H. Validation matrix

| Command | Exit |
|---|---|
| `pnpm quality` (pre-commit, post-commit) | 0, 0 |
| `pnpm check:openapi` | 0 |
| `pnpm check:api-client` | 0 |
| `pnpm check:e2e` | 0 |
| `git diff --check` | 0 |

Markdown links verified (the only intentionally forward link is this report,
resolved by Commit B). Decision/open-item IDs referenced (IMP-O001/DEC-29,
IMP-D004/D005/D007/D010/D011/D013/D021) are existing unique ids — none invented.
No source, dependency, manifest, or lockfile change.

## I. Acceptance matrix

| # | Criterion | Result |
|---|---|---|
| 1–2 | APP0 closure chain verified; APP0 remains COMPLETE | PASS |
| 3–5 | APP1 scope resolved; actors/apps/routes/APIs identified; non-scope explicit | PASS |
| 6 | Design classification locked (SUPPLEMENT) | PASS |
| 7 | Implementation inventory complete | PASS |
| 8 | Security requirements mapped | PASS |
| 9–10 | DB repositories/guards mapped; migration need resolved (none) | PASS |
| 11–12 | Minimum APIs (2+≤3); screens/shell capabilities defined | PASS |
| 13 | Open decision isolated into `APP1-DEC-AUTH` | PASS |
| 14 | APP0 follow-ups routed | PASS |
| 15–17 | Small map; backend ≤3 endpoints; frontend one screen | PASS |
| 18–20 | Ordering/dependencies clear; tests/artifacts defined; exit criteria defined | PASS |
| 21–22 | No implementation code; no manifest/lockfile change | PASS |
| 23–24 | Commit A docs-only; Commit B evidence-only | PASS |
| 25–27 | Report cites Commit A hash; ≤220 lines; exactly two commits | PASS |
| 28–31 | Clean tree; not pushed; APP1 NOT STARTED; only first checkpoint READY | PASS |

## J. Deviations and follow-ups

- **Phase-file name.** The brief illustrated `APP1-STAFF-ACCESS-AND-APPLICATION-
  SHELLS.md`, but the canonical existing file (referenced by the roadmap §6 and
  implementation README) is `phases/APP1-STAFF-ACCESS-AND-SHELLS.md`. It was
  **reconciled in place**; a differently-named file was **not** created (§18 "do
  not create competing files" governs over the illustrative name).
- **Reconciled contradiction (reported, not silently resolved — CLAUDE.md §2).**
  The prior plan's "authorization foundation / permission resolver" and
  "permission-aware navigation" contradict the locked single-operator model
  (REQ-IDN-001). Reconciled to a binary authenticated-admin guard + extensible
  seam; recorded in phase plan §10.
- `pnpm quality:e2e` deliberately not re-run (browser cost); browser-free gates
  revalidated. Stray-`@ ` commit-subject history from APP0 is unchanged
  (recorded in X01 §B, deliberately not rewritten).

## K. Commit A evidence

`docs(app1): audit staff access and application shells` —
**`dad1b6587d34fea88fea1a64dd8b8dd9a2ff0fb8`** (2 files, +313 / −46).

```text
docs/implementation/audits/APP1_PRE_IMPLEMENTATION_AUDIT.md
docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md
```

No app, package, tool, database, infrastructure, manifest, or lockfile change.

## L. Evidence closure

- **APP1-AUDIT = COMPLETE.** APP0 remains `COMPLETE`; APP1 remains
  `READY_FOR_ENGINEERING`, **not started**.
- **`APP1-DEC-AUTH` = READY, not started**; all other APP1 checkpoints
  `NOT_STARTED`.
- **Push status: NOT PUSHED.** Commit A and Commit B are local on `production`.
- No production readiness claimed (IMP-D015, APP12). R0 is evaluated at
  `APP1-X01`, not now.
