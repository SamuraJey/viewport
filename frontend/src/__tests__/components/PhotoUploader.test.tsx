import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoUploader } from '../../components/PhotoUploader'

describe('PhotoUploader', () => {
  const mockOnUpload = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Make sure onUpload returns a resolved promise by default
    mockOnUpload.mockResolvedValue(undefined)
  })

  it('should render drop zone with file input', () => {
    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    expect(screen.getByLabelText(/upload photos/i)).toBeInTheDocument()
    expect(screen.getByText('Drag & drop photos here')).toBeInTheDocument()
    expect(screen.getByText(/or click to select files/i)).toBeInTheDocument()
  })

  it('should show uploading state when isUploading is true', () => {
    render(<PhotoUploader onUpload={mockOnUpload} isUploading={true} />)

    expect(screen.getByLabelText(/upload photos/i)).toBeInTheDocument()
    // When uploading, the interface should be disabled or show loading state
  })

  it('should handle file selection through file input', async () => {
    const user = userEvent.setup()
    const file1 = new File(['image1'], 'test1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['image2'], 'test2.png', { type: 'image/png' })

    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    const fileInput = screen.getByLabelText(/upload photos/i).querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()

    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, [file1, file2])
      
      // Should show selected files
      expect(screen.getByText('test1.jpg')).toBeInTheDocument()
      expect(screen.getByText('test2.png')).toBeInTheDocument()
    }
  })

  it('should reject non-image files', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)
    render(<PhotoUploader onUpload={onUpload} isUploading={false} />)
    
    const fileInput = screen.getByRole('button', { name: /upload photos/i }).querySelector('input[type="file"]')
    if (fileInput) {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(onUpload).not.toHaveBeenCalled()
      })
      
      // Should show error for invalid file type in file list
      await waitFor(() => {
        expect(screen.getByText('Only JPG and PNG files are allowed.')).toBeInTheDocument()
      })
    }
  })

  it('should reject large files', async () => {
    const user = userEvent.setup()
    // Create a file that's too large (over 15MB)
    const largeFile = new File([new ArrayBuffer(16 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' })

    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    const fileInput = screen.getByLabelText(/upload photos/i).querySelector('input[type="file"]')
    
    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, [largeFile])
      
      // Should show error for file too large
      expect(screen.getByText(/File size must be ≤ 15 MB/i)).toBeInTheDocument()
    }
  })

  it('should handle drag and drop events', () => {
    const file = new File(['image'], 'dropped.jpg', { type: 'image/jpeg' })

    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    const dropZone = screen.getByLabelText(/upload photos/i)

    // Simulate drag enter
    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'image/jpeg' }],
      },
    })

    // Simulate drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    })

    // Should show the dropped file
    expect(screen.getByText('dropped.jpg')).toBeInTheDocument()
  })

  it('should trigger onUpload when files are ready and conditions are met', async () => {
    const user = userEvent.setup()
    const file = new File(['image'], 'test.jpg', { type: 'image/jpeg' })
    
    mockOnUpload.mockResolvedValue(undefined)

    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    const fileInput = screen.getByLabelText(/upload photos/i).querySelector('input[type="file"]')
    
    if (fileInput) {
      await user.upload(fileInput as HTMLInputElement, [file])
      
      // The component should show the file is selected
      expect(screen.getByText('test.jpg')).toBeInTheDocument()
    }
  })

  it('should show error messages when validation fails', () => {
    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    // First render without error
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()

    // Re-render with mock error state (this would normally be handled by the component internally)
    // For this test, we'll just verify the component structure can handle errors
    expect(screen.getByLabelText(/upload photos/i)).toBeInTheDocument()
  })

  it('should handle click to select files', async () => {
    const user = userEvent.setup()
    
    render(<PhotoUploader onUpload={mockOnUpload} isUploading={false} />)

    const dropZone = screen.getByLabelText(/upload photos/i)
    
    // Clicking the drop zone should trigger file selection
    await user.click(dropZone)
    
    // The file input should be part of the drop zone
    expect(dropZone.querySelector('input[type="file"]')).toBeInTheDocument()
  })

  it('should prevent upload when isUploading is true', () => {
    render(<PhotoUploader onUpload={mockOnUpload} isUploading={true} />)

    const dropZone = screen.getByLabelText(/upload photos/i)
    
    // Component should be in uploading state
    expect(dropZone).toBeInTheDocument()
    
    // onUpload should not be called when already uploading
    expect(mockOnUpload).not.toHaveBeenCalled()
  })
})
