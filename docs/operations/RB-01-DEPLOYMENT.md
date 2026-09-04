# RB-01 — Deployment

Deploying a Wave-1 release to a Kubernetes environment. Same procedure for
staging and production; only the overlay and the values differ.

Authority: `infrastructure/kubernetes/README.md`,
`docs/implementation/reports/APP12-H02-COMPLETION-REPORT.md`.

## Trigger

- A release has been approved and its images are built and pushed.
- A configuration-only change is required (jump to section 7).

## Preconditions

All of these must be true before you run anything. None of them is checked by
a later step for you.

1. **The namespace exists.**
   `kubectl get ns embroidery-production`
2. **`embroidery-secrets` exists and is complete.** Created out of band from an
   operator-owned env file — see [RB-05](RB-05-SECRET-ROTATION.md) and
   `infrastructure/kubernetes/base/config/secret-contract.md`. The workloads
   reference it **without** `optional: true`, so a missing key is a
   `CreateContainerConfigError`, never a silent default.
   `kubectl -n embroidery-production get secret embroidery-secrets -o jsonpath='{.data}' | tr ',' '\n' | cut -d'"' -f2`
   prints the **key names only**. Never print `.data` values.
3. **`embroidery-tls` exists** with `tls.crt` and `tls.key`.
4. **The four images are pushed and addressable by digest.** A release pins
   `newName` + `digest`; a tag is not an immutable reference and `latest` is
   refused by the preflight.
5. **The external inputs are supplied.** Every value in
   [RB-14 section 4](RB-14-GO-LIVE-CHECKLIST.md) that this environment needs is
   present in the overlay. The preflight will tell you which are not, by name.

## Safe observations

Read-only. Run these before deciding anything.

```sh
kubectl -n embroidery-production get deploy,job,svc,gateway,httproute
kubectl -n embroidery-production get pods -o wide
kubectl -n embroidery-production rollout status deploy/embroidery-api --timeout=10s
kubectl -n embroidery-production get configmap embroidery-config -o yaml
```

The ConfigMap holds **no secret** by contract, so printing it is safe. The
Secret is not, so never `-o yaml` it.

## Actions

### 1. Preflight — refuses before anything applies

```sh
node tools/check-release-config.mjs production
```

It renders the overlay with `kubectl kustomize`, converts client-side with
`kubectl patch --local` (no API server, no CRDs — this must run *before* the
cluster it validates), then checks names and shapes. It **never prints a
configured value**: a finding names a key and the shape expected.

`PASS` is the only acceptable result. A production overlay straight from Git
fails with roughly 21 findings, by design — every externally-owned value is
empty. Fix the named keys; do not edit the tool.

Classes of finding, and what each means:

| Finding | Meaning |
| --- | --- |
| `MISSING: <KEY>` | Declared but empty. Supply it in the overlay. |
| `MALFORMED: <KEY>` | Present and the wrong shape (a loopback origin, `True` instead of `true`, six digits expected). |
| `IMAGE: <workload>` | Still carries `REPLACE_WITH_IMMUTABLE_RELEASE_REF`, or a mutable tag. |
| `ROUTING: Gateway/…` | No `gatewayClassName`, or an `HTTPRoute` with no hostname. |
| an `optional: true` secret reference | Fail-closed has been broken. Never suppress this. |

### 2. Confirm the wave flag

`CUSTOM_EMBROIDERY_RELEASE_ENABLED` must be **explicitly** `false` for Wave 1.
The runtime is fail-closed when the variable is absent; that is not the point —
a deployment that does not say which wave it is releasing is one nobody can
review. The preflight rejects any spelling but `true` or `false`.

```sh
kubectl kustomize infrastructure/kubernetes/overlays/production \
  | grep -A1 CUSTOM_EMBROIDERY_RELEASE_ENABLED
```

### 3. Migration Job — before the application rollout

Follow [RB-02](RB-02-MIGRATION.md) in full, then return here. The order is not
negotiable: the new image expects the new schema.

### 4. Apply the workloads

```sh
kubectl apply -k infrastructure/kubernetes/overlays/production
```

### 5. Watch the rollout, one Deployment at a time

```sh
kubectl -n embroidery-production rollout status deploy/embroidery-api        --timeout=300s
kubectl -n embroidery-production rollout status deploy/embroidery-storefront --timeout=300s
kubectl -n embroidery-production rollout status deploy/embroidery-admin      --timeout=300s
kubectl -n embroidery-production rollout status deploy/embroidery-worker     --timeout=300s
```

`maxUnavailable: 0` means a bad revision never takes the healthy one out of
rotation: during a failed rollout the previous pods keep serving. That is why a
`rollout status` timeout is a *safe* failure — see Abort.

The worker uses `Recreate`, not `RollingUpdate`: with one claiming process and
no broker, an overlapping old and new pod would be a double claim. It therefore
has a legitimate gap during a deploy. Do not treat that gap as an incident.

### 6. Worker bootstrap ordering — the step a release cannot skip

On a **new** cluster, or whenever the `worker.runtime` policy has never been
published, run [RB-04](RB-04-STAFF-BOOTSTRAP.md) now. A cluster that skips it
has a worker pod that is Ready, has no failing probe, no restart loop, and
**claims nothing** — nothing delivers notifications, converts orders or expires
reservations.

### 7. Configuration-only change

The ConfigMap is a plain resource, not a hashed generator output, so editing it
does **not** roll the pods.

```sh
kubectl apply -k infrastructure/kubernetes/overlays/production
kubectl -n embroidery-production rollout restart deploy/embroidery-api
kubectl -n embroidery-production rollout restart deploy/embroidery-worker
# storefront/admin only if the changed key is one they read at runtime
kubectl -n embroidery-production rollout status deploy/embroidery-api --timeout=300s
```

`NEXT_PUBLIC_*` values are a different case entirely: `next build` **inlines**
them, so `NEXT_PUBLIC_API_BASE_PATH`, `NEXT_PUBLIC_ZALO_CONTACT_URL` and
`NEXT_PUBLIC_MESSENGER_CONTACT_URL` cannot be changed by any environment
variable at all. Changing one requires a **rebuild** of the Storefront or Admin
image. `STOREFRONT_PUBLIC_ORIGIN` is read per request at runtime and does not.

### 8. Smoke

```sh
curl -sSI  https://<storefront-host>/                      # 200
curl -sS   https://<storefront-host>/healthz               # 200
curl -sS   https://<storefront-host>/robots.txt            # 200, Sitemap: line carries the real origin
curl -sS   https://<storefront-host>/sitemap.xml | head -5 # 200, first <loc> carries the real origin
curl -sSI  https://<admin-host>/                           # 200
curl -sS   https://<admin-host>/api/health                 # 200
curl -sS   https://<admin-host>/api/health/readiness       # 200
curl -sSI  http://<storefront-host>/                       # 301 to https
```

Then confirm Wave-2 isolation is intact. A Wave-1 release answers `404` on all
seven withheld Storefront routes and `200` on the `/truy-cap` landing above
them — a proxy denial, not a page-level `notFound()`, so the refusal precedes
the surface:

```sh
for p in /yeu-cau/moi /yeu-cau/da-gui /truy-cap/bao-gia /truy-cap/duyet-thiet-ke \
         /truy-cap/thanh-toan /truy-cap/thanh-toan-con-lai; do
  printf '%s ' "$p"
  curl -sS -o /dev/null -w '%{http_code}\n' "https://<storefront-host>$p"   # 404
done
curl -sS -o /dev/null -w '%{http_code}\n' https://<storefront-host>/truy-cap        # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://<storefront-host>/truy-cap/don-hang # 200 (Wave-1)
```

`/san-pham/<slug>/thiet-ke` is the seventh and needs a real product slug; the
product detail page beneath it must answer `200` while the Studio segment
answers `404`.

and confirm the worker is claiming, from
[RB-04 verification](RB-04-STAFF-BOOTSTRAP.md).

## Expected state

```text
deploy/embroidery-api          2/2 ready, current revision = the released digest
deploy/embroidery-storefront   2/2 ready
deploy/embroidery-admin        2/2 ready
deploy/embroidery-worker       1/1 ready, metrics port answering, claiming jobs
job/embroidery-migrate         Complete
Gateway                        Programmed=True, HTTPS listener attached
API readiness                  200
outbox backlog                 draining, not growing
```

## Abort condition

Stop and do not proceed if any of these is true:

- The preflight does not report `PASS`.
- The migration Job did not reach `Complete` ([RB-02](RB-02-MIGRATION.md)).
- `rollout status` times out. This is safe: the previous revision is still
  serving. Diagnose before touching anything —
  `kubectl -n embroidery-production get pods` will show the new pod in
  `ImagePullBackOff`, `CreateContainerConfigError` or `CrashLoopBackOff`.
- Any pod reports `CreateContainerConfigError`. A required Secret or key is
  missing; that is fail-closed behaviour working, not a bug to work around.

## Escalation condition

Escalate rather than continuing when:

- The migration Job failed for a reason that is not transient (see RB-02).
- The API readiness endpoint returns 503 with a database reason after a
  successful rollout — the schema and the image disagree.
- A rollback (RB-03) also fails to become ready. At that point both revisions
  are broken, which points at configuration or a dependency, not at the image.

## Verification

```sh
kubectl -n embroidery-production get deploy -o wide          # image digests
kubectl -n embroidery-production get pods                    # all Running/Ready
kubectl -n embroidery-production logs deploy/embroidery-api --tail=50 | grep release.gate.configured
```

The last line must read `event=release.gate.configured enabled=false` for a
Wave-1 release.

Then the dashboard: [RB-10](RB-10-HEALTH-DIAGNOSTICS.md), row *Is the shop up?*.

## Recovery / rollback

[RB-03](RB-03-ROLLBACK.md). Application image only — never the schema.

## Forbidden actions

- Applying without a `PASS` preflight.
- Deploying a mutable tag, or `latest`, in place of a digest.
- Adding `optional: true` to a `secretRef` to get past a missing Secret.
- Editing a live resource with `kubectl edit` instead of changing the overlay
  and re-applying. The next `apply -k` silently reverts it.
- Relaxing a startup guard (for example `DATABASE_SSL_MODE`) to make a
  deployment start. A configuration production can never use is not evidence.
- Running the migration Job **after** the application rollout.
- Inventing `gatewayClassName`, a storage class, a database address or a
  certificate. All are external inputs; see
  [RB-14](RB-14-GO-LIVE-CHECKLIST.md).
