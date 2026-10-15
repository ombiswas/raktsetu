import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequestDetailPage } from '../RequestDetailPage.js';
import { AcceptedDonorsPanel } from '../AcceptedDonorsPanel.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';
import { mockRequestDetails } from '../../../test/mocks/handlers.js';
import type { MatchingCandidate } from '../request-types.js';

describe('Consent-Based Contact Reveal & Request Cancellation', () => {
  beforeEach(() => {
    setAccessToken('mock-hospital-access-token');
  });

  it('reveals first name and direct phone number ONLY for accepted voluntary donors with audit notice', () => {
    const candidates: MatchingCandidate[] = [
      {
        id: 'c-acc',
        rank: 1,
        bloodGroup: 'O+',
        approximateDistance: '< 1 km',
        responseStatus: 'accepted',
        score: 0.92,
        firstName: 'Priya',
        phone: '+919811223344'
      },
      {
        id: 'c-pend',
        rank: 2,
        bloodGroup: 'O-',
        approximateDistance: '2-3 km',
        responseStatus: 'pending',
        score: 0.75,
        // Cloaked even if raw DB had names
        firstName: undefined,
        phone: undefined
      },
      {
        id: 'c-dec',
        rank: 3,
        bloodGroup: 'O+',
        approximateDistance: '5-6 km',
        responseStatus: 'declined',
        score: 0.4,
        firstName: undefined,
        phone: undefined
      }
    ];

    render(<AcceptedDonorsPanel candidates={candidates} />);

    // Audit notice is prominent
    expect(screen.getByText(/AUDITED ACCESS LOGGING ACTIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/logged immutably in the hospital research audit trail/i)).toBeInTheDocument();

    // Accepted candidate details visible
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByText('+919811223344')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+919811223344' })).toHaveAttribute('href', 'tel:+919811223344');

    // Non-accepted candidate names/phones are NOT present
    expect(screen.queryByText('c-pend')).not.toBeInTheDocument();
    expect(screen.queryByText('c-dec')).not.toBeInTheDocument();
  });

  it('allows hospital to cancel active request via confirmation modal and updates status', async () => {
    const user = userEvent.setup();
    let cancelCalled = false;

    server.use(
      http.patch('/api/v1/requests/:id/cancel', async ({ request }) => {
        cancelCalled = true;
        const body = (await request.json()) as { reason?: string };

        return HttpResponse.json({
          ...mockRequestDetails,
          status: 'cancelled',
          cancellationReason: body.reason,
          updatedAt: new Date().toISOString()
        });
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
      expect(screen.getByText('Apollo Hospital Trauma Center')).toBeInTheDocument();
    });

    // Click "Cancel Request"
    const cancelBtn = screen.getByRole('button', { name: /cancel request/i });
    await user.click(cancelBtn);

    // Modal opens
    expect(screen.getByRole('heading', { name: /cancel emergency blood request/i })).toBeInTheDocument();
    expect(screen.getByText(/WARNING: PERMANENT CANCELLATION/i)).toBeInTheDocument();

    // Enter optional reason
    const reasonInput = screen.getByLabelText(/cancellation reason/i);
    await user.type(reasonInput, 'Patient condition stabilized without whole blood need');

    // Confirm cancellation
    const confirmCancelBtn = screen.getByRole('button', { name: /confirm request cancellation/i });
    await user.click(confirmCancelBtn);

    await waitFor(() => {
      expect(cancelCalled).toBe(true);
    });

    // Modal closes and status reflects CANCELLED
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /cancel emergency blood request/i })).not.toBeInTheDocument();
    });

    expect(screen.getByText(/CANCELLED/i)).toBeInTheDocument();
  });
});
