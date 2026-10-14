import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../../app/AuthContext.js';
import { RespondToRequestPage } from '../RespondToRequestPage.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('Respond-to-Request Screen & Optimistic UI Flow', () => {
  it('renders request details: blood group, urgency in sunset badge, and distance band', async () => {
    render(
      <MemoryRouter initialEntries={['/donor/requests/req-alpha-123']}>
        <AuthProvider>
          <Routes>
            <Route path="/donor/requests/:id" element={<RespondToRequestPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('CRITICAL PRIORITY')).toBeInTheDocument();
    expect(screen.getByText('Apollo Hospital Trauma Center')).toBeInTheDocument();
    expect(screen.getByText('Approximate proximity: ~3.2 km distance band')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept & reveal contact/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline request/i })).toBeInTheDocument();
  });

  it('performs optimistic UI transition on Accept and records volunteer response', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/donor/requests/req-alpha-123']}>
        <AuthProvider>
          <Routes>
            <Route path="/donor/requests/:id" element={<RespondToRequestPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const acceptBtn = await screen.findByRole('button', { name: /accept & reveal contact/i });
    await user.click(acceptBtn);

    // Optimistic UI immediately reflects accepted
    expect(await screen.findByText(/contact revealed to hospital/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accepted' })).toBeDisabled();
    expect(await screen.findByText(/emergency request accepted/i)).toBeInTheDocument();
  });

  it('rolls back optimistic state when the response API fails', async () => {
    server.use(
      http.post('/api/v1/requests/:id/respond', () => {
        return HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Fulfillment lock contention' } },
          { status: 500 }
        );
      })
    );

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/donor/requests/req-alpha-123']}>
        <AuthProvider>
          <Routes>
            <Route path="/donor/requests/:id" element={<RespondToRequestPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const acceptBtn = await screen.findByRole('button', { name: /accept & reveal contact/i });
    await user.click(acceptBtn);

    // Rollback error notice appears and buttons are re-enabled
    expect(await screen.findByText(/action failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/contact revealed to hospital/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept & reveal contact/i })).toBeEnabled();
  });
});
