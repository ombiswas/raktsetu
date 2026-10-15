import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequestDetailPage } from '../RequestDetailPage.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';
import { mockMatchingStatusDegraded } from '../../../test/mocks/handlers.js';

describe('Request Detail & Live Matching Panel', () => {
  beforeEach(() => {
    setAccessToken('mock-hospital-access-token');
  });

  it('renders live matching panel with candidate counts, radar, and why this order explanation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/hospital/requests/req-alpha-123']}>
        <Routes>
          <Route path="/hospital/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial loading finishes
    await waitFor(() => {
      expect(screen.getByText('Apollo Hospital Trauma Center')).toBeInTheDocument();
    });

    // Counts grid
    expect(screen.getByText('TOTAL NOTIFIED')).toBeInTheDocument();
    expect(screen.getByText('SEARCH RADIUS')).toBeInTheDocument();

    // Radar candidates
    expect(screen.getByText(/Candidate c-001/i)).toBeInTheDocument();
    expect(screen.getByText(/Candidate c-002/i)).toBeInTheDocument();

    // Algorithm & Model version
    expect(screen.getByText('HYBRID CALIBRATED ML')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();

    // Expand "Why this order?" for candidate 1
    const expandButtons = screen.getAllByRole('button', { name: /why this order\?/i });
    const firstButton = expandButtons[0];
    expect(firstButton).toBeDefined();
    if (firstButton) {
      await user.click(firstButton);
    }

    // Model Output label and score
    expect(screen.getByText(/MODEL OUTPUT \(SIMULATION\)/i)).toBeInTheDocument();
    expect(screen.getByText(/88.4% \(0.8842\)/i)).toBeInTheDocument();
  });

  it('renders prominent degraded mode notice when matching run falls back to proximity', async () => {
    // Override matching endpoint to return degraded run
    server.use(
      http.get('/api/v1/requests/:id/matching', () => {
        return HttpResponse.json(mockMatchingStatusDegraded);
      })
    );

    render(
      <MemoryRouter initialEntries={['/hospital/requests/req-alpha-123']}>
        <Routes>
          <Route path="/hospital/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/DEGRADED MODE ACTIVE: PROXIMITY FALLBACK/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/fell back to deterministic proximity ranking because the machine learning inference service is currently unavailable/i)
    ).toBeInTheDocument();

    expect(screen.getByText('DEGRADED PROXIMITY')).toBeInTheDocument();
    expect(screen.getByText('None (Proximity Baseline)')).toBeInTheDocument();
  });
});
