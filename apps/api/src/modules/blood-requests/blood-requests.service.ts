import crypto from 'node:crypto';
import type { IBloodRequestsRepository } from './blood-requests.types.js';
import type { AuditService } from '../audit/audit.service.js';
import type { IRequestEventBus } from './domain/events.js';
import { requestEventBus as defaultEventBus } from './domain/events.js';
import { transitionRequestStatus } from './domain/state-machine.js';
import {
  ForbiddenError,
  NotFoundError,
  ConflictError
} from '../../platform/http/errors.js';
import type {
  CreateBloodRequestInput,
  BloodRequestFilter,
  HospitalBloodRequestView,
  ReadOnlyBloodRequestView,
  BloodRequestRecord
} from './blood-requests.types.js';

export class BloodRequestsService {
  constructor(
    private readonly repository: IBloodRequestsRepository,
    private readonly audit: AuditService,
    private readonly eventBus: IRequestEventBus = defaultEventBus
  ) {}

  public async createRequest(
    hospitalUserId: string,
    input: CreateBloodRequestInput,
    idempotencyKey?: string
  ): Promise<HospitalBloodRequestView> {
    // 1. Idempotency Check
    let requestHash: string | undefined;
    if (idempotencyKey) {
      requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex');

      const existing = await this.repository.findIdempotencyKey(
        idempotencyKey,
        hospitalUserId
      );

      if (existing) {
        if (existing.requestHash === requestHash) {
          return existing.responseBody as HospitalBloodRequestView;
        }
        throw new ConflictError(
          'Idempotency key has already been used with a different request payload'
        );
      }
    }

    // 2. Hospital Verification Check
    const hospital = await this.repository.findHospitalById(hospitalUserId);
    if (!hospital) {
      throw new NotFoundError('Hospital profile not found for authenticated user');
    }

    if (!hospital.verifiedAt) {
      throw new ForbiddenError(
        'Hospital account must be verified by an administrator before creating blood requests'
      );
    }

    // 3. Location is copied strictly from hospital record, NEVER from the client
    const location = hospital.location;

    // 4. Create Blood Request
    const neededByDate = new Date(input.neededBy);
    const created = await this.repository.createRequest({
      hospitalId: hospitalUserId,
      bloodGroup: input.bloodGroup,
      component: input.component,
      unitsRequired: input.unitsRequired,
      urgency: input.urgency,
      neededBy: neededByDate,
      location
    });

    const view = this.mapToHospitalView(created);

    // 5. Emit Domain Event
    this.eventBus.emit({
      type: 'RequestCreated',
      occurredAt: new Date(),
      payload: {
        requestId: created.id,
        hospitalId: created.hospitalId,
        bloodGroup: created.bloodGroup,
        component: created.component,
        unitsRequired: created.unitsRequired,
        urgency: created.urgency,
        neededBy: created.neededBy,
        location: created.location
      }
    });

    // 6. Audit Trail
    await this.audit.record({
      actorUserId: hospitalUserId,
      action: 'request.created',
      entity: 'blood_request',
      entityId: created.id,
      metadata: {
        bloodGroup: created.bloodGroup,
        component: created.component,
        unitsRequired: created.unitsRequired,
        urgency: created.urgency,
        neededBy: created.neededBy.toISOString()
      }
    });

    // 7. Store Idempotency Key (Valid for 24h)
    if (idempotencyKey && requestHash) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.repository.saveIdempotencyKey({
        key: idempotencyKey,
        userId: hospitalUserId,
        requestHash,
        responseCode: 201,
        responseBody: view,
        expiresAt
      });
    }

    return view;
  }

  public async getRequestById(
    requestId: string,
    principal: { userId: string; role: string }
  ): Promise<HospitalBloodRequestView | ReadOnlyBloodRequestView> {
    if (principal.role === 'hospital') {
      const record = await this.repository.findRequestById(requestId);
      if (!record) {
        throw new NotFoundError(`Blood request '${requestId}' not found`);
      }

      if (record.hospitalId !== principal.userId) {
        throw new ForbiddenError('Access to this blood request is forbidden');
      }

      return this.mapToHospitalView(record);
    }

    if (principal.role === 'blood_bank' || principal.role === 'admin') {
      const result = await this.repository.findRequestWithHospitalDetails(requestId);
      if (!result) {
        throw new NotFoundError(`Blood request '${requestId}' not found`);
      }

      return this.mapToReadOnlyView(
        result.request,
        result.hospitalName,
        result.hospitalAddress
      );
    }

    throw new ForbiddenError('Access to blood request is forbidden for this role');
  }

  public async listRequests(
    principal: { userId: string; role: string },
    filter?: BloodRequestFilter
  ): Promise<HospitalBloodRequestView[] | ReadOnlyBloodRequestView[]> {
    if (principal.role === 'hospital') {
      const rows = await this.repository.listRequestsByHospital(principal.userId, filter);
      return rows.map((r) => this.mapToHospitalView(r));
    }

    if (principal.role === 'blood_bank' || principal.role === 'admin') {
      const rows = await this.repository.listAllRequests(filter);
      return rows.map((r) =>
        this.mapToReadOnlyView(r.request, r.hospitalName, r.hospitalAddress)
      );
    }

    throw new ForbiddenError('Access to blood requests is forbidden for this role');
  }

  public async cancelRequest(
    requestId: string,
    hospitalUserId: string,
    reason?: string
  ): Promise<HospitalBloodRequestView> {
    const record = await this.repository.findRequestById(requestId);
    if (!record) {
      throw new NotFoundError(`Blood request '${requestId}' not found`);
    }

    if (record.hospitalId !== hospitalUserId) {
      throw new ForbiddenError('You can only cancel blood requests owned by your hospital');
    }

    // Pure domain state machine transition verification
    const previousStatus = record.status;
    const newStatus = transitionRequestStatus(previousStatus, 'cancelled');

    const updated = await this.repository.updateRequestStatus(requestId, newStatus);
    if (!updated) {
      throw new NotFoundError(`Blood request '${requestId}' could not be updated`);
    }

    const view = this.mapToHospitalView(updated);

    // Emit domain event
    this.eventBus.emit({
      type: 'RequestStatusChanged',
      occurredAt: new Date(),
      payload: {
        requestId,
        hospitalId: hospitalUserId,
        previousStatus,
        newStatus,
        reason
      }
    });

    // Audit trail
    await this.audit.record({
      actorUserId: hospitalUserId,
      action: 'request.cancelled',
      entity: 'blood_request',
      entityId: requestId,
      metadata: {
        previousStatus,
        newStatus,
        reason: reason ?? null
      }
    });

    return view;
  }

  public async expireOverdueRequests(asOfDate?: Date): Promise<number> {
    const cutoffDate = asOfDate ?? new Date();
    const expiredList = await this.repository.findAndExpireOverdueRequests(cutoffDate);

    for (const record of expiredList) {
      this.eventBus.emit({
        type: 'RequestStatusChanged',
        occurredAt: new Date(),
        payload: {
          requestId: record.id,
          hospitalId: record.hospitalId,
          previousStatus: record.status,
          newStatus: 'expired',
          reason: 'Needed by date passed'
        }
      });

      await this.audit.record({
        action: 'request.expired',
        entity: 'blood_request',
        entityId: record.id,
        metadata: {
          previousStatus: record.status,
          neededBy: record.neededBy.toISOString(),
          cutoffDate: cutoffDate.toISOString()
        }
      });
    }

    return expiredList.length;
  }

  private mapToHospitalView(record: BloodRequestRecord): HospitalBloodRequestView {
    return {
      id: record.id,
      hospitalId: record.hospitalId,
      bloodGroup: record.bloodGroup,
      component: record.component,
      unitsRequired: record.unitsRequired,
      unitsFulfilled: record.unitsFulfilled,
      urgency: record.urgency,
      status: record.status,
      neededBy: record.neededBy.toISOString(),
      location: record.location,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapToReadOnlyView(
    record: BloodRequestRecord,
    hospitalName: string,
    hospitalAddress: string
  ): ReadOnlyBloodRequestView {
    return {
      id: record.id,
      hospitalId: record.hospitalId,
      hospitalName,
      hospitalAddress,
      bloodGroup: record.bloodGroup,
      component: record.component,
      unitsRequired: record.unitsRequired,
      unitsFulfilled: record.unitsFulfilled,
      urgency: record.urgency,
      status: record.status,
      neededBy: record.neededBy.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
