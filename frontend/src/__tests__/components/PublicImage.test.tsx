import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { PublicPresignedImage } from '../../components/PublicImage';
import { shareLinkService } from '../../services/shareLinkService';

vi.mock('../../services/shareLinkService', () => ({
    shareLinkService: {
        getPublicPhotoUrl: vi.fn(),
    },
}));

describe('PublicPresignedImage', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fetches and renders an image', async () => {
        shareLinkService.getPublicPhotoUrl.mockResolvedValue({ url: '/image.jpg', expires_in: 120 });

        render(<PublicPresignedImage shareId="s1" photoId="p1" alt="Photo" className="img" />);

        const img = await screen.findByRole('img', { name: 'Photo' });
        expect(img).toHaveAttribute('src', '/image.jpg');
        expect(img).toHaveClass('img');
        expect(shareLinkService.getPublicPhotoUrl).toHaveBeenCalledWith('s1', 'p1');
    });

    it('shows error state when fetch fails', async () => {
        shareLinkService.getPublicPhotoUrl.mockRejectedValue(new Error('fail'));

        render(<PublicPresignedImage shareId="s1" photoId="p2" alt="Broken" />);

        await waitFor(() => expect(screen.getByText('fail')).toBeInTheDocument());
    });
});
