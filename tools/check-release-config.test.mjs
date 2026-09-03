/**
 * Focused tests for the release preflight (`APP12-H02` §18, continuation §8).
 *
 * The tool is a **release-safety gate**: everything downstream of it — a
 * production deploy — trusts that it refused when it should have. So the tests
 * are written the way a gate has to be tested, by proving each refusal
 * *individually* against a manifest that differs from a passing one in exactly
 * one way. A single "bad config fails" test would pass even if the tool were
 * refusing for the wrong reason.
 *
 * Each case renders a real overlay through the real `kubectl` path the tool
 * uses, because the tool's contract is about what `kubectl apply -k` would
 * produce, not about what a hand-built object literal looks like. The overlays
 * are written to a temporary directory that is removed afterwards.
 *
 * The last test is the one that matters most and is easiest to forget: a
 * synthetic secret-shaped value is planted in the ConfigMap and the tool's
 * whole output is asserted **not** to contain it. A preflight that explained a
 * malformed `DATABASE_URL` by printing it would write a production password
 * into a deployment log.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOL = join(REPOSITORY_ROOT, 'tools', 'check-release-config.mjs');
const KUBERNETES = join(REPOSITORY_ROOT, 'infrastructure', 'kubernetes');

/**
 * A synthetic value shaped like a credential. It is not one — nothing accepts
 * it — but it is distinctive enough that finding it in the tool's output proves
 * a leak.
 */
const SYNTHETIC_SECRET_MARKER = 'sYnThEtIc-h02-marker-9f3a7c1e-not-a-real-credential';

/**
 * An immutable-looking image reference the shape rules accept, so a test that
 * is about *something else* is never failed by the image rule.
 */
const VALID_IMAGE_DIGEST =
  'sha256:0000000000000000000000000000000000000000000000000000000000000001';

let workspace;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'h02-release-config-'));
  // The whole kubernetes tree is copied, not symlinked: kustomize refuses to
  // load a resource outside the kustomization root, so an overlay under test
  // has to sit beside a real base.
  cpSync(KUBERNETES, join(workspace, 'infrastructure', 'kubernetes'), { recursive: true });
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/**
 * Runs the tool against a copy of one overlay, after applying `mutate` to that
 * copy's `kustomization.yaml`. Returns the exit code and the combined output.
 *
 * The tool is invoked as a child process rather than imported, because "exits
 * non-zero" is half of its contract and a thrown exception is not the same
 * thing to a deployment pipeline.
 */
function runPreflight(target, mutate = (source) => source) {
  const overlay = join(workspace, 'infrastructure', 'kubernetes', 'overlays', target);
  const kustomization = join(overlay, 'kustomization.yaml');
  const original = readFileSync(kustomization, 'utf8');
  writeFileSync(kustomization, mutate(original));
  try {
    const stdout = execFileSync('node', [TOOL, target], {
      cwd: workspace,
      encoding: 'utf8',
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return {
      code: error.status ?? 1,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  } finally {
    writeFileSync(kustomization, original);
  }
}

/** Pins every image to a valid digest, which the committed overlays do not. */
function pinImages(source) {
  return source.replaceAll(
    /( {2}- name: embroidery\/(\w+)\n) {4}newTag: REPLACE_WITH_IMMUTABLE_RELEASE_REF/g,
    `$1    newName: registry.example/embroidery/$2\n    digest: ${VALID_IMAGE_DIGEST}`,
  );
}

/** Supplies every externally-owned production value with a valid placeholder. */
function fillProduction(source) {
  return pinImages(source)
    .replace('- STOREFRONT_PUBLIC_ORIGIN=\n', '- STOREFRONT_PUBLIC_ORIGIN=https://shop.example\n')
    .replace('- STAFF_ALLOWED_ORIGINS=\n', '- STAFF_ALLOWED_ORIGINS=https://admin.shop.example\n')
    .replace(
      '- DESIGN_SESSION_ALLOWED_ORIGINS=\n',
      '- DESIGN_SESSION_ALLOWED_ORIGINS=https://shop.example\n',
    )
    .replace('- OBJECT_STORAGE_ENDPOINT=\n', '- OBJECT_STORAGE_ENDPOINT=https://s3.example\n')
    .replace(
      '- OBJECT_STORAGE_ORIGINALS_BUCKET=\n',
      '- OBJECT_STORAGE_ORIGINALS_BUCKET=originals\n',
    )
    .replace(
      '- OBJECT_STORAGE_DERIVATIVES_BUCKET=\n',
      '- OBJECT_STORAGE_DERIVATIVES_BUCKET=derivatives\n',
    )
    .replace('- PAYMENT_MERCHANT_BANK_BIN=\n', '- PAYMENT_MERCHANT_BANK_BIN=970000\n')
    .replace(
      '- PAYMENT_MERCHANT_ACCOUNT_NUMBER=\n',
      '- PAYMENT_MERCHANT_ACCOUNT_NUMBER=0000000000\n',
    )
    .replace('- PAYMENT_MERCHANT_ACCOUNT_NAME=\n', '- PAYMENT_MERCHANT_ACCOUNT_NAME=EXAMPLE\n')
    .replace(
      '- PAYMENT_MERCHANT_BANK_DISPLAY_NAME=\n',
      '- PAYMENT_MERCHANT_BANK_DISPLAY_NAME=Example Bank\n',
    );
}

/**
 * Production's routing values live in two patch files, not in the
 * kustomization, so they are filled separately. Returns a restore function.
 *
 * `gatewayClassName` and both listener hostnames are deliberately empty in the
 * committed overlay — they are external release values — so a test that wants a
 * PASS has to supply them exactly as an operator would.
 */
function fillProductionPatches({ gatewayClassName = 'example-gateway' } = {}) {
  const overlay = join(workspace, 'infrastructure', 'kubernetes', 'overlays', 'production');
  const gateway = join(overlay, 'gateway-patch.yaml');
  const routes = join(overlay, 'route-hostnames-patch.yaml');
  const originalGateway = readFileSync(gateway, 'utf8');
  const originalRoutes = readFileSync(routes, 'utf8');

  writeFileSync(
    gateway,
    originalGateway
      .replace("gatewayClassName: ''", `gatewayClassName: ${gatewayClassName}`)
      .replaceAll("hostname: ''", "hostname: '*.shop.example'"),
  );
  // Each HTTPRoute's `hostnames: []` is filled by name, so a rename in the
  // overlay surfaces here as a test that stops mutating rather than one that
  // silently rewrites the wrong route.
  const hostnamesFor = { storefront: "['shop.example']", admin: "['admin.shop.example']" };
  writeFileSync(
    routes,
    originalRoutes
      .replace(
        /(name: embroidery-storefront\nspec:\n {2}hostnames: )\[\]/,
        `$1${hostnamesFor.storefront}`,
      )
      .replace(/(name: embroidery-admin\nspec:\n {2}hostnames: )\[\]/, `$1${hostnamesFor.admin}`)
      .replace(
        /(name: embroidery-https-redirect\nspec:\n {2}hostnames: )\[\]/,
        "$1['shop.example', 'admin.shop.example']",
      ),
  );

  return () => {
    writeFileSync(gateway, originalGateway);
    writeFileSync(routes, originalRoutes);
  };
}

describe('release preflight — staging', () => {
  it('passes when every value is supplied and every image is immutable', () => {
    const { code, output } = runPreflight('staging', pinImages);
    assert.ok(output.includes('RELEASE CONFIG staging: PASS'), output);
    assert.equal(code, 0);
  });

  it('refuses an empty STOREFRONT_PUBLIC_ORIGIN', () => {
    const { code, output } = runPreflight('staging', (source) =>
      pinImages(source).replace(
        '- STOREFRONT_PUBLIC_ORIGIN=https://staging.embroidery.local',
        '- STOREFRONT_PUBLIC_ORIGIN=',
      ),
    );
    assert.ok(output.includes('MISSING: STOREFRONT_PUBLIC_ORIGIN'), output);
    assert.equal(code, 1);
  });

  it('refuses an origin carrying a path or a query', () => {
    const { code, output } = runPreflight('staging', (source) =>
      pinImages(source).replace(
        '- STOREFRONT_PUBLIC_ORIGIN=https://staging.embroidery.local',
        '- STOREFRONT_PUBLIC_ORIGIN=https://staging.embroidery.local/shop?a=1',
      ),
    );
    assert.ok(output.includes('MALFORMED: STOREFRONT_PUBLIC_ORIGIN'), output);
    assert.equal(code, 1);
  });

  it('refuses a release flag that is neither "true" nor "false"', () => {
    const { code, output } = runPreflight('staging', (source) =>
      pinImages(source).replace(
        '- CUSTOM_EMBROIDERY_RELEASE_ENABLED=false',
        '- CUSTOM_EMBROIDERY_RELEASE_ENABLED=True',
      ),
    );
    assert.ok(output.includes('MALFORMED: CUSTOM_EMBROIDERY_RELEASE_ENABLED'), output);
    assert.equal(code, 1);
  });

  it('refuses a mutable `latest` image reference', () => {
    const { code, output } = runPreflight('staging', (source) =>
      pinImages(source).replaceAll(`digest: ${VALID_IMAGE_DIGEST}`, 'newTag: latest'),
    );
    assert.match(output, /IMAGE: .*mutable reference/);
    assert.equal(code, 1);
  });

  it('refuses the repository placeholder tag left unresolved', () => {
    const { code, output } = runPreflight('staging');
    assert.match(output, /IMAGE: .*repository placeholder tag/);
    assert.equal(code, 1);
  });

  it('refuses a required secretRef marked optional', () => {
    const api = join(workspace, 'infrastructure', 'kubernetes', 'base', 'workloads', 'api.yaml');
    const original = readFileSync(api, 'utf8');
    writeFileSync(
      api,
      original.replace(
        '- secretRef: { name: embroidery-secrets }',
        '- secretRef: { name: embroidery-secrets, optional: true }',
      ),
    );
    try {
      const { code, output } = runPreflight('staging', pinImages);
      assert.match(output, /SECRET: .*marked optional/);
      assert.equal(code, 1);
    } finally {
      writeFileSync(api, original);
    }
  });

  it('never prints a configured value, even a secret-shaped one', () => {
    const { code, output } = runPreflight('staging', (source) =>
      pinImages(source).replace(
        '- STOREFRONT_PUBLIC_ORIGIN=https://staging.embroidery.local',
        `- STOREFRONT_PUBLIC_ORIGIN=${SYNTHETIC_SECRET_MARKER}`,
      ),
    );
    // It must refuse — the marker is not a valid origin …
    assert.ok(output.includes('MALFORMED: STOREFRONT_PUBLIC_ORIGIN'), output);
    assert.equal(code, 1);
    // … and it must refuse without quoting what it read.
    assert.ok(!output.includes(SYNTHETIC_SECRET_MARKER), 'the tool printed a configured value');
  });
});

describe('release preflight — production', () => {
  it('refuses the committed overlay, because every external value is absent', () => {
    const { code, output } = runPreflight('production');
    assert.ok(output.includes('RELEASE CONFIG production: FAIL'), output);
    assert.ok(output.includes('MISSING: STOREFRONT_PUBLIC_ORIGIN'), output);
    assert.ok(output.includes('MISSING: PAYMENT_MERCHANT_BANK_BIN'), output);
    assert.equal(code, 1);
  });

  it('refuses a Gateway with no gatewayClassName', () => {
    const restore = fillProductionPatches({ gatewayClassName: "''" });
    try {
      const { code, output } = runPreflight('production', fillProduction);
      assert.ok(
        output.includes('ROUTING: Gateway/embroidery — declares no gatewayClassName'),
        output,
      );
      assert.equal(code, 1);
    } finally {
      restore();
    }
  });

  it('refuses an HTTPRoute with no hostname', () => {
    // The committed route patch leaves every hostname empty, so this needs no
    // mutation beyond supplying the ConfigMap values.
    const { code, output } = runPreflight('production', fillProduction);
    assert.ok(
      output.includes('ROUTING: HTTPRoute/embroidery-storefront — declares no hostname'),
      output,
    );
    assert.equal(code, 1);
  });

  it('refuses a loopback canonical origin that would pass the shape rule', () => {
    const restore = fillProductionPatches();
    try {
      const { code, output } = runPreflight('production', (source) =>
        fillProduction(source).replace(
          '- STOREFRONT_PUBLIC_ORIGIN=https://shop.example',
          '- STOREFRONT_PUBLIC_ORIGIN=http://localhost:3000',
        ),
      );
      // Structurally a valid origin — it is the *production* rule that rejects it.
      assert.ok(output.includes('PRODUCTION: STOREFRONT_PUBLIC_ORIGIN'), output);
      assert.ok(output.includes('loopback'), output);
      assert.equal(code, 1);
    } finally {
      restore();
    }
  });

  it('passes once every external value is supplied', () => {
    const restore = fillProductionPatches();
    try {
      const { code, output } = runPreflight('production', fillProduction);
      assert.ok(output.includes('RELEASE CONFIG production: PASS'), output);
      assert.equal(code, 0);
    } finally {
      restore();
    }
  });
});
