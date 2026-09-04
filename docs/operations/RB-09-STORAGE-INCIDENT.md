# RB-09 — Storage incident

The object store is unavailable, slow, or refusing: uploads fail, private images
do not load.

Authority: `packages/object-storage/src/request-options.ts`,
`packages/object-storage/src/s3-object-storage.adapter.ts`,
`docs/implementation/reports/APP12-H04-C1-COMPLETION-REPORT.md` sections J–M.

## What the system already does for you

Measured live against a frozen object store — a real outage that preserved the
data — with the delivered build:

```text
upload during outage        503 in 20 054 ms   app-owned JSON envelope
private read during outage  500 in 20 097 ms   bounded, no partial bytes
anonymous read              401 throughout     authorization unchanged by the outage
after recovery              200, byte-identical, no replacement uploaded
orphan asset rows           0
false accepted evidence     0
key / endpoint / bucket / credential leakage   NONE
```

Three properties matter to a diagnosis:

1. **Every storage operation is bounded at 20 seconds.** That is below the
   60-second Gateway timeout with headroom, so a customer gets the
   application's own JSON envelope rather than an `nginx` HTML `504`. The bound
   is on the abort signal threaded into every command — **not** on S3 client
   options. Both `requestHandler: { connectionTimeout, requestTimeout }` as a
   plain object and an explicitly constructed `NodeHttpHandler` were measured
   against a socket that accepts and never answers, and **neither bounded the
   call**; a first attempt using them produced a 60.2-second read. Do not
   "fix" a storage timeout by setting those options.
2. **No object key, endpoint, bucket or credential ever appears in an error.**
   If you see one, that is a security finding, not a diagnostic aid.
3. **A failed upload writes nothing.** No asset row, no accepted evidence, no
   dangling multipart part. There is nothing to clean up after an outage.

## Trigger

- Uploads returning `503`, or private evidence reads returning `500`, both after
  about 20 seconds.
- `EmbroideryApiServerErrorBurst` with the 5xx concentrated on asset or evidence
  routes.
- `embroidery_dependency_errors_total{dependency="object_storage"}` rising.

## Preconditions

- You know the object-storage endpoint by **name** (`OBJECT_STORAGE_ENDPOINT`).
  Its address and product are external inputs this repository does not own.

## Safe observations

```promql
sum by (operation) (increase(embroidery_dependency_errors_total{dependency="object_storage"}[15m]))
sum by (route_template, status_class) (increase(embroidery_http_requests_total{status_class="5xx"}[15m]))
```

```logql
{namespace=~"embroidery.*", app="api", level="error"} | json | event = "platform.error"
```

Timing is the tell. **A response at about 20 seconds is the storage deadline
firing** — the dependency is stalled, not refusing. A fast `500` is something
else; go to [RB-10](RB-10-HEALTH-DIAGNOSTICS.md).

```sh
kubectl -n embroidery-production logs deploy/embroidery-api --tail=200 | grep -i storage
kubectl -n embroidery-production get pods
```

## Actions

### 1. Classify the outage

| Symptom | Likely cause |
| --- | --- |
| ~20s then `503`/`500` on every storage route | The store is stalled or unreachable |
| Immediate `403`-shaped failure | Credentials rejected — see [RB-05](RB-05-SECRET-ROTATION.md) |
| Immediate `404`-shaped failure on reads that used to work | Wrong bucket or wrong endpoint configuration |
| `413` from `nginx` on a large upload | **Not a storage incident.** See section 4 |
| Reads fine, uploads fail | A permissions or quota problem on the write path |

### 2. Confirm the dependency, from outside the application

The object store is an **external address**. This repository owns no manifest
for it, so its health is checked with whatever its own product provides. Confirm
reachability from inside the cluster without inventing a vendor procedure:

```sh
kubectl -n embroidery-production run --rm -it --restart=Never storage-probe \
  --image=curlimages/curl:8.11.1 -- \
  curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' <OBJECT_STORAGE_ENDPOINT>
```

A connection that hangs and then times out is the same stall the application is
seeing. A refused connection is a network or DNS problem.

### 3. Recover

The application needs **no action** to recover. There is no cache to clear, no
queue to drain and no state to repair: once the store answers, reads return the
same bytes and uploads succeed again. Recovery is entirely on the storage side,
and is owned by whoever operates that store.

If the cause is a rotated or wrong credential, go to
[RB-05](RB-05-SECRET-ROTATION.md) — and remember that
`OBJECT_STORAGE_ACCESS_KEY_ID` and `OBJECT_STORAGE_SECRET_ACCESS_KEY` must be
set **both or neither**: one alone fails startup rather than silently falling
back to the ambient AWS credential chain.

### 4. The 1 MiB edge limit, which is not a storage incident

A 4 MiB upload returns `nginx 413`. That is the Gateway's `client_max_body_size`
(1 MiB by default), **not** the application: the API's own ceiling is 10 MiB.
900 KiB is therefore the largest upload that can reach the API in this topology,
and it passes comfortably (measured: 2 477 B in 65 ms, 256 KiB in 93 ms,
900 KiB in 97 ms).

This is a pre-existing production-relevant mismatch, filed as
`FU-APP12-H04-C1-01`, and **aligning the edge body limit with the application's
ceiling is a pre-R01 external input** — see
[RB-14](RB-14-GO-LIVE-CHECKLIST.md). Do not raise it by editing a live Gateway
resource during an incident.

## Expected state

```text
uploads          202
private reads    200, correct bytes, correct content type
anonymous reads  401   (unchanged throughout the incident)
dependency error counter  flat
```

## Abort condition

- An error message anywhere carries an object key, a bucket name, an endpoint or
  a credential fragment. Stop and treat it as a security finding
  ([RB-12](RB-12-INCIDENT-RESPONSE.md)).
- A read returns partial or corrupt bytes rather than an error. The delivered
  behaviour is an error, never a truncated object; partial bytes would mean the
  bound is in the wrong place.
- An asset row exists for an upload that failed.

## Escalation condition

- The outage is at the storage product itself and is outside your authority.
- Data appears to be missing rather than unreachable. **Do not upload a
  replacement object over a key that already has one** — establish first whether
  the object is gone or merely unreachable. In the rehearsed outage the bytes
  were identical after recovery and no replacement was uploaded; that is the
  expected shape.
- Credentials are rejected and you did not rotate them.

## Verification

An upload, a private read and an anonymous read, in that order:

```sh
# authorized upload through the Admin surface -> 202
# authorized read of a known ACCEPTED asset   -> 200, correct byte length
# the same read with no session               -> 401
```

Compare the sha256 of the read object against what it was before the outage.
Byte identity is the verification; "the page loads" is not.

Then confirm `embroidery_dependency_errors_total{dependency="object_storage"}`
has stopped increasing.

## Recovery / rollback

Nothing in the application. No cache, no queue, no state.

Jobs that failed on storage during the outage are ordinary retrying jobs; they
succeed on their own once the store is back, or dead-letter and are handled by
[RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md).

## Forbidden actions

- Deleting, overwriting or moving objects in the store to "clean up" after an
  outage. No repository-owned procedure does object surgery, and none is
  approved.
- Raising `client_max_body_size` on a live Gateway resource as an incident
  action. It is a configuration change and goes through
  [RB-01](RB-01-DEPLOYMENT.md).
- Setting S3 client `connectionTimeout` / `requestTimeout` to bound a stalled
  call. Measured: it does not work, in either form.
- Removing or lengthening the 20-second operation deadline to make a slow
  request succeed. It exists so the customer gets the application's envelope
  instead of the edge's HTML error.
- Uploading a replacement object before establishing that the original is
  actually lost.
- Printing an object key, a bucket name or a credential into a ticket.
