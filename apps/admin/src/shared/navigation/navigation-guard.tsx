'use client';

/**
 * In-app navigation guard.
 *
 * The App Router has no route-change blocker, so a screen that holds unsaved
 * work cannot stop a shell link on its own — the link lives outside its subtree.
 * This is the seam between the two: a screen registers how a departure should be
 * handled, and navigation controls elsewhere in the Admin route their departure
 * through `useNavigationGuard` instead of navigating directly.
 *
 * It is deliberately not a router: it holds no destination and performs no
 * navigation. The caller keeps its own `proceed`, which runs unchanged when
 * nothing is registered or when the registered screen allows it.
 *
 * At most one interceptor is active at a time. Admin renders one screen per
 * route, so a second registration means the first screen is being replaced.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

/**
 * Handles a departure. An implementation either runs `proceed` immediately or
 * holds it while it asks the operator, and may discard it if they stay.
 */
export type NavigationInterceptor = (proceed: () => void) => void;

interface NavigationGuardContextValue {
  /** Registers the active interceptor; returns its unregister function. */
  readonly register: (interceptor: NavigationInterceptor) => () => void;
  /** Routes a departure through the active interceptor, if any. */
  readonly requestNavigation: NavigationInterceptor;
}

const runImmediately: NavigationInterceptor = (proceed) => {
  proceed();
};

/**
 * The default value keeps every consumer working outside a provider: nothing is
 * registered, so navigation is never blocked.
 */
const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  register: () => () => undefined,
  requestNavigation: runImmediately,
});

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const active = useRef<NavigationInterceptor | null>(null);

  const value = useMemo<NavigationGuardContextValue>(
    () => ({
      register: (interceptor) => {
        active.current = interceptor;
        return () => {
          // Only clear our own registration: a replacing screen may already have
          // registered before this cleanup runs.
          if (active.current === interceptor) {
            active.current = null;
          }
        };
      },
      requestNavigation: (proceed) => {
        (active.current ?? runImmediately)(proceed);
      },
    }),
    [],
  );

  return (
    <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>
  );
}

/** For navigation controls: run a departure through whatever screen is mounted. */
export function useNavigationGuard(): NavigationInterceptor {
  return useContext(NavigationGuardContext).requestNavigation;
}

/**
 * For screens: intercept in-app departures while mounted.
 *
 * The interceptor is read through a ref, so a screen whose handler changes on
 * every keystroke (dirty state does) does not re-register on every render.
 */
export function useRegisterNavigationInterceptor(interceptor: NavigationInterceptor): void {
  const { register } = useContext(NavigationGuardContext);
  const latest = useRef(interceptor);
  latest.current = interceptor;

  useEffect(() => register((proceed) => latest.current(proceed)), [register]);
}
