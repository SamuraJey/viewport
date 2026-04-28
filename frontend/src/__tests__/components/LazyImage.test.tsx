import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LazyImage } from '../../components/LazyImage';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  private callback: IntersectionObserverCallback;
  private targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords() {
    return [];
  }

  triggerAll(isIntersecting = true) {
    const entries = Array.from(this.targets).map(
      (target) => ({ isIntersecting, target }) as IntersectionObserverEntry,
    );

    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

describe('LazyImage', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers aspectRatioHint over backend width/height for its placeholder', () => {
    render(<LazyImage src="/image.jpg" alt="Hero" aspectRatioHint={2} width={400} height={400} />);

    expect(screen.getByText('Loading...').parentElement).toHaveStyle({ aspectRatio: '2' });
  });

  it('falls back to the default ratio when no hint or dimensions are available', () => {
    render(<LazyImage src="/image.jpg" alt="Fallback" />);

    expect(screen.getByText('Loading...').parentElement).toHaveStyle({ aspectRatio: '4/3' });
  });

  it('ignores invalid hints and falls back to backend dimensions for its placeholder', () => {
    render(<LazyImage src="/image.jpg" alt="Sized" aspectRatioHint={0} width={300} height={150} />);

    expect(screen.getByText('Loading...').parentElement).toHaveStyle({ aspectRatio: '300/150' });
  });

  it('lazy-loads via IntersectionObserver and eagerly fetches after intersection', async () => {
    render(<LazyImage src="/image.jpg" alt="Loaded" objectFit="contain" />);

    expect(screen.queryByRole('img', { name: 'Loaded' })).not.toBeInTheDocument();

    MockIntersectionObserver.instances.forEach((observer) => observer.triggerAll());

    const image = await screen.findByRole('img', { name: 'Loaded' });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveClass('object-contain');

    fireEvent.load(image);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });
});
