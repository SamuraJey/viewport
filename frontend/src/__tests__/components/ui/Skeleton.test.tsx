import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../../../components/ui';

describe('Skeleton', () => {
  it('is a deterministic visual-only block with a static reduced-motion fallback', () => {
    render(<Skeleton data-testid="skeleton" className="h-8 w-24 rounded-lg" />);

    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveClass(
      'animate-pulse',
      'motion-reduce:animate-none',
      'bg-surface-2',
      'dark:bg-surface-dark-2',
      'h-8',
      'w-24',
      'rounded-lg',
    );
    expect(skeleton).not.toHaveAttribute('role');
    expect(skeleton).not.toHaveAttribute('aria-live');
  });
});
