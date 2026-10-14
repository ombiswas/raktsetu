import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal.js';
import { Button } from '../Button.js';

describe('Modal Primitive (Accessibility & Focus Management)', () => {
  it('renders modal dialog with aria-modal and accessible labeling when open', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Confirm Blood Unit Request"
        description="This will dispatch emergency alerts to eligible nearby donors."
      >
        <p>Modal Body Content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: /confirm blood unit request/i })).toBeInTheDocument();
    expect(
      screen.getByText(/this will dispatch emergency alerts to eligible nearby donors/i)
    ).toBeInTheDocument();
  });

  it('invokes onClose when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test Dialog">
        <button type="button">Inner Action</button>
      </Modal>
    );

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus inside the dialog with Tab navigation', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <Modal
        isOpen={true}
        onClose={handleClose}
        title="Focus Trap Dialog"
        footer={
          <>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary">Confirm</Button>
          </>
        }
      >
        <input data-testid="test-input" placeholder="Enter notes" />
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    const input = screen.getByTestId('test-input');
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });

    // Focus close button initially
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Tab forwards
    await user.tab();
    expect(document.activeElement).toBe(input);

    await user.tab();
    expect(document.activeElement).toBe(cancelBtn);

    await user.tab();
    expect(document.activeElement).toBe(confirmBtn);

    // Tab from last element wraps around to first focusable element (close button)
    await user.tab();
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab backwards wraps around to last element
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirmBtn);
  });
});
