import argon2 from 'argon2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { createDbPool, createDrizzle, type DatabaseInstance } from './connection.js';
import {
  users,
  donors,
  hospitals,
  bloodBanks,
  bloodInventory,
  type GeoPoint
} from './schema.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Seed configuration options.
 */
export interface SeedOptions {
  donorCount?: number;
  adminEmail?: string;
  adminPassword?: string;
}

// Pseudo-random number generator for deterministic seed data
function createRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const BLOOD_GROUP_WEIGHTS = [0.20, 0.02, 0.30, 0.015, 0.08, 0.005, 0.35, 0.03]; // Real-world approximate distribution
const SEX_OPTIONS = ['male', 'female', 'other'] as const;
const COMPONENTS = ['whole_blood', 'rbc', 'plasma', 'platelets'] as const;

// Dehradun geographic bounding box
const DEHRADUN_BOUNDS = {
  minLat: 30.25,
  maxLat: 30.40,
  minLon: 77.95,
  maxLon: 78.12
};

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Amit', 'Ananya', 'Arjun', 'Deepak', 'Divya', 'Gaurav',
  'Ishaan', 'Kavita', 'Manish', 'Neha', 'Pooja', 'Rahul', 'Rohan', 'Sneha',
  'Sunil', 'Tanvi', 'Vikram', 'Zoya', 'Karan', 'Meera', 'Nikhil', 'Priya'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Rawat', 'Negi', 'Bhatt', 'Joshi', 'Chauhan', 'Bisht',
  'Pant', 'Gupta', 'Singh', 'Kumar', 'Kandari', 'Thakur', 'Uniyal', 'Semwal'
];

/**
 * Populates the database with realistic development and testing fixtures.
 * STRICT SAFETY CHECK: Refuses to execute if NODE_ENV=production.
 */
export async function seedDatabase(
  db: DatabaseInstance,
  options: SeedOptions = {}
): Promise<{
  adminId: string;
  hospitalCount: number;
  bloodBankCount: number;
  donorCount: number;
}> {
  if (process.env.NODE_ENV === 'production' || config.isProduction) {
    throw new Error('FATAL: Seed script execution rejected in production environment (NODE_ENV=production).');
  }

  const rng = createRng(1337);
  const donorCount = options.donorCount ?? 300;
  const adminEmail = (options.adminEmail ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@raktsetu.internal').toLowerCase();
  const adminPassword = options.adminPassword ?? process.env.SEED_ADMIN_PASSWORD ?? 'Admin@RaktSetu2026!';

  console.log('Seeding development database (Dehradun simulation fixtures)...');

  // 1. Seed Admin User
  const adminPasswordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const [adminUser] = await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'admin',
      status: 'active'
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  const adminId = adminUser?.id ?? 'existing-admin';

  // 2. Seed Pre-verified Hospitals in Dehradun
  const hospitalData: Array<{
    email: string;
    name: string;
    registrationNo: string;
    phone: string;
    address: string;
    location: GeoPoint;
  }> = [
    {
      email: 'doon.hospital@hospitals.internal',
      name: 'Government Doon Medical College & Hospital',
      registrationNo: 'UK-MED-DOON-001',
      phone: '+911352718001',
      address: 'De Parade Ground Road, Dehradun, Uttarakhand 248001',
      location: { latitude: 30.3256, longitude: 78.0436 }
    },
    {
      email: 'max.hospital@hospitals.internal',
      name: 'Max Super Speciality Hospital Dehradun',
      registrationNo: 'UK-MED-MAX-002',
      phone: '+911356673000',
      address: 'Mussoorie Diversion Road, Malsi, Dehradun 248003',
      location: { latitude: 30.3644, longitude: 78.0712 }
    },
    {
      email: 'himalayan.hospital@hospitals.internal',
      name: 'Himalayan Institute Hospital (HIHT Jolly Grant)',
      registrationNo: 'UK-MED-HIHT-003',
      phone: '+911352471100',
      address: 'Swami Ram Nagar, Jolly Grant, Dehradun 248016',
      location: { latitude: 30.2036, longitude: 78.1402 }
    },
    {
      email: 'synergy.hospital@hospitals.internal',
      name: 'Synergy Institute of Medical Sciences',
      registrationNo: 'UK-MED-SYN-004',
      phone: '+911352226000',
      address: 'Ballupur Canal Road, Dehradun 248001',
      location: { latitude: 30.3421, longitude: 78.0052 }
    }
  ];

  const defaultPasswordHash = await argon2.hash('DevHospitalPass2026!', { type: argon2.argon2id });

  for (const h of hospitalData) {
    const [hUser] = await db
      .insert(users)
      .values({
        email: h.email.toLowerCase(),
        passwordHash: defaultPasswordHash,
        role: 'hospital',
        status: 'active'
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (hUser) {
      await db
        .insert(hospitals)
        .values({
          userId: hUser.id,
          name: h.name,
          registrationNo: h.registrationNo,
          phone: h.phone,
          address: h.address,
          location: h.location,
          verifiedAt: new Date()
        })
        .onConflictDoNothing({ target: hospitals.registrationNo });
    }
  }

  // 3. Seed Blood Banks & Initial Inventory in Dehradun
  const bloodBankData: Array<{
    email: string;
    name: string;
    licenseNo: string;
    phone: string;
    address: string;
    location: GeoPoint;
  }> = [
    {
      email: 'ima.bloodbank@bloodbanks.internal',
      name: 'IMA Blood Bank of Uttarakhand',
      licenseNo: 'BB-UK-IMA-010',
      phone: '+911352629999',
      address: 'Subhash Road, Dehradun, Uttarakhand 248001',
      location: { latitude: 30.318, longitude: 78.029 }
    },
    {
      email: 'doon.bloodbank@bloodbanks.internal',
      name: 'Doon District Hospital Regional Blood Centre',
      licenseNo: 'BB-UK-DOON-020',
      phone: '+911352718055',
      address: 'Court Road, Dehradun, Uttarakhand 248001',
      location: { latitude: 30.3258, longitude: 78.0438 }
    }
  ];

  for (const bb of bloodBankData) {
    const [bbUser] = await db
      .insert(users)
      .values({
        email: bb.email.toLowerCase(),
        passwordHash: defaultPasswordHash,
        role: 'blood_bank',
        status: 'active'
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (bbUser) {
      await db
        .insert(bloodBanks)
        .values({
          userId: bbUser.id,
          name: bb.name,
          licenseNo: bb.licenseNo,
          phone: bb.phone,
          address: bb.address,
          location: bb.location,
          verifiedAt: new Date()
        })
        .onConflictDoNothing({ target: bloodBanks.licenseNo });

      // Seed initial blood inventory for each blood bank
      for (const group of BLOOD_GROUPS) {
        for (const comp of COMPONENTS) {
          const initialUnits = Math.floor(rng() * 20) + 5;
          await db
            .insert(bloodInventory)
            .values({
              bloodBankId: bbUser.id,
              bloodGroup: group,
              component: comp,
              units: initialUnits
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  // 4. Seed ~300 Synthetic Donors across Dehradun coordinates
  const donorPasswordHash = await argon2.hash('DevDonorPass2026!', { type: argon2.argon2id });

  // Helper to pick blood group based on distribution weights
  const pickBloodGroup = (): (typeof BLOOD_GROUPS)[number] => {
    const r = rng();
    let cumulative = 0;
    for (let i = 0; i < BLOOD_GROUPS.length; i++) {
      cumulative += BLOOD_GROUP_WEIGHTS[i]!;
      if (r <= cumulative) {
        return BLOOD_GROUPS[i]!;
      }
    }
    return 'O+';
  };

  const donorBatchSize = 50;
  for (let batchStart = 0; batchStart < donorCount; batchStart += donorBatchSize) {
    const currentBatchEnd = Math.min(batchStart + donorBatchSize, donorCount);
    const userValues = [];

    for (let i = batchStart; i < currentBatchEnd; i++) {
      const email = `simulated.donor.${i + 1}@raktsetu.simulation`.toLowerCase();
      userValues.push({
        email,
        passwordHash: donorPasswordHash,
        role: 'donor' as const,
        status: 'active' as const
      });
    }

    const insertedUsers = await db
      .insert(users)
      .values(userValues)
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });

    if (insertedUsers.length > 0) {
      const donorValues = insertedUsers.map((u, idx) => {
        const globalIdx = batchStart + idx;
        const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]!;
        const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]!;
        const bloodGroup = pickBloodGroup();
        const sex = SEX_OPTIONS[Math.floor(rng() * SEX_OPTIONS.length)]!;

        // Coordinates jittered within Dehradun region
        const lat = DEHRADUN_BOUNDS.minLat + rng() * (DEHRADUN_BOUNDS.maxLat - DEHRADUN_BOUNDS.minLat);
        const lon = DEHRADUN_BOUNDS.minLon + rng() * (DEHRADUN_BOUNDS.maxLon - DEHRADUN_BOUNDS.minLon);

        // Date of birth between 18 and 55 years ago
        const ageYears = 18 + Math.floor(rng() * 37);
        const dobYear = 2026 - ageYears;
        const dobMonth = String(1 + Math.floor(rng() * 12)).padStart(2, '0');
        const dobDay = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
        const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`;

        // Weight between 48kg and 95kg (strictly >= 45kg)
        const weightKg = Math.round((48 + rng() * 47) * 10) / 10;

        // Availability: ~85% available
        const isAvailable = rng() < 0.85;

        // Last donation date: some have donated previously
        const hasDonated = rng() < 0.6;
        let lastDonationDate: string | null = null;
        let eligibleAfter: string | null = null;
        if (hasDonated) {
          const monthsAgo = 2 + Math.floor(rng() * 10);
          const donationMonth = String(1 + ((12 - monthsAgo) % 12)).padStart(2, '0');
          lastDonationDate = `2025-${donationMonth}-15`;
          // Cooldown 90 days
          eligibleAfter = monthsAgo >= 3 ? null : '2026-04-15';
        }

        return {
          userId: u.id,
          fullName: `${firstName} ${lastName} (SIMULATION)`,
          phone: `+91980${String(1000000 + globalIdx).slice(1)}`,
          bloodGroup,
          dateOfBirth,
          weightKg,
          sex,
          location: { latitude: lat, longitude: lon },
          isAvailable,
          eligibleAfter,
          lastDonationDate,
          consentLocationAt: new Date()
        };
      });

      await db.insert(donors).values(donorValues).onConflictDoNothing();
    }
  }

  console.log(`Database seeded successfully: ${hospitalData.length} hospitals, ${bloodBankData.length} blood banks, ~${donorCount} donors.`);

  return {
    adminId,
    hospitalCount: hospitalData.length,
    bloodBankCount: bloodBankData.length,
    donorCount
  };
}

// Allow direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const pool = createDbPool(config);
  const db = createDrizzle(pool);

  seedDatabase(db)
    .then(async (result) => {
      console.log('Seed summary:', result);
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed execution failed:', err);
      await pool.end();
      process.exit(1);
    });
}
