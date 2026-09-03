/**
 * Renders a Kubernetes overlay and hands back plain objects (`APP12-H02` §18).
 *
 * The validator inspects the **rendered** manifests rather than the source
 * files, because the source files are not what deploys: a value can arrive from
 * the base ConfigMap, from an overlay `configMapGenerator`, or from a patch,
 * and only the render knows which won. Checking the inputs would let a
 * production overlay pass while the thing `kubectl apply -k` produces is wrong.
 *
 * The render is done by `kubectl` itself — the same binary that will apply it —
 * for the reason `tools/compose-exposure.test.mjs` reads
 * `docker compose config --format json` instead of the YAML text: a tool's own
 * output is the only description of a tool's own behaviour. It also means a
 * manifest that does not render is a failure here, which is the manifest
 * validation §50 asks for.
 */
import { execFileSync } from 'node:child_process';

/**
 * `kubectl create --dry-run=client -o json` prints one JSON object per
 * resource, concatenated, rather than a JSON array. kubectl formats with a
 * four-space indent, so the only `}` in column zero is a document's closing
 * brace — which makes that the document separator. Split on it rather than
 * guessing at a streaming parser.
 */
function splitConcatenatedJson(text) {
  const documents = [];
  let buffer = '';
  for (const line of text.split(/\r?\n/)) {
    buffer += `${line}\n`;
    if (line === '}') {
      documents.push(JSON.parse(buffer));
      buffer = '';
    }
  }
  if (buffer.trim() !== '') {
    throw new Error('kubectl produced a trailing partial JSON document.');
  }
  return documents;
}

/**
 * Renders one overlay directory to a list of Kubernetes resources.
 *
 * Throws with kubectl's own message when the overlay does not render — a
 * malformed patch, a missing resource, an unparseable literal. That failure is
 * the point: it happens before a deploy, not during one.
 */
export function renderOverlay(overlayDirectory) {
  let rendered;
  try {
    rendered = execFileSync('kubectl', ['kustomize', overlayDirectory], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`kustomize render failed for ${overlayDirectory}: ${describe(error)}`);
  }

  try {
    // `patch --local` with an empty merge patch is a pure client-side
    // YAML-to-JSON conversion: it contacts no API server and needs no RESTMapper,
    // so `Gateway` and `HTTPRoute` convert without their CRDs being installed
    // anywhere. `create --dry-run=client` looks like the natural choice and is
    // not — it resolves every kind against a live server and fails with
    // "ensure CRDs are installed first", which would make this preflight
    // require the cluster it exists to run *before*.
    const json = execFileSync(
      'kubectl',
      ['patch', '-f', '-', '--local', '--dry-run=client', '--type=merge', '-p', '{}', '-o', 'json'],
      { encoding: 'utf8', input: rendered, maxBuffer: 32 * 1024 * 1024 },
    );
    return splitConcatenatedJson(json);
  } catch (error) {
    throw new Error(`manifest conversion failed for ${overlayDirectory}: ${describe(error)}`);
  }
}

/**
 * kubectl's diagnostics arrive on stderr. Reported verbatim — these messages
 * describe manifest structure, never a configured value, because the validator
 * never renders a Secret (none is committed) and a ConfigMap error names the
 * key, not the datum.
 */
function describe(error) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  return stderr !== '' ? stderr : String(error?.message ?? error);
}

/** The single `embroidery-config` ConfigMap from a rendered overlay. */
export function readConfigMap(resources) {
  const found = resources.find(
    (resource) => resource.kind === 'ConfigMap' && resource.metadata?.name === 'embroidery-config',
  );
  if (found === undefined) {
    throw new Error('the overlay renders no `embroidery-config` ConfigMap.');
  }
  return found.data ?? {};
}

/** Every container image reference in the rendered overlay, with its owner. */
export function readImageReferences(resources) {
  const references = [];
  for (const resource of resources) {
    const containers = resource.spec?.template?.spec?.containers ?? [];
    for (const container of containers) {
      references.push({
        owner: `${resource.kind}/${resource.metadata?.name}`,
        container: container.name,
        image: container.image ?? '',
      });
    }
  }
  return references;
}

/** Every `secretRef` an env source declares, with its owner. */
export function readSecretReferences(resources) {
  const references = [];
  for (const resource of resources) {
    const containers = resource.spec?.template?.spec?.containers ?? [];
    for (const container of containers) {
      for (const source of container.envFrom ?? []) {
        if (source.secretRef?.name !== undefined) {
          references.push({
            owner: `${resource.kind}/${resource.metadata?.name}`,
            name: source.secretRef.name,
            optional: source.secretRef.optional === true,
          });
        }
      }
    }
  }
  return references;
}

/** Gateways and HTTPRoutes, reduced to the fields the contract cares about. */
export function readRouting(resources) {
  return {
    gateways: resources
      .filter((resource) => resource.kind === 'Gateway')
      .map((resource) => ({
        name: resource.metadata?.name,
        gatewayClassName: resource.spec?.gatewayClassName ?? '',
        listeners: resource.spec?.listeners ?? [],
      })),
    routes: resources
      .filter((resource) => resource.kind === 'HTTPRoute')
      .map((resource) => ({
        name: resource.metadata?.name,
        hostnames: resource.spec?.hostnames ?? [],
        rules: resource.spec?.rules ?? [],
      })),
  };
}
