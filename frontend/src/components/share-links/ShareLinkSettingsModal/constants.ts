import { FileText, Sparkles, Timer, Users } from 'lucide-react';
import type { SelectionSettingsDraft, SettingsTabId, TtlPreset } from './types';

export const TTL_OPTIONS: { value: TtlPreset; label: string; description: string }[] = [
  { value: 'none', label: 'No expiration', description: 'The link stays available until paused' },
  { value: '24h', label: '24 hours', description: 'Short review window' },
  { value: '7d', label: '7 days', description: 'Client delivery default' },
  { value: '30d', label: '30 days', description: 'Longer campaign access' },
  { value: 'custom', label: 'Custom date', description: 'Pick an exact UTC time' },
];
export const SHARE_LINK_PASSWORD_MIN_LENGTH = 8;
export const SHARE_LINK_PASSWORD_MAX_BYTES = 72;

export const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  Icon: typeof FileText;
  createOnly?: boolean;
}[] = [
  { id: 'link', label: 'Link', Icon: FileText },
  { id: 'access', label: 'Access', Icon: Timer },
  { id: 'selection', label: 'Selection', Icon: Users, createOnly: true },
  { id: 'review', label: 'Review', Icon: Sparkles },
];

export const DEFAULT_SELECTION_DRAFT: SelectionSettingsDraft = {
  is_enabled: false,
  list_title: 'Selected photos',
  limit_enabled: false,
  limit_value: '',
  allow_photo_comments: false,
  require_email: false,
  require_phone: false,
  require_client_note: false,
};

export const SETTINGS_SWITCH_CLASS =
  'h-7 w-12 rounded-full bg-muted/40 p-0.5 transition-colors data-checked:bg-accent data-disabled:opacity-50';
export const SETTINGS_SWITCH_THUMB_CLASS =
  'size-6 translate-x-0 bg-white shadow-sm group-data-checked:translate-x-5';
