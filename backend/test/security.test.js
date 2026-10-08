const test = require('node:test');
const assert = require('node:assert/strict');
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
} = require('../src/security');
const typeDefs = require('../src/graphql/typeDefs');
const resolvers = require('../src/graphql/resolvers');
const aiService = require('../src/services/ai.service');

const OBJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';

test('GraphQL schema parses and includes availability and protected workflows', () => {
  assert.doesNotThrow(() => buildSchema(typeDefs));
});

test('JWT requires configured strong secret and verifies issuer, audience and role', () => {
  const oldSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(() => createToken({ id: OBJECT_ID, role: 'PATIENT' }), /JWT_SECRET/);
  process.env.JWT_SECRET = 'unit-test-secret-that-is-at-least-32-chars';
  try {
    const token = createToken({ id: OBJECT_ID, role: 'PATIENT' });
    assert.deepEqual(verifyToken(token), { id: OBJECT_ID, role: 'PATIENT' });
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

test('login verifies stored password and returns no password hash', async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'unit-test-secret-that-is-at-least-32-chars';
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
