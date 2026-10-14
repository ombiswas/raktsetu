/**
 * Acceptance Test: End-to-end verification of Phase 8 notify-respond-expand loop & ML fallback
 *
 * Requirements:
 * 1. Stub ML server on ephemeral HTTP port
 * 2. Create request -> batches notify -> donor accept fulfils request -> status fulfilled
 * 3. Consent reveal: Hospital owner sees first name and phone for accepted candidate, audit logged
 * 4. Kill the stub server -> run still completes successfully in degraded mode (degraded=true)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpMlClient } from '../../../src/modules/matching/infrastructure/ml-client.js';
import { HybridRanker } from '../../../src/modules/matching/domain/hybrid-ranker.js';
import { CreateMatchRunUseCase } from '../../../src/modules/matching/application/create-match-run.usecase.js';
import { MatchingService } from '../../../src/modules/matching/matching.service.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import type {
  ISpatialCandidateRepository,
  BloodRequestLookup,
  CandidateSpatialRecord,
  MatchRunRecord,
  MatchCandidateRecord,
  PersistMatchRunInput,
  PersistCandidateInput,
  AcceptedCandidateContact
} from '../../../src/modules/matching/infrastructure/spatial-candidate.repository.js';
import type { INotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import type { AuditService } from '../../../src/modules/audit/audit.service.js';
import { ConsoleMailer } from '../../../src/modules/notifications/infrastructure/mailer.js';
import { DefaultWebPushClient } from '../../../src/modules/notifications/infrastructure/web-push-client.js';

describe('Phase 8 Acceptance: End-to-End ML Matching, Response Loop & Degraded Mode', () => {
  let stubServer: http.Server | null = null;
  let stubServerUrl = '';
  let stubCallCount = 0;

  const hospitalId = '11111111-1111-1111-1111-111111111111';
  const donor1Id = '22222222-2222-2222-2222-222222222222';
  const donor2Id = '33333333-3333-3333-3333-333333333333';

  const request1Id = 'req-1111-1111-1111-1111';
  const request2Id = 'req-2222-2222-2222-2222';

  const sampleRequest1: BloodRequestLookup = {
    id: request1Id,
    hospitalId,
    bloodGroup: 'O+',
    component: 'whole_blood',
    unitsRequired: 1,
    urgency: 'critical',
    status: 'matching',
    neededBy: new Date('2026-10-15T00:00:00Z'),
    location: { latitude: 28.5355, longitude: 77.291 }
  };

  const sampleRequest2: BloodRequestLookup = {
    id: request2Id,
    hospitalId,
    bloodGroup: 'O+',
    component: 'whole_blood',
    unitsRequired: 1,
    urgency: 'critical',
    status: 'matching',
    neededBy: new Date('2026-10-15T00:00:00Z'),
    location: { latitude: 28.5355, longitude: 77.291 }
  };

  const candidateDonors: CandidateSpatialRecord[] = [
    {
      donorId: donor1Id,
      bloodGroup: 'O+',
      dateOfBirth: '1995-05-15',
      weightKg: 70,
      sex: 'male',
      isAvailable: true,
      availableFrom: null,
      eligibleAfter: null,
      lastDonationDate: '2026-06-01',
      distanceMeters: 1200,
      lastRespondedAt: null
    },
    {
      donorId: donor2Id,
      bloodGroup: 'O+',
      dateOfBirth: '1992-08-10',
      weightKg: 65,
      sex: 'female',
      isAvailable: true,
      availableFrom: null,
      eligibleAfter: null,
      lastDonationDate: '2026-05-20',
      distanceMeters: 2800,
      lastRespondedAt: null
    }
  ];

  beforeAll(async () => {
    // 1. Start live local stub ML server on ephemeral port
    stubServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/predict/response') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          stubCallCount++;
          const parsed = JSON.parse(body);
          const predictions = (parsed.candidates || []).map((c: { donor_id: string }) => ({
            donor_id: c.donor_id,
            probability: c.donor_id === donor1Id ? 0.91 : 0.65,
            model_version: 'v1.0.0-xgb-stub',
            is_simulation: true
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              request_id: parsed.request_id,
              predictions,
              model_version: 'v1.0.0-xgb-stub',
              timestamp: new Date().toISOString()
            })
          );
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      stubServer!.listen(0, '127.0.0.1', () => {
        const addr = stubServer!.address() as AddressInfo;
        stubServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (stubServer) {
      await new Promise<void>((resolve) => stubServer!.close(() => resolve()));
    }
  });

  it('runs complete acceptance scenario: Stub ML active -> batch notify -> donor accept -> fulfill -> kill stub -> degraded mode completes', async () => {
    // Data store for mock repository
    const runsStore = new Map<string, MatchRunRecord>();
    const candidatesStore = new Map<string, MatchCandidateRecord[]>();
    const requestsStore = new Map<string, BloodRequestLookup>([
      [request1Id, { ...sampleRequest1 }],
      [request2Id, { ...sampleRequest2 }]
    ]);

    const auditEvents: Array<{ action: string; metadata: unknown }> = [];

    const mockAuditService: AuditService = {
      record: vi.fn().mockImplementation((event) => {
        auditEvents.push(event);
        return Promise.resolve();
      })
    } as unknown as AuditService;

    const dispatchedNotifications: unknown[] = [];
    const mockNotifRepo: INotificationsRepository = {
      createNotification: vi.fn().mockImplementation((userId, kind, payload) => {
        const record = {
          id: `notif-${dispatchedNotifications.length + 1}`,
          userId,
          kind,
          payload,
          readAt: null,
          createdAt: new Date().toISOString()
        };
        dispatchedNotifications.push(record);
        return Promise.resolve(record);
      }),
      findNotificationsByUserId: vi.fn().mockResolvedValue([]),
      markAsRead: vi.fn().mockResolvedValue(true),
      findPushSubscriptionsByUserId: vi.fn().mockResolvedValue([]),
      upsertPushSubscription: vi.fn().mockResolvedValue(undefined),
      deletePushSubscription: vi.fn().mockResolvedValue(undefined),
      findUserEmail: vi.fn().mockResolvedValue('donor@example.com')
    };

    const notificationsService = new NotificationsService(
      mockNotifRepo,
      new ConsoleMailer(),
      new DefaultWebPushClient()
    );

    const mockRepo: ISpatialCandidateRepository = {
      findRequestById: vi.fn().mockImplementation((id: string) => Promise.resolve(requestsStore.get(id) ?? null)),
      findCandidatesWithinRadius: vi.fn().mockResolvedValue(candidateDonors),
      persistMatchRun: vi.fn().mockImplementation((runData: PersistMatchRunInput, cands: PersistCandidateInput[]) => {
        const runId = `run-${runsStore.size + 1}`;
        const runRecord: MatchRunRecord = {
          id: runId,
          requestId: runData.requestId,
          algorithm: runData.algorithm,
          algorithmVersion: runData.algorithmVersion,
          config: runData.config,
          modelVersion: runData.modelVersion ?? null,
          degraded: runData.degraded ?? false,
          createdAt: new Date()
        };
        runsStore.set(runId, runRecord);

        const candRecords: MatchCandidateRecord[] = cands.map((c, i) => ({
          id: `cand-${runId}-${i + 1}`,
          runId,
          donorId: c.donorId,
          rank: c.rank,
          score: c.score,
          pResponse: c.pResponse ?? null,
          distanceM: c.distanceMeters,
          travelSeconds: c.travelSeconds ?? null,
          batchNo: c.batchNo ?? 1,
          notifiedAt: c.notifiedAt ?? null,
          response: 'pending',
          respondedAt: null,
          createdAt: new Date()
        }));
        candidatesStore.set(runId, candRecords);

        return Promise.resolve({ run: runRecord, candidateCount: candRecords.length });
      }),
      findLatestRunByRequestId: vi.fn().mockImplementation((reqId: string) => {
        for (const run of Array.from(runsStore.values()).reverse()) {
          if (run.requestId === reqId) return Promise.resolve(run);
        }
        return Promise.resolve(null);
      }),
      findCandidatesByRunId: vi.fn().mockImplementation((rId: string) => {
        return Promise.resolve(candidatesStore.get(rId) ?? []);
      }),
      findDonorHistoryForFeatures: vi.fn().mockResolvedValue({ donations: [], candidateHistory: [] }),
      findCandidateByRequestAndDonor: vi.fn().mockImplementation((reqId: string, dId: string) => {
        for (const [rId, cList] of candidatesStore.entries()) {
          const run = runsStore.get(rId);
          if (run?.requestId === reqId) {
            const found = cList.find((c) => c.donorId === dId);
            if (found) return Promise.resolve(found);
          }
        }
        return Promise.resolve(null);
      }),
      recordDonorResponse: vi.fn().mockImplementation((candidateId: string, action: 'accepted' | 'declined') => {
        for (const cList of candidatesStore.values()) {
          const cand = cList.find((c) => c.id === candidateId);
          if (cand) {
            cand.response = action;
            cand.respondedAt = new Date();
            const run = runsStore.get(cand.runId)!;
            const req = requestsStore.get(run.requestId)!;
            const acceptedCount = cList.filter((c) => c.response === 'accepted').length;
            const isFulfilled = acceptedCount >= req.unitsRequired;
            if (isFulfilled) {
              req.status = 'fulfilled';
            }
            return Promise.resolve({
              candidateId,
              donorId: cand.donorId,
              requestId: run.requestId,
              response: action,
              isFulfilled,
              acceptedCount,
              unitsRequired: req.unitsRequired
            });
          }
        }
        throw new Error('Candidate not found');
      }),
      markBatchPendingAsNoResponse: vi.fn().mockResolvedValue(0),
      findUnnotifiedCandidatesInRun: vi.fn().mockResolvedValue([]),
      markCandidatesNotified: vi.fn().mockResolvedValue(undefined),
      countAcceptedCandidatesForRequest: vi.fn().mockImplementation((reqId: string) => {
        for (const [rId, cList] of candidatesStore.entries()) {
          const run = runsStore.get(rId);
          if (run?.requestId === reqId) {
            return Promise.resolve(cList.filter((c) => c.response === 'accepted').length);
          }
        }
        return Promise.resolve(0);
      }),
      findAcceptedCandidateContact: vi.fn().mockImplementation((_reqId: string, candidateId: string): Promise<AcceptedCandidateContact | null> => {
        for (const cList of candidatesStore.values()) {
          const cand = cList.find((c) => c.id === candidateId);
          if (cand && cand.response === 'accepted') {
            return Promise.resolve({
              candidateId: cand.id,
              donorId: cand.donorId,
              firstName: 'Aarav',
              phone: '+919876543210',
              email: 'aarav@example.com'
            });
          }
        }
        return Promise.resolve(null);
      }),
      appendCandidatesToRun: vi.fn().mockResolvedValue(0)
    };

    const mlClient = new HttpMlClient({
      baseUrl: stubServerUrl,
      token: 'bearer-test-token',
      timeoutMs: 800
    });

    const matchingService = new MatchingService(mockRepo, mockAuditService);
    const createMatchRunUseCase = new CreateMatchRunUseCase(
      mockRepo,
      new HybridRanker(),
      undefined,
      {
        initialRadiusMeters: 5000,
        radiusStepMeters: 5000,
        maxRadiusMeters: 25000,
        minCandidates: 1
      },
      {
        responsePredictor: mlClient,
        notificationsService,
        batchSize: 1 // Notify top 1 in batch 1
      }
    );

    // =========================================================================
    // STEP 1: Execute Match Run 1 with Live Stub ML Server
    // =========================================================================
    const result1 = await createMatchRunUseCase.execute({ requestId: request1Id });
    expect(result1.candidateCount).toBe(2);
    expect(stubCallCount).toBeGreaterThan(0);

    const run1 = await mockRepo.findLatestRunByRequestId(request1Id);
    expect(run1).toBeDefined();
    expect(run1?.algorithm).toBe('hybrid');
    expect(run1?.degraded).toBe(false);
    expect(run1?.modelVersion).toBe('v1.0.0-xgb-stub');

    const candidates1 = await mockRepo.findCandidatesByRunId(run1!.id);
    expect(candidates1).toHaveLength(2);

    // Verify Rank 1 candidate was assigned to Batch 1 and notified
    const rank1Candidate = candidates1[0];
    expect(rank1Candidate.donorId).toBe(donor1Id);
    expect(rank1Candidate.batchNo).toBe(1);
    expect(rank1Candidate.notifiedAt).not.toBeNull();
    expect(rank1Candidate.pResponse).toBe(0.91);
    expect(dispatchedNotifications).toHaveLength(1);

    // =========================================================================
    // STEP 2: Donor Responds via POST /v1/requests/:id/respond -> Accepts
    // =========================================================================
    const respondResult = await matchingService.respondToRequest(
      request1Id,
      donor1Id,
      'accept'
    );
    expect(respondResult.success).toBe(true);
    expect(respondResult.response).toBe('accepted');
    expect(respondResult.isFulfilled).toBe(true);

    // Blood request status is now fulfilled
    const updatedRequest1 = await mockRepo.findRequestById(request1Id);
    expect(updatedRequest1?.status).toBe('fulfilled');

    // Reveal Rule: Hospital owner inspects matching status and receives contact details
    const hospitalStatus = await matchingService.getMatchingStatus(request1Id, {
      id: hospitalId,
      role: 'hospital'
    });
    const revealedCand = hospitalStatus.candidates.find((c) => c.id === rank1Candidate.id);
    expect(revealedCand?.responseStatus).toBe('accepted');
    expect(revealedCand?.firstName).toBe('Aarav');
    expect(revealedCand?.phone).toBe('+919876543210');

    // Audit log verifies reveal was recorded
    expect(auditEvents.some((e) => e.action === 'donor_contact_revealed')).toBe(true);

    // =========================================================================
    // STEP 3: KILL THE STUB ML SERVER
    // =========================================================================
    await new Promise<void>((resolve) => stubServer!.close(() => resolve()));
    stubServer = null;

    // =========================================================================
    // STEP 4: Execute Match Run 2 with Stub ML Down -> Completes in Degraded Mode
    // =========================================================================
    const result2 = await createMatchRunUseCase.execute({ requestId: request2Id });
    expect(result2.candidateCount).toBe(2);

    const run2 = await mockRepo.findLatestRunByRequestId(request2Id);
    expect(run2).toBeDefined();
    expect(run2?.algorithm).toBe('hybrid');
    expect(run2?.degraded).toBe(true); // Gracefully completed in degraded mode!

    const candidates2 = await mockRepo.findCandidatesByRunId(run2!.id);
    expect(candidates2).toHaveLength(2);
    // Candidates are ranked by proximity fallback without error
    expect(candidates2[0].distanceM).toBeLessThanOrEqual(candidates2[1].distanceM);
  });
});
