import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import NotFound from '../../src/app/not-found';
import { StorefrontShell } from '../../src/features/storefront-shell';

/**
 * Mirrors the runtime composition: the root layout wraps every route — including
 * the not-found boundary — in the shared shell. The boundary content must render
 * inside the shell's existing `<main>` and produce exactly one of each landmark.
 */
function renderNotFoundInShell() {
  return renderWithProviders(
    <StorefrontShell>
      <NotFound />
    </StorefrontShell>,
  );
}

describe('not-found inside the shared shell — single landmarks', () => {
  it('produces exactly one header, main, h1 and footer', () => {
    renderNotFoundInShell();
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders the not-found content inside the single <main> slot', () => {
    renderNotFoundInShell();
    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('keeps the shell skip link targeting the not-found content region', () => {
    renderNotFoundInShell();
    const skip = screen.getByRole('link', { name: 'Bỏ qua tới nội dung chính' });
    expect(skip).toHaveAttribute('href', '#main-content');
  });

  it('keeps the mobile navigation trigger available and collapsed from the 404', () => {
    renderNotFoundInShell();
    const trigger = screen.getByRole('button', { name: 'Mở menu điều hướng' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
