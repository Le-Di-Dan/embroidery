# APP3-E01-C1 — the upload → Session revision → autosave seam: completion report

## A. The blocker this corrects

`APP3-E01` reported one customer-visible defect and blocked closure on it:

```text
FU-APP3-UPLOAD-REVISION-SEAM-01 = OPEN — BLOCKS_X01
```

An image upload left the customer's next save in conflict. `APP3-B06B` advances
the Session revision as part of the upload and returns the new one; `APP3-S06`
kept it for its own next upload and never handed it to `APP3-S10`, whose
`serverRevision` still held the pre-upload value. The save that followed was a
stale write, the server refused it `409`, and a customer with **one tab open**
was shown "Xung đột" for a conflict with nobody.

## B. What changed

| File | Change |
| --- | --- |
| `.../hooks/use-studio-session-revision.ts` | **new** — the Studio's one Session-revision authority |
| `.../hooks/use-studio-image.ts` | reports the upload's revision to it; its two private copies removed |
| `.../hooks/use-studio-autosave.ts` | reads and reports to it; its private `serverRevision` ref removed |
| `.../components/studio-stage-screen.tsx` | creates the authority once and hands it to both capabilities |
| `test/components/studio-upload-revision-seam.test.tsx` | **new** — 10 cross-capability cases |
| `tools/smoke-app3-e01-c1.mjs` | **new** — the one browser proof |
| `tools/check-app3-e01{,.sources,.test}.mjs` | the seam rule, its 8 mutation cases, and the disposition change |
| `docs/implementation/phases/APP3-…-STUDIO.md`, `SCOPED_COMMAND_INDEX.md` | status, follow-up disposition, two command rows |

No backend, worker, database, OpenAPI, generated-client or `.env` change.

## C. Impact map

```text
CHANGED_FILES              4 storefront source files (1 new), 1 focused suite,
                           1 browser proof, 3 gate files, 2 documents
DIRECT_RUNTIME_DEPENDENTS  StudioStageScreen and the two capability hooks it owns
DIRECT_TEST_DEPENDENTS     every suite that renders StudioStageScreen (35 suites)
CONTRACTS_TOUCHED          none — no request or response shape changed
PACKAGES_TOUCHED           @embroidery/storefront only
REQUIRED_VALIDATION        the seam suite, the 35 studio suites, storefront
                           typecheck, changed-file lint/format, the E01 gate and
                           its mutation tests, one browser journey
REUSED_ACCEPTED_EVIDENCE   §H
EXPLICITLY_SKIPPED         §I
```

## D. The revision authority, before and after

**Before.** Two capabilities, two private copies of the same server fact, both
seeded from the bootstrap snapshot:

```text
snapshot.revision ──→ use-studio-image     : localRevision  (advanced by uploads)
                  └─→ use-studio-autosave  : serverRevision (advanced by saves)
```

Neither told the other, and both `APP3-B08` and `APP3-B06B` are compare-and-set
on the same number — so whichever mutated second presented a superseded revision
and was refused.

**After.** One owner, created above the tier that swaps panels:

```text
snapshot.(sessionId, revision) ──→ useStudioSessionRevision
                                      read()   → both capabilities compose with it
                                      adopt()  ← both report every authoritative
                                                 revision a response carried
```

Three properties, each asserted by the gate and by a test:

- **Never computed.** Only a number a response reported is ever presented; there
  is no `revision + 1` anywhere in the feature.
- **Monotonic.** An older answer landing after a newer one cannot lower it.
- **Owned by its Session.** An adoption names the Session it was measured
  against, so a response for a Session the customer has left is ignored.

And one property that comes from the *shape* rather than from a rule: the
authority is a ref, so adopting a revision renders nothing. It therefore cannot
mark the document clean, clear the `APP3-S08` past, replace the working document
or arm a save — §6's four prohibitions are true by construction rather than by
care. The document becomes dirty when the image element is inserted, through the
ordinary `APP3-S03` commit seam.

## E. The race, ruled

The adjacent case is real: an autosave can be in flight when an upload returns a
newer revision. It is ruled rather than engineered around.

The server serialises two compare-and-set mutations and refuses the loser, and
both capabilities already handle that refusal — `APP3-S10` reconciles, `APP3-S06`
reports a retryable refusal. The only rule the frontend owes is that its
authority never moves backward when the older response lands last, which is the
monotonic `adopt` and is proved by *"never moves the revision backward when an
older answer lands last"*. No queue, no framework, and no change to the backend
one-in-flight policy.

## F. Focused tests

`studio-upload-revision-seam.test.tsx` — 10 cases, all passing, driving the real
`StudioStageScreen` through the real file input and the real autosave loop on a
fake clock. Cross-capability by construction: the `APP3-S06` and `APP3-S10`
suites each proved their own half and both passed while the customer's save was
being refused.

The four cases that pin the handoff were run against the **unfixed** code first
and fail there; two further cases fail when the save side of the handoff is
removed. A test that has never failed for the reason it exists is a test that has
proved nothing.

```text
neutralised: use-studio-image no longer adopts   → 4 failed / 6 passed
neutralised: use-studio-autosave no longer adopts → 2 failed / 8 passed
restored                                          → 10 passed
```

## G. The one real browser proof

`node tools/smoke-app3-e01-c1.mjs desktop`, on the running topology, one
anonymous Session inside the `IMP-D043` PO-07 limits:

```text
APP3-E01-C1 — upload → revision → autosave → reload
  ok  the upload reached the stage (B06B → worker → S06) — 2 image elements
  ok  the save that follows an upload is not a conflict — Đã lưu lúc 20:41
  ok  the save presented the revision the upload returned — upload -> 1, save presented 1
  ok  the server accepted it — PUT /document -> 200, revision 2
  ok  the reloaded Session holds the uploaded image — resume revision 2, 2 image elements
  ok  its bytes are served by the private route (APP3-B06C) — 2 editor-preview reads answered 200
  6/6 held
```

The numbers §9 asks for, read off the wire rather than out of application state
(the defect was a client believing a superseded revision, so the client is the
wrong witness):

| | |
| --- | --- |
| upload response revision | `1` |
| autosave `expectedRevision` | `1` — the upload's, not the bootstrap's `0` |
| autosave HTTP status | `200` (was `409`) |
| autosave response revision | `2` |
| save chip | `Đã lưu lúc 20:41` (was `Xung đột`) |
| after reload | resume revision `2`, the uploaded image present, served by `APP3-B06C` |

The API's own request log for the run is the same chain from the other side:
`POST /assets 202` → status polls → **`PUT /document 200`** → `POST /resume 200`
→ `GET …/editor-preview 200`.

No credential, cookie value or storage key appears in the run's output.

## H. Reused `APP3-E01` evidence

Not rerun, because this correction changes none of the source that produced it:
the `X-Forwarded-For` trusted-hop fix and its 68/68 auth tests, fixture
idempotency, the `S10` retry `EXPECTED_BY_STATE_MACHINE` finding, the `S11`
benchmark, the Chromium/WebKit transform-budget measurements, `B05`/`B05A`
Template delivery, the worker inspection and normalization evidence, `B06C`
security and non-disclosure, the 390 touch implementation, the responsive shell,
and every unrelated held `APP3-E01` fact.

## I. Explicitly skipped

`VALIDATION_MODE = IMPACT_BASED`. Not run, and not needed: the full two-run
`APP3-E01` journey, the Admin and Template publication journeys, the live
`X-Forwarded-For` bypass probe, the `S11` mobile journey and benchmark, both
transform benchmarks, the two-tab conflict and expiry journeys, the
fixture-idempotency cycle, the full Storefront suite, the API, worker and
database suites, the Figma gate, and the APP3 predecessor gates.

Run instead, because the changed screen is their common dependency: the 35
suites that render it (**758 tests, 6.4 s**).

## J. Gate evidence

```text
node tools/check-app3-e01.mjs                     PASS
node --test tools/check-app3-e01.test.mjs         32/32 (24 + 8 new)
pnpm --filter @embroidery/storefront test -- studio-upload-revision-seam   10/10
pnpm --filter @embroidery/storefront test -- studio                        758/758, 35 suites
pnpm --filter @embroidery/storefront typecheck    PASS
npx eslint <changed files>                        clean
npx prettier --check <changed files>              PASS after --write
git diff --check                                  clean
node tools/smoke-app3-e01-c1.mjs desktop          6/6
```

The new gate rule asserts ownership rather than a call: one authority, both
capabilities reading and reporting to it, neither holding a private copy, the
monotonic and Session-owned guards present, and the cross-capability proof still
naming what it proves. Its eight mutation cases each restore one piece of the
defect and require the rule to fail.

**One of them found a real hole in the gate.** Downgrading the finding's current
line so that it no longer names the checkpoint made the line *invisible* to the
`currentLine` helper, which then fell back to the superseded row above — still
reading `BLOCKS_X01`, still green. For the one finding that decides whether a
phase may close, the current word is now simply the last row written about it.

## K. Contract immutability

Unchanged and asserted by the gate: **37 paths / 42 operations / 84 schemas**,
**34 migrations**, **30 root scripts**. No generated-client regeneration.

## L. Follow-up disposition

```text
FU-APP3-UPLOAD-REVISION-SEAM-01        = COMPLETE — CLOSED_BY_APP3-E01-C1
FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01 = OPEN — NONBLOCKING      (carried)
FU-APP3-WORKER-BOOT-ORDER-01           = OPEN — NONBLOCKING          (carried)
FU-APP3-TRANSFORM-BUDGET-01            = OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT
FU-APP3-STUDIO-TOOL-RAIL-01            = OPEN — NONBLOCKING          (carried)
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = DEFERRED_LATER_APP3        (carried)
```

None of the carried follow-ups was opportunistically touched.

## M. Commit A

```text
daa353f  fix(storefront): hand off upload session revision
```

## N. Tree and remote

Nothing pushed, nothing amended, squashed or rebased. The development
environment is restored: fixtures reverted (the product is back to `DRAFT`), the
Session origin allow-list restored to tracked configuration, and zero hop
containers left running.

## O. Handoff to `APP3-X01`

```text
APP3-E01-C1 = COMPLETE — REVIEW_DELIVERED
APP3-E01    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-X01    = BLOCKED_BY_APP3-E01-C1_REVIEW_ACCEPTANCE
```

`APP3-X01` is not started and must not be until this correction is accepted.

## P. Disclosed limits

- **Two runs of the `APP3-E01` upload journey were spent before the proof.** The
  storefront dev container's file watcher does not see changes through the
  Windows bind mount, so the first runs measured a stale bundle and reported the
  defect intact. The container must be restarted for a source change to reach a
  browser. Recorded here because a run that measures the wrong build is
  indistinguishable from a fix that did not work.
- **The `APP3-E01` upload journey still reports 4 failures** when run whole. One
  is the carried `FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01`; the seam fact it
  exists for now **holds** (`Đã lưu`). The other three are that journey's
  assertions about a terminal status sentence and a post-reload `href`, which
  read empty in the current environment while the API log and this correction's
  own proof show the same chain succeeding. They belong to `APP3-E01`'s harness
  rather than to this correction, and rerunning that journey is outside
  `VALIDATION_MODE = IMPACT_BASED`.
- **Three published `S03` benchmark Templates left over from an earlier bench run**
  sorted ahead of the journey's Template and pushed it off the picker's first
  page. Reverted with their own fixture command; no manual SQL.
