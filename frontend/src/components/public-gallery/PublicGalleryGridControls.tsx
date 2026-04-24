import { Maximize2, Minimize2 } from 'lucide-react';
import type { PublicGridDensity, PublicGridLayout } from '../../hooks/usePublicGalleryGrid';

interface PublicGalleryGridControlsProps {
  gridLayout: PublicGridLayout;
  gridDensity: PublicGridDensity;
  onLayoutChange: (mode: PublicGridLayout) => void;
  onDensityChange: (mode: PublicGridDensity) => void;
}

const inactiveLabelClass = 'text-text/80';
const mobileControlLabelClass = 'text-[11px] font-bold uppercase tracking-[0.18em] text-muted';

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

const layoutOptions: SegmentedOption<PublicGridLayout>[] = [
  { value: 'masonry', label: 'Masonry' },
  { value: 'uniform', label: 'Uniform' },
];

const densityOptions: SegmentedOption<PublicGridDensity>[] = [
  { value: 'large', label: 'Large', icon: 'maximize' },
  { value: 'compact', label: 'Compact', icon: 'minimize' },
];

const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  activeLayoutId,
  size,
}: SegmentedControlProps<T>) => {
  const wrapperClass =
    size === 'desktop'
      ? 'inline-flex overflow-hidden rounded-xl border border-border/40 bg-surface/70'
      : 'inline-flex overflow-hidden rounded-lg border border-border/40 bg-surface/60';

  const buttonClass =
    size === 'desktop' ? 'px-4 py-2 text-sm font-medium' : 'px-3 py-1.5 text-xs font-medium';

  return (
    <div className={wrapperClass}>
      {options.map((option, index) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative flex items-center gap-2 transition-all duration-200 hover:bg-surface-2/50 ${buttonClass} ${index > 0 ? 'border-l border-border/50' : ''}`}
            aria-pressed={isActive}
          >
            {isActive && (
              <div
                className="absolute inset-0 bg-accent shadow-sm"
                data-layout-id={activeLayoutId}
              />
            )}
            {option.icon === 'maximize' && (
              <Maximize2
                className={`relative z-10 h-4 w-4 ${isActive ? 'text-accent-foreground' : inactiveLabelClass}`}
              />
            )}
            {option.icon === 'minimize' && (
              <Minimize2
                className={`relative z-10 h-4 w-4 ${isActive ? 'text-accent-foreground' : inactiveLabelClass}`}
              />
            )}
            <span
              className={`relative z-10 ${isActive ? 'font-semibold text-accent-foreground' : inactiveLabelClass}`}
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
  return (
    <>
      <div className="hidden items-center gap-6 md:flex" aria-label="Grid controls">
        <div className="flex items-center gap-3" aria-label="Layout controls">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Layout</span>
          <SegmentedControl
            value={gridLayout}
            options={layoutOptions}
            onChange={onLayoutChange}
            activeLayoutId="layout-active"
            size="desktop"
          />
        </div>

        <div className="flex items-center gap-3" aria-label="Grid density controls">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Grid size</span>
          <SegmentedControl
            value={gridDensity}
            options={densityOptions}
            onChange={onDensityChange}
            activeLayoutId="density-active"
            size="desktop"
          />
        </div>
      </div>

      <div className="space-y-3 md:hidden" aria-label="Mobile grid controls">
        <p className="text-xs font-medium text-muted">
          Pinch with two fingers to switch grid size.
        </p>

        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <span className={mobileControlLabelClass}>Layout</span>
            <SegmentedControl
              value={gridLayout}
              options={layoutOptions}
              onChange={onLayoutChange}
              activeLayoutId="mobile-layout-active"
              size="mobile"
            />
          </div>

          <div className="space-y-2">
            <span className={mobileControlLabelClass}>Grid size</span>
            <SegmentedControl
              value={gridDensity}
              options={densityOptions}
              onChange={onDensityChange}
              activeLayoutId="mobile-density-active"
              size="mobile"
            />
          </div>
        </div>
      </div>
    </>
  );
};
