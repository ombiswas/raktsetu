import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchingService } from '../../../src/modules/matching/matching.service.js';
import { BatchExpansionUseCase } from '../../../src/modules/matching/application/batch-expansion.usecase.js';
import { executeBatchTimeoutOnce } from '../../../src/modules/matching/jobs/match-batch-timeout.job.js';
import type {
  ISpatialCandidateRepository,
  BloodRequestLookup,
  MatchRunRecord,
  MatchCandidateRecord,
  DonorResponseResult,
  AcceptedCandidateContact
} from '../../../src/modules/matching/infrastructure/spatial-candidate.repository.js';
import type { AuditService } from '../../../src/modules/audit/audit.service.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';

describe('Matching Respond & Adaptive Batch Expansion Loop', () => {
  const hospitalOwnerId = '11111111-1111-1111-1111-111111111111';
  const otherHospitalId = '22222222-2222-2222-2222-222222222222';
  const adminId = '33333333-3333-3333-3333-333333333333';
  const donorAcceptedId = '44444444-4444-4444-4444-444444444444';
  const donorPendingId = '55555555-5555-5555-5555-555555555555';
  const donorStrangerId = '66666666-6666-6666-6666-666666666666';

  const requestId = '77777777-7777-7777-7777-777777777777';
  const runId = '88888888-8888-8888-8888-888888888888';

  const mockRequest: BloodRequestLookup = {
    id: requestId,
    hospitalId: hospitalOwnerId,
    bloodGroup: 'O+',
    component: 'whole_blood',
    unitsRequired: 2,
    urgency: 'critical',
    status: 'matching',
    neededBy: new Date('2026-10-15T00:00:00Z'),
    location: { latitude: 28.5355, longitude: 77.291 }
  };

  const mockRun: MatchRunRecord = {
    id: runId,
    requestId,
    algorithm: 'hybrid',
    algorithmVersion: 'v1.0.0-hybrid',
    config: { batchSize: 2, batchWindowSeconds: 300, finalRadiusMeters: 5000, maxRadiusMeters: 25000, radiusStepMeters: 5000 },
    modelVersion: 'v1.0.0-xgb',
    degraded: false,
    createdAt: new Date('2026-10-14T10:00:00Z')
  };

  let candidates: MatchCandidateRecord[];
  let mockRepo: ISpatialCandidateRepository;
  let mockAuditService: AuditService;
  let mockNotificationsService: NotificationsService;
  let matchingService: MatchingService;

  beforeEach(() => {
    candidates = [
      {
        id: 'cand-1',
        runId,
        donorId: donorAcceptedId,
        rank: 1,
        score: 0.92,
        pResponse: 0.88,
        distanceM: 2100,
        travelSeconds: null,
        batchNo: 1,
        notifiedAt: new Date('2026-10-14T10:00:00Z'),
        response: 'accepted',
        respondedAt: new Date('2026-10-14T10:05:00Z'),
        createdAt: new Date('2026-10-14T10:00:00Z'),
        bloodGroup: 'O+'
      },
      {
        id: 'cand-2',
        runId,
        donorId: donorPendingId,
        rank: 2,
        score: 0.81,
        pResponse: 0.75,
        distanceM: 3400,
        travelSeconds: null,
        batchNo: 1,
        notifiedAt: new Date('2026-10-14T10:00:00Z'),
        response: 'pending',
        respondedAt: null,
        createdAt: new Date('2026-10-14T10:00:00Z'),
        bloodGroup: 'O+'
      },
      {
        id: 'cand-3',
        runId,
        donorId: 'donor-backlog-3',
        rank: 3,
        score: 0.74,
        pResponse: 0.65,
        distanceM: 4200,
        travelSeconds: null,
        batchNo: 0,
        notifiedAt: null,
        response: 'pending',
        respondedAt: null,
        createdAt: new Date('2026-10-14T10:00:00Z'),
        bloodGroup: 'O+'
      }
    ];

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuditService;

    mockNotificationsService = {
      notifyDonor: vi.fn().mockResolvedValue({
        id: 'notif-mock',
        userId: 'donor-mock',
        kind: 'donor_match_alert',
        payload: {},
        readAt: null,
        createdAt: new Date().toISOString()
      })
    } as unknown as NotificationsService;

    mockRepo = {
      findRequestById: vi.fn().mockResolvedValue(mockRequest),
      findLatestRunByRequestId: vi.fn().mockResolvedValue(mockRun),
      findCandidatesByRunId: vi.fn().mockImplementation(() => Promise.resolve(candidates)),
      findCandidatesWithinRadius: vi.fn().mockResolvedValue([]),
      persistMatchRun: vi.fn().mockResolvedValue({ run: mockRun, candidateCount: candidates.length }),
      findDonorHistoryForFeatures: vi.fn().mockResolvedValue({ donations: [], candidateHistory: [] }),
      findCandidateByRequestAndDonor: vi.fn().mockImplementation((reqId: string, dId: string) => {
        if (reqId !== requestId) return Promise.resolve(null);
        const c = candidates.find((cand) => cand.donorId === dId);
        return Promise.resolve(c ?? null);
      }),
      recordDonorResponse: vi.fn().mockImplementation(
        (candidateId: string, action: 'accepted' | 'declined'): Promise<DonorResponseResult> => {
          const cand = candidates.find((c) => c.id === candidateId);
          if (!cand) throw new Error('Candidate not found');
          cand.response = action;
          cand.respondedAt = new Date();
          const acceptedCount = candidates.filter((c) => c.response === 'accepted').length;
          return Promise.resolve({
            candidateId,
            donorId: cand.donorId,
            requestId,
            response: action,
            isFulfilled: acceptedCount >= mockRequest.unitsRequired,
            acceptedCount,
            unitsRequired: mockRequest.unitsRequired
          });
        }
      ),
      markBatchPendingAsNoResponse: vi.fn().mockImplementation((_runId: string, batchNo: number) => {
        let count = 0;
        for (const c of candidates) {
          if (c.batchNo === batchNo && c.response === 'pending') {
            c.response = 'no_response';
            count++;
          }
        }
        return Promise.resolve(count);
      }),
      findUnnotifiedCandidatesInRun: vi.fn().mockImplementation((_runId: string, limit: number) => {
        const unnotified = candidates.filter((c) => c.notifiedAt === null).slice(0, limit);
        return Promise.resolve(unnotified);
      }),
      markCandidatesNotified: vi.fn().mockImplementation((candidateIds: string[], batchNo: number, notifiedAt: Date) => {
        for (const c of candidates) {
          if (candidateIds.includes(c.id)) {
            c.batchNo = batchNo;
            c.notifiedAt = notifiedAt;
          }
        }
        return Promise.resolve(undefined);
      }),
      countAcceptedCandidatesForRequest: vi.fn().mockImplementation(() => {
        const count = candidates.filter((c) => c.response === 'accepted').length;
        return Promise.resolve(count);
      }),
      findAcceptedCandidateContact: vi.fn().mockImplementation((_reqId: string, candidateId: string): Promise<AcceptedCandidateContact | null> => {
        const cand = candidates.find((c) => c.id === candidateId);
        if (!cand || cand.response !== 'accepted') return Promise.resolve(null);
        return Promise.resolve({
          candidateId: cand.id,
          donorId: cand.donorId,
          firstName: 'Aarav',
          phone: '+919876543210',
          email: 'aarav@example.com'
        });
      }),
      appendCandidatesToRun: vi.fn().mockResolvedValue(0)
    };

    matchingService = new MatchingService(mockRepo, mockAuditService);
  });

  describe('Donor Response Flow (POST /v1/requests/:id/respond)', () => {
    it('rejects a donor who does not have an invited candidate row with 403 Forbidden', async () => {
      await expect(
        matchingService.respondToRequest(requestId, donorStrangerId, 'accept')
      ).rejects.toThrow('You are not an invited candidate for this blood request');
    });

    it('successfully records an accept response and returns fulfillment state', async () => {
      const result = await matchingService.respondToRequest(requestId, donorPendingId, 'accept');

      expect(result.success).toBe(true);
      expect(result.response).toBe('accepted');
      expect(result.isFulfilled).toBe(true); // 2 accepted >= 2 unitsRequired
      expect(mockRepo.recordDonorResponse).toHaveBeenCalledWith('cand-2', 'accepted', undefined);
    });

    it('is idempotent: repeated identical responses succeed safely without duplicate counts', async () => {
      // First call: cand-1 is already accepted
      const result1 = await matchingService.respondToRequest(requestId, donorAcceptedId, 'accept');
      expect(result1.success).toBe(true);
      expect(result1.response).toBe('accepted');

      // Repeat identical call
      const result2 = await matchingService.respondToRequest(requestId, donorAcceptedId, 'accept');
      expect(result2.success).toBe(true);
      expect(result2.response).toBe('accepted');
      expect(result2.message).toBe('Response already recorded');
    });

    it('prevents changing decision after finalizing: declining after accepting throws 409 Conflict', async () => {
      await expect(
        matchingService.respondToRequest(requestId, donorAcceptedId, 'decline')
      ).rejects.toThrow("Cannot respond 'decline': candidate decision has already been finalized as 'accepted'");
    });
  });

  describe('Consent-Based Contact Reveal Rule & Audit Logging', () => {
    it('reveals firstName and phone to hospital owner ONLY for accepted donors, and records audit log', async () => {
      const statusView = await matchingService.getMatchingStatus(requestId, {
        id: hospitalOwnerId,
        role: 'hospital'
      });

      expect(statusView.candidates).toHaveLength(3);

      // Candidate 1 (Accepted): firstName and phone revealed to owner
      const cand1 = statusView.candidates.find((c) => c.id === 'cand-1');
      expect(cand1?.responseStatus).toBe('accepted');
      expect(cand1?.firstName).toBe('Aarav');
      expect(cand1?.phone).toBe('+919876543210');

      // Candidate 2 (Pending): contact NOT revealed
      const cand2 = statusView.candidates.find((c) => c.id === 'cand-2');
      expect(cand2?.responseStatus).toBe('pending');
      expect(cand2?.firstName).toBeUndefined();
      expect(cand2?.phone).toBeUndefined();

      // Verify audit log
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'donor_contact_revealed',
          entity: 'match_candidates',
          entityId: 'cand-1',
          actorUserId: hospitalOwnerId
        })
      );
    });

    it('does NOT reveal phone number to admin viewers', async () => {
      const statusView = await matchingService.getMatchingStatus(requestId, {
        id: adminId,
        role: 'admin'
      });

      const cand1 = statusView.candidates.find((c) => c.id === 'cand-1');
      expect(cand1?.responseStatus).toBe('accepted');
      expect(cand1?.firstName).toBe('Aarav');
      expect(cand1?.phone).toBeUndefined(); // Phone strictly hidden from non-owning entities
    });

    it('rejects another hospital attempting to inspect matching candidates with 403 Forbidden', async () => {
      await expect(
        matchingService.getMatchingStatus(requestId, {
          id: otherHospitalId,
          role: 'hospital'
        })
      ).rejects.toThrow('You are not authorized to inspect matching candidate records for this blood request');
    });
  });

  describe('Batch Escalation & Adaptive Radius Expansion Loop', () => {
    it('marks pending candidates as no_response upon batch timeout and notifies next batch', async () => {
      const useCase = new BatchExpansionUseCase(
        mockRepo,
        mockNotificationsService,
        undefined,
        2, // batchSize
        300 // batchWindowSeconds
      );

      // cand-2 was pending in batch 1
      expect(candidates[1].response).toBe('pending');
      // cand-3 was backlog in batch 0
      expect(candidates[2].notifiedAt).toBeNull();

      const result = await executeBatchTimeoutOnce(useCase, {
        requestId,
        runId,
        batchNo: 1
      });

      expect(result.status).toBe('next_batch_notified');
      expect(result.batchNo).toBe(2);
      expect(result.notifiedCount).toBe(1);

      // cand-2 transitioned to no_response
      expect(candidates[1].response).toBe('no_response');

      // cand-3 transitioned to batch 2 and notifiedAt set
      expect(candidates[2].batchNo).toBe(2);
      expect(candidates[2].notifiedAt).not.toBeNull();
      expect(mockNotificationsService.notifyDonor).toHaveBeenCalledWith('donor-backlog-3', expect.any(Object));
    });

    it('stops expanding when request is already fulfilled', async () => {
      // Set accepted count = 2 (= unitsRequired)
      candidates[1].response = 'accepted';

      const useCase = new BatchExpansionUseCase(
        mockRepo,
        mockNotificationsService,
        undefined,
        2,
        300
      );

      const result = await executeBatchTimeoutOnce(useCase, {
        requestId,
        runId,
        batchNo: 1
      });

      expect(result.status).toBe('fulfilled');
      expect(mockNotificationsService.notifyDonor).not.toHaveBeenCalled();
    });
  });
});
