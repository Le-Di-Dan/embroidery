#!/usr/bin/env node
/**
 * Release preflight — the gate that refuses a deploy before it happens
 * (`APP12-H02` §18).
 *
 * ```
 *   node tools/check-release-config.mjs staging
 *   node tools/check-release-config.mjs production
 * ```
 *
 * It answers one question: *would applying this overlay produce a runtime that
 * is correctly configured?* It checks names and shapes and it **never prints a
 * configured value**. A failure reads
 *
 * ```
 *   MISSING: STOREFRONT_PUBLIC_ORIGIN
 * ```
 *
 * and never `VALUE: …`. The rule matters most exactly where it is most
 * tempting to break it: explaining why a `DATABASE_URL` is malformed by showing
 * it would write a production password into a deployment log.
 *
 * ## What it refuses
 *
 * - a required key that is absent or empty — including every value this
 *   repository deliberately leaves empty because it is externally owned (§44);
 * - a value whose *shape* is wrong (a public origin carrying a path, a release
 *   flag spelled `True`, a six-digit bank id that is not six digits);
 * - a production value that is structurally valid but categorically wrong: a
 *   loopback canonical origin, `sslmode=disable`, an unauthenticated Swagger UI,
 *   a non-Secure session cookie behind a TLS edge;
 * - a mutable image reference. `latest`, an unresolved placeholder, or a bare
 *   tag on a production target is not a release identity: the thing it names can
 *   change under a running deployment, and no rollback can name what was there
 *   before;
 * - a `secretRef` marked `optional`, which would let a workload start with no
 *   database URL and no envelope key rather than fail closed;
 * - a Gateway with no `gatewayClassName`, or an HTTPRoute with no hostname —
 *   an edge that routes nothing;
 * - an HTTPS listener with no `certificateRefs`.
 *
 * ## Why it reads the rendered overlay
 *
 * See `check-release-config.render.mjs`: the source files are not what deploys.
 * Rendering also means a manifest that does not build fails here rather than
 * during a release.
 */
import { argv, exit, stdout } from 'node:process';

import {
  CONFIG_RULES,
  LOOPBACK_HOSTNAMES,
  REQUIRED_SECRET_KEYS,
} from './check-release-config.contract.mjs';
import {
  readConfigMap,
  readImageReferences,
  readRouting,
  readSecretReferences,
  renderOverlay,
} from './check-release-config.render.mjs';

const TARGETS = Object.freeze({
  staging: 'infrastructure/kubernetes/overlays/staging',
  production: 'infrastructure/kubernetes/overlays/production',
});

/** Placeholders the repository ships so an unfinished release cannot deploy. */
const PLACEHOLDER_PATTERN = /REPLACE(D)?_(WITH|BY)_/;

/**
 * Collects failures rather than throwing on the first one. An operator fixing a
 * release wants the whole list, not one key per attempt.
 */
class Findings {
  #entries = [];

  add(code, subject, detail) {
    this.#entries.push({ code, subject, detail });
  }

  get failed() {
    return this.#entries.length > 0;
  }

  get entries() {
    return this.#entries;
  }
}

function checkConfig(config, target, findings) {
  const isProduction = target === 'production';

  for (const rule of CONFIG_RULES) {
    const present = Object.hasOwn(config, rule.key);
    const value = config[rule.key];

    if (!present) {
      if (rule.required) {
        findings.add('MISSING', rule.key, `not declared; expected ${rule.shape}`);
      }
      continue;
    }

    if (typeof value !== 'string' || value.trim() === '') {
      if (rule.required) {
        findings.add('MISSING', rule.key, `declared but empty; expected ${rule.shape}`);
      }
      continue;
    }

    if (!rule.accepts(value)) {
      findings.add('MALFORMED', rule.key, `expected ${rule.shape}`);
      continue;
    }

    if (!isProduction) {
      continue;
    }

    if (rule.productionMustEqual !== undefined && value !== rule.productionMustEqual) {
      findings.add('PRODUCTION', rule.key, `must be ${rule.productionMustEqual} in production`);
    }
    if (rule.productionMustNotEqual !== undefined && value === rule.productionMustNotEqual) {
      findings.add(
        'PRODUCTION',
        rule.key,
        `must not be ${rule.productionMustNotEqual} in production`,
      );
    }
    if (rule.rejectLoopbackInProduction === true && namesLoopback(value)) {
      findings.add(
        'PRODUCTION',
        rule.key,
        'resolves to a loopback host, which no customer can reach',
      );
    }
  }
}

/**
 * Whether a value names a loopback host. Parses each comma-separated entry as a
 * URL and inspects only its hostname, so the check cannot be defeated by a path
 * or a port and never has to look at the rest of the value.
 */
function namesLoopback(value) {
  return value.split(',').some((entry) => {
    try {
      return LOOPBACK_HOSTNAMES.includes(new URL(entry.trim()).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}

function checkImages(references, target, findings) {
  for (const reference of references) {
    const subject = `${reference.owner}/${reference.container}`;
    const image = reference.image;

    if (image === '') {
      findings.add('IMAGE', subject, 'declares no image');
      continue;
    }
    if (PLACEHOLDER_PATTERN.test(image)) {
      findings.add('IMAGE', subject, 'still carries the repository placeholder tag');
      continue;
    }

    // Split on the LAST colon that follows the last slash, so a registry
    // carrying a port (`registry:5000/embroidery/api`) is not mistaken for a tag.
    const lastSlash = image.lastIndexOf('/');
    const tagSeparator = image.lastIndexOf(':');
    const hasTag = tagSeparator > lastSlash;
    const tag = hasTag ? image.slice(tagSeparator + 1) : '';

    if (image.includes('@sha256:')) {
      continue; // A digest is the strongest possible release identity.
    }
    if (!hasTag || tag === 'latest') {
      findings.add(
        'IMAGE',
        subject,
        'uses a mutable reference (no tag, or `latest`); a release needs an immutable tag or digest',
      );
      continue;
    }
    // Disposable staging images are pinned by the harness to a per-run tag, so
    // the shape rule is the same in both targets; only the message differs.
    if (target === 'production' && /^v?\d+$/.test(tag)) {
      findings.add('IMAGE', subject, 'uses a sequence tag that a later build can move');
    }
  }
}

function checkSecrets(references, findings) {
  const referenced = new Set();
  for (const reference of references) {
    referenced.add(reference.name);
    if (reference.optional) {
      findings.add(
        'SECRET',
        `${reference.owner} -> ${reference.name}`,
        'is marked optional, so the workload would start with the secret absent',
      );
    }
  }
  for (const name of Object.keys(REQUIRED_SECRET_KEYS)) {
    if (!referenced.has(name)) {
      findings.add('SECRET', name, 'is declared by the contract but referenced by no workload');
    }
  }
}

function checkRouting(routing, findings) {
  for (const gateway of routing.gateways) {
    if (
      gateway.gatewayClassName.trim() === '' ||
      PLACEHOLDER_PATTERN.test(gateway.gatewayClassName)
    ) {
      findings.add('ROUTING', `Gateway/${gateway.name}`, 'declares no gatewayClassName');
    }
    for (const listener of gateway.listeners) {
      const hostname = listener.hostname ?? '';
      if (hostname.trim() === '' || PLACEHOLDER_PATTERN.test(hostname)) {
        findings.add('ROUTING', `Gateway/${gateway.name}#${listener.name}`, 'declares no hostname');
      }
      if (listener.protocol === 'HTTPS' && (listener.tls?.certificateRefs ?? []).length === 0) {
        findings.add(
          'ROUTING',
          `Gateway/${gateway.name}#${listener.name}`,
          'terminates HTTPS but references no TLS certificate',
        );
      }
    }
  }

  for (const route of routing.routes) {
    const hostnames = route.hostnames.filter(
      (hostname) => hostname.trim() !== '' && !PLACEHOLDER_PATTERN.test(hostname),
    );
    if (hostnames.length === 0) {
      findings.add('ROUTING', `HTTPRoute/${route.name}`, 'declares no hostname');
    }
  }
}

function main() {
  const target = argv[2];
  if (!Object.hasOwn(TARGETS, target ?? '')) {
    stdout.write(
      `usage: node tools/check-release-config.mjs <${Object.keys(TARGETS).join('|')}>\n`,
    );
    exit(2);
  }

  const findings = new Findings();
  let resources;
  try {
    resources = renderOverlay(TARGETS[target]);
  } catch (error) {
    stdout.write(`RELEASE CONFIG ${target}: FAIL\n  RENDER: ${error.message}\n`);
    exit(1);
  }

  checkConfig(readConfigMap(resources), target, findings);
  checkImages(readImageReferences(resources), target, findings);
  checkSecrets(readSecretReferences(resources), findings);
  checkRouting(readRouting(resources), findings);

  if (!findings.failed) {
    stdout.write(`RELEASE CONFIG ${target}: PASS (${resources.length} resources)\n`);
    return;
  }

  stdout.write(`RELEASE CONFIG ${target}: FAIL (${findings.entries.length})\n`);
  for (const entry of findings.entries) {
    stdout.write(`  ${entry.code}: ${entry.subject} — ${entry.detail}\n`);
  }
  exit(1);
}

main();
