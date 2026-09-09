/**
 * States this test run's notification transport (`APP12-N01.B01`).
 *
 * `NotificationDeliveryModule` no longer has a wiring default: composing it
 * requires `NOTIFICATION_TRANSPORT` to be stated, because a default is exactly
 * how the `APP12-U01` blocker reached a deployment — the worker was bound to the
 * in-memory recording adapter unconditionally, so every verification code
 * "delivered" successfully and no customer received anything.
 *
 * Every worker suite that composes the real `WorkerModule` therefore has to say
 * what it delivers over, and `RECORDING` is the honest answer for all of them:
 * they assert on the captured delivery, and the loader permits it here precisely
 * because a Jest run is not a delivering environment. The suites that exercise
 * the SMTP transport construct that adapter directly against a disposable
 * loopback listener and never read this value.
 *
 * Set here rather than in each context so a suite added later cannot silently
 * inherit a *production* default; there is none to inherit.
 */
process.env.NOTIFICATION_TRANSPORT ??= 'RECORDING';
