import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../app/AuthContext.js';
import { RouteGuard } from '../../../app/RouteGuard.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('Session Bootstrap & Role-Based Route Guards', () => {
  it('calls silent refresh then /auth/me to restore session and renders protected content', async () => {
    function ProtectedDashboard(): React.ReactElement {
      const { user } = useAuth();
      return <div>Welcome Donor {user?.fullName}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/donor']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/donor"
              element={
                <RouteGuard allowedRoles={['donor']}>
                  <ProtectedDashboard />
                </RouteGuard>
              }
            />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Initial state: shows skeleton, never flashes login or protected content
    expect(screen.getByTestId('route-guard-skeleton')).toBeInTheDocument();
    expect(screen.queryByText(/welcome donor/i)).not.toBeInTheDocument();

    // After bootstrap finishes via MSW mock, protected dashboard appears
    expect(await screen.findByText(/welcome donor aarav patel/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login when silent refresh fails', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
      })
    );

    function ProtectedDonorView(): React.ReactElement {
      return <div>Confidential Donor Info</div>;
    }

    render(
      <MemoryRouter initialEntries={['/donor']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/donor"
              element={
                <RouteGuard allowedRoles={['donor']}>
                  <ProtectedDonorView />
                </RouteGuard>
              }
            />
            <Route path="/login" element={<div>Sign In Screen View</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Sign In Screen View')).toBeInTheDocument();
    expect(screen.queryByText('Confidential Donor Info')).not.toBeInTheDocument();
  });

  it('redirects pending organization accounts to /pending-approval', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => {
        return HttpResponse.json({
          user: {
            id: 'h-pending-1',
            email: 'pending-hospital@hospital.org',
            role: 'hospital',
            status: 'pending'
          }
        });
      })
    );

    render(
      <MemoryRouter initialEntries={['/hospital']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/hospital"
              element={
                <RouteGuard allowedRoles={['hospital']}>
                  <div>Hospital Dispatch Core</div>
                </RouteGuard>
              }
            />
            <Route path="/pending-approval" element={<div>Pending Institutional Approval Screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Pending Institutional Approval Screen')).toBeInTheDocument();
    expect(screen.queryByText('Hospital Dispatch Core')).not.toBeInTheDocument();
  });

  it('enforces RBAC boundary and shows access denied when role mismatches', async () => {
    // Current user is donor (from default MSW handler)
    render(
      <MemoryRouter initialEntries={['/hospital']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/hospital"
              element={
                <RouteGuard allowedRoles={['hospital']}>
                  <div>Hospital Only Dispatch</div>
                </RouteGuard>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/role access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/your authenticated role \(DONOR\) does not have permission/i)).toBeInTheDocument();
    expect(screen.queryByText('Hospital Only Dispatch')).not.toBeInTheDocument();
  });
});
