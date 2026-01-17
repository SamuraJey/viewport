import type { ReactNode } from 'react';
import { ThemeSwitch } from './ThemeSwitch';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="auth-layout min-h-screen bg-linear-to-br from-surface to-surface-1 dark:from-surface-dark dark:to-surface-dark-1 flex items-center justify-center p-4">
      {/* Shared ThemeToggle */}
      <ThemeSwitch />

      {children}
    </div>
  );
};
