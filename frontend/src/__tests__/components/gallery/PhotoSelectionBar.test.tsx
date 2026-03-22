import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PhotoSelectionBar } from '../../../components/gallery/PhotoSelectionBar';

describe('PhotoSelectionBar', () => {
  it('renders and triggers selected download action', async () => {
    const user = userEvent.setup();
    const onDownloadSelected = vi.fn();

    render(
      <PhotoSelectionBar
        isSelectionMode={true}
        hasSelection={true}
        selectionCount={2}
        areAllOnPageSelected={false}
        onSelectAll={vi.fn()}
        onCancel={vi.fn()}
        onDownloadSelected={onDownloadSelected}
        onDeleteMultiple={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Download (2)' }));

    expect(onDownloadSelected).toHaveBeenCalledTimes(1);
  });

  it('disables selected download button while zip is downloading', () => {
    render(
      <PhotoSelectionBar
        isSelectionMode={true}
        hasSelection={true}
        selectionCount={1}
        isDownloadingZip={true}
        areAllOnPageSelected={false}
        onSelectAll={vi.fn()}
        onCancel={vi.fn()}
        onDownloadSelected={vi.fn()}
        onDeleteMultiple={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Download (1)' })).toBeDisabled();
  });
});
