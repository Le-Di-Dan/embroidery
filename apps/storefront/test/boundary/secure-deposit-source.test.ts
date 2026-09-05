/**
 * @jest-environment node
 *
 * Static boundary checks on the `/truy-cap/thanh-toan` production source
 * (`APP7-S01` §5, §8, §11, §13, §16, §20, §21, §28, §33, §34, §35, §40).
 *
 * These guard rules no rendering test can reach. A component test can only show
 * that the paths it drove behaved correctly; these say that the *only* way to
 * behave incorrectly has been removed from the source — no numeric coercion
 * exists to misprice a deposit, no storage address exists to persist a
 * credential or a QR, no delete operation exists to break the append-only rule,
 * no provider vocabulary exists to render a gateway, and no route string exists
 * to navigate out of the secure session mid-payment.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SECURE_DEPOSIT_COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';

const FEATURE = join(__dirname, '..', '..', 'src', 'features', 'secure-deposit-payment');
const ROUTE = join(__dirname, '..', '..', 'src', 'app', 'truy-cap', 'thanh-toan', 'page.tsx');

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collect(path) : [path];
  });
}

const files = collect(FEATURE);
const code = files.filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'));
const styles = files.filter((path) => path.endsWith('.scss'));
const sources = new Map(code.map((path) => [path, readFileSync(path, 'utf8')]));

/** Source with comments removed, so prose about a rule is not read as the rule. */
function stripped(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const executable = [...sources.values()].map(stripped).join('\n');

/** Money is decided in exactly one file; everything else must not touch it. */
const MONEY_EXEMPT = new Set(['display-format.ts']);

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

describe('APP7-S01 — the feature layout', () => {
  it('places every production file under a responsibility folder', () => {
    const misplaced = files
      .map((path) => path.slice(FEATURE.length + 1).replace(/\\/g, '/'))
      .filter((relative) => relative !== 'index.ts' && !relative.includes('/'));
    expect(misplaced).toEqual([]);
  });

  it('keeps every source file inside the 400-line limit', () => {
    const oversized = [...sources]
      .map(([path, text]) => ({ path: basename(path), lines: text.split('\n').length }))
      .filter((file) => file.lines > 400);
    expect(oversized).toEqual([]);
  });

  it('keeps every stylesheet inside the same limit, split before it is reached', () => {
    // `APP7-A01-C1` had to split an oversized Admin stylesheet after the fact.
    // §40 makes the cap apply to SCSS, so it is asserted here rather than
    // discovered in review.
    const oversized = styles
      .map((path) => ({
        path: basename(path),
        lines: readFileSync(path, 'utf8').split('\n').length,
      }))
      .filter((file) => file.lines > 400);
    expect(oversized).toEqual([]);
    expect(styles.length).toBeGreaterThan(1);
  });

  it('exports only the screen', () => {
    const barrel = readFileSync(join(FEATURE, 'index.ts'), 'utf8');
    expect(barrel.match(/^export /gm)).toHaveLength(1);
    expect(barrel).toContain('SecureDepositScreen');
  });

  it('declares exactly one React component per file', () => {
    for (const [path, text] of sources) {
      if (!path.endsWith('.tsx')) continue;
      const components = stripped(text).match(/^export function [A-Z]/gm) ?? [];
      expect({ path: basename(path), components: components.length }).toEqual({
        path: basename(path),
        components: 1,
      });
    }
  });
});

describe('APP7-S01 — the deposit is never computed', () => {
  it('contains no numeric coercion outside the one file about bytes and dates', () => {
    for (const [path, text] of sources) {
      if (MONEY_EXEMPT.has(basename(path))) continue;
      const body = stripped(text);
      for (const pattern of [
        /\bNumber\s*\(/,
        /\bparseFloat\s*\(/,
        /\bparseInt\s*\(/,
        /\btoFixed\s*\(/,
      ]) {
        expect({ path: basename(path), matched: pattern.test(body) }).toEqual({
          path: basename(path),
          matched: false,
        });
      }
    }
  });

  it('names no deposit share, percentage or order total anywhere', () => {
    // `APP6-G01` fixed the split when the quotation was priced and `APP7-B03`
    // reads the obligation's frozen figure. A `0.4`, a `40` or a `totalAmount`
    // in this feature could only be a recomputation.
    expect(executable).not.toMatch(/\b0\.4\b/);
    expect(executable).not.toMatch(/depositPercent/);
    expect(executable).not.toMatch(/totalAmount|orderTotal/);
  });

  it('applies no arithmetic operator to an amount', () => {
    for (const [path, text] of sources) {
      if (MONEY_EXEMPT.has(basename(path))) continue;
      expect({
        path: basename(path),
        matched: /\bamount[A-Za-z]*\s*[*/+-]/.test(stripped(text)),
      }).toEqual({
        path: basename(path),
        matched: false,
      });
    }
  });
});

describe('APP7-S01 — the credential and the QR are never persisted', () => {
  it('addresses no browser storage of any kind', () => {
    for (const pattern of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/]) {
      expect(executable).not.toMatch(pattern);
    }
  });

  it('puts no token in a query key and no key builder in a component', () => {
    const keys = readFileSync(join(FEATURE, 'model', 'deposit-query-keys.ts'), 'utf8');
    expect(stripped(keys)).not.toMatch(/token|secret|accessToken/);
    // Every key comes from that one module: a literal array key elsewhere would
    // be a second naming authority that could serialize a credential.
    expect(executable).not.toMatch(/queryKey:\s*\[/);
  });

  it('never returns the secret out of the hook that holds it', () => {
    // `runWithSecret` hands it to a request function on the stack. An
    // assignment of its parameter to anything would end that.
    expect(executable).not.toMatch(/=\s*runWithSecret\s*\(\s*\(\s*secret\s*\)\s*=>\s*secret/);
    expect(executable).not.toMatch(/console\.(log|warn|error|info)/);
  });

  it('builds no URL for the QR other than from the fetched blob', () => {
    expect(executable).not.toMatch(/https?:\/\//);
    expect(executable).not.toMatch(/\bfetch\s*\(/);
    // One creation site, one revocation site.
    expect(executable.match(/createObjectURL/g)).toHaveLength(2);
    expect(executable.match(/revokeObjectURL/g)).toHaveLength(1);
  });
});

describe('APP7-S01 — the evidence rules are structural', () => {
  it('reaches no delete, replace or binary-read operation, because none exists', () => {
    for (const pattern of [
      /EvidenceDelete/,
      /EvidenceReplace/,
      /evidenceContent/,
      /previewEligible/,
      /adminPaymentEvidenceGet/,
    ]) {
      expect(executable).not.toMatch(pattern);
    }
    expect(executable).not.toMatch(/method:\s*'DELETE'/);
  });

  it('uses only the five delivered customer operations', () => {
    const client = stripped(readFileSync(join(FEATURE, 'api', 'secure-deposit.client.ts'), 'utf8'));
    const operations = client.match(/publicOrderDeposit[A-Za-z]*/g) ?? [];
    expect([...new Set(operations)].sort()).toEqual([
      'publicOrderDepositCurrent',
      'publicOrderDepositEvidenceStatus',
      'publicOrderDepositEvidenceUpload',
      'publicOrderDepositInitiate',
      'publicOrderDepositQr',
    ]);
    // No axios instance is built here, and no URL string exists to build one to.
    expect(client).not.toMatch(/axios|\/api\//);
  });

  it('states the contract limits once each', () => {
    const model = stripped(readFileSync(join(FEATURE, 'model', 'transfer-evidence.ts'), 'utf8'));
    expect(model).toContain('MAX_EVIDENCE_PER_ATTEMPT = 5');
    expect(model).toContain('10 * 1024 * 1024');
    expect(model).toMatch(/'image\/jpeg', 'image\/png', 'image\/webp'/);
    for (const rejected of ['image/gif', 'image/svg', 'image/heic', 'application/pdf']) {
      expect(executable).not.toContain(rejected);
    }
  });
});

describe('APP7-S01 — the three vocabularies never collapse', () => {
  it('holds no boolean that could stand for "paid"', () => {
    for (const pattern of [/\bisPaid\b/, /\bhasPaid\b/, /\bpaymentComplete\b/, /\bpaid\s*=/]) {
      expect(executable).not.toMatch(pattern);
    }
  });

  it('decides the confirmation from the two server fields and nothing else', () => {
    const state = stripped(
      readFileSync(join(FEATURE, 'model', 'deposit-payment-state.ts'), 'utf8'),
    );
    const confirmed = state.slice(state.indexOf('export function depositConfirmed'));
    const body = confirmed.slice(0, confirmed.indexOf('\n}'));
    expect(body).toContain('depositStatus');
    expect(body).toContain('orderStatus');
    expect(body).not.toContain('attempt');
    expect(body).not.toContain('evidence');
  });

  it('never lets an image status reach a payment decision', () => {
    const state = readFileSync(join(FEATURE, 'model', 'deposit-payment-state.ts'), 'utf8');
    expect(stripped(state)).not.toContain('assetStatus');
  });
});

describe('APP7-S01 — nothing outside the checkpoint is rendered or reachable', () => {
  it('names no payment provider, wallet, gateway or webhook', () => {
    for (const pattern of [
      /visa/i,
      /mastercard/i,
      /momo/i,
      /vnpay/i,
      /webhook/i,
      /gateway/i,
      /checkout/i,
    ]) {
      expect(executable).not.toMatch(pattern);
    }
  });

  it('claims no APP8 or APP9 progress in any approved sentence', () => {
    const copy = readFileSync(join(FEATURE, 'model', 'secure-deposit-copy.ts'), 'utf8');
    const sentences = stripped(copy).toLowerCase();
    for (const forbidden of [
      'đang sản xuất',
      'giữ tồn kho',
      'bắt đầu thêu',
      'sẵn sàng giao hàng',
      'giao hàng',
      'hoàn tiền',
      'thanh toán còn lại',
    ]) {
      expect(sentences).not.toContain(forbidden);
    }
  });

  it('mentions "tôi đã chuyển khoản" only to say the button does not exist', () => {
    // Read from the canonical Vietnamese message repository rather than from
    // the catalog's source. `APP12-V02` §5A moved every sentence into
    // `packages/i18n/messages/vi/custom.json`; the catalog now holds keys, so
    // scanning it for this phrase would find nothing and the test would pass
    // for the wrong reason. The claim itself is unchanged — and it is now made
    // against the text that actually ships.
    const sentences = JSON.stringify(SECURE_DEPOSIT_COPY).toLowerCase();
    const mentions = (sentences.match(/tôi đã chuyển khoản/g) ?? []).length;
    // Exactly one, and it is the approved sentence explaining why there is no
    // such control — `745:391`. A second would almost certainly be a label.
    expect(mentions).toBe(1);
    expect(JSON.stringify(SECURE_DEPOSIT_COPY)).toContain(
      'Trang này không có nút “Tôi đã chuyển khoản”',
    );
  });

  it('never navigates out of the secure session', () => {
    // A router push or a link to the verification route would unmount the only
    // copy of the credential, mid-payment.
    expect(executable).not.toMatch(/useRouter|router\.(push|replace)|next\/link/);
    expect(executable).not.toMatch(/xac-minh-lien-he/);
  });

  it('mounts the route through the delivered secure-link provider only', () => {
    const route = readFileSync(ROUTE, 'utf8');
    expect(route).toContain('SecureLinkQueryProvider');
    expect(route).toContain('SecureDepositScreen');
    expect(route).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    expect(stripped(route)).not.toMatch(/QueryClient\(/);
  });
});
