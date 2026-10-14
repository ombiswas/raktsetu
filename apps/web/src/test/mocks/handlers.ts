import { http, HttpResponse } from 'msw';

export const mockDonorProfile = {
  id: 'd-101',
  email: 'donor@example.com',
  fullName: 'Aarav Patel',
  phone: '+919876543210',
  bloodGroup: 'O+' as const,
  dateOfBirth: '1995-05-15',
  weightKg: 68,
  sex: 'male' as const,
  isAvailable: true,
  availableFrom: null,
  eligibleAfter: null,
  lastDonationDate: '2026-06-01T10:00:00Z',
  hasLocation: true,
  locationUpdatedAt: '2026-10-10T14:30:00Z',
  consentLocationAt: '2026-10-10T14:30:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-10-10T14:30:00Z'
};

export const mockNotifications = [
  {
    id: 'notif-urgent-1',
    userId: 'd-101',
    kind: 'donor_match_alert',
    payload: {
      requestId: 'req-alpha-123',
      bloodGroup: 'O+',
      urgency: 'critical',
      units: 2,
      approximateDistanceKm: 3.2,
      respondUrl: '/donor/requests/req-alpha-123',
      issuedAt: new Date().toISOString()
    },
    readAt: null,
    createdAt: new Date().toISOString()
  }
];

export const mockRequestDetails = {
  id: 'req-alpha-123',
  hospitalId: 'h-999',
  hospitalName: 'Apollo Hospital Trauma Center',
  hospitalAddress: 'Mathura Road, Sarita Vihar, New Delhi',
  bloodGroup: 'O+',
  component: 'whole_blood',
  unitsRequired: 2,
  unitsFulfilled: 0,
  urgency: 'critical',
  status: 'active',
  neededBy: new Date(Date.now() + 7200000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const handlers = [
  // 1. Auth: Login
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email === 'invalid@example.com' || body.password === 'wrongpassword') {
      return HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      accessToken: 'test-access-token-jwt',
      expiresIn: 900,
      user: {
        id: 'd-101',
        email: body.email || 'donor@example.com',
        role: 'donor',
        status: 'active',
        fullName: 'Aarav Patel'
      }
    });
  }),

  // 2. Auth: Refresh
  http.post('/api/v1/auth/refresh', () => {
    return HttpResponse.json({
      accessToken: 'refreshed-jwt-token-string',
      expiresIn: 900
    });
  }),

  // 3. Auth: Current User Profile (/auth/me)
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json({
      user: {
        id: 'd-101',
        email: 'donor@example.com',
        role: 'donor',
        status: 'active',
        fullName: 'Aarav Patel'
      }
    });
  }),

  // 4. Auth: Logout
  http.post('/api/v1/auth/logout', () => {
    return HttpResponse.json({ message: 'Logged out successfully' });
  }),

  // 5. Auth: Register Donor
  http.post('/api/v1/auth/register/donor', () => {
    return HttpResponse.json({
      user: {
        id: 'new-donor-id',
        email: 'newdonor@example.com',
        role: 'donor',
        status: 'active'
      }
    });
  }),

  // 6. Auth: Register Hospital (Pending)
  http.post('/api/v1/auth/register/hospital', () => {
    return HttpResponse.json({
      user: {
        id: 'new-hospital-id',
        email: 'hospital@example.com',
        role: 'hospital',
        status: 'pending'
      }
    });
  }),

  // 7. Auth: Register Blood Bank (Pending)
  http.post('/api/v1/auth/register/blood-bank', () => {
    return HttpResponse.json({
      user: {
        id: 'new-bb-id',
        email: 'bloodbank@example.com',
        role: 'blood_bank',
        status: 'pending'
      }
    });
  }),

  // 8. Donor: Profile GET
  http.get('/api/v1/donors/me', () => {
    return HttpResponse.json(mockDonorProfile);
  }),

  // 9. Donor: Profile PATCH
  http.patch('/api/v1/donors/me', async ({ request }) => {
    const patch = (await request.json()) as Partial<typeof mockDonorProfile>;
    return HttpResponse.json({
      ...mockDonorProfile,
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }),

  // 10. Donor: Location PUT
  http.put('/api/v1/donors/me/location', async ({ request }) => {
    const body = (await request.json()) as {
      latitude: number;
      longitude: number;
      consentGiven?: boolean;
    };

    if (!body.consentGiven) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Explicit consent required' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      message: 'Geospatial coordinates updated with consent',
      locationUpdatedAt: new Date().toISOString()
    });
  }),

  // 11. Donor: Donation History GET
  http.get('/api/v1/donors/me/donations', () => {
    return HttpResponse.json({
      donations: [
        {
          id: 'don-001',
          bloodBankId: 'bb-888',
          bloodBankName: 'Rotary Blood Bank Central',
          requestId: null,
          donatedAt: '2026-06-01T10:00:00Z',
          units: 1
        }
      ]
    });
  }),

  // 12. Notifications: List GET
  http.get('/api/v1/notifications', () => {
    return HttpResponse.json({ notifications: mockNotifications });
  }),

  // 13. Notifications: Read PATCH
  http.patch('/api/v1/notifications/:id/read', () => {
    return HttpResponse.json({ message: 'Notification marked as read' });
  }),

  // 14. Notifications: Push Subscription POST
  http.post('/api/v1/notifications/push-subscription', () => {
    return HttpResponse.json({ message: 'WebPush subscription registered' });
  }),

  // 15. Blood Requests: Details GET
  http.get('/api/v1/requests/:id', () => {
    return HttpResponse.json(mockRequestDetails);
  }),

  // 16. Blood Requests: Donor Response POST
  http.post('/api/v1/requests/:id/respond', async ({ request }) => {
    const body = (await request.json()) as { action: 'accept' | 'decline' };
    return HttpResponse.json({
      response: body.action === 'accept' ? 'accepted' : 'declined',
      message:
        body.action === 'accept'
          ? 'Emergency request accepted successfully'
          : 'Emergency request declined'
    });
  })
];
