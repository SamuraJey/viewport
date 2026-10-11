import { isImageUploadFile } from '../constants/upload';

export interface ThumbnailResult {
  url: string | null;
  cleanup: () => void;
}

const emptyResult = (): ThumbnailResult => ({ url: null, cleanup: () => {} });
const MAX_CONCURRENT_PREVIEWS = 2;
interface PreviewTask {
  file: File;
  maxDimension: number;
  signal?: AbortSignal;
  resolve: (result: ThumbnailResult) => void;
  onAbort: () => void;
}
const pending: PreviewTask[] = [];
const workers: (Worker | undefined)[] = Array.from({ length: MAX_CONCURRENT_PREVIEWS });
const busy = new Set<number>();
// Cache compressed derivatives, never original-file URLs or decoded rasters.
// Revisiting a virtual row reuses its preview, with a fixed session memory bound.
type CachedPreview = { dimension: number; blob: Blob | null };
const cache = new WeakMap<File, CachedPreview>();
const recent = new Set<CachedPreview>();
const MAX_CACHED_PREVIEWS = 64;

async function thumbnailWithImageElement(file: File, maxDimension: number): Promise<Blob | null> {
  const image = new Image();
  image.decoding = 'async';
  const source = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cannot decode preview'));
      image.src = source;
    });
    const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null;
  } finally {
    image.onload = image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(source);
    canvas.width = canvas.height = 0;
  }
}

async function thumbnailOnMainThread(file: File, maxDimension: number): Promise<Blob | null> {
  if (typeof createImageBitmap === 'undefined')
    return thumbnailWithImageElement(file, maxDimension);
  let bitmap: ImageBitmap | undefined;
  const canvas = document.createElement('canvas');
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: maxDimension,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });
    if (bitmap.height > maxDimension) {
      const portrait = await createImageBitmap(bitmap, {
        resizeHeight: maxDimension,
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = portrait;
    }
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    bitmap = undefined;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null;
  } finally {
    bitmap?.close();
    canvas.width = canvas.height = 0;
  }
}

function thumbnailInWorker(task: PreviewTask, slot: number): Promise<Blob | null> | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const worker = (workers[slot] ??= new Worker(
      new URL('./imageThumbnail.worker.ts', import.meta.url),
      { type: 'module' },
    ));
    return new Promise((resolve) => {
      const timeout = setTimeout(() => fail(), 15000);
      const finish = (blob: Blob | null) => {
        clearTimeout(timeout);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        resolve(blob);
      };
      const fail = () => {
        worker.terminate();
        workers[slot] = undefined;
        finish(null);
      };
      worker.onmessage = (event: MessageEvent<{ blob: Blob | null }>) => finish(event.data.blob);
      worker.onerror = fail;
      worker.onmessageerror = fail;
      try {
        worker.postMessage({ file: task.file, maxDimension: task.maxDimension });
      } catch {
        fail();
      }
    });
  } catch {
    return null;
  }
}

async function runTask(task: PreviewTask, slot: number) {
  busy.add(slot);
  try {
    const workerResult = thumbnailInWorker(task, slot);
    const blob =
      (workerResult && (await workerResult)) ??
      (task.signal?.aborted ? null : await thumbnailOnMainThread(task.file, task.maxDimension));
    if (task.signal?.aborted) {
      task.resolve(emptyResult());
    } else {
      if (blob) {
        const previous = cache.get(task.file);
        if (previous) recent.delete(previous);
        const cached = { dimension: task.maxDimension, blob };
        cache.set(task.file, cached);
        recent.add(cached);
        while (recent.size > MAX_CACHED_PREVIEWS) {
          const oldest = recent.values().next().value!;
          oldest.blob = null;
          recent.delete(oldest);
        }
      }
      // Older browsers/corrupt files retain the established native-image fallback.
      const url = URL.createObjectURL(blob ?? task.file);
      task.resolve({ url, cleanup: () => URL.revokeObjectURL(url) });
    }
  } finally {
    task.signal?.removeEventListener('abort', task.onAbort);
    busy.delete(slot);
    drain();
  }
}

function drain() {
  for (let slot = 0; slot < MAX_CONCURRENT_PREVIEWS && pending.length; slot++) {
    if (busy.has(slot)) continue;
    const task = pending.shift()!;
    if (task.signal?.aborted) {
      task.signal.removeEventListener('abort', task.onAbort);
      task.resolve(emptyResult());
      slot--;
      continue;
    }
    void runTask(task, slot);
  }
}

/** Bounded, off-main-thread previews with cancellation of queued work. */
export function createImageThumbnail(
  file: File,
  maxDimension = 400,
  signal?: AbortSignal,
): Promise<ThumbnailResult> {
  if (!isImageUploadFile(file) || signal?.aborted) return Promise.resolve(emptyResult());
  const cached = cache.get(file);
  if (cached?.blob && cached.dimension === maxDimension) {
    recent.delete(cached);
    recent.add(cached);
    const url = URL.createObjectURL(cached.blob);
    return Promise.resolve({ url, cleanup: () => URL.revokeObjectURL(url) });
  }
  return new Promise((resolve) => {
    const task: PreviewTask = {
      file,
      maxDimension,
      signal,
      resolve,
      onAbort: () => {
        const index = pending.indexOf(task);
        if (index < 0) return; // Active work retains its slot until its resources are released.
        pending.splice(index, 1);
        signal?.removeEventListener('abort', task.onAbort);
        resolve(emptyResult());
      },
    };
    signal?.addEventListener('abort', task.onAbort, { once: true });
    pending.push(task);
    drain();
  });
}
