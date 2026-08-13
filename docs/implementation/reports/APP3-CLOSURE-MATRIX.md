# APP3 — closure matrix

The canonical, mechanically-derived record of what `APP3 — Design Templates and
2D Design Studio` delivered, what it did not, and who owns what it leaves
behind. Built at `APP3-X01` from the phase plan, the accepted completion
reports and the commit graph — not from prose summarising itself.

Every commit pair below was derived from Git: the evidence commit is the one
that first added the checkpoint's completion report, and the implementation
commit is the one immediately preceding it on this branch. The two-commit
protocol makes that derivation exact rather than approximate.

## 1. Verdict

```text
APP3_VERDICT = PASS_WITH_FOLLOW_UPS
APP3_CLOSURE_CHECKPOINT = APP3-X01
APP3_BLOCKING_FOLLOW_UPS = 0
APP3_OPEN_FOLLOW_UPS = 11
NEXT_CANONICAL_PHASE = APP4 — Customer Identity, Verification, Secure Access and Notification Core
APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT
PRODUCTION_READINESS = NOT_CLAIMED — reserved for APP12 by IMP-D015
```

`PASS`, not `PASS_WITH_FOLLOW_UPS`, would require zero open follow-ups. Eleven
remain open, every one of them nonblocking and owned, so the honest verdict is
the second.

## 2. Checkpoint matrix

`Accepted` is `yes` only where human review returned acceptance. `APP3-E01` and
`APP3-E01-C1` were accepted at the `APP3-X01` entry transition recorded in §0 of
the closure prompt; `APP3-X01` itself is delivered for review by this document
and is not self-accepted.

| # | Checkpoint | Type | Final status | Accepted | Implementation | Evidence |
|---|---|---|---|---|---|---|
| 1 | `APP3-PRE-IMPLEMENTATION-AUDIT` | audit | `COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION` | yes | `6806c79` | `5c0ba1f` |
| 2 | `APP3-G01` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `1e037b4` | `74b40f7` |
| 3 | `APP3-G02` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `227c87c` | `16b08be` |
| 4 | `APP3-G03` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `9c686c9` | `414ddc9` |
| 5 | `APP3-G04` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `c185431` | `3bf5d5b` |
| 6 | `APP3-DB01` | database | `COMPLETE — REVIEW_ACCEPTED` | yes | `257bb55` | `c40e497` |
| 7 | `APP3-F01` | asset foundation | `COMPLETE — REVIEW_ACCEPTED` | yes | `8fb31d8` | `053f4a3` |
| 8 | `APP3-P01` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `0cbc591` | `c114fdc` |
| 9 | `APP3-P01-C1` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `c836c13` | `5827213` |
| 10 | `APP3-G05` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `c07f740` | `087a8dc` |
| 11 | `APP3-G05-C1` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `3e930cc` | `b030c9f` |
| 12 | `APP3-P02` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `56b57b8` | `094c904` |
| 13 | `APP3-P02-C1` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `92653dd` | `fb1dcbd` |
| 14 | `APP3-B01` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `093be57` | `6a1995b` |
| 15 | `APP3-B01-C1` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `7e64c4d` | `8f49c29` |
| 16 | `APP3-G06` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `aa5ff20` | `090282b` |
| 17 | `APP3-W01A` | worker | `COMPLETE — REVIEW_ACCEPTED` | yes | `4672491` | `2c4303d` |
| 18 | `APP3-B01N` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `2ada703` | `81859cb` |
| 19 | `APP3-G07` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `00f4e19` | `66dea76` |
| 20 | `APP3-W01B` | worker | `COMPLETE — REVIEW_ACCEPTED` | yes | `5e648e4` | `145d898` |
| 21 | `APP3-W01B-C1` | worker | `COMPLETE — REVIEW_ACCEPTED` | yes | `bdc24c9` | `64ed230` |
| 22 | `APP3-B02` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `6ce1f05` | `3974b3d` |
| 23 | `APP3-P03` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `b6bce97` | `0aed5cf` |
| 24 | `APP3-G08` | authority gate | `COMPLETE — REVIEW_ACCEPTED` | yes | `8fdbf2b` | `d3d9f1f` |
| 25 | `APP3-W01C` | worker | `COMPLETE — REVIEW_ACCEPTED` | yes | `bb54f0c` | `de9e5c7` |
| 26 | `APP3-B06A` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `f86f078` | `b1df8a8` |
| 27 | `APP3-B07` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `d9f4239` | `156054d` |
| 28 | `APP3-B06B` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `4ef78f3` | `285f23f` |
| 29 | `APP3-B06B-C1` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `d02b1d7` | `3be41af` |
| 30 | `APP3-B08` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `a7b0813` | `65b5cb7` |
| 31 | `APP3-B08-C1` | backend | `COMPLETE — REVIEW_ACCEPTED_AFTER_MANUAL_INTERVENTION` | yes | `842eddc` | `3c75d4d` |
| 32 | `APP3-P04` | platform | `COMPLETE — REVIEW_ACCEPTED` | yes | `454f572` | `7b0270d` |
| 33 | `APP3-B03` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `82db550` | `2ec2008` |
| 34 | `APP3-B03A` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `7d0efba` | `86d0458` |
| 35 | `APP3-B04` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `f17a280` | `6d532f4` |
| 36 | `APP3-B05` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `1895226` | `a60d2e7` |
| 37 | `APP3-D01` | design | `COMPLETE — REVIEW_ACCEPTED` | yes | `e7c022d` | `e73f342` |
| 38 | `APP3-D01-C1` | design | `COMPLETE — REVIEW_ACCEPTED` | yes | `b831a22` | `39840f0` |
| 39 | `APP3-A01` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `672f7f2` | `284a234` |
| 40 | `APP3-B02A` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `45a8a68` | `e246806` |
| 41 | `APP3-A01-C1` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `2f86ad1` | `84b4dd1` |
| 42 | `APP3-A02` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `b8e778a` | `1614408` |
| 43 | `APP3-A03` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `d81aec7` | `b4a6299` |
| 44 | `APP3-B03B` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `8021bc2` | `c6a1f10` |
| 45 | `APP3-A03-C1` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `277ac7b` | `ea44048` |
| 46 | `APP3-B04A` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `1575dcc` | `767be5a` |
| 47 | `APP3-A04` | admin | `COMPLETE — REVIEW_ACCEPTED` | yes | `78986de` | `8bc0107` |
| 48 | `APP3-B05A` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `b7eb10d` | `72827ad` |
| 49 | `APP3-S01` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `014ccda` | `1a54302` |
| 50 | `APP3-S01-C1` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `86edc30` | `de0bf37` |
| 51 | `APP3-S02` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `3080073` | `6a82828` |
| 52 | `APP3-S07` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `5ab774f` | `471738e` |
| 53 | `APP3-S03` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `a7459c1` | `c46d56e` |
| 54 | `APP3-S03-C1` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `cfe3659` | `fe1e9bf` |
| 55 | `APP3-S05` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `7f5611b` | `bbf7b85` |
| 56 | `APP3-S05-C1` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `37ba103` | `b8a3fd8` |
| 57 | `APP3-S05-MI01` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `f8b269d` | `d89ba47` |
| 58 | `APP3-B06C` | backend | `COMPLETE — REVIEW_ACCEPTED` | yes | `f027211` | `dba934a` |
| 59 | `APP3-S06` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `b510806` | `04cbdb3` |
| 60 | `APP3-S06-C1` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `4766447` | `b460b32` |
| 61 | `APP3-S04` | storefront | `COMPLETE — REVIEW_ACCEPTED — GROUP_DEFERRED_BY_AUTHORITY` | yes | `46ad62f` | `33a5430` |
| 62 | `APP3-S09` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `6344a72` | `d122ab6` |
| 63 | `APP3-S08` | storefront | `COMPLETE — REVIEW_ACCEPTED — CORRECTED_BY_APP3-S08-C1` | yes | `06988fb` | `f5d0818` |
| 64 | `APP3-S08-C1` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `e509373` | `21c6b82` |
| 65 | `APP3-S10` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `ccf15f7` | `c06f2fb` |
| 66 | `APP3-S11` | storefront | `COMPLETE — REVIEW_ACCEPTED` | yes | `9433693` | `d677340` |
| 67 | `APP3-E01` | cross-layer | `COMPLETE — REVIEW_ACCEPTED` | yes | `076a7e2` | `9452826` |
| 68 | `APP3-E01-C1` | cross-layer | `COMPLETE — REVIEW_ACCEPTED` | yes | `daa353f` | `6ea9714` |

### 2.1 Checkpoints with no completion report, and why

| Checkpoint | Disposition | Evidence |
|---|---|---|
| `APP3-B06` | `REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B` | Ruled by `APP3-G08` (`IMP-D048`); never executed as one checkpoint, so it has no report to omit. |
| `APP3-W01` | `REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B` | First attempt failed and required manual intervention (`JOB_CONTRACT_INSUFFICIENT`, `SVG_SANITIZER_NOT_SELECTED`); replanned into the raster and SVG consumers. |
| `APP3-ROADMAP-RECONCILIATION` | `COMPLETE — DOCS_ONLY` | `4dbf2be` — execution-authority reconciliation, no product code, no report required. |
| `APP3-PRE-AUDIT-C1` | `COMPLETE — FOLDED_INTO_THE_AUDIT_STATUS` | `1216e98`; its outcome is the audit's own `REVIEW_ACCEPTED_AFTER_CORRECTION`. Disclosed here because a correction without its own report is exactly the kind of record a closure matrix exists to surface. |
| `APP3-X01` | `COMPLETE — DELIVERED_FOR_REVIEW` | This document plus `APP3-X01-COMPLETION-REPORT.md`; closure does not accept itself. |

## 3. Correction and intervention reconciliation

Every correction-like identifier in the phase, classified from repository truth.

| Class | Identifiers |
|---|---|
| executed + accepted (correction) | `APP3-P01-C1` `APP3-G05-C1` `APP3-P02-C1` `APP3-B01-C1` `APP3-W01B-C1` `APP3-B06B-C1` `APP3-B08-C1` `APP3-D01-C1` `APP3-A01-C1` `APP3-A03-C1` `APP3-S01-C1` `APP3-S03-C1` `APP3-S05-C1` `APP3-S06-C1` `APP3-S08-C1` `APP3-E01-C1` `APP3-PRE-AUDIT-C1` |
| executed + accepted (manual/final intervention) | `APP3-S05-MI01` — a final intervention, not a second correction; `APP3-G04` recorded intervention evidence; `APP3-B08-C1` was accepted **after** manual intervention |
| executed + superseded | none — no accepted APP3 checkpoint was later replaced. `APP3-S08` was *corrected* by `APP3-S08-C1` and stays accepted on its own surface |
| replanned before execution | `APP3-B06` → `APP3-B06A` + `APP3-B06B`; `APP3-W01` → `APP3-W01A` + `APP3-W01B` |
| cancelled / not required | `APP3-B06C-C1` — considered and **not executed** as a separate checkpoint; the work it would have owned was absorbed by `APP3-S06`, which closed `FU-APP3-B06C-SESSION-LANE-INSPECTION-01` and `FU-APP3-B06C-READ-RATE-LIMIT-01` |
| never created | `APP3-E01-C2` `APP3-X01-PRE` `APP3-X01-G01` — no row, no report, no commit |

Seventeen corrections across sixty-eight executed checkpoints. Each is one
correction of its parent; the phase never ran a second correction on the same
checkpoint.

## 4. Non-checkpoint commits in range

Between the accepted `APP2` closure `8b5f3b0` and this closure, these commits
belong to no APP3 checkpoint. Each is disclosed rather than silently counted.

| Commit | Subject | Belongs to |
|---|---|---|
| `9da79bf` `82ed3f3` `1c8370a` `b8e343e` | Figma closure baseline + next-phase chronology guard | `APP2-X01-C1` / `APP2-X01-C2` — APP2 corrections delivered inside the APP3 window |
| `d1dc9f5` | record canonical entry readiness | APP3 entry branch reconciliation |
| `1216e98` | reconcile pre-implementation audit review | `APP3-PRE-AUDIT-C1` |
| `fc31a54` `e649a6e` `c9ec088` `9d9f252` | scoped validation + root script boundary | `GOV-Q01` / `GOV-Q01-C1` governance |
| `97b63a0` `4dbf2be` | split Template draft save; reconcile roadmap authority | APP3 replanning, docs-only |
| `274ce60` | restore the `APP3-W01C` checker under its size cap | `APP3-W01C` follow-through |
| `158363a` | pass Design Session config to every `AppModule` consumer | `APP3-A01` environment follow-through |
| `2a5d3bf` | register logo system exploration | `BRD0` — unrelated brand work |
| `8a18a76` `4c6fd20` | flutter book; branch merge | unrelated to APP3 |

## 5. Follow-up inventory

Eleven open, zero blocking. Every one carries a description, an origin, the
evidence behind it, a class, a concrete owner and an activation condition.

| Follow-up | Description | Origin | Class | Owner | Activation |
|---|---|---|---|---|---|
| `FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01` | Declining a resume and opening a new Session leaves the previous `__Host-` credential in the browser (measured 2 where 1 is intended); `APP3-B07` names each cookie after its Session, so nothing clears the old one | `APP3-E01` | hygiene, nonblocking — no exploitation path found; each cookie is host-only, `Secure`, `HttpOnly` and unlocks only the Session named in it | `APP4` — owns customer identity, secure access and session lifecycle | `APP4` pre-implementation audit |
| `FU-APP3-WORKER-BOOT-ORDER-01` | The worker fail-fasts on Postgres `57P03` at boot, closes its pool and exits startup validation while the container still reports `Up` | `APP3-E01` | environment robustness, nonblocking | `APP12` — resilience, observability and runbooks | `APP12` entry audit |
| `FU-APP3-TRANSFORM-BUDGET-01` | Measured L=100 transform p95 exceeds the frozen `ADR-APP0-001` 20 ms desktop reference: Chromium move 16.7/33.4, resize 16.7/33.3, rotate 16.7/33.4; WebKit move 47/48, resize 39/48, rotate 46/48 | `APP3-S08`, investigated and attributed by `APP3-E01` | `OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT` — measured, non-security, non-correctness | `APP12` — performance | `APP12` entry audit; re-measure with `CMD-BENCH-APP3-S03` |
| `FU-APP3-STUDIO-TOOL-RAIL-01` | Figma `609:147` and `618:140` draw the text and image tools in the same persistent left rail `APP3-S08-C1` introduced for undo/redo; at 1440 and 1024 they are still panel surfaces | `APP3-S08-C1`, audited at 1440/1024/390 by `APP3-E01` | UI composition debt, nonblocking — every tool is reachable at every viewport | `APP3-S12` — the canonical `LATER_APP3` Studio capability (phase plan §6.1 row 34) | the first `LATER_APP3` Studio checkpoint |
| `FU-APP3-S04-GROUP-AUTHORITY-01` | Group and ungroup need a Product Owner ruling on the persisted group frame and pivot (`IMP-D045` PO-07/PO-12) and an approved member-selection interaction | `APP3-S04` | product/design-deferred, nonblocking — **group creation is not delivered and is not claimed** | Product Owner ruling, then a `LATER_APP3` Studio capability (`APP3-S12`/`S13`) | the ruling; no checkpoint may implement group before it |
| `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | Production Template artwork intake has no delivered path. `APP3-B03A` consumes `TEMPLATE_SOURCE` associations and `APP3-E01` sources Template bytes through fixtures, which is a harness capability and not an intake path | `APP3-A03`, restated by `APP3-S06` and `APP3-E01` | no delivered or planned phase owns Admin Template artwork upload, and this checkpoint does not invent one | `FROZEN_APP3_LIMITATION` — frozen in the APP3 handoff (§8), and deliberately not reassigned to an unrun APP3 capability | the first requirement for non-fixture Template artwork |
| `FU-APP3-A02-D01-CONTRACT-DRIFT-01` | The approved `APP3-D01` Template-list frames draw affordances the `APP3-B03` list contract cannot support — text search, a sort control, page numbers and a total — so `APP3-A02` delivered without them and design and contract disagree | `APP3-A03` (`d81aec7`), recorded as carried | design-evidence reconciliation, nonblocking; closing it needs either a contract change or a design change, and no later phase owns the Admin Template list | `FROZEN_APP3_LIMITATION` — frozen in the APP3 handoff (§8) | whichever comes first: a Template-list contract change or a `D01` frame revision |
| `FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01` | `APP3-B01`'s nullable response members reach OpenAPI as empty schemas, so the generated client types them `{ [key: string]: unknown } \| null` where the server answers `number`/`string`; absorbed in `placement-model.ts` alone | `APP3-A01` | contract weakness, nonblocking — same family as the `createZodDto` finding in `APP3-B01-C1`; the fix is in the shared `APP3-P03` Zod→OpenAPI mapping | `APP4` — the next phase publishing new contracts through the `APP3-P03` foundation | the first `APP4` contract publishing a nullable member |
| `FU-APP3-CONFLICT-CODE-CONTRACT-01` | The 409 discriminator is not published in OpenAPI, so the client transcribes `DESIGN_TEMPLATE_VERSION_CONFLICT` | `APP3-A03` | contract weakness, nonblocking | `APP4` — the next phase publishing conflict-bearing operations, and the phase that should establish the published-error-code convention | the first `APP4` operation with more than one 409 cause |
| `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` | Three integration suites importing `DesignModule` fail at module init because `DESIGN_SESSION_SECRET_PEPPER` is unset in the persistence test harness | `APP3-B04A` | test-harness configuration, nonblocking — proven pre-existing at HEAD by `git stash`, never repaired by a credential change | `APP4` — owns how Session auth configuration reaches a shared harness | `APP4` pre-implementation audit |
| `FU-APP3-G03-QUALITY-AGGREGATE-01` | Deferred aggregate-validation concern from the anonymous-session authority gate | `APP3-G03` | `DEFERRED — REGRESSION_ACTIVITY_ONLY` | an explicitly authorized release/regression plan (`VALIDATION_GOVERNANCE.md` §7) | a release or regression activity, never an ordinary checkpoint |

### 5.1 Closed during APP3

| Follow-up | Closed by |
|---|---|
| `FU-APP3-UPLOAD-REVISION-SEAM-01` | `COMPLETE — CLOSED_BY_APP3-E01-C1` |
| `FU-APP3-S01-FIXTURE-IDEMPOTENCY-01` | `COMPLETE — CLOSED_BY_APP3-E01` |
| `FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01` | `COMPLETE — CLOSED_BY_APP3-E01` (`VERDICT_EXPECTED_BY_STATE_MACHINE`) |
| `FU-APP3-S11-BENCHMARK-01` | `COMPLETE — CLOSED_BY_APP3-E01` |
| `FU-APP3-S08-DESIGN-READ-01` | `COMPLETE — CLOSED_BY_HUMAN_REVIEW_LIVE_FIGMA_READ` |
| `FU-APP3-B06C-SESSION-LANE-INSPECTION-01` | `COMPLETE — CLOSED_BY_APP3-S06` |
| `FU-APP3-B06C-READ-RATE-LIMIT-01` | `COMPLETE — CLOSED_BY_APP3-S06` |
| `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01` | `COMPLETE — CLOSED_BY_APP3-B04A` |
| `FU-APP3-DESIGN-FIXTURE-CODE-01` | `RESOLVED_BY_APP3-B03B` |
| `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` | `COMPLETE — CLOSED_BY_APP3-G04` |
| `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` | `COMPLETE — CLOSED_BY_APP3-DB01` |
| `FU-APP3-CLOSURE-FIGMA-BASELINE-01` | `COMPLETE — CLOSED_BY_APP2-X01-C1` |
| `FU-APP3-TEMPLATE-SCOPE-EDIT-01` | `CLOSED_FOR_CURRENT_APP3_SCOPE` |

## 6. Primary capability baseline

The APP3 outcome is *Admin publishes compatible Design Templates* and *an
anonymous customer creates a watermark-protected 2D customization*. Each half is
delivered by accepted checkpoints, and `APP3-E01` plus `APP3-E01-C1` proved the
two halves meet in a real browser.

| Capability | Delivered by |
|---|---|
| Product Side / Embroidery Area placement | `APP3-G01` `APP3-DB01` `APP3-B01` `APP3-B01-C1` `APP3-A01` `APP3-A01-C1` `APP3-B02` `APP3-B02A` |
| Template lifecycle, version and document | `APP3-G02` `APP3-B03` `APP3-B03A` `APP3-B03B` `APP3-B04` `APP3-B04A` `APP3-A02` `APP3-A03` `APP3-A03-C1` `APP3-A04` |
| Published Template read | `APP3-B05` |
| Template media delivery | `APP3-G07` `APP3-B05A` `APP3-W01B` `APP3-W01B-C1` |
| Anonymous Design Session | `APP3-G03` `APP3-G08` `APP3-B06A` `APP3-B07` |
| Canonical document and geometry (P01/P02) | `APP3-F01` `APP3-P01` `APP3-P01-C1` `APP3-G05` `APP3-G05-C1` `APP3-P02` `APP3-P02-C1` |
| Native React SVG renderer (`IMP-D026`) | `APP3-S01` `APP3-S01-C1` `APP3-S02` |
| Text editing | `APP3-S05` `APP3-S05-C1` `APP3-S05-MI01` |
| Transforms | `APP3-S03` `APP3-S03-C1` |
| Customer image upload and private preview | `APP3-G06` `APP3-B01N` `APP3-W01A` `APP3-W01C` `APP3-B06B` `APP3-B06B-C1` `APP3-B06C` `APP3-S06` `APP3-S06-C1` |
| Layers | `APP3-S04` |
| Viewport | `APP3-S07` |
| Runtime watermark | `APP3-S09` |
| Undo / redo | `APP3-S08` `APP3-S08-C1` |
| Autosave, conflict, resume and expiry | `APP3-B08` `APP3-B08-C1` `APP3-P04` `APP3-S10` `APP3-E01-C1` |
| Mobile and touch | `APP3-S11` |
| Cross-layer journey | `APP3-E01` `APP3-E01-C1` |

### 6.1 Not delivered by APP3, and not claimed

```text
customer identity            = APP4
request submission           = APP5
review and quotation         = APP6
payments and orders          = APP7
group creation               = NOT_DELIVERED — FU-APP3-S04-GROUP-AUTHORITY-01
Template artwork intake      = NOT_DELIVERED — FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01
export or download           = OUT_OF_SCOPE — no APP3 operation returns a design file
3D                           = OUT_OF_SCOPE
stitch simulation            = OUT_OF_SCOPE
digitizing                   = OUT_OF_SCOPE
production readiness         = APP12 (IMP-D015)
```

## 7. Frozen artifacts

Recomputed at closure from the artifacts themselves, never copied from prose.

```text
OPENAPI_PATHS       = 37
OPENAPI_OPERATIONS  = 42
OPENAPI_SCHEMAS     = 84
OPENAPI_SHA256      = f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817
CLIENT_TREE_HASH    = c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6
MIGRATIONS          = 34
TABLES              = 78
COLUMNS             = 843
DB_FINGERPRINT      = 7abf3708f8acc7da1124677add5a95ef1bdd421e78ea7f735213fbf8030a3569
ROOT_SCRIPTS        = 30
FIGMA_REGISTRY_IDS  = 165
```

`APP3` changed the database once, at `APP3-DB01`: migration 34, columns 833 →
843, fingerprint `82864268…` → `7abf3708…`. Everything else moved only where an
accepted checkpoint published a contract.

## 8. Handoff

```text
APP3 = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
APP3-X01 = COMPLETE — DELIVERED_FOR_REVIEW
NEXT_CANONICAL_PHASE = APP4 — Customer Identity, Verification, Secure Access and Notification Core
APP4 = READY_FOR_PRE_IMPLEMENTATION_AUDIT
```

Two limitations are frozen rather than routed, because no delivered or planned
phase owns them and inventing an owner would be worse than naming the gap:

- **Template artwork intake.** Admin can create, version, scope, publish,
  unpublish, archive and restore a Design Template, and the worker normalizes
  `TEMPLATE_SOURCE` artwork once associated — but nothing in the product uploads
  that artwork. Every Template with real artwork in this repository was seeded
  by a fixture. A phase that needs production Templates must own this first.
- **The `APP3-A02` / `APP3-D01` Template-list drift.** Search, sort, page numbers
  and a total are drawn in an approved frame and are unsupported by the
  published list contract. `APP3-A02` chose the contract over the frame and said
  so; the frame has not been revised to match.
