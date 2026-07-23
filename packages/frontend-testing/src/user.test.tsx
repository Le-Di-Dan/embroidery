import { useState } from 'react';

import { renderWithProviders } from './render';
import { createUser } from './user';
import { screen } from './index';

function Toggle(): React.ReactElement {
  const [on, setOn] = useState(false);
  return (
    <button type="button" onClick={() => setOn((v) => !v)}>
      {on ? 'on' : 'off'}
    </button>
  );
}

describe('createUser', () => {
  it('drives real user interaction against a rendered component', async () => {
    const user = createUser();
    renderWithProviders(<Toggle />);
    expect(screen.getByRole('button', { name: 'off' })).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'on' })).toBeInTheDocument();
  });
});
