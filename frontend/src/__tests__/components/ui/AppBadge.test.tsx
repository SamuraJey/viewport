// No snapshot tests — the codebase convention is explicit assertions.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppBadge } from '../../../components/ui';

const ALL_TONES = ['success', 'warning', 'info', 'danger', 'accent', 'neutral'] as const;

/* ------------------------------------------------------------------ */
/*  Filled-variant expected classes (used for tone-background tests)    */
/* ------------------------------------------------------------------ */

const filledBg: Record<string, string> = {
  success: 'bg-success/90',
  warning: 'bg-warning/90',
  info: 'bg-info/90',
  danger: 'bg-danger/90',
  accent: 'bg-accent/90',
  neutral: 'bg-neutral-500/90',
};

const subtleBg: Record<string, string> = {
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  info: 'bg-info/10',
  danger: 'bg-danger/10',
  accent: 'bg-accent/10',
  neutral: 'bg-neutral-100',
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AppBadge', () => {
  /* 1. children */
  it('renders children text content', () => {
    render(<AppBadge tone="info">Active</AppBadge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  /* 2. icon order */
  it('renders the icon before children when provided', () => {
    render(
      <AppBadge tone="success" icon={<span data-testid="icon">🔔</span>}>
        Published
      </AppBadge>,
    );
    const badge = screen.getByText('Published');
    const icon = screen.getByTestId('icon');
    expect(badge.firstElementChild).toContainElement(icon);
    expect(badge.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  /* 3. tone backgrounds — filled */
  it.each(ALL_TONES.map((t) => [t, filledBg[t]]))(
    'applies correct filled background for %s tone',
    (tone, expectedClass) => {
      render(<AppBadge tone={tone as (typeof ALL_TONES)[number]}>Cover</AppBadge>);
      expect(screen.getByText('Cover')).toHaveClass(expectedClass as string);
    },
  );

  /* 3. tone backgrounds — subtle */
  it.each(ALL_TONES.map((t) => [t, subtleBg[t]]))(
    'applies correct subtle background for %s tone',
    (tone, expectedClass) => {
      render(
        <AppBadge tone={tone as (typeof ALL_TONES)[number]} variant="subtle">
          Cover
        </AppBadge>,
      );
      expect(screen.getByText('Cover')).toHaveClass(expectedClass as string);
    },
  );

  /* 4. default variant */
  it('defaults to variant="filled" when not specified', () => {
    render(<AppBadge tone="danger">Alert</AppBadge>);
    const badge = screen.getByText('Alert');
    // Filled base marker
    expect(badge).toHaveClass('backdrop-blur-md');
    // Subtle marker should be absent
    expect(badge).not.toHaveClass('border');
  });

  /* 5. default size */
  it('defaults to size="sm" when not specified', () => {
    render(<AppBadge tone="accent">Label</AppBadge>);
    const badge = screen.getByText('Label');
    expect(badge).toHaveClass('text-xs');
    // xs marker should be absent
    expect(badge).not.toHaveClass('text-[10px]');
  });

  /* 6. xs size */
  it('applies xs size classes when size="xs"', () => {
    render(
      <AppBadge tone="neutral" size="xs">
        Tiny
      </AppBadge>,
    );
    const badge = screen.getByText('Tiny');
    expect(badge).toHaveClass('text-[10px]');
    expect(badge).toHaveClass('uppercase');
  });

  /* 7. className passthrough */
  it('appends className to the rendered element', () => {
    render(
      <AppBadge tone="warning" className="ml-2 my-custom-tag">
        Extra
      </AppBadge>,
    );
    const badge = screen.getByText('Extra');
    expect(badge).toHaveClass('ml-2');
    expect(badge).toHaveClass('my-custom-tag');
  });

  /* 8. aria-label passthrough */
  it('forwards aria-label to the badge', () => {
    render(
      <AppBadge tone="warning" aria-label="Upload failed">
        Failed
      </AppBadge>,
    );
    expect(screen.getByLabelText('Upload failed')).toHaveTextContent('Failed');
    expect(screen.getByRole('img', { name: 'Upload failed' })).toBeInTheDocument();
  });

  /* 9. span element */
  it('renders as a <span> element', () => {
    render(<AppBadge tone="info">Span</AppBadge>);
    const badge = screen.getByText('Span');
    expect(badge.tagName).toBe('SPAN');
  });
});
