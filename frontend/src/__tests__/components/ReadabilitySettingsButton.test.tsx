import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReadabilitySettingsButton } from '../../components/ReadabilitySettingsButton';
import { useReadabilityStore } from '../../stores/readabilityStore';

describe('ReadabilitySettingsButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(window.localStorage.setItem).mockClear();
    document.getElementById('headlessui-portal-root')?.remove();
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
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('applies the remaining contrast preset immediately', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ReadabilitySettingsButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open low-vision settings/i }));
    const dialog = await screen.findByRole('dialog', { name: /low-vision mode/i });

    await user.click(screen.getByRole('switch', { name: /enable low-vision mode/i }));
    await user.click(within(dialog).getByRole('button', { name: /white on black/i }));

    expect(document.documentElement.dataset.readabilityMode).toBe('on');
    expect(document.documentElement.dataset.readabilityContrast).toBe('white-on-black');

    const latestPersistenceCall = vi.mocked(window.localStorage.setItem).mock.calls.at(-1);
    expect(JSON.parse(latestPersistenceCall?.[1] || '{}')).toMatchObject({
      enabled: true,
      contrast: 'white-on-black',
    });
  });

  it('disables settings buttons until low-vision mode is enabled', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ReadabilitySettingsButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open low-vision settings/i }));
    const dialog = await screen.findByRole('dialog', { name: /low-vision mode/i });

    const contrastButton = within(dialog).getByRole('button', { name: /white on black/i });
    const fontScaleButton = within(dialog).getByRole('button', { name: '150%' });
    const lineSpacingButton = within(dialog).getByRole('button', { name: /spacious/i });

    expect(contrastButton).toBeDisabled();
    expect(fontScaleButton).toBeDisabled();
    expect(lineSpacingButton).toBeDisabled();

    await user.tab();
    expect(screen.getByRole('button', { name: /close readability settings/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: /enable low-vision mode/i })).toHaveFocus();
    await user.tab();
    expect(contrastButton).not.toHaveFocus();
  });

  it('reset returns all readability settings to defaults', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ReadabilitySettingsButton />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open low-vision settings/i }));
    const dialog = await screen.findByRole('dialog', { name: /low-vision mode/i });

    await user.click(screen.getByRole('switch', { name: /enable low-vision mode/i }));
    await user.click(within(dialog).getByRole('button', { name: /white on black/i }));
    await user.click(within(dialog).getByRole('button', { name: '150%' }));
    await user.click(within(dialog).getByRole('button', { name: /spacious/i }));
    await user.click(within(dialog).getByRole('button', { name: /reset/i }));

    expect(useReadabilityStore.getState()).toMatchObject({
      enabled: false,
      contrast: 'black-on-white',
      fontScale: '100',
      lineSpacing: 'normal',
    });
    expect(document.documentElement.dataset.readabilityMode).toBe('off');
    expect(document.documentElement.dataset.readabilityContrast).toBe('black-on-white');
    expect(document.documentElement.dataset.readabilityFontScale).toBe('100');
    expect(document.documentElement.dataset.readabilityLineSpacing).toBe('normal');
  });
});
