# APP3-S10 — Completion report

**Checkpoint:** `APP3-S10` — Studio autosave / conflict / resume / expiry UI,
including the autosave **cadence**, and the bounded `APP3-S08` carry-forward
shell reconciliation the operator routed here
**Status:** `COMPLETE — REVIEW_DELIVERED`
**Commit A:** `ccf15f7` `feat(storefront): add Studio autosave recovery UX`
**Branch:** `production` · nothing pushed

---

## A. Entry, and the ruling that closed `APP3-S08`

Recorded before any source edit:

```text
APP3-S08-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S08    = COMPLETE — REVIEW_ACCEPTED
APP3-S10    = READY — NOT STARTED
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT     = APP3-S10
S08_CARRY_FORWARD_RECONCILIATION_OWNER   = APP3-S10
```

No `APP3-S08-C2`, `APP3-S08-MI01`, `APP3-S10-PRE` or `APP3-S10-G01` was created,
and no S08 completion report was rewritten. The one S08 item that was
mechanically necessary to finish this capability — a topbar region that exists at
every tier — was done **inside** S10 and is disclosed in §Z.

## B. Entry world, unchanged where it had to be

37 paths / 42 operations / 84 schemas, 34 migrations, 30 root scripts, at entry
and at exit. `APP3-S10` adds no HTTP operation, no migration, no dependency and
no root script. OpenAPI was not regenerated and the client was not regenerated;
both were **verified** instead (§Y).

## C. The six approved design rows

Section 14 (`596:20`) of page `APP_03` in `BQwqV8GdfUIELvsQDB1UQE`. All six were
`REVIEW_REQUIRED` at entry and exactly six were promoted:

| row | node |
| --- | --- |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED` | `610:3` |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-SAVING` | `610:41` |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-OFFLINE` | `610:77` |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-CONFLICT` | `610:118` |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-RESUME` | `610:159` |
| `FIG-STUDIO-AUTOSAVE-DESKTOP-EXPIRED` | `610:201` |

The six `APP3-S11` mobile rows stay unapproved. No Figma file was mutated. The
1024 tier resolves `FIG-STUDIO-EDITING-TABLET-1024` = `618:140`.
`node tools/check-figma-design-index.mjs` passes.

## D. Ownership

`AUTOSAVE_UI_OWNER = APP3-S10`, `AUTOSAVE_CADENCE_OWNER = APP3-S10`,
`MOBILE_TOUCH_OWNER = APP3-S11`. The roadmap's correction of the cadence owner
away from S11 stands; nothing moved back.

## E. The cadence, and why it is a pair

```text
saveDelayFor(streak, now) = max(0, min(streak.last + 2500, streak.since + 10000) - now)
```

The debounce alone is not enough: a customer dragging for a minute never produces
2500 ms of quiet, and every frame of that minute would be unsaved. The ceiling is
measured from the **first** dirty mutation, not the last, so more editing cannot
push it forward. Worst case is one save per 10 s — 6/minute against the
`IMP-D043` PO-07 ceiling of 30.

The gate asserts both constants **and** that the ceiling participates: a constant
nothing reads is a comment.

## F. One request in flight

A save owns everything dirty up to the instant it starts (`streak.current = null`
at the start of `runSave`). An edit arriving during it begins a *new* streak,
which is exactly what stops a successful response being read as "everything is
saved". No `setInterval`, `requestIdleCallback`, `navigator.serviceWorker`,
`sendBeacon` or `keepalive` exists anywhere in the feature, and no save is fired
from `beforeunload` — the unload handler only calls `preventDefault()`.

## G. The revision is always the server's

`expectedRevision` is always a revision read from a response. `revision + 1`,
`revision++` and `revision += 1` are each asserted **absent from the whole
feature**, not merely absent from the controller: the arithmetic that must not
exist is the one that shows up the first time two tabs race.

## H. A response answers for what it was given

The in-flight record carries `submitted` and `expectedRevision`. On success, if a
newer local streak exists the response does **not** touch the document — the
newer edits stay on screen and the next save carries them. If nothing newer
exists, the server's canonical form is adopted through `reconcile`, a
server-origin seam that records no history entry, because the customer did
nothing there.

## I. Two counters, because identity is not enough

`documentSerial` and `serverSerial`. A server-origin write stamps both equal, so
the autosave effect can tell "the newest write is a save response, a resume or a
bootstrap" from "the customer changed something". Document identity alone cannot:
a resume that returns the same document is not an edit, and a key-guarded
`initialize` would have silently ignored it.

## J. Ambiguity is the absence of a status

`normalizeApiClientError` sets `httpStatus` only when a response arrived. A
timeout, a reset connection and an offline radio are indistinguishable from a
lost response, so all of them classify as `'ambiguous'` — and an ambiguous
outcome may never be replayed blindly, because the PUT may already have landed.

## K. Reconcile once, then decide

A `409` and an ambiguous outcome both read the latest Session state **exactly
once** before anything is decided. From that read: the submitted document present
at a higher revision is "it saved, only the answer was lost"; the base revision
unchanged is "nothing was written", and only now is offering the same document
again safe; anything else is a conflict.

Proved in a real browser: every failed attempt in the network trace is followed
by exactly one `POST …/resume` and never by a bare repeat (§AA).

## L. The conflict has exactly two choices

`610:118` authorizes `Tải bản mới nhất` and `Giữ bản trên màn hình`. Load-latest
adopts the server document **and** resets the past that described the abandoned
branch — keeping it would let one undo resurrect a design the customer
explicitly replaced. Keep-local preserves both and performs one user-initiated
save against the revision the server actually holds. No third button, no merge,
no automatic resolution, and a second `409` re-enters the same decision instead
of looping.

## M. The bounded ladder

`[5000, 15000]`, then `ERROR_PAUSED`, then nothing until the customer presses
`Thử lưu lại` or makes a new edit. `Tiếp tục thiết kế` dismisses the *message*
and never the truth: state, failure and navigation warning are untouched and
nothing is marked saved. A new edit re-arms the ladder, so a spent one from a
network blip cannot leave the rest of a session permanently unsaved.

## N. The error taxonomy is status-only

401 expired · 403 refused · 409 conflict · 413/422 rejected · 429 throttled ·
5xx server · no response ambiguous. No message text is branched on, and no
backend internal reaches a customer.

## O. Expiry promises nothing

A `401` clears the matching handle, stops autosave and shows `610:201`. No TTL is
extended from the browser, no `document.cookie` is scanned — the secret is
`HttpOnly` and this code cannot read it even in principle — and nothing claims
the old Session is recoverable.

## P. The resume handle

One `localStorage` key, namespaced by product slug, Side code and Area code:

```text
embroidery.studio.session:a03-live-check-redirect:kkkk:chest → 019ff9a2-…-69b37c06e146
```

The entire value is the Session id. Forbidden and asserted absent: the raw
secret, a cookie value, a hash of the secret, the Design Document, the revision,
`expiresAt` as authority, asset bytes and any customer identity. The value is
re-validated against the id shape on **read and write**, because browser storage
is writable by anything on the origin. Exactly one module touches storage; the
gate proves a second file cannot.

## Q. Resumed geometry

`APP3-B07` omits `scope` on resume, so a Session reopened after a full reload has
no geometry to draw from. Every field of `DesignSessionScopeResponse` is
published verbatim by the public placement manifest `APP3-S01` already holds, and
each is **copied** — nothing computed, scaled or defaulted — for the exact
placement the handle was written under. Recorded as
`RESUMED_SCOPE = PUBLIC_PLACEMENT_MANIFEST_FOR_THE_HANDLE_NAMESPACE`.

## R. History resets only on branch replacement

An accepted resume and a load-latest resolution reset the `APP3-S08` past,
because it described a branch that no longer leads to what is on screen. A
canonicalized save response does not. Undo and redo are ordinary document
mutations and are autosaved on the same cadence.

## S. The shell at 1024 — the carry-forward

The `.studio-stage__topbar` wrapper moved out of `StudioTextDrawer` into a
frame-level `StudioStageTopbar`. One wrapper element relocated: the trigger's
markup, state, label and behaviour are unchanged, and no `S02`–`S09` control was
moved, renamed or restyled. The topbar stays deliberately **unpositioned** so the
absolutely-positioned drawer still resolves against `.studio-stage__frame`.

Measured in a real browser at 1024: exactly one topbar, one
`.studio-history-rail` with 48×48 controls, one `.studio-drawer` and one
`.studio-stage__frame`; the drawer is `position: absolute` and the stage rect is
identical before and after it opens — it does not push the stage.

## T. 390

The save chip renders, because a customer whose work is unsaved must be told. No
bottom sheet, no mobile toolbar, no touch gesture and no editing surface;
`APP3-S11` still owns every one of them. Zero elements matching a mobile-sheet
selector, and no horizontal overflow.

## U. Two disclosed copy deviations

1. `610:118` draws a `409 · xung đột bản sửa` eyebrow. A status code is a backend
   internal, so the heading carries the meaning and the code is not shown.
2. `610:77` names the connection, which is only true when the connection failed.
   A refused, throttled or broken save keeps the same shape with the cause left
   unnamed rather than named wrongly.

## V. The state surface placement

The 1440 frames draw the save state as a right-hand panel. Two of its four states
are **decisions about losing unsaved work**; the one accepted right-hand region
at 1024 is a drawer closed by default, and 390 has no right-hand region at all.
S10 renders one always-visible region under the topbar at every tier, takes focus
on entry, and discloses this as
`STATE_SURFACE_PLACEMENT = UNDER_THE_TOPBAR_AT_EVERY_TIER` rather than taking it
quietly.

## W. Tests

| suite | count |
| --- | --- |
| `test/unit/studio-autosave-model.test.ts` | 23 |
| `test/components/studio-autosave.test.tsx` | 22 |
| `test/components/studio-autosave-conflict.test.tsx` | 19 |
| `test/components/studio-autosave-resume.test.tsx` | 10 |

The three component suites drive the real `StudioStageScreen` / `StudioScreen` on
a **fake clock**: the 2500 ms debounce, the 10000 ms ceiling and the
`[5000, 15000]` ladder are proved by advancing time. No test sleeps 2.5 s or
10 s in real time, and no rate window is ever exercised for real.

Full storefront regression: **55 suites / 942 tests pass**.

## X. Checker and mutations

`tools/check-app3-s10.mjs` (+ `-runtime`, `.sources`) and
`tools/check-app3-s10.test.mjs` — **70 pass / 0 fail**. Every load-bearing rule
is proved to fail when the thing it protects is removed: a silently changed
cadence, an interval, a second in-flight request, a computed revision, an ignored
response revision, a blindly retried `409`, a replayed lost response, an
overwritten newer local edit, an auto-merge, a third conflict choice, a document
or secret written to storage, a stripped placement namespace, a read cookie, a
kept stale history branch, an autosave recorded as a history entry, an
`APP3-S11` mobile control, a manual Axios route and a changed API surface.

Four registered commands, no root script: `CMD-CHECK-APP3-S10`,
`CMD-TEST-APP3-S10`, `CMD-TEST-APP3-S10-STOREFRONT`, `CMD-BROWSER-APP3-S10`. The
checker does not read the completion report.

Three rules had to be rewritten during the build because they would have passed
while asserting nothing:

- `/adoptServerBranch[\s\S]{0,400}history: EMPTY_HISTORY/` matched the **interface
  declaration** a few lines above the store's own initial `history:
  EMPTY_HISTORY`. Re-anchored on the implementation signature.
- A rule keyed on the word `autosave` fired on `import { useStudioAutosave }`.
  Replaced with mechanical needles (`publicDesignSessionAutosave`,
  `saveSessionDocument(`, `attemptSave(`, `setInterval(`).
- `/beforeunload[\s\S]{0,300}(save|Save|autosave)/` fired on the name of the hook
  it was protecting. Replaced with request-shaped needles.

## Y. Predecessor-gate evolution

All nine predecessor gates were evolved `PRE_S10 → S10_DELIVERED` — narrowed on
`isS10Delivered(rootDir)` and `S10_FILES`, never deleted. All nine pass.

Their mutation suites report six failures. **These were measured at HEAD
(`21c6b82`) first**, in a scratch `git worktree`, before any of them was
attributed to this checkpoint: s02 ×3, s03 ×1, s05 ×1, s07 ×1 — mutations whose
target world has moved on (a later checkpoint recorded complete, a changed
OpenAPI surface, a superseded shortcut). The worktree was removed. No mutation
was deleted or weakened to make a suite green.

## Z. Contract immutability

```text
pnpm --filter @embroidery/api openapi:check          → up to date, 37/42/84
pnpm --filter @embroidery/api-client check:generated → up to date (c2fb229f…)
```

`publicDesignSessionAutosave` and `AutosaveDesignSessionBody` crossed the curated
client boundary on exactly the terms the withholding stated, and the release is
commented with that condition. One documented structural cast remains, at the
`DesignDocument` → generated-body seam.

## AA. Browser proof — journeys A–F

Development stack over the `APP3-S01` trustworthy origin, real anonymous
Sessions, **two for the entire run** against the PO-07 cap of five per hour per
IP. No API restart, no counter cleared, no real rate-window sleep.

- **A — cadence.** One typing burst → `Chưa lưu` at +0.27 s → one `PUT` `200` at
  +2.64 s → `Đã lưu lúc 12:40` from a real response. **One write for the whole
  burst.**
- **B — edit during an in-flight save.** The edit landed while `Đang lưu…` was on
  screen, survived the response, produced a second `PUT`, and the row ended at
  `autosave_revision` 3 holding the newer text.
- **C — a genuine two-tab 409.** `PUT 409` → exactly one `POST …/resume` →
  `Xung đột` with exactly the two authorized actions and the server unwritten.
  Load-latest replaced the stage with the server's document and left `Hoàn tác`
  disabled. A second `409` resolved with keep-local preserved document *and*
  history and wrote once, landing `autosave_revision` 6.
- **D — transport failure.** `net::ERR_CONNECTION_RESET` → `Mất kết nối`; each
  failed attempt followed by exactly one reconciliation read; ladder gaps
  measured at **+5.03 s** and **+15.04 s**, then silence for the remaining 9 s,
  ending on the `ERROR_PAUSED` surface. `Thử lưu lại` with the network restored
  saved immediately.
- **E — resume.** A full reload offered `Khôi phục phiên` from the one namespaced
  key; `Tiếp tục` resumed and drew the placement; `Bắt đầu lại` cleared the key.
- **F — expiry.** A Session invalidated server-side produced one `PUT 401` →
  `610:201`, no retry, **no reconciliation read** (an expiry is decisive), and
  the handle cleared.

## AB. One disclosed observation

When a failing streak begins with a **customer edit** rather than a pressed
`Thử lưu lại`, the run measured one extra attempt one debounce (~2.5 s) after the
first failure, before the locked ladder ran from the second: attempts at +2.53 s,
+5.10 s, +10.13 s, +25.17 s, then stop. Both properties §16 requires still hold —
bounded, and it stops — and the extra attempt is reconciled like every other.

The mechanism was **not isolated** inside this checkpoint, and the fake-clock unit
suites (which have no live streak at the moment of failure) do not reproduce it.
It is carried as `FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01` rather than explained away
with a guess. Measured, not inferred.

## AC. Files

12 new production modules (model ×4, hooks ×3, service ×1, components ×4), 9
modified production files, 5 new test files, 8 modified test files, 4 new tools,
17 modified tools, 3 modified documents. Commit A: **78 files**.

Every file is inside its limit: `use-studio-autosave.ts` 400,
`studio-stage-screen.tsx` 398, `studio-document.store.ts` 340,
`studio-text-responsive.test.tsx` 596.

## AD. Command ledger

Kept at `.git/app3-s10-finish-state.md` (untracked by design). One environment
finding worth recording: `pnpm run format` reformatted `use-studio-autosave.ts`
to 403 lines and **broke the 400-line rule the S06 and S10 gates enforce**.
Formatting is not a neutral step for a file at its limit. Fixed by compressing
three comment blocks and hoisting the save delay out of the `setTimeout`
argument list; no behaviour changed.

A second finding: `smoke-app3-s01-fixtures.mjs seed` after a `revert` leaves the
14 Templates `ARCHIVED` — every insert is `on conflict (id) do nothing` while
`revert` archives rather than deletes. That is
`FU-APP3-S01-FIXTURE-IDEMPOTENCY-01`, carried **open**; the run restored the rows
with one direct `update design_templates set status='PUBLISHED'` on the fixture
ids. Development fixture state only; no tracked file changed.

## AE. A process deviation, disclosed

Commit A was first created with a mangled message: a PowerShell here-string was
passed to the Bash tool, which expanded part of the body and prefixed the subject
with `@`. It was undone with `git reset --soft HEAD~1` — not `amend`, not
`squash`, not `rebase` — and re-created from a message file as `ccf15f7`. The
result is exactly the two-commit structure §37 requires. Nothing was pushed at
any point.

## AF. Follow-ups

```text
FU-APP3-TRANSFORM-BUDGET-01              = OPEN (unchanged, not bisected)
FU-APP3-S01-FIXTURE-IDEMPOTENCY-01       = OPEN (unchanged, confirmed again)
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01  = OPEN (unchanged, still unowned)
FU-APP3-STUDIO-TOOL-RAIL-01              = STILL OPEN — S10 moved the topbar
                                           wrapper, not the S05/S06 tools
FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01       = NEW — OPEN — NONBLOCKING
```

## AG. Performance

The dirty streak, the in-flight save, the retry attempt and the server revision
are **refs, not state**, so a gesture committing the working document every
pointer frame re-renders nothing for autosave; only a state *transition* renders.
Evidenced end-to-end by journey A: a full typing burst produced exactly one
request. No new benchmark was run, and `FU-APP3-TRANSFORM-BUDGET-01` stays open
and un-bisected.

## AH. Not run, deliberately

`pnpm quality` (deleted by `GOV-Q01`), `pnpm install`, the API / worker /
database suites, OpenAPI generation, client generation, the full repository E2E
run, anything `APP3-S11`, any Figma mutation, a transform-budget bisect, and any
real-time rate-limit sleep. No `.env` was written; no credential was read,
logged, echoed or rotated; tests use synthetic values only.

## AI. Status and tree

```text
APP3-S10 = COMPLETE — REVIEW_DELIVERED
APP3-S11 = BLOCKED_BY_APP3-S10_REVIEW_ACCEPTANCE_FOR_PRACTICAL_SEQUENCE
```

After human acceptance, `APP3-S10 = COMPLETE — REVIEW_ACCEPTED` and
`APP3-S11 = READY — NOT STARTED`.

Branch `production`; Commit A immediately precedes Commit B; nothing pushed. The
development environment was restored: the trustworthy-origin helper reverted to
tracked configuration and the two proof Sessions are the only rows the run
created beyond fixture state.

**Not self-accepted.**
