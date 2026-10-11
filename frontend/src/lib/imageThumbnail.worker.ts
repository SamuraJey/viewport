// Each worker receives one job at a time from the shared two-slot scheduler.
// File blobs are cloned as handles; originals are never converted to base64.
self.onmessage = async (event: MessageEvent<{ file: File; maxDimension: number }>) => {
  const { file, maxDimension } = event.data;
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: maxDimension,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });
    // Resize the decoded bitmap for portraits instead of decoding the original twice.
    if (bitmap.height > maxDimension) {
      const portrait = await createImageBitmap(bitmap, {
        resizeHeight: maxDimension,
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = portrait;
    }
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No thumbnail canvas context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    bitmap = undefined;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    self.postMessage({ blob });
  } catch {
    self.postMessage({ blob: null });
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
};
