/**
 * `/yeu-cau/da-gui` — the confirmation (`APP5-S02` §20).
 *
 * The route is an async Server Component, so it is awaited and its element
 * rendered: that proves the real segment, including the validation it performs
 * on `?ma=`, rather than the screen in isolation.
 *
 * The load-bearing assertion is negative and easy to lose: **no API call**. The
 * whole api-client module is mocked into throwing functions, so any network
 * reach from this page fails the test rather than quietly succeeding against a
 * mock that returns `undefined`.
 */
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import CustomRequestSubmittedPage, {
  metadata as submittedMetadata,
} from '../../src/app/yeu-cau/da-gui/page';
import { CUSTOM_REQUEST_CONFIRMATION_COPY as COPY } from '../../src/features/custom-request-confirmation/model/custom-request-confirmation-copy';
import { readRequestCode } from '../../src/features/custom-request-confirmation/model/request-code';

/**
 * Every generated operation, replaced by a function that fails loudly.
 *
 * A `jest.fn()` returning `undefined` would let a lookup slip through as a
 * render crash somewhere else; this makes the reason unambiguous. The proxy is
 * built *inside* the factory because `jest.mock` is hoisted above every `const`
 * in the module — referencing an outer binding here is a temporal-dead-zone
 * error at import time, not a test failure you can read.
 */
jest.mock(
  '@embroidery/api-client',
  () =>
    new Proxy(
      {},
      {
        get: (_target, property) => {
          if (property === '__esModule') return true;
          return () => {
            throw new Error(`the confirmation page called ${String(property)}`);
          };
        },
      },
    ),
);

const VALID_CODE = 'REQ-7KM2QD4XVA';

async function renderPage(ma?: string | string[]) {
  const element = await CustomRequestSubmittedPage({
    searchParams: Promise.resolve(ma === undefined ? {} : { ma }),
  });
  return renderWithProviders(element);
}

describe('APP5-S02 — the request code is display-only', () => {
  it('renders the confirmation with a valid code', async () => {
    const { container } = await renderPage(VALID_CODE);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(COPY.title);
    expect(screen.getByText(VALID_CODE)).toBeInTheDocument();
    expect(container.textContent).toContain(COPY.code.note.wide);
  });

  it('presents the code as text, never as a credential or a way in', async () => {
    const { container } = await renderPage(VALID_CODE);

    const code = screen.getByText(VALID_CODE);
    expect(code.tagName).toBe('P');
    expect(code.closest('a')).toBeNull();
    expect(code.closest('button')).toBeNull();
    // Nothing on this page navigates anywhere with the code, or anywhere at all.
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  /**
   * The mocked api-client throws on any call, so reaching the network at all
   * would fail this test rather than pass it silently. The absence of a lookup
   * is the requirement: no endpoint accepts a request code, by design.
   */
  it('performs no lookup for the code it displays', async () => {
    await expect(renderPage(VALID_CODE)).resolves.toBeDefined();

    expect(screen.getByText(VALID_CODE)).toBeInTheDocument();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unprefixed', '7KM2QD4XVA'],
    ['too short', 'REQ-7KM2QD4X'],
    ['using an excluded character', 'REQ-7KM2QD4XV0'],
    ['lower case', 'req-7km2qd4xva'],
    ['padded', ' REQ-7KM2QD4XVA '],
    ['arbitrary text', 'Yêu cầu của bạn đã được duyệt'],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['repeated', ['REQ-7KM2QD4XVA', 'REQ-AAAAAAAAAA']],
  ] as const)('falls back safely for a %s code', async (_label, ma) => {
    const { container } = await renderPage(ma as string | string[] | undefined);

    // Still a confirmation — the customer did submit — but it names no request.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(COPY.title);
    expect(screen.getByText(COPY.missingCode.note)).toBeInTheDocument();
    expect(container.textContent).not.toContain('REQ-');
    if (typeof ma === 'string' && ma.trim().length > 0) {
      expect(container.textContent).not.toContain(ma.trim());
    }
  });

  it('accepts only what the generator produces', () => {
    expect(readRequestCode(VALID_CODE)).toBe(VALID_CODE);
    for (const rejected of ['REQ-7KM2QD4XV1', 'REQ-7KM2QD4XVAO', 'REQ-', 'REQU-7KM2QD4XVA']) {
      expect(readRequestCode(rejected)).toBeUndefined();
    }
  });
});

describe('APP5-S02 — what the confirmation promises', () => {
  it('explains that the secure link, not the code, is how status is seen later', async () => {
    const { container } = await renderPage(VALID_CODE);

    expect(screen.getByText(COPY.secureLink.title)).toBeInTheDocument();
    expect(container.textContent).toContain(COPY.secureLink.body.wide);
    // The code note says outright that the code opens nothing.
    expect(container.textContent).toContain(COPY.code.note.wide);
  });

  it('promises no quotation, approval, payment or order', async () => {
    const { container } = await renderPage(VALID_CODE);

    expect(screen.getByText(COPY.nextSteps.note)).toBeInTheDocument();
    for (const point of COPY.notIncluded.points) {
      expect(screen.getByText(point)).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(
      /đã được duyệt|đã báo giá|tổng tiền|thanh toán ngay|mã đơn hàng/i,
    );
  });

  it('offers no account, no request list and no sign-in', async () => {
    const { container } = await renderPage(VALID_CODE);

    expect(container.textContent).not.toMatch(
      /danh sách yêu cầu|tài khoản|đăng nhập|đăng ký|hồ sơ của tôi|yêu cầu của tôi/i,
    );
  });

  it('is kept out of search results', () => {
    expect(submittedMetadata.robots).toEqual({ index: false, follow: false });
  });
});
