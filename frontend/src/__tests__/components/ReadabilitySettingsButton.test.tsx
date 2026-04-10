import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReadabilitySettingsButton } from '../../components/ReadabilitySettingsButton';
import { useReadabilityStore } from '../../stores/readabilityStore';

describe('ReadabilitySettingsButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(window.localStorage.setItem).mockClear();
    document.documentElement.removeAttribute('data-readability-mode');
    document.documentElement.removeAttribute('data-readability-contrast');
    document.documentElement.removeAttribute('data-readability-font-scale');
    document.documentElement.removeAttribute('data-readability-line-spacing');
    useReadabilityStore.setState({
      enabled: false,
      contrast: 'black-on-white',
      fontScale: '100',
      lineSpacing: 'normal',
      isHydrated: true,
    });
  });

  it('renders the dialog through a portal attached to document.body', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ReadabilitySettingsButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open low-vision settings/i }));

    const dialog = screen.getByRole('dialog', { name: /low-vision mode/i });
    expect(dialog.parentElement?.parentElement?.parentElement).toBe(document.body);
  });

  it('applies blue and beige contrast presets immediately', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ReadabilitySettingsButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open low-vision settings/i }));
    await user.click(screen.getByRole('button', { name: /dark blue on light blue/i }));

    expect(document.documentElement.dataset.readabilityMode).toBe('on');
    expect(document.documentElement.dataset.readabilityContrast).toBe('blue-on-light');

    await user.click(screen.getByRole('button', { name: /brown on beige/i }));

    expect(document.documentElement.dataset.readabilityMode).toBe('on');
    expect(document.documentElement.dataset.readabilityContrast).toBe('brown-on-beige');

    const latestPersistenceCall = vi.mocked(window.localStorage.setItem).mock.calls.at(-1);
    expect(JSON.parse(latestPersistenceCall?.[1] || '{}')).toMatchObject({
      enabled: true,
      contrast: 'brown-on-beige',
    });
  });
});
