# Production secret contract

The application contract for secret material is a **native Kubernetes `Secret`
referenced by name**. Every workload that needs one mounts it with
`envFrom.secretRef`, without `optional: true`, so a missing Secret leaves the
pod unschedulable rather than starting it against a partly-configured runtime.

No `Secret` manifest carrying values exists in this repository, and none may.
Values are created out of band by the operator; `APP12-H07` owns the rotation
and operator procedures. The repository owns only the _names and keys_.

`APP12-H02` deliberately adds no cluster controller (no external-secrets
operator, no sealed-secrets, no vault sidecar). None is already a dependency of
any delivered deployment authority, and adding one would lock an operational
decision that no ADR has taken.

## `embroidery-secrets`

Consumed by: `api`, `worker`, the `migrate` Job and the `staff-bootstrap` Job.

| Key                                  | Classification | Consumer                        | Notes                                                                                                                                                                                                             |
| ------------------------------------ | -------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | SECRET         | api, worker, migrate, bootstrap | Embeds the PostgreSQL password, which is why the whole URL is a secret and its non-credential policy (`DATABASE_SSL_MODE`, `DATABASE_EXPECTED_MAJOR`) lives in the ConfigMap instead.                             |
| `OBJECT_STORAGE_ACCESS_KEY_ID`       | SECRET         | api, worker, bootstrap          | Set **both** or **neither**: one alone fails startup rather than silently falling back to the ambient AWS credential chain.                                                                                       |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY`   | SECRET         | api, worker, bootstrap          |                                                                                                                                                                                                                   |
| `DESIGN_SESSION_SECRET_PEPPER`       | SECRET         | api, bootstrap                  | ≥ 32 characters. No unpeppered fallback: a peppered HMAC with an empty key verifies exactly like an unpeppered one. Rotating it invalidates every live Design Session.                                            |
| `VERIFICATION_CODE_SECRET_PEPPER`    | SECRET         | api, bootstrap                  | ≥ 32 characters. Must differ from the other two.                                                                                                                                                                  |
| `SECURE_LINK_TOKEN_SECRET_PEPPER`    | SECRET         | api, bootstrap                  | ≥ 32 characters. Must differ from the other two.                                                                                                                                                                  |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | SECRET         | api, worker, bootstrap          | base64 decoding to exactly 32 bytes (AES-256-GCM). Rotating it makes every undelivered envelope unopenable, which is why it may never share a value with a pepper — one value would couple two unrelated outages. |

`loadApp4SecretPepperConfig` rejects a pair that reuses another's value, so a
copy-paste is a startup failure rather than a shared blast radius.

## `embroidery-staff-bootstrap`

Consumed by: the `staff-bootstrap` Job only. Never read by normal API startup.

That Job is also the **only** publisher of `worker.runtime` (`APP12-H03-C1`),
because `policy_configuration_versions.created_by_admin_id` is `NOT NULL` and
this is the one admin-bearing path in the repository. A release that never runs
it leaves a worker that is Ready, claims nothing, and shows no failing probe —
see `infrastructure/kubernetes/README.md` and
`infrastructure/kubernetes/operator/staff-bootstrap-job.yaml`.

| Key                            | Classification  | Notes                                                                                                    |
| ------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| `STAFF_BOOTSTRAP_EMAIL`        | INTERNAL_CONFIG | Not a credential by itself, but it is only ever meaningful beside the password, so it shares the object. |
| `STAFF_BOOTSTRAP_PASSWORD`     | SECRET          | In production all three are **optional**: missing values skip bootstrap (exit 0) and mutate nothing.     |
| `STAFF_BOOTSTRAP_DISPLAY_NAME` | INTERNAL_CONFIG |                                                                                                          |

## `embroidery-tls`

Consumed by: the `Gateway` HTTPS listener, through `certificateRefs`.

| Key       | Classification | Notes                                                                                                         |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `tls.crt` | PUBLIC_CONFIG  | The certificate chain is public by construction.                                                              |
| `tls.key` | SECRET         | A production private key is never committed, never generated by this repository's tooling, and never printed. |

## Creating them

Out of band, by the operator, from values this repository never sees:

```sh
kubectl -n <namespace> create secret generic embroidery-secrets \
  --from-env-file=<a file the operator owns, outside this repository>

kubectl -n <namespace> create secret tls embroidery-tls \
  --cert=<operator-owned chain> --key=<operator-owned key>
```

`--from-env-file` keeps the values off the command line, which
`CLAUDE.md` §8a requires: an argument is visible in the process table and in
shell history, a file is not.
