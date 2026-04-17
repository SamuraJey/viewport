import type { ShareLinkUpdateRequest } from '../../types';
import { ShareLinkSettingsModal } from './ShareLinkSettingsModal';

interface EditableShareLink {
  id: string;
  label?: string | null;
  is_active?: boolean;
  expires_at: string | null;
}

interface ShareLinkEditorModalProps {
  isOpen: boolean;
  link: EditableShareLink | null;
  onClose: () => void;
  onSave: (payload: ShareLinkUpdateRequest) => Promise<void>;
}

export const ShareLinkEditorModal = ({
  isOpen,
  link,
  onClose,
  onSave,
}: ShareLinkEditorModalProps) => {
  if (!isOpen || !link) {
    return null;
  }

  return (
    <ShareLinkSettingsModal
      isOpen={isOpen}
      mode="edit"
      link={link}
      showSelectionSettings={false}
      onClose={onClose}
      onSave={onSave}
    />
  );
};
