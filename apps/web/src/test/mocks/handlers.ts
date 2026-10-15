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
  bloodGroup: 'O+' as const,
  component: 'whole_blood' as const,
  unitsRequired: 2,
  unitsFulfilled: 1,
  urgency: 'critical' as const,
  status: 'matching' as const,
  neededBy: new Date(Date.now() + 7200000).toISOString(),
  location: {
    latitude: 28.6139,
    longitude: 77.2090
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const mockMatchingStatusNormal = {
  runId: 'run-777-normal',
  requestId: 'req-alpha-123',
  algorithm: 'hybrid' as const,
  algorithmVersion: 'v1.0.0-hybrid',
  modelVersion: 'v1.0.0',
  degraded: false,
  createdAt: new Date().toISOString(),
  config: {
    finalRadiusMeters: 5000,
    batchSize: 5,
    minCandidates: 5
  },
  candidateCounts: {
    total: 3,
    pending: 1,
    accepted: 1,
    declined: 1,
    noResponse: 0
  },
  candidates: [
    {
      id: 'c-001',
      rank: 1,
      bloodGroup: 'O+' as const,
      approximateDistance: '< 1 km',
      responseStatus: 'accepted' as const,
      score: 0.8842,
      firstName: 'Aarav',
      phone: '+919876543210'
    },
    {
      id: 'c-002',
      rank: 2,
      bloodGroup: 'O-' as const,
      approximateDistance: '2-3 km',
      responseStatus: 'pending' as const,
      score: 0.7615
    },
    {
      id: 'c-003',
      rank: 3,
      bloodGroup: 'O+' as const,
      approximateDistance: '4-5 km',
      responseStatus: 'declined' as const,
      score: 0.4321
    }
  ]
};

export const mockMatchingStatusDegraded = {
  runId: 'run-888-degraded',
  requestId: 'req-alpha-123',
  algorithm: 'baseline' as const,
  algorithmVersion: 'v1.0.0-baseline',
  modelVersion: null,
  degraded: true,
  createdAt: new Date().toISOString(),
  config: {
    finalRadiusMeters: 5000,
    batchSize: 5,
    minCandidates: 5
  },
  candidateCounts: {
    total: 2,
    pending: 2,
    accepted: 0,
    declined: 0,
    noResponse: 0
  },
  candidates: [
    {
      id: 'c-101',
      rank: 1,
      bloodGroup: 'O+' as const,
      approximateDistance: '1-2 km',
      responseStatus: 'pending' as const,
      score: null
    },
    {
      id: 'c-102',
      rank: 2,
      bloodGroup: 'O-' as const,
      approximateDistance: '3-4 km',
      responseStatus: 'pending' as const,
      score: null
    }
  ]
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
  }),

  // 17. Blood Requests: List GET (Hospital Scoped)
  http.get('/api/v1/requests', () => {
    return HttpResponse.json({
      requests: [mockRequestDetails]
    });
  }),

  // 18. Blood Requests: Create POST (With Idempotency Key)
  http.post('/api/v1/requests', async ({ request }) => {
    const body = (await request.json()) as {
      bloodGroup: string;
      component: string;
      unitsRequired: number;
      urgency: string;
      neededBy: string;
    };
    const idempotencyKey = request.headers.get('idempotency-key');

    const newRequest = {
      id: 'req-new-001',
      hospitalId: 'h-999',
      bloodGroup: body.bloodGroup,
      component: body.component,
      unitsRequired: body.unitsRequired,
      unitsFulfilled: 0,
      urgency: body.urgency,
      status: 'matching',
      neededBy: body.neededBy,
      location: {
        latitude: 28.6139,
        longitude: 77.2090
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey
    };

    return HttpResponse.json(newRequest, { status: 201 });
  }),

  // 19. Blood Requests: Cancel PATCH
  http.patch('/api/v1/requests/:id/cancel', () => {
    return HttpResponse.json({
      ...mockRequestDetails,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    });
  }),

  // 20. Blood Requests: Matching Status GET
  http.get('/api/v1/requests/:id/matching', () => {
    return HttpResponse.json(mockMatchingStatusNormal);
  }),

  // 21. Blood Bank: Inventory GET
  http.get('/api/v1/blood-banks/me/inventory', () => {
    return HttpResponse.json(mockInventoryData);
  }),

  // 22. Blood Bank: Stock Adjust POST
  http.post('/api/v1/blood-banks/me/inventory/adjust', async ({ request }) => {
    const body = (await request.json()) as {
      bloodGroup: string;
      component: string;
      delta: number;
      reason: string;
    };
    return HttpResponse.json({
      inventoryId: 'inv-adj-001',
      bloodBankId: 'bb-101',
      bloodGroup: body.bloodGroup,
      component: body.component,
      previousUnits: 10,
      newUnits: 10 + body.delta,
      delta: body.delta,
      reason: body.reason,
      movementId: 'mov-001',
      isLowStock: 10 + body.delta < 10,
      lowStockThreshold: 10,
      createdAt: new Date().toISOString()
    });
  }),

  // 23. Blood Bank: Safe Donor Summary GET
  http.get('/api/v1/blood-banks/donors/:id', () => {
    return HttpResponse.json(mockSafeDonorSummary);
  }),

  // 24. Blood Bank: Record Donation POST
  http.post('/api/v1/blood-banks/me/donations', async ({ request }) => {
    const body = (await request.json()) as {
      donorId: string;
      bloodGroup: string;
      component: string;
      units: number;
    };
    return HttpResponse.json(
      {
        message: 'Donation recorded successfully',
        donation: {
          donationId: 'don-001',
          donorId: body.donorId,
          bloodBankId: 'bb-101',
          bloodGroup: body.bloodGroup,
          component: body.component,
          units: body.units,
          donatedAt: new Date().toISOString(),
          inventoryTotalUnits: 45
        }
      },
      { status: 201 }
    );
  }),

  // 25. Blood Bank: Defer Donor POST
  http.post('/api/v1/blood-banks/donors/:id/defer', async ({ params, request }) => {
    const body = (await request.json()) as {
      eligibleAfter: string;
      reason: string;
    };
    return HttpResponse.json({
      message: 'Donor deferral recorded successfully',
      deferral: {
        donorId: params.id,
        bloodGroup: 'O+',
        eligibleAfter: body.eligibleAfter,
        deferredAt: new Date().toISOString(),
        reason: body.reason
      }
    });
  }),

  // 26. Forecasting: Overview GET
  http.get('/api/v1/forecasts', () => {
    return HttpResponse.json(mockForecastData);
  }),

  // 27. Analytics: Overview GET
  http.get('/api/v1/analytics/overview', () => {
    return HttpResponse.json(mockAnalyticsData);
  }),

  // 28. Admin: Accounts List GET
  http.get('/api/v1/admin/accounts', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');

    let filtered = [...mockAdminAccounts];
    if (status && status !== 'all') {
      filtered = filtered.filter((a) => a.status === status);
    }
    if (role && role !== 'all') {
      filtered = filtered.filter((a) => a.role === role);
    }

    return HttpResponse.json({ accounts: filtered });
  }),

  // 29. Admin: Approve Account POST
  http.post('/api/v1/admin/accounts/:id/approve', ({ params }) => {
    const acc = mockAdminAccounts.find((a) => a.id === params.id) || mockAdminAccounts[0]!;
    return HttpResponse.json({
      message: 'User account approved successfully',
      account: { ...acc, status: 'active' }
    });
  }),

  // 30. Admin: Suspend Account POST
  http.post('/api/v1/admin/accounts/:id/suspend', ({ params }) => {
    const acc = mockAdminAccounts.find((a) => a.id === params.id) || mockAdminAccounts[0]!;
    return HttpResponse.json({
      message: 'User account suspended and all active sessions revoked',
      account: { ...acc, status: 'suspended' }
    });
  }),

  // 31. Admin: Reactivate Account POST
  http.post('/api/v1/admin/accounts/:id/reactivate', ({ params }) => {
    const acc = mockAdminAccounts.find((a) => a.id === params.id) || mockAdminAccounts[0]!;
    return HttpResponse.json({
      message: 'User account reactivated successfully',
      account: { ...acc, status: 'active' }
    });
  }),

  // 32. Admin: Audit Logs List GET
  http.get('/api/v1/admin/audit-logs', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    return HttpResponse.json({
      items: mockAuditLogs.items,
      total: mockAuditLogs.total,
      limit,
      offset
    });
  })
];

export const mockInventoryData = {
  bloodBankId: 'bb-101',
  items: [
    {
      id: 'inv-1',
      bloodBankId: 'bb-101',
      bloodGroup: 'O+' as const,
      component: 'whole_blood' as const,
      units: 24,
      isLowStock: false,
      lowStockThreshold: 10,
      updatedAt: '2026-10-15T10:00:00Z'
    },
    {
      id: 'inv-2',
      bloodBankId: 'bb-101',
      bloodGroup: 'O-' as const,
      component: 'whole_blood' as const,
      units: 4,
      isLowStock: true,
      lowStockThreshold: 10,
      updatedAt: '2026-10-15T10:30:00Z'
    },
    {
      id: 'inv-3',
      bloodBankId: 'bb-101',
      bloodGroup: 'A+' as const,
      component: 'platelets' as const,
      units: 15,
      isLowStock: false,
      lowStockThreshold: 8,
      updatedAt: '2026-10-15T11:00:00Z'
    }
  ],
  totalUnits: 43,
  lowStockCount: 1
};

export const mockSafeDonorSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  bloodGroup: 'O+' as const,
  isAvailable: true,
  eligibleAfter: null,
  lastDonationDate: '2026-06-01T10:00:00Z'
};

export const mockForecastData = {
  bloodGroup: 'O+' as const,
  component: 'whole_blood' as const,
  modelVersion: 'v0.1.0-seasonal-baseline',
  mae: 2.15,
  series: [
    { date: '2026-10-01', units: 12 },
    { date: '2026-10-02', units: 15 },
    { date: '2026-10-03', units: 8 },
    { date: '2026-10-04', units: 20 },
    { date: '2026-10-05', units: 14 }
  ],
  forecast: [
    { step: 1, date: '2026-10-06', predictedUnits: 16 },
    { step: 2, date: '2026-10-07', predictedUnits: 18 },
    { step: 3, date: '2026-10-08', predictedUnits: 13 }
  ],
  isSimulation: true as const
};

export const mockAnalyticsData = {
  requestsByStatus: {
    open: 3,
    matching: 5,
    fulfilled: 42,
    cancelled: 2,
    expired: 1,
    total: 53
  },
  responseRate: 0.78,
  medianTimeToFirstAcceptSeconds: 145,
  fulfillmentRate: 0.86,
  radiusExpansionFrequency: 0.22,
  degradedRunRate: 0.04,
  totalMatchRuns: 58,
  totalNotifications: 240,
  timestamp: new Date().toISOString()
};

export const mockAdminAccounts = [
  {
    id: 'hosp-user-1',
    email: 'apollo@hospital.org',
    role: 'hospital' as const,
    status: 'pending' as const,
    createdAt: '2026-10-14T08:00:00Z',
    details: {
      name: 'Apollo Trauma Hospital',
      registrationNo: 'HOSP-DEL-887',
      phone: '+919811002233',
      address: 'Sarita Vihar, New Delhi',
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null
    }
  },
  {
    id: 'bb-user-1',
    email: 'redcross@bloodbank.org',
    role: 'blood_bank' as const,
    status: 'active' as const,
    createdAt: '2026-10-10T10:00:00Z',
    details: {
      name: 'Red Cross Regional Blood Center',
      licenseNo: 'BB-LIC-9988',
      phone: '+919811223344',
      address: 'Connaught Place, New Delhi',
      isVerified: true,
      verifiedAt: '2026-10-11T12:00:00Z'
    }
  },
  {
    id: 'donor-user-1',
    email: 'suspended.donor@example.com',
    role: 'donor' as const,
    status: 'suspended' as const,
    createdAt: '2026-09-01T00:00:00Z',
    details: {
      fullName: 'Rahul Sharma',
      bloodGroup: 'B+',
      isAvailable: false,
      eligibleAfter: '2026-12-01',
      lastDonationDate: null
    }
  }
];

export const mockAuditLogs = {
  items: [
    {
      id: 'log-1',
      actorUserId: 'admin-001',
      action: 'admin.account.approve',
      entity: 'users',
      entityId: 'hosp-user-1',
      ipHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      metadata: { role: 'hospital', previousStatus: 'pending' },
      createdAt: '2026-10-15T12:00:00Z'
    },
    {
      id: 'log-2',
      actorUserId: 'bb-user-1',
      action: 'blood_bank.donor.deferred',
      entity: 'donors',
      entityId: 'd-101',
      ipHash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      metadata: { eligibleAfter: '2026-11-01', reason: 'Low Hb' },
      createdAt: '2026-10-15T11:30:00Z'
    }
  ],
  total: 2,
  limit: 20,
  offset: 0
};

