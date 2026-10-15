import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForecastPage } from '../ForecastPage.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('Forecast Page (Plain SVG Chart & Sparse Data)', () => {
  beforeEach(() => {
    setAccessToken('mock-admin-access-token');
  });

  it('renders plain SVG line chart with historical series, forecast points, model version, and MAE', async () => {
    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('img', {
          name: /demand and forecast line chart/i
        })
      ).toBeInTheDocument();
    });

    // Model version badge and stats
    expect(screen.getByText(/MODEL v0\.1\.0-seasonal-baseline/i)).toBeInTheDocument();
    expect(screen.getByText('2.15')).toBeInTheDocument(); // MAE
    expect(screen.getByText('7')).toBeInTheDocument(); // Horizon Days

    // Simulation disclaimer
    expect(screen.getByText(/SIMULATION RESEARCH NOTICE/i)).toBeInTheDocument();
  });

  it('handles sparse data with only 1 point gracefully without SVG rendering errors', async () => {
    server.use(
      http.get('/api/v1/forecasts', () => {
        return HttpResponse.json({
          bloodGroup: 'AB-',
          component: 'plasma',
          modelVersion: 'v0.1.0-seasonal-baseline',
          mae: 1.5,
          series: [{ date: '2026-10-15', units: 5 }],
          forecast: [],
          isSimulation: true
        });
      })
    );

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('img', {
          name: /demand and forecast line chart/i
        })
      ).toBeInTheDocument();
    });
  });

  it('renders clean empty state when no historical series or forecasts are returned', async () => {
    server.use(
      http.get('/api/v1/forecasts', () => {
        return HttpResponse.json({
          bloodGroup: 'B-',
          component: 'platelets',
          modelVersion: 'v0.1.0-seasonal-baseline',
          mae: null,
          series: [],
          forecast: [],
          isSimulation: true
        });
      })
    );

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No Demand History Recorded')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/no blood requests or dispatches were found/i)
    ).toBeInTheDocument();
  });

  it('renders error state when forecast endpoint fails and allows retry', async () => {
    server.use(
      http.get('/api/v1/forecasts', () => {
        return HttpResponse.json({ error: 'Service Unavailable' }, { status: 503 });
      })
    );

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/unable to fetch forecast data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry loading/i })).toBeInTheDocument();
  });
});
