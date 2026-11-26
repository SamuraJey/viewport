import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
  <div className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm dark:bg-surface-dark sm:p-9">
    <div className="mb-7 border-b border-border/50 pb-6">
      <h1 className="mb-2 font-oswald text-4xl font-bold tracking-tight text-text">{title}</h1>
      <p className="text-muted text-lg">{subtitle}</p>
    </div>
    {children}
  </div>
);
