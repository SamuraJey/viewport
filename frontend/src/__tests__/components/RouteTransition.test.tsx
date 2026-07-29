import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { RouteTransition } from '../../components/RouteTransition';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => motionPreference.reduced,
  motion: {
    div: ({
      initial,
      animate,
      transition,
      children,
      ...props
    }: {
      initial: false | { opacity: number };
      animate: { opacity: number };
      transition: { duration: number; ease: number[] };
      children: ReactNode;
      [key: string]: unknown;
    }) => (
      <div
        {...props}
        data-motion-initial={JSON.stringify(initial)}
        data-motion-animate={JSON.stringify(animate)}
        data-motion-duration={String(transition.duration)}
      >
        {children}
      </div>
    ),
  },
}));

const NavigationControls = () => {
  const navigate = useNavigate();

  return (
    <nav>
      <button type="button" onClick={() => navigate('/one?page=2')}>
        Change search
      </button>
      <button type="button" onClick={() => navigate('/two')}>
        Open two
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Forward
      </button>
    </nav>
  );
};

const renderTransition = () =>
  render(
    <MemoryRouter initialEntries={['/one']}>
      <NavigationControls />
      <Routes>
        <Route element={<RouteTransition />}>
          <Route path="/one" element={<h1>One</h1>} />
          <Route path="/two" element={<h1>Two</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('RouteTransition', () => {
  it('remounts only for pathname changes and preserves navigation focus', async () => {
    motionPreference.reduced = false;
    const user = userEvent.setup();
    const { container } = renderTransition();
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const initialTransition = container.querySelector('[data-route-transition-path]');
    expect(initialTransition).toHaveAttribute('data-route-transition-path', '/one');
    expect(initialTransition).toHaveAttribute('data-motion-duration', '0.18');

    await user.click(screen.getByRole('button', { name: 'Change search' }));
    await waitFor(() => {
      expect(container.querySelector('[data-route-transition-path]')).toBe(initialTransition);
    });

    const openTwoButton = screen.getByRole('button', { name: 'Open two' });
    await user.click(openTwoButton);
    await screen.findByRole('heading', { name: 'Two' });
    const secondTransition = container.querySelector('[data-route-transition-path]');
    expect(secondTransition).not.toBe(initialTransition);
    expect(secondTransition).toHaveAttribute('data-route-transition-path', '/two');
    expect(openTwoButton).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'One' });
    expect(container.querySelector('[data-route-transition-path]')).not.toBe(secondTransition);

    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await screen.findByRole('heading', { name: 'Two' });
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('disables the transition when reduced motion is requested', () => {
    motionPreference.reduced = true;
    const { container } = renderTransition();

    const transition = container.querySelector('[data-route-transition-path]');
    expect(transition).toHaveAttribute('data-motion-initial', 'false');
    expect(transition).toHaveAttribute('data-motion-duration', '0');
    expect(transition).toHaveAttribute('data-motion-animate', '{"opacity":1}');
  });
});
