import type {
  SelectionConfigUpdateRequest,
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
} from '../../../types';

export type ShareLinkSettingsMode = 'create' | 'edit';
export type TtlPreset = 'none' | '24h' | '7d' | '30d' | 'custom';
export type SettingsTabId = 'setup' | 'link' | 'access' | 'selection' | 'review';
export type PasswordMode = 'none' | 'keep' | 'set' | 'clear';

export interface EditableShareLink {
  id: string;
  label?: string | null;
  is_active?: boolean;
  expires_at: string | null;
  has_password?: boolean;
}

export interface SelectionSettingsDraft {
  is_enabled: boolean;
  list_title: string;
  limit_enabled: boolean;
  limit_value: string;
  allow_photo_comments: boolean;
  require_email: boolean;
  require_phone: boolean;
  require_client_note: boolean;
}

export interface ShareLinkSettingsModalProps {
  isOpen: boolean;
  mode: ShareLinkSettingsMode;
  galleryName?: string | null;
  link?: EditableShareLink | null;
  showSelectionSettings?: boolean;
  onClose: () => void;
  onCreate?: (payload: ShareLinkCreateRequest) => Promise<ShareLink>;
  onSave?: (payload: ShareLinkUpdateRequest) => Promise<void>;
  onSaveSelectionConfig?: (
    shareLinkId: string,
    payload: SelectionConfigUpdateRequest,
  ) => Promise<unknown>;
  onManageCreated?: (shareLinkId: string) => void;
}
