import { motion } from 'framer-motion';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';

interface PublicGalleryGridControlsProps {
  gridLayout: PublicGridLayout;
  gridDensity: PublicGridDensity;
  onLayoutChange: (mode: PublicGridLayout) => void;
  onDensityChange: (mode: PublicGridDensity) => void;
}

const inactiveLabelClass = 'text-text/80 dark:text-accent-foreground/80';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: 'maximize' | 'minimize';
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  activeLayoutId: string;
  size: 'desktop' | 'mobile';
}

const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  activeLayoutId,
  size,
}: SegmentedControlProps<T>) => {
  const wrapperClass =
    size === 'desktop'
      ? 'inline-flex rounded-lg border border-border overflow-hidden shadow-sm'
      : 'inline-flex rounded-md border border-border overflow-hidden';

  const buttonClass = size === 'desktop' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';

  return (
    <div className={wrapperClass}>
      {options.map((option, index) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative flex items-center gap-2 transition-colors ${buttonClass} ${index > 0 ? 'border-l border-border' : ''}`}
            aria-pressed={isActive}
          >
            {isActive && (
              <motion.div
                layoutId={activeLayoutId}
                className="absolute inset-0 bg-accent"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            {option.icon === 'maximize' && (
              <Maximize2
                className={`relative z-10 w-4 h-4 ${isActive ? 'text-accent-foreground' : inactiveLabelClass}`}
              />
            )}
            {option.icon === 'minimize' && (
              <Minimize2
                className={`relative z-10 w-4 h-4 ${isActive ? 'text-accent-foreground' : inactiveLabelClass}`}
              />
            )}
            <span
              className={`relative z-10 ${isActive ? 'text-accent-foreground' : inactiveLabelClass}`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const PublicGalleryGridControls = ({
  gridLayout,
  gridDensity,
  onLayoutChange,
  onDensityChange,
}: PublicGalleryGridControlsProps) => {
  const layoutOptions: SegmentedOption<PublicGridLayout>[] = [
    { value: 'masonry', label: 'Masonry' },
    { value: 'uniform', label: 'Uniform' },
  ];

  const densityOptions: SegmentedOption<PublicGridDensity>[] = [
    { value: 'large', label: 'Large', icon: 'maximize' },
    { value: 'compact', label: 'Compact', icon: 'minimize' },
  ];

  return (
    <>
      <div className="hidden md:flex items-center gap-4" aria-label="Grid controls">
        <div className="flex items-center gap-2" aria-label="Layout controls">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Layout
          </span>
          <SegmentedControl
            value={gridLayout}
            options={layoutOptions}
            onChange={onLayoutChange}
            activeLayoutId="layout-active"
            size="desktop"
          />
        </div>

        <div className="flex items-center gap-2" aria-label="Grid density controls">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Grid size
          </span>
          <SegmentedControl
            value={gridDensity}
            options={densityOptions}
            onChange={onDensityChange}
            activeLayoutId="density-active"
            size="desktop"
          />
        </div>
      </div>

      <div className="md:hidden text-xs text-muted mb-4">
        Pinch with two fingers to switch grid size. Use the controls below to change layout.
      </div>

      <div
        className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4"
        aria-label="Mobile grid controls"
      >
        <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Layout
          </span>
          <SegmentedControl
            value={gridLayout}
            options={layoutOptions}
            onChange={onLayoutChange}
            activeLayoutId="mobile-layout-active"
            size="mobile"
          />
        </div>

        <div className="flex items-center gap-2 justify-between rounded-lg border border-border px-3 py-2 bg-surface/60">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Grid size
          </span>
          <SegmentedControl
            value={gridDensity}
            options={densityOptions}
            onChange={onDensityChange}
            activeLayoutId="mobile-density-active"
            size="mobile"
          />
        </div>
      </div>
    </>
  );
};
