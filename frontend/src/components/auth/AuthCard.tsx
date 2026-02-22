import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
  <div className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-border dark:border-border/10">
    <div className="text-center mb-8">
      <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mx-auto mb-4">
        <Camera className="h-6 w-6 text-white" />
      </div>
      <h2 className="font-oswald text-3xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground mb-2">
        {title}
      </h2>
      <p className="text-muted dark:text-text font-cuprum">{subtitle}</p>
    </div>
    {children}
  </div>
);
