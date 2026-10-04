import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { photoService } from '../services/photoService';
import {
  canRotatePhoto,
  isRotationPending,
  isStaleRotation,
  normalizeRotation,
} from '../lib/photoRotation';
import type { GalleryPhoto, PhotoRotation, PhotoRotationResponse } from '../types/photo';

interface Options {
  galleryId: string;
  photos: GalleryPhoto[];
  pendingCount: number;
  onUpdate: (response: PhotoRotationResponse) => void;
  onSaved: () => Promise<void>;
}

export function usePhotoRotation({ galleryId, photos, pendingCount, onUpdate, onSaved }: Options) {
  const known = useRef(new Map<string, GalleryPhoto>());
  const queued = useRef(new Map<string, { angle: PhotoRotation; sequence: number }>());
  const sequence = useRef(0);
  const sending = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [optimistic, setOptimistic] = useState<Record<string, PhotoRotation>>({});
  const [knownPhotos, setKnownPhotos] = useState(
    () => new Map(photos.map((photo) => [photo.id, photo])),
  );
  const mergedPhotos = useMemo(() => {
    const next = new Map(knownPhotos);
    photos.forEach((photo) => {
      if (!isStaleRotation(photo, next.get(photo.id))) next.set(photo.id, photo);
    });
    return next;
  }, [knownPhotos, photos]);
  const tracked = useMemo(
    () => [...mergedPhotos.values()].filter(isRotationPending).map((photo) => photo.id),
    [mergedPhotos],
  );
  const callbacks = useRef({ onUpdate, onSaved });
  useEffect(() => {
    callbacks.current = { onUpdate, onSaved };
  }, [onUpdate, onSaved]);

  useEffect(() => {
    photos.forEach((photo) => {
      const existing = known.current.get(photo.id);
      if (!isStaleRotation(photo, existing)) known.current.set(photo.id, photo);
    });
  }, [photos]);

  const accept = useCallback((response: PhotoRotationResponse) => {
    const failed: GalleryPhoto[] = [];
    const results = response.results.filter(({ photo_id, photo, error }) => {
      const previous = known.current.get(photo_id);
      if (photo) {
        if (isStaleRotation(photo, previous)) return false;
        known.current.set(photo_id, photo);
        if (photo.rotation_status === 'failed' && previous?.rotation_status !== 'failed')
          failed.push(photo);
      } else if (error === 'not_found') known.current.delete(photo_id);
      return true;
    });
    if (!mounted.current) return;
    callbacks.current.onUpdate({ ...response, results });
    setKnownPhotos(new Map(known.current));
    if (failed.length)
      toast.error(
        failed.length === 1
          ? `Could not save rotation for ${failed[0].filename}. Use Retry on the photo.`
          : `Could not save rotation for ${failed.length} photos. Use Retry on the affected photos.`,
      );
  }, []);

  const flush = useCallback(
    async function saveQueued() {
      if (sending.current || queued.current.size === 0) return;
      sending.current = true;
      const batch = [...queued.current.entries()].slice(0, 500);
      const items = batch.map(([id, intent]) => ({
        photo_id: id,
        rotation: intent.angle,
        expected_revision: known.current.get(id)?.rotation_revision ?? 0,
      }));
      try {
        const response = await photoService.rotatePhotos(galleryId, items);
        accept(response);
        if (response.results.some((result) => result.error))
          toast.error(
            'Some photos could not be rotated. Conflicting edits were refreshed; try again.',
          );
        if (response.results.some((result) => result.photo?.rotation_status === 'ready')) {
          void callbacks.current.onSaved().catch(() => {
            /* Revalidate on the next page load. */
          });
        }
      } catch {
        // A response may be lost after the edit was committed. Read before retrying.
        try {
          accept(
            await photoService.getRotationStatus(
              galleryId,
              items.map((item) => item.photo_id),
            ),
          );
        } catch {
          /* Keep known server state; the retry action reads it again. */
        }
        if (mounted.current)
          toast.error('Could not confirm the rotation. Retry to save your changes.', {
            action: {
              label: 'Retry',
              onClick: () => {
                batch.forEach(([id, intent]) =>
                  queued.current.set(id, { ...intent, sequence: ++sequence.current }),
                );
                setOptimistic((prev) => ({
                  ...prev,
                  ...Object.fromEntries(batch.map(([id, intent]) => [id, intent.angle])),
                }));
                void saveQueued();
              },
            },
          });
      } finally {
        batch.forEach(([id, intent]) => {
          if (queued.current.get(id)?.sequence === intent.sequence) queued.current.delete(id);
        });
        if (mounted.current)
          setOptimistic((prev) => {
            const next = { ...prev };
            batch.forEach(([id]) => {
              if (!queued.current.has(id)) delete next[id];
            });
            return next;
          });
        sending.current = false;
        if (queued.current.size) timer.current = setTimeout(() => void saveQueued(), 300);
      }
    },
    [galleryId, accept],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      clearTimeout(timer.current);
      void flush();
      mounted.current = false;
    };
  }, [flush]);

  useEffect(() => {
    if (!tracked.length && !pendingCount) return;
    let active = true;
    let polling = false;
    const poll = async () => {
      if (!active || polling || document.hidden) return;
      polling = true;
      try {
        const ids = [
          ...new Set([...tracked, ...photos.filter(isRotationPending).map((photo) => photo.id)]),
        ];
        const batches = ids.length
          ? Array.from({ length: Math.ceil(ids.length / 500) }, (_, i) =>
              ids.slice(i * 500, (i + 1) * 500),
            )
          : [[]];
        for (const batch of batches) {
          const response = await photoService.getRotationStatus(galleryId, batch);
          if (!active) return;
          accept(response);
          if (
            response.results.some((result) => result.photo?.rotation_status === 'ready') ||
            response.pending_rotation_count === 0
          ) {
            await callbacks.current.onSaved();
          }
        }
      } catch {
        /* Poll again after a transient connection failure. */
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(() => void poll(), 2000);
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [galleryId, tracked, pendingCount, photos, accept]);

  const setAngles = useCallback(
    (angles: Map<string, PhotoRotation>) => {
      angles.forEach((angle, id) =>
        queued.current.set(id, { angle, sequence: ++sequence.current }),
      );
      setOptimistic((prev) => ({ ...prev, ...Object.fromEntries(angles) }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 300);
    },
    [flush],
  );

  const rotate = useCallback(
    (ids: string[], direction: -90 | 90 | 'reset' | 'retry') => {
      const before = new Map<string, PhotoRotation>();
      const after = new Map<string, PhotoRotation>();
      ids.forEach((id) => {
        const photo = known.current.get(id);
        if (!photo || !canRotatePhoto(photo)) return;
        const current =
          queued.current.get(id)?.angle ??
          (isRotationPending(photo) ? photo.requested_rotation : photo.rotation) ??
          0;
        before.set(id, current);
        after.set(
          id,
          direction === 'reset'
            ? 0
            : direction === 'retry'
              ? (photo.requested_rotation ?? 0)
              : normalizeRotation(current + direction),
        );
      });
      if (!after.size) return;
      setAngles(after);
      toast.success(`Rotated ${after.size} photo${after.size === 1 ? '' : 's'}`, {
        id: 'photo-rotation',
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: () => {
            if (mounted.current) setAngles(before);
          },
        },
      });
    },
    [setAngles],
  );

  const displayPhotos = photos.map((photo) => {
    const current = mergedPhotos.get(photo.id);
    const confirmed = isStaleRotation(photo, current) ? current! : photo;
    return optimistic[photo.id] === undefined
      ? confirmed
      : {
          ...confirmed,
          requested_rotation: optimistic[photo.id],
          rotation_status: 'pending' as const,
        };
  });
  const getPhoto = (id: string) => {
    const photo = mergedPhotos.get(id);
    return photo && optimistic[id] !== undefined
      ? { ...photo, requested_rotation: optimistic[id], rotation_status: 'pending' as const }
      : photo;
  };
  return {
    rotate,
    photos: displayPhotos,
    getPhoto,
    hasLocalEdits: Object.keys(optimistic).length > 0,
  };
}
