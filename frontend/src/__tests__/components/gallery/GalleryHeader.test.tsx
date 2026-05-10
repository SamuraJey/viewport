import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode, type RefObject } from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

type MockPopoverCloseTarget = HTMLElement | RefObject<HTMLElement | null>;
type MockPopoverClose = (focusableElement?: MockPopoverCloseTarget) => void;
type MockPopoverPanel = ReactNode | ((close: MockPopoverClose) => ReactNode);

vi.mock('../../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/ui')>();

  return {
    ...actual,
    AppPopover: ({
      className,
      buttonClassName,
      buttonAriaLabel,
      buttonContent,
      buttonRef,
      panelClassName,
      panel,
      panelFocus = false,
    }: {
      className?: string;
      buttonClassName?: string | ((open: boolean) => string);
      buttonAriaLabel?: string;
      buttonContent: ReactNode | ((open: boolean) => ReactNode);
      buttonRef?: RefObject<HTMLButtonElement | null>;
      panelClassName?: string;
      panel: MockPopoverPanel;
      panelFocus?: boolean;
    }) => {
      const [open, setOpen] = useState(false);
      const close: MockPopoverClose = (focusableElement) => {
        setOpen(false);
        const element =
          focusableElement && 'current' in focusableElement
            ? focusableElement.current
            : focusableElement;
        element?.focus();
      };

      return (
        <div className={className}>
          <button
            type="button"
            ref={buttonRef}
            aria-expanded={open}
            aria-label={buttonAriaLabel}
            className={
              typeof buttonClassName === 'function' ? buttonClassName(open) : buttonClassName
            }
            onClick={() => setOpen((previousOpen) => !previousOpen)}
          >
            {typeof buttonContent === 'function' ? buttonContent(open) : buttonContent}
          </button>

          {open ? (
            <div className={panelClassName} tabIndex={panelFocus ? -1 : undefined}>
              {typeof panel === 'function' ? panel(close) : panel}
            </div>
          ) : null}
        </div>
      );
    },
  };
});

import { GalleryHeader } from '../../../components/gallery/GalleryHeader';

const gallery = {
  id: 'gallery-1',
  name: 'Portfolio Session',
  created_at: '2024-01-01T10:00:00Z',
  total_size_bytes: 37035,
} as any;

const createProps = () => ({
  gallery,
  visiblePhotoCount: 3,
  totalPhotoCount: 5,
  isLoadingPhotos: false,
  shootingDateInput: '2024-01-01',
  onShootingDateChange: vi.fn(),
  isSavingShootingDate: false,
  publicSortBy: 'original_filename' as const,
  publicSortOrder: 'asc' as const,
  onPublicSortChange: vi.fn(),
  isSavingPublicSortSettings: false,
  searchValue: '',
  sortBy: 'uploaded_at' as const,
  sortOrder: 'desc' as const,
  onDeleteGallery: vi.fn(),
  onSearchChange: vi.fn(),
  onSortChange: vi.fn(),
});

describe('GalleryHeader', () => {
  it('opens the public sort popover from the button', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GalleryHeader {...createProps()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /public sort/i }));

    expect(screen.getByLabelText(/public gallery sort/i)).toBeInTheDocument();
  });

  it('opens the public sort popover from the global event without toggling it closed', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(
      <MemoryRouter>
        <GalleryHeader {...createProps()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'gallery:open-public-sort',
        expect.any(Function),
      );
    });
    addEventListenerSpy.mockRestore();

    await act(async () => {
      window.dispatchEvent(new Event('gallery:open-public-sort'));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/public gallery sort/i)).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new Event('gallery:open-public-sort'));
    });

    expect(screen.getByLabelText(/public gallery sort/i)).toBeInTheDocument();
  });

  it('keeps project settings and gallery navigation in the overflow menu', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GalleryHeader
          {...createProps()}
          settingsHref="/projects/project-1"
          projectNavigation={
            <div>
              <Link to="/projects/project-1/galleries/gallery-1">Portfolio Session</Link>
              <Link to="/projects/project-1/galleries/gallery-2">Second Gallery</Link>
            </div>
          }
        />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: /more gallery actions/i });
    await user.click(trigger);

    expect(await screen.findByRole('link', { name: /project settings/i })).toHaveAttribute(
      'href',
      '/projects/project-1',
    );
    expect(screen.getByRole('link', { name: 'Portfolio Session' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Second Gallery' })).toBeInTheDocument();
  });

  it('closes the overflow menu with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GalleryHeader {...createProps()} />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: /more gallery actions/i });
    await user.click(trigger);

    const deleteButton = await screen.findByRole('button', { name: /delete gallery/i });

    deleteButton.focus();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /delete gallery/i })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('renders a share-gallery quick action when provided', async () => {
    const user = userEvent.setup();
    const onCreateShareLink = vi.fn();

    render(
      <MemoryRouter>
        <GalleryHeader
          {...createProps()}
          onCreateShareLink={onCreateShareLink}
          shareLinkCount={3}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /share gallery/i }));

    expect(onCreateShareLink).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
