/**
 * @jest-environment node
 *
 * Static boundary checks on the `/truy-cap/duyet-thiet-ke` production source
 * (`APP6-S02` §4, §6, §7, §10, §11, §12, §21, §22, §26).
 *
 * These guard rules no rendering test can reach. A component test can only show
 * that the paths it drove behaved correctly; these say that the *only* way to
 * behave incorrectly has been removed from the source — no storage address
 * exists to persist a credential or a document, no download API exists to
 * export artwork, no hashing exists to invent an authority the server owns, no
 * `dangerouslySetInnerHTML` exists to execute a policy body, and no route
 * string exists to navigate out of the secure session mid-decision.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE = join(__dirname, '..', '..', 'src', 'features', 'secure-design-review');
const ROUTE = join(__dirname, '..', '..', 'src', 'app', 'truy-cap', 'duyet-thiet-ke', 'page.tsx');
const STYLESHEET = join(FEATURE, 'styles', 'secure-design-review.scss');

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collect(path) : [path];
  });
}

const files = collect(FEATURE);
const code = files.filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'));
const sources = new Map(code.map((path) => [path, readFileSync(path, 'utf8')]));
const allCode = [...sources.values()].join('\n');

/** Source with comments removed, so prose about a rule is not read as the rule. */
function stripped(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const executable = [...sources.values()].map(stripped).join('\n');

describe('APP6-S02 — the feature layout', () => {
  it('places every production file under a responsibility folder', () => {
    const misplaced = files
      .map((path) => path.slice(FEATURE.length + 1).replace(/\\/g, '/'))
      .filter((relative) => relative !== 'index.ts' && !relative.includes('/'));
    expect(misplaced).toEqual([]);
  });

  it('keeps every source file inside the line limit', () => {
    const oversized = [...sources]
      .map(([path, text]) => ({ path, lines: text.split('\n').length }))
      .filter((file) => file.lines > 400);
    expect(oversized).toEqual([]);
  });

  it('exports only the screen', () => {
    const barrel = readFileSync(join(FEATURE, 'index.ts'), 'utf8');
    expect(barrel.match(/^export /gm)).toHaveLength(1);
    expect(barrel).toContain('SecureDesignReviewScreen');
  });
});

describe('APP6-S02 — the design never leaves the browser', () => {
  it('reaches no browser persistence at all', () => {
    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'document.cookie',
      'showSaveFilePicker',
      'requestFileSystem',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('offers no download, export or clipboard path for the artwork', () => {
    for (const forbidden of [
      'download',
      'createObjectURL',
      'Blob(',
      'toDataURL',
      'toBlob',
      'navigator.clipboard',
      'execCommand',
      'XMLSerializer',
      'saveAs',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('serializes no document to JSON anywhere', () => {
    expect(executable).not.toContain('JSON.stringify');
  });

  it('writes nothing to the console', () => {
    expect(executable).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  it('sends nothing to an analytics or beacon sink', () => {
    for (const forbidden of ['sendBeacon', 'gtag(', 'dataLayer', 'analytics.']) {
      expect(executable).not.toContain(forbidden);
    }
  });
});

describe('APP6-S02 — one renderer, and it is native SVG', () => {
  it('depends on no rendering engine or interaction library', () => {
    expect(executable).not.toContain('<canvas');
    for (const engine of ['konva', 'Konva', 'fabric', 'Fabric', 'pixi', 'PIXI', 'interact.js']) {
      expect(executable).not.toContain(engine);
    }
  });

  it('opens exactly one <svg> in the whole feature', () => {
    // Two would be two renderers, whatever they were called.
    expect(executable.split('<svg').length - 1).toBe(1);
  });

  it('keeps geometry in the engine and out of the renderer', () => {
    expect(executable).toContain('@embroidery/design-engine');
    for (const localGeometry of [
      'Math.cos',
      'Math.sin',
      'Math.atan2',
      'Math.PI',
      'multiplyMatrices(',
      'composeMatrices(',
      'pxPerMm *',
      '/ pxPerMm',
    ]) {
      expect(executable).not.toContain(localGeometry);
    }
  });

  it('measures nothing from the DOM', () => {
    for (const measurement of [
      'getBoundingClientRect',
      'DOMRect',
      'DOMMatrix',
      'getBBox',
      'getScreenCTM',
      'offsetWidth',
      'clientWidth',
      'getComputedStyle',
    ]) {
      expect(executable).not.toContain(measurement);
    }
  });

  it('validates the document through the one package authority and no other', () => {
    expect(executable).toContain('validateDesignDocumentStructure');
    // No second schema, no second validator, no ad-hoc shape check.
    for (const forbidden of ['zod', 'ajv', 'yup', 'JSON.parse']) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('offers no editing capability over a design under review', () => {
    for (const editing of ['onDragStart', 'draggable', 'onWheel', 'onMouseMove', 'undoStack']) {
      expect(executable).not.toContain(editing);
    }
  });
});

describe('APP6-S02 — the watermark cannot be switched off', () => {
  it('is mounted by the preview with no condition on it', () => {
    const preview = sources.get(join(FEATURE, 'ui', 'design-preview.tsx')) ?? '';
    expect(preview).toContain('<ReviewWatermark');
    // No prop, no flag, no ternary decides whether it appears.
    expect(stripped(preview)).not.toMatch(/\{[^}]*&&\s*<ReviewWatermark/);
    expect(stripped(preview)).not.toMatch(/hideWatermark|showWatermark|watermarkEnabled/);
  });

  it('mints its token from cryptographic randomness, never from Math.random', () => {
    expect(executable).toContain('getRandomValues');
    expect(executable).not.toContain('Math.random');
  });

  it('never writes a watermark into the document that is hashed', () => {
    // `stripped`, because the adapter's own prose explains *why* it has no
    // watermark — and prose about a rule must not be read as the rule.
    const scene = stripped(sources.get(join(FEATURE, 'model', 'review-scene.ts')) ?? '');
    expect(scene).not.toContain('watermark');
    expect(scene).not.toContain('Watermark');
  });
});

describe('APP6-S02 — the approval is built from the captured intent', () => {
  /*
   * This rule is asserted statically because it *cannot* be asserted
   * behaviourally, and the reason is worth writing down.
   *
   * Substituting the live payload for the captured intent at submit time is
   * invisible to every test that drives the screen, because the two can never
   * differ when an approval is actually submitted: the only thing that replaces
   * the payload is the single re-read, and every re-read whose answer differs
   * destroys the intent before the confirmation can be reached again. The
   * exactness is enforced twice over.
   *
   * That redundancy is a good property and a bad test: it means the second
   * mechanism could be deleted with every suite still green. So the seam is
   * pinned here — the mutation reads the intent, and the live payload is not in
   * scope for it at all.
   */
  it('reads the intent, and never the live payload, when submitting', () => {
    const controller = stripped(
      sources.get(join(FEATURE, 'hooks', 'use-secure-design-review.ts')) ?? '',
    );
    const start = controller.indexOf('const approve = useMutation(');
    const mutationFn = controller.slice(start, controller.indexOf('onSuccess', start));

    expect(start).toBeGreaterThan(-1);
    expect(mutationFn).toContain('intent.versionId');
    expect(mutationFn).toContain('intent.documentHash');
    expect(mutationFn).toContain('intent.acceptedAgreements');
    expect(mutationFn).not.toContain('bootstrap.state');
    expect(mutationFn).not.toContain('designVersionId');
  });

  it('captures the intent from the review the customer is looking at, once', () => {
    const controller = stripped(
      sources.get(join(FEATURE, 'hooks', 'use-secure-design-review.ts')) ?? '',
    );
    // Exactly one place builds an ApprovalIntent, and it is the handler the
    // approve control calls. A second would be a second answer to "what is the
    // customer approving".
    expect(controller.match(/agreementSignature:/g)).toHaveLength(1);
  });
});

describe('APP6-S02 — no browser authority over server facts', () => {
  it('computes no hash of any kind', () => {
    for (const forbidden of ['crypto.subtle', 'digest(', 'sha256(', 'createHash']) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('hard-codes no agreement type', () => {
    for (const forbidden of [
      'PAYMENT_POLICY',
      'RETURN_POLICY',
      'DESIGN_APPROVAL_TERMS',
      'REQUIRED_AGREEMENTS',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('renders no untrusted value as markup', () => {
    for (const forbidden of [
      'dangerouslySetInnerHTML',
      'innerHTML',
      'foreignObject',
      'createElement(',
      'insertAdjacentHTML',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('names no field the customer contract deliberately withholds', () => {
    for (const forbidden of [
      'customerId',
      'customRequestId',
      'designCaseId',
      'grantId',
      'challengeId',
      'submittedSessionId',
      'correlationId',
      'outboxId',
      'idempotencyKey',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
  });

  it('never navigates away from the secure session for a step-up', () => {
    // §7: leaving this route unmounts the session and destroys the credential
    // that the customer's decision still needs.
    expect(executable).not.toContain('/xac-minh-lien-he');
    expect(executable).not.toMatch(/useRouter|redirect\(|router\.push/);
  });
});

describe('APP6-S02 — feature boundaries', () => {
  it('imports no Admin or worker surface', () => {
    expect(executable).not.toMatch(/apps[\\/]admin|@embroidery\/admin|@embroidery\/worker/);
  });

  it('imports no business component or model from the quotation feature', () => {
    expect(executable).not.toContain('secure-quotation');
  });

  it('imports no internals of the Studio feature', () => {
    expect(executable).not.toContain('design-studio');
  });

  it('reuses the security machinery rather than copying it', () => {
    expect(executable).toContain("from '../../secure-link-access'");
    expect(executable).toContain("from '../../contact-verification'");
    // One fragment parser, one strip, one credential lifetime in the app.
    expect(executable).not.toContain('location.hash');
    expect(executable).not.toContain('replaceState');
  });
});

describe('APP6-S02 — the transport', () => {
  it('calls the API only through the generated operations', () => {
    expect(executable).not.toMatch(/\bfetch\s*\(/);
    expect(executable).not.toMatch(/axios\.(get|post|put|patch|delete)/);
    // No hand-written path anywhere: a route rename must arrive as a
    // regenerated client, not as a 404 nobody notices.
    expect(executable).not.toContain('/api/public/design-reviews');
  });

  it('reaches the generated client through the curated barrel', () => {
    expect(allCode).not.toContain('@embroidery/api-client/src/generated');
    const client = sources.get(join(FEATURE, 'api', 'secure-design-review.client.ts')) ?? '';
    expect(client).toContain("from '@embroidery/api-client'");
  });

  it('performs exactly three operations, and no fourth', () => {
    const operations = [...executable.matchAll(/public[A-Z][A-Za-z]*/g)].map((match) => match[0]);
    expect(new Set(operations)).toEqual(
      new Set([
        'publicDesignReviewCurrent',
        'publicDesignReviewApprove',
        'publicDesignReviewRequestRevision',
      ]),
    );
  });

  it('builds every body through its generated type', () => {
    const client = sources.get(join(FEATURE, 'api', 'secure-design-review.client.ts')) ?? '';
    for (const bodyType of [
      'ReadCurrentDesignReviewBody',
      'ApproveDesignVersionBody',
      'RequestDesignRevisionBody',
    ]) {
      expect(client).toContain(bodyType);
    }
  });
});

describe('APP6-S02 — the route and the stylesheet', () => {
  const route = readFileSync(ROUTE, 'utf8');

  it('is a thin server component that mounts the capability', () => {
    expect(route).not.toContain("'use client'");
    expect(route).toContain('SecureLinkQueryProvider');
    expect(route).toContain('SecureDesignReviewScreen');
    expect(route.split('\n').length).toBeLessThanOrEqual(400);
  });

  it('is excluded from indexing', () => {
    expect(route).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it('is composed into the single global stylesheet', () => {
    const main = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'main.scss'), 'utf8');
    expect(main).toContain('secure-design-review/styles/secure-design-review');
  });

  it('binds colour and type to the shared foundation rather than to literals', () => {
    const scss = readFileSync(STYLESHEET, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(scss).toContain("@use '@embroidery/styles' as styles");
    // No raw hex anywhere: every colour is a token.
    expect(scss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('lets no wide content push the page sideways', () => {
    const scss = readFileSync(STYLESHEET, 'utf8');
    // The long opaque hashes are the one thing that could: they wrap.
    expect(scss).toContain('overflow-wrap: anywhere');
  });
});
