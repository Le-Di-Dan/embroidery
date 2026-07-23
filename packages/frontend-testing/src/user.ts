import userEvent, { type UserEvent } from '@testing-library/user-event';

/**
 * Create a `user-event` session for realistic interaction simulation. One per
 * test keeps pointer/keyboard state isolated.
 */
export function createUser(): UserEvent {
  return userEvent.setup();
}
