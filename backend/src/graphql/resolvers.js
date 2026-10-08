const bcrypt = require('bcryptjs');
const {
  ROLES,
  createToken,
  publicError,
  requireUser,
  requireRole,
  validateText,
  normalizeEmail,
  validatePassword,
  validateObjectId,
  validateDate,
  validateTime,
  audit,
} = require('../security');

const SAFE_USER_SELECT = { id: true, email: true, role: true };
const APPOINTMENT_INCLUDE = {
  doctor: { include: { user: { select: SAFE_USER_SELECT }, location: true, speciality: true } },
  patient: { include: { user: { select: SAFE_USER_SELECT } } },
};

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, patient: user.patient || null, doctor: user.doctor || null };
}

function profileInclude() {
  return {
    patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
    doctor: { select: { id: true, firstName: true, lastName: true, specialization: true, experienceYears: true } },
  };
}

function emit(io, event, appointment) {
  // Realtime events carry no clinical notes, contact data, or profile objects.
  if (io) io.emit(event, { appointmentId: appointment.id, status: appointment.status });
}

const resolvers = {
  Query: {
    me: async (_, __, { prisma, user }) => {
      const actor = requireUser(user);
      const found = await prisma.user.findUnique({ where: { id: actor.id }, select: { ...SAFE_USER_SELECT, ...profileInclude() } });
      return found ? publicUser(found) : null;
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
        include: { user: { select: SAFE_USER_SELECT }, location: true, speciality: true },
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
      return prisma.appointment.findMany({ where, include: APPOINTMENT_INCLUDE, orderBy: { date: 'desc' } });
    },
    patientMedicalRecords: async (_, { patientId }, { prisma, user }) => {
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
      return prisma.medicalRecord.findMany({
        where: { patientId: targetId },
        include: { patient: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  },
  Mutation: {
    registerPatient: async (_, args, { prisma }) => {
      const email = normalizeEmail(args.email);
      const password = validatePassword(args.password);
      const firstName = validateText(args.firstName, 'first name', { max: 80 });
      const lastName = validateText(args.lastName, 'last name', { max: 80 });
      const phone = validateText(args.phone, 'phone number', { min: 7, max: 24 });
      if (!/^[+()\d .-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw publicError('Invalid phone number.');
      const sex = args.sex == null ? null : validateText(args.sex, 'sex', { max: 40 });
      const address = args.address == null ? null : validateText(args.address, 'address', { max: 300 });
      let dateOfBirth = null;
      if (args.dob) {
        dateOfBirth = validateDate(args.dob);
        if (dateOfBirth.getTime() > Date.now()) throw publicError('Invalid date of birth.');
      }
      if (!process.env.DATABASE_URL) throw publicError('Database configuration is missing.');
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw publicError('Email already registered.');
      if (await prisma.patient.findFirst({ where: { phone }, select: { id: true } })) throw publicError('Phone number already registered.');

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
          _id: userId, email, password: hashedPassword, role: 'PATIENT', createdAt: new Date(),
        });
        try {
          await db.collection('Patient').insertOne({
            _id: patientId, userId, firstName, lastName, phone, sex, address, dateOfBirth,
          });
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
      const user = { id: userId.toString(), email, role: 'PATIENT' };
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
        const patient = await prisma.patient.findFirst({
          where: { phone: identifier },
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
      requireUser(user);
      const safeMessage = validateText(message, 'message', { min: 5, max: 1500 });
      const aiService = require('../services/ai.service');
      return aiService.getSymptomGuidance(safeMessage);
    },
    bookAppointment: async (_, { doctorId, date, startTime, notes }, { prisma, user, io }) => {
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
      const day = appointmentDate.getUTCDay();
      const availability = await prisma.availability.findMany({ where: { doctorId: doctorKey, dayOfWeek: day } });
      if (availability.length && !availability.some(slot => slot.startTime <= time && time < slot.endTime)) {
        throw publicError('Doctor is not available at that time.');
      }
      const slotDate = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
      const conflict = await prisma.appointment.findFirst({
        where: {
          doctorId: doctorKey,
          date: slotDate,
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
      emit(io, 'appointmentBooked', appointment);
      return appointment;
    },
    updateAppointmentStatus: async (_, { appointmentId, status }, { prisma, user, io }) => {
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
      emit(io, 'appointmentStatusUpdated', updated);
      return updated;
    },
    createPaymentIntent: async (_, { appointmentId }, { prisma, user }) => {
      const actor = requireRole(user, 'PATIENT');
      const id = validateObjectId(appointmentId, 'appointment identifier');
      const patient = await prisma.patient.findUnique({ where: { userId: actor.id }, select: { id: true } });
      const appointment = await prisma.appointment.findUnique({ where: { id } });
      if (!patient || !appointment || appointment.patientId !== patient.id) throw publicError('Appointment not found.');
      if (appointment.status === 'CANCELLED' || appointment.paymentStatus === 'PAID') {
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
          fileUrl: fileUrl == null ? null : validateText(fileUrl, 'record URL', { max: 1000 }),
        },
        include: { patient: true },
      });
      audit('medical-record.create', actor.id, record.id);
      return record;
    },
  },
};

module.exports = resolvers;
