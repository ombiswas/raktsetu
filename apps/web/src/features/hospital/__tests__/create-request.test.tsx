import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HospitalPage } from '../HospitalPage.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('Hospital Dashboard & Emergency Request Creation', () => {
  beforeEach(() => {
    setAccessToken('mock-hospital-access-token');
  });

  it('renders hospital dashboard with active requests and mono header table', async () => {
    render(
      <MemoryRouter>
        <HospitalPage />
      </MemoryRouter>
    );

    // Header and research prototype notice
    expect(screen.getByText('HOSPITAL EMERGENCY WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText(/SIMULATION RESEARCH PROTOTYPE:/i)).toBeInTheDocument();

    // Table loaded with mock request
    await waitFor(() => {
      expect(screen.getByText('req-alph...')).toBeInTheDocument();
    });

    expect(screen.getByText('O+')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('MATCHING')).toBeInTheDocument();
    expect(screen.getByText('Inspect Matching')).toBeInTheDocument();
  });

  it('displays mandatory "not a medical decision" notice in the create request form', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HospitalPage />
      </MemoryRouter>
    );

    const createBtn = screen.getByRole('button', { name: /create emergency request/i });
    await user.click(createBtn);

    // Modal opens
    expect(screen.getByRole('heading', { name: /new emergency blood request/i })).toBeInTheDocument();

    // Notice exists
    const notice = screen.getByRole('note', { name: /medical research prototype disclaimer/i });
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent(/RESEARCH PROTOTYPE NOTICE: NOT A MEDICAL DECISION/i);
    expect(notice).toHaveTextContent(/clinical responsibility of licensed attending physicians/i);
  });

  it('enforces idempotency key and dispatches request after confirmation step', async () => {
    const user = userEvent.setup();
    let capturedIdempotencyKey: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post('/api/v1/requests', async ({ request }) => {
        capturedIdempotencyKey = request.headers.get('idempotency-key');
        capturedBody = await request.json();

        return HttpResponse.json(
          {
            id: 'req-created-999',
            hospitalId: 'h-999',
            bloodGroup: 'B-',
            component: 'whole_blood',
            unitsRequired: 3,
            unitsFulfilled: 0,
            urgency: 'critical',
            status: 'matching',
            neededBy: new Date(Date.now() + 10000000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          { status: 201 }
        );
      })
    );

    render(
      <MemoryRouter>
        <HospitalPage />
      </MemoryRouter>
    );

    // Open modal
    await user.click(screen.getByRole('button', { name: /create emergency request/i }));

    // Verify idempotency key is displayed
    expect(screen.getByText(/IDEMPOTENCY KEY:/i)).toBeInTheDocument();

    // Change blood group
    const bloodGroupSelect = screen.getByLabelText(/required blood group/i);
    await user.selectOptions(bloodGroupSelect, 'B-');

    // Change units
    const unitsInput = screen.getByLabelText(/units required/i);
    await user.clear(unitsInput);
    await user.type(unitsInput, '3');

    // Proceed to review
    const reviewBtn = screen.getByRole('button', { name: /review dispatch order/i });
    await user.click(reviewBtn);

    // Confirmation step rendered
    expect(screen.getByRole('heading', { name: /confirm emergency dispatch/i })).toBeInTheDocument();
    expect(screen.getByText('3 units')).toBeInTheDocument();

    // Submit confirmation
    const confirmBtn = screen.getByRole('button', { name: /confirm & dispatch alerts/i });
    await user.click(confirmBtn);

    // Modal closes and new request appears in list
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /confirm emergency dispatch/i })).not.toBeInTheDocument();
    });

    expect(capturedIdempotencyKey).toBeTruthy();
    expect(capturedIdempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(capturedBody).toMatchObject({
      bloodGroup: 'B-',
      component: 'whole_blood',
      unitsRequired: 3,
      urgency: 'critical'
    });

    // Toast alert appears
    expect(screen.getByText(/Emergency request created for 3 units of B-/i)).toBeInTheDocument();
  });
});
