import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CommandPalette } from '../../../components/command/CommandPalette';
import type {
  ProjectListResponse,
  ShareLinksDashboardResponse,
} from '../../../types';

vi.mock('../../../services/projectService', () => ({
  projectService: { getProjects: vi.fn() },
}));
vi.mock('../../../services/shareLinkService', () => ({
  shareLinkService: { getOwnerShareLinks: vi.fn() },
}));
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector?: (state: { logout: () => void }) => unknown) => {
    const state = { logout: vi.fn() };
    return selector ? selector(state) : state;
  },
}));
vi.mock('../../../stores/themeStore', () => ({
  useThemeStore: (selector?: (state: { toggleTheme: () => void }) => unknown) => {
    const state = { toggleTheme: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

import { projectService } from '../../../services/projectService';
import { shareLinkService } from '../../../services/shareLinkService';

const getProjects = vi.mocked(projectService.getProjects);
const getOwnerShareLinks = vi.mocked(shareLinkService.getOwnerShareLinks);

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the command palette with sections and dynamic data', async () => {
    getProjects.mockResolvedValue({
      projects: [{ id: 'p1', name: 'Anna & Max' }],
      total: 1,
      page: 1,
      size: 10,
    } as ProjectListResponse);

    getOwnerShareLinks.mockResolvedValue({
      share_links: [
        {
          id: 's1',
          label: 'Client preview',
          project_name: 'Porto',
          scope_type: 'project',
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    } as ShareLinksDashboardResponse);

    const onOpenChange = vi.fn();
    const onOpenShortcuts = vi.fn();

    render(
      <MemoryRouter>
        <CommandPalette
          open={true}
          onOpenChange={onOpenChange}
          onOpenShortcuts={onOpenShortcuts}
        />
      </MemoryRouter>,
    );

    // Search input is visible
    expect(
      screen.getByPlaceholderText(/type a command or search/i),
    ).toBeInTheDocument();

    // Navigation group heading and items
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /go to dashboard/i }),
    ).toBeInTheDocument();

    // Dynamic data — projects
    await waitFor(() => {
      expect(screen.getByText('Recent projects')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Anna & Max')).toBeInTheDocument();
    });

    // Dynamic data — share links
    await waitFor(() => {
      expect(screen.getByText('Active share links')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Client preview')).toBeInTheDocument();
    });

    // Filtering: typing 'dash' keeps 'Go to dashboard', hides 'Go to share links'
    const input = screen.getByPlaceholderText(/type a command or search/i);
    fireEvent.change(input, { target: { value: 'dash' } });

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /go to dashboard/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', { name: /go to share links/i }),
    ).not.toBeInTheDocument();

    // Clicking 'Go to dashboard' closes the palette
    fireEvent.click(screen.getByRole('option', { name: /go to dashboard/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces a role=alert error message when both sources fail', async () => {
    getProjects.mockRejectedValue(new Error('projects down'));
    getOwnerShareLinks.mockRejectedValue(new Error('sharelinks down'));

    render(
      <MemoryRouter>
        <CommandPalette open={true} onOpenChange={vi.fn()} onOpenShortcuts={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toBe('Failed to load commands');
    // Static navigation commands still render alongside the error.
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('gives recent items a distinct cmdk value from their source-group copy', async () => {
    // Seed history so the Recent section renders a static command that also
    // appears in its source group (Go to dashboard → Navigation).
    window.localStorage.setItem('viewport-cmd-history', JSON.stringify(['go-dashboard']));

    getProjects.mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      size: 5,
    } as ProjectListResponse);
    getOwnerShareLinks.mockResolvedValue({
      share_links: [],
      total: 0,
      page: 1,
      size: 20,
    } as ShareLinksDashboardResponse);

    render(
      <MemoryRouter>
        <CommandPalette open={true} onOpenChange={vi.fn()} onOpenShortcuts={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeInTheDocument();
    });

    // Two options named "Go to dashboard" should render (Recent + Navigation),
    // but their cmdk data-value attributes must differ so cmdk does not collide.
    const dashboardOptions = screen.getAllByRole('option', { name: /go to dashboard/i });
    expect(dashboardOptions).toHaveLength(2);
    const values = dashboardOptions.map((el) => el.getAttribute('data-value'));
    expect(values).toContain('go-dashboard');
    expect(values).toContain('recent:go-dashboard');
    expect(new Set(values).size).toBe(2);

    window.localStorage.removeItem('viewport-cmd-history');
  });
});
