import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeferredLenis } from '../../components/DeferredLenis';

vi.mock('lenis/react', () => ({
  ReactLenis: ({ children, root }: { children: ReactNode; root?: boolean }) => (
    <div data-root={String(Boolean(root))} data-testid="lenis-wrapper">
      {children}
    </div>
  ),
}));

describe('DeferredLenis', () => {
  it('renders immediately with native scrolling, then upgrades to Lenis asynchronously', async () => {
    render(
      <DeferredLenis>
        <main>Page content</main>
      </DeferredLenis>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByTestId('lenis-wrapper')).not.toBeInTheDocument();

    expect(await screen.findByTestId('lenis-wrapper')).toHaveAttribute('data-root', 'true');
  });
});
