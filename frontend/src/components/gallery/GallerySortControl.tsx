import type { RefObject } from 'react';
import { ArrowUpDown, Check, ChevronDown, Globe, LoaderCircle } from 'lucide-react';
import { AppPopover } from '../ui/AppPopover';

interface GallerySortControlProps {
  label: string;
  ariaLabel: string;
  description: string;
  value: string;
  options: { value: string; label: string; shortLabel?: string }[];
  onChange: (value: string) => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  isSaving?: boolean;
}

export const GallerySortControl = ({
  label,
  ariaLabel,
  description,
  value,
  options,
  onChange,
  buttonRef,
  isSaving,
}: GallerySortControlProps) => {
  const currentOption = options.find((option) => option.value === value);
  const currentLabel = currentOption?.label;
  const isPublic = isSaving !== undefined;
  const Icon = isPublic ? Globe : ArrowUpDown;

  return (
    <div className="min-w-0 lg:w-52">
      <AppPopover
        buttonRef={buttonRef}
        buttonAriaLabel={`${ariaLabel}: ${currentLabel}`}
        buttonClassName={(open) =>
          `flex min-h-14 w-full items-center gap-1.5 rounded-xl px-2 py-2 sm:gap-2 sm:px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            open
              ? 'bg-accent/10 text-text'
              : 'bg-surface-1 text-text hover:bg-surface-foreground dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2'
          }`
        }
        buttonContent={(open) => (
          <>
            {isSaving ? (
              <LoaderCircle aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted" />
            ) : (
              <Icon aria-hidden className="hidden h-4 w-4 shrink-0 text-muted sm:block" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{label}</span>
              <span className="block truncate text-sm font-medium leading-snug">
                {currentOption?.shortLabel ?? currentLabel}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={`h-3.5 w-3.5 shrink-0 text-muted ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
        panelFocus
        panelClassName="w-64 rounded-xl bg-surface p-1.5 shadow-lg dark:bg-surface-dark-1 [--anchor-gap:8px]"
        panel={(close) => (
          <>
            <div className="px-3 pb-3 pt-2">
              <p className="text-sm font-semibold text-text">{label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            </div>
            <div role="group" aria-label={ariaLabel}>
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={value === option.value}
                  disabled={isSaving}
                  onClick={() => {
                    if (value !== option.value) onChange(option.value);
                    close();
                  }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60 ${
                    value === option.value
                      ? 'bg-accent/10 font-semibold text-text'
                      : 'text-text hover:bg-surface-foreground dark:hover:bg-surface-dark-2'
                  } ${index > 0 && index % 2 === 0 ? 'mt-2' : ''}`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {value === option.value && <Check aria-hidden className="h-4 w-4" />}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
            {isPublic && (
              <p className="px-3 pb-2 pt-3 text-xs text-muted">Changes save automatically.</p>
            )}
          </>
        )}
      />
      {isPublic && (
        <span role="status" className="sr-only">
          {isSaving ? 'Saving public sorting...' : ''}
        </span>
      )}
    </div>
  );
};
