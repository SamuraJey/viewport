import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
  <div className="rounded-3xl border border-border/60 bg-surface/95 p-7 shadow-2xl shadow-surface-foreground/10 backdrop-blur-xl dark:border-white/10 dark:bg-surface-dark/95 sm:p-9">
    <div className="text-center mb-10">
      <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-accent/20 ring-4 ring-accent/10">
        <Camera className="h-7 w-7 text-white" />
      </div>
      <h2 className="font-oswald text-3xl sm:text-4xl font-bold uppercase tracking-wider text-text mb-3">
        {title}
      </h2>
      <p className="text-muted font-cuprum text-lg">{subtitle}</p>
    </div>
    {children}
  </div>
);
