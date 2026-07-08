export const DAY_PRESETS = [7, 30, 90] as const;

export const SETTINGS_SWITCH_CLASS =
  'h-8 w-12 rounded-full bg-muted/40 p-0.5 transition-colors data-checked:bg-accent';
export const SETTINGS_SWITCH_THUMB_CLASS =
  'size-7 translate-x-0 bg-white shadow-sm group-data-checked:translate-x-4';

export type HealthTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

export const healthToneClasses: Record<HealthTone, string> = {
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-border/50 bg-surface-1 text-muted dark:border-white/10 dark:bg-white/[0.035]',
  accent: 'border-accent/25 bg-accent/10 text-accent',
};
