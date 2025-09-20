import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthenticatedImage } from '../../components/AuthenticatedImage'
import { api } from '../../lib/api'

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('AuthenticatedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should show loading state initially', () => {
    render(<AuthenticatedImage src="/test-image.jpg" alt="test" className="test-class" />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    // Check the outermost loading container div
    const loadingContainer = screen.getByText('Loading...').closest('div')?.parentElement?.parentElement
    expect(loadingContainer).toHaveClass('bg-surface-foreground', 'animate-pulse', 'test-class')
  })

  it('should load and display image successfully', async () => {
    const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
    const mockResponse = { data: mockBlob }

    vi.mocked(api.get).mockResolvedValue(mockResponse)

    render(
      <AuthenticatedImage
        src="/test-image.jpg"
        alt="Test image"
        className="test-class"
      />
    )

    await waitFor(() => {
      const img = screen.getByRole('img')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'blob:mock-url')
      expect(img).toHaveAttribute('alt', 'Test image')
      expect(img).toHaveClass('test-class')
    })

    expect(api.get).toHaveBeenCalledWith('/test-image.jpg', {
      responseType: 'blob'
    })
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
  })

  it('should show error state when image fails to load', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    render(
      <AuthenticatedImage
        src="/test-image.jpg"
        alt="Test image"
        className="test-class"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument()
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load authenticated image:',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })

  it('should handle empty src', () => {
    render(
      <AuthenticatedImage
        src=""
        alt="Test image"
        className="test-class"
      />
    )

    // Should not make API call for empty src
    expect(api.get).not.toHaveBeenCalled()
  })

  it('should set loading attribute correctly', async () => {
    const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
    const mockResponse = { data: mockBlob }

    vi.mocked(api.get).mockResolvedValue(mockResponse)

    render(
      <AuthenticatedImage
        src="/test-image.jpg"
        alt="Test image"
        loading="eager"
      />
    )

    await waitFor(() => {
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('loading', 'eager')
    })
  })

  it('should use lazy loading by default', async () => {
    const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
    const mockResponse = { data: mockBlob }

    vi.mocked(api.get).mockResolvedValue(mockResponse)

    render(
      <AuthenticatedImage
        src="/test-image.jpg"
        alt="Test image"
      />
    )

    await waitFor(() => {
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('loading', 'lazy')
    })
  })

  it('should cleanup blob URL on unmount', async () => {
    const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
    const mockResponse = { data: mockBlob }

    vi.mocked(api.get).mockResolvedValue(mockResponse)

    const { unmount } = render(
      <AuthenticatedImage
        src="/test-image.jpg"
        alt="Test image"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument()
    })

    unmount()

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
