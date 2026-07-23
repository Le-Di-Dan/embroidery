/**
 * `@embroidery/frontend-testing` — shared React component-test support for the
 * locked Jest + next/jest + jsdom + React Testing Library stack (IMP-D024).
 *
 * Test-only infrastructure: it renders and mocks, it never performs real
 * network calls, holds no global mutable state, and exports no production
 * runtime. Kept separate from the backend-neutral `@embroidery/test-utils`.
 */
export { renderWithProviders } from './render';
export type { RenderWithProvidersOptions, RenderWithProvidersResult } from './render';
export { createTestQueryClient } from './query-client';
export { createUser } from './user';
export { createNavigationMock } from './navigation';
export type { NavigationMock, NavigationMockModule, RouterMock } from './navigation';

// Single re-exported query surface so app tests import DOM queries from one
// place. `renderWithProviders` above owns rendering; these own assertions.
export { screen, waitFor, within, fireEvent } from '@testing-library/react';
