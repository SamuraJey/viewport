import { cn } from '../../lib/utils';
import { PREVIEW_STYLES } from './constants';
import type { ShareLinkPreviewProps } from './types';

export const ShareLinkPreview = ({
  index,
  title,
  source,
  projectLink,
  thumbnailUrl,
}: ShareLinkPreviewProps) => (
  <div
    className={cn(
      'relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-white/12 sm:h-[6.4rem] sm:w-29',
      thumbnailUrl
        ? 'bg-surface-2 dark:bg-white/4'
        : cn('bg-linear-to-br', PREVIEW_STYLES[index % PREVIEW_STYLES.length]),
    )}
    aria-label={`Preview for ${title}`}
    role="img"
  >
    {thumbnailUrl ? (
      <>
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-white/5" />
      </>
    ) : (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.42),transparent_24%),linear-gradient(140deg,transparent_42%,rgba(255,255,255,0.24)_43%,transparent_56%)]" />
        <div className="absolute inset-x-2 bottom-2 space-y-1 rounded-lg bg-black/28 px-2 py-1.5 text-white backdrop-blur-sm">
          <p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.14em] opacity-80">
            {projectLink ? 'Project' : 'Gallery'}
          </p>
          <p className="truncate text-xs font-bold leading-none">{source}</p>
        </div>
      </>
    )}
  </div>
);
