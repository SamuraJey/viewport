import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock IntersectionObserver
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
})

// Mock URL.createObjectURL and URL.revokeObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'mocked-url')
})

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn()
})

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock window.location
delete (window as any).location
window.location = {
  assign: vi.fn(),
  href: '',
  pathname: '/',
  search: '',
  hash: '',
  reload: vi.fn(),
} as any

// Mock window.confirm
Object.defineProperty(window, 'confirm', {
  value: vi.fn(() => true),
  writable: true,
})
