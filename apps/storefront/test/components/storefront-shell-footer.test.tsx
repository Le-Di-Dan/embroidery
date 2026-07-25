import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

function renderShell() {
  return renderWithProviders(
    <StorefrontShell>
      <h1>Trang mẫu</h1>
    </StorefrontShell>,
  );
}

describe('StorefrontShell — footer', () => {
  it('renders only approved brand copy, with the brand linking home', () => {
    renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Studio thêu thủ công theo yêu cầu.')).toBeInTheDocument();
    expect(
      within(footer).getByText('© Xưởng Thêu · Studio thêu theo yêu cầu.'),
    ).toBeInTheDocument();
    const brand = within(footer).getByRole('link', { name: 'Xưởng Thêu — về trang chủ' });
    expect(brand).toHaveAttribute('href', '/');
  });

  it('invents no contact, social, or policy data', () => {
    renderShell();
    const footer = screen.getByRole('contentinfo');
    // No fabricated contact channels or social/policy links.
    for (const anchor of footer.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href.startsWith('mailto:')).toBe(false);
      expect(href.startsWith('tel:')).toBe(false);
      expect(/facebook|instagram|tiktok|zalo|twitter|youtube/i.test(href)).toBe(false);
    }
    // The only footer link is the brand → home.
    expect(within(footer).getAllByRole('link')).toHaveLength(1);
  });

  it('exposes the composition marker used by the responsive footer layout', () => {
    const { container } = renderShell();
    expect(container.querySelector('.storefront-shell__footer-inner')).not.toBeNull();
  });
});
