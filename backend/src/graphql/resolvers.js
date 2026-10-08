const bcrypt = require('bcryptjs');
const {
  ROLES,
  createToken,
  publicError,
  requireUser,
  requireRole,
  validateText,
  normalizeEmail,
  normalizePhone,
  validatePassword,
  validateObjectId,
  validateDate,
  validateTime,
  audit,
} = require('../security');

const SAFE_USER_SELECT = { id: true, email: true, role: true };
const PHONE_IDENTITY_SUFFIX = '@phone.invalid';
const APPOINTMENT_INCLUDE = {
  doctor: { include: { location: true, speciality: true } },
  patient: true,
};

function publicUser(user) {
  const email = user.email && !user.email.endsWith(PHONE_IDENTITY_SUFFIX)
    ? user.email
    : null;
  return { id: user.id, email, role: user.role, patient: user.patient || null, doctor: user.doctor || null };
}

function profileInclude() {
  return {
    patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
    doctor: { select: { id: true, firstName: true, lastName: true, specialization: true, experienceYears: true } },
  };
}

function validateFileUrl(value) {
  const url = validateText(value, 'record URL', { max: 1000 });
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') && !url.split('/').includes('..')) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) return url;
  } catch (_) {
    // Handled by the safe input error below.
  }
  throw publicError('Invalid record URL.');
}

async function readPatientMedicalRecords(patientId, prisma, user) {
  const actor = requireUser(user);
  const targetId = validateObjectId(patientId, 'patient identifier');
  if (actor.role === 'PATIENT') {
    const profile = await prisma.patient.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!profile || profile.id !== targetId) throw publicError('Not authorized.', 'FORBIDDEN');
  } else if (actor.role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actor.id }, select: { id: true } });
    const treating = doctor && await prisma.appointment.findFirst({
      where: { patientId: targetId, doctorId: doctor.id },
      select: { id: true },
    });
    if (!treating) throw publicError('Not authorized.', 'FORBIDDEN');
  } else if (actor.role !== 'ADMIN') {
    throw publicError('Not authorized.', 'FORBIDDEN');
  }
  audit('medical-record.read', actor.id, targetId);
  return prisma.medicalRecord.findMany({
    where: { patientId: targetId },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
  });
}

const resolvers = {
  Query: {
    me: async (_, __, { prisma, user }) => {
      const actor = requireUser(user);
      const found = await prisma.user.findUnique({ where: { id: actor.id }, select: { ...SAFE_USER_SELECT, ...profileInclude() } });
      return found ? publicUser(found) : null;
    },
    adminOverview: async (_, __, { prisma, user }) => {
      const actor = requireRole(user, 'ADMIN');
      const [patientCount, doctorCount, appointmentCount, pendingAppointmentCount] = await Promise.all([
        prisma.patient.count(),
        prisma.doctor.count(),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: 'PENDING' } }),
      ]);
      audit('admin.overview.read', actor.id, actor.id);
      return { patientCount, doctorCount, appointmentCount, pendingAppointmentCount };
    },
    doctors: async (_, { locationId, specialityId, search }, { prisma }) => {
      const where = {};
      if (locationId) where.locationId = validateObjectId(locationId, 'location identifier');
      if (specialityId) where.specialityId = validateObjectId(specialityId, 'speciality identifier');
      if (search) {
        const term = validateText(search, 'search term', { max: 80 });
        where.OR = [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { specialization: { contains: term, mode: 'insensitive' } },
        ];
      }
      return prisma.doctor.findMany({
        where,
        include: { location: true, speciality: true },
      });
    },
    locations: (_, __, { prisma }) => prisma.location.findMany(),
    specialities: (_, __, { prisma }) => prisma.speciality.findMany(),
    healthPackages: (_, __, { prisma }) => prisma.healthPackage.findMany(),
    doctorAvailability: async (_, { doctorId }, { prisma }) => {
      const id = validateObjectId(doctorId, 'doctor identifier');
      if (!await prisma.doctor.findUnique({ where: { id }, select: { id: true } })) throw publicError('Doctor not found.');
      return prisma.availability.findMany({ where: { doctorId: id }, orderBy: { dayOfWeek: 'asc' } });
    },
    myAppointments: async (_, __, { prisma, user }) => {
      const actor = requireUser(user);
      const found = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { patient: { select: { id: true } }, doctor: { select: { id: true } } },
      });
      if (!found) throw publicError('Account not found.');
      let where;
      if (actor.role === 'PATIENT' && found.patient) where = { patientId: found.patient.id };
      else if (actor.role === 'DOCTOR' && found.doctor) where = { doctorId: found.doctor.id };
      else if (actor.role === 'ADMIN') where = {};
      else return [];
      audit('appointments.read', actor.id, actor.id);
      return prisma.appointment.findMany({ where, include: APPOINTMENT_INCLUDE, orderBy: { date: 'desc' } });
    },
    myMedicalRecords: async (_, __, { prisma, user }) => {
      const actor = requireRole(user, 'PATIENT');
      const profile = await prisma.patient.findUnique({ where: { userId: actor.id }, select: { id: true } });
      if (!profile) throw publicError('Patient profile not found.');
      return readPatientMedicalRecords(profile.id, prisma, actor);
    },
    patientMedicalRecords: (_, { patientId }, { prisma, user }) =>
      readPatientMedicalRecords(patientId, prisma, user),
  },
  Mutation: {
    registerPatient: async (_, args, { prisma }) => {
      const email = args.email ? normalizeEmail(args.email) : null;
      const password = validatePassword(args.password);
      const firstName = validateText(args.firstName, 'first name', { max: 80 });
      const lastName = validateText(args.lastName, 'last name', { max: 80 });
      const phone = args.phone ? normalizePhone(args.phone) : null;
      if (!email && !phone) throw publicError('Provide an email address or mobile number.');
      const sex = args.sex == null ? null : validateText(args.sex, 'sex', { max: 40 });
      const address = args.address == null ? null : validateText(args.address, 'address', { max: 300 });
      let dateOfBirth = null;
      if (args.dob) {
        dateOfBirth = validateDate(args.dob);
        if (dateOfBirth.getTime() > Date.now()) throw publicError('Invalid date of birth.');
      }
      if (!process.env.DATABASE_URL) throw publicError('Database configuration is missing.');
      const storedEmail = email || `phone-${phone.replace(/\D/g, '')}${PHONE_IDENTITY_SUFFIX}`;
      if (await prisma.user.findUnique({ where: { email: storedEmail }, select: { id: true } })) {
        throw publicError(email ? 'Email already registered.' : 'Mobile number already registered.');
      }
      if (phone && await prisma.patient.findFirst({ where: { phone }, select: { id: true } })) {
        throw publicError('Mobile number already registered.');
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      // Keep registration compatible with standalone MongoDB (no multi-document transaction).
      const { MongoClient, ObjectId } = require('mongodb');
      const client = new MongoClient(process.env.DATABASE_URL);
      const userId = new ObjectId();
      const patientId = new ObjectId();
      try {
        await client.connect();
        const db = client.db();
        await db.collection('User').insertOne({
          _id: userId, email: storedEmail, password: hashedPassword, role: 'PATIENT', createdAt: new Date(),
        });
        try {
          const patient = { _id: patientId, userId, firstName, lastName, sex, address, dateOfBirth };
          if (phone) patient.phone = phone;
          await db.collection('Patient').insertOne(patient);
        } catch (error) {
          await db.collection('User').deleteOne({ _id: userId });
          throw error;
        }
      } catch (error) {
        if (error && error.code === 11000) throw publicError('Email or phone number already registered.');
        throw error;
      } finally {
        await client.close();
      }
      const user = {
        id: userId.toString(),
        email,
        role: 'PATIENT',
        patient: { id: patientId.toString(), firstName, lastName, phone },
        doctor: null,
      };
      audit('patient.register', user.id, patientId.toString());
      return { token: createToken(user), user };
    },
    login: async (_, { email, password, role }, { prisma }) => {
      if (typeof password !== 'string' || password.length > 128) throw publicError('Invalid credentials.');
      const requestedRole = typeof role === 'string' ? role.toUpperCase() : '';
      if (!ROLES.includes(requestedRole)) throw publicError('Invalid credentials.');
      const identifier = typeof email === 'string' ? email.trim() : '';
      if (!identifier || identifier.length > 254) throw publicError('Invalid credentials.');
      let found = null;
      if (identifier.includes('@')) {
        const normalized = normalizeEmail(identifier);
        found = await prisma.user.findUnique({ where: { email: normalized }, include: profileInclude() });
      } else {
        const phone = normalizePhone(identifier);
        const patient = await prisma.patient.findFirst({
          where: { phone },
          include: { user: { include: profileInclude() } },
        });
        found = patient && patient.user;
      }
      if (!found || found.role !== requestedRole || !(await bcrypt.compare(password, found.password))) {
        throw publicError('Invalid credentials.', 'UNAUTHENTICATED');
      }
      const user = publicUser(found);
      audit('auth.login', user.id, user.id);
      return { token: createToken(user), user };
    },
    askAIAssistant: async (_, { message }, { user }) => {
      const actor = requireUser(user);
      const safeMessage = validateText(message, 'message', { min: 5, max: 1500 });
      audit('ai.guidance', actor.id, actor.id);
      const aiService = require('../services/ai.service');
      return aiService.getSymptomGuidance(safeMessage);
    },
    bookAppointment: async (_, { doctorId, date, startTime, notes }, { prisma, user }) => {
      const actor = requireRole(user, 'PATIENT');
      const doctorKey = validateObjectId(doctorId, 'doctor identifier');
      const appointmentDate = validateDate(date, { future: true });
      const time = validateTime(startTime);
      const safeNotes = notes == null ? null : validateText(notes, 'appointment notes', { max: 1000 });
      const dbUser = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { patient: { select: { id: true } } },
      });
      if (!dbUser || !dbUser.patient) throw publicError('Patient profile not found.');
      if (!await prisma.doctor.findUnique({ where: { id: doctorKey }, select: { id: true } })) {
        throw publicError('Doctor not found.');
      }
      const slotDate = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
      const day = slotDate.getUTCDay();
      const availability = await prisma.availability.findMany({ where: { doctorId: doctorKey, dayOfWeek: day } });
      if (availability.length && !availability.some(slot => slot.startTime <= time && time < slot.endTime)) {
        throw publicError('Doctor is not available at that time.');
      }
      const conflict = await prisma.appointment.findFirst({
        where: {
          doctorId: doctorKey,
          date: { gte: slotDate, lt: new Date(slotDate.getTime() + 24 * 60 * 60 * 1000) },
          startTime: time,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });
      if (conflict) throw publicError('This appointment slot is no longer available.');
      const appointment = await prisma.appointment.create({
        data: {
          patientId: dbUser.patient.id,
          doctorId: doctorKey,
          date: slotDate,
          startTime: time,
          notes: safeNotes,
          status: 'PENDING',
        },
        include: APPOINTMENT_INCLUDE,
      });
      audit('appointment.book', actor.id, appointment.id);
      return appointment;
    },
    updateAppointmentStatus: async (_, { appointmentId, status }, { prisma, user }) => {
      const actor = requireUser(user);
      const id = validateObjectId(appointmentId, 'appointment identifier');
      const next = typeof status === 'string' ? status.toUpperCase() : '';
      const allowed = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (!allowed.includes(next)) throw publicError('Invalid appointment status.');
      const current = await prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE });
      if (!current) throw publicError('Appointment not found.');
      const patient = actor.role === 'PATIENT'
        ? await prisma.patient.findUnique({ where: { userId: actor.id }, select: { id: true } })
        : null;
      const doctor = actor.role === 'DOCTOR'
        ? await prisma.doctor.findUnique({ where: { userId: actor.id }, select: { id: true } })
        : null;
      const isPatientOwner = patient && current.patientId === patient.id;
      const isTreatingDoctor = doctor && current.doctorId === doctor.id;
      if (actor.role !== 'ADMIN' && !isPatientOwner && !isTreatingDoctor) throw publicError('Not authorized.', 'FORBIDDEN');
      const transitions = {
        PENDING: actor.role === 'PATIENT' ? ['CANCELLED'] : ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: actor.role === 'PATIENT' ? ['CANCELLED'] : ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
        COMPLETED: [],
        CANCELLED: [],
        NO_SHOW: [],
      };
      if (!transitions[current.status].includes(next)) throw publicError('Invalid appointment status transition.');
      const updated = await prisma.appointment.update({
        where: { id },
        data: { status: next },
        include: APPOINTMENT_INCLUDE,
      });
      audit('appointment.status', actor.id, id);
      return updated;
    },
    createPaymentIntent: async (_, { appointmentId }, { prisma, user }) => {
      const actor = requireRole(user, 'PATIENT');
      const id = validateObjectId(appointmentId, 'appointment identifier');
      const patient = await prisma.patient.findUnique({ where: { userId: actor.id }, select: { id: true } });
      const appointment = await prisma.appointment.findUnique({ where: { id } });
      if (!patient || !appointment || appointment.patientId !== patient.id) throw publicError('Appointment not found.');
      if (!['PENDING', 'CONFIRMED'].includes(appointment.status)
        || appointment.paymentStatus === 'PAID'
        || !Number.isInteger(appointment.fee)
        || appointment.fee <= 0) {
        throw publicError('Payment is not available for this appointment.');
      }
      if (!process.env.STRIPE_SECRET_KEY) throw publicError('Payments are not configured.', 'SERVICE_UNAVAILABLE');
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: appointment.fee,
          currency: 'usd',
          metadata: { appointmentId: appointment.id },
        });
        await prisma.appointment.update({
          where: { id },
          data: { paymentIntent: paymentIntent.id },
        });
        audit('payment.intent.create', actor.id, id);
        return paymentIntent.client_secret;
      } catch (_) {
        throw publicError('Unable to create payment intent.', 'SERVICE_UNAVAILABLE');
      }
    },
    addMedicalRecord: async (_, { patientId, title, description, fileUrl }, { prisma, user }) => {
      const actor = requireUser(user);
      const targetId = validateObjectId(patientId, 'patient identifier');
      if (!['DOCTOR', 'ADMIN'].includes(actor.role)) throw publicError('Not authorized.', 'FORBIDDEN');
      const patient = await prisma.patient.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!patient) throw publicError('Patient not found.');
      if (actor.role === 'DOCTOR') {
        const doctor = await prisma.doctor.findUnique({ where: { userId: actor.id }, select: { id: true } });
        const treating = doctor && await prisma.appointment.findFirst({
          where: { patientId: targetId, doctorId: doctor.id },
          select: { id: true },
        });
        if (!treating) throw publicError('Not authorized.', 'FORBIDDEN');
      }
      const record = await prisma.medicalRecord.create({
        data: {
          patientId: targetId,
          title: validateText(title, 'record title', { max: 160 }),
          description: validateText(description, 'record description', { max: 5000 }),
          fileUrl: fileUrl == null ? null : validateFileUrl(fileUrl),
        },
        include: { patient: true },
      });
      audit('medical-record.create', actor.id, record.id);
      return record;
    },
  },
};

module.exports = resolvers;
