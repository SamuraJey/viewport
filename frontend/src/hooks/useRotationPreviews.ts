import { useEffect, useRef, useState } from 'react';
import type { GalleryPhoto } from '../types/photo';
import { isRotationPending, normalizeRotation, rotateThumbnail } from '../lib/photoRotation';

export function useRotationPreviews(photos: GalleryPhoto[]) {
  const [previews, setPreviews] = useState<Record<string, { key: string; url: string }>>({});
  const cache = useRef(new Map<string, { key: string; url: string }>());
  const [generation, setGeneration] = useState(0);
  const [lastJobsKey, setLastJobsKey] = useState('');
  const jobs = photos
    .filter((photo) => isRotationPending(photo) && photo.requested_rotation !== photo.rotation)
    .map((photo) => ({
      id: photo.id,
      src: photo.thumbnail_url,
      angle: normalizeRotation((photo.requested_rotation ?? 0) - (photo.rotation ?? 0)),
      key: `${photo.thumbnail_url}|${photo.requested_rotation ?? 0}|${photo.rotation ?? 0}`,
    }));
  const jobsKey = JSON.stringify(jobs);
  if (lastJobsKey !== jobsKey) {
    setLastJobsKey(jobsKey);
    setGeneration((prev) => prev + 1);
    setPreviews({});
  }
  useEffect(() => {
    const desired: typeof jobs = JSON.parse(jobsKey);
    const keys = new Map(desired.map((job) => [job.id, job.key]));
    for (const [id, preview] of cache.current) {
      if (keys.get(id) !== preview.key) {
        URL.revokeObjectURL(preview.url);
        cache.current.delete(id);
      }
    }
    const queue = desired.filter((job) => cache.current.get(job.id)?.key !== job.key);
    let active = true;
    // Restore still-valid entries asynchronously, without displaying revoked URLs.
    const retained = Object.fromEntries(cache.current);
    void Promise.resolve().then(() => {
      if (active) setPreviews(retained);
    });
    async function worker() {
      while (active && queue.length) {
        const job = queue.shift()!;
        try {
          const url = await rotateThumbnail(job.src, job.angle);
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          cache.current.set(job.id, { key: job.key, url });
          setPreviews((prev) => ({ ...prev, [job.id]: { key: job.key, url } }));
        } catch {
          /* Keep the last confirmed image if a browser cannot create a preview. */
        }
      }
    }
    const workers = Math.min(4, queue.length);
    for (let i = 0; i < workers; i++) void worker();
    return () => {
      active = false;
    };
  }, [jobsKey, generation]);
  useEffect(() => {
    const urls = cache.current;
    return () => {
      urls.forEach((preview) => URL.revokeObjectURL(preview.url));
      urls.clear();
    };
  }, []);
  return (photo: GalleryPhoto) => {
    const key = `${photo.thumbnail_url}|${photo.requested_rotation ?? 0}|${photo.rotation ?? 0}`;
    return isRotationPending(photo) && previews[photo.id]?.key === key
      ? previews[photo.id].url
      : undefined;
  };
}
