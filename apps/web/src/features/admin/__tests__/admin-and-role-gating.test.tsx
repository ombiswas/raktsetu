import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../AdminPage.js';
import { PendingAccountsQueue } from '../PendingAccountsQueue.js';
import { AuditLogViewer } from '../AuditLogViewer.js';
import { CreateRequestModal } from '../../hospital/CreateRequestModal.js';
import { RouteGuard } from '../../../app/RouteGuard.js';
import { AuthContext, type AuthContextValue } from '../../../app/AuthContext.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';
import { mockAdminAccounts } from '../../../test/mocks/handlers.js';

function renderWithRole(
  element: React.ReactElement,
  role: 'donor' | 'hospital' | 'blood_bank' | 'admin',
  status: 'active' | 'pending' | 'suspended' = 'active'
) {
  const authValue: AuthContextValue = {
    user: {
      id: 'test-user-id',
      email: `${role}@raktsetu.org`,
      role,
      status,
      fullName: `Test ${role}`,
      createdAt: '2026-01-01T00:00:00Z'
    },
    role,
    status,
    isAuthenticated: true,
    accessToken: 'mock-token',
    isBootstrapping: false,
    login: async () => {},
    logout: async () => {},
    setAuthSession: () => {},
    updateUser: () => {},
    clearAuthSession: () => {},
    bootstrapSession: async () => {}
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>{element}</MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Admin Console, Role-Gating & Destructive Action Confirmations', () => {
  beforeEach(() => {
    setAccessToken('mock-admin-access-token');
  });

  it('enforces RBAC boundary and rejects unauthorized roles attempting to access admin or blood-bank', () => {
    // A donor user tries to access admin-only component via RouteGuard
    renderWithRole(
      <RouteGuard allowedRoles={['admin']}>
        <AdminPage />
      </RouteGuard>,
      'donor'
    );

    expect(screen.getByText('RESTRICTED RBAC BOUNDARY')).toBeInTheDocument();
    expect(screen.getByText('Role Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(/your authenticated role \(DONOR\) does not have permission/i)
    ).toBeInTheDocument();
  });

  it('allows admin to access moderation queue and approve a pending hospital account via confirmation modal', async () => {
    const user = userEvent.setup();
    let approveCalled = false;

    server.use(
      http.post('/api/v1/admin/accounts/:id/approve', ({ params }) => {
        approveCalled = true;
        expect(params.id).toBe('hosp-user-1');
        return HttpResponse.json({
          message: 'User account approved successfully',
          account: {
            ...mockAdminAccounts[0],
            status: 'active'
          }
        });
      })
    );

    renderWithRole(<PendingAccountsQueue />, 'admin');

    await waitFor(() => {
      expect(screen.getByText('Account Moderation Queue')).toBeInTheDocument();
    });

    // Check that pending hospital account is displayed
    expect(screen.getByText('apollo@hospital.org')).toBeInTheDocument();
    expect(screen.getByText('Apollo Trauma Hospital')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();

    // Click "Approve" button
    const approveBtn = screen.getByRole('button', { name: /approve/i });
    await user.click(approveBtn);

    // Confirmation modal opens
    expect(
      screen.getByRole('heading', { name: /approve organization account/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/approving this account certifies that licensing and facility credentials have been validated/i)
    ).toBeInTheDocument();

    // Confirm approval
    const confirmBtn = screen.getByRole('button', { name: /confirm approval/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(approveCalled).toBe(true);
    });
  });

  it('displays destructive action confirmation with session revocation warning on suspension', async () => {
    const user = userEvent.setup();
    let suspendCalled = false;

    server.use(
      http.get('/api/v1/admin/accounts', () => {
        return HttpResponse.json({
          accounts: [
            {
              ...mockAdminAccounts[1],
              status: 'active'
            }
          ]
        });
      }),
      http.post('/api/v1/admin/accounts/:id/suspend', () => {
        suspendCalled = true;
        return HttpResponse.json({
          message: 'User account suspended',
          account: {
            ...mockAdminAccounts[1],
            status: 'suspended'
          }
        });
      })
    );

    renderWithRole(<PendingAccountsQueue />, 'admin');

    await waitFor(() => {
      expect(screen.getByText('redcross@bloodbank.org')).toBeInTheDocument();
    });

    // Click "Suspend"
    const suspendBtn = screen.getByRole('button', { name: /suspend/i });
    await user.click(suspendBtn);

    // Destructive Warning modal opens
    expect(
      screen.getByRole('heading', { name: /suspend user account \(destructive action\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/warning: immediate access revocation/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/revokes all active refresh tokens and terminates active browser sessions/i)
    ).toBeInTheDocument();

    // Confirm suspension
    const confirmSuspendBtn = screen.getByRole('button', { name: /confirm suspension/i });
    await user.click(confirmSuspendBtn);

    await waitFor(() => {
      expect(suspendCalled).toBe(true);
    });
  });

  it('renders audit log viewer with paginated rows and navigation controls', async () => {
    renderWithRole(<AuditLogViewer />, 'admin');

    await waitFor(() => {
      expect(screen.getByText('admin.account.approve')).toBeInTheDocument();
    });

    expect(screen.getByText('blood_bank.donor.deferred')).toBeInTheDocument();

    // Pagination info
    expect(screen.getByText(/showing 1–2 of 2 audit records/i)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();

    // Read-only indicator
    expect(screen.getByText('APPEND-ONLY DB')).toBeInTheDocument();
  });

  it('acceptance flow: approved hospital can create an emergency blood request with idempotency', async () => {
    const user = userEvent.setup();
    let requestCreated = false;
    let capturedIdempotencyKey: string | null = null;

    server.use(
      http.post('/api/v1/requests', ({ request }) => {
        requestCreated = true;
        capturedIdempotencyKey = request.headers.get('idempotency-key');
        return HttpResponse.json(
          {
            id: 'req-hospital-approved-1',
            status: 'matching',
            bloodGroup: 'B+',
            component: 'whole_blood',
            unitsRequired: 3
          },
          { status: 201 }
        );
      })
    );

    // Approved hospital mounts create request modal
    renderWithRole(
      <CreateRequestModal
        isOpen={true}
        onClose={() => {}}
        onRequestCreated={() => {}}
      />,
      'hospital',
      'active'
    );

    expect(screen.getByRole('heading', { name: /new emergency blood request/i })).toBeInTheDocument();

    // Advance to review step
    const reviewBtn = screen.getByRole('button', { name: /review dispatch order/i });
    await user.click(reviewBtn);

    // Confirmation step visible
    expect(screen.getByText(/please verify the emergency request parameters/i)).toBeInTheDocument();

    // Submit dispatch
    const submitBtn = screen.getByRole('button', { name: /confirm & dispatch alerts/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(requestCreated).toBe(true);
      expect(capturedIdempotencyKey).toBeTruthy();
    });
  });
});
