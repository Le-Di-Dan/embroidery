# APP3-S06 — Studio Image / Asset — completion report

Commit A: `b510806` — `feat(storefront): add Studio image workflow`
Branch: `production` · Nothing pushed.

---

## A. Entry state

Human review accepted the frontend chain and `APP3-B06C`. Recorded at entry and
unchanged since:

```text
APP3-S01/S02/S03/S03-C1/S05/S05-C1/S05-MI01/S07 = COMPLETE — REVIEW_ACCEPTED
APP3-P01/P01-C1/P02/B06B/B06C/B07/B08/D01/D01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S06 = READY — NOT STARTED
```

Entry contract: **36 paths / 41 operations / 83 schemas**, 34 migrations, 30 root
scripts. Accepted `APP3-B06C` anchor `f027211`.

`S06_ENABLEMENT_REPAIR_WINDOW = AUTHORIZED` was used twice, for the two seams
§10 and §11 named. `APP3-B06C-C1` was not executed as a separate checkpoint.

**One §6 note, not a conflict.** The phase plan's §6 candidate list (line 78)
still reads "APP3-S06 — Watermark and preview". §6.1 row 28 supersedes it —
"asset/image capability… S02, **B06B** and **B06C**" — and §6.1 is explicitly the
corrected map. This checkpoint followed §6.1. The stale §6 line was left
untouched: it is the pre-audit candidate slice, and rewriting it would edit a
historical record rather than the authority.

---

## B. The four S06 design rows

Section `10 — Studio Image / Asset`, node `596:16`, in file `embroidery`
(`BQwqV8GdfUIELvsQDB1UQE`), page `APP_03`:

| Registry ID | State | Node |
|---|---|---|
| `FIG-STUDIO-IMAGE-DESKTOP-UPLOADING` | Uploading | `608:343` |
| `FIG-STUDIO-IMAGE-DESKTOP-NORMALIZING` | Normalizing | `608:393` |
| `FIG-STUDIO-IMAGE-DESKTOP-READY` | Ready & Placed | `608:441` |
| `FIG-STUDIO-IMAGE-DESKTOP-FAILED` | Failed Inspection | `608:503` |

All four were `REVIEW_REQUIRED` at entry and are now
`APPROVED_FOR_IMPLEMENTATION` with evidence `APP3-S06 §6 operator review`.
Exactly four rows moved. No fifth S06 frame was created and **no Figma node was
created, moved or edited** — only registry status changed.

`FIG-STUDIO-MOBILE-IMAGESHEET` (`610:465`) stays `REVIEW_REQUIRED`. It is the
mobile image sheet and it belongs to `APP3-S11`; it is the same *capability* and
a different checkpoint, which is why the gate lists it by name among the rows
that must stay unapproved. `S04`, `S08`, `S09`, `S10` and `S11` are likewise
untouched.

`node tools/check-figma-design-index.mjs` — PASS (165 registry IDs, 165 node
rows, 15 tables).

---

## C. 1440 / 1024 / 390

**1440** is the exact S06 capability design: the four states above.

**1024** reuses `FIG-STUDIO-EDITING-TABLET-1024` (`618:140`), the shared editing
reference `APP3-D01-C1` owns. The image controls are a **section of the one
accepted drawer**, not a drawer of their own — §7 forbids a second right-drawer
system, and `APP3-D01-C1` anticipated exactly this when it said layers would
later share it. One topbar, one trigger, one out-of-flow panel; the drawer is
`position: absolute`, so opening it changes no in-flow box and the stage's
`viewBox` and every millimetre derived from it are byte-identical.

The drawer's own name moved with its contents: a trigger labelled
"bảng thuộc tính chữ" cannot honestly open a panel containing an image control,
so it now names the inspector (`STUDIO_INSPECTOR_COPY`) and each section keeps
its own heading.

**390** renders nothing that edits. Not hidden — **absent**: a CSS-hidden file
input still opens a native picker. What remains is one sentence, and it promises
nothing ("Màn hình này chưa đủ rộng…"): no "sắp có", no disabled control
implying a button that will work later. Mobile image tooling is `APP3-S11`'s.

---

## D. The `APP3-S02` placeholder handoff

`ImagePlaceholder` is unchanged and still there. What changed is **when** it is
drawn: S02's comment said "no public route serves a Design Session's own image
bytes", which stopped being true. It is now the fallback for media that is
loading, that the server refused, or that belongs to no live Session — and
drawing a stale or borrowed picture for any of those would be worse than drawing
nothing. `APP3-B05A`'s published Template route is still not a fallback: clone
independence means Template lineage is provenance, not permission.

---

## E. The `APP3-B06B` upload contract

Consumed unchanged through the generated `publicDesignSessionAssetCreate`. The
client affordance offers exactly `image/png, image/jpeg, image/webp` and the
10 MiB ceiling, and `tools/check-app3-s06.mjs` reads the **generated operation's
own published description** and fails when the restated number stops matching —
the affordance is restated in the Storefront only because the authority lives in
the API application, which it must not import.

SVG and GIF are absent and their absence is load-bearing: `IMP-D044` PO-04
authorizes SVG for Template artwork only and `APP3-B06B` refuses it at intake,
and animation is refused by the decode policy. Offering either would promise a
permanent refusal.

Both required headers are sent through the generated operation's per-call
config: `Idempotency-Key`, minted once per attempt the customer initiated and
reused across a transport retry of that attempt, and the session revision.

---

## F. The local Session revision

Taken from the `APP3-B06B` response and kept, because the next mutation must
present it. **Proved by browser evidence and by a defect** — see §X.

Keeping it is not saving. No autosave call, no timer, no saved indicator.

---

## G. The inspection finding at entry, reproduced

`apps/worker/.../asset-inspection/infrastructure/persistence/asset-rows.ts`
compared every row against two literals — `CATALOG_MEDIA` and
`PRODUCTION_SENSITIVE` — and its own comment named the case it refused: a
`CUSTOMER_UPLOAD` "is pointed at work belonging to a different pipeline with
different privacy rules". That pipeline had never been built.

So a Session upload's inspection job raised a contradiction →
`JOB_INVARIANT_VIOLATION` → dead letter → the asset stayed `INSPECTING`
permanently → `APP3-W01C` correctly waited for a verdict that could not arrive.
`APP3-B06C` refused `INSPECTING`, correctly, which made the whole customer-upload
capability a closed and empty loop.

The finding still reproduced at entry HEAD. It is repaired here.

---

## H. The repair, and the catalog regression

One pipeline, parameterized by a **lane** resolved from the *locked* asset row,
matched on the kind/classification **pair** — never the kind alone, because a
`CUSTOMER_UPLOAD` marked `PUBLIC` is not a Session upload with an odd label but a
row no delivered checkpoint can produce.

The catalog lane is unchanged in every respect: same two outputs, same order,
same policy objects. The Session lane writes **no derivative**, and that is the
whole difference:

- a `THUMBNAIL` or `CATALOG_PREVIEW` of a private customer upload would be
  catalogue media derived from something that is not catalogue media, and nothing
  would ever serve it — `APP3-B06C` delivers `NORMALIZED` only;
- `NORMALIZED` is `APP3-W01A`'s, produced from the `asset.normalization.requested`
  event `APP3-B06B` already emits. Writing one here would be a second producer of
  one derivative kind.

No second event, no second queue, no scheduler, no sleeping inside an attempt,
and no migration.

**Catalog regression, live:** 8 suites / 102 tests across the accepted
`asset-inspection-*.integration` and `asset-normalization*.integration` suites —
all pass. The dedicated lane suite additionally asserts that a `CATALOG_MEDIA`
asset still writes both derivatives and both objects.

### H.1 The decode that was not free

Removing derivative generation removed something nobody had written down: the
catalog lane's **pixel-level decode had always been a side effect of generating
its outputs**. `readSourceMetadata` parses the header and decodes nothing — the
accepted suite even documents this ("a corrupt object that was uploaded corrupt
gets past this stage and is caught by the decode in generation").

So the first Session-lane run **accepted a truncated PNG**. That is a weakening
of content inspection, not an acceptable consequence of the lane.

`verifyFullDecode` makes it explicit: the same locked `sharpOptions()`, every
pixel decoded via `stats()`, output discarded. It runs **after** the policy, so
an oversized image still gets its precise code rather than `DECODE_FAILED`, and
nothing decodes an image the policy would have refused.

`requiresFullDecodeVerification(lane)` is **derived** — `derivatives.length === 0`
— not a flag. A boolean field is one edit away from a future lane silently
inheriting the weaker check; derived, there is no field anyone can forget.

---

## I. Real ACCEPTED and REJECTED evidence

Live PostgreSQL + MinIO, driving the real use case
(`session-inspection-lane.integration.spec.ts`, 8/8):

- a valid PNG, JPEG and WebP each reach `ACCEPTED` with **zero** derivative rows
  and **zero** objects under the asset's prefix;
- a truncated PNG — valid signature, truncated pixel data — reaches `REJECTED`;
- both replay without writing anything;
- a `CUSTOMER_UPLOAD` carrying `PRODUCTION_SENSITIVE` is still refused
  `JOB_INVARIANT_VIOLATION` with the asset left in `INSPECTING`;
- the catalog lane still writes both `READY` derivatives and both objects.

And through the **browser**, against the real HTTP stack (§Y, §Z).

No rejection was faked by updating the database.

---

## J. `APP3-W01C` / `APP3-W01A` convergence

Unchanged, and deliberately so. `W01C` already retries while the asset is
`INSPECTING` and terminates on `REJECTED`; inspection reaching `ACCEPTED` is
exactly the state it waits for, so the *same* normalization work converges with
no change to it. Confirmed live: after the browser upload the row was
`ACCEPTED` with exactly one `READY`, unwatermarked `NORMALIZED` derivative at
`image/webp` 600×400, and one `ACCEPTED` inspection.

---

## K. The private processing-status audit

Asked in the order §11 sets:

- **A.** No Session-scoped processing projection existed.
  `session-asset-projection.ts` is the intake view (`assetStatus` is always the
  literal `INSPECTING` — a statement that work was queued, not that it passed).
- **B.** The Session snapshot carries the document and scope, no asset state.
- **C.** No accepted operation returns `derivativeId + widthPx + heightPx +
  mediaType + byteSize` for a Session-authorized derivative.

`APP3-B06C`'s 404 could not be used: it collapses eleven private misses on
purpose, so it cannot distinguish "still processing" from "rejected" from "never
yours", and a Studio polling it would read a refusal as progress and could never
show a failed upload at all.

---

## L. The status operation

```text
GET /api/public/design-sessions/{sessionId}/assets/{assetId}/status
    — publicDesignSessionAsset_status
```

`PublicDesignSessionAssetStatusController`, a third class in the
`publicDesignSessionAsset` domain, mapped through `CONTROLLER_DOMAIN_KEYS` so the
split reissues no accepted id — the `APP3-B04A` failure. `_create` and `_get` are
unchanged and the gate asserts both still exist.

Guarded by the same `DesignSessionReadGuard`: same cookie, same peppered HMAC,
same liveness, same failure budget, same read limit. No mutation rule inherited.

**Three states.** `PROCESSING` covers everything before a terminal verdict and
deliberately does not distinguish inspection from normalization — the Studio
shows one state for both, and naming the stage would publish the worker
pipeline's shape to an anonymous caller for no behaviour it could take.
`READY` is the only state carrying media, and carries exactly `derivativeId` plus
the `APP3-DB01` quartet. A `READY` short of the whole quartet is reported
`PROCESSING`: a Studio told `READY` builds an `APP3-P01` element from those
numbers.

**Deviation, disclosed.** §11.1 spells the non-terminal state `INSPECTING`. It is
spelled `PROCESSING` because an asset can be `ACCEPTED` and awaiting
normalization, and calling that state `INSPECTING` would be untrue. §11.1 permits
the repository's own exact word; this is it.

**Authorization** reuses the existing composition and is scoped to the **upload
association only** — narrower than delivery. A status projection answers "how is
the image I just uploaded progressing"; cloned Template artwork has no
progression to report, because `APP3-B07` proved it a `READY NORMALIZED`
derivative before the Session existed. Admitting the document branch would open a
second, wider door to enumerate processing state. Unknown, foreign and
never-uploaded assets are one indistinguishable 404 (proved by comparing the
full disclosed bodies).

**Discloses nothing** about storage key, bucket, provider, checksum, filename,
inspection detail, rejection code, job id, lease or retry count. Asserted against
the **fields published**, never by banning a word: the response's docblock and
the operation's description both correctly say no checksum is disclosed, and a
word ban fires on exactly that honest prose — the proxy failure `APP3-B06B` and
`APP3-B06C` each recorded.

No durable write, no revision advance, no cookie, no expiry extension.

---

## M. Polling and fake timers

Only the bounded status projection is polled; the binary route never is. Two
seconds while unfinished — an S06 engineering choice, disclosed as such, bounded
far below the 60-reads-per-minute limit, and deliberately **not** an autosave
cadence.

Stops on `READY`, on `REJECTED`, on unmount, on Session replacement, and on an
authorization failure (`retry: false`). `refetchIntervalInBackground: false`:
polling a background tab spends a customer's read budget on an answer nobody is
looking at.

`staleTime` and `gcTime` are `0` while polling and `Infinity` when there is
nothing to poll. That is not a micro-optimisation: TanStack schedules a real
timer for each, this query exists on every Studio mount because a hook cannot be
called conditionally, and `APP3-S02`'s "no timer on an open stage" proof would
otherwise have been true only by accident. It failed, and this is the fix.

The component suite runs entirely on a **fake clock** (23 tests). Nothing waits.

---

## N. The read-rate follow-up — and a correction to `APP3-B06C`

**`FU-APP3-B06C-READ-RATE-LIMIT-01` = COMPLETE — CLOSED_BY_APP3-S06.**

It closes with a correction that matters more than the code. `APP3-B06C` reported
that `IMP-D043` PO-07 "defines exactly four limits — creation, creation burst,
mutation and authorization failure — and none of them is a read limit", and
declined to invent one. **Declining was right. The premise was wrong.**

PO-07 rules **five**, verbatim: *"creation 5/hour per ephemeral network key,
burst 2/minute; **bootstrap/resume/read 60/minute per ephemeral network key**;
authorization failures 10 per 15 minutes…"* — and
`docs/09-SECURITY-AND-ABUSE-PREVENTION.md` has carried that row in its locked
limits table since `APP3-G03` on 2026-08-04.

What was missing was the *implementation*: `design-session-auth.config.ts`
carried four of the five. B06C read the code, found four, and concluded the
ruling did not exist.

So this is not a new product ruling. Every comment, status line, gate rule and
mutation test that would have attributed the number to an "S06 operator ruling"
now attributes it to PO-07, and the security document records why it arrived
late — because the shape recurs: a control can be locked in a document and absent
from the code that enforces it.

Applied in the shared read guard, **before** authorization, so it bounds probing
rather than only successful reads. A separate dimension from both the mutation
counter and the authorization-failure budget.

Proved on an **injected clock**: 60 admitted in one virtual window, the 61st
`429`, admitted again once the window moves, a separate network key independent,
the mutation counter untouched and the full 30-mutation budget still available.
Nothing waited.

---

## O. The cloned-Template media audit

Asked in the order §12 sets:

- **1.** `open-design-session.use-case.ts` → `cloneFromTemplate` writes **no**
  `design_session_assets` row.
- **2.** `APP3-B06C`'s delivery joined `design_session_assets` only, so a cloned
  image was refused.
- **3.** The persisted Session document does carry the exact
  `assetId + derivativeId` pair.
- **4.** `APP3-B08`'s `SessionDocumentMediaAuthority` already admits exactly two
  sources — this Session's uploads, and assets the persisted document already
  references.

So the model was accepted and only the *read* was missing.

---

## P. The repair

`design-session-media-grant.sql.ts` states two branches, and the delivery
statement now starts from the **authorized Session row** with every branch
correlated to it:

- **upload** — the association, correlated on both halves of the pair, carrying
  the `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` lane check **with it**;
- **document** — an image element in this Session's own persisted document
  naming this exact asset through this exact derivative.

Two things are worth stating plainly.

**The lane check stays inside the upload branch.** Hoisted into the shared
`WHERE` it would make the document branch unreachable — the repair would be a
silent no-op and every test would still pass. The gate has a mutation for it.

**The document branch admits `TEMPLATE_SOURCE` only.** The argument that a
customer-supplied document is safe to read as a grant rests entirely on
`APP3-B08`'s allowlist, which is correct today and is an argument about another
module — one edit away from being false, with the failure being one customer
reading another customer's photograph. Narrowed, that leak is
**unrepresentable** rather than prevented elsewhere, and the live suite proves
it: a reference to another Session's `CUSTOMER_UPLOAD` forced directly into an
attacker's document is still refused 404, while the owner still gets 200.

No branch consults a Template id, slug, version or publication state, so an
authorized Session keeps rendering its own accepted document after the Template
is unpublished, and knowing a Template grants nothing.

`jsonb_typeof` guards the array access: `jsonb_array_elements` on a non-array
*errors*, so a malformed stored document must contribute no grant rather than a
500. Proved.

---

## AA. The clone-media journey

`CLONE_TEMPLATE` cannot yet produce a Session document containing images through
any production path, because `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` — Template
image intake — still has no owner and **S06 did not implement it**. The grant is
therefore proved against a seeded `TEMPLATE_SOURCE` asset and a document written
directly, and the fixture nature is disclosed here rather than implied away.

What is proved live: the exact bytes are delivered with **no** association row
present; the wrong derivative for the right asset is refused; a bystander Session
knowing both ids is refused; an ineligible (watermarked) derivative is still
refused through the document branch — a grant decides *whose* media it is, never
whether the media is deliverable; and the status route refuses a document-only
asset while the preview serves it, which is the narrower scope of §L made real.

---

## Q. The `APP3-P01` image element

Built only from a `READY` status projection: `assetId`, `derivativeId`,
`intrinsicWidthPx`, `intrinsicHeightPx`, plus the common element fields. There is
no constructor that takes a width from anywhere else.

Nothing on the path reads `naturalWidth`, `naturalHeight`, `decode()`,
`createImageBitmap` or `new Image()`, calls `getBBox`, or inspects a Blob. The
whole feature is asserted against that list.

No Blob, object URL, storage key, filename, upload progress, inspection status or
query state reaches the document — proved by serializing the working document
after a real placement and asserting the absence of each.

---

## R. `APP3-P01-C1` identity

The candidate is ruled by four authorities in the order that makes each
meaningful: structure → complexity → **context** → geometry.

The context step is the one `APP3-S05` documented as unaskable — it noted that
calling `validateDesignDocumentContext` with an empty derivative map would refuse
a perfectly valid image the customer never touched, and skipped it. S06 is the
checkpoint that finally holds the authority to fill that map.

The map carries the new image from the server's measurement, plus the images the
document already contains, entered at their own values. Two of six fields on the
carried entries are presence placeholders and the code says exactly which and
why: `widthPx`/`heightPx` are **not** placeholders — a valid document's stored
intrinsics equal its derivative's, so they are the canonical values that keep the
decoded-pixel budget a real total — while `mediaType`/`byteSize` participate in no
rule here and cannot change an outcome.

So `APP3-P01-C1` really rules: unknown derivative, derivative belonging to
another asset, ineligible kind or status, incomplete measurement, intrinsic
mismatch, one asset through two derivatives, and the decoded-pixel budget.

---

## S. Placement and replacement

**Initial placement** (the operator-approved §15 fallback): the derivative's own
aspect ratio, centred in the Embroidery Area, fitted inside it, **never**
enlarged (`Math.min(1, …)`), rotation 0, scale factors neutral so the box is the
only size. No millimetre appears — physical size is `APP3-P02`'s question, asked
afterwards, and converting mm to pixels here would be a second implementation of
the rule that decides it.

If `APP3-P02` refuses the candidate, the refusal is stated in bounded Vietnamese
and **nothing is inserted**. No clamp, snap, scale-down or retry-at-a-smaller-size
— `IMP-D045` PO-09 forbids each by name, and the gate bans them by shape.

*Consequence, disclosed:* when an Area declares a physical maximum smaller than
the Area rectangle, the first placement is refused rather than silently shrunk.
The customer is told, and sizing down is an `APP3-S03` transform that already
exists.

**Replacement** uploads a **new** Asset, never overwrites or deletes the old one,
keeps the element's id, its position in the array (its z-order) and its whole
transform, and changes only the four media fields. A kept transform that is no
longer valid refuses the whole replacement and leaves the prior element exactly
as it was. Proved live: two assets, both `ACCEPTED`, both with their own
derivative, two association rows, nothing deleted.

The refusal copy distinguishes the two cases, because the same rule means
different things: a new image that would not fit was never added, while a
replacement that would not fit left the customer's existing picture where it was.

---

## T. One working document

Unchanged. `APP3-S03`'s store is still the only editable truth, still the only
store holding a `DesignDocument`, and the image capability writes through the
same `commit`. No second document store, no server replica in Zustand.

---

## U. One native SVG scene

A ready image is an `<image>` in the same coordinate system as every other
element — not an HTML `<img>` overlaid on the stage, not a second SVG, not a
canvas. An overlay would need its own transform pipeline agreeing with
`APP3-P02` frame by frame during a drag.

`preserveAspectRatio="none"` is deliberate: the element's box was built from the
canonical derivative's dimensions and every later resize was ruled on by
`APP3-P02`, so letterboxing would draw the artwork somewhere other than the
rectangle the customer sized and the engine measured.

The feature opens exactly one `<svg>` root and no `<canvas>`. `<img>` is banned
in the **stage** files, not feature-wide: `studio-template-preview.tsx` renders a
real `<img>` and always has — it is `APP3-S01`'s picker card, a thumbnail beside
a list, and banning the tag feature-wide would refuse an accepted component for
using the right element in the right place.

---

## V. Object-URL lifecycle

Keyed by `derivativeId`, because one Asset may legitimately be placed several
times (`APP3-P01-C1` counts decoded pixels per unique Asset precisely so a logo
used twenty times costs one decode) and because a replacement changes the
derivative — keyed by element, a replacement would go on rendering the previous
picture under the new media identity.

Created for the bytes actually selected for rendering; revoked in effect
**cleanup**, which is the one placement that also fires on unmount, on a Session
change and on replacement. Never in the document, never in a store. Proved: every
created URL appears in the revoked list after unmount.

---

## W. Selection, move, resize, rotate

Preserved. `APP3-P02` bounds remain authoritative for the selection outline;
nothing measures the rendered picture. The transform overlay, its eight handles
and the live millimetre read-out all work on an image element — proved in a real
browser with a real mouse drag (§X).

---

## X. Browser proof — and the defect it found

Real Storefront route, real gateway, real API, real worker, real MinIO, at
`http://localhost` through the accepted
`smoke-app3-s01-trustworthy-origin.mjs apply` mechanism (restored afterwards).

**1440.** Session created with `document.cookie` **empty** — the credential is
`HttpOnly` and JS cannot read it. The picker offers exactly
`image/png,image/jpeg,image/webp`. A real 600×400 PNG chosen through the native
file chooser → `202` → three status polls (`PROCESSING`, `PROCESSING`, `READY`) →
one `editor-preview` fetch → the picture rendered as
`<image href="blob:…">` **inside** `studio-stage-canvas`, auto-selected, with the
transform overlay and the read-out showing `Rộng 100 mm · Cao 66,7 mm` — the
600:400 ratio preserved exactly. A real NW→SE handle drag resized it: the matrix
changed, the local box did **not** (S03 persists scale, not width/height), no
refusal, the blob still rendered. No horizontal overflow.

**1024.** One topbar, one trigger, one drawer; the image controls inside it; the
stage's width **byte-identical** with the drawer open; `position: absolute`; the
image still rendered; no horizontal overflow.

**390.** **Zero** file inputs in the whole DOM, no picker, no bottom sheet, no
drawer, the honest notice, the image still rendered read-only, no horizontal
overflow (`scrollWidth === clientWidth`).

**Network.** `201` create, `202` upload, exactly three status reads, one
`editor-preview`. The preview response: `cache-control: no-store`,
`x-content-type-options: nosniff`, `content-disposition: inline`,
`content-length: 508`, `content-type: image/webp` — **no** ETag, Last-Modified,
Accept-Ranges, filename, storage host or key. The status response carried the
quartet and nothing else. **No autosave call. No poll after the verdict. The
binary route was never polled.**

### X.1 The defect

Uploading, changing viewport, and uploading again produced **`409 CONFLICT`**.

Crossing a breakpoint unmounts one image-panel mount and mounts the other, and
the upload controller went with it — resetting the local Session revision to the
one the Session was bootstrapped with. The next upload presented a stale revision
and `APP3-B06B` refused it, correctly.

A local revision is *Session* state, not inspector state. The controller now
lives in `StudioStageScreen`, above every tier, exactly where the transform
controller already lives. Re-proved in the browser: upload → 1024 → 1440 →
upload gives `202` and `202`, three polls each, and the second upload replaced
the first image in place.

No unit test could have found this: none of them changes viewport mid-session.

---

## Y. The real journey

Nothing was seeded. The database after the browser run:

```text
assets:              CUSTOMER_UPLOAD | CUSTOMER_PRIVATE | ACCEPTED
asset_derivatives:   NORMALIZED | READY | is_watermarked=false
                     image/webp | 600 × 400 | 508 bytes
asset_inspections:   ACCEPTED   (exactly one)
```

No `THUMBNAIL`, no `CATALOG_PREVIEW`. That is the §39 invariant, end to end,
produced by the real pipeline.

---

## Z. The real rejection journey

A deterministic animated WebP — which passes `APP3-B06B`'s synchronous signature
intake and is refused by the actual inspection policy — was chosen through the
same picker.

`202` accepted → the real worker inspected it → `REJECTED` with
`ANIMATED_IMAGE_UNSUPPORTED` recorded in `asset_inspections` → the status
projection reported `REJECTED` → the UI showed the bounded generic sentence
"Ảnh này không dùng được nên chưa được thêm vào bản thiết kế."

Zero `editor-preview` successes for it, zero elements inserted, the prior working
document unchanged, and the retry action available. **The rejection code never
reached the browser.**

*(A truncated PNG was tried first and did **not** reach inspection: that upload
was one of the ones the §X.1 revision defect refused with `409`, so its asset row
is still `UPLOADED` with zero associations — `APP3-B06B` streamed it and its
durable transaction was refused by the revision CAS before any association was
written. That is the accepted intake behaving correctly under a client bug, not
an inspection verdict, and it is recorded here rather than presented as one. The
truncated PNG's real `REJECTED` verdict is proved by the live worker suite (§I);
the animated WebP is the fixture that reaches inspection over HTTP, and it is the
one this journey uses.)*

---

## AB. Network and security

No direct object-storage call from the browser. No presigned URL. No storage
host, bucket or key in any response header or body. No generic Asset route. No
`ORIGINAL` delivery and no parameter that could ask for one. The session cookie
is not JS-readable. No `publicDesignSessionAutosave` call at any point.

Deliberate negative probes (a foreign session, an unknown asset) are recorded as
such and are not unexpected console defects.

---

## AC. Performance sanity

`tools/bench-app3-s03-transforms.mjs`, the accepted `APP3-S03` driver, after the
renderer change:

| Engine | Scene | move p95 | resize p95 | rotate p95 | dropped |
|---|---|---|---|---|---|
| Chromium | L = 100 | **16.7 ms** | **16.7 ms** | **16.7 ms** | 0 |
| WebKit | L = 100 | **16 ms** | **17 ms** | **16 ms** | 0 |
| WebKit | M = 50 | 17 ms | 18 ms | 16 ms | 0 |
| WebKit | S = 10 | 16 ms | **30 ms** | 16 ms | 0 |

Budget is 20 ms. **The required L = 100 sanity is inside budget on both engines**,
with zero dropped frames.

**One combination is above budget, and it is not S06's.** WebKit `resize` at
S = 10: p95 30 ms, 4 slow frames in 60, **0 dropped**. Two independent facts
settle the attribution:

- **The accepted `APP3-S03` baseline already discloses it.** §X of that report
  records `resize` on WebKit above budget at **M (30 ms)** and **L (21 ms)**,
  "by a single slow frame in a 60-frame gesture", and human review accepted it.
  Measured now: M **18 ms**, L **17 ms** — both *improved* against that baseline.
  The one above-budget combination has moved size, not worsened.
- **S06's renderer change cannot execute here.** It is a branch taken only for
  `element.type === 'image'`, and `bench-app3-s03-fixtures.mjs` builds every
  scene from `type: 'shape'` rectangles — confirmed against the seeded documents,
  which contain `["shape"]` and nothing else at S, M and L.

So the smallest scene showing the worst number is the shape `APP3-S05` recorded:
a breach at the *smallest* scene is not a render regression, because render cost
grows with element count. No optimization pass was opened, because §26 opens one
only for an S06-*caused* regression and this one is structurally impossible.

*Method note.* The Chromium run spent the `IMP-D043` PO-07 creation budget
(5/hour per ephemeral network key) and the first WebKit attempt was refused
`429`. It was rescheduled past the window rather than forced — restarting a
service to clear an in-memory counter is exactly what the accepted response to a
rate limit is not.

---

## AD. OpenAPI and client delta

```text
before   36 paths / 41 operations / 83 schemas
after    37 paths / 42 operations / 84 schemas
```

One path, one operation, and **one** schema — `DesignSessionAssetStatusResponse`,
the only component the checkpoint publishes. Every number measured from the
artifact, none predicted.

```text
OpenAPI SHA-256  f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817
client tree      c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6
```

Generated after the backend source stabilized. Two generation rounds are
disclosed: the first published the optional status fields as
`{ [key: string]: unknown } | null` — an Orval artifact of `nullable: true` on a
field that is *absent* rather than null — so the DTO was corrected and both
artifacts regenerated once more. No generated file was hand-edited.

Curated on the `@embroidery/api-client` boundary: `publicDesignSessionAssetCreate`,
`…Get` and `…Status`, released **together** because an upload that could not be
polled leaves the Studio guessing and a preview without a status must poll the
binary route as a state machine. `publicDesignSessionAutosave` stays withheld:
`APP3-S10` still has no screen.

`openapi:check` PASS · `check:generated` PASS · api-client typecheck and tests
PASS (7).

---

## AE. Checker and mutation evidence

```text
node tools/check-app3-s06.mjs          PASS
node --test tools/check-app3-s06.test.mjs   64/64
```

Four modules by responsibility: the entry point (predecessors, design approval,
surface, artifacts, file sizes), `-repairs` (the two seams and the read limit),
`-frontend` (the Storefront), `-sources` (paths). None reads the completion
report.

**Six of my own rules were wrong and the mutations caught them.** Three banned a
*word* on an honest artifact — `checksum` in a description that correctly says no
checksum is disclosed, `<img>` in the accepted Template picker card,
`initialImageTransform` in the function that is supposed to place something. All
three now assert the published fields, the stage files, or the replacement
function specifically. One rule was weaker than its mutation: deleting the
polling stop-condition left `isTerminalAssetState` present elsewhere in the file,
so the rule is now asserted **inside** the `refetchInterval` body. Two mutations
did not mutate — a rename that still contained the original id, and a reorder
that reordered nothing.

Soft caps respected: no `check-*.mjs` over 450 lines, the test file under 700.

---

## AF. Predecessor-gate evolution

Every predecessor gate passes. Eight were made **world-aware** — never loosened,
and never by deleting a rule:

| Gate | What changed |
|---|---|
| `app3-accepted-surface` | S06 world (37/42/84, 6 session paths), new path appended **last** so a half-flipped world stays inexpressible |
| `app3-accepted-paths` | `isS06Delivered`, `S06_FILES`, `S06_DESIGN_ROWS`, `S06_STATUS_LINES` |
| `check-app3-b01n-artifacts` | new frozen tier at the head of three chains; every earlier world untouched |
| `check-app3-s01` | the Session-asset ban **moved** to the S01 partition rather than disappearing |
| `check-app3-s02` / `-s03` / `-s07` | the same, each scoped to its own files |
| `check-app3-s05` | its "S06 is not complete" chronology rule, on S06 alone |
| `check-app3-b05a` | the status route excused **by name**, never by loosening the shape |
| `check-app3-b06c` | the grant restructure and the second read method, with the association pin replaced by term-by-term assertions that are not weaker |

`S06_FILES` deliberately omits `studio-stage-element.tsx`: S06 changed it, but it
is `APP3-S02`'s file and stays under S02's rules, which is what keeps "one native
SVG scene, drawn by one component" a live assertion.

`apps/storefront/test/boundary/design-studio-source.test.ts` crossed the 600-line
test ceiling, so its per-checkpoint partitions were extracted to
`test/support/design-studio-partitions.ts` — a split by responsibility, and one
answer to "whose file is this" for both suites.

**Two pre-existing failures, disclosed not repaired.** `check-app3-a01` (2) and
`check-app3-a03` (1) fail with **byte-identical** messages at entry HEAD, proved
under `git stash`. They concern Studio rows approved by earlier accepted
checkpoints and are not S06's to fix.

---

## AG. Files, sizes, deviations

28 files added, 60 modified. Every runtime source is under 400 lines and every
test under 600. No file needed a cosmetic split.

Disclosed deviations:

1. **`PROCESSING` rather than `INSPECTING`** as the non-terminal status word
   (§L), because an asset can be `ACCEPTED` and awaiting normalization.
2. **WebKit `resize` above budget at S = 10** (§AC) — the accepted `APP3-S03` disclosure, improved at M and L, and structurally not S06's.
3. **Clone-media proved with a seeded Template asset** (§AA), because production
   Template image intake has no owner.
4. **`FU-APP3-B06C-READ-RATE-LIMIT-01` closed as a correction** (§N): the limit
   was already ruled, not newly authorized.
5. **`docs/09-SECURITY-AND-ABUSE-PREVENTION.md` edited** — one paragraph
   recording why a locked control arrived late. The limits table itself is
   unchanged; it was already right.
6. **Roadmap, traceability and phase-source-map untouched.** They carry no
   `APP3-B06C`, `S03`, `S05` or `S07` delivery entries either; per-checkpoint
   status lives in the phase plan, and inventing a new convention here would be a
   change nobody reviewed.

---

## AH. Command ledger

Fingerprinted, no same-fingerprint reruns. Highlights:

| Command | Result |
|---|---|
| worker lane unit + `source-verification` | 55 → PASS |
| `session-inspection-lane.integration` (1st) | **3/8 FAIL** — no full decode; codec demanded 2 derivatives |
| same, after the fixes | 8/8 PASS |
| `asset-inspection-*` + `asset-normalization*` integration | 8 suites / 102 PASS |
| worker unit (`asset-inspection` + `asset-normalization`) | 23 suites / 688 PASS |
| API `design-session-asset-status` unit | 11 PASS |
| `jest.design-session-asset.config.mjs` (live) | 3 suites / 66 PASS |
| `openapi:generate` ×2, client `generate` ×2 | disclosed in §AD |
| Storefront full unit | 44 suites / 652 PASS |
| Storefront typecheck / lint / build | PASS |
| API + worker typecheck / lint / build | PASS |
| `check-app3-s06` + mutations | PASS + 64/64 |
| 26 predecessor gates | PASS (2 pre-existing failures) |
| `pnpm lint` (24/24), `format:check`, `git diff --check` | PASS |
| Chromium L=100 benchmark | p95 16.7 ms |
| WebKit L=100 benchmark | `429` first, then p95 16–17 ms / 0 dropped after the window, §AC |

Reused rather than rerun: the `APP3-B06B`/`B06C` live suites share one config
with the new status suite and were proved in the same invocation.

**Not run** (per §28): `pnpm quality`, the full API suite, the full worker suite,
full repository E2E, Figma mutation, `pnpm install`.

Environment restored: trustworthy-origin helper restored to tracked
configuration, the fixture Product returned to `DRAFT`, browser fixtures deleted,
the benchmark JSON removed. No `.env` was written, no secret was read, echoed or
rotated, and no credential was rotated to make anything pass.

---

## AI. Follow-ups

```text
FU-APP3-B06C-SESSION-LANE-INSPECTION-01 = COMPLETE — CLOSED_BY_APP3-S06
FU-APP3-B06C-READ-RATE-LIMIT-01         = COMPLETE — CLOSED_BY_APP3-S06
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN (not S06's owner)
```

---

## AJ. Commit A

`b510806` — `feat(storefront): add Studio image workflow`.
88 files. No migration, no dependency, no completion report, no `S04`/`S08`/
`S09`/`S10`/`S11` product code.

---

## AK. Roadmap

```text
APP3-B06C = COMPLETE — REVIEW_ACCEPTED
APP3-S06  = COMPLETE — REVIEW_DELIVERED
```

After human acceptance, `APP3-S06 = COMPLETE — REVIEW_ACCEPTED` and the next
recommended frontend checkpoint is **`APP3-S04`**, continuing
`S04 → S09 → S08 → S10 → S11`. `APP3-S04` was not started.

---

## AL. Tree

Branch `production`. Commit A immediately precedes Commit B. Working tree clean.
**Nothing pushed.**

---

## What this report does not claim

`APP3-S10` autosave, `APP3-S08` undo/redo, `APP3-S09` watermark and `APP3-S11`
mobile image editing do not exist. Original bytes are not editor-safe and are
never served. `INSPECTING` is not deliverable. No worker waits inside the upload
request. `APP3-B06C`'s 404 is not a status protocol. Template publication does
not authorize a cloned Session. `TEMPLATE_SOURCE` production intake was **not**
solved. Screenshots cannot be prevented.
