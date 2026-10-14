import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/AuthContext.js';
import { LocationConsentCard } from '../LocationConsentCard.js';
import { mockDonorProfile } from '../../../test/mocks/handlers.js';

describe('Location Consent & Coarse Map Privacy Gating', () => {
  const getCurrentPositionMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global.navigator, 'geolocation', {
      writable: true,
      value: {
        getCurrentPosition: getCurrentPositionMock
      }
    });
  });

  it('does NOT trigger geolocation automatically on mount', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LocationConsentCard profile={mockDonorProfile} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(screen.getByText(/transparency disclosure & consent notice/i)).toBeInTheDocument();
  });

  it('enforces explicit consent gating: button is disabled until consent checkbox is checked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <LocationConsentCard profile={{ ...mockDonorProfile, hasLocation: false }} />
        </AuthProvider>
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole('button', { name: /save location with explicit consent/i });
    expect(submitBtn).toBeDisabled();

    const consentCheckbox = screen.getByRole('checkbox', {
      name: /i give explicit, informed consent for raktsetu to store my approximate coordinates/i
    });

    await user.click(consentCheckbox);
    expect(submitBtn).toBeEnabled();
  });

  it('triggers browser geolocation strictly when the user clicks the GPS button', async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((success) => {
      success({
        coords: {
          latitude: 28.5355,
          longitude: 77.391,
          accuracy: 10
        }
      });
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <LocationConsentCard profile={mockDonorProfile} />
        </AuthProvider>
      </MemoryRouter>
    );

    const gpsBtn = screen.getByRole('button', { name: /acquire via device gps/i });
    await user.click(gpsBtn);

    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/gps coordinates acquired from your device/i)).toBeInTheDocument();
  });

  it('submits location and displays coarse privacy circle without exact pinpoint marker', async () => {
    const user = userEvent.setup();
    const handleSaved = vi.fn();

    render(
      <MemoryRouter>
        <AuthProvider>
          <LocationConsentCard profile={{ ...mockDonorProfile, hasLocation: false }} onLocationSaved={handleSaved} />
        </AuthProvider>
      </MemoryRouter>
    );

    const consentCheckbox = screen.getByRole('checkbox', {
      name: /i give explicit, informed consent for raktsetu to store my approximate coordinates/i
    });
    await user.click(consentCheckbox);

    const submitBtn = screen.getByRole('button', { name: /save location with explicit consent/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/geospatial location saved with explicit consent/i)).toBeInTheDocument();

    // Verify coarse privacy visualization
    const coarseView = await screen.findByTestId('coarse-circle-view');
    expect(coarseView).toBeInTheDocument();
    expect(screen.getByText('~2.5 km')).toBeInTheDocument();
    expect(
      screen.getByText(/coarse radius representation\. precise coordinates are obfuscated/i)
    ).toBeInTheDocument();
    expect(handleSaved).toHaveBeenCalled();
  });
});
