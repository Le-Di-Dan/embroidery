/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from '../../src/app/page';

describe('storefront home page', () => {
  it('renders the bootstrap landing content as server markup', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    expect(markup).toContain('<main>');
    expect(markup).toContain('Embroidery Commerce Storefront');
  });
});
