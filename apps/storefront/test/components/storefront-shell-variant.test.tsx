/**
 * The two shells (`V01-UX-022`, `APP12-V02` §10).
 *
 * `V01-UX-022` measured the four-column store-presentation block as about a
 * third of the checkout and of the secure order surface — beneath the one
 * control the customer came to use, advertising a service the order is not for.
 *
 * What has to hold is both halves at once: the marketing block goes, and the
 * things §10 protects stay. A reduced shell that also dropped the policy links
 * or the support dock would pass "no marketing block" and be a worse defect
 * than the one it replaced.
 */
import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';
import {
  resolveShellVariant,
  readShellVariant,
} from '../../src/features/storefront-shell/model/shell-variant';
import type { StorefrontShellVariant } from '../../src/features/storefront-shell/model/shell-variant';

function renderShell(variant?: StorefrontShellVariant) {
  return renderWithProviders(
    <StorefrontShell {...(variant === undefined ? {} : { variant })}>
      <h1>Trang mẫu</h1>
    </StorefrontShell>,
  );
}

describe('which routes earn the reduced shell', () => {
  it.each([
    ['/mua-hang/ao-thun', 'transactional'],
    ['/mua-hang', 'transactional'],
    ['/truy-cap/don-hang', 'transactional'],
  ] as const)('%s is transactional', (pathname, expected) => {
    expect(resolveShellVariant(pathname)).toBe(expected);
  });

  it.each([
    '/',
    '/kham-pha',
    '/san-pham/ao-thun',
    // The secure-access landing serves both waves by scope and is a place a
    // visitor may still be finding their way, so it keeps the full shell.
    '/truy-cap',
    '/chinh-sach/thanh-toan',
    // A path that merely starts with the same characters is not a child.
    '/mua-hang-cu',
  ])('%s keeps the full shell', (pathname) => {
    expect(resolveShellVariant(pathname)).toBe('full');
  });

  it('defaults to the full shell when the header is absent or unrecognised', () => {
    // The header is set by the proxy. A request that somehow arrives without one
    // must render the composition every other route gets, never a reduced one.
    expect(readShellVariant(null)).toBe('full');
    expect(readShellVariant(undefined)).toBe('full');
    expect(readShellVariant('something-else')).toBe('full');
    expect(readShellVariant('transactional')).toBe('transactional');
  });
});

describe('the transactional shell', () => {
  it('drops the four-column store-presentation block', () => {
    const full = renderShell('full');
    expect(screen.getByRole('region', { name: 'Thông tin cửa hàng' })).toBeInTheDocument();
    full.unmount();

    renderShell('transactional');
    expect(screen.queryByRole('region', { name: 'Thông tin cửa hàng' })).toBeNull();
  });

  it('keeps the brand, the escape path and one contentinfo landmark', () => {
    const { container } = renderShell('transactional');

    // Exactly one footer landmark in either shape — a second would leave a
    // screen-reader user choosing between two things both called "footer".
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /về trang chủ/u }).length).toBeGreaterThan(0);
    expect(within(container).getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  });

  it('keeps every policy and the FAQ within reach of a customer who is paying', () => {
    // §10: "Do not remove security/support information needed for
    // checkout/payment." The set is complete rather than curated — someone
    // looking for the returns policy while paying should find it here.
    renderShell('transactional');
    const support = screen.getByRole('navigation', { name: 'Chính sách và hỗ trợ' });
    const targets = within(support)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(targets).toEqual([
      '/chinh-sach/giao-hang',
      '/chinh-sach/thanh-toan',
      '/chinh-sach/doi-tra',
      '/chinh-sach/bao-mat',
      '/cau-hoi-thuong-gap',
    ]);
  });
});
