# Persistent photo rotation

Private gallery owners can rotate an image clockwise or counterclockwise from the compact action dock on its photo card. Rotation changes the stored original file, not only the browser presentation, so private downloads, public-share downloads, and ZIP exports carry the new orientation after processing completes.

## Request and processing flow

`POST /galleries/{gallery_id}/photos/{photo_id}/rotate` accepts:

```json
{ "direction": "clockwise" }
```

The same endpoint accepts `counterclockwise`; both directions are exposed in the owner UI. Only successful JPEG and PNG image records are eligible; videos and an already-processing photo are rejected. The endpoint atomically changes the photo to `processing`, enqueues `rotate_photo`, and returns `202` with the current photo response.

The Celery task:

1. streams the compressed original from S3 into a temporary file;
2. composes JPEG EXIF Orientation without decoding or re-encoding JPEG scan data; PNG pixels are rotated losslessly through libvips;
3. saves a new versioned original in the same format and creates a new AVIF thumbnail;
4. checks any positive file-size delta against the owner's available quota;
5. atomically switches `photos.object_key`, thumbnail key, dimensions, file size, and status;
6. deletes the superseded original and thumbnail.

The versioned object key makes retries idempotent. The old database keys remain authoritative until both replacement objects exist, so a failed transform leaves the original intact. JPEG compressed image data is copied byte-for-byte and ExifTool updates only the Orientation metadata; repeated turns are composed with the existing orientation, including mirrored EXIF states. PNG rotation remains lossless. JPEG display depends on the consuming application honoring EXIF Orientation, as modern browsers and photo viewers do.

## Download consistency

While the photo is `processing`, single-photo and private ZIP downloads return `409` instead of serving the previous orientation. Public listing and download queries already expose only `successful` photos. Once the database switches to the new versioned key, every download path resolves the rotated stored original.

The owner gallery polls only the IDs it initiated until each rotation finishes, refreshes the changed thumbnail and dimensions, and reports either success or the worker's safe failure message.
