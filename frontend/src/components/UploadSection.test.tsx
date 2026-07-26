import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UploadSection from './UploadSection';

function renderUploadSection({ loading = false } = {}) {
  const onFileSelect = vi.fn();

  const view = render(
    <UploadSection
      onFileSelect={onFileSelect}
      onManualEntry={vi.fn()}
      resetKey={0}
      loading={loading}
    />,
  );

  return { onFileSelect, ...view };
}

function pasteImage(file: File) {
  fireEvent.paste(window, {
    clipboardData: {
      items: [
        {
          kind: 'file',
          type: file.type,
          getAsFile: () => file,
        },
      ],
    },
  });
}

function pasteText() {
  fireEvent.paste(window, {
    clipboardData: {
      items: [
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
      ],
    },
  });
}

describe('UploadSection clipboard paste', () => {
  it('selects and displays an image pasted in upload mode', () => {
    const { onFileSelect } = renderUploadSection();
    const image = new File(['image data'], 'clipboard-position.png', {
      type: 'image/png',
    });

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    pasteImage(image);

    expect(onFileSelect).toHaveBeenCalledOnce();
    expect(onFileSelect).toHaveBeenCalledWith(image);
    expect(screen.getByText('clipboard-position.png')).toBeVisible();
  });

  it('ignores a text-only paste', () => {
    const { onFileSelect } = renderUploadSection();

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    pasteText();

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/click to upload/i)).toBeVisible();
  });

  it('advertises the paste keyboard shortcuts in upload mode', () => {
    renderUploadSection();

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));

    expect(screen.getByText(/drag and drop, or paste/i)).toBeVisible();
    expect(screen.getByText('⌘ V')).toBeVisible();
    expect(screen.getByText(/Ctrl V/i)).toBeVisible();
  });

  it('only handles paste while upload mode is waiting for a file', () => {
    const { onFileSelect } = renderUploadSection();
    const beforeUpload = new File(['before'], 'before-upload.png', {
      type: 'image/png',
    });
    const selectedImage = new File(['selected'], 'selected.png', {
      type: 'image/png',
    });
    const afterSelection = new File(['after'], 'after-selection.png', {
      type: 'image/png',
    });

    pasteImage(beforeUpload);
    expect(onFileSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    pasteImage(selectedImage);
    pasteImage(afterSelection);

    expect(onFileSelect).toHaveBeenCalledOnce();
    expect(onFileSelect).toHaveBeenCalledWith(selectedImage);
    expect(screen.getByText('selected.png')).toBeVisible();
    expect(screen.queryByText('after-selection.png')).not.toBeInTheDocument();
  });

  it('ignores paste while image processing is active', () => {
    const { onFileSelect } = renderUploadSection({ loading: true });
    const image = new File(['image'], 'while-loading.png', {
      type: 'image/png',
    });

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    pasteImage(image);

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('while-loading.png')).not.toBeInTheDocument();
  });

  it('removes the paste listener after leaving or unmounting upload mode', () => {
    const firstView = renderUploadSection();
    const afterBack = new File(['back'], 'after-back.png', {
      type: 'image/png',
    });

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to options/i }));
    pasteImage(afterBack);

    expect(firstView.onFileSelect).not.toHaveBeenCalled();

    firstView.unmount();
    const secondView = renderUploadSection();
    const afterUnmount = new File(['unmount'], 'after-unmount.png', {
      type: 'image/png',
    });

    fireEvent.click(screen.getByRole('button', { name: /upload screenshot/i }));
    secondView.unmount();
    pasteImage(afterUnmount);

    expect(secondView.onFileSelect).not.toHaveBeenCalled();
  });
});
