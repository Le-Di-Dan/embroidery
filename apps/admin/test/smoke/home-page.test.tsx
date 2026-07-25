/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../../src/app/(protected)/page';

describe('admin protected home page', () => {
  it('renders the thin authenticated placeholder as server markup', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    // The shell (in the protected layout) owns the chrome; the page is thin and
    // renders only the forward-looking placeholder — no fake business data.
    expect(markup).toContain('Quyền truy cập quản trị đã sẵn sàng');
    expect(markup).toContain('admin-shell__placeholder');
    expect(markup).not.toMatch(/doanh thu|đơn hàng đang chờ|thống kê/i);
  });
});
