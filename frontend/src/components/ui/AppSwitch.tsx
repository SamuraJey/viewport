import type { ReactNode } from 'react';
import { Switch } from '@headlessui/react';
import { cn } from '../../lib/utils';

interface AppSwitchRenderState {
  checked: boolean;
  disabled: boolean;
}

interface AppSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  thumbClassName?: string;
  showThumb?: boolean;
  children?: ReactNode | ((state: AppSwitchRenderState) => ReactNode);
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export const AppSwitch = ({
  checked,
  onChange,
  disabled = false,
  className,
  thumbClassName,
  showThumb = true,
  children,
  ...ariaProps
}: AppSwitchProps) => (
  <Switch
    checked={checked}
    onChange={onChange}
    disabled={disabled}
    className={cn('group inline-flex items-center', className)}
    {...ariaProps}
  >
    {typeof children === 'function' ? children({ checked, disabled }) : children}
    {showThumb ? (
      <span
        aria-hidden="true"
        className={cn(
          'size-4 translate-x-1 rounded-full bg-white transition group-data-checked:translate-x-6',
          thumbClassName,
        )}
      />
    ) : null}
  </Switch>
);
