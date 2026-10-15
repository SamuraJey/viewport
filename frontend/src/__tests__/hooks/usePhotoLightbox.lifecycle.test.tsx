import { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { usePhotoLightbox } from '../../hooks/usePhotoLightbox';
import { DownloadOptionsDialog } from '../../components/download/DownloadOptionsDialog';
import type { DownloadEstimate } from '../../types/download';

// Keep YARL and its plugins real: externally unmounting it skips its exited event.
const LightboxDownloadHarness = () => {
  const [choosing, setChoosing] = useState(false);
  const { openLightbox, closeLightbox, renderLightbox } = usePhotoLightbox({
    onExited: () => setChoosing(true),
  });
  const loadEstimate = useCallback(async (): Promise<DownloadEstimate> => ({
    image_count: 1, video_count: 0, available_video_count: 0,
    original_size_bytes: 1000, publication_size_bytes: 250, publication_pending_count: 0,
  }), []);
  return (
    <>
      <button type="button" onClick={() => openLightbox(0)}>View portrait</button>
      {renderLightbox([{
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        alt: 'Portrait', download: true, onDownload: closeLightbox,
      }])}
      <DownloadOptionsDialog open={choosing} title="Download portrait" isArchive={false}
        onClose={() => setChoosing(false)} loadEstimate={loadEstimate} onDownload={async () => {}} />
    </>
  );
};

describe('real lightbox download exit lifecycle', () => {
  it('releases the actual YARL portal before presenting download options', async () => {
    const user = userEvent.setup();
    render(<LightboxDownloadHarness />);
    await user.click(screen.getByRole('button', { name: 'View portrait' }));
    expect(await screen.findByRole('dialog', { name: 'Lightbox' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('dialog', { name: 'Download portrait' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.yarl__root')).not.toBeInTheDocument());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
