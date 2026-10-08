const test = require('node:test');
const assert = require('node:assert/strict');
const TEST_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const bcrypt = require('bcryptjs');
const { buildSchema } = require('graphql');
const {
  createToken,
  verifyToken,
  requireRole,
  validatePassword,
  validateObjectId,
  validateDate,
  validateTime,
  normalizePhone,
} = require('../src/security');
const typeDefs = require('../src/graphql/typeDefs');
const resolvers = require('../src/graphql/resolvers');
const aiService = require('../src/services/ai.service');

const OBJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';

test('GraphQL schema parses and includes availability and protected workflows', () => {
  const schema = buildSchema(typeDefs);
  assert.doesNotMatch(typeDefs, /type User \{[^}]*\bpassword\s*:/is);
  const overviewFields = schema.getType('AdminOverview').getFields();
  assert.deepEqual(Object.keys(overviewFields), [
    'patientCount',
    'doctorCount',
    'appointmentCount',
    'pendingAppointmentCount',
  ]);
  assert.ok(schema.getQueryType().getFields().myMedicalRecords);
});

test('JWT requires configured strong secret and verifies issuer, audience and role', () => {
  const oldSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(() => createToken({ id: OBJECT_ID, role: 'PATIENT' }), /JWT_SECRET/);
  process.env.JWT_SECRET = TEST_SECRET;
  try {
    const token = createToken({ id: OBJECT_ID, role: 'PATIENT' });
    assert.deepEqual(verifyToken(token), { id: OBJECT_ID, role: 'PATIENT' });
    const superadminToken = createToken({ id: OBJECT_ID, role: 'SUPERADMIN' });
    assert.deepEqual(verifyToken(superadminToken), { id: OBJECT_ID, role: 'SUPERADMIN' });
    assert.throws(() => verifyToken(`${token}tampered`));
    assert.throws(() => requireRole({ id: OBJECT_ID, role: 'PATIENT' }, 'DOCTOR'), /Not authorized/);
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('external inputs reject weak password, malformed ObjectId, date and time', () => {
  assert.throws(() => validatePassword('short'));
  assert.throws(() => validateObjectId('not-an-object-id'));
  assert.throws(() => validateDate('not-a-date'));
  assert.throws(() => validateTime('25:90'));
});

test('patient mobile identifiers normalize consistently and reject malformed numbers', () => {
  assert.equal(normalizePhone('+1 (555) 010-1001'), '+15550101001');
  assert.equal(normalizePhone('0044 20 7946 0958'), '+00442079460958');
  assert.throws(() => normalizePhone('not a phone'));
});

test('registration schema allows either email or mobile identifier without a second factor', () => {
  const schema = buildSchema(typeDefs);
  const fields = schema.getMutationType().getFields();
  const registrationArgs = fields.registerPatient.args;
  assert.equal(registrationArgs.find(({ name }) => name === 'email').type.toString(), 'String');
  assert.equal(registrationArgs.find(({ name }) => name === 'phone').type.toString(), 'String');
  assert.equal(registrationArgs.find(({ name }) => name === 'password').type.toString(), 'String!');
  assert.equal(fields.login.args.find(({ name }) => name === 'password').type.toString(), 'String!');
});

test('admin overview returns database counts and denies other roles before querying', async () => {
  const countCalls = [];
  const prisma = {
    patient: { count: async () => { countCalls.push(['patients']); return 8; } },
    doctor: { count: async () => { countCalls.push(['doctors']); return 3; } },
    appointment: {
      count: async (args) => {
        countCalls.push(['appointments', args || {}]);
        return args ? 2 : 17;
      },
    },
  };
  await assert.rejects(
    resolvers.Query.adminOverview(null, {}, { prisma, user: { id: OBJECT_ID, role: 'PATIENT' } }),
    /Not authorized/,
  );
  assert.equal(countCalls.length, 0);
  const overview = await resolvers.Query.adminOverview(null, {}, {
    prisma, user: { id: OBJECT_ID, role: 'ADMIN' },
  });
  assert.deepEqual(overview, {
    patientCount: 8,
    doctorCount: 3,
    appointmentCount: 17,
    pendingAppointmentCount: 2,
  });
  assert.deepEqual(countCalls[3], ['appointments', { where: { status: 'PENDING' } }]);
});

test('login verifies stored password and returns no password hash', async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  const hash = await bcrypt.hash('Password123!', 4);
  const user = {
    id: OBJECT_ID,
    email: 'asha@example.com',
    role: 'PATIENT',
    password: hash,
    patient: { id: OTHER_ID, firstName: 'Asha', lastName: 'Sharma', phone: null },
    doctor: null,
  };
  const prisma = { user: { findUnique: async () => user } };
  try {
    const result = await resolvers.Mutation.login(null, {
      email: 'ASHA@example.com',
      password: 'Password123!',
      role: 'patient',
    }, { prisma });
    assert.equal(result.user.email, 'asha@example.com');
    assert.equal(Object.hasOwn(result.user, 'password'), false);
    assert.deepEqual(verifyToken(result.token), { id: OBJECT_ID, role: 'PATIENT' });
    await assert.rejects(
      resolvers.Mutation.login(null, { email: 'asha@example.com', password: 'incorrect!', role: 'PATIENT' }, { prisma }),
      /Invalid credentials/,
    );
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('patient can sign in with a normalized mobile number without exposing an internal email', async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  const password = await bcrypt.hash('Password123!', 4);
  let searchedPhone;
  const patientProfile = {
    id: OTHER_ID,
    firstName: 'Asha',
    lastName: 'Sharma',
    phone: '+15550101001',
    user: {
      id: OBJECT_ID,
      email: `phone-15550101001${'@phone.invalid'}`,
      role: 'PATIENT',
      password,
      patient: {
        id: OTHER_ID,
        firstName: 'Asha',
        lastName: 'Sharma',
        phone: '+15550101001',
      },
      doctor: null,
    },
  };
  const prisma = {
    user: { findUnique: async () => null },
    patient: {
      findFirst: async ({ where }) => {
        searchedPhone = where.phone;
        return patientProfile;
      },
    },
  };
  try {
    const result = await resolvers.Mutation.login(null, {
      email: '+1 (555) 010-1001',
      password: 'Password123!',
      role: 'patient',
    }, { prisma });
    assert.equal(searchedPhone, '+15550101001');
    assert.equal(result.user.email, null);
    assert.equal(result.user.patient.phone, '+15550101001');
    assert.deepEqual(verifyToken(result.token), { id: OBJECT_ID, role: 'PATIENT' });
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('booking refuses an already occupied doctor slot before writing', async () => {
  let created = false;
  const prisma = {
    user: { findUnique: async () => ({ patient: { id: OTHER_ID } }) },
    doctor: { findUnique: async () => ({ id: OBJECT_ID }) },
    availability: { findMany: async () => [] },
    appointment: {
      findFirst: async () => ({ id: 'existing' }),
      create: async () => { created = true; },
    },
  };
  const date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await assert.rejects(
    resolvers.Mutation.bookAppointment(null, { doctorId: OBJECT_ID, date, startTime: '09:30' }, {
      prisma, user: { id: OTHER_ID, role: 'PATIENT' },
    }),
    /slot is no longer available/,
  );
  assert.equal(created, false);
});

test('appointment status enforces ownership and valid patient transitions', async () => {
  let updated = false;
  let patientProfileId = OBJECT_ID;
  const appointment = {
    id: OBJECT_ID, patientId: OTHER_ID, doctorId: OTHER_ID, status: 'PENDING',
  };
  const prisma = {
    appointment: {
      findUnique: async () => appointment,
      update: async () => { updated = true; },
    },
    patient: { findUnique: async () => ({ id: patientProfileId }) },
  };
  await assert.rejects(
    resolvers.Mutation.updateAppointmentStatus(null, { appointmentId: OBJECT_ID, status: 'CANCELLED' }, {
      prisma, user: { id: OBJECT_ID, role: 'PATIENT' },
    }),
    /Not authorized/,
  );
  assert.equal(updated, false);

  patientProfileId = OTHER_ID;
  await assert.rejects(
    resolvers.Mutation.updateAppointmentStatus(null, { appointmentId: OBJECT_ID, status: 'CONFIRMED' }, {
      prisma, user: { id: OBJECT_ID, role: 'PATIENT' },
    }),
    /Invalid appointment status transition/,
  );
});

test('doctor cannot access or write records for a patient they do not treat', async () => {
  let recordRead = false;
  let recordCreated = false;
  const prisma = {
    doctor: { findUnique: async () => ({ id: OBJECT_ID }) },
    appointment: { findFirst: async () => null },
    medicalRecord: {
      findMany: async () => { recordRead = true; return []; },
      create: async () => { recordCreated = true; },
    },
    patient: { findUnique: async () => ({ id: OTHER_ID }) },
  };
  const user = { id: OBJECT_ID, role: 'DOCTOR' };
  await assert.rejects(
    resolvers.Query.patientMedicalRecords(null, { patientId: OTHER_ID }, { prisma, user }),
    /Not authorized/,
  );
  await assert.rejects(
    resolvers.Mutation.addMedicalRecord(null, {
      patientId: OTHER_ID, title: 'Record', description: 'Test',
    }, { prisma, user }),
    /Not authorized/,
  );
  assert.equal(recordRead, false);
  assert.equal(recordCreated, false);
});

test('patient owner and treating doctor can read their medical records', async () => {
  const returnedRecords = [{ id: OBJECT_ID, patientId: OTHER_ID, title: 'Visit summary' }];
  let readCount = 0;
  const prisma = {
    patient: {
      findUnique: async ({ where }) => where.userId === OBJECT_ID ? { id: OTHER_ID } : null,
    },
    doctor: { findUnique: async () => ({ id: OBJECT_ID }) },
    appointment: { findFirst: async () => ({ id: 'treatment-appointment' }) },
    medicalRecord: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { patientId: OTHER_ID });
        readCount += 1;
        return returnedRecords;
      },
    },
  };
  const patientRecords = await resolvers.Query.patientMedicalRecords(null, { patientId: OTHER_ID }, {
    prisma, user: { id: OBJECT_ID, role: 'PATIENT' },
  });
  const doctorRecords = await resolvers.Query.patientMedicalRecords(null, { patientId: OTHER_ID }, {
    prisma, user: { id: OTHER_ID, role: 'DOCTOR' },
  });
  assert.deepEqual(patientRecords, returnedRecords);
  assert.deepEqual(doctorRecords, returnedRecords);
  assert.equal(readCount, 2);
});

test('myMedicalRecords resolves the authenticated patient profile without a client ID', async () => {
  const requestedPatientIds = [];
  const prisma = {
    patient: {
      findUnique: async ({ where }) => where.userId === OBJECT_ID ? { id: OTHER_ID } : null,
    },
    medicalRecord: {
      findMany: async ({ where }) => {
        requestedPatientIds.push(where.patientId);
        return [{ id: OBJECT_ID, patientId: where.patientId }];
      },
    },
  };
  const records = await resolvers.Query.myMedicalRecords(null, {}, {
    prisma, user: { id: OBJECT_ID, role: 'PATIENT' },
  });
  assert.deepEqual(records, [{ id: OBJECT_ID, patientId: OTHER_ID }]);
  assert.deepEqual(requestedPatientIds, [OTHER_ID]);
  await assert.rejects(
    resolvers.Query.myMedicalRecords(null, {}, { prisma, user: { id: OBJECT_ID, role: 'DOCTOR' } }),
    /Not authorized/,
  );
});

test('admin can review records and confirm appointments without bypassing transition rules', async () => {
  let recordFilter;
  let changedStatus;
  const current = { id: OBJECT_ID, patientId: OTHER_ID, doctorId: OBJECT_ID, status: 'PENDING' };
  const prisma = {
    medicalRecord: { findMany: async ({ where }) => { recordFilter = where; return []; } },
    appointment: {
      findUnique: async () => current,
      update: async ({ data }) => { changedStatus = data.status; return { ...current, status: data.status }; },
    },
  };
  const user = { id: OBJECT_ID, role: 'ADMIN' };
  await resolvers.Query.patientMedicalRecords(null, { patientId: OTHER_ID }, { prisma, user });
  assert.deepEqual(recordFilter, { patientId: OTHER_ID });
  await resolvers.Mutation.updateAppointmentStatus(null, {
    appointmentId: OBJECT_ID, status: 'CONFIRMED',
  }, { prisma, user });
  assert.equal(changedStatus, 'CONFIRMED');
});

test('payment intent never succeeds without Stripe configuration or appointment ownership', async () => {
  const original = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const prisma = {
    patient: { findUnique: async () => ({ id: OTHER_ID }) },
    appointment: { findUnique: async () => ({ id: OBJECT_ID, patientId: OTHER_ID, status: 'PENDING', fee: 5000 }) },
  };
  try {
    await assert.rejects(
      resolvers.Mutation.createPaymentIntent(null, { appointmentId: OBJECT_ID }, {
        prisma, user: { id: OTHER_ID, role: 'PATIENT' },
      }),
      /Payments are not configured/,
    );
    prisma.appointment.findUnique = async () => ({ id: OBJECT_ID, patientId: OBJECT_ID, status: 'PENDING', fee: 5000 });
    await assert.rejects(
      resolvers.Mutation.createPaymentIntent(null, { appointmentId: OBJECT_ID }, {
        prisma, user: { id: OTHER_ID, role: 'PATIENT' },
      }),
      /Appointment not found/,
    );
  } finally {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  }
});

test('AI provider failures return a safe disclaimer and omit provider error details', async () => {
  const original = aiService.ai;
  aiService.ai = {
    models: { generateContent: async () => { throw new Error('provider-secret-and-prompt'); } },
  };
  try {
    const message = await aiService.getSymptomGuidance('I have a headache today');
    assert.match(message, /temporarily unavailable/);
    assert.match(message, /not a diagnosis or treatment/);
    assert.doesNotMatch(message, /provider-secret-and-prompt/);
  } finally {
    aiService.ai = original;
  }
});
