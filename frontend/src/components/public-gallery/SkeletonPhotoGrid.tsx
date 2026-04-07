const SKELETON_RATIOS = [
  '4 / 3',
  '3 / 4',
  '16 / 9',
  '1 / 1',
  '3 / 2',
  '2 / 3',
  '16 / 10',
  '5 / 7',
  '4 / 5',
  '3 / 2',
  '1 / 1',
  '4 / 3',
];

export const SkeletonPhotoGrid = () => {
  return (
    <div className="bg-surface-foreground/5 rounded-3xl p-6 sm:p-8 border border-border/50 shadow-xs">
      <div className="mb-8">
        <div className="h-8 w-56 rounded-md bg-surface-1/80 dark:bg-surface-dark-1/80 animate-pulse" />
      </div>

      <div className="pg-grid pg-grid--large" aria-label="Loading photos">
        {SKELETON_RATIOS.map((ratio, index) => (
          <div
            key={`public-skeleton-${index}`}
            className="pg-card rounded-xl shadow-xs bg-surface-1 dark:bg-surface-dark-1 animate-pulse"
            style={{ aspectRatio: ratio }}
          />
        ))}
      </div>
    </div>
  );
};
