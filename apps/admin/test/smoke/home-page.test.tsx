/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../../src/app/(protected)/page';

describe('admin protected home page', () => {
  it('renders the bootstrap landing content as server markup', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    expect(markup).toContain('<main>');
    expect(markup).toContain('Embroidery Commerce Admin');
  });
});
