# APP2 — Closure Matrix

Canonical reconciliation of **APP2 Assets and Catalog Publication** at closure
(`APP2-X01`). This document is current authority: one row per canonical
checkpoint, one row per routed follow-up, and the frozen artifact baseline.
Validation evidence for the closure run itself lives in
[`APP2-X01-COMPLETION-REPORT.md`](./APP2-X01-COMPLETION-REPORT.md).

Historical completion and correction reports remain evidence. Where one of them
describes a state a later checkpoint superseded, the row below is the current
authority and the historical report is not rewritten.

- Phase verdict: **`PASS_WITH_FOLLOW_UPS`**
- Blocking checkpoints: **0**
- Blocking follow-ups: **0** (11 routed, all nonblocking and owned)
- Canonical checkpoints: **30**
- APP2 commits: **94** (entry `8643431b…` through `APP2-E01-C1` evidence `377321fd…`)

---

## 1. Checkpoint matrix

`Commit A/C` is the implementation or correction commit; `Commit B/D` is its
evidence commit. Hashes are read from Git, never from a report that omits its
own self-hash.

| Checkpoint | Purpose | Final status | Commit A/C | Commit B/D | Corr. | Report | Blocking | FU |
|---|---|---|---|---|---|---|---|---|
| APP2-PRE-AUDIT | phase entry audit; `NO_APP2_MIGRATION`; 17-checkpoint map | COMPLETE — AUDITED | `8643431b420d28b6eb8458bb3a87c936ca803280` | `3fc1313ef9616348d3d42186fbbdc5ec958d8943` | 0 | APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md | NONE | 0 |
| APP2-DEC-STORAGE | object storage + asset intake (IMP-D028 / ADR-APP2-001) | COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW | `52d582e56a0adcc40a1e1edd1f985b9c7bc9755b` | `ecef0cdc3f333847171b5f392688d5aa6dba6133` | 2 | APP2-DEC-STORAGE-COMPLETION-REPORT.md | NONE | 0 |
| APP2-DEC-STORAGE-C1 | storage-first two-transaction lifecycle; streaming transport | COMPLETE | `0c8afd51b513e9a8f9c7945dfae77616f8a57d16` | `3fce01b6f7ab332c3a37638bd155ed570735eb8c` | — | APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-DEC-STORAGE-C2 | upload idempotency semantics | COMPLETE | `86d3b91f7df592344c2175cb0840a6084941873e` | `3b167dc31cc9dca1d3ecb2404f8243a994931b50` | — | APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md | NONE | 0 |
| APP2-DEC-JOBS | job runtime (IMP-D029 / ADR-APP2-002) | COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW | `8211214ed2885ff8af4981e688df7cadce258e8b` | `27c324ee2dae8427f3f3147d25fcb7fb5480eedb` | 1 | APP2-DEC-JOBS-COMPLETION-REPORT.md | NONE | 0 |
| APP2-DEC-JOBS-C1 | retry and lease semantics | COMPLETE | `a9ef895bf78d9abcd66f52a44d153f52aadccb44` | `146c2bdc0735abf834f0740b5c8ceade16fded58` | — | APP2-DEC-JOBS-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-D01 | Admin asset/catalog NEW + Storefront SUPPLEMENT design package | DELIVERED_FOR_PRODUCT_OWNER_REVIEW | `6f6a33e5e5b48abed507b04b6bdb9c109734d37a` | `6b2006fc92e711cb538a1a257c06f1cfac9ca87a` | 1 | APP2-D01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-D01-C1 | Storefront discovery source authority correction | COMPLETE | `c40e5c4058ec05ea0976104f9341ded48a9662df` | `34ec9544ba6c3f8088bc453927a063346931f7d3` | — | APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md | NONE | 0 |
| APP2-I01 | object-storage foundation package | COMPLETE — DELIVERED_FOR_REVIEW | `48e676def522a9bfc4ab34418e52074df004db3a` | `a82f4f21126d493645a3351bea951a8029ad6e03` | 0 | APP2-I01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-I02 | PostgreSQL job-runtime foundation | COMPLETE — CORRECTED — REVIEW_ACCEPTED | `1d748ef5ff18c7b78fe364789149c57c74abece3` | `bfc2a60b6f60abaf8ec5d8725073740f39c58a5f` | 1 | APP2-I02-COMPLETION-REPORT.md | NONE | 0 |
| APP2-I02-C1 | overlapping timed-out job attempts | SUPERSEDED_BY_FINAL_PROCESS_PROOF | `53417dba9ea16d871cb50a8023514637d708f736` | `fd93ab3d2088efccb691d8271f7ea7fc503d0d98` | — | APP2-I02-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-I02-FD1 | fatal-timeout process isolation, externally observed | COMPLETE | `43546a67df80b1f20a090cc2ffa5ab2e6971404f` | `8775734493638fe47b3df38d823db11345cbe749` | — | APP2-I02-FD1-FINAL-VERIFICATION-REPORT.md | NONE | 0 |
| APP2-B01-G01 | asset-intake entry gate (size/MIME/TTL, CATALOG_MEDIA) | COMPLETE — ENTRY_GATE_CLOSED | `62034acf05f228acb260e35d93194fbcf2e7d5f0` | `4e546334355828b1e0e7bc1ed659eba75756e973` | 0 | APP2-B01-G01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-B01 | Admin asset intake — 3 operations, streaming multipart | COMPLETE — DELIVERED_FOR_REVIEW | `a1cb712eaa6f8c6e50539e721001d83f94f3efd4` | `ac81a2afc7879825722dfb03723b35aa22209056` | 0 | APP2-B01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-DB01 | CATALOG_PREVIEW derivative kind + CST-126 (migration 0032) | COMPLETE — DELIVERED_FOR_REVIEW | `fc7f0a11d87d3be5c803fe294d39bc38451ebe8a` | `cdd7b863e9ae8e66b38d1d132ebe6381bc304c2e` | 0 | APP2-DB01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-I03 | idempotent private-bucket startup bootstrap | COMPLETE — DELIVERED_FOR_REVIEW | `6252e4d322ee21aa01827ff22a0954393e7a63ac` | `ae5e65a730914d71b89e1279e6f75f9821e1d94e` | 0 | APP2-I03-COMPLETION-REPORT.md | NONE | 0 |
| APP2-W01 | asset inspection worker — THUMBNAIL + CATALOG_PREVIEW | COMPLETE — DELIVERED_FOR_REVIEW | `7f01f94ada2cd65e7765051de5e6144d9551fddd` | `6982e860ce870ded5b2fa1dad9df23cb606ece53` | 0 | APP2-W01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-D02 | Admin Assets continuation and identity reconciliation | COMPLETE — DELIVERED_FOR_REVIEW | `59be4402454537eb3293dded75b558192c0f0320` | `f3619db59888e12f71f42ca0afd27b9e40afeec9` | 0 | APP2-D02-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A01 | Admin asset library at `/assets` | COMPLETE — DELIVERED_FOR_REVIEW | `58164122df015b08393818db9a8309bc5863a851` | `6f12c4d7c85b7e1dcb5f37630327fd66dfb76ae1` | 1 | APP2-A01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A01-C1 | mint upload keys outside a secure context | COMPLETE | `77691abcadae042646416f1f6171f107112fceee` | `bb4ebb9d031cfb77a9baf81b897caed6e1d644d7` | — | APP2-A01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-B02-G01 | product-draft field gate (IMP-D032, migration 0033) | COMPLETE — ENTRY_GATE_CLOSED | `356d6e771602b3a4f76b6ca54c2f2ea3449f3ded` | `fffa49581fde928e0453261630a96be021b78fd5` | 0 | APP2-B02-G01-COMPLETION-REPORT.md | NONE | 2 |
| APP2-B02 | catalog draft backend — 5 Admin operations | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `14c80f06976c6f01344279e284fafeffc9a8ddda` | `13fa4f2fb3bee8f33afc4dbca1e2b0fc02c16314` | 1 | APP2-B02-COMPLETION-REPORT.md | NONE | 1 |
| APP2-B02-C1 | body guard, ms-truncated updated_at, invented media cap | COMPLETE | `90e00d7780183b451d6da07526f64d4fbc704839` | `0bf4686c9d0499a49fc0e04c4cfeac2b595f43a6` | — | APP2-B02-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-D03 | Admin Product List design reconciliation (IMP-D033) | COMPLETE — DELIVERED_FOR_REVIEW | `561c058759ffe855c0dc42fad98ca9153fd2163c` | `5b2f78e335e2ec329d7ddc93110a28edad0925f1` | 0 | APP2-D03-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A02 | Admin read-only product list at `/products` | COMPLETE — DELIVERED_FOR_REVIEW | `2ae36de6499ca8a6d39eac0b13a3d5a4250b815e` | `9f05b0d3c6bd3f4ff0c857fd71bed1a216e82c15` | 0 | APP2-A02-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A03-G01 | Product Form contract gate (IMP-D034); not APP2-D04 | COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED | `56992076f6dfd3261adfeb39ad367a54736a9b31` | `e9a9b769c98840da620b7721c9e168b594ea8e0b` | 1 | APP2-A03-G01-COMPLETION-REPORT.md | NONE | 1 |
| APP2-A03-G01-C1 | repair A03 registry approval integrity | COMPLETE | `7a42677e2911acbc097d478bdb65f91b955fa90c` | `f2f654b32ed8dd390a203c0d409797b1e3e84dd8` | — | APP2-A03-G01-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-A03 | Admin product form and detail | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `02fa373124badfefb0876bb0f67487cf31d183fc` | `d68e6ff5f0271a4e5ee7ae3c2f4fc7b2ad039d46` | 1 | APP2-A03-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A03-C1 | secure A03 evidence and conflict handling | COMPLETE | `b6bdb3bb52c9a878b1864cce78bd8108d7dbb967` | `f9d1fa631ef2d94fd2acf351885e000f4e90ce80` | — | APP2-A03-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-B03-G01 | unpublish lifecycle gate (IMP-D035, TR-LC04-05) | COMPLETE — DELIVERED_FOR_REVIEW | `bd4498040bcaeaef2b25b74917442886713e69ad` | `68c10ca059ebd6c48dfd5212140a6da9eb3d2e49` | 0 | APP2-B03-G01-COMPLETION-REPORT.md | NONE | 1 |
| APP2-B03 | publication backend — publish / unpublish / readiness | COMPLETE — DELIVERED_FOR_REVIEW | `35ebcffb4b680c95be7b85b872af95eae3219420` | `76430e35d78756780fe6481a8fb3d171c385cd14` | 0 | APP2-B03-COMPLETION-REPORT.md | NONE | 0 |
| APP2-A04 | Admin publication interaction | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `e522e9d5d392637814b4dfbc0a0dfdaea1b5a12e` | `ebd909a063f2a20f6192977b2d94b95de4f1e9bf` | 1 | APP2-A04-COMPLETION-REPORT.md | NONE | 2 |
| APP2-A04-C1 | isolated production publication smoke | COMPLETE — DELIVERED_FOR_REVIEW | `f25abe0bbc50cac5410970bb7fb3f9b769b4f9c5` | `6527d27609a77adb5e17f93a2ceeed5da52ecb99` | — | APP2-A04-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-T01 | public catalog media delivery (IMP-D036) | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `136243f37948934ee5f63544a1fa7f8f3fecd133` | `d3fb3d0b921e8621709880244f5d4972f5c7891b` | 1 | APP2-T01-COMPLETION-REPORT.md | NONE | 1 |
| APP2-T01-C1 | production gateway evidence | COMPLETE | `b7985d2549cfa8261a5e060db1a12f3727e171fe` | `1f0d16286ad1014ec059c63d4e23fe03addad0bf` | — | APP2-T01-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-B04 | public catalog queries — 2 anonymous operations | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `fa8e05eb49f8f227c09399c1cb591b66b1ed0ba9` | `559237dd8fb52f57bfebdf227f40b39319f08cfa` | 1 | APP2-B04-COMPLETION-REPORT.md | NONE | 1 |
| APP2-B04-C1 | keyset pagination authority (ADR-DB5-001 R10) | COMPLETE — DELIVERED_FOR_REVIEW | `0c331aa68fcc55f0e946e087618afc21bfad6e53` | `78631958ac307ab1b85e8925dfcaffc60c114b35` | — | APP2-B04-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-S01-G01 | Discover route authority (IMP-D038, `/kham-pha`) | COMPLETE — DELIVERED_FOR_REVIEW | `b968194e0c12dfe406aef480b683da93f1dccbfc` | `a134c7336747669ec9cc034962fa74fa64ed7c3c` | 0 | APP2-S01-G01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-S01 | Storefront Discover feed at `/kham-pha` | COMPLETE — DELIVERED_FOR_REVIEW | `4051bb94ede717b8875a872679ca2e212d604e54` | `7fe835bb6905c08c2a10395f3b161bc7596014a3` | 0 | APP2-S01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-S02-G01 | Product Detail reconciliation (IMP-D039, `/san-pham/[slug]`) | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `0d178ed8aabb5c333362374d4e41869724e8d378` | `86626b2f991be5d680c25d2fb2ee641839d04c3f` | 1 | APP2-S02-G01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-S02-G01-C1 | constrain Product Detail story measure to 640px | COMPLETE | `893e9818bc4d1a5fd94a0ae2c24a3962d40ca500` | `36c2036b5f9c80a06fa3deb6886c52ebb2f40a05` | — | APP2-S02-G01-C1-COMPLETION-REPORT.md | NONE | 0 |
| APP2-S02 | Storefront Product Detail at `/san-pham/[slug]` | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `15eaf96f2f5ce15a0f48c6f7c2e4c59603dfd42d` | `d6b483d0a28cd6d163913640a20bd6561100a064` | 1 | APP2-S02-COMPLETION-REPORT.md | NONE | 3 |
| APP2-S02-C1 | mobile band 24px/342px; SAFE_STREAMED_NOT_FOUND (IMP-D040) | COMPLETE | `38ea1ce3d86d03b36cdf175cf4437da2383059c6` | `7ad4820ce998d41cb031d1d9917f97fd9b61e5e5` | — | APP2-S02-C1-CORRECTION-REPORT.md | NONE | 0 |
| APP2-E01 | publication cross-layer journey | COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW | `c672236015bd42397ca7bd7e0a6faa96c388456b` | `ef7124543f24c9f57cfe68b2a6f2dcfd7e19ad38` | 1 | APP2-E01-COMPLETION-REPORT.md | NONE | 0 |
| APP2-E01-C1 | canonical migration path for the disposable topology | COMPLETE | `20a4e4b0fa9f56fce89b89ba0cb7b07e8e37860f` | `377321fdb2f065b3d229c863b26cc29e9425d7d0` | — | APP2-E01-C1-CORRECTION-REPORT.md | NONE | 0 |

`Corr.` counts corrections owned by the parent row; a correction's own row uses
`—`. Counting parents only, the canonical checkpoint set is **30**.

### 1.1 Correction-policy reconciliation

Every correction is exactly one implementation commit (C) followed by one
evidence commit (D), and every delivered implementation has an evidence commit.

**One checkpoint carries two corrections: `APP2-DEC-STORAGE` (C1 and C2).** Both
were reviewer-directed and accepted at the time, before the one-correction rule
was tightened. This is recorded here rather than smoothed over; it is a
historical fact of the phase, not a rule being reinterpreted at closure.

`APP2-I02` also has two follow-on commit pairs — `C1` and then `FD1`. `FD1` is a
**final verification**, not a second correction: `C1` is marked
`SUPERSEDED_BY_FINAL_PROCESS_PROOF` because the process-isolation proof it
claimed was completed only by `FD1`.

Four commits inside the phase range are not checkpoint A/B/C/D commits, and each
is disclosed by an accepted report:

| Commit | Subject | Disclosed by |
|---|---|---|
| `5dcde4b695cb28a31c096826360048d9b9301511` | `chore: add evidences/ to .gitignore` | APP2-A03-C1 §L.1 (operator commit, replayed) |
| `7e3e4987cda5f4cd63c7a0ca1af9d889c5f3d54d` | `fix(admin): make the product form's exits work` | APP2-A03-C1 §L.1 (replayed) |
| `2d921513132039db57a61dd42863cfded4036412` | `fix(admin): show the product form's actions only when there is a change` | APP2-A03-C1 §L.1 (replayed) |
| `b7df24f2e8572db411f3cf0cd561a125f28c4c02` | `docs(security): forbid writing .env and require asking for secrets` | APP2-A04-C1 §, APP2-T01 §, APP2-B04 § (documentation-only governance) |

### 1.2 Checkpoints that must not exist

None of the following has a row above, a report on disk, or a commit in the
phase range:

```text
APP2-A03-C2   APP2-A04-C2   APP2-T01-C2   APP2-B04-C2
APP2-B02-C2   APP2-S02-C2   APP2-E01-C2
APP2-D04      APP2-S01-C1 (NOT_APPLICABLE)
```

`APP2-X01` is the sole closure checkpoint.

---

## 2. Follow-up register

Every routed follow-up is nonblocking and owned. None is implemented by
`APP2-X01`.

| ID | Origin | Issue | Status | Blocking | Owner | Target | Reason outside APP2 closure | Source |
|---|---|---|---|---|---|---|---|---|
| FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 | APP2-B02 | `DRAFT → ARCHIVED` is storable but no transition authorizes it; the same gap `TR-LC04-05` closed for unpublish | ROUTED — NONBLOCKING_FOR_A04 | NONBLOCKING | Product Owner + APP2-B03 lifecycle authority | APP3 or a later lifecycle gate | needs a lifecycle decision (a new `TR-LC04-*`), which is business authority, not closure bookkeeping | APP2-B02-G01 / APP2-B03-G01 reports; phase §6.1 |
| FU-APP2-PRODUCT-ARCHIVE-UI-01 | APP2-A03 | no Admin surface exposes archive/restore | DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION | NONBLOCKING | Product Owner | after FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 | a UI cannot be designed before the transition it would drive is authorized | APP2-A03 / APP2-A04 reports; phase §6.1 |
| FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 | APP2-A01 / APP2-T01 | Admin still renders a placeholder where an authenticated derivative belongs | DEFERRED — NONBLOCKING_FOR_APP2-B04 | NONBLOCKING | APP2 Admin surface owner | a later Admin media checkpoint | needs an authenticated Admin media capability; the public delivery T01 shipped is anonymous and publication-gated by design | APP2-T01-COMPLETION-REPORT.md; phase §6.1 |
| FU-APP2-THUMBNAIL-01 | APP2-B02 | Admin thumbnail delivery had no route | ROUTED_TO_APP2-T01 — SUPERSEDED_BY FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 | NONBLOCKING | APP2 Admin surface owner | tracked by FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 | T01 delivered public media delivery; the remaining authenticated-Admin part was renamed to name the capability rather than its first consumer | APP2-T01-COMPLETION-REPORT.md |
| FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 | APP2-B04 | public media entries publish no intrinsic width/height | ROUTED — NONBLOCKING | NONBLOCKING | APP2 public-contract owner | a later public-contract checkpoint | adding dimensions changes the frozen OpenAPI shape, which closure may not touch | APP2-B04-COMPLETION-REPORT.md |
| FU-APP2-STOREFRONT-CONTENT-BAND-01 | APP2-S02 | the APP1 shell's 16px gutter yields a 358px mobile content band | ROUTED — NONBLOCKING | NONBLOCKING | APP1 shell owner | a later shell checkpoint | S02-C1 fixed the Product Detail band feature-locally; widening the shared shell is an APP1 decision with phase-wide blast radius | APP2-S02-C1-CORRECTION-REPORT.md |
| FU-APP2-DETAIL-NOT-FOUND-STATUS-01 | APP2-S02 | Next 16.2.10 answers HTTP 200 for `notFound()` from a dynamic segment | ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1 | NONBLOCKING | framework tracking (Next.js) | resolved by a framework change plus new evidence | forcing an exact status needs a proxy/middleware duplicate lookup, which IMP-D040 forbids; the surface is safe (`SAFE_STREAMED_NOT_FOUND`) | APP2-S02-C1-CORRECTION-REPORT.md; IMP-D040 |
| FU-APP2-CATEGORY-MANAGEMENT-01 | APP2-B02-G01 | no Admin CRUD for categories; the four are migration-owned | DEFERRED_BEYOND_CATALOG_ALPHA | NONBLOCKING | Product Owner | beyond R1 Catalog Alpha | IMP-D032 fixes the taxonomy for Catalog Alpha on purpose | APP2-B02-G01-COMPLETION-REPORT.md |
| FU-APP2-PRODUCT-VARIANTS-SKU-01 | APP2-B02-G01 / APP2-A03-G01 | no variant or SKU model | DEFERRED_BEYOND_APP2_CATALOG_ALPHA | NONBLOCKING | Product Owner | beyond R1 Catalog Alpha | out of the Catalog Alpha scope the charter defines | APP2-B02-G01 / APP2-A03-G01 reports |
| APP1-FU02 | APP1-E01-C1, **reproduced at APP2-X01** | transient WebKit 504 gateway flake in `quality:e2e`; run A failed on `storefront.smoke.spec.ts` (504 plus the `nosniff` chunk rejection it causes), runs B and C passed 15/15 with retries 0 | REPRODUCED — NONBLOCKING | NONBLOCKING | APP0 / infrastructure E2E reliability | an infrastructure-reliability checkpoint | a non-reproducible gateway timeout under host load is an infrastructure characteristic, not an APP2 defect; APP2 changed no gateway, Compose or Storefront runtime file | APP1-COMPLETION-REPORT.md §follow-ups; this closure §O |
| FU-APP1-SHELL-BRAND-TOUCH-TARGET-01 | APP1 shell, surfaced by APP2-S02 | the Storefront shell brand link misses the 44px target | ROUTED — NONBLOCKING_FOR_APP2-S02 | NONBLOCKING | APP1 shell owner | a later shell checkpoint | inherited APP1 surface; every APP2-owned control measures ≥44px | APP2-S02-COMPLETION-REPORT.md |

**Totals:** 11 routed follow-ups — **9 APP2-owned, 2 inherited from APP1** —
**0 blocking, 0 ownerless, 0 falsely resolved, 0 silently dropped.** The 22-item
`FU-A01…FU-A22` register closed at `APP0-X01` is unchanged by APP2; `FU-A07`
(worker structured logging) was consumed by `APP2-I02` as recorded in the phase
plan §6.1.

### 2.1 Boundaries preserved, not follow-ups

| Boundary | State at closure |
|---|---|
| publication Outbox consumer | `product.published` / `product.unpublished` events stay **`PENDING`**. No APP2 consumer owns them; E01 asserts `DISPATCHED = 0` for both. A consumer arrives with a later registered checkpoint, and that checkpoint owns the assertion change. |
| `DRAFT → ARCHIVED` | still unauthorized; tracked by FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01. Not closed by X01. |

---

## 3. Frozen artifact baseline

Verified from repository state at closure.

| Artifact | Value | Verified by |
|---|---|---|
| OpenAPI hash | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | SHA-256 of `packages/contracts/openapi/openapi.generated.json`; `pnpm check:openapi` |
| OpenAPI shape | 16 paths / 19 operations / 34 schemas | parsed from the same artifact |
| Generated client | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | `hashGeneratedTree` over `packages/api-client/src/generated`; `pnpm check:api-client` |
| Migrations | 33 | `packages/database/migrations/*.sql` |
| Tables / columns / CHECKs | 78 / 833 / 190 | measured live by `APP2-E01` against the migrated disposable database |
| Database fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | `packages/database/tools/canonical-fingerprint.txt`; `db-fingerprint-gate.mjs` |
| Figma registry | 86 IDs / 86 node rows / 11 tables | `pnpm check:figma-design-index` |

### 3.1 Public surface

| Fact | Value |
|---|---|
| Public routes | `/kham-pha`, `/san-pham/[slug]` |
| Public operations | `publicProduct_list`, `publicProduct_detail`, `publicProductMedia_get` |
| Not-found authority | `SAFE_STREAMED_NOT_FOUND` (IMP-D040) — measured HTTP 200, `noindex` required, no product canonical, no duplicate lookup |
| Production journey | `pnpm smoke:app2-e01-publication:production` |

Public Product and media DTOs expose no storage key, bucket, provider endpoint,
internal identity, status or `updatedAt`; `productMediaId` appears only inside
the opaque public media path.

---

## 4. Design authority

| Screen | Implementation authority | Historical |
|---|---|---|
| APP2-S01 Discover | **UI02 Discover Feed** (`REUSE_AND_SUPPLEMENT_ONLY`) — `208:2002` / `224:871` / `226:1038` | — |
| APP2-S02 Product Detail | **APP2-S02-G01 reconciled** `529:2224` — desktop `529:2225`, tablet `529:2431`, mobile `529:2575` | UI03 draft `261:1290` is `HISTORICAL_DRAFT_SOURCE` only |

Approval `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001` remains valid. No APP2 screen is
`WITHHELD` or `NOT_APPROVED`. No next-phase design was started. Figma was not
modified by closure.

---

## 5. Locked decisions

| Decision | Locked value |
|---|---|
| Q-01 pagination | `KEYSET` (ADR-DB5-001 R10) |
| Discover route | `/kham-pha` (IMP-D038); `?category=<slug>` |
| S01 card interaction | staged non-interactive before S02 (IMP-D038) |
| Product Detail route | `/san-pham/[slug]` (IMP-D039) |
| Product Detail scope | supported/deferred set fixed by IMP-D039 |
| Story measure | 640 / 640 / 342 (APP2-S02-G01-C1) |
| Not-found transport | `SAFE_STREAMED_NOT_FOUND` (IMP-D040) |
| Mobile band | 24px gutter / 342px content (IMP-D040) |

No new business decision was created to record closure.

---

## 6. Phase verdict

```text
APP2 = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
APP2-X01 = COMPLETE — DELIVERED_FOR_REVIEW
NEXT_CANONICAL_PHASE = APP3 — Design Templates and 2D Design Studio — READY — NOT STARTED
```

`PASS_WITH_FOLLOW_UPS` is not covering a blocker: every checkpoint above is
final, every follow-up is nonblocking with a named owner and a stated reason for
being outside closure, and the two preserved boundaries (§2.1) are recorded as
boundaries rather than relabelled as done.
