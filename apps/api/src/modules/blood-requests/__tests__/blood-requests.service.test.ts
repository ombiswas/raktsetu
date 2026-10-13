import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BloodRequestsService } from '../blood-requests.service.js';
import type {
  IBloodRequestsRepository,
  HospitalProfileLookup,
  BloodRequestRecord,
  IdempotencyRecord,
  CreateBloodRequestInput
} from '../blood-requests.types.js';
import { RequestEventBus } from '../domain/events.js';
import { InvalidRequestStatusTransitionError } from '../domain/state-machine.js';
import {
  ForbiddenError,
  NotFoundError,
  ConflictError
} from '../../../platform/http/errors.js';
import type { AuditService } from '../../audit/audit.service.js';

describe('BloodRequestsService Unit Tests', () => {
  let service: BloodRequestsService;
  let mockRepo: IBloodRequestsRepository;
  let mockAudit: AuditService;
  let eventBus: RequestEventBus;

  const verifiedHospitalId = 'hosp-1111-1111-1111';
  const unverifiedHospitalId = 'hosp-2222-2222-2222';
  const otherHospitalId = 'hosp-3333-3333-3333';

  const hospitalProfile: HospitalProfileLookup = {
    id: verifiedHospitalId,
    name: 'City Care Hospital',
    address: '123 Health Ave',
    location: { latitude: 28.6139, longitude: 77.209 },
    verifiedAt: new Date('2025-01-01T00:00:00Z')
  };

  const unverifiedProfile: HospitalProfileLookup = {
    id: unverifiedHospitalId,
    name: 'Pending Hospital',
    address: '456 Unverified St',
    location: { latitude: 28.5, longitude: 77.1 },
    verifiedAt: null
  };

  const sampleRequest: BloodRequestRecord = {
    id: 'req-999',
    hospitalId: verifiedHospitalId,
    bloodGroup: 'O+',
    component: 'whole_blood',
    unitsRequired: 3,
    unitsFulfilled: 0,
    urgency: 'critical',
    status: 'open',
    neededBy: new Date(Date.now() + 2 * 60 * 60 * 1000),
    location: { latitude: 28.6139, longitude: 77.209 },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  let requestsStore: Map<string, BloodRequestRecord>;
  let idempotencyStore: Map<string, IdempotencyRecord>;

  beforeEach(() => {
    requestsStore = new Map();
    idempotencyStore = new Map();
    eventBus = new RequestEventBus();

    mockRepo = {
      findHospitalById: vi.fn(async (id: string) => {
        if (id === verifiedHospitalId) return hospitalProfile;
        if (id === unverifiedHospitalId) return unverifiedProfile;
        return null;
      }),
      createRequest: vi.fn(async (data) => {
        const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const record: BloodRequestRecord = {
          id,
          hospitalId: data.hospitalId,
          bloodGroup: data.bloodGroup,
          component: data.component,
          unitsRequired: data.unitsRequired,
          unitsFulfilled: 0,
          urgency: data.urgency,
          status: 'open',
          neededBy: data.neededBy,
          location: data.location,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        requestsStore.set(id, record);
        return record;
      }),
      findRequestById: vi.fn(async (id: string) => requestsStore.get(id) ?? null),
      findRequestWithHospitalDetails: vi.fn(async (id: string) => {
        const req = requestsStore.get(id);
        if (!req) return null;
        return {
          request: req,
          hospitalName: 'City Care Hospital',
          hospitalAddress: '123 Health Ave'
        };
      }),
      listRequestsByHospital: vi.fn(async (hospId: string) => {
        return Array.from(requestsStore.values()).filter((r) => r.hospitalId === hospId);
      }),
      listAllRequests: vi.fn(async () => {
        return Array.from(requestsStore.values()).map((r) => ({
          request: r,
          hospitalName: 'City Care Hospital',
          hospitalAddress: '123 Health Ave'
        }));
      }),
      updateRequestStatus: vi.fn(async (id: string, status) => {
        const req = requestsStore.get(id);
        if (!req) return null;
        const updated = { ...req, status, updatedAt: new Date() };
        requestsStore.set(id, updated);
        return updated;
      }),
      findAndExpireOverdueRequests: vi.fn(async (asOfDate: Date) => {
        const expired: BloodRequestRecord[] = [];
        for (const [id, req] of requestsStore.entries()) {
          if (
            (req.status === 'open' || req.status === 'matching') &&
            req.neededBy.getTime() < asOfDate.getTime()
          ) {
            const updated = { ...req, status: 'expired' as const, updatedAt: new Date() };
            requestsStore.set(id, updated);
            expired.push(updated);
          }
        }
        return expired;
      }),
      findIdempotencyKey: vi.fn(async (key: string, userId: string) => {
        const stored = idempotencyStore.get(`${userId}:${key}`);
        if (!stored) return null;
        if (stored.expiresAt.getTime() <= Date.now()) return null;
        return stored;
      }),
      saveIdempotencyKey: vi.fn(async (record) => {
        idempotencyStore.set(`${record.userId}:${record.key}`, record);
      })
    };

    mockAudit = {
      record: vi.fn(async () => {}),
      hashIp: vi.fn(() => 'hashed-ip')
    } as unknown as AuditService;

    service = new BloodRequestsService(mockRepo, mockAudit, eventBus);
  });

  describe('1. Request Creation & Hospital Verification', () => {
    const validPayload: CreateBloodRequestInput = {
      bloodGroup: 'O+',
      component: 'whole_blood',
      unitsRequired: 2,
      urgency: 'critical',
      neededBy: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    };

    it('creates blood request for verified hospital and copies location strictly from hospital record', async () => {
      const eventSpy = vi.fn();
      eventBus.subscribe('RequestCreated', eventSpy);

      const result = await service.createRequest(verifiedHospitalId, validPayload);

      expect(result.id).toBeDefined();
      expect(result.hospitalId).toBe(verifiedHospitalId);
      expect(result.status).toBe('open');
      expect(result.bloodGroup).toBe('O+');
      expect(result.unitsRequired).toBe(2);
      expect(result.location).toEqual(hospitalProfile.location);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0]![0].payload.requestId).toBe(result.id);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request.created',
          actorUserId: verifiedHospitalId,
          entityId: result.id
        })
      );
    });

    it('rejects creation with 403 if hospital is unverified', async () => {
      await expect(
        service.createRequest(unverifiedHospitalId, validPayload)
      ).rejects.toThrowError(ForbiddenError);

      expect(requestsStore.size).toBe(0);
    });

    it('rejects creation with 404 if hospital record does not exist', async () => {
      await expect(
        service.createRequest('non-existent-hosp', validPayload)
      ).rejects.toThrowError(NotFoundError);
    });
  });

  describe('2. Idempotency Key Replay', () => {
    const payload: CreateBloodRequestInput = {
      bloodGroup: 'B+',
      component: 'platelets',
      unitsRequired: 4,
      urgency: 'urgent',
      neededBy: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    };
    const key = 'idem-req-abc-123';

    it('returns exact original response on duplicate submission without creating second request', async () => {
      const firstResponse = await service.createRequest(verifiedHospitalId, payload, key);
      expect(requestsStore.size).toBe(1);

      const secondResponse = await service.createRequest(verifiedHospitalId, payload, key);
      expect(requestsStore.size).toBe(1); // No new request created!
      expect(secondResponse).toEqual(firstResponse);
    });

    it('throws 409 Conflict if same idempotency key is reused with different payload', async () => {
      await service.createRequest(verifiedHospitalId, payload, key);

      const modifiedPayload: CreateBloodRequestInput = {
        ...payload,
        unitsRequired: 10
      };

      await expect(
        service.createRequest(verifiedHospitalId, modifiedPayload, key)
      ).rejects.toThrowError(ConflictError);
    });
  });

  describe('3. Scoped Reads & Ownership', () => {
    beforeEach(() => {
      requestsStore.set(sampleRequest.id, sampleRequest);
    });

    it('owning hospital can retrieve full details including location', async () => {
      const result = await service.getRequestById(sampleRequest.id, {
        userId: verifiedHospitalId,
        role: 'hospital'
      });

      expect(result.id).toBe(sampleRequest.id);
      expect(result).toHaveProperty('location');
    });

    it('other hospital attempting to read request throws 403 Forbidden', async () => {
      await expect(
        service.getRequestById(sampleRequest.id, {
          userId: otherHospitalId,
          role: 'hospital'
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it('blood bank and admin get read-only view with hospital name & address', async () => {
      const bbResult = await service.getRequestById(sampleRequest.id, {
        userId: 'bb-1',
        role: 'blood_bank'
      });

      expect(bbResult.id).toBe(sampleRequest.id);
      expect(bbResult).toHaveProperty('hospitalName', 'City Care Hospital');
      expect(bbResult).toHaveProperty('hospitalAddress', '123 Health Ave');

      const adminResult = await service.getRequestById(sampleRequest.id, {
        userId: 'admin-1',
        role: 'admin'
      });
      expect(adminResult.id).toBe(sampleRequest.id);
    });

    it('donor role is forbidden from reading blood requests', async () => {
      await expect(
        service.getRequestById(sampleRequest.id, {
          userId: 'donor-1',
          role: 'donor'
        })
      ).rejects.toThrowError(ForbiddenError);
    });
  });

  describe('4. Cancellation Workflow', () => {
    beforeEach(() => {
      requestsStore.set(sampleRequest.id, { ...sampleRequest, status: 'open' });
    });

    it('owning hospital can cancel an open request', async () => {
      const statusSpy = vi.fn();
      eventBus.subscribe('RequestStatusChanged', statusSpy);

      const updated = await service.cancelRequest(
        sampleRequest.id,
        verifiedHospitalId,
        'Patient recovered'
      );

      expect(updated.status).toBe('cancelled');
      expect(statusSpy).toHaveBeenCalledTimes(1);
      expect(statusSpy.mock.calls[0]![0].payload).toMatchObject({
        requestId: sampleRequest.id,
        previousStatus: 'open',
        newStatus: 'cancelled'
      });

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request.cancelled',
          actorUserId: verifiedHospitalId
        })
      );
    });

    it('other hospital cannot cancel request (403 Forbidden)', async () => {
      await expect(
        service.cancelRequest(sampleRequest.id, otherHospitalId)
      ).rejects.toThrowError(ForbiddenError);
    });

    it('throws 409 Conflict when cancelling a fulfilled request', async () => {
      requestsStore.set(sampleRequest.id, { ...sampleRequest, status: 'fulfilled' });

      await expect(
        service.cancelRequest(sampleRequest.id, verifiedHospitalId)
      ).rejects.toThrowError(InvalidRequestStatusTransitionError);
    });
  });

  describe('5. Expiry Job Execution & Idempotence', () => {
    const pastNeededBy = new Date(Date.now() - 10 * 60 * 1000); // 10 mins ago
    const futureNeededBy = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead

    beforeEach(() => {
      // Overdue open request -> should expire
      requestsStore.set('req-overdue-1', {
        ...sampleRequest,
        id: 'req-overdue-1',
        status: 'open',
        neededBy: pastNeededBy
      });

      // Overdue matching request -> should expire
      requestsStore.set('req-overdue-2', {
        ...sampleRequest,
        id: 'req-overdue-2',
        status: 'matching',
        neededBy: pastNeededBy
      });

      // Overdue but fulfilled request -> terminal state, must NOT expire
      requestsStore.set('req-fulfilled', {
        ...sampleRequest,
        id: 'req-fulfilled',
        status: 'fulfilled',
        neededBy: pastNeededBy
      });

      // Future request -> must NOT expire
      requestsStore.set('req-future', {
        ...sampleRequest,
        id: 'req-future',
        status: 'open',
        neededBy: futureNeededBy
      });
    });

    it('expires overdue open and matching requests and leaves future/fulfilled requests alone', async () => {
      const statusSpy = vi.fn();
      eventBus.subscribe('RequestStatusChanged', statusSpy);

      const expiredCount = await service.expireOverdueRequests();

      expect(expiredCount).toBe(2);
      expect(requestsStore.get('req-overdue-1')?.status).toBe('expired');
      expect(requestsStore.get('req-overdue-2')?.status).toBe('expired');
      expect(requestsStore.get('req-fulfilled')?.status).toBe('fulfilled');
      expect(requestsStore.get('req-future')?.status).toBe('open');

      expect(statusSpy).toHaveBeenCalledTimes(2);
    });

    it('is completely idempotent when executed repeatedly', async () => {
      const firstRun = await service.expireOverdueRequests();
      expect(firstRun).toBe(2);

      const secondRun = await service.expireOverdueRequests();
      expect(secondRun).toBe(0); // Second run finds zero pending overdue requests
    });
  });
});
