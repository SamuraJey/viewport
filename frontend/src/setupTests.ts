import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IntersectionObserver — fires on start so viewport-triggered logic works in tests.
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: class {
    private callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
});

// Mock URL methods
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'blob:mock-url'),
});
Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

// Mock localStorage and sessionStorage with in-memory persistence
const createStorageMock = () => {
  let store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(String(key), String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(String(key));
    }),
    clear: vi.fn(() => {
      store = new Map();
    }),
  };
};

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: createStorageMock(),
});
Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: createStorageMock(),
});

// Mock window.location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    assign: vi.fn(),
    href: '',
    pathname: '/',
    search: '',
    hash: '',
    reload: vi.fn(),
  },
});

// Mock window.confirm
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: vi.fn(() => true),
});

// JSDOM doesn't implement full document navigation. Prevent default browser
// navigation for regular anchor clicks so reruns stay noise-free.
document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    event.preventDefault();
  },
  true,
);

// Mock canvas API — jsdom doesn't implement the 2d rendering pipeline,
// but our thumbnail engine relies on getContext + toBlob.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  fillRect: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
  // Call synchronously so the generateThumb promise resolves within the same
  // microtask checkpoint.
  callback(new Blob(['mock-thumb'], { type: 'image/jpeg' }));
}) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

// Mock Image to fire onload when src is set so thumbnail generation works.
// The real browser does this too — jsdom simply doesn't load blob URLs.
// Extends EventTarget so both addEventListener('load') and onload= patterns work.
Object.defineProperty(window, 'Image', {
  configurable: true,
  writable: true,
  value: class MockImage extends EventTarget {
    naturalWidth = 100;
    naturalHeight = 75;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    private _src = '';

    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      if (value) {
        // Defer so callers can attach handlers first; mirrors real browser behaviour.
        setTimeout(() => {
          this.onload?.();
          this.dispatchEvent(new Event('load'));
        }, 0);
      }
    }
  },
});
