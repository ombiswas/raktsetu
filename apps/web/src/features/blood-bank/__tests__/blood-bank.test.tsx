import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BloodBankPage } from '../BloodBankPage.js';
import { AdjustStockModal } from '../AdjustStockModal.js';
import { RecordDonationModal } from '../RecordDonationModal.js';
import { DeferDonorModal } from '../DeferDonorModal.js';
import { setAccessToken } from '../../../lib/api/token-store.js';
import { server } from '../../../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('Blood Bank Inventory & Clinical Workflows', () => {
  beforeEach(() => {
    setAccessToken('mock-blood-bank-access-token');
  });

  it('renders inventory table with stock levels and low-stock warning badges', async () => {
    render(
      <MemoryRouter>
        <BloodBankPage />
      </MemoryRouter>
    );

    // Initial loading finishes
    await waitFor(() => {
      expect(screen.getByText('Verified Stock by Component & Group')).toBeInTheDocument();
    });

    // Stats cards
    expect(screen.getByText(/total available units/i)).toBeInTheDocument();
    expect(screen.getByText('43')).toBeInTheDocument();
    expect(screen.getByText(/low stock alerts/i)).toBeInTheDocument();

    // Table rows
    expect(screen.getAllByText('O+')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Whole Blood (450ml)')[0]).toBeInTheDocument();

    // Low stock badge
    expect(screen.getByText('LOW STOCK')).toBeInTheDocument();
    expect(screen.getAllByText('ADEQUATE')[0]).toBeInTheDocument();
  });

  it('enforces mandatory audited reason when adjusting stock in modal', async () => {
    const user = userEvent.setup();
    let adjustCalled = false;

    server.use(
      http.post('/api/v1/blood-banks/me/inventory/adjust', async ({ request }) => {
        adjustCalled = true;
        const body = (await request.json()) as { reason: string; delta: number };
        expect(body.reason).toBe('Physical inventory cycle count reconciliation');
        expect(body.delta).toBe(5);
        return HttpResponse.json({ success: true });
      })
    );

    render(
      <AdjustStockModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        defaultBloodGroup="O+"
        defaultComponent="whole_blood"
      />
    );

    expect(screen.getByRole('heading', { name: /adjust inventory stock/i })).toBeInTheDocument();

    // Attempt submitting without reason
    const submitBtn = screen.getByRole('button', { name: /confirm stock adjustment/i });
    await user.click(submitBtn);

    // Reason validation fails
    expect(
      screen.getByText(/an audited operational reason is strictly required/i)
    ).toBeInTheDocument();
    expect(adjustCalled).toBe(false);

    // Enter units and valid reason
    const unitsInput = screen.getByLabelText(/units \(count\)/i);
    await user.clear(unitsInput);
    await user.type(unitsInput, '5');

    const reasonInput = screen.getByLabelText(/adjustment reason \(audited\)/i);
    await user.type(reasonInput, 'Physical inventory cycle count reconciliation');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(adjustCalled).toBe(true);
    });
  });

  it('performs privacy-safe donor lookup by UUID and records completed donation', async () => {
    const user = userEvent.setup();
    let donationCalled = false;

    server.use(
      http.post('/api/v1/blood-banks/me/donations', async ({ request }) => {
        donationCalled = true;
        const body = (await request.json()) as { donorId: string; units: number };
        expect(body.donorId).toBe('11111111-1111-1111-1111-111111111111');
        expect(body.units).toBe(1);
        return HttpResponse.json({ success: true }, { status: 201 });
      })
    );

    render(
      <RecordDonationModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: /record completed donation/i })).toBeInTheDocument();
    expect(screen.getByText(/zero-pii privacy enforced/i)).toBeInTheDocument();

    // Enter donor UUID (lookup)
    const donorIdInput = screen.getByLabelText(/donor id \/ code/i);
    await user.type(donorIdInput, '11111111-1111-1111-1111-111111111111');

    const verifyBtn = screen.getByRole('button', { name: /verify donor/i });
    await user.click(verifyBtn);

    // Donor verified safe summary displayed
    await waitFor(() => {
      expect(screen.getByText(/verified blood group:/i)).toBeInTheDocument();
    });

    // Confirm donation event
    const confirmBtn = screen.getByRole('button', { name: /confirm donation event/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(donationCalled).toBe(true);
    });
  });

  it('records clinical deferral with future eligibility date and reason', async () => {
    const user = userEvent.setup();
    let deferCalled = false;

    server.use(
      http.post('/api/v1/blood-banks/donors/:id/defer', async ({ request, params }) => {
        deferCalled = true;
        expect(params.id).toBe('22222222-2222-2222-2222-222222222222');
        const body = (await request.json()) as { reason: string; eligibleAfter: string };
        expect(body.reason).toBe('Hemoglobin below threshold (11.8 g/dL)');
        return HttpResponse.json({ success: true });
      })
    );

    render(
      <DeferDonorModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        initialDonorId="22222222-2222-2222-2222-222222222222"
      />
    );

    expect(screen.getByRole('heading', { name: /record clinical deferral/i })).toBeInTheDocument();

    // Enter clinical reason
    const reasonInput = screen.getByLabelText(/clinical deferral reason/i);
    await user.type(reasonInput, 'Hemoglobin below threshold (11.8 g/dL)');

    const submitBtn = screen.getByRole('button', { name: /apply clinical deferral/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(deferCalled).toBe(true);
    });
  });
});
