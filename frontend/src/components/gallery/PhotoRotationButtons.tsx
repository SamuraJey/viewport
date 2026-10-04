import { RotateCcw, RotateCw } from 'lucide-react';

interface Props {
  onRotate: (direction: -90 | 90) => void;
  disabled?: boolean;
  className?: string;
  labelSuffix?: string;
}

export function PhotoRotationButtons({
  onRotate,
  disabled,
  className = '',
  labelSuffix = 'photo',
}: Props) {
  return (
    <>
      {([-90, 90] as const).map((direction) => {
        const label = `Rotate ${labelSuffix} ${direction === 90 ? 'clockwise' : 'counterclockwise'} 90°`;
        const Icon = direction === 90 ? RotateCw : RotateCcw;
        return (
          <button
            key={direction}
            type="button"
            disabled={disabled}
            aria-label={label}
            title={label}
            onClick={(event) => {
              event.stopPropagation();
              onRotate(direction);
            }}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </>
  );
}
