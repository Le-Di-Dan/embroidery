# RB-05 — Secret rotation

Changing a credential the running system depends on.

Authority: `infrastructure/kubernetes/base/config/secret-contract.md`,
`docs/09-SECURITY-AND-ABUSE-PREVENTION.md` section 9a.

## Rules that apply to every rotation on this page

1. **Never print, echo, log, or pass a value as a command-line argument.** An
   argument is visible in the process table and in shell history; a file is not.
   Every `create secret` below uses `--from-env-file` or `--from-file` for that
   reason.
2. **Never write a value into this repository**, into `.env`, into a manifest, or
   into a completion report.
3. **The mechanism is a native Kubernetes `Secret`, referenced by name.** No
   external-secrets operator, no sealed-secrets, no vault sidecar: none is a
   dependency of any delivered deployment authority, and adding one locks an
   operational decision no ADR has taken.
4. **`envFrom` is read at container start.** Updating a Secret does **not**
   change a running pod's environment. Every rotation therefore ends with an
   explicit `kubectl rollout restart` of every consumer, and a rotation without
   one is a rotation that has not happened.
5. **Rotation is the operator's decision and the operator runs it.** Never rotate
   a credential to make a test, a deployment or a probe pass.

## The consumer map

Generated from actual consumers. Rotate a row and you must restart every
workload in its Consumers column.

| Variable | Secret object | Consumers | Reload | Blast radius on rotation |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | `embroidery-secrets` | api, worker, migrate Job, bootstrap Job | restart | None if the old password still works during the overlap; total outage if it does not |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | `embroidery-secrets` | api, worker, bootstrap | restart | Uploads and private reads fail until restarted. **Set both or neither** — one alone fails startup rather than falling back to the ambient AWS credential chain |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | `embroidery-secrets` | api, worker, bootstrap | restart | as above |
| `VERIFICATION_CODE_SECRET_PEPPER` | `embroidery-secrets` | api, bootstrap | restart | **Every outstanding verification code stops verifying.** Customers mid-checkout must request a new one |
| `SECURE_LINK_TOKEN_SECRET_PEPPER` | `embroidery-secrets` | api, bootstrap | restart | **Every live secure link stops resolving** — including every `ORDER_ACCESS` link a paying customer holds. The highest-impact rotation in Wave 1 |
| `DESIGN_SESSION_SECRET_PEPPER` | `embroidery-secrets` | api, bootstrap | restart | Invalidates every live Design Session. Wave-2 surface; withheld in Wave 1 |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | `embroidery-secrets` | api, worker, bootstrap | restart | **Every un-delivered envelope becomes unopenable.** Drain the queue first (see below) |
| `STAFF_BOOTSTRAP_PASSWORD` | `embroidery-staff-bootstrap` | bootstrap Job only | n/a | None on the running system; never read by normal API startup |
| `tls.key` / `tls.crt` | `embroidery-tls` | Gateway HTTPS listener | Gateway reload | Brief TLS renegotiation; no application restart |

Three constraints the API enforces at startup, so a copy-paste is a startup
failure rather than a shared blast radius:

- the two APP4 peppers must **differ from each other**;
- neither may equal `NOTIFICATION_DELIVERY_ENVELOPE_KEY` (an AEAD key is a
  different primitive with a different rotation consequence);
- neither may equal `DESIGN_SESSION_SECRET_PEPPER`.

Every pepper is at least 32 characters. `NOTIFICATION_DELIVERY_ENVELOPE_KEY` is
base64 decoding to exactly 32 bytes (AES-256-GCM). There is no unpeppered
fallback anywhere: a peppered HMAC keyed on an empty string verifies exactly
like an unpeppered one, which is why an empty value is a startup error and not a
degraded mode.

`PAYMENT_MERCHANT_*` are **not secrets** and are not on this page. Every one of
the four is printed on the customer's own payment screen and encoded into the
transfer QR they scan; marking a customer-visible fact as a secret would be
false. They live in the ConfigMap and change through
[RB-01 section 7](RB-01-DEPLOYMENT.md#7-configuration-only-change).

## Trigger

- Scheduled rotation.
- Suspected or confirmed exposure — a value in a log, a screenshot, a ticket, a
  chat message, a report.
- Personnel change for `STAFF_BOOTSTRAP_*`.
- Certificate expiry for `embroidery-tls`.

## Preconditions

1. You know **which** variable, and you have read its row above. Rotating
   `SECURE_LINK_TOKEN_SECRET_PEPPER` during business hours strands every
   customer holding an order link; that is a decision, not a side effect.
2. The new value is in an operator-owned file **outside this repository**, with
   the other keys unchanged. `--from-env-file` replaces the whole object, so the
   file must be complete.
3. For `NOTIFICATION_DELIVERY_ENVELOPE_KEY`: the outbox is drained. Check before
   you start:

   ```sql
   SELECT status, count(*) FROM outbox_events
    WHERE event_type LIKE 'notification.%' GROUP BY status;
   ```

   Every `PENDING` and `FAILED` row here is an envelope sealed with the *old*
   key. Rotating now makes each of them permanently unopenable, and the customer
   credential inside is lost. Wait for `PENDING = 0`, or accept and record the
   loss explicitly.

## Safe observations

```sh
# Key NAMES only. Never -o yaml, never .data values.
kubectl -n embroidery-production get secret embroidery-secrets \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'

kubectl -n embroidery-production get secret --show-labels
kubectl -n embroidery-production get deploy -o wide
```

## Actions

### 1. Replace the object

```sh
kubectl -n embroidery-production create secret generic embroidery-secrets \
  --from-env-file=<operator-owned file outside this repository> \
  --dry-run=client -o yaml | kubectl -n embroidery-production apply -f -
```

`--dry-run=client | apply` replaces the object without a delete window. **Do not
`kubectl delete secret` first**: between the delete and the create, any pod that
restarts enters `CreateContainerConfigError`, which is exactly the fail-closed
behaviour the contract is built on — correct, and a self-inflicted outage.

For TLS:

```sh
kubectl -n embroidery-production create secret tls embroidery-tls \
  --cert=<operator-owned chain> --key=<operator-owned key> \
  --dry-run=client -o yaml | kubectl -n embroidery-production apply -f -
```

### 2. Restart every consumer of the rotated key

```sh
kubectl -n embroidery-production rollout restart deploy/embroidery-api
kubectl -n embroidery-production rollout restart deploy/embroidery-worker
kubectl -n embroidery-production rollout status  deploy/embroidery-api    --timeout=300s
kubectl -n embroidery-production rollout status  deploy/embroidery-worker --timeout=300s
```

The API restarts one pod at a time with `maxUnavailable: 0`, so a wrong value
does **not** take the service down: the new pod fails to become ready and the
old ones keep serving. That is the safety net — use it by restarting the API
**first** and confirming readiness before restarting anything else.

The worker is `Recreate`; expect a short gap in which nothing claims.

### 3. Database password specifically

Order matters, and there is one safe sequence:

1. Create the **new** password on the PostgreSQL server, alongside the old one
   if the server supports it.
2. Update `DATABASE_URL` in the Secret (step 1).
3. Restart the API and confirm readiness (step 2).
4. Restart the worker and confirm it claims again.
5. Only then retire the old password on the server.

Retiring the old password before step 4 is how a rotation becomes an outage.

## Expected state

```text
secret replaced, key names unchanged
api    rolled, 2/2 ready, readiness 200
worker rolled, claiming, backlog falling
no CreateContainerConfigError anywhere
no value in any log, report, or shell history
```

## Abort condition

- The first restarted API pod does not become ready. Stop; do not restart the
  rest. Put the previous value back through the same replace-then-restart path.
- Any pod enters `CreateContainerConfigError`. A key is missing from the env
  file you supplied — `--from-env-file` replaces the whole object, so a partial
  file removes the keys it omits.
- A value appears in a terminal, a log, or a paste buffer during the procedure.
  Treat it as exposed and rotate it again from a clean session.

## Escalation condition

- A confirmed exposure of `DATABASE_URL` or the object-storage credentials. That
  is a security incident, not a maintenance task: start
  [RB-12](RB-12-INCIDENT-RESPONSE.md), preserve evidence, and rotate under that
  process.
- `NOTIFICATION_DELIVERY_ENVELOPE_KEY` must be rotated while envelopes are
  outstanding. Someone has to accept the loss of those customer credentials
  explicitly.
- The old and new database passwords cannot coexist on your PostgreSQL topology.
  That is a planned-outage decision.

## Verification

```sh
kubectl -n embroidery-production get pods
curl -sS -o /dev/null -w '%{http_code}\n' https://<admin-host>/api/health/readiness   # 200
```

Then prove the rotated credential is actually in use, through a delivered path
rather than by reading the value back:

| Rotated | Prove it by |
| --- | --- |
| `DATABASE_URL` | API readiness `200` (it checks the database) |
| object storage | An Admin asset upload succeeding, and a private evidence read returning bytes — [RB-09](RB-09-STORAGE-INCIDENT.md) verification |
| `VERIFICATION_CODE_SECRET_PEPPER` | A **new** verification code issued and accepted end to end |
| `SECURE_LINK_TOKEN_SECRET_PEPPER` | A **newly issued** order-access link resolving. Old links are expected to fail — that is the rotation, not a defect |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | A new notification delivered: `outbox_events` reaching `DISPATCHED` |
| `tls.key` | `openssl s_client -connect <storefront-host>:443 -servername <storefront-host> < /dev/null 2>/dev/null \| openssl x509 -noout -dates` |

And run the report-secret gate over anything you wrote down:

```sh
node tools/check-report-secrets.mjs
```

## Recovery / rollback

Put the previous value back through the same replace-then-restart path. There is
no `rollout undo` for a Secret: a Deployment revision does not capture Secret
contents, so `rollout undo` restores the pod template and re-reads whatever the
Secret currently holds.

The peppers are the exception: rotating back **does** restore the old digests'
verifiability, because the digest is stored and the pepper keys the HMAC over
it. Rotating the envelope key back likewise re-opens envelopes that were not
delivered in between.

## Forbidden actions

- Printing a value: `kubectl get secret -o yaml`, `-o jsonpath='{.data.X}'`,
  `base64 -d`, `echo $VAR`.
- Passing a value as a command-line argument (`--from-literal` for a real
  secret).
- Writing a value to `.env`, to a manifest, to a report, or to a chat message.
- `kubectl delete secret` before creating the replacement.
- Rotating a credential to make a test, a probe or a deployment pass.
- Reusing one value across two variables. The API refuses it at startup, and the
  refusal is the design.
- Rotating and not restarting. The running pods keep the old value and you will
  believe the rotation happened.
