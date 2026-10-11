// One observer for all upload cards, rather than one native observer per file.
const callbacks = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

export function observeNearViewport(element: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const callback = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
        callback?.();
      }
      if (!callbacks.size) {
        observer?.disconnect();
        observer = null;
      }
    },
    { rootMargin: '120px' },
  );
  callbacks.set(element, onVisible);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
    if (!callbacks.size) {
      observer?.disconnect();
      observer = null;
    }
  };
}
