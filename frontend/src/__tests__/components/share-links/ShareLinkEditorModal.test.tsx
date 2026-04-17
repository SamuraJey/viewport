import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareLinkEditorModal } from '../../../components/share-links/ShareLinkEditorModal';

describe('ShareLinkEditorModal', () => {
  it('does not render when edit mode has no link', () => {
    render(<ShareLinkEditorModal isOpen link={null} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
