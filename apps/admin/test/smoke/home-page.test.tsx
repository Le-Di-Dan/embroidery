/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../../src/app/(protected)/page';

describe('admin protected home page', () => {
  it('renders the operator launchpad as server markup', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    // The shell (in the protected layout) owns the chrome; the page is thin and
    // renders only the launchpad. It is server markup on purpose: the screen
    // issues no request and holds no state, so there is nothing to hydrate.
    expect(markup).toContain('admin-home__destinations');
    expect(markup).toContain('href="/orders"');
    // No fake business data, and no counters: §19 forbids both.
    expect(markup).not.toMatch(/doanh thu|đơn hàng đang chờ|thống kê/i);
    // And not the sentence it replaced (`V01-UX-015`).
    expect(markup).not.toContain('sẽ xuất hiện trong các giai đoạn');
  });
});
