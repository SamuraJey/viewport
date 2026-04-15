import type { ComponentProps, ReactNode } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AppListboxOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

interface AppListboxProps<TValue extends string> {
  value: TValue;
  onChange: (value: TValue) => void;
  options: AppListboxOption<TValue>[];
  className?: string;
  buttonClassName?: string | ((open: boolean) => string);
  optionsClassName?: string;
  optionClassName?:
    | string
    | ((state: { focus: boolean; selected: boolean; disabled: boolean }) => string);
  buttonContent?: (
    selectedOption: AppListboxOption<TValue> | undefined,
    open: boolean,
  ) => ReactNode;
  startContent?: ReactNode;
  anchor?: ComponentProps<typeof ListboxOptions>['anchor'];
  disabled?: boolean;
  'aria-label'?: string;
}

export const AppListbox = <TValue extends string>({
  value,
  onChange,
  options,
  className,
  buttonClassName,
  optionsClassName,
  optionClassName,
  buttonContent,
  startContent,
  anchor = 'bottom start',
  disabled = false,
  'aria-label': ariaLabel,
}: AppListboxProps<TValue>) => {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      {({ open }) => (
        <div className={cn('relative', className)}>
          <ListboxButton
            aria-label={ariaLabel}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-surface-dark',
              typeof buttonClassName === 'function' ? buttonClassName(open) : buttonClassName,
            )}
          >
            {buttonContent ? (
              buttonContent(selectedOption, open)
            ) : (
              <>
                {startContent ? <span className="shrink-0">{startContent}</span> : null}
                <span className="min-w-0 flex-1 truncate">{selectedOption?.label}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted transition-transform duration-200',
                    open && 'rotate-180',
                  )}
                />
              </>
            )}
          </ListboxButton>

          <ListboxOptions
            anchor={anchor}
            transition
            className={cn(
              'z-30 max-h-72 overflow-auto rounded-xl border border-border/50 bg-surface p-1 shadow-lg outline-none transition duration-150 ease-out [--anchor-gap:0.5rem] data-closed:scale-95 data-closed:opacity-0 dark:border-border/40 dark:bg-surface-dark-1',
              optionsClassName,
            )}
            style={{
              minWidth: 'var(--button-width)',
              width: 'max-content',
              maxWidth: 'min(24rem, calc(100vw - 2rem))',
            }}
          >
            {options.map((option) => (
              <ListboxOption key={option.value} value={option.value} disabled={option.disabled}>
                {({ focus, selected, disabled: optionDisabled }) => (
                  <div
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-text transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-50',
                      focus && 'bg-accent/10 text-text',
                      selected && 'bg-accent/12 text-accent',
                      typeof optionClassName === 'function'
                        ? optionClassName({ focus, selected, disabled: optionDisabled })
                        : optionClassName,
                    )}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 text-accent transition-opacity',
                        selected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium whitespace-nowrap">{option.label}</div>
                      {option.description ? (
                        <div className="mt-0.5 text-xs text-muted whitespace-normal">
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      )}
    </Listbox>
  );
};

export type { AppListboxOption };
