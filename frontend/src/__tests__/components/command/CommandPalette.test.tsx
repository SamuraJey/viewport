import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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
  useAuthStore: () => ({ logout: vi.fn() }),
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
});
