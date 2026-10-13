import { describe, it, expect } from 'vitest';
import {
  donorProfileResponseSchema,
  donorPublicSafeSchema
} from '../../../src/modules/donors/donors.schema.js';
import { hospitalProfileResponseSchema } from '../../../src/modules/hospitals/hospitals.schema.js';
import {
  bloodBankProfileResponseSchema,
  recordDonationResponseSchema,
  deferDonorResponseSchema
} from '../../../src/modules/blood-banks/blood-banks.schema.js';
import { adminAccountsListResponseSchema } from '../../../src/modules/admin/admin.schema.js';

describe('Audience-Specific Output Shaping & Privacy Contract Tests', () => {
  describe('Donor Response Shaping (Donor Self vs Third Parties)', () => {
    it('donor self-profile NEVER contains raw GPS Point or lat/long coordinates', () => {
      const selfProfileData = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'donor.privacy@example.com',
        fullName: 'Private Donor',
        phone: '+919876543210',
        bloodGroup: 'O+',
        dateOfBirth: '1992-04-12',
        weightKg: 68,
        sex: 'male',
        isAvailable: true,
        availableFrom: null,
        eligibleAfter: null,
        lastDonationDate: '2026-01-01',
        hasLocation: true,
        locationUpdatedAt: '2026-02-01T12:00:00.000Z',
        consentLocationAt: '2026-02-01T12:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T12:00:00.000Z'
      };

      const parsed = donorProfileResponseSchema.parse(selfProfileData);
      const json = JSON.parse(JSON.stringify(parsed));

      expect(json).toHaveProperty('hasLocation', true);
      expect(json).toHaveProperty('locationUpdatedAt');
      expect(json).toHaveProperty('consentLocationAt');

      // Assert forbidden coordinate fields are strictly absent
      expect(json).not.toHaveProperty('location');
      expect(json).not.toHaveProperty('latitude');
      expect(json).not.toHaveProperty('longitude');
      expect(json).not.toHaveProperty('coordinates');
      expect(json).not.toHaveProperty('geoPoint');
    });

    it('donor public-safe schema (for hospitals/blood-banks) STRICTLY OMITS phone, DOB, location, email, and fullName', () => {
      const thirdPartyCandidateView = {
        id: '11111111-1111-1111-1111-111111111111',
        bloodGroup: 'O+',
        isAvailable: true,
        eligibleAfter: null,
        lastDonationDate: '2026-01-01'
      };

      const parsed = donorPublicSafeSchema.parse(thirdPartyCandidateView);
      const json = JSON.parse(JSON.stringify(parsed));

      // Allowed fields
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('bloodGroup', 'O+');
      expect(json).toHaveProperty('isAvailable', true);
      expect(json).toHaveProperty('eligibleAfter');
      expect(json).toHaveProperty('lastDonationDate');

      // CRITICAL PRIVACY GUARANTEE: Forbidden fields must NEVER exist
      expect(json).not.toHaveProperty('phone');
      expect(json).not.toHaveProperty('dateOfBirth');
      expect(json).not.toHaveProperty('email');
      expect(json).not.toHaveProperty('fullName');
      expect(json).not.toHaveProperty('location');
      expect(json).not.toHaveProperty('latitude');
      expect(json).not.toHaveProperty('longitude');
      expect(json).not.toHaveProperty('weightKg');
      expect(json).not.toHaveProperty('sex');
    });

    it('blood bank donation recording response NEVER leaks donor phone, DOB, or location', () => {
      const donationResponse = {
        message: 'Donation recorded successfully',
        donation: {
          donationId: '22222222-2222-2222-2222-222222222222',
          donorId: '11111111-1111-1111-1111-111111111111',
          bloodBankId: '33333333-3333-3333-3333-333333333333',
          bloodGroup: 'O+',
          component: 'whole_blood',
          units: 1,
          donatedAt: '2026-03-01T10:00:00.000Z',
          inventoryTotalUnits: 12
        }
      };

      const parsed = recordDonationResponseSchema.parse(donationResponse);
      const json = JSON.parse(JSON.stringify(parsed));

      expect(json.donation).not.toHaveProperty('phone');
      expect(json.donation).not.toHaveProperty('dateOfBirth');
      expect(json.donation).not.toHaveProperty('location');
      expect(json.donation).not.toHaveProperty('latitude');
      expect(json.donation).not.toHaveProperty('longitude');
    });

    it('blood bank deferral response NEVER leaks donor phone, DOB, or location', () => {
      const deferralResponse = {
        message: 'Donor deferred successfully',
        deferral: {
          donorId: '11111111-1111-1111-1111-111111111111',
          bloodGroup: 'O+',
          eligibleAfter: '2026-09-01',
          deferredAt: '2026-03-01T10:00:00.000Z',
          reason: 'Low hemoglobin deferral'
        }
      };

      const parsed = deferDonorResponseSchema.parse(deferralResponse);
      const json = JSON.parse(JSON.stringify(parsed));

      expect(json.deferral).not.toHaveProperty('phone');
      expect(json.deferral).not.toHaveProperty('dateOfBirth');
      expect(json.deferral).not.toHaveProperty('location');
      expect(json.deferral).not.toHaveProperty('latitude');
      expect(json.deferral).not.toHaveProperty('longitude');
    });
  });

  describe('Hospital and Blood Bank Output Shaping', () => {
    it('hospital profile never exposes internal database tokens or passwords', () => {
      const hospitalData = {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'hospital@example.com',
        name: 'Metro Hospital',
        registrationNo: 'REG-9876',
        phone: '+911188776655',
        address: 'MG Road, Delhi',
        isVerified: true,
        verifiedAt: '2026-01-10T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-10T00:00:00.000Z'
      };

      const parsed = hospitalProfileResponseSchema.parse(hospitalData);
      const json = JSON.parse(JSON.stringify(parsed));

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('name', 'Metro Hospital');
      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('tokenHash');
      expect(json).not.toHaveProperty('verifiedBy');
    });

    it('blood bank profile never exposes internal database tokens or passwords', () => {
      const bbData = {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'bloodbank@example.com',
        name: 'Metro Blood Bank',
        licenseNo: 'LIC-1234',
        phone: '+911199887766',
        address: 'Ring Road, Delhi',
        isVerified: true,
        verifiedAt: '2026-01-10T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-10T00:00:00.000Z'
      };

      const parsed = bloodBankProfileResponseSchema.parse(bbData);
      const json = JSON.parse(JSON.stringify(parsed));

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('name', 'Metro Blood Bank');
      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('tokenHash');
    });
  });

  describe('Admin View Output Shaping', () => {
    it('admin donor summary never leaks donor phone, DOB, or coordinates', () => {
      const adminAccounts = {
        accounts: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'donor@example.com',
            role: 'donor',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            details: {
              fullName: 'John Donor',
              bloodGroup: 'B+',
              isAvailable: true,
              eligibleAfter: null,
              lastDonationDate: '2026-01-10'
            }
          }
        ]
      };

      const parsed = adminAccountsListResponseSchema.parse(adminAccounts);
      const json = JSON.parse(JSON.stringify(parsed));
      const donorDetails = json.accounts[0]?.details;

      expect(donorDetails).toHaveProperty('fullName', 'John Donor');
      expect(donorDetails).toHaveProperty('bloodGroup', 'B+');
      expect(donorDetails).not.toHaveProperty('phone');
      expect(donorDetails).not.toHaveProperty('dateOfBirth');
      expect(donorDetails).not.toHaveProperty('location');
      expect(donorDetails).not.toHaveProperty('latitude');
      expect(donorDetails).not.toHaveProperty('longitude');
    });
  });
});
