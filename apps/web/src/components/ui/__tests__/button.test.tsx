import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button.js';

describe('Button Primitive', () => {
  it('renders primary white-filled pill button by default', () => {
    render(<Button>Submit Request</Button>);
    const btn = screen.getByRole('button', { name: /submit request/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('btn-primary');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('renders outline pill and small outline variants', () => {
    const { rerender } = render(<Button variant="outline">Secondary Action</Button>);
    const btn = screen.getByRole('button', { name: /secondary action/i });
    expect(btn.className).toContain('btn-outline');

    rerender(<Button variant="outline-sm">Small Filter</Button>);
    expect(btn.className).toContain('btn-outline-sm');
  });

  it('handles loading state with spinner and disables button', () => {
    render(<Button isLoading>Processing</Button>);
    const btn = screen.getByRole('button', { name: /processing/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('invokes onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    const btn = screen.getByRole('button', { name: /click me/i });
    await user.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
