import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';

describe('WorkspaceSidebar', () => {
  it('keeps Projects active on nested gallery routes and opens storage settings', () => {
    const onOpenSettings = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceSidebar
          user={{
            id: 'owner',
            display_name: 'Studio North',
            email: 'owner@example.com',
            storage_used: 524_288_000,
            storage_quota: 1_073_741_824,
          }}
          pathname="/projects/project-1/galleries/gallery-1"
          onOpenSettings={onOpenSettings}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Workspace navigation' });
    expect(within(nav).getByRole('link', { name: /Projects/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: /Share links/ })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByText('500 MB of 1 GB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Storage usage and account settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
