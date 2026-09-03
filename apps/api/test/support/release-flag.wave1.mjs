/**
 * The Wave-1 default: the release flag is set **explicitly**, never inherited
 * (`APP12-H02` continuation §7 — `FU-APP12-B02-03`).
 *
 * `false` is also what the runtime does when the variable is absent, so it would
 * be easy to argue this file is redundant. It is not, for two reasons.
 *
 * A suite that inherits an ambient value produces a different result on a
 * developer's machine than in a clean checkout, and the failure it produces —
 * `404` from a route the suite believes exists — names nothing that would lead
 * anyone to the environment. That is exactly how `FU-APP12-B02-03` was filed.
 *
 * And a *deliberate* `false` is the assertion. It says these suites are meant to
 * run against a Wave-1 release, so a Wave-2 operation reaching one of them is a
 * finding rather than a coincidence of configuration.
 */
process.env['CUSTOM_EMBROIDERY_RELEASE_ENABLED'] = 'false';
