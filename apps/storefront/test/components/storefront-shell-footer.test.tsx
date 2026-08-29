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
    // APP10-I01 supersedes this assertion's original "no contact channel ever"
    // reading (FIG-APPROVAL-APP10-D01-PO-001): the footer may now carry the two
    // Zalo/Messenger CTAs an operator CONFIGURES. What it still may not do is
    // invent a value, so the rule is narrowed rather than dropped — with no
    // channel configured, nothing appears. The configured cases are proved in
    // `storefront-contact-handoff.test.tsx`.
    delete process.env.NEXT_PUBLIC_ZALO_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL;
    renderShell();
    const footer = screen.getByRole('contentinfo');
    // No fabricated contact channels or social/policy links.
    for (const anchor of footer.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href.startsWith('mailto:')).toBe(false);
      expect(href.startsWith('tel:')).toBe(false);
      expect(/facebook|instagram|tiktok|zalo|twitter|youtube/i.test(href)).toBe(false);
    }
    // Unconfigured, the only footer link is still the brand → home.
    expect(within(footer).getAllByRole('link')).toHaveLength(1);
  });

  it('exposes the composition marker used by the responsive footer layout', () => {
    const { container } = renderShell();
    expect(container.querySelector('.storefront-shell__footer-inner')).not.toBeNull();
  });
});
