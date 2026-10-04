import type { GalleryPhoto, PhotoRotation } from '../types/photo';

export const normalizeRotation = (angle: number): PhotoRotation =>
  (((angle % 360) + 360) % 360) as PhotoRotation;
export const isRotationPending = (photo: GalleryPhoto) =>
  photo.rotation_status === 'pending' || photo.rotation_status === 'processing';
export const canRotatePhoto = (photo: GalleryPhoto) =>
  photo.media_type === 'image' && photo.status === 'successful';
export const isStaleRotation = (incoming: GalleryPhoto, current?: GalleryPhoto) =>
  current &&
  ((incoming.rotation_revision ?? 0) < (current.rotation_revision ?? 0) ||
    ((incoming.rotation_revision ?? 0) === (current.rotation_revision ?? 0) &&
      ((!isRotationPending(current) && isRotationPending(incoming)) ||
        (current.rotation_status === 'processing' && incoming.rotation_status === 'pending'))));

/** Only delivery thumbnails are used for optimistic previews, never full originals. */
export async function rotateThumbnail(
  src: string,
  angle: number,
  mimeType = 'image/png',
  quality?: number,
): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      image.src = '';
      reject(new Error('Rotation preview timed out'));
    }, 10000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Could not load rotation preview'));
    };
    image.src = src;
  });
  const canvas = document.createElement('canvas');
  const swap = normalizeRotation(angle) % 180 !== 0;
  canvas.width = swap ? image.naturalHeight : image.naturalWidth;
  canvas.height = swap ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create rotation preview');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
  if (!blob) throw new Error('Could not create rotation preview');
  return URL.createObjectURL(blob);
}
