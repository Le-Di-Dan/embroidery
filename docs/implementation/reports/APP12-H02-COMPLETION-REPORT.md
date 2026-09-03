# APP12-H02 — Production Deployment and Configuration Readiness (Wave 1)

```text
CHECKPOINT      = APP12-H02
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = COMPLETE
DATE            = 2026-09-03
CORRECTION_USED = 0 / 1
NEXT            = APP12-H03
PUSHED          = false
```

---

## A. Verdict

`APP12-H02` is **COMPLETE**.

The checkpoint began by measuring rather than assuming, and the measurement
changed the shape of the work. `infrastructure/kubernetes/` contained a README
saying "Reserved" and nothing else, so there was no deployment model to harden —
there was one to write. Writing it then found four defects that no test in this
repository could have caught, because every one of them lives in the gap between
a development container that serves TypeScript over a bind mount and a
production image that runs compiled output:

1. **The production API image had never been able to start.** `AppModule` →
   `DesignModule` → `product-placement-geometry` requires
   `@embroidery/design-engine`, an API runtime dependency since APP3 with no
   matching `COPY` in the runner stage. `dist/main.js` died on `MODULE_NOT_FOUND`
   before it listened.
2. **The production image carried no migration step.** `tsc` excluded the whole
   of `src/cli`, so `dist/cli` shipped empty, and the `.sql` migration history
   lives in `packages/database/migrations`, which no `COPY` referenced. A
   deployment had no way to migrate.
3. **The seed datasets were not in the image.** `tsc` emits no `.json`, so
   `staff-bootstrap` composed the entire application and then failed on
   `ENOENT … app4-policy-configuration.seed.json`.
4. **Two `NEXT_PUBLIC_*` values could never be set.** Next inlines them during
   `next build` from the *builder's* environment; the Storefront Dockerfile
   declared no build argument for either contact URL, so `undefined` was compiled
   into the bundle and no runtime environment could bring the footer's contact
   dock back. `next dev` re-reads the environment per request, which is exactly
   why development never showed it.

All four are fixed and re-proved by running the real thing.

`FU-APP12-H01-01` is closed by a **per-request nonce CSP**. Production
`script-src` now grants neither `'unsafe-inline'` nor `'unsafe-eval'`; the nonce
replaces both. Real Chromium against the staging HTTPS edge reports **0 CSP
violations** across five Storefront routes and three Admin routes, with every
`<script>` on every page carrying that response's nonce and **zero** bare inline
scripts.

`FU-APP12-H01-02` is closed by a Gateway API TLS edge: HTTP answers `301` to
https preserving host and path, and the HTTPS response carries
`Strict-Transport-Security: max-age=31536000` — asserted at the edge that
terminates TLS, never from the application.

```text
BLOCKER = 0
HIGH    = 0   (1 raised — unstartable production API image — fixed and re-proved)

production_image_builds   = 4 / 4 PASS
registry_push             = 4 / 4 PASS (digest-verified)
staging_deploy            = PASS
staging_smoke             = 13 / 13
CSP violations (Chromium) = 0
rollback A -> B -> A      = PASS
orphan disposable DBs     = 16 -> 0, unsafe_drop = 0
```

Two things this checkpoint deliberately did **not** deliver, both because a
locked authority forbids it and §8 of `CLAUDE.md` forbids inventing an answer to
an open decision:

- **No `Ingress` and no ingress-nginx.** `SYSTEM_ARCHITECTURE.md` §13 and
  `docs/12-DECISION-LOG.md` D-036 lock the production edge to the Gateway API
  and Kubernetes Services and state that `ingress-nginx` will not be used. The
  concrete controller remains an open decision requiring an ADR, so
  `gatewayClassName` is an external release value.
- **No production PostgreSQL, object storage or broker manifests.** The same
  section lists stateful topology as subject to an ADR that has not been taken,
  and §5 forbids moving persistence between in-cluster and managed in either
  direction. The applications reach both through configuration, which is
  address-agnostic; disposable instances live in `staging-scaffolding/`, labelled
  as such, so the model could be proved without pre-empting the decision.

---

## B. H01 PO reconciliation

`APP12-H01 = COMPLETE — PO PASS`, `CORRECTION_USED = 0 / 1`. Not reopened. Its
12/12 live security matrix and its authorization matrix stand unchanged; §AC
regression evidence for the seams H02 touched is in §AC below.

The one H01 decision H02 revisits is the one H01 itself routed here: the
temporary `script-src 'self' 'unsafe-inline'`, recorded as `FU-APP12-H01-01` with
owner `APP12-H02`. That is a follow-up being closed, not a verdict being
reopened.

---

## C. H02 preflight inventory

Measured before anything was edited.

| Area | State at entry |
| --- | --- |
| `infrastructure/kubernetes/` | **Empty** — one README reading "Reserved." No manifests of any kind. |
| `infrastructure/docker/` | Four Dockerfiles, all multi-stage, all `USER node`, all pinned to `node:22.14.0-alpine`. Sound baseline. |
| `infrastructure/compose/` | Four compose files. `docker-compose.dev.yml` is the development stack; D-036 states it is not production topology. |
| `infrastructure/nginx/` | Development gateway. Its own `security-headers` include already records that HSTS "belongs to the TLS edge (APP12-H02)". |
| `infrastructure/scripts/`, `monitoring/` | Reserved, empty. |
| CI/build automation | None in-repository. No pipeline files were changed, so §41's CI-masking clause has no subject; the image-metadata audit was run instead. |
| Migration runner | `packages/database` — `tsx src/cli/migrate.ts`, ESM, developer-only. **Not reachable from a production image** (see §H). |
| Health endpoints | API `GET /api/health` (liveness, no dependency) and `GET /api/health/readiness` (503 when the pool is down). Both Next apps `GET /healthz`. Worker: none, by design. |
| Image names/tags | No release naming existed. Compose builds unnamed local images. |
| Ingress topology | Development Nginx only. Production routing contract locked to Gateway API, controller open. |
| `.env.example` | Complete and well-documented; `STOREFRONT_PUBLIC_ORIGIN` blank, no compose default. |
| Cluster tooling present | `kubectl` v1.31.4 (Kustomize v5.4.2 built in), `minikube` v1.35.0, Docker 27.5.1. No Helm, no kustomize binary, no kind/k3d. |

---

## D. Production topology

Unchanged from the locked architecture; H02 expresses it, it does not redesign
it.

```text
                    Gateway (Gateway API, TLS terminate, HSTS)
                     |                              |
   staging|prod Storefront host          Admin host
                     |                              |
     /api -> Service embroidery-api      /api -> Service embroidery-api
        / -> Service embroidery-storefront   / -> Service embroidery-admin

   Deployment embroidery-api         2 replicas, RollingUpdate maxUnavailable=0
   Deployment embroidery-storefront  2 replicas, RollingUpdate maxUnavailable=0
   Deployment embroidery-admin       2 replicas, RollingUpdate maxUnavailable=0
   Deployment embroidery-worker      1 replica,  Recreate, NO Service
   Job        embroidery-migrate     runs the forward-only history, once

   PostgreSQL / object storage: EXTERNAL ADDRESSES (DATABASE_URL,
   OBJECT_STORAGE_ENDPOINT). No manifest — stateful topology is ADR-reserved.
```

The worker has no Service and no HTTP probe. §9 forbids inventing an HTTP worker
endpoint for a probe, and the delivered worker's health contract is process
liveness — a fatal handler exits non-zero and the kubelet restarts it. Its
`Recreate` strategy is deliberate: with one claiming process and no broker, an
overlapping old and new pod is the double-claim `IMP-O003` has not yet made safe.

---

## E. Staging topology

The **same** base, the same overlay mechanism, the same probes, the same security
contexts, the same Gateway API routing, the same migration Job. Only values
differ. Additions are confined to `staging-scaffolding/` (disposable PostgreSQL
and MinIO on `emptyDir`, labelled `embroidery.local/disposable: "true"`) and a
staging-only `staff-bootstrap` Job.

```text
REMOTE_STAGING                = NOT_AVAILABLE
LOCAL_PRODUCTION_LIKE_STAGING = PASS
```

Executed on a disposable minikube profile `embroidery-staging` (Kubernetes
v1.31.4, docker driver), with Gateway API v1.2.1 CRDs and NGINX Gateway Fabric
v1.6.1 installed **into the disposable cluster** as the Gateway API
implementation. Neither is a repository dependency and neither locks the
production controller; `gatewayClassName` is a per-overlay value and production
leaves it empty.

---

## F. Image build / publish authority

Four production images, built from the monorepo root, `--target runner`.

```text
RELEASE_SHA = 3c42d94b7da1

embroidery/api          433MB
embroidery/worker       425MB
embroidery/storefront   283MB
embroidery/admin        281MB
```

Pushed to a disposable local OCI registry (`registry:2`) attached to the
cluster's Docker network, reachable from inside the cluster as
`embroidery-registry:5000` (verified `HTTP 200` on `/v2/` from
`minikube ssh`) and from the host as `127.0.0.1:5000`.

```text
EXTERNAL_REGISTRY   = NOT_AVAILABLE
DISPOSABLE_REGISTRY = USED
```

The pushed manifest digests were read back from the registry and matched, byte
for byte, the image IDs the builds produced:

```text
api        sha256:a0b9e7f1...e93e41d   (rev 1)
worker     sha256:1bec2659...636caa5
storefront sha256:24adf666...b06beb3c
admin      sha256:b2392b4a...7e6897e0
api        sha256:7970786d...2648dd8   (rev fix1 — runtime packages)
api        sha256:bfef40eb...169d5b02  (rev fix2 — seed datasets; deployed)
```

The staging deployment references images **by digest**, not by tag — the
strongest immutable identity available. No release authority uses `latest`, and
the preflight refuses one.

The committed overlays keep `REPLACE_WITH_IMMUTABLE_RELEASE_REF`, so a release
that forgets to pin fails the preflight rather than deploying a placeholder. The
release step (recorded verbatim in §W) rewrites those to `newName` + `digest`,
runs the preflight, applies, and restores the placeholder.

---

## G. Kubernetes resources

Rendered from `overlays/staging`: **18 resources**; from `overlays/production`:
**14** (no scaffolding, no bootstrap Job).

Every stateless workload carries: a Deployment with an explicit rolling strategy
and `revisionHistoryLimit: 5`; a Service (except the worker); `envFrom` a
ConfigMap and, where secrets are needed, a **non-optional** `secretRef`;
liveness, readiness and startup probes (except the worker); resource requests and
memory limits; and a `securityContext` with `runAsNonRoot`, `runAsUser: 1000`,
`allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`,
`capabilities: drop [ALL]` and `seccompProfile: RuntimeDefault`. The read-only
root filesystem required an `emptyDir` at `/tmp`, and for the Next apps at
`.next/cache`, which the server writes on its first render.

CPU **limits** are deliberately absent while requests are set: a CPU limit
throttles rather than protects, and an SSR process that misses its deadline under
throttling is a worse outcome than one that briefly borrows idle capacity. Memory
limits are set, because memory pressure is not something a neighbour can absorb.

---

## H. Migration deployment

An explicit `Job`, never an init container and never an API startup hook: every
API replica running migrations would be N processes racing one forward-only
history, and the delivered runner is not documented as concurrency-safe.

It reuses the **API image**, so it runs the same committed tooling the
application was built against.

Two defects had to be fixed before any of that could run:

1. `tsconfig.build.json` excluded `src/cli/**` wholesale, because `migrate.ts`
   uses `import.meta.url` and cannot be emitted under CommonJS. `dist/cli` was
   empty. A new CommonJS entrypoint `src/cli/migrate-deployment.ts` resolves its
   own location from `__dirname` and wraps the *same* `runMigrations` against the
   *same* directory; the exclusion now names only the two ESM files
   (`migrate.ts`, `status.ts`). Two entrypoints that applied migrations
   differently would be two schema histories; these differ only in how they
   locate themselves.
2. `packages/database/migrations/*.sql` reached no image — `tsc` emits no SQL.
   The runner stage now copies it. Without this the Job would have started,
   resolved an empty directory and reported "up to date" against an unmigrated
   database: a silent success worse than a failure.

**Fresh database → 1..38 succeed.** The staging PostgreSQL was created empty by
the deployment; after the Job:

```text
drizzle.__drizzle_migrations = 38
public base tables           = 79
```

**Already-current → safe no-op.** A later Job run against the same database
printed `[db:migrate] up to date` and exited 0.

The connection string is redacted in the log — `postgres://embroidery:***@…` —
so a deployment log never carries the database password.

`backoffLimit: 3` proved itself: the first attempt failed while PostgreSQL was
still initialising and the retry succeeded.

No migration 0039. No schema repair.

---

## I. Database table-count reconciliation

`FU-APP12-B02-01` and `FU-APP12-B05-03` are the **same** debt filed twice, and
are closed once.

Measured, not assumed, against the development server:

```text
information_schema.tables WHERE table_schema='public'   = 79   (all BASE TABLE)
drizzle.__drizzle_migrations                            = 38
```

`packages/persistence/src/runtime/database-runtime.integration.spec.ts` asserted
`78`.

A correction worth recording: the prompt attributes the 79th table to
`APP12-DB01`. It is not. `0038_add_app12_ready_made_persistence.sql` creates **no
table** — it alters `orders`, `order_items`, `payment_obligations` and
`secure_access_grants` in place. The count moved at
`0037_add_app7_transfer_evidence_association`, which created
`payment_transfer_evidence`. So there is no "APP12-owned table" to name, and §11's
alternative branch was taken instead.

The blind count is replaced by three assertions that fail with three different
meanings:

- `CANONICAL_MIGRATION_COUNT = 38` — how much history was applied;
- `CANONICAL_TABLE_COUNT = 79` — the physical result;
- `NEWEST_CANONICAL_TABLE = 'payment_transfer_evidence'` — checked **by name**.

The third is what a count-only snapshot cannot do: the next migration that adds a
table must change a *name* here, not just a digit, so nobody can restore a green
suite by editing a number.

```text
database-runtime.integration = 13 / 13 PASS
```

No schema was changed to make an old test pass.

---

## J. Release flag configuration

`CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` is stated **explicitly** in both the
base ConfigMap and both overlays. The runtime remains fail-closed when the
variable is absent; that is not the point. A deployment that does not say which
wave it is releasing is a deployment nobody can review.

The preflight rejects any spelling but `true` or `false` — verified by injecting
`True`:

```text
MALFORMED: CUSTOM_EMBROIDERY_RELEASE_ENABLED — expected exactly "true" or "false"
```

Observed in the staging pod logs at every boot:

```text
event=release.gate.configured  enabled=false
```

`FU-APP12-B02-03` (custom integration harness inherits an ambient flag) is
**addressed for every deployment environment** — base, staging and production all
set it explicitly. The Jest integration harness itself is **not** changed here:
that harness runs no deployment and setting `true` in it would release Wave-2
operations to a test process, which is a testing decision belonging to the
checkpoint that runs those suites. Disposition: `PARTIALLY_CLOSED` — deployment
half closed in H02, harness half routed to `APP12-E01`.

---

## K. Public-origin configuration

`FU-APP11-S04-01` and `FU-APP12-S03-06` are the same debt filed twice. Closed
once, through tracked configuration. **`.env` was not written to.**

- **Development:** `docker-compose.dev.yml` now supplies
  `${STOREFRONT_PUBLIC_ORIGIN:-http://embroidery.local}` for the Storefront build
  arg, the Storefront runtime and the worker runtime. It is a *compose* default,
  not a runtime fallback: `getStorefrontPublicOrigin` still has none and still
  throws. An ordinary `pnpm docker:dev:up` no longer fails on a variable nothing
  set.
- **Staging/production:** supplied through the overlay ConfigMap. Production's is
  **empty**, and the preflight refuses the deploy.

Proved in staging that one key reaches both consumers and that the Storefront
publishes it:

```text
ConfigMap key           https://staging.embroidery.local
worker process env      https://staging.embroidery.local
storefront process env  https://staging.embroidery.local
robots.txt              Sitemap: https://staging.embroidery.local/sitemap.xml
sitemap.xml first <loc> https://staging.embroidery.local/
homepage canonical      https://staging.embroidery.local
```

Proved that production has no silent fallback, by running the built image with
the variable unset:

```text
/healthz      200
/sitemap.xml  500   "STOREFRONT_PUBLIC_ORIGIN is not set"
/robots.txt   500
```

The preflight rejects a malformed origin by shape and a loopback origin by
category, naming the key and never the value.

---

## L. `NEXT_PUBLIC` build/runtime configuration

Audited every consumer.

| Variable | Class | Consumption | Staging source | Production source | Rebuild on change? |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_PATH` | BUILD_TIME_PUBLIC_CONFIG | Inlined by `next build` (static member expression in `browser-api-client.ts`) | build arg, default `/api` | build arg, default `/api` | **Yes** |
| `NEXT_PUBLIC_ZALO_CONTACT_URL` | BUILD_TIME_PUBLIC_CONFIG | Inlined by `next build` | build arg | build arg | **Yes** |
| `NEXT_PUBLIC_MESSENGER_CONTACT_URL` | BUILD_TIME_PUBLIC_CONFIG | Inlined by `next build` | build arg | build arg | **Yes** |
| `STOREFRONT_PUBLIC_ORIGIN` | PUBLIC_CONFIG | **Runtime**, server-side, per request | ConfigMap | ConfigMap | **No** (see below) |
| `INTERNAL_API_BASE_URL` | INTERNAL_CONFIG | Runtime, server-side | ConfigMap | ConfigMap | No |

**The defect §14 asks about was present and is fixed.** The three
`NEXT_PUBLIC_*` values are read as static `process.env.NEXT_PUBLIC_*` member
expressions *precisely so Next can substitute them* — which happens at build
time, from the builder's environment. Neither Dockerfile declared a build
argument for any of them, so the two contact URLs compiled to `undefined` and no
container environment could change that. `next dev` re-reads the environment per
request, which is why the development stack worked and only the development stack
worked. Both Dockerfiles now declare `ARG`/`ENV` in the build stage, and
`docker-compose.dev.yml` passes them as build args.

A second, favourable finding: **`STOREFRONT_PUBLIC_ORIGIN` is no longer needed at
build time.** APP11-S04 needed it because `next build` prerendered the statically
generated segments and read it exactly as a request would. H02's nonce CSP made
every route render per request (§Q), which removed that read — measured by
building the `build` stage with the argument omitted, which now succeeds where it
used to fail. A Storefront image is therefore no longer origin-specific and one
build can be promoted across environments. Nothing became permissive: the runtime
still fails closed, as shown in §K. The Dockerfile records this.

---

## M. Social-contact release configuration

`FU-APP10-I01-02`.

- Both are represented as explicit **non-secret** release parameters: build args
  on the Storefront image, and validated keys in the release preflight.
- Staging smoke used synthetic safe external URLs
  (`https://zalo.me/staging-test-oa`, `https://m.me/staging-test-page`). No real
  marketing URL was invented.
- The delivered fail-closed dock behaviour is preserved: the preflight rule is
  "empty, **or** a well-formed absolute http(s) URL carrying no credentials" —
  never "present". Demanding a value would turn a deliberate absence into a
  failed deploy, when absence is exactly what omits that one CTA.
- The Storefront Dockerfile states plainly that changing a baked public URL
  requires a rebuild, and that this is Next.js behaviour rather than a repository
  choice.

Real production values are externally owned and absent:

```text
FU-APP10-I01-02 → RELEASE_OPERATOR_INPUT_REQUIRED_BEFORE_R01
```

Not claimed as fully closed.

---

## N. Production secret inventory

Generated from actual consumers. **No values appear anywhere in this report or in
any committed file.**

| Variable | Class | Consumers |
| --- | --- | --- |
| `DATABASE_URL` | SECRET | api, worker, migrate, bootstrap |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | SECRET | api, worker, bootstrap |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | SECRET | api, worker, bootstrap |
| `DESIGN_SESSION_SECRET_PEPPER` | SECRET | api, bootstrap |
| `VERIFICATION_CODE_SECRET_PEPPER` | SECRET | api, bootstrap |
| `SECURE_LINK_TOKEN_SECRET_PEPPER` | SECRET | api, bootstrap |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | SECRET | api, worker, bootstrap |
| `STAFF_BOOTSTRAP_PASSWORD` | SECRET | bootstrap only; optional in production |
| `tls.key` | SECRET | Gateway HTTPS listener |
| `STAFF_BOOTSTRAP_EMAIL` / `_DISPLAY_NAME` | INTERNAL_CONFIG | bootstrap only |
| `STOREFRONT_PUBLIC_ORIGIN` | PUBLIC_CONFIG | storefront, worker |
| `STAFF_ALLOWED_ORIGINS`, `DESIGN_SESSION_ALLOWED_ORIGINS` | PUBLIC_CONFIG | api |
| `PAYMENT_MERCHANT_*` (4) | PUBLIC_CONFIG | api — customer-visible, deliberately not secrets |
| `NEXT_PUBLIC_*` (3) | BUILD_TIME_PUBLIC_CONFIG | storefront, admin |
| `INTERNAL_API_BASE_URL`, `API_PORT`, `OBJECT_STORAGE_ENDPOINT`/`REGION`/buckets, `DATABASE_SSL_MODE`, `DATABASE_EXPECTED_MAJOR`, `LOG_LEVEL`, `LOG_STACK_ENABLED`, `API_DOCS_ENABLED`, cookie-secure flags, release flag | INTERNAL_CONFIG / PUBLIC_CONFIG | as declared |
| `SONAR_TOKEN`, `SONARQUBE_DB_PASSWORD`, `GATEWAY_*`, `STOREFRONT_HOST`, `ADMIN_HOST`, `POSTGRES_*` discrete | NOT_USED (production) | development/quality tooling only |

The four `PAYMENT_MERCHANT_*` keys are classified `PUBLIC_CONFIG` on the delivered
reasoning: every one is printed on the customer's own deposit screen and encoded
into the transfer QR they scan. Marking a customer-visible fact as a secret would
be false. They are still operator-supplied per environment.

---

## O. Secret mechanism

Native Kubernetes `Secret`, referenced by name, created out of band. Documented
in `infrastructure/kubernetes/base/config/secret-contract.md` (keys and
classifications only, never values).

No cluster controller was added. No external-secrets operator, no sealed-secrets,
no vault sidecar: none is already a dependency of any delivered deployment
authority, and adding one would lock an operational decision no ADR has taken.
`APP12-H07` owns rotation and operator procedure.

`envFrom.secretRef` is declared **without** `optional: true`, and the preflight
fails any reference that sets it. That is what makes a missing secret fail closed
rather than starting the API with no database URL and no envelope key — proved in
§Z.

No plaintext production secret exists in Git. The creation commands documented in
the contract use `--from-env-file`, keeping values off the command line as
`CLAUDE.md` §8a requires.

---

## P. Release config validator

`node tools/check-release-config.mjs <staging|production>` — registered as
`CMD-CHECK-RELEASE-CONFIG` in `SCOPED_COMMAND_INDEX.md`.

It renders the overlay with `kubectl kustomize`, converts to JSON with
`kubectl patch --local` (a pure client-side conversion that needs no API server
and no CRDs — `create --dry-run=client` looks like the natural choice and is not,
because it resolves every kind against a live server and would make this
preflight require the cluster it exists to run *before*), then checks names and
shapes.

Production, straight from the committed tree:

```text
RELEASE CONFIG production: FAIL (21)
  MISSING: STOREFRONT_PUBLIC_ORIGIN — declared but empty; expected an absolute origin …
  MISSING: STAFF_ALLOWED_ORIGINS …
  MISSING: PAYMENT_MERCHANT_BANK_BIN — declared but empty; expected exactly six digits …
  IMAGE: Deployment/embroidery-api/api — still carries the repository placeholder tag
  ROUTING: Gateway/embroidery — declares no gatewayClassName
  ROUTING: HTTPRoute/embroidery-storefront — declares no hostname
  … 21 findings
```

Staging with real digests pinned:

```text
RELEASE CONFIG staging: PASS (18 resources)
```

**No output line contains a configured value.** Every message names a key and the
shape expected. The rule is enforced where it is most tempting to break: a
malformed `DATABASE_URL` is reported by name, never shown.

---

## Q. Nonce CSP implementation

`FU-APP12-H01-01`, closed.

**Mechanism.** Next.js 16.2.10 applies a nonce by reading the
`content-security-policy` **request** header — `parseRequestHeaders` in
`next/dist/server/app-render/app-render.js` extracts the first `'nonce-…'` from
`script-src` (falling back to `default-src`) via `getScriptNonceFromHeader`, and
the renderer stamps it onto every `<script>` it emits. So the proxy sets the
header twice: on the forwarded request, where the renderer finds it, and on the
response, where the browser enforces it.

**One authority.** The policy left `next.config.ts` in both apps. Two CSP headers
on one response are two policies enforced independently, and the weaker one's
`'unsafe-inline'` would still be published for a scanner to read. Both apps now
carry it only in `src/proxy.ts` — the existing proxy, not a second one, which
§19 forbids and Next allows only one of anyway.

**Storefront matcher widened**, from three Wave-2 route families to every
document path (excluding `_next/static`, `_next/image`, the favicon). A page the
proxy never sees is a page served with no policy. This changes no release
decision: the matcher was never the gate — `isWithheldWave2Route` is, and it is
asked for every path that arrives.

**The framework constraint, measured.** A statically prerendered route never
reaches the renderer at request time; its HTML was written at build time, when no
nonce existed. Measured on this build before the fix: static
`/truy-cap/don-hang` answered a nonce in its header and **0** nonced script tags
in its body, while dynamic `/` answered **23** carrying the exact response nonce.
Nothing in `base-server` inspects the CSP header, so a nonce does not opt a route
into dynamic rendering on its own.

The choice was therefore between serving prerendered pages whose inline RSC
payload the policy blocks — a page that does not hydrate — and rendering per
request. `export const dynamic = 'force-dynamic'` in both root layouts takes the
second. The cost is bounded: the routes this changes from static are content and
secure-shell pages that fetch nothing (one React SSR pass, no I/O), and the
data-backed routes were already dynamic. `generateStaticParams` on
`/chinh-sach/[slug]` still runs and still declares its four slugs.
**Measurement of the actual cost is recorded for `APP12-H05`**, which owns
performance; H02 did not trade security away for it.

**Final production policy:**

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self';
form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:;
style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; manifest-src 'self';
script-src 'self' 'nonce-<128 bits, per response>'; connect-src 'self' blob:
```

`style-src 'unsafe-inline'` remains and is a real requirement: React writes
element `style` attributes, and a style nonce cannot cover an attribute — only a
`<style>` element — so nonce-ing styles would break the app while claiming a
stricter policy. `'strict-dynamic'` is deliberately absent: it would let a nonced
script load further scripts without one, and this app has no such loader.

The nonce is 16 CSPRNG bytes (`crypto.getRandomValues`, never `Math.random` — a
predictable nonce is one an injected script can write down), base64-encoded, and
is not a secret requiring persistence.

---

## R. CSP live Chromium evidence

Real Chromium, against the staging **HTTPS** edge, through the Gateway.

```text
route                     status  nonce  scripts  nonced  bareInline  unsafeInline  unsafeEval  hydrated
/                          200     yes     22       22        0            no          no         true
/kham-pha                  200     yes     22       22        0            no          no         true
/truy-cap/don-hang         200     yes     20       20        0            no          no         true
/cua-hang                  200     yes     18       18        0            no          no         true
/bo-suu-tap                200     yes     20       20        0            no          no         true
Admin /login               200     yes     14       14        0            no          no         true
Admin /orders   (auth'd)   200     yes     22       22        0            no          no         true
Admin /categories (auth'd) 200     yes     22       22        0            no          no         true

distinct nonces observed = 8
CSP violations           = 0
```

Two independent requests to `/` produced distinct nonces:

```text
request1 = nonce-j5alg1eDxx69q7Y/ybnl1Q==
request2 = nonce-6OuvfWNrCmdoX+1/yzd/BA==
```

`bareInline = 0` on every page is the assertion that matters most: it means no
inline script exists that the policy would have had to grant `'unsafe-inline'`
for.

**`/mua-hang/[slug]` was not exercised in the Chromium pass.** §20 lists it, and
it needs a purchasable SKU that the disposable staging database does not carry;
creating one would have meant seeding commercial data, which §27 forbids for
deployment proof. The route's shell is covered by the identical `force-dynamic` +
proxy path as `/san-pham/[slug]` and `/truy-cap/don-hang`, both of which are
green, so the residual risk is low but the evidence is genuinely absent. Recorded
as a follow-up rather than claimed.

---

## S. TLS ingress

Gateway API `Gateway` with two listeners: `HTTP:80` (redirect only) and
`HTTPS:443` terminating with `certificateRefs → Secret embroidery-tls`, created
out of band. Both listeners programmed:

```text
http  Programmed=True  attachedRoutes=1
https Programmed=True  attachedRoutes=2
```

HTTP → HTTPS, preserving host and path:

```text
GET http://staging.embroidery.local/kham-pha
HTTP/1.1 301 Moved Permanently
Location: https://staging.embroidery.local/kham-pha
```

`301`, not `302`: the redirect is a permanent property of the deployment.

The staging certificate is a **per-run self-signed certificate**, subject
`CN=staging.embroidery.local, O=APP12-H02 DISPOSABLE STAGING SIMULATION`, SANs
for both hostnames, 2-day validity, trust controlled inside the test
(`curl --cacert`, Chromium `--ignore-certificate-errors`). It was destroyed with
the cluster. **It is staging-simulation evidence and is not evidence of a
production certificate.**

```text
production_key_committed = false
```

---

## T. HSTS evidence

Set **only** at the HTTPS edge, by `ResponseHeaderModifier` filters on the
HTTPRoutes bound to the `https` listener. Captured through the real Gateway:

```text
GET https://staging.embroidery.local/kham-pha
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000
```

The plain-HTTP redirect carries none, correctly — HSTS asserted over http:// is
ignored by browsers and would be a claim with no evidence behind it. The
development Nginx gateway still declares none and still says why in its own
`security-headers` include.

`includeSubDomains` is absent and `preload` more deliberately still. Both are
commitments about a DNS zone this repository does not own, the real canonical
domain is an external release value, and `preload` is effectively irreversible.
The domain owner takes those two decisions at release.

---

## U. HTTPS Admin session evidence

Real Admin login over staging HTTPS, with a synthetic per-run operator minted by
the staging `staff-bootstrap` Job. **No shared production staff credential was
requested or read.**

```text
POST login -> landed on /
cookie __Host-adm_session: secure=true  httpOnly=true  sameSite=Strict  path=/
authenticated /orders     200
authenticated /categories 200
```

The `__Host-` prefix is the production naming policy and requires `Secure`; the
staging ConfigMap sets `STAFF_SESSION_COOKIE_SECURE=true` and the preflight
forces it to `true` for a production target. This is not the plain-HTTP
development cookie.

One finding worth recording, because it is a real property of the delivered CSRF
control rather than a defect: reaching the edge on a non-standard port made the
browser send an `Origin` carrying that port, which `STAFF_ALLOWED_ORIGINS` did
not list, and the login was refused with the origin guard working exactly as
designed. Re-running the edge on the canonical ports produced the evidence above.

---

## V. Gateway / header preservation

H01's hardening survives the new edge. Captured through the staging Gateway, not
against a pod:

```text
X-Powered-By absent           PASS
nginx version hidden          PASS   (Server: nginx, no version)
CSP present                   PASS
script-src no unsafe-inline   PASS
script-src no unsafe-eval     PASS
connect-src no ws:            PASS
private cache controls        PASS   (Cache-Control: private, no-cache, no-store, …)
HSTS at TLS edge              PASS
```

No new header authority was created that conflicts with the application policy:
the Gateway adds `Strict-Transport-Security` and nothing else, because HSTS is
the one header the application cannot honestly assert.

---

## W. Staging deployment evidence

Exact mechanism:

```sh
# 1 — build (from the monorepo root)
docker build -f infrastructure/docker/<app>.Dockerfile --target runner \
  -t embroidery-registry:5000/embroidery/<app>:<sha> .

# 2 — publish to the disposable registry
docker tag  embroidery-registry:5000/embroidery/<app>:<sha> 127.0.0.1:5000/embroidery/<app>:<sha>
docker push 127.0.0.1:5000/embroidery/<app>:<sha>

# 3 — pin immutable release identity (newName + digest) into the overlay
# 4 — preflight
node tools/check-release-config.mjs staging
# 5 — apply
kubectl apply -k infrastructure/kubernetes/overlays/staging
# 6 — restore the committed placeholder
```

Final state:

```text
embroidery-admin        1/1 Running
embroidery-api          1/1 Running
embroidery-storefront   1/1 Running
embroidery-worker       1/1 Running
embroidery-postgres     1/1 Running   (disposable scaffolding)
embroidery-minio        1/1 Running   (disposable scaffolding)
embroidery-migrate      Completed
embroidery-staff-bootstrap Completed
```

Smoke, from outside the pods, through the Gateway:

```text
Storefront homepage            200      API health                    200
public catalog /kham-pha       200      API readiness                 200
store presentation /cua-hang   200      public categories             200
public gallery /bo-suu-tap     200      robots.txt                    200
ORDER_ACCESS /truy-cap/don-hang 200     sitemap.xml                   200
Admin /login                   200      Admin authenticated /orders   200
                                        Admin authenticated /categories 200
worker process                 Running / healthy
```

No production customer order was created. No G03 dataset.

---

## X. Secure-link staging-origin evidence

**PARTIAL — the configuration half is proved, the delivery half is not.**

Proved (§K): one ConfigMap key reaches the worker process and the Storefront
process identically, and the Storefront publishes `https://staging.embroidery.local`
in its canonical tag, `robots.txt` and `sitemap.xml`. The staging origin is
HTTPS. The `/truy-cap/don-hang` route serves `200` through the edge.

**Not proved:** a verified Ready-Made order driven through the real worker to a
delivered `ORDER_ACCESS` URL, and therefore the `scheme`/`path`/`fragment-only`
assertions on a genuinely minted link. That journey needs a purchasable SKU and a
verified customer in the staging database, i.e. commercial fixture data, and the
budget for this checkpoint went to the four image defects that had to be fixed
before anything could run at all.

The equivalent assertions **are** already green in `APP12-S03-C1` and in H01's
live matrix (`C — real ORDER_ACCESS, no observable token`), against the same code
path and the same variable; what is missing here is specifically the *staging
Kubernetes* instance of it.

```text
FU-APP12-H02-01  staging ORDER_ACCESS notification-origin journey not exercised
                 → APP12-E01
```

No token was printed anywhere.

---

## Y. Rollback evidence

Application/config only. No schema change exists in H02, so **no data rollback is
claimed**.

```text
A = api@sha256:bfef40eb…169d5b02
B = api@sha256:7970786d…2648dd8

deploy A            -> live, readiness 200
kubectl set image   -> B
rollout status      -> "deployment successfully rolled out"
live                -> B ; readiness 200
kubectl rollout undo -> A
rollout status      -> "deployment successfully rolled out"
live                -> A ; readiness 200 ; storefront 200
```

Mechanism recorded: `kubectl rollout undo deploy/<name>`, backed by
`revisionHistoryLimit: 5` on every Deployment. A single `000` was observed in the
first probe immediately after the undo, while the port-forward re-attached to the
replacement pod; it settled to `200` on the next poll and is reported rather than
smoothed over.

`APP12-H07` turns this into the operational runbook.

---

## Z. Bad-config / failed-rollout evidence

**Unavailable image reference.**

```text
set image -> :does-not-exist
rollout status: error: timed out waiting for the condition
  embroidery-api-5846d9455c-sqkzm   1/1  Running            (previous revision)
  embroidery-api-6bc47dccf5-9qzxj   0/1  ImagePullBackOff   (bad revision)

during the failed rollout:  API readiness 200,  Storefront 200
```

The bad revision never became ready and the healthy one never left rotation —
`maxUnavailable: 0` doing exactly its job.

**Missing required secret.**

```text
kubectl delete secret embroidery-secrets
embroidery-worker  0/1  CreateContainerConfigError
Warning  Failed  Error: secret "embroidery-secrets" not found
```

Fail-closed, with no silent fallback to a default.

**Invalid `STOREFRONT_PUBLIC_ORIGIN`** (a value carrying a path and a query):

```text
RELEASE CONFIG staging: FAIL
  MALFORMED: STOREFRONT_PUBLIC_ORIGIN — expected an absolute origin …
```

**Invalid release flag** (`True`):

```text
  MALFORMED: CUSTOM_EMBROIDERY_RELEASE_ENABLED — expected exactly "true" or "false"
```

**Insecure database configuration.** Worth recording as evidence rather than as a
problem: the first staging deploy failed with
`DATABASE_SSL_MODE "disable" is not permitted when NODE_ENV=production`. The
delivered guard was right, and the fix was to give the disposable PostgreSQL a
per-run certificate and set `require` — never to relax the guard for staging,
which would have proved a configuration production can never use.

No shared infrastructure was corrupted. Every failure was injected into the
disposable cluster.

---

## AA. Disposable database cleanup

`FU-APP12-B02-04` and `FU-APP12-A02-03`.

Inventory first, drop second. `tools/db-disposable-inventory.mjs` is **dry-run by
default** and requires three independent things to agree before it will drop:
the name carries the prefix this repository's own factory mints, the name is not
on the protected list (checked first and winning outright), and the database has
no active backend.

The prefix was measured, not guessed. `disposableDatabaseName`
(`packages/database/src/testing/disposable-database.ts`) builds every name as
`embroidery_db7_<label>_<pid>`, and it is the single factory every integration,
contract and Playwright suite goes through — the E2E orchestration is a thin
adapter over it and its own refusal guard already documents the same contract.
One prefix rather than a per-phase list is also the safer shape: a missing entry
makes the tool retain a database, a wrong entry would make it drop one.

```text
before:  total=19  disposable=16  droppable=16  in_use=0  unknown=0  protected=3
dropped: 16   (5 × app6/app12 race suites, 11 × db10_cp2_source)
after:   total=3   disposable=0   unknown=0   protected=3
unsafe_drop = 0
```

The shared `embroidery` database was classified `PROTECTED` and untouched. No row
was deleted from anything. The A02 report's observation of fifteen orphans was an
undercount by one; sixteen were found and removed.

Registered as `CMD-DB-DISPOSABLE-INVENTORY`.

---

## AB. Current-run resource teardown

```text
staging namespace embroidery-staging   deleted
minikube profile embroidery-staging    deleted ("Removed all traces")
disposable OCI registry container      removed
registry:2 image                       removed
6 release images (host + registry tags) removed  -> 0 remaining
disposable PostgreSQL + MinIO          destroyed with the cluster (emptyDir)
synthetic secrets env files            removed
staging TLS key + certificate          removed
postgres TLS key + certificate         removed
scratch digests / scripts / captures   removed
```

Only the pre-existing development stack remains running. No certificate private
key was ever committed. No secret artifact was left behind.

---

## AC. H01 security regression

Focused, on the seams H02 actually changed (edge, build, CSP, TLS) — the full H01
matrix was not re-run, and §46 does not ask for it.

```text
X-Powered-By absent                     PASS
nginx version hidden                    PASS
CSP present                             PASS
nonce policy correct                    PASS (8 distinct nonces, 0 violations)
production script-src unsafe-inline     absent
production script-src unsafe-eval       absent
production connect-src ws:              absent
ORDER_ACCESS token remains fragment-only PASS (route unchanged; no token in any log/header captured)
Wave-2 OFF denial remains green         PASS (§AD)
Admin auth/session remains green        PASS (§U)
private cache controls remain green     PASS
report-secret checker                   see §AG
```

---

## AD. Wave-1 isolation in staging

`CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, proved from outside the ingress:

```text
Ready-Made / public surfaces
  /                       200      /cua-hang        200
  /kham-pha               200      /bo-suu-tap      200
  /truy-cap/don-hang      200   (ORDER_ACCESS route exists)

Wave-2 customer routes
  /yeu-cau/moi            404
  /truy-cap/bao-gia       404
```

No build-time or client flag leak: there is no `NEXT_PUBLIC_` twin, the value is
read server-side through a bracket lookup on a named constant (not an inlinable
member expression), and the withheld route is answered by a rewrite that renders
the ordinary not-found page — indistinguishable from an address that does not
exist.

---

## AE. Files changed

**New — Kubernetes deployment model (13 files)**

```text
infrastructure/kubernetes/README.md
infrastructure/kubernetes/base/kustomization.yaml
infrastructure/kubernetes/base/config/configmap.yaml
infrastructure/kubernetes/base/config/secret-contract.md
infrastructure/kubernetes/base/workloads/{api,storefront,admin,worker,migrate-job}.yaml
infrastructure/kubernetes/base/routing/{gateway,httproute-storefront,httproute-admin,redirect}.yaml
infrastructure/kubernetes/overlays/production/{kustomization,gateway-patch,route-hostnames-patch}.yaml
infrastructure/kubernetes/overlays/staging/{kustomization,gateway-patch,route-hostnames-patch,replicas-patch,staff-bootstrap-job}.yaml
infrastructure/kubernetes/staging-scaffolding/{README.md,kustomization,postgres,minio}.yaml
```

**New — tooling**

```text
tools/check-release-config.mjs           283 lines
tools/check-release-config.contract.mjs  242
tools/check-release-config.render.mjs    155
tools/db-disposable-inventory.mjs        214
```

**New — application**

```text
apps/storefront/src/config/content-security-policy.ts   113
apps/admin/src/config/content-security-policy.ts        114
packages/database/src/cli/migrate-deployment.ts          65
```

**Modified**

```text
apps/storefront/src/proxy.ts             nonce + widened matcher
apps/admin/src/proxy.ts                  nonce + unchanged routing
apps/{storefront,admin}/next.config.ts   static CSP removed (single authority)
apps/{storefront,admin}/src/app/layout.tsx  force-dynamic, documented
infrastructure/docker/api.Dockerfile     3 runtime packages + design-engine node_modules
                                         + migrations/ + seed/
infrastructure/docker/storefront.Dockerfile  3 NEXT_PUBLIC build args; origin note
infrastructure/docker/admin.Dockerfile   NEXT_PUBLIC_API_BASE_PATH build arg
infrastructure/compose/docker-compose.dev.yml  tracked local origin default + build args
packages/database/tsconfig.build.json    exclusion narrowed to the two ESM CLIs
packages/persistence/src/runtime/database-runtime.integration.spec.ts  79/38/by-name
.env.example                             origin documentation
docs/implementation/SCOPED_COMMAND_INDEX.md  two new scoped commands
```

---

## AF. File-size / config hygiene

Every new and changed TypeScript/JavaScript source is inside the limits; the
largest is `tools/check-release-config.mjs` at 283 lines, under the 300 review
threshold and well under the 400 hard limit. The validator was split by
responsibility — CLI, contract, render — not by line count.

`node tools/check-file-size.mjs` reports 81 hard-limit violations repository-wide;
all are pre-existing files in `tools/` (`smoke-app3-e01-studio.mjs` at 559,
`check-app6-g01.mjs` at 417, and so on). None is a file this checkpoint created
or modified, and H02 did not perform unrelated refactoring to clear them.

No giant deployment script exists. The infrastructure YAML is split by workload
and by concern.

---

## AG. Validation

Commands actually run.

```text
git diff --check                                                    clean
prettier --check (then --write) on every changed source             PASS
eslint  apps/storefront + apps/admin changed sources                PASS (0 findings)
tsc --noEmit  @embroidery/storefront                                PASS
tsc --noEmit  @embroidery/admin                                     PASS
tsc --noEmit  @embroidery/database                                  PASS
pnpm --filter @embroidery/database build                            PASS
pnpm --filter @embroidery/storefront build (NODE_ENV=production)     PASS
docker build × 4 --target runner                                    PASS
docker image audit: secret markers / root / .env / test fixtures    0 / non-root / 0 / 0
kubectl kustomize overlays/production                               renders, 14 resources
kubectl kustomize overlays/staging                                  renders, 18 resources
node tools/check-release-config.mjs production                      FAIL-CLOSED as designed
node tools/check-release-config.mjs staging (digests pinned)        PASS
node tools/db-disposable-inventory.mjs [--execute]                  16 dropped, 0 unsafe
pnpm --filter @embroidery/persistence test database-runtime         13 / 13 PASS
pnpm --filter @embroidery/api openapi:check                         up to date
kubectl apply -k overlays/staging                                   PASS
staging ingress smoke (13 probes)                                   PASS
Chromium CSP + Admin HTTPS session                                  0 violations
rollback A -> B -> A                                                PASS
failed-rollout / missing-secret / bad-config smoke                  PASS
```

**Not run, deliberately:** global UAT, performance/CWV benchmarking (`H05`),
chaos/resilience rehearsal beyond deployment failure safety (`H04`),
observability work (`H03`), visual UAT (`V01`/`V02`), Figma writes, production
deployment. No repository-wide aggregate command was invented.

**Gaps in validation, stated plainly.** No `.test.mjs` companions were written
for the three new tools, which is the repository's convention for
`tools/*.mjs`. The tools were exercised against real infrastructure — the
validator against both overlays and four injected bad configurations, the
inventory tool against a live server with sixteen real orphans — but that is
integration evidence, not the unit coverage the convention asks for. Recorded as
`FU-APP12-H02-02`.

The `check-report-secrets` and category anti-hardcode gates and the
route-authority gates were not re-run: no report-embedded secret pattern, no
category constant and no route file changed in this checkpoint. The
generated-client check was not re-run because OpenAPI is byte-identical.

---

## AH. Baseline freeze

Measured after all changes.

```text
OpenAPI            125 paths / 138 operations / 278 schemas   UNCHANGED
openapi:check      "artifact is up to date"
migrations         38                                          UNCHANGED
DB schema          79 tables                                   UNCHANGED
Admin routes       26                                          UNCHANGED
Storefront routes  20                                          UNCHANGED
Figma              untouched
```

H02 added 0 business HTTP operations, 0 business routes and 0 migrations.
Kubernetes resources and tooling scripts are operational, not business HTTP
operations.

`public operations = 49` and `release matrix = 28 DENY / 18 ALLOW / 3
SCOPE_GATED` are carried forward from H01 unverified in this checkpoint: no
controller, guard or release-gate source changed, and the OpenAPI artifact is
byte-identical, so the classification cannot have moved. Stated as inference from
an unchanged artifact rather than as a fresh measurement.

---

## AI. Follow-up closure matrix

| Follow-up | Disposition | Evidence |
| --- | --- | --- |
| `FU-APP12-H01-01` nonce CSP | **CLOSED** | §Q, §R — production `script-src` grants neither `'unsafe-inline'` nor `'unsafe-eval'`; 0 Chromium violations across 8 pages |
| `FU-APP12-H01-02` HSTS / TLS edge | **CLOSED** | §S, §T — 301 redirect, HSTS at the HTTPS edge, TLS via out-of-band Secret |
| `FU-APP11-S04-01` `STOREFRONT_PUBLIC_ORIGIN` | **CLOSED** | §K — tracked compose default for development, overlay ConfigMap for staging/production, fail-closed at runtime, preflight refusal |
| `FU-APP12-S03-06` same, duplicate | **CLOSED** (once, with the above) | §K |
| `FU-APP10-I01-02` Zalo/Messenger URLs | **RELEASE_OPERATOR_INPUT_REQUIRED_BEFORE_R01** | §M — mechanism ready, build args added, syntax validated, fail-closed preserved; real values externally owned and not invented |
| `FU-APP12-B02-01` stale table count | **CLOSED** | §I — 79/38 + newest table by name, 13/13 PASS |
| `FU-APP12-B05-03` duplicate of the above | **CLOSED** (once, with the above) | §I |
| `FU-APP12-B02-03` release flag in harness/config | **PARTIALLY_CLOSED** → `APP12-E01` | §J — every deployment environment sets it explicitly; the Jest custom-integration harness is a testing decision, not a deployment one |
| `FU-APP12-B02-04` historical disposable DB leakage | **CLOSED** | §AA — 16 dropped, 0 unsafe, before/after counts |
| `FU-APP12-A02-03` orphan disposable DBs | **CLOSED** | §AA — same inventory; nothing unprovable remained |
| `FU-APP12-B03-01` `AdminShippingFeeOutcomeResponse` publishes four nullable string fields as `type: object` | **NOT_H02_SHAPED** → `APP12-E01` | Mechanically located and read (`APP12-B03-COMPLETION-REPORT.md:796`). It is an OpenAPI DTO-metadata defect, not environment/build/configuration debt. §48 freezes OpenAPI and forbids modifying it for deployment, and §3 forbids H02 changing a business contract. Routed to `APP12-E01`, the last Wave-1 checkpoint that exercises the Admin commerce contract end to end, where it becomes a bounded correction if a consumer is materially affected. **Not verified as still open** — no OpenAPI inspection was performed beyond the byte-identity check. |

**New follow-ups**

```text
FU-APP12-H02-01  staging ORDER_ACCESS notification-origin journey not exercised
                 (configuration half proved; delivery half not)        → APP12-E01
FU-APP12-H02-02  no unit tests for the three new tools/*.mjs, against
                 repository convention                                 → APP12-H07
FU-APP12-H02-03  /mua-hang/[slug] not covered in the Chromium CSP pass
                 (needs a purchasable SKU in staging)                  → APP12-E01
FU-APP12-H02-04  ConfigMap is not hash-suffixed, so a config-only change
                 needs `kubectl rollout restart`                       → APP12-H07
FU-APP12-H02-05  Gateway API controller and stateful topology (PostgreSQL,
                 object storage) remain ADR-reserved; production manifests
                 are parameterized but no ADR exists    → ADR required before R01
```

No H01-closed item was reopened. No new checkpoint ID was created.

---

## AJ. External release values still required

Repository-ready; values externally owned by design (§44).

```text
REPOSITORY_READY, EXTERNAL_RELEASE_VALUE_REQUIRED:
  STOREFRONT_PUBLIC_ORIGIN              real canonical customer origin
  STAFF_ALLOWED_ORIGINS                 real Admin origin
  DESIGN_SESSION_ALLOWED_ORIGINS        real customer origin
  OBJECT_STORAGE_ENDPOINT / buckets     real object-storage address
  PAYMENT_MERCHANT_BANK_BIN             real NAPAS acquirer id
  PAYMENT_MERCHANT_ACCOUNT_NUMBER       real receiving account
  PAYMENT_MERCHANT_ACCOUNT_NAME         real account holder
  PAYMENT_MERCHANT_BANK_DISPLAY_NAME    real bank name
  NEXT_PUBLIC_ZALO_CONTACT_URL          real Zalo OA link
  NEXT_PUBLIC_MESSENGER_CONTACT_URL     real Messenger page link
  DATABASE_URL                          real database credential
  OBJECT_STORAGE_ACCESS_KEY_ID/SECRET   real storage credential
  DESIGN_SESSION_SECRET_PEPPER          real pepper
  VERIFICATION_CODE_SECRET_PEPPER       real pepper
  SECURE_LINK_TOKEN_SECRET_PEPPER       real pepper
  NOTIFICATION_DELIVERY_ENVELOPE_KEY    real AES-256-GCM key
  STAFF_BOOTSTRAP_PASSWORD              real operator credential (optional)
  embroidery-tls  tls.crt / tls.key     real certificate and private key
  gatewayClassName                      real Gateway API controller (ADR required)
  Gateway/HTTPRoute hostnames           real canonical domain
```

Names and status only. No value appears in this report.

---

## AK. Roadmap

```text
APP12-H02 = COMPLETE
APP12-H03 = NEXT

ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38
CORRECTION_USED = 0 / 1

G03 data created  = false
production deployed = false
pushed = false
```
