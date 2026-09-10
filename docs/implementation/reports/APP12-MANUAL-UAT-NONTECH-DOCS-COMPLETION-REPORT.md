# APP12 — Manual UAT non-tech documents — Completion Report

2026-09-10. Documentation only.

## A. Verdict

```text
MANUAL_UAT_NONTECH_DOCS = COMPLETE
WAVE1_DEVELOPMENT       = READY
HUMAN_MANUAL_TEST       = ACTIVE
APP12_WAVE1             = MANUAL_ACCEPTANCE_IN_PROGRESS

RUNTIME_CHANGES     = 0
PRODUCTION_DEPLOYED = false
PUSHED              = false
```

## B. Development-vs-Release authority reconciliation

The Product Owner separated `DEV_READY` from production readiness:

```text
DEV_READY → Human Manual Acceptance → Bug Fix Loop → RELEASE_READY
  → Release Phase → Production Infra / .env Setup → Deploy
  → Post-deploy Verify → WAVE COMPLETE
```

This changes how the `APP12-R01` blocking matrix (§AE) is read. Items 3–11 were
recorded there as blocking the release. They are now release-phase inputs and
no longer block manual acceptance:

| R01 item | New classification |
|---|---|
| store facts, merchant bank values, SMTP relay/sender/credentials, envelope key, production `.env` | `RELEASE_PHASE_INPUT` |
| PostgreSQL, object storage, backup/restore | `RELEASE_PHASE_INFRA` |
| GatewayClass, TLS, domain | `RELEASE_PHASE_INFRA` |
| immutable image refs | `RELEASE_PHASE_DEPLOYMENT` |
| production alert receiver | `RELEASE_PHASE_OPERATIONS` |

The facts R01 measured are unchanged: automated acceptance PASS, 0 Ready-Made
runtime blockers, release-config production FAIL on external values only.

The R01 `NO_GO` verdict still answers its own question, which is whether Wave 1
can go to production. It no longer gates human testing. Two R01 items stay
open inside the manual-acceptance loop:

- **ORDER_ACCESS real-inbox proof.** This is now part of the PO's manual test
  (guide §3.7).
- **U01 Figma copy.** It still needs live Figma. It does not block the PO's
  manual test.

## C. File 1 created

`docs/implementation/evidences/APP12-WAVE1-HUONG-DAN-MANUAL-UAT-CHO-NGUOI-DUNG.md`,
"Hướng dẫn kiểm thử trải nghiệm Wave 1 — Nét Thêu". It covers:

- a product summary;
- the two roles;
- the customer journey, 12 steps (§8.1–§8.12 of the prompt);
- the staff journey, 12 steps (§9.1–§9.12);
- what to watch for on every screen;
- what counts as "good enough";
- five plain-language severity levels.

It is written as a free-exploration guide. It has no test-case numbering and no
PASS columns.

The UI labels it cites were checked against `packages/i18n/messages/vi`:
`Mua ngay`, `Phiên bản & SKU`, `Xuất bản`, `Tiền hàng`, `Đang chờ phí giao hàng`
and `Hoàn tất`. The email subject and `Mở đơn hàng` come from `APP12-E01-C1` §C.

## D. File 2 created

`docs/implementation/evidences/APP12-WAVE1-MAU-BAO-LOI-UAT-CHO-KHACH-HANG.md`,
"Mẫu báo lỗi / góp ý khi kiểm thử Nét Thêu". It contains:

- a copyable template;
- one filled everyday example;
- the section "Bạn không cần biết lỗi nằm ở đâu".

## E. Non-tech language audit

Both files are in Vietnamese. None of these terms appear: API, status code,
request/response, console, database, log, token, grant, capability, actor,
projection, aggregate, reservation, deposit, SMTP, worker.

Allowed terms, each explained on first use:

- Admin → "trang quản trị";
- SKU → "mã của từng lựa chọn sản phẩm cụ thể";
- email, QR.

One sentence describes the order link as "giống như chìa khóa". It warns the
customer not to forward the link and does not use the word token.

## F. Runtime changes = 0

Documentation only. No code, configuration, migration, infrastructure or
registry change. No `.env` read or write; the two dev hostnames come from
`.env.example`.

## G. Final status

```text
WAVE1_DEVELOPMENT      = READY
AUTOMATED_ACCEPTANCE   = PASS
READY_MADE_RUNTIME_BLOCKERS = 0
HUMAN_MANUAL_TEST      = ACTIVE
PRODUCTION_ENV_SETUP   = DEFERRED_TO_RELEASE_PHASE
PRODUCTION_INFRA_SETUP = DEFERRED_TO_RELEASE_PHASE
PRODUCTION_DEPLOYMENT  = NOT_STARTED
APP12_WAVE1            = MANUAL_ACCEPTANCE_IN_PROGRESS  (NOT_COMPLETE)
```

Nothing was deployed or pushed. No production `.env` or infrastructure was set
up. Wave 2 was not started.
