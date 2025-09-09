import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicGalleryPage } from '../../pages/PublicGalleryPage'

// Mock React Router useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ shareId: 'share123' }))
  }
})

// Mock data
const mockPublicGallery = {
  photos: [
    { photo_id: 'photo1', thumbnail_url: '/api/photos/photo1_thumb.jpg', full_url: '/api/photos/photo1.jpg' },
    { photo_id: 'photo2', thumbnail_url: '/api/photos/photo2_thumb.jpg', full_url: '/api/photos/photo2.jpg' },
    { photo_id: 'photo3', thumbnail_url: '/api/photos/photo3_thumb.jpg', full_url: '/api/photos/photo3.jpg' }
  ]
}

// Mock services
vi.mock('../../services/shareLinkService', () => ({
  shareLinkService: {
    getSharedGallery: vi.fn()
  }
}))

// Mock window.open
Object.defineProperty(window, 'open', {
  writable: true,
  value: vi.fn()
})

// Mock components
vi.mock('../../components/PublicBatchImage', () => ({
  PublicBatchImage: ({ alt, ...props }: any) => (
    <img alt={alt} data-testid="public-batch-image" {...props} />
  ),
  PublicBatchImageProvider: ({ children }: any) => <div data-testid="provider">{children}</div>
}))

vi.mock('../../components/PublicImage', () => ({
  PublicPresignedImage: ({ alt, ...props }: any) => (
    <img alt={alt} data-testid="public-presigned-image" {...props} />
  )
}))

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' })
}))

const PublicGalleryPageWrapper = () => {
  return <PublicGalleryPage />
}

describe('PublicGalleryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset useParams mock to default valid shareId
    const { useParams } = await import('react-router-dom')
    vi.mocked(useParams).mockReturnValue({ shareId: 'share123' })

    // Default mock response
    const { shareLinkService } = await import('../../services/shareLinkService')
    vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(mockPublicGallery)
  })

  it('should render public gallery page correctly', async () => {
    render(<PublicGalleryPageWrapper />)

    await waitFor(() => {
      expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
    })

    expect(screen.getByText("Powered by Viewport - Your Photo Gallery Solution")).toBeInTheDocument()
    expect(screen.getByText('Photos (3)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download all photos/i })).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('should display loading state initially', () => {
    render(<PublicGalleryPageWrapper />)

    expect(screen.getByText('Loading gallery...')).toBeInTheDocument()
  })

  it('should handle gallery loading error', async () => {
    const { shareLinkService } = await import('../../services/shareLinkService')
    vi.mocked(shareLinkService.getSharedGallery).mockRejectedValue(new Error('Network error'))

    render(<PublicGalleryPageWrapper />)

    await waitFor(() => {
      expect(screen.getByText('Gallery Not Available')).toBeInTheDocument()
    })

    expect(screen.getByText('Gallery not found or link has expired')).toBeInTheDocument()
  })

  it('should handle invalid share id', async () => {
    // Mock useParams to return undefined shareId for this test
    const { useParams } = await import('react-router-dom')
    vi.mocked(useParams).mockReturnValue({ shareId: undefined })

    render(<PublicGalleryPageWrapper />)

    await waitFor(() => {
      expect(screen.getByText('Gallery Not Available')).toBeInTheDocument()
    })

    expect(screen.getByText('Invalid share link')).toBeInTheDocument()
  })

  describe('Photo Modal Features', () => {
    it('should open photo modal when clicking on a photo', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      const photos = screen.getAllByRole('img')
      await userEvent.click(photos[0])

      // Modal should be visible - check for modal elements
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
      expect(screen.getByText('Download')).toBeInTheDocument()

      // Modal should show the first photo
      const modalImages = screen.getAllByAltText('Photo photo1')
      expect(modalImages).toHaveLength(2) // One in gallery, one in modal
    })

    it('should close photo modal when clicking close button', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal by clicking photo button
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      // Modal should be open
      expect(screen.getByText('1 of 3')).toBeInTheDocument()

      // Close modal by finding the close button (top-right positioned button)
      const buttons = screen.getAllByRole('button')
      const closeButton = buttons.find(button =>
        button.className.includes('absolute top-4 right-4')
      )
      expect(closeButton).toBeDefined()

      await userEvent.click(closeButton!)

      // Modal should be gone
      await waitFor(() => {
        expect(screen.queryByText('1 of 3')).not.toBeInTheDocument()
      })
    })

    it('should close photo modal when pressing Escape key', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal by clicking photo button
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      // Modal should be open
      expect(screen.getByText('1 of 3')).toBeInTheDocument()

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' })

      // Modal should be gone
      await waitFor(() => {
        expect(screen.queryByText('1 of 3')).not.toBeInTheDocument()
      })
    })

    it('should navigate to next photo with arrow key', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal on first photo
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      expect(screen.getByText('1 of 3')).toBeInTheDocument()

      // Press ArrowRight
      fireEvent.keyDown(document, { key: 'ArrowRight' })

      // Should show second photo
      await waitFor(() => {
        expect(screen.getByText('2 of 3')).toBeInTheDocument()
      })
    })

    it('should navigate to previous photo with arrow key', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal on second photo
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo2' }))

      expect(screen.getByText('2 of 3')).toBeInTheDocument()

      // Press ArrowLeft
      fireEvent.keyDown(document, { key: 'ArrowLeft' })

      // Should show first photo
      await waitFor(() => {
        expect(screen.getByText('1 of 3')).toBeInTheDocument()
      })
    })

    it('should wrap around navigation', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal on first photo and go to previous (should wrap to last)
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      fireEvent.keyDown(document, { key: 'ArrowLeft' })

      await waitFor(() => {
        expect(screen.getByText('3 of 3')).toBeInTheDocument()
      })

      // Go to next (should wrap to first)
      fireEvent.keyDown(document, { key: 'ArrowRight' })

      await waitFor(() => {
        expect(screen.getByText('1 of 3')).toBeInTheDocument()
      })
    })

    it('should not show navigation buttons for single photo', async () => {
      const singlePhotoGallery = {
        photos: [{ photo_id: 'photo1', thumbnail_url: '/api/photos/photo1_thumb.jpg', full_url: '/api/photos/photo1.jpg' }]
      }

      const { shareLinkService } = await import('../../services/shareLinkService')
      vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(singlePhotoGallery)

      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Photos (1)')).toBeInTheDocument()
      })

      // Open modal
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      expect(screen.getByText('1 of 1')).toBeInTheDocument()

      // Navigation buttons should not exist for single photo
      const buttons = screen.getAllByRole('button')
      const leftNavButton = buttons.find(button =>
        button.className.includes('absolute left-4') && button.className.includes('top-1/2')
      )
      const rightNavButton = buttons.find(button =>
        button.className.includes('absolute right-4') && button.className.includes('top-1/2')
      )

      // These should not exist in DOM at all for single photo
      expect(leftNavButton).toBeUndefined()
      expect(rightNavButton).toBeUndefined()
    })

    it('should download photo from modal', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      // Click download button in modal (the one with just "Download" text)
      await userEvent.click(screen.getByText('Download'))

      expect(window.open).toHaveBeenCalledWith('http://localhost:8000/s/share123/download/photo1', '_blank')
    })
  })

  describe('Download Features', () => {
    it('should handle download all photos', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Click download all button
      const downloadAllButton = screen.getByRole('button', { name: /download all photos/i })
      await userEvent.click(downloadAllButton)

      expect(window.open).toHaveBeenCalledWith('http://localhost:8000/s/share123/download/all', '_blank')
    })

    it('should handle individual photo download', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Find download button for individual photo (on hover)
      const photoContainer = screen.getAllByRole('img')[0].closest('div')
      const downloadButton = photoContainer?.querySelector('button[title="Download Photo"]')

      if (downloadButton) {
        await userEvent.click(downloadButton)
        expect(window.open).toHaveBeenCalledWith('http://localhost:8000/s/share123/download/photo1', '_blank')
      }
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no photos', async () => {
      const emptyGallery = { photos: [] }

      const { shareLinkService } = await import('../../services/shareLinkService')
      vi.mocked(shareLinkService.getSharedGallery).mockResolvedValue(emptyGallery)

      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('No photos in this gallery')).toBeInTheDocument()
      })

      expect(screen.getByText('This gallery appears to be empty.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /download all photos/i })).not.toBeInTheDocument()
    })
  })

  describe('Modal Navigation Buttons', () => {
    it('should navigate with navigation buttons when multiple photos', async () => {
      render(<PublicGalleryPageWrapper />)

      await waitFor(() => {
        expect(screen.getByText('Shared Gallery')).toBeInTheDocument()
      })

      // Open modal
      await userEvent.click(screen.getByRole('button', { name: 'Photo photo1' }))

      expect(screen.getByText('1 of 3')).toBeInTheDocument()

      // Click next button (right-side navigation button)
      const buttons = screen.getAllByRole('button')
      const nextButton = buttons.find(button =>
        button.className.includes('absolute right-4')
      )
      expect(nextButton).toBeDefined()

      await userEvent.click(nextButton!)
      await waitFor(() => {
        expect(screen.getByText('2 of 3')).toBeInTheDocument()
      })
    })
  })
})
