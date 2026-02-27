import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
  <div className="bg-surface dark:bg-surface-foreground/95 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-2xl border border-border/50 dark:border-white/5">
    <div className="text-center mb-10">
      <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-accent/20 rotate-3 hover:rotate-0 transition-transform duration-300">
        <Camera className="h-7 w-7 text-white" />
      </div>
      <h2 className="font-oswald text-3xl sm:text-4xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground mb-3">
        {title}
      </h2>
      <p className="text-muted dark:text-muted-foreground font-cuprum text-lg">{subtitle}</p>
    </div>
    {children}
  </div>
);
