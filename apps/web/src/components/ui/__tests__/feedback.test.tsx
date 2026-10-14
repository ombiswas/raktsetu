import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../Toast.js';
import { EmptyState } from '../EmptyState.js';
import { Skeleton } from '../Skeleton.js';
import { Spinner } from '../Spinner.js';

describe('Feedback Primitives (Toast, EmptyState, Skeleton, Spinner)', () => {
  describe('Toast', () => {
    it('renders with status role and dismisses on button click', async () => {
      const handleDismiss = vi.fn();
      const user = userEvent.setup();

      render(
        <Toast
          title="Donor Accepted"
          description="A volunteer donor confirmed arrival in ~15 mins."
          variant="urgent"
          onDismiss={handleDismiss}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Donor Accepted')).toBeInTheDocument();

      const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i });
      await user.click(dismissBtn);
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('EmptyState', () => {
    it('renders empty state frame with eyebrow and title', () => {
      render(
        <EmptyState
          eyebrow="ZERO PENDING REQUESTS"
          title="All Clear"
          description="No open emergency blood requests match your current spatial radius."
        />
      );

      expect(screen.getByText('ZERO PENDING REQUESTS')).toBeInTheDocument();
      expect(screen.getByText('All Clear')).toBeInTheDocument();
      expect(
        screen.getByText(/no open emergency blood requests match your current spatial radius/i)
      ).toBeInTheDocument();
    });
  });

  describe('Skeleton', () => {
    it('renders status role with pulse styling', () => {
      render(<Skeleton width="100%" height={40} data-testid="test-skeleton" />);
      const skeleton = screen.getByTestId('test-skeleton');
      expect(skeleton).toHaveAttribute('role', 'status');
      expect(skeleton.className).toContain('animate-pulse');
    });
  });

  describe('Spinner', () => {
    it('renders accessible loading spinner with sr-only label', () => {
      render(<Spinner label="Calculating spatial matches" />);
      const spinner = screen.getByRole('status', { name: /calculating spatial matches/i });
      expect(spinner).toBeInTheDocument();
    });
  });
});
