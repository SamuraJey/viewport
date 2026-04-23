import { motion, type Variants } from 'framer-motion';
import { Camera, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface CollectionCardProps {
  body: ReactNode;
  bodyClassName?: string;
  cover: ReactNode;
  coverClassName?: string;
  interactiveOverlay?: ReactNode;
  shellClassName?: string;
  topOverlay?: ReactNode;
  topRightOverlay?: ReactNode;
  variants?: Variants;
}

const DEFAULT_SHELL_CLASSNAME =
  'group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-card-border bg-surface text-left shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-xl dark:bg-surface-dark';

export const CollectionPhotoBadge = ({ count }: { count: number }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
    <Camera className="h-3.5 w-3.5" />
    {count} photos
  </span>
);

export const CollectionShareBadge = ({ label = 'Public' }: { label?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
    <Link2 className="h-3.5 w-3.5" />
    {label}
  </span>
);

export const CollectionCard = ({
  body,
  bodyClassName = 'flex flex-1 flex-col justify-between gap-4 p-5',
  cover,
  coverClassName = 'relative h-52 overflow-hidden bg-surface-2 dark:bg-surface-dark-2',
  interactiveOverlay,
  shellClassName = DEFAULT_SHELL_CLASSNAME,
  topOverlay,
  topRightOverlay,
  variants,
}: CollectionCardProps) => {
  return (
    <motion.div layout variants={variants} exit="exit" className={shellClassName}>
      {interactiveOverlay}
      <div className={coverClassName}>
        {cover}
        {topOverlay ? (
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2">{topOverlay}</div>
        ) : null}
        {topRightOverlay ? (
          <div className="absolute right-3 top-3 z-30 flex gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
            {topRightOverlay}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>{body}</div>
    </motion.div>
  );
};
