# Kubernetes deployment model

Base manifests plus environment overlays, composed with **kustomize built into
`kubectl`** (`kubectl apply -k`). No Helm, no kustomize binary, no cluster
controller: `APP12-H02` §6 asks for the smallest dependency-free
Kubernetes-native shape when no mechanism already owns composition, and this
directory was empty and reserved before H02.

```
base/                  the production deployment model
  config/              non-secret ConfigMap + the Secret contract (names only)
  workloads/           api, worker, storefront, admin, migration Job
  routing/             Gateway API Gateway + HTTPRoutes + HTTP→HTTPS redirect
overlays/production/   external release values; empty until an operator supplies them
overlays/staging/      synthetic values under test control
operator/              applied by hand, in no kustomization — the bootstrap one-shot
staging-scaffolding/   disposable PostgreSQL + MinIO — test infrastructure ONLY
```

## Deploying

```sh
node tools/check-release-config.mjs production   # refuses before anything applies
kubectl apply -k infrastructure/kubernetes/overlays/production
```

The preflight is not optional decoration. It renders the overlay, checks every
required key's name and shape, rejects mutable image references and optional
secret references, and **never prints a configured value**. A production overlay
straight from Git fails it, by design: every externally-owned value is empty.

### The bootstrap one-shot is a release step, not a convenience

`APP12-H03-C1`. The `staff-bootstrap` CLI does two things, and the second is what
makes the worker able to work at all:

1. it creates or reuses the first Admin account, and
2. it publishes the versioned business policy that account authors — the APP4
   and APP6 datasets, the APP6 agreement content, and **`worker.runtime`**.

`worker.runtime` is the ten-value claim/lease/timeout/retry policy every worker
reads at startup. A worker with no policy is fail-closed by design: it stays up,
reports itself unready and **claims no job** — correctly, because nobody has
configured it. So a cluster where this one-shot has never run has a worker pod
that looks healthy, holds no lease, logs `WORKER_POLICY_MISSING` once, and
processes nothing. The only external symptom is the outbox backlog gauge
`APP12-H03` added; there is no failing probe and no restart loop.

`policy_configuration_versions.created_by_admin_id` is `NOT NULL`, so the policy
cannot be published without an Admin — which is exactly why the two live in one
command and why the base carries no Job for it. Production staff provisioning
stays an operator action (`overlays/staging/staff-bootstrap-job.yaml` records
that decision); the operator therefore runs the same one-shot, with the same
image, against production once `embroidery-staff-bootstrap` exists:

```sh
# after embroidery-staff-bootstrap exists and the migrate Job has completed;
# set the image to the same immutable reference the overlay resolves to
kubectl -n embroidery-production apply -f \
  infrastructure/kubernetes/operator/staff-bootstrap-job.yaml
kubectl -n embroidery-production wait --for=condition=complete \
  job/embroidery-staff-bootstrap --timeout=300s
kubectl -n embroidery-production logs job/embroidery-staff-bootstrap
```

That manifest is in **no** kustomization, deliberately: it is applied by hand so
a missing bootstrap Secret can never turn an otherwise healthy release into an
unschedulable pod. Staging runs the same command as part of its overlay, because
its credential is synthetic and generated per run.

The worker needs no restart afterwards: it re-reads the policy on its own
recheck interval **while it has none**, and adopts the first valid one it sees.
A policy that is already valid is never re-read, so a running fleet's lease
duration cannot change under jobs already leased against it.

## Two things this directory deliberately does NOT contain

**No `Ingress`, and no ingress-nginx.** `SYSTEM_ARCHITECTURE.md` §13 and
`docs/12-DECISION-LOG.md` D-036 both lock the production edge to the Gateway API
and Kubernetes Services, and state that `ingress-nginx` will not be used. The
concrete Gateway API *controller* remains an open decision requiring an ADR, so
`gatewayClassName` is a per-environment value this repository does not choose.

**No production PostgreSQL, object storage or broker.** The same section lists
stateful topology as subject to an ADR that has not been taken, and §5 of the
H02 prompt forbids moving persistence between in-cluster and managed in either
direction. The applications reach both through configuration (`DATABASE_URL`,
`OBJECT_STORAGE_ENDPOINT`), which is address-agnostic: these manifests run
unchanged against whichever the ADR eventually chooses. `staging-scaffolding/`
supplies disposable instances so the model can be proved end to end without
pre-empting the decision, and is labelled `embroidery.local/disposable: "true"`.

## Configuration changes need a restart

The ConfigMap is a plain resource, not a hashed generator output, so editing it
does not roll the pods. A release changes the image digest and rolls anyway; a
config-only change needs `kubectl rollout restart`. `APP12-H07` owns turning that
into the operator procedure.
