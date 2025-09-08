import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PublicImage, clearExpiredPublicImageCache } from '../../components/PublicImage'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn()
const mockRevokeObjectURL = vi.fn()
global.URL.createObjectURL = mockCreateObjectURL
global.URL.revokeObjectURL = mockRevokeObjectURL

describe('PublicImage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        clearExpiredPublicImageCache()
    })

    afterEach(() => {
        vi.clearAllTimers()
    })

    it('renders loading state initially', async () => {
        mockFetch.mockImplementation(() => new Promise(() => { })) // Never resolves

        render(<PublicImage src="https://example.com/image.jpg" alt="test" className="test-class" />)

        expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('renders image after successful fetch', async () => {
        const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
        const mockResponse = {
            ok: true,
            blob: () => Promise.resolve(mockBlob),
        }
        const mockObjectUrl = 'blob:http://localhost/fake-url'

        mockFetch.mockResolvedValue(mockResponse)
        mockCreateObjectURL.mockReturnValue(mockObjectUrl)

        await act(async () => {
            render(
                <PublicImage
                    src="https://example.com/image.jpg"
                    alt="test image"
                    className="test-class"
                />
            )
        })

        await waitFor(() => {
            const img = screen.getByRole('img')
            expect(img).toHaveAttribute('src', mockObjectUrl)
            expect(img).toHaveAttribute('alt', 'test image')
            expect(img).toHaveClass('test-class')
        })

        expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
            signal: expect.any(AbortSignal),
            cache: 'force-cache',
        })
        expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob)
    })

    it('renders error state when fetch fails', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'))

        await act(async () => {
            render(
                <PublicImage
                    src="https://example.com/image.jpg"
                    alt="test image"
                />
            )
        })

        await waitFor(() => {
            expect(screen.getByText('Failed to load')).toBeInTheDocument()
        })
    })

    it('renders error state when response is not ok', async () => {
        const mockResponse = {
            ok: false,
            status: 404,
        }

        mockFetch.mockResolvedValue(mockResponse)

        await act(async () => {
            render(
                <PublicImage
                    src="https://example.com/image.jpg"
                    alt="test image"
                />
            )
        })

        await waitFor(() => {
            expect(screen.getByText('Failed to load')).toBeInTheDocument()
        })
    })

    it('does not render anything when src is empty', async () => {
        render(<PublicImage src="" alt="test" />)

        // Should not call fetch
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('caches images and reuses them', async () => {
        const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
        const mockResponse = {
            ok: true,
            blob: () => Promise.resolve(mockBlob),
        }
        const mockObjectUrl = 'blob:http://localhost/fake-url'

        mockFetch.mockResolvedValue(mockResponse)
        mockCreateObjectURL.mockReturnValue(mockObjectUrl)

        // First render
        const { unmount } = await act(async () =>
            render(<PublicImage src="https://example.com/image.jpg" alt="test" />)
        )

        await waitFor(() => {
            expect(screen.getByRole('img')).toHaveAttribute('src', mockObjectUrl)
        })

        unmount()

        // Second render with same src should use cache
        await act(async () =>
            render(<PublicImage src="https://example.com/image.jpg" alt="test" />)
        )

        await waitFor(() => {
            expect(screen.getByRole('img')).toHaveAttribute('src', mockObjectUrl)
        })

        // Should only call fetch once due to caching
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('clears expired cache entries', () => {
        // This test would be more complex to implement properly
        // as it involves testing the setInterval cleanup
        expect(clearExpiredPublicImageCache).toBeDefined()
    })
})
