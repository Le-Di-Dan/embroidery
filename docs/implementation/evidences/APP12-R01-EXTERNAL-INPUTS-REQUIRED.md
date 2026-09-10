# APP12-R01 — External inputs required for Wave-1 GO

Product Owner / operator handoff from the Wave-1 release gate (2026-09-10).
Every item below is **externally owned**. The repository is ready for each one
and invents none. Names are the actual repository variable, file or decision
identifiers. **No value, secret or otherwise, belongs in this file, in a report,
or in a commit message** — except the store facts in §4, which are public
business copy and are committed as literals by design.

`node tools/check-release-config.mjs production` is the mechanical check for
§1–§3. It prints names and shapes only, never a value.

## 1. Non-secret release configuration

Where: `infrastructure/kubernetes/overlays/production/kustomization.yaml`
(`configMapGenerator` literals, merged over `base/config/configmap.yaml`).

| Key | Why required | Safe format |
|---|---|---|
| `STOREFRONT_PUBLIC_ORIGIN` | canonical tags, sitemap, and the origin of every `ORDER_ACCESS` link the worker emails | `https://<customer-domain>` — no path, no trailing slash, not loopback |
| `STAFF_ALLOWED_ORIGINS` | Admin CSRF/origin guard | `https://<admin-domain>` (comma-separated list) |
| `DESIGN_SESSION_ALLOWED_ORIGINS` | design-session origin policy (must still be stated for Wave 1) | `https://<customer-domain>` |
| `NOTIFICATION_TRANSPORT` | selects the real SMTP channel; `RECORDING` is refused | exactly `SMTP` |
| `SMTP_HOST` | the production relay | a hostname |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_REQUIRE_TLS` | base defaults `587` / `false` / `true`; override only if the provider requires it | integer / `true`\|`false` |
| `EMAIL_FROM_ADDRESS` | sender of the OTP and the secure-order email | a bare address, no display name |
| `EMAIL_FROM_NAME` | display name; base default is present | non-empty |
| `OBJECT_STORAGE_ENDPOINT` | production object store | absolute `https://` URL |
| `OBJECT_STORAGE_REGION` | base default `us-east-1`; override per provider | region string |
| `OBJECT_STORAGE_ORIGINALS_BUCKET` / `OBJECT_STORAGE_DERIVATIVES_BUCKET` | private originals and public derivatives | bucket names |

## 2. Merchant bank configuration (not secret — printed on the payment screen)

Where: the same production overlay literals.

| Key | Why required | Safe format |
|---|---|---|
| `PAYMENT_MERCHANT_BANK_BIN` | NAPAS acquirer id encoded into the transfer QR | exactly 6 digits |
| `PAYMENT_MERCHANT_ACCOUNT_NUMBER` | the receiving account | 6–19 digits |
| `PAYMENT_MERCHANT_ACCOUNT_NAME` | account holder shown to the customer | text |
| `PAYMENT_MERCHANT_BANK_DISPLAY_NAME` | bank name shown to the customer | text |

The transfer-reference authority is repository-owned (generated per payment
obligation) and needs no input. After the values are set, **a human must scan a
generated QR with a real banking app** and confirm the account, without
transferring money (`RB-14` §4.3). The preflight checks shapes only.

## 3. Secrets (operator-created Kubernetes Secrets, never in Git)

Where: Secret `embroidery-secrets` (contract: `infrastructure/kubernetes/base/config/secret-contract.md`), referenced non-optionally, so a missing key makes the pod fail to start.

| Key | Why required |
|---|---|
| `DATABASE_URL` | production PostgreSQL (after the topology decision in §6) |
| `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` | object-store credentials |
| `DESIGN_SESSION_SECRET_PEPPER` / `VERIFICATION_CODE_SECRET_PEPPER` / `SECURE_LINK_TOKEN_SECRET_PEPPER` | ≥ 32 characters each, mutually distinct |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | base64 of exactly 32 bytes; seals the OTP and secure-link token at rest |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | the production SMTP account |

Also: Secret `embroidery-tls` (`tls.crt`, `tls.key`) for the HTTPS listener,
unless the chosen edge owns TLS (§6). `STAFF_BOOTSTRAP_*` is optional in
production (`RB-04`).

## 4. Public store facts (`PO-APP12-002`)

Where: `apps/storefront/src/features/content-pages/model/store-facts.ts`,
`CANONICAL_STORE_FACTS`. These are business copy in a reviewed commit, **not**
environment variables. One entry lights up both the Local page and the footer.

| Fact | Format |
|---|---|
| store address | the exact text to publish |
| opening hours | the exact text to publish |
| phone | the display text, plus the `tel:` target |
| e-mail | the display text, plus the `mailto:` target |

## 5. Social contact links (`FU-APP10-I01-02`)

Where: the Storefront image **build arguments** `NEXT_PUBLIC_ZALO_CONTACT_URL`
and `NEXT_PUBLIC_MESSENGER_CONTACT_URL` (`infrastructure/docker/storefront.Dockerfile`).
They are inlined at build time, so a change needs an image rebuild. An absent
value omits that channel's button, so the UI never shows a broken action. Supply
both, or state in writing that the dock launches without them.

| Key | Format |
|---|---|
| `NEXT_PUBLIC_ZALO_CONTACT_URL` | absolute `https://` URL, no credentials |
| `NEXT_PUBLIC_MESSENGER_CONTACT_URL` | absolute `https://` URL, no credentials |

## 6. Architecture decisions (ADR-reserved — `FU-APP12-H02-05`, `FU-APP12-H07-04`)

| Decision | Where it lands |
|---|---|
| Gateway API controller → `gatewayClassName` | `overlays/production/gateway-patch.yaml` |
| production domain(s) → Gateway listener + HTTPRoute hostnames | `overlays/production/gateway-patch.yaml`, `route-hostnames-patch.yaml` |
| TLS termination owner and certificate source | `embroidery-tls` or the edge's own mechanism |
| production PostgreSQL topology and owner | ADR, then `DATABASE_URL` |
| production object-storage product, durability and owner | ADR, then §1 / §3 keys |
| backup mechanism for that topology, encryption at rest, off-site copy, cadence, RPO, RTO, operator-run restore rehearsal, object-store recovery | `RB-13` §2 (eight items) |
| edge body limit aligned with the API's 10 MiB ceiling (`FU-APP12-H04-C1-01`) | the chosen controller's policy |

## 7. Monitoring

| Input | Where |
|---|---|
| `production_alert_receiver` — a real destination that reaches a person | `infrastructure/monitoring/alertmanager/alertmanager.yml` `receivers` (currently the staging recording webhook) |
| `grafana_operator_credential` | operator-created Secret |
| `monitoring_persistence` (storage class) and `monitoring_retention` | depends on §6 |

## 8. Release identity

Where: `overlays/production/kustomization.yaml` `images[].newTag`. Replace every
`REPLACE_WITH_IMMUTABLE_RELEASE_REF` with a digest or git-SHA tag produced by the
release build. `latest` and bare sequence tags are refused.

## 9. Human proofs (not configuration)

| Proof | Owner |
|---|---|
| `ORDER_ACCESS_REAL_INBOX_MANUAL` — the secure-order email received from the real provider in a real inbox, opened, correct order shown, fragment stripped (`APP12-R01` §3.1) | Product Owner |
| `FIG-APPROVAL-APP12-R01-U01-COPY-PO-001` — U01 copy reconciliation of the approved frames, done against live Figma (`APP12-R01` §E) | design owner + Product Owner |
