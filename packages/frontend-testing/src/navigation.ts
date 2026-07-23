/**
 * Narrow, reusable `next/navigation` App Router mocks. Only the hooks the
 * component tests actually use are implemented; nothing globally fakes the
 * whole router. Each call produces fresh spies, so a test resets state simply
 * by creating a new mock (or via `jest.clearAllMocks()`).
 *
 * Usage (the `mock`-prefixed name lets the hoisted `jest.mock` factory close
 * over it safely):
 *
 * ```ts
 * const mockNav = createNavigationMock();
 * jest.mock('next/navigation', () => mockNav.module);
 * // ... later: expect(mockNav.router.back).toHaveBeenCalled();
 * ```
 */
export interface RouterMock {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
  forward: jest.Mock;
  refresh: jest.Mock;
  prefetch: jest.Mock;
}

export interface NavigationMockModule {
  useRouter: () => RouterMock;
  usePathname: () => string;
  useSearchParams: () => URLSearchParams;
}

export interface NavigationMock {
  /** The stable router instance every `useRouter()` call returns; assert on its spies. */
  router: RouterMock;
  /** Pass this as the `jest.mock('next/navigation', () => …)` factory return. */
  module: NavigationMockModule;
}

export function createNavigationMock(pathname = '/', searchParams = ''): NavigationMock {
  const router: RouterMock = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  };

  return {
    router,
    module: {
      useRouter: () => router,
      usePathname: () => pathname,
      useSearchParams: () => new URLSearchParams(searchParams),
    },
  };
}
