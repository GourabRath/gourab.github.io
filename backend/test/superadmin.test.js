const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { buildSchema } = require('graphql');
const typeDefs = require('../src/graphql/typeDefs');
const resolvers = require('../src/graphql/resolvers');

const SUPERADMIN = { id: '507f1f77bcf86cd799439011', role: 'SUPERADMIN' };
const ADMIN = { id: '507f1f77bcf86cd799439012', role: 'ADMIN' };
const PATIENT = { id: '507f1f77bcf86cd799439013', role: 'PATIENT' };
const PROFILE_ID = '507f1f77bcf86cd799439014';

function fakeMongo() {
  const inserted = { User: [], Patient: [], Doctor: [] };
  const deleted = { User: [], Patient: [], Doctor: [] };
  const client = {
    async connect() {},
    async close() {},
    db: () => ({
      collection(name) {
        return {
          insertOne: async document => { inserted[name].push(document); },
          deleteOne: async filter => { deleted[name].push(filter); },
        };
      },
    }),
  };
  return { inserted, deleted, factory: () => client };
}

test('GraphQL exposes public identifiers and superadmin-only management operations', () => {
  const schema = buildSchema(typeDefs);
  assert.equal(String(schema.getType('Patient').getFields().publicId.type), 'String');
  assert.equal(String(schema.getType('Doctor').getFields().publicId.type), 'String');
  const queries = schema.getQueryType().getFields();
  assert.ok(queries.superadminPatientProfiles);
  assert.ok(queries.superadminDoctorProfiles);
  assert.ok(queries.superadminAccounts);
  assert.ok(queries.platformMetrics);
  assert.ok(schema.getMutationType().getFields().deletePatientProfile);
});

test('ADMIN can create patient profiles; credentials are hashed and IDs use the P prefix', async () => {
  const mongo = fakeMongo();
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mongodb://test.local/medicare';
  const prisma = { patient: { findFirst: async () => null } };
  try {
    await assert.rejects(
      resolvers.Mutation.createPatientProfile(null, {
        email: 'new.patient@example.com',
        password: 'StrongPassword123!',
        firstName: 'Ria',
        lastName: 'Patel',
      }, { prisma, user: PATIENT, mongoClientFactory: mongo.factory }),
      /Not authorized/,
    );
    assert.equal(mongo.inserted.User.length, 0);

    const profile = await resolvers.Mutation.createPatientProfile(null, {
      email: 'new.patient@example.com',
      password: 'StrongPassword123!',
      firstName: 'Ria',
      lastName: 'Patel',
      dob: '1990-02-03',
    }, { prisma, user: ADMIN, mongoClientFactory: mongo.factory });
    assert.match(profile.publicId, /^P\d{6}$/);
    assert.match(mongo.inserted.User[0].publicId, /^P\d{6}$/);
    assert.equal(mongo.inserted.User[0].role, 'PATIENT');
    assert.equal(await bcrypt.compare('StrongPassword123!', mongo.inserted.User[0].password), true);
    assert.equal(profile.firstName, 'Ria');
    assert.equal(profile.password, undefined);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test('ADMIN can create doctor profiles with validated references and D-prefixed IDs', async () => {
  const mongo = fakeMongo();
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mongodb://test.local/medicare';
  const prisma = {
    location: { findUnique: async ({ where }) => where.id === PROFILE_ID ? { id: PROFILE_ID } : null },
    speciality: { findUnique: async () => null },
  };
  try {
    await assert.rejects(
      resolvers.Mutation.createDoctorProfile(null, {
        email: 'doctor@example.com',
        password: 'StrongPassword123!',
        firstName: 'An',
        lastName: 'Rao',
        specialization: 'Cardiology',
        experienceYears: 4,
        specialityId: PROFILE_ID,
      }, { prisma, user: ADMIN, mongoClientFactory: mongo.factory }),
      /Speciality not found/,
    );
    assert.equal(mongo.inserted.User.length, 0);
    prisma.speciality.findUnique = async () => ({ id: PROFILE_ID });
    const doctor = await resolvers.Mutation.createDoctorProfile(null, {
      email: 'doctor@example.com',
      password: 'StrongPassword123!',
      firstName: 'An',
      lastName: 'Rao',
      specialization: 'Cardiology',
      experienceYears: 4,
      locationId: PROFILE_ID,
      specialityId: PROFILE_ID,
    }, { prisma, user: ADMIN, mongoClientFactory: mongo.factory });
    assert.match(doctor.publicId, /^D\d{6}$/);
    assert.equal(mongo.inserted.Doctor[0].experienceYears, 4);
    assert.equal(mongo.inserted.User[0].role, 'DOCTOR');
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test('admin account creation returns an A-prefixed identifier and stores a password hash', async () => {
  const mongo = fakeMongo();
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mongodb://test.local/medicare';
  try {
    const account = await resolvers.Mutation.createAdminAccount(null, {
      email: 'managed-admin@example.com',
      password: 'StrongPassword123!',
    }, { user: SUPERADMIN, mongoClientFactory: mongo.factory });
    assert.match(account.publicId, /^A\d{6}$/);
    assert.equal(account.role, 'ADMIN');
    assert.equal(account.password, undefined);
    assert.equal(await bcrypt.compare('StrongPassword123!', mongo.inserted.User[0].password), true);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test('public ID uniqueness conflicts are retried before profile insertion', async () => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mongodb://test.local/medicare';
  let inserts = 0;
  const deletedUserIds = [];
  const client = {
    async connect() {},
    async close() {},
    db: () => ({
      collection: () => ({
        insertOne: async () => {
          inserts += 1;
          if (inserts === 1) {
            const duplicate = new Error('duplicate public ID');
            duplicate.code = 11000;
            duplicate.keyPattern = { publicId: 1 };
            throw duplicate;
          }
        },
        deleteOne: async filter => deletedUserIds.push(filter),
      }),
    }),
  };
  try {
    const created = await resolvers.createAccountWithProfile({
      email: 'retry@example.com',
      password: 'hash',
      role: 'ADMIN',
      prefix: 'A',
      clientFactory: () => client,
    });
    assert.equal(inserts, 2);
    assert.equal(deletedUserIds.length, 0);
    assert.match(created.user.publicId, /^A\d{6}$/);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test('metrics, lists, and profile management deny ordinary admins before database access', async () => {
  let queries = 0;
  const prisma = {
    patient: {
      count: async () => { queries += 1; return 0; },
      findMany: async () => { queries += 1; return []; },
    },
    doctor: { count: async () => { queries += 1; return 0; }, findMany: async () => { queries += 1; return []; } },
    user: { count: async () => { queries += 1; return 0; }, findMany: async () => { queries += 1; return []; } },
    appointment: { count: async () => { queries += 1; return 0; } },
  };
  await assert.rejects(
    resolvers.Query.platformMetrics(null, {}, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Query.superadminPatientProfiles(null, {}, { prisma, user: PATIENT }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.deletePatientProfile(null, { patientId: PROFILE_ID }, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.updatePatientProfile(null, { patientId: PROFILE_ID, firstName: 'Changed' }, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.updateDoctorProfile(null, { doctorId: PROFILE_ID, firstName: 'Changed' }, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.deleteDoctorProfile(null, { doctorId: PROFILE_ID }, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.createAdminAccount(null, {
      email: 'blocked@example.com', password: 'StrongPassword123!',
    }, { user: ADMIN }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.updateAdminAccount(null, { adminUserId: PROFILE_ID, email: 'x@example.com' }, {
      prisma, user: ADMIN,
    }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.deleteAdminAccount(null, { adminUserId: PROFILE_ID }, { prisma, user: ADMIN }),
    /Not authorized/,
  );
  assert.equal(queries, 0);
});

test('superadmin metrics return platform-wide database counts and timestamp', async () => {
  const prisma = {
    patient: { count: async () => 12 },
    doctor: { count: async () => 4 },
    user: { count: async ({ where }) => {
      assert.deepEqual(where, { role: { in: ['ADMIN', 'SUPERADMIN'] } });
      return 2;
    } },
    appointment: { count: async args => args ? 3 : 25 },
  };
  const metrics = await resolvers.Query.platformMetrics(null, {}, { prisma, user: SUPERADMIN });
  assert.deepEqual(
    {
      patientCount: metrics.patientCount,
      doctorCount: metrics.doctorCount,
      adminCount: metrics.adminCount,
      appointmentCount: metrics.appointmentCount,
      pendingAppointmentCount: metrics.pendingAppointmentCount,
    },
    {
      patientCount: 12,
      doctorCount: 4,
      adminCount: 2,
      appointmentCount: 25,
      pendingAppointmentCount: 3,
    },
  );
  assert.doesNotThrow(() => new Date(metrics.generatedAt).toISOString());
});

test('profile deletion removes linked data and rejects self admin deletion or role escalation', async () => {
  const calls = [];
  const prisma = {
    patient: { findUnique: async () => ({ id: PROFILE_ID, userId: ADMIN.id }), delete: async () => calls.push('patient') },
    appointment: { deleteMany: async ({ where }) => calls.push(['appointments', where]) },
    medicalRecord: { deleteMany: async ({ where }) => calls.push(['records', where]) },
    user: {
      delete: async () => calls.push('user'),
      findUnique: async () => ({ id: PROFILE_ID, role: 'ADMIN', email: 'admin@example.com' }),
      update: async () => calls.push('update'),
    },
  };
  const deleted = await resolvers.Mutation.deletePatientProfile(null, { patientId: PROFILE_ID }, {
    prisma, user: SUPERADMIN,
  });
  assert.equal(deleted, true);
  assert.deepEqual(calls, [
    ['appointments', { patientId: PROFILE_ID }],
    ['records', { patientId: PROFILE_ID }],
    'patient',
    'user',
  ]);
  await assert.rejects(
    resolvers.Mutation.deleteAdminAccount(null, { adminUserId: SUPERADMIN.id }, { prisma, user: SUPERADMIN }),
    /own account/,
  );
  await assert.rejects(
    resolvers.Mutation.updateAdminAccount(null, {
      adminUserId: PROFILE_ID, role: 'SUPERADMIN',
    }, { prisma, user: SUPERADMIN }),
    /cannot be promoted or demoted/,
  );
  assert.equal(calls.includes('update'), false);
});

test('management pagination and profile updates reject malformed boundary input', async () => {
  let databaseRead = false;
  const prisma = { patient: { findMany: async () => { databaseRead = true; return []; } } };
  await assert.rejects(
    resolvers.Query.superadminPatientProfiles(null, { limit: 201 }, { prisma, user: SUPERADMIN }),
    /Invalid page/,
  );
  assert.equal(databaseRead, false);
  await assert.rejects(
    resolvers.Mutation.updatePatientProfile(null, {
      patientId: PROFILE_ID, firstName: '  ',
    }, {
      prisma: { patient: { findUnique: async () => ({ id: PROFILE_ID, userId: SUPERADMIN.id, user: { email: 'old@example.com' } }) } },
      user: SUPERADMIN,
    }),
    /Invalid first name/,
  );
});

test('superadmin can edit patient contact/profile fields without returning credentials', async () => {
  const updates = [];
  let patientReads = 0;
  const patient = {
    id: PROFILE_ID,
    userId: ADMIN.id,
    user: { id: ADMIN.id, email: 'old@example.com' },
  };
  const prisma = {
    patient: {
      findUnique: async () => {
        patientReads += 1;
        return patientReads === 1 ? patient : { ...patient, firstName: 'Nia', phone: '+15550101001' };
      },
      update: async ({ data }) => updates.push(['patient', data]),
      findFirst: async () => null,
    },
    user: {
      findUnique: async () => null,
      update: async ({ data }) => updates.push(['user', data]),
    },
  };
  const result = await resolvers.Mutation.updatePatientProfile(null, {
    patientId: PROFILE_ID,
    firstName: 'Nia',
    phone: '+1 (555) 010-1001',
    email: 'NEW@example.com',
    password: 'ChangedPassword123!',
  }, { prisma, user: SUPERADMIN });
  assert.deepEqual(updates[0], ['patient', { firstName: 'Nia', phone: '+15550101001' }]);
  assert.equal(updates[1][0], 'user');
  assert.equal(updates[1][1].email, 'new@example.com');
  assert.equal(await bcrypt.compare('ChangedPassword123!', updates[1][1].password), true);
  assert.equal(result.firstName, 'Nia');
  assert.equal(result.password, undefined);
});

test('doctor deletion removes associated appointments and availability', async () => {
  const calls = [];
  const prisma = {
    doctor: {
      findUnique: async () => ({ id: PROFILE_ID, userId: ADMIN.id }),
      delete: async () => calls.push('doctor'),
    },
    appointment: { deleteMany: async () => calls.push('appointments') },
    availability: { deleteMany: async () => calls.push('availability') },
    user: { delete: async () => calls.push('user') },
  };
  assert.equal(await resolvers.Mutation.deleteDoctorProfile(null, { doctorId: PROFILE_ID }, {
    prisma, user: SUPERADMIN,
  }), true);
  assert.deepEqual(calls, ['appointments', 'availability', 'doctor', 'user']);
});

test('superadmin may update an ordinary admin login but cannot change its role', async () => {
  const originalPassword = await bcrypt.hash('OldPassword123!', 4);
  let saved;
  const prisma = {
    user: {
      findUnique: async ({ where }) => where.email
        ? null
        : { id: PROFILE_ID, role: 'ADMIN', email: 'old-admin@example.com', password: originalPassword },
      update: async ({ data }) => {
        saved = data;
        return {
          id: PROFILE_ID,
          publicId: 'A123456',
          email: data.email,
          role: 'ADMIN',
          createdAt: new Date('2025-01-01T00:00:00Z'),
        };
      },
    },
  };
  const updated = await resolvers.Mutation.updateAdminAccount(null, {
    adminUserId: PROFILE_ID,
    email: 'new-admin@example.com',
    password: 'NewPassword123!',
    role: 'ADMIN',
  }, { prisma, user: SUPERADMIN });
  assert.equal(updated.email, 'new-admin@example.com');
  assert.equal(updated.publicId, 'A123456');
  assert.equal(await bcrypt.compare('NewPassword123!', saved.password), true);
  assert.equal(Object.hasOwn(saved, 'role'), false);
  assert.equal(updated.password, undefined);
});
