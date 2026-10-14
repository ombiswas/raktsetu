import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/AuthContext.js';
import { DonorProfileCard } from '../DonorProfileCard.js';
import { DonorAvailabilityCard } from '../DonorAvailabilityCard.js';
import { DonationHistoryCard } from '../DonationHistoryCard.js';
import { mockDonorProfile } from '../../../test/mocks/handlers.js';

describe('Donor Dashboard & Clinical Constraints', () => {
  it('renders donor profile card with immutable blood group and editable weight', async () => {
    const user = userEvent.setup();
    const handleUpdated = vi.fn();

    render(
      <MemoryRouter>
        <AuthProvider>
          <DonorProfileCard profile={mockDonorProfile} onProfileUpdated={handleUpdated} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('O+')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Aarav Patel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('68')).toBeInTheDocument();

    const weightInput = screen.getByLabelText(/body weight/i);
    await user.clear(weightInput);
    await user.type(weightInput, '72');

    const saveBtn = screen.getByRole('button', { name: /save profile changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(handleUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          weightKg: 72
        })
      );
    });
  });

  it('toggles donor availability status and calls API', async () => {
    const user = userEvent.setup();
    const handleUpdated = vi.fn();

    render(
      <MemoryRouter>
        <AuthProvider>
          <DonorAvailabilityCard profile={mockDonorProfile} onProfileUpdated={handleUpdated} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/ready for dispatch/i)).toBeInTheDocument();
    expect(screen.getByText(/statutory 90-day cooldown satisfied/i)).toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /pause availability/i });
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(handleUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          isAvailable: false
        })
      );
    });

    expect(await screen.findByText(/dispatch paused/i)).toBeInTheDocument();
  });

  it('renders verified donation history with DataTable headers', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <DonationHistoryCard />
        </AuthProvider>
      </MemoryRouter>
    );

    // Header cells
    expect(await screen.findByText('BLOOD BANK / FACILITY')).toBeInTheDocument();
    expect(screen.getByText('UNITS')).toBeInTheDocument();

    // Data rows from MSW mock
    expect(await screen.findByText('Rotary Blood Bank Central')).toBeInTheDocument();
    expect(screen.getByText('1 unit(s)')).toBeInTheDocument();
  });
});
