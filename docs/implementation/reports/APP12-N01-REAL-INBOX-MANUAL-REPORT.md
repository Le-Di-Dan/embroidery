# APP12-N01 — Real-Inbox Manual Acceptance — Execution Report

```text
REAL_INBOX_MANUAL              = PASS
REAL_EMAIL_RECEIVED            = true
OTP_FROM_REAL_INBOX_VERIFIED   = true
RESEND_REAL_INBOX              = PASS
PHONE_SMS_VERIFICATION_PRESENT = false
REAL_ORDER_CREATED             = false
REAL_PAYMENT_SUBMITTED         = false

MESSAGE_CONTENT_INSPECTION     = PASS — PO CONFIRMED (steps 6, 7, 11)
APP12-N01                      = COMPLETE — PO PASS

APP12-U01                      = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01                      = NOT_AUTHORIZED
```

Date: 2026-09-10 · Branch: `feat/app11-s04-seo-infrastructure`
Transport: real third-party SMTP relay, port 587, STARTTLS required.

No OTP, SMTP credential, envelope key, pepper or raw token appears anywhere in
this report. No runtime code was changed during the test.

Browser screenshots of the five states are in the gitignored `.playwright-mcp/`
(`n01-manual-01…05`). They are deliberately not committed: the repository keeps
evidence as markdown, and each frame shows only the masked destination
`d***@gmail.com` — no code was ever on screen when a frame was captured.

---

## A. Verdict

The verification OTP **left the application over a real SMTP relay, reached a
real inbox the Product Owner controls, and was accepted by the real Storefront
UI** — twice: once on first issue and once on a resend. The Product Owner has
read the delivered messages and accepted them. `APP12-N01` closes.

Three environment defects blocked the run before any of it could happen. None
was a runtime-code defect, all three were real, and each would have stopped a
first-time operator cold (§C).

---

## B. Evidence

### B.1 The transport is the SMTP adapter, not an environment variable

The startup line is emitted on the factory branch that returns
`new SmtpNotificationChannelAdapter(config.smtp)`
(`apps/worker/src/jobs/notification-delivery/config/notification-channel.factory.ts:52`),
so it reports the **resolved adapter**, not what the environment claimed:

```text
NotificationChannel: NOTIFICATION_TRANSPORT=SMTP via <relay-host>:587.
WorkerBootstrap:     Worker readiness: ready (ok).
```

`nodemailer@10.0.1` resolves inside the container. This matters because the
`N01.S01` lesson is exactly that an env var is not proof a transport is bound.

### B.2 Three sends, one delivery attempt each, no retries

`notification_delivery_attempts`:

| # | created_at (UTC) | outcome | what it was |
|---|---|---|---|
| 1 | 00:52:01 | `DELIVERED` | first issue |
| 2 | 00:54:08 | `DELIVERED` | second issue (to set up the resend leg) |
| 3 | 00:55:41 | `DELIVERED` | the resend |

Each is a single row at `attemptNo=1`. The worker job log for the first:

```text
SmtpNotificationChannelAdapter: Delivered EMAIL to d***@gmail.com.
worker.job.completed  NOTIFICATION_DELIVERY:66:1  outcome=SUCCEEDED  attemptNo=1
```

`notification_intents` reached `SATISFIED`. So the *application* sent exactly one
message per request. How many *arrived* is the inbox's answer rather than the
database's, and the Product Owner confirmed three — one per row (§D).

### B.3 The code from the real inbox verified, twice

`contact_verification_challenges` (this run only):

| created_at | expires_at | status | verified_at |
|---|---|---|---|
| 00:51:57 | 01:01:57 | `VERIFIED` | 00:52:50 |
| 00:54:05 | 01:04:05 | `CANCELLED` | — |
| 00:55:37 | 01:05:37 | `VERIFIED` | 00:56:16 |

`contact_verification_attempts`: two rows, **both `MATCH`**, no mismatch, no
lockout. Each code was read by the Product Owner out of the real mailbox and
typed into the browser.

The TTL is `00:51:57 → 01:01:57` — exactly the 600 seconds the active policy
records and exactly what the UI sentence *"Mã có hiệu lực trong 10 phút"* claims.
The displayed copy and the enforced window agree.

### B.4 The resend authority is enforced in data, not only in copy

The middle challenge is `CANCELLED`, superseded the moment the resend issued.
The UI said *"Mã cũ không còn dùng được. Hãy nhập mã trong email mới nhất."* and
the row proves the statement is a constraint rather than a reassurance. The
resent code then verified normally. Cooldown behaved as policy: the button was
disabled with a live countdown and only became clickable after 60 s.

Active policy, read from `policy_configurations` (`verification.challenge`):
`ttlSeconds 600`, `resendCooldownSeconds 60`, `rateWindowSeconds 900`,
`maxIssuesPerTargetPerWindow 5`, `maxAttempts 5`, `codeLength 6`. Three issues
were used of five, well inside the window.

### B.5 No phone or SMS path exists

- **In the browser**, twice: one field labelled `Email`, heading *"Xác minh
  email"*, helper text naming only email. No EMAIL/PHONE selector, no SMS or
  phone wording, no hidden control.
- **In the message catalog**: the whole `verification` block of
  `packages/i18n/messages/vi/checkout.json` contains no `sms`, `điện thoại` or
  `tin nhắn`.
- **In the feature source**: every `PHONE`/`phone`/`sms` occurrence under
  `apps/storefront/src/features/contact-verification/` is a *comment explaining
  the removal*. Filtering comment lines leaves zero executable matches. The
  removal was done at the type, so a phone request is inexpressible rather than
  refused.

### B.6 Nothing secret reached a log

Across the full run, API and worker logs contain **zero** occurrences of either
OTP, zero of the recipient's full address (it is masked to `d***@gmail.com` at
the delivery boundary), and zero of any credential variable's value.

---

## C. Defects found — all environmental, none in runtime code

These are recorded because each one silently prevented delivery, and two of them
were invisible from the repository.

### C.1 The dev worker could not compile the SMTP adapter (`FU-APP12-N01-M01-01`)

The running worker had been failing its watch-mode compile for ~18 hours:

```text
smtp-notification-channel.adapter.ts:45 - error TS2307:
Cannot find module 'nodemailer' or its corresponding type declarations.
```

`nodemailer` is in `apps/worker/package.json` and in `pnpm-lock.yaml`, but the
dev container takes `node_modules` from its image and bind-mounts only
`apps/worker/src`. The container was therefore executing pre-`N01.B01` code while
looking healthy — `Worker readiness: ready (ok)` the whole time.

**Fix:** rebuild the worker image. **Lesson:** a dependency added to a workspace
package does not reach a running dev container; readiness does not imply the new
code is loaded.

### C.2 `/xac-minh-lien-he` returned HTTP 500 at HEAD

```text
[i18n] Missing message key: verification.codeEntry.inboxHint
```

The key exists in `packages/i18n/messages/vi/checkout.json` **and inside the
container** — the bind mount is correct. Next's dev module cache had never
re-read the changed JSON, the Windows bind-mount recompile problem this repo has
hit before. Static gates pass against the repository while the container serves
a stale copy, and `messageView` throws rather than degrading, so the page 500s.

**Fix:** restart the storefront container. No code change.

### C.3 `NOTIFICATION_DELIVERY_ENVELOPE_KEY` had never been set in this dev world

The first real request failed with HTTP 500:

```text
NOTIFICATION_DELIVERY_ENVELOPE_KEY is required: the notification delivery
envelope is sealed with AES-256-GCM and there is no unencrypted fallback.
```

The variable was **absent from `.env` entirely** — not empty, absent — while both
APP4 peppers were set. It is the one variable in the notification path with no
Compose default, deliberately: a process that cannot seal must not issue a secret
it can never deliver.

The failure was clean. The transaction rolled back: no challenge row, no attempt
row, no intent row, no rate-limit slot consumed. The UI's *"bạn không bị mất lượt
nào"* was literally accurate.

**Significance:** this means **the real OTP path had never once run against this
development stack**. `E01`'s automated acceptance runs in an isolated e2e tier
that loads its own environment, so it could not surface the gap. Only a manual
run against the ordinary stack could.

**Fix:** the operator generated and added the key. Never read, echoed or written
by this session.

### C.4 The gateway held a stale upstream address after the API recreate

After `--force-recreate api`, the API was healthy on its own probe while every
request through the gateway returned `502` for four minutes: NGINX had cached the
old container IP. **Fix:** restart the gateway. Worth knowing before it is
misread as an application failure.

---

## D. The Product Owner's inbox findings

Steps 6, 7 and 11 cannot be discharged from outside the mailbox. Both were
answered by the Product Owner on 2026-09-10.

**Steps 6 and 11 — exactly three messages arrived**, matching the three
`DELIVERED` rows one-for-one. One request, one message: no duplicate, no silent
retry, no missing send.

**Step 7 — the message content was accepted.** In the Product Owner's own words:
*"nội dung thư đúng quy cách, không sai font chữ, nội dung tinh gọn dễ hiểu."*

The encoding half of that answer is the load-bearing one. The Vietnamese subject
exceeds the 76-byte RFC 2047 encoded-word limit and therefore arrives as two
adjacent encoded words whose separating whitespace must be dropped — get it
wrong and the brand renders as `Nét T hêu`, or the whole header as mojibake.
`E01` found exactly that defect in its own MIME reader, against a synthetic
message. This run is the first time the rendering has been confirmed in a real
mail client, and it is correct.

This is the Product Owner's holistic acceptance of the message rather than an
item-by-item transcript; it is recorded as such deliberately, because step 7 is
the Product Owner's judgement to make and this report should not restate it as
something more granular than what was given.

`APP12-U01` remains suspended regardless: its variant-authoring and
publication-readiness blockers are independent of `N01`.

---

## E. Operational note — the dev stack now sends real email

`NOTIFICATION_TRANSPORT=SMTP` is live in the development `.env`. Every
verification code, secure link and order notification issued from this stack
will now reach a real mailbox over the configured relay.

That is correct for this test and wrong as a resting state: ordinary local work,
UAT clicking and any manual notification path will send genuine mail to whatever
address is typed. Consider setting `NOTIFICATION_TRANSPORT=RECORDING` back in
`.env` once this acceptance is filed — the operator's edit, not this session's.

The isolated e2e tiers are unaffected either way: they load their own
environment and default `RECORDING` themselves.

---

## F. Configuration note

The SMTP block and the envelope key were added to `.env` **by the operator**.
This session never wrote `.env`, never read a protected value out of it, and
never passed one on a command line. Compose consumed the file directly
(`--env-file .env`), so each secret travelled file → process without being read
out (`CLAUDE.md` §8a, `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §9a).
