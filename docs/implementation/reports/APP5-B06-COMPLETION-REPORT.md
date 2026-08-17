# APP5-B06 — Admin Private Request-Asset Delivery — Completion Report

## Verdict

```text
APP5-B06 = COMPLETE
```

One contextual Admin binary read is published. It streams the
inspection-approved **source** bytes of an attachment a submitted custom request
is bound to, proves the whole authorization before a single object-storage call,
collapses every association and eligibility miss into one indistinguishable
`404`, and writes nothing.

## Baseline

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `2bf849d` — *feat(app5): view, filter and page the Admin custom-request queue* (`APP5-A01`) |
| Predecessors accepted | `R00`, `G01`, `D01`, `B01`, `DB01`, `B02`, `B03`, `B04`, `B05`, `B07`, `S01`, `S02`, `A01` |
| Published surface at entry | 57 paths / 62 operations / 132 schemas |

Sources inspected before writing code, and only these:

- **`APP5-B01` binding** — `request-asset-policy.ts`: the `COP_IMAGE`/`REFERENCE`
  role pair (`G01-D14`), and the `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` /
  `ACCEPTED` triple a bindable upload must hold.
- **`APP5-B02` source lane** — `request-intake.policy.ts` and
  `request-asset-intake.service.ts`: the allocation names bucket alias
  `ORIGINALS`, the key comes from `buildOriginalObjectKey`, and **no
  normalization event is emitted anywhere in the lane**.
- **`APP5-B04` asset metadata contract** — `read-admin-request-detail.query.ts`:
  the detail resolves attachment metadata through `ASSET_REPOSITORY.findScopedByIds`
  under the same bindable scope and publishes no locator. That is the contract
  A02 renders, and B06 had to interoperate with it unchanged.
- **APP3 private-binary precedent** — `design-session-asset-delivery.service.ts`,
  `public-design-session-asset-preview.controller.ts`,
  `design-session-asset-delivery.policy.ts` / `.errors.ts`, and
  `platform/http-response/client-disconnect.ts`.

Mechanics were reused; APP3's Session **authorization semantics** were not —
there is no cookie, no per-session secret and no failure budget here.

## Endpoint

```text
GET /api/admin/custom-requests/{requestId}/assets/{assetId}/content
    → adminCustomRequestAsset_get
```

Exactly one new operation. `AdminCustomRequestAssetController` derives its own
domain key with **no** `CONTROLLER_DOMAIN_KEYS` entry — the attachment surface is
its own published domain, exactly as `PublicCustomRequestAssetController` is for
the intake lane — so `adminCustomRequest_list`, `_detail`, `_appendNote` and
`_transition` are untouched.

Not added: a generic `/api/admin/assets/{assetId}` binary, any public or customer
delivery, any list/status/metadata route, any upload/replace/delete, any presign,
any storage URL, and any second operation.

## Authorization invariant

```text
AuthenticatedAdmin                                   (APP1 guard, session cookie)
+ custom_request_assets.custom_request_id = requestId
  AND custom_request_assets.asset_id      = assetId  (Ordering, TBL-040)
+ role ∈ {COP_IMAGE, REFERENCE}                      (G01-D14; ATTACHMENT refused)
+ assets.kind           = CUSTOMER_UPLOAD            (Asset, TBL-022)
+ assets.classification = CUSTOMER_PRIVATE
+ assets.status         = ACCEPTED AND deleted_at IS NULL
+ assets.mime_type ∈ {image/jpeg, image/png, image/webp}
+ assets.storage_key present, size_bytes a positive safe integer
= deliverable
```

Every term is conjunctive and every failure is the same answer.

**Both path values authorize.** An asset id alone reaches nothing: the
association read takes the pair, and the port has no method that accepts an
asset id on its own — so the generic address is not merely unimplemented, it has
nothing to be built on. Nothing is authorized by customer ownership, challenge
provenance, asset existence, B04 metadata echoed back by the browser, or
object-key existence.

The request may be in **any** canonical status. Retained evidence stays readable
for a `REJECTED` or `CANCELLED` request, because the association — not the
lifecycle position — is the claim. The request is never mutated.

`adminId` is not a parameter anywhere. There is no APP5 asset token, customer
grant or signed query credential.

## Source decision

`APP5-B02` intentionally emits **no** normalization event: a request photograph
is evidence an operator judges, not media an editor composes. There is therefore
no `NORMALIZED` derivative to serve, and generating one on a read path would
invent a lane no authority asked for.

Serving the source is safe because of what B02 already did before B01 was allowed
to bind it — streamed under a hard byte ceiling, signature verified against the
declared type, decoded within the pixel bounds, and mandatory inspection reached
a favourable verdict. `ACCEPTED` is the name of that whole argument, which is why
it is a *term of the authorization* rather than a status the response reports.

This is the documented divergence from `APP3-B06C`, and it is not a weakening:
that route served a derivative because the Studio needs editor-safe media, and
`SESSION_ASSET_MEDIA_TYPES` is narrower than its intake allowlist only because a
worker writes exactly one output format. Here the deliverable set *is* the intake
allowlist, checked against the persisted `mime_type` the signature bytes
produced — never a client header, a URL suffix or the provider's own
`contentType`. `image/svg+xml` is absent from both, and its absence is
load-bearing: intake refuses SVG, so a value that cannot be stored cannot be
served.

## Descriptor-before-storage

Order, enforced by `DeliverRequestAsset.describe`:

```text
validate UUID path (zod, .strict)
→ AuthenticatedAdminGuard
→ resolve the exact request↔asset association and its role   [Ordering read]
→ resolve the asset inside the bindable scope                [Asset read]
→ verify ACCEPTED + live + deliverable media + complete descriptor
→ only then ObjectStoragePort.getObjectStream
```

The two reads are **sequential and deliberately not parallel**: running them
together would issue the asset lookup for a request that has no claim on it,
which is the exact shape of probe this route refuses.

Proven, not asserted: the integration harness overrides `OBJECT_STORAGE` with a
**call-counting** fake, and every one of the eleven private-miss classes leaves

```text
object-storage calls = 0
```

No storage I/O happens inside a database transaction — the module injects no
`TransactionManager` at all.

## Delivery descriptor seam

`RequestAssetDescriptor` is internal to the use case and carries
`{ role, mediaType, byteSize, objectKey }`. The exported `RequestAssetStream`
carries `{ body, role, contentType, contentLengthBytes }` — no storage key, no
bucket, no checksum, no provider ETag, no customer id, no challenge id, no upload
filename and no inspection detail.

Bounded-context ownership is preserved rather than merged:

- **Ordering** owns the association (`RequestAssetDeliveryRepository`, one read
  method against TBL-040 only);
- **Asset** owns the asset and its source metadata (reached through the existing
  `ASSET_REPOSITORY.findScopedByIds`, the same non-locking read `APP5-B04` uses —
  no new Asset method was added);
- **the storage port** owns object streaming.

No table moved. There is no `findPrivateAsset(assetId)`: the Ordering port cannot
express an asset-only lookup, and the Asset port's scoped read cannot be reached
without the association having already succeeded.

## Streaming

- `ObjectStoragePort.getObjectStream` with the caller's `AbortSignal`; bucket
  alias `ORIGINALS`, key from `assets.storage_key`.
- No buffering: a `StreamableFile` over the provider body. No base64, no
  redirect, no presign, no MinIO/S3 URL, no bucket or key in any header.
- Disconnect: `watchClientDisconnect` (the seam `APP3-B05A` introduced and
  `APP3-B06C` lifted) aborts on the client's `close` unless the response already
  ended, and the handler destroys the upstream body on that abort.
- Provider errors map to a bounded `503` (`REQUEST_ASSET_UNAVAILABLE`);
  `REQUEST_ABORTED` propagates as the abort it is rather than being dressed up as
  a server fault. The raw SDK `cause` is never attached, logged or serialised.

### Headers

```text
200
Content-Type:           the trusted persisted image type
Content-Length:         the reconciled byte size
Cache-Control:          private, no-store
X-Content-Type-Options: nosniff
Content-Disposition:    inline          (no filename — none is persisted)
```

`private` is stated alongside `no-store` because this is the one delivery
surface behind a shared staff gateway. No Range/206, no ETag, no Last-Modified
and no immutable or public caching was added.

### Size reconciliation

`assets.size_bytes` is canonical. When the provider reports a size, it must exist
and equal the persisted value; otherwise the open body is **destroyed first** and
the request fails as a bounded `503` with no partial body and no expected/actual
values in the response. The persisted value is never repaired from provider
state. No extra decorative storage call is made — the reconciliation uses the
size the single `getObjectStream` already returned.

## Safe private miss

Eleven distinguishable internal reasons, one indistinguishable answer
(`404 REQUEST_ASSET_NOT_FOUND`): unknown request, unknown asset, asset bound to
another request, unbound asset, `ATTACHMENT` role, wrong kind, wrong
classification, not `ACCEPTED`, `DELETION_PENDING`/`DELETED`, missing or
incomplete source descriptor, undeliverable persisted media type.

A malformed UUID is the canonical `400`. Admin authentication failure stays at
its own layer as the existing `401` — merging it into the `404` would hide from a
legitimate operator that their session died.

Nothing discloses whether a foreign asset exists, any inspection or scanner
reason, a challenge or customer id, a bucket or key, or deletion internals.

## B04 interoperability

One focused proof (`admin-request-asset-handoff.integration.spec.ts`), booting
B04's read model beside the delivery module:

```text
GET /api/admin/custom-requests/{requestId}
  → assets[0].assetId, role COP_IMAGE, mimeType image/jpeg, sizeBytes
  → GET …/assets/{assetId}/content
  → 200, exact stored bytes, Content-Length === the detail's sizeBytes
```

The detail response still contains no storage key. B04's full queue and detail
suites were **not** rerun and its response shape was **not** broadened — no
incompatibility was found.

## Zero write

The successful GET leaves the statuses and `updated_at` of every
`custom_requests` and `assets` row unchanged, and the row counts of
`custom_request_transitions`, `request_moderation_notes` and `outbox_events`
unchanged (asserted by before/after snapshot).

This is structural, not conventional: the module binds
`REQUEST_ASSET_DELIVERY_REPOSITORY` — one read method — and neither
`CUSTOM_REQUEST_REPOSITORY` nor `CUSTOM_REQUEST_ADMIN_REPOSITORY`, so
`transition()` and `appendNote()` are unreachable from this injector. No
last-access timestamp, no retention extension, no outbox row, no session
rotation. Platform request logging is unchanged and was not disabled.

## No post-submission asset mutation

No attach, replace, detach, delete, re-inspect or role-change route was added.
The contract suite asserts that the only mutations anywhere beneath
`/api/admin/custom-requests` remain B05's two.

## Focused validation ledger

| Command/test | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api typecheck` | New API source and tests | PASS | 3 |
| `pnpm --filter @embroidery/api exec jest src/modules/order/presentation/admin-custom-request-asset.contract.spec.ts` | New published operation | PASS | 3 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-custom-request-asset\|admin-request-asset"` (`CMD-TEST-APP5-B06-ASSET-DELIVERY`) | The whole B06 behaviour: delivery, privacy, provider, auth, disconnect, zero-write, B04 handoff | PASS — 3 suites / 31 tests | 2 |
| `pnpm --filter @embroidery/api openapi:generate` | Route/decorator freeze reached | PASS — 58/63/132 | 1 |
| `pnpm --filter @embroidery/api openapi:check` | Artifact freshness | PASS | 1 |
| `pnpm --filter @embroidery/api-client generate` | One new operation | PASS | 1 |
| `pnpm --filter @embroidery/api-client check:generated` | Generated-client freshness | PASS | 1 |
| `pnpm --filter @embroidery/api-client typecheck` | Regenerated client | PASS | 1 |
| `pnpm --filter @embroidery/api exec eslint <changed>` | Changed API/test files | PASS | 1 |
| `npx prettier --write <changed>` | Changed files | PASS | 1 |
| `git diff --check` | Whitespace | PASS | 1 |

Two failures were diagnosed and fixed rather than worked around, and both were
defects in the **evidence**, not in the runtime:

1. The contract suite's "no generic asset route" assertion was written against an
   assumption instead of the document. `/api/admin/assets/{assetId}` (APP2-B01
   metadata) and `GET …/sides/{sideId}/background` (APP3-A01 binary) both predate
   B06. The assertion now states the real invariant — B06 is the only *new* Admin
   binary, and the pre-existing JSON operation stayed JSON.
2. **The first disconnect proof was vacuous.** It aborted on the response event
   against a small fixture; the body ended normally before the abort landed, and
   `readable.destroyed` is `true` after a normal end too — so it passed without a
   teardown ever happening. It was rewritten to use a raw client that destroys
   the socket on the first body chunk, a trickling source, and the distinguishing
   assertion `destroyed === true && readableEnded === false`. Removing the
   controller's teardown listener was then confirmed to make it **fail**.

**Not rerun, deliberately.** No B01 submission/race, B02 intake/quota/cleanup,
B03 status, B04 queue/detail, B05 moderation/race, B07 catalog, DB01, S01, S02 or
A01 suite; no full API integration, full Jest, Playwright/E2E, DB regression,
worker suite or Figma checker; no APP3 regression and no APP3-B06C evidence
suite; no `tools/check-app3-p03.mjs`, `check-app4-b05.mjs` or
`check-app4-b06-contract.mjs` — none of their inputs changed. SonarQube remains
`REQUIRED_BUT_NOT_CONFIGURED` and no coverage is claimed for it.

## OpenAPI / client

| | Paths | Operations | Schemas |
|---|---:|---:|---:|
| Before | 57 | 62 | 132 |
| After | 58 | 63 | 132 |
| Delta | **+1** | **+1** | 0 |

Generation ran **once**, after the route and decorators were frozen and after the
contract suite was green. The generated client exposes:

```ts
export const adminCustomRequestAssetGet = (
  requestId: string,
  assetId: string,
  options?: SecondParameter<typeof apiRequest<Blob>>,
) => apiRequest<Blob>({ url: `/api/admin/custom-requests/${requestId}/assets/${assetId}/content`,
                        method: 'GET', responseType: 'blob' }, options);
```

Correct Admin path, `Blob`/binary response, no request body, no secret, no
storage identity. No generated file was hand-edited. The **curated** api-client
export is deliberately left to `APP5-A02`'s consumer-driven checkpoint, matching
how `APP3-B03B` deferred its export to `APP3-A03-C1`.

## Files

Added:

```text
apps/api/src/modules/order/domain/delivery/request-asset-delivery.policy.ts
apps/api/src/modules/order/domain/delivery/request-asset-delivery.errors.ts
apps/api/src/modules/order/domain/repositories/request-asset-delivery.repository.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-request-asset-delivery.repository.ts
apps/api/src/modules/order/application/admin/deliver-request-asset.use-case.ts
apps/api/src/modules/order/presentation/admin-custom-request-asset.controller.ts
apps/api/src/modules/order/presentation/schemas/admin-custom-request-asset.request.ts
apps/api/src/modules/order/custom-request-asset-delivery.module.ts
apps/api/src/modules/order/presentation/admin-custom-request-asset.contract.spec.ts
apps/api/src/modules/order/tests/integration/admin-request-asset-context.ts
apps/api/src/modules/order/tests/integration/admin-request-asset-delivery.integration.spec.ts
apps/api/src/modules/order/tests/integration/admin-request-asset-handoff.integration.spec.ts
docs/implementation/reports/APP5-B06-COMPLETION-REPORT.md
```

Modified:

```text
apps/api/src/bootstrap/app.module.ts                       (register the sixth APP5 module)
packages/contracts/openapi/openapi.generated.json          (generated)
packages/api-client/src/generated/embroidery-api.ts        (generated)
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
docs/implementation/SCOPED_COMMAND_INDEX.md
```

No migration. No change to `apps/worker/**`, `apps/admin/**`,
`apps/storefront/**`, the database schema or Figma.

Largest runtime source is 258 lines and the largest test 407 — all inside the
`CLAUDE.md` §6 limits, with no bounded deviation required.

## Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-B07  = COMPLETE
APP5-S01  = COMPLETE
APP5-S02  = COMPLETE
APP5-A01  = COMPLETE
APP5-B06  = COMPLETE
APP5-A02  = INCOMPLETE  NEXT
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

## Follow-ups

```text
FU-APP5-B04-COP-ASSET-DELIVERY-01 = CLOSED_BY_APP5_B06
```

Still open, carried untouched:

```text
FU-APP5-B04-DESIGN-PREVIEW-01
FU-APP5-S01-STUDIO-ENTRY-01
FU-APP5-S02-CONFIRMATION-SUMMARY-01
FU-APP5-S02-MASKED-CONTACT-01
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01
FU-APP5-A01-FILTER-SET-CONFIRM-01
FU-APP5-A01-QUEUE-COUNT-01
```

`FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` remains backend-owned and is a
candidate for a separate narrow fix before phase acceptance. B06 published no
nullable string field, so it neither worsened nor closed it.

## Residual risks

1. **The provider is faked in the integration suite.** Real MinIO streaming is
   not exercised here, deliberately: it would move the suite into the Docker-only
   config and would prove S3 rather than the delivery decision. The seam used is
   `ObjectStoragePort`, which `APP2-T01`'s contract suite already exercises
   against a live provider.
2. **`REQUEST_ASSET_INVALID` is currently unreachable from the handler.** A
   malformed path is refused by the global validation pipe as the canonical
   `400` before the use case runs. The code is retained because the error
   vocabulary is the module's, not the pipe's, and a future non-UUID address
   would need it — it is not dead policy, but it is untested by construction.
3. **`ATTACHMENT` refusal is proved against a hand-seeded fixture.** No APP5
   surface can create such an association, so the test writes one directly; that
   is the only way to prove the refusal exists at all.

## Commit

Committed on `production`. Not pushed.

---

NEXT CHECKPOINT: APP5-A02 — Admin request detail & moderation
