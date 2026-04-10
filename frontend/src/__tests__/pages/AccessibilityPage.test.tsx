import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AccessibilityPage } from '../../pages/AccessibilityPage';

describe('AccessibilityPage', () => {
  it('renders accessibility guidance and low-vision information', () => {
    render(
      <MemoryRouter>
        <AccessibilityPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /accessibility in viewport/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /low-vision mode/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(document.title).toBe('Accessibility · Viewport');
  });
});
