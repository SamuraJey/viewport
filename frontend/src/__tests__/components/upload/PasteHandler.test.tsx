import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PasteHandler } from '../../../components/upload/PasteHandler';

const dispatchPaste = (target: HTMLElement, files: File[]) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
    },
  });
  fireEvent(target, event);
  return event;
};

describe('PasteHandler', () => {
  it('adds clipboard files and prevents the browser paste action', () => {
    const onPaste = vi.fn();
    render(<PasteHandler onPaste={onPaste} />);
    const screenshot = new File(['pixels'], 'screenshot.png', { type: 'image/png' });

    const event = dispatchPaste(document.body, [screenshot]);

    expect(event.defaultPrevented).toBe(true);
    expect(onPaste).toHaveBeenCalledWith([screenshot]);
  });

  it('does not intercept paste inside editable controls', () => {
    const onPaste = vi.fn();
    const { container } = render(
      <>
        <input aria-label="Caption" />
        <PasteHandler onPaste={onPaste} />
      </>,
    );
    const screenshot = new File(['pixels'], 'screenshot.png', { type: 'image/png' });

    const event = dispatchPaste(container.querySelector('input')!, [screenshot]);

    expect(event.defaultPrevented).toBe(false);
    expect(onPaste).not.toHaveBeenCalled();
  });
});
