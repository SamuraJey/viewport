// Share a native observer between upload previews and owner-card controls.
const callbacks = new Map<Element, { callback: (visible: boolean) => void; once: boolean }>();
let observer: IntersectionObserver | null = null;

export function observeNearViewport(element: Element, onVisible: () => void): () => void {
  return observeVisibility(element, onVisible, true);
}

export function observeViewportVisibility(
  element: Element,
  onChange: (visible: boolean) => void,
): () => void {
  return observeVisibility(element, onChange, false);
}

function observeVisibility(
  element: Element,
  callback: (visible: boolean) => void,
  once: boolean,
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback(true);
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const registration = callbacks.get(entry.target);
        if (!registration || (registration.once && !entry.isIntersecting)) continue;
        if (registration.once) {
          callbacks.delete(entry.target);
          observer?.unobserve(entry.target);
        }
        registration.callback(entry.isIntersecting);
      }
      if (!callbacks.size) {
        observer?.disconnect();
        observer = null;
      }
    },
    { rootMargin: '120px' },
  );
  callbacks.set(element, { callback, once });
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
