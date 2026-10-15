import { useEffect, useId, useRef, useState } from 'react';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui/AppDialog';
import { formatFileSize } from '../../lib/utils';
import { handleApiError } from '../../lib/errorHandling';
import type { DownloadEstimate, DownloadOptions, DownloadQuality } from '../../types/download';

interface DownloadOptionsDialogProps {
  open: boolean;
  title: string;
  isArchive: boolean;
  onClose: () => void;
  loadEstimate: (includeVideos: boolean) => Promise<DownloadEstimate>;
  onDownload: (options: DownloadOptions) => Promise<void>;
  isDemo?: boolean;
}

interface EstimateResult {
  loadEstimate: DownloadOptionsDialogProps['loadEstimate'];
  includeVideos: boolean;
  retry: number;
  estimate: DownloadEstimate | null;
  error: string;
}

// Mount a fresh choice for every opening; never persist delivery preferences.
export const DownloadOptionsDialog = (props: DownloadOptionsDialogProps) =>
  props.open ? <DownloadOptionsContent {...props} /> : null;

const DownloadOptionsContent = ({
  title,
  isArchive,
  onClose,
  loadEstimate,
  onDownload,
  isDemo = false,
}: DownloadOptionsDialogProps) => {
  const [quality, setQuality] = useState<DownloadQuality>('original');
  const [includeVideos, setIncludeVideos] = useState(true);
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [retry, setRetry] = useState(0);
  const radioName = useId();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    void loadEstimate(includeVideos).then(
      (estimate) => {
        if (!current) return;
        setEstimateResult({ loadEstimate, includeVideos, retry, estimate, error: '' });
      },
      (reason: unknown) => {
        if (!current) return;
        setEstimateResult({
          loadEstimate, includeVideos, retry, estimate: null, error: handleApiError(reason).message,
        });
      },
    );
    return () => { current = false; };
  }, [includeVideos, loadEstimate, retry]);

  const loading = estimateResult === null ||
    estimateResult.loadEstimate !== loadEstimate ||
    estimateResult.includeVideos !== includeVideos ||
    estimateResult.retry !== retry;
  // Keep the available-video checkbox stable while its next estimate is in flight.
  const estimate = estimateResult?.estimate ?? null;
  const error = downloadError || (!loading ? estimateResult?.error : '') || '';

  const empty = estimate !== null && estimate.image_count + estimate.video_count === 0;
  const publicationUnavailable = estimate?.publication_size_bytes === null;
  const videoOnly = estimate !== null && estimate.image_count === 0;
  const confirmDisabled = loading || downloading || !estimate || empty ||
    (!videoOnly && quality === 'publication' && publicationUnavailable);
  const sizeLabel = (bytes: number | null | undefined) =>
    bytes === null || bytes === undefined ? 'Unavailable' : `${isArchive ? 'Approx. ' : ''}${formatFileSize(bytes)}`;

  const confirm = async () => {
    if (confirmDisabled) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await onDownload({ quality: videoOnly ? 'original' : quality, includeVideos });
      if (mounted.current) onClose();
    } catch (reason) {
      if (mounted.current) setDownloadError(handleApiError(reason).message);
    } finally {
      if (mounted.current) setDownloading(false);
    }
  };

  return (
    <AppDialog open onClose={onClose} size="sm" panelClassName="rounded-3xl bg-surface p-5 text-text shadow-xl sm:p-6">
      <AppDialogTitle className="text-xl font-semibold text-text">{title}</AppDialogTitle>
      <AppDialogDescription className="mt-2 text-sm text-muted">
        Choose the files that suit your download.
      </AppDialogDescription>
      <div className="mt-5 space-y-4" aria-busy={loading}>
        {!videoOnly ? (
          <fieldset disabled={downloading} className="space-y-2">
            <legend className="sr-only">Download quality</legend>
            {([
              ['original', 'Full size', 'Full-resolution files for printing', estimate?.original_size_bytes],
              ['publication', 'For publishing', 'JPEG · up to 2048 px · sRGB', estimate?.publication_size_bytes],
            ] as const).map(([value, label, description, bytes]) => (
              <label key={value} htmlFor={`${radioName}-${value}`} aria-label={label} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${quality === value ? 'border-accent bg-accent/5' : 'border-border/60'} ${value === 'publication' && publicationUnavailable ? 'cursor-not-allowed opacity-60' : ''}`}>
                <input id={`${radioName}-${value}`} type="radio" name={radioName} value={value} checked={quality === value}
                  aria-describedby={`${radioName}-${value}-size ${radioName}-${value}-description`}
                  disabled={value === 'publication' && publicationUnavailable}
                  onChange={() => setQuality(value)} className="mt-1 !h-4 !min-h-0 w-4 shrink-0 accent-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm font-semibold">
                    <span>{label}</span>
                    <span id={`${radioName}-${value}-size`} className="tabular-nums text-muted">{loading ? 'Estimating…' : sizeLabel(bytes)}</span>
                  </span>
                  <span id={`${radioName}-${value}-description`} className="mt-1 block text-sm text-muted">{description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {isArchive && (estimate?.available_video_count ?? 0) > 0 ? (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input type="checkbox" checked={includeVideos} disabled={downloading}
              onChange={(event) => { setDownloadError(''); setIncludeVideos(event.target.checked); }}
              className="mt-1 !h-4 !min-h-0 w-4 shrink-0 accent-accent" />
            <span className="text-sm font-semibold">Include videos
              <span className="mt-1 block font-normal text-muted">Videos are included at their original quality</span>
            </span>
          </label>
        ) : null}
        {loading ? <p role="status" aria-label="Loading download estimate" className="text-sm text-muted">Loading download estimate…</p> : null}
        {!loading && estimate && !empty ? (
          <p className="text-sm text-muted">{estimate.image_count} {estimate.image_count === 1 ? 'photo' : 'photos'} · {estimate.video_count} {estimate.video_count === 1 ? 'video' : 'videos'}{videoOnly ? ` · ${sizeLabel(estimate.original_size_bytes)}` : ''}</p>
        ) : null}
        {!loading && estimate && estimate.publication_pending_count > 0 ? (
          <p className="text-sm text-muted">{estimate.publication_pending_count} {estimate.publication_pending_count === 1 ? 'photo unavailable' : 'photos unavailable'} for publishing. Publishing files are not available yet. Full-size files remain available.</p>
        ) : null}
        {!loading && empty ? <p role="status" className="text-sm text-muted">No downloadable files</p> : null}
        {error ? (
          <div role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
            <p>{error}</p>
            {!estimate ? <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-11 underline underline-offset-4">Retry estimate</button> : null}
          </div>
        ) : null}
        {isDemo ? <p className="text-sm text-muted">Demo: sizes and archive downloads are simulated. Sample photo downloads do not demonstrate the publishing JPEG profile.</p> : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold text-text hover:bg-surface-1">Cancel</button>
        <button type="button" disabled={confirmDisabled} onClick={() => { void confirm(); }}
          className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
          {downloading ? 'Starting download…' : 'Download'}
        </button>
      </div>
    </AppDialog>
  );
};
