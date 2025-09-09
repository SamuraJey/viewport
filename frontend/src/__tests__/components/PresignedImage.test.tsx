import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PresignedImage } from '../../components/PresignedImage'
import { photoService } from '../../services/photoService'

// Mock photoService
vi.mock('../../services/photoService', () => ({
    photoService: {
        getPhotoUrl: vi.fn(),
        getPhotoUrlDirect: vi.fn(),
    },
}))

describe('PresignedImage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders loading state initially', async () => {
        vi.mocked(photoService.getPhotoUrlDirect).mockImplementation(
            () => new Promise(() => { }) // Never resolves
        )

        render(<PresignedImage photoId="photo-1" alt="test" className="test-class" />)

        expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('renders image with presigned URL from direct service when no galleryId', async () => {
        const mockResponse = {
            id: 'photo-1',
            url: 'https://s3.example.com/presigned-url',
            expires_in: 3600,
        }

        vi.mocked(photoService.getPhotoUrlDirect).mockResolvedValue(mockResponse)

        await act(async () => {
            render(
                <PresignedImage
                    photoId="photo-1"
                    alt="test image"
                    className="test-class"
                />
            )
        })

        await waitFor(() => {
            const img = screen.getByRole('img')
            expect(img).toHaveAttribute('src', mockResponse.url)
            expect(img).toHaveAttribute('alt', 'test image')
            expect(img).toHaveClass('test-class')
        })

        expect(photoService.getPhotoUrlDirect).toHaveBeenCalledWith('photo-1')
    })

    it('renders image with presigned URL from gallery service when galleryId provided', async () => {
        const mockResponse = {
            id: 'photo-1',
            url: 'https://s3.example.com/presigned-url',
            expires_in: 3600,
        }

        vi.mocked(photoService.getPhotoUrl).mockResolvedValue(mockResponse)

        await act(async () => {
            render(
                <PresignedImage
                    photoId="photo-1"
                    galleryId="gallery-1"
                    alt="test image"
                    className="test-class"
                />
            )
        })

        await waitFor(() => {
            const img = screen.getByRole('img')
            expect(img).toHaveAttribute('src', mockResponse.url)
        })

        expect(photoService.getPhotoUrl).toHaveBeenCalledWith('gallery-1', 'photo-1')
    })

    it('should handle fetch errors gracefully', async () => {
        // Mock photoService to reject
        vi.mocked(photoService.getPhotoUrlDirect).mockRejectedValue(new Error('Network error'))

        render(<PresignedImage photoId="test-photo" alt="Test image" />)

        // Wait for error state
        await waitFor(() => {
            expect(screen.getByText('Failed to load')).toBeInTheDocument()
        })
    })

    it('does not render anything when photoId is empty', async () => {
        render(<PresignedImage photoId="" alt="test" />)

        // Should not call any service
        expect(photoService.getPhotoUrlDirect).not.toHaveBeenCalled()
        expect(photoService.getPhotoUrl).not.toHaveBeenCalled()
    })

    it('caches URLs and reuses them', async () => {
        const mockResponse = {
            id: 'photo-1',
            url: 'https://s3.example.com/presigned-url',
            expires_in: 3600,
        }

        vi.mocked(photoService.getPhotoUrlDirect).mockResolvedValue(mockResponse)

        // First render
        const { unmount } = await act(async () =>
            render(<PresignedImage photoId="cache-test-photo" alt="test" />)
        )

        await waitFor(() => {
            expect(screen.getByRole('img')).toHaveAttribute('src', mockResponse.url)
        })

        expect(photoService.getPhotoUrlDirect).toHaveBeenCalledTimes(1)

        unmount()

        // Clear mocks to check if second render uses cache
        vi.clearAllMocks()

        // Second render with same photo should use cache
        await act(async () =>
            render(<PresignedImage photoId="cache-test-photo" alt="test" />)
        )

        await waitFor(() => {
            expect(screen.getByRole('img')).toHaveAttribute('src', mockResponse.url)
        })

        // Should not call service again due to caching
        expect(photoService.getPhotoUrlDirect).toHaveBeenCalledTimes(0)
    })
})
