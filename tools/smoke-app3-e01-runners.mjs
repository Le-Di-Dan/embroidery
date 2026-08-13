#!/usr/bin/env node
/**
 * `APP3-E01` §3.2 — legitimate isolated client identities, by topology.
 *
 * ## The problem this solves, and the one it refuses to solve
 *
 * `IMP-D043` PO-07 caps anonymous Session creation at 5 an hour with a 2-a-minute
 * burst, keyed by an **ephemeral network key**. A cross-layer run that opens a
 * Session per journey and per benchmark scene needs more capacity than one source
 * has — and there are exactly three dishonest ways to get it, all forbidden:
 *
 * - sleeping out the window, which makes the run take an hour;
 * - restarting the API to clear an in-memory counter, which defeats the control
 *   the phase depends on;
 * - forging `X-Forwarded-For`, which `APP3-E01` has just **closed** as a security
 *   defect and must never reopen as a convenience.
 *
 * The honest answer is that the limit is *per source*, so the run should have
 * more than one **real** source. Each identity is a container with its own
 * address on the Compose network, forwarding one published loopback port to the
 * gateway. The browser connects to that port; the gateway sees the forwarder's
 * address and appends it as the trusted last hop; the API keys on the entry the
 * trusted hop wrote. Nothing about the policy changes, no header is forged, and
 * a runner cannot choose its own bucket any more than a customer can.
 *
 * ## Why loopback, and why a port per identity
 *
 * `APP3-S01` §26 established that a browser cannot open a Session at all except
 * against a **potentially trustworthy** origin — `Sec-Fetch-*` is not sent
 * otherwise and a `__Host-` cookie is refused. `http://localhost` is trustworthy
 * by definition *including its port*, so publishing each forwarder on its own
 * loopback port gives every identity a real, trustworthy browser origin. Those
 * origins are then named exactly in the run's allow-list — a list of exact
 * origins the run genuinely uses, never a wildcard.
 *
 * ## Why the address is assigned rather than left to Docker
 *
 * Measured during `APP3-E01`: three sequential `docker run --rm` containers were
 * handed the **same** recycled address, so the second pair inherited the first
 * pair's exhausted bucket (`201, 201, 429, 429`). With one explicit address each,
 * the same three creations were `201, 201, 201`. An identity that is only
 * *probably* distinct is not an isolation mechanism.
 *
 * Verified end to end before the journeys were written: with the host's own
 * bucket exhausted, a Session creation posted directly returned `429` while the
 * identical body through a forwarder returned `201`.
 *
 * Read-only, cross-platform pure Node: every function here builds argv, and the
 * orchestrator executes it.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A forwarder needs no browser and no shell. */
export const RUNNER_IMAGE = 'alpine/socat';

/** The gateway's in-network listener. Not 80: the tracked Compose publishes 8080. */
export const GATEWAY_TARGET = 'gateway:8080';

/** The Compose network the tracked development topology creates. */
export const NETWORK = 'embroidery-dev';

/**
 * The identities the run uses, one per role that needs its own Session budget.
 *
 * A block Compose does not allocate from in practice, so an assigned address
 * cannot collide with a service container. Fixed rather than random, so a rerun
 * lands in the same buckets rather than quietly acquiring fresh capacity — a run
 * whose limits reset every time would never notice that it had started
 * depending on more than the policy allows. That is also why the roles are few:
 * each one is a promise that the journeys it carries fit in 5 Sessions an hour.
 */
export const RUNNER_IDENTITIES = Object.freeze({
  desktop: { address: '172.25.240.11', port: 8091 },
  upload: { address: '172.25.240.12', port: 8092 },
  mobile: { address: '172.25.240.13', port: 8093 },
  conflict: { address: '172.25.240.14', port: 8094 },
  // The forged-header regression probe. Its own identity because it deliberately
  // spends a bucket down to `429` and must not spend a journey's.
  bypass: { address: '172.25.240.15', port: 8095 },
});

export const RUNNER_ROLES = Object.freeze(Object.keys(RUNNER_IDENTITIES));

export function containerFor(role) {
  return `app3-e01-hop-${role}`;
}

export function identityFor(role, identities = RUNNER_IDENTITIES) {
  const identity = identities[role];
  if (identity === undefined) throw new Error(`no runner identity for role "${role}"`);
  return identity;
}

/** The browser origin this role really uses. Exact, and trustworthy by definition. */
export function originFor(role, identities = RUNNER_IDENTITIES) {
  return `http://localhost:${String(identityFor(role, identities).port)}`;
}

/** The run's whole allow-list: every origin it uses, and nothing else. */
export function allowedOrigins(identities = RUNNER_IDENTITIES) {
  return Object.keys(identities)
    .map((role) => originFor(role, identities))
    .join(',');
}

/** Every address and every port is this role's and no other's. */
export function identitiesAreDistinct(identities = RUNNER_IDENTITIES) {
  const values = Object.values(identities);
  const addresses = new Set(values.map((identity) => identity.address));
  const ports = new Set(values.map((identity) => identity.port));
  return addresses.size === values.length && ports.size === values.length;
}

/**
 * `docker run` argv for one forwarder.
 *
 * `--ip` is the whole mechanism: the source the gateway observes is this role's
 * and no other's. The publish is bound to `127.0.0.1` so the run never exposes a
 * path into the topology beyond this machine.
 */
export function runnerArgs({ role, network = NETWORK, image = RUNNER_IMAGE, identities }) {
  const identity = identityFor(role, identities);
  const port = String(identity.port);
  return [
    'run',
    '-d',
    '--name',
    containerFor(role),
    '--network',
    network,
    '--ip',
    identity.address,
    '-p',
    `127.0.0.1:${port}:${port}`,
    image,
    `TCP-LISTEN:${port},fork,reuseaddr`,
    `TCP:${GATEWAY_TARGET}`,
  ];
}

export function removeArgs(role) {
  return ['rm', '-f', containerFor(role)];
}

/** No generated credential may reach a command line (`APP2-E01` established this). */
export function argsAreCredentialFree(args, secrets) {
  return !args.some((argument) => secrets.some((secret) => String(argument).includes(secret)));
}
