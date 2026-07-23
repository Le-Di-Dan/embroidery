import { createNavigationMock } from './navigation';

describe('createNavigationMock', () => {
  it('returns a stable router from every useRouter() call', () => {
    const nav = createNavigationMock();
    expect(nav.module.useRouter()).toBe(nav.router);
    expect(nav.module.useRouter()).toBe(nav.router);
  });

  it('exposes fresh, independent spies per mock', () => {
    const first = createNavigationMock();
    first.router.push('/x');
    expect(first.router.push).toHaveBeenCalledWith('/x');

    const second = createNavigationMock();
    expect(second.router.push).not.toHaveBeenCalled();
  });

  it('provides narrow pathname and search-params hooks', () => {
    const nav = createNavigationMock('/dashboard', 'tab=orders');
    expect(nav.module.usePathname()).toBe('/dashboard');
    expect(nav.module.useSearchParams().get('tab')).toBe('orders');
  });
});
