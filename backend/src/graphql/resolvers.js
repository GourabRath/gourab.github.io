const bcrypt = require('bcryptjs');
const { randomInt } = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');
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
  return {
    id: user.id,
    publicId: user.publicId || null,
    email,
    role: user.role,
    patient: user.patient || null,
    doctor: user.doctor || null,
  };
}

function profileInclude() {
  return {
    patient: {
      select: {
        id: true, publicId: true, firstName: true, lastName: true, phone: true,
        dateOfBirth: true, sex: true, address: true,
      },
    },
    doctor: {
      select: {
        id: true, publicId: true, firstName: true, lastName: true,
        specialization: true, experienceYears: true,
      },
    },
  };
}

function makePublicId(prefix) {
  return `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

function validatePage(limit, offset) {
  const pageSize = limit === undefined || limit === null ? 100 : limit;
  const skip = offset === undefined || offset === null ? 0 : offset;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200
    || !Number.isInteger(skip) || skip < 0 || skip > 1_000_000) {
    throw publicError('Invalid page limit or offset.');
  }
  return { take: pageSize, skip };
}

function validateExperience(value) {
  if (!Number.isInteger(value) || value < 0 || value > 80) {
    throw publicError('Invalid doctor experience.');
  }
  return value;
}

function isDuplicateKey(error) {
  return Boolean(error && error.code === 11000);
}

// MongoDB multi-document writes require transactions on replica sets. Keep creation
// usable on the standalone local setup by compensating a partial User/Profile insert.
async function createAccountWithProfile({
  email,
  password,
  role,
  prefix,
  profileCollection,
  profileData,
  clientFactory,
}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw publicError('Database configuration is missing.', 'SERVICE_UNAVAILABLE');
  const client = (clientFactory || (url => new MongoClient(url)))(databaseUrl);
  try {
    await client.connect();
    const db = client.db();
    const users = db.collection('User');
    const profiles = profileCollection ? db.collection(profileCollection) : null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const userId = new ObjectId();
      const profileId = profiles ? new ObjectId() : null;
      const publicId = makePublicId(prefix);
      const createdAt = new Date();
      let userInserted = false;
      try {
        await users.insertOne({
          _id: userId, email, password, role, publicId, createdAt,
        });
        userInserted = true;
        let profile = null;
        if (profiles) {
          profile = {
            _id: profileId,
            userId,
            publicId,
            ...profileData,
          };
          await profiles.insertOne(profile);
        }
        return {
          user: { id: userId.toString(), email, role, publicId, createdAt },
          profile: profile && { ...profile, id: profileId.toString(), userId: userId.toString() },
        };
      } catch (error) {
        if (profiles && profileId) await profiles.deleteOne({ _id: profileId }).catch(() => {});
        if (userInserted) await users.deleteOne({ _id: userId }).catch(() => {});
        if (isDuplicateKey(error)) {
          const key = error.keyPattern && Object.keys(error.keyPattern)[0];
          if (key === 'publicId' && attempt < 7) continue;
          if (key === 'email' || !key) throw publicError('Email already registered.');
        }
        throw error;
      }
    }
    throw publicError('Could not allocate a unique profile identifier. Try again.', 'SERVICE_UNAVAILABLE');
  } finally {
    await client.close();
  }
}

function safeAccount(account) {
  return {
    id: account.id,
    publicId: account.publicId || null,
    email: account.email,
    role: account.role,
    createdAt: account.createdAt,
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
  } else if (!['ADMIN', 'SUPERADMIN'].includes(actor.role)) {
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
  User: {
    email: (user) => publicUser(user).email,
  },
  Patient: {
    dob: patient => patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString() : null,
  },
  AdminAccount: {
    createdAt: account => new Date(account.createdAt).toISOString(),
  },
  Query: {
    me: async (_, __, { prisma, user }) => {
      const actor = requireUser(user);
      const found = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { ...SAFE_USER_SELECT, publicId: true, ...profileInclude() },
      });
      return found ? publicUser(found) : null;
    },
    adminOverview: async (_, __, { prisma, user }) => {
      const actor = requireRole(user, 'ADMIN', 'SUPERADMIN');
      const [patientCount, doctorCount, appointmentCount, pendingAppointmentCount] = await Promise.all([
        prisma.patient.count(),
        prisma.doctor.count(),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: 'PENDING' } }),
      ]);
      audit('admin.overview.read', actor.id, actor.id);
      return { patientCount, doctorCount, appointmentCount, pendingAppointmentCount };
    },
    platformMetrics: async (_, __, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const [patientCount, doctorCount, adminCount, appointmentCount, pendingAppointmentCount] = await Promise.all([
        prisma.patient.count(),
        prisma.doctor.count(),
        prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPERADMIN'] } } }),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: 'PENDING' } }),
      ]);
      audit('superadmin.metrics.read', actor.id, actor.id);
      return {
        patientCount,
        doctorCount,
        adminCount,
        appointmentCount,
        pendingAppointmentCount,
        generatedAt: new Date().toISOString(),
      };
    },
    superadminPatientProfiles: async (_, { limit, offset }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      audit('superadmin.patient.list', actor.id, actor.id);
      return prisma.patient.findMany({
        include: { user: { select: { id: true, publicId: true, email: true, role: true } } },
        orderBy: { firstName: 'asc' },
        ...validatePage(limit, offset),
      });
    },
    superadminDoctorProfiles: async (_, { limit, offset }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      audit('superadmin.doctor.list', actor.id, actor.id);
      return prisma.doctor.findMany({
        include: {
          user: { select: { id: true, publicId: true, email: true, role: true } },
          location: true,
          speciality: true,
        },
        orderBy: { firstName: 'asc' },
        ...validatePage(limit, offset),
      });
    },
    superadminAccounts: async (_, { limit, offset }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      audit('superadmin.account.list', actor.id, actor.id);
      const accounts = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
        select: { id: true, publicId: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        ...validatePage(limit, offset),
      });
      return accounts.map(safeAccount);
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
      else if (['ADMIN', 'SUPERADMIN'].includes(actor.role)) where = {};
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
    registerPatient: async (_, args, { prisma, mongoClientFactory }) => {
      const email = args.email ? normalizeEmail(args.email) : null;
      const password = validatePassword(args.password);
      const firstName = validateText(args.firstName, 'first name', { max: 80 });
      const lastName = validateText(args.lastName, 'last name', { max: 80 });
      const phone = args.phone ? normalizePhone(args.phone) : null;
      if (!email && !phone) throw publicError('Provide an email address or mobile number.');
      if (phone && await prisma.patient.findFirst({ where: { phone }, select: { id: true } })) {
        throw publicError('Mobile number already registered.');
      }
      const sex = args.sex == null ? null : validateText(args.sex, 'sex', { max: 40 });
      const address = args.address == null ? null : validateText(args.address, 'address', { max: 300 });
      let dateOfBirth = null;
      if (args.dob) {
        dateOfBirth = validateDate(args.dob);
        if (dateOfBirth.getTime() > Date.now()) throw publicError('Invalid date of birth.');
      }
      const storedEmail = email || `phone-${phone.replace(/\D/g, '')}${PHONE_IDENTITY_SUFFIX}`;
      const hashedPassword = await bcrypt.hash(password, 12);
      const created = await createAccountWithProfile({
        email: storedEmail,
        password: hashedPassword,
        role: 'PATIENT',
        prefix: 'P',
        profileCollection: 'Patient',
        profileData: { firstName, lastName, sex, address, dateOfBirth, ...(phone ? { phone } : {}) },
        clientFactory: mongoClientFactory,
      });
      const user = {
        ...created.user,
        email,
        role: 'PATIENT',
        patient: created.profile,
        doctor: null,
      };
      audit('patient.register', user.id, created.profile.id);
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
    createPatientProfile: async (_, args, { prisma, user, mongoClientFactory }) => {
      const actor = requireRole(user, 'ADMIN', 'SUPERADMIN');
      const email = args.email == null ? null : normalizeEmail(args.email);
      const phone = args.phone == null ? null : normalizePhone(args.phone);
      if (!email && !phone) throw publicError('Provide an email address or mobile number.');
      if (phone && await prisma.patient.findFirst({ where: { phone }, select: { id: true } })) {
        throw publicError('Mobile number already registered.');
      }
      const password = await bcrypt.hash(validatePassword(args.password), 12);
      const firstName = validateText(args.firstName, 'first name', { max: 80 });
      const lastName = validateText(args.lastName, 'last name', { max: 80 });
      const dateOfBirth = args.dob == null ? null : validateDate(args.dob);
      if (dateOfBirth && dateOfBirth.getTime() > Date.now()) throw publicError('Invalid date of birth.');
      const sex = args.sex == null ? null : validateText(args.sex, 'sex', { max: 40 });
      const address = args.address == null ? null : validateText(args.address, 'address', { max: 300 });
      const created = await createAccountWithProfile({
        email: email || `phone-${phone.replace(/\D/g, '')}${PHONE_IDENTITY_SUFFIX}`,
        password,
        role: 'PATIENT',
        prefix: 'P',
        profileCollection: 'Patient',
        profileData: { firstName, lastName, phone, dateOfBirth, sex, address },
        clientFactory: mongoClientFactory,
      });
      audit('admin.patient.create', actor.id, created.profile.id);
      return created.profile;
    },
    createDoctorProfile: async (_, args, { prisma, user, mongoClientFactory }) => {
      const actor = requireRole(user, 'ADMIN', 'SUPERADMIN');
      const email = normalizeEmail(args.email);
      const password = await bcrypt.hash(validatePassword(args.password), 12);
      const firstName = validateText(args.firstName, 'first name', { max: 80 });
      const lastName = validateText(args.lastName, 'last name', { max: 80 });
      const specialization = validateText(args.specialization, 'specialization', { max: 100 });
      const experienceYears = validateExperience(args.experienceYears === undefined ? 0 : args.experienceYears);
      let locationId = null;
      let specialityId = null;
      if (args.locationId != null) {
        locationId = validateObjectId(args.locationId, 'location identifier');
        if (!await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } })) {
          throw publicError('Location not found.');
        }
      }
      if (args.specialityId != null) {
        specialityId = validateObjectId(args.specialityId, 'speciality identifier');
        if (!await prisma.speciality.findUnique({ where: { id: specialityId }, select: { id: true } })) {
          throw publicError('Speciality not found.');
        }
      }
      const profileImageUrl = args.profileImageUrl == null ? null : validateFileUrl(args.profileImageUrl);
      const created = await createAccountWithProfile({
        email,
        password,
        role: 'DOCTOR',
        prefix: 'D',
        profileCollection: 'Doctor',
        profileData: {
          firstName,
          lastName,
          specialization,
          experienceYears,
          locationId: locationId ? new ObjectId(locationId) : null,
          specialityId: specialityId ? new ObjectId(specialityId) : null,
          profileImageUrl,
        },
        clientFactory: mongoClientFactory,
      });
      audit('admin.doctor.create', actor.id, created.profile.id);
      return created.profile;
    },
    updatePatientProfile: async (_, args, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(args.patientId, 'patient identifier');
      const patient = await prisma.patient.findUnique({ where: { id }, include: { user: true } });
      if (!patient) throw publicError('Patient not found.');
      const data = {};
      if (Object.hasOwn(args, 'firstName')) data.firstName = validateText(args.firstName, 'first name', { max: 80 });
      if (Object.hasOwn(args, 'lastName')) data.lastName = validateText(args.lastName, 'last name', { max: 80 });
      if (Object.hasOwn(args, 'phone')) {
        data.phone = args.phone == null ? null : normalizePhone(args.phone);
        if (data.phone && await prisma.patient.findFirst({
          where: { phone: data.phone, id: { not: id } }, select: { id: true },
        })) throw publicError('Mobile number already registered.');
      }
      if (Object.hasOwn(args, 'dob')) {
        data.dateOfBirth = args.dob == null ? null : validateDate(args.dob);
        if (data.dateOfBirth && data.dateOfBirth.getTime() > Date.now()) throw publicError('Invalid date of birth.');
      }
      if (Object.hasOwn(args, 'sex')) data.sex = args.sex == null ? null : validateText(args.sex, 'sex', { max: 40 });
      if (Object.hasOwn(args, 'address')) data.address = args.address == null ? null : validateText(args.address, 'address', { max: 300 });
      let email;
      if (Object.hasOwn(args, 'email') && args.email != null) {
        email = normalizeEmail(args.email);
        const duplicate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (duplicate && duplicate.id !== patient.userId) throw publicError('Email already registered.');
      }
      if (Object.keys(data).length) await prisma.patient.update({ where: { id }, data });
      const userData = {};
      if (email && email !== patient.user.email) userData.email = email;
      if (args.password != null) userData.password = await bcrypt.hash(validatePassword(args.password), 12);
      if (Object.keys(userData).length) await prisma.user.update({ where: { id: patient.userId }, data: userData });
      audit('superadmin.patient.update', actor.id, id);
      return prisma.patient.findUnique({
        where: { id },
        include: { user: { select: { id: true, publicId: true, email: true, role: true } } },
      });
    },
    updateDoctorProfile: async (_, args, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(args.doctorId, 'doctor identifier');
      const doctor = await prisma.doctor.findUnique({ where: { id }, include: { user: true } });
      if (!doctor) throw publicError('Doctor not found.');
      const data = {};
      if (Object.hasOwn(args, 'firstName')) data.firstName = validateText(args.firstName, 'first name', { max: 80 });
      if (Object.hasOwn(args, 'lastName')) data.lastName = validateText(args.lastName, 'last name', { max: 80 });
      if (Object.hasOwn(args, 'specialization')) data.specialization = validateText(args.specialization, 'specialization', { max: 100 });
      if (Object.hasOwn(args, 'experienceYears')) data.experienceYears = validateExperience(args.experienceYears);
      if (Object.hasOwn(args, 'profileImageUrl')) {
        data.profileImageUrl = args.profileImageUrl == null ? null : validateFileUrl(args.profileImageUrl);
      }
      for (const [arg, field, model, label] of [
        ['locationId', 'locationId', prisma.location, 'location'],
        ['specialityId', 'specialityId', prisma.speciality, 'speciality'],
      ]) {
        if (!Object.hasOwn(args, arg)) continue;
        if (args[arg] == null) data[field] = null;
        else {
          const refId = validateObjectId(args[arg], `${label} identifier`);
          if (!await model.findUnique({ where: { id: refId }, select: { id: true } })) {
            throw publicError(`${label[0].toUpperCase()}${label.slice(1)} not found.`);
          }
          data[field] = refId;
        }
      }
      let email;
      if (Object.hasOwn(args, 'email') && args.email != null) {
        email = normalizeEmail(args.email);
        const duplicate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (duplicate && duplicate.id !== doctor.userId) throw publicError('Email already registered.');
      }
      if (Object.keys(data).length) await prisma.doctor.update({ where: { id }, data });
      const userData = {};
      if (email && email !== doctor.user.email) userData.email = email;
      if (args.password != null) userData.password = await bcrypt.hash(validatePassword(args.password), 12);
      if (Object.keys(userData).length) await prisma.user.update({ where: { id: doctor.userId }, data: userData });
      audit('superadmin.doctor.update', actor.id, id);
      return prisma.doctor.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, publicId: true, email: true, role: true } },
          location: true,
          speciality: true,
        },
      });
    },
    deletePatientProfile: async (_, { patientId }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(patientId, 'patient identifier');
      const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true, userId: true } });
      if (!patient) throw publicError('Patient not found.');
      await prisma.appointment.deleteMany({ where: { patientId: id } });
      await prisma.medicalRecord.deleteMany({ where: { patientId: id } });
      await prisma.patient.delete({ where: { id } });
      await prisma.user.delete({ where: { id: patient.userId } });
      audit('superadmin.patient.delete', actor.id, id);
      return true;
    },
    deleteDoctorProfile: async (_, { doctorId }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(doctorId, 'doctor identifier');
      const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
      if (!doctor) throw publicError('Doctor not found.');
      await prisma.appointment.deleteMany({ where: { doctorId: id } });
      await prisma.availability.deleteMany({ where: { doctorId: id } });
      await prisma.doctor.delete({ where: { id } });
      await prisma.user.delete({ where: { id: doctor.userId } });
      audit('superadmin.doctor.delete', actor.id, id);
      return true;
    },
    createAdminAccount: async (_, { email: rawEmail, password: rawPassword }, { user, mongoClientFactory }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const email = normalizeEmail(rawEmail);
      const password = await bcrypt.hash(validatePassword(rawPassword), 12);
      const created = await createAccountWithProfile({
        email,
        password,
        role: 'ADMIN',
        prefix: 'A',
        clientFactory: mongoClientFactory,
      });
      audit('superadmin.account.create', actor.id, created.user.id);
      return safeAccount(created.user);
    },
    updateAdminAccount: async (_, args, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(args.adminUserId, 'admin account identifier');
      if (id === actor.id) throw publicError('You cannot change your own admin role.', 'FORBIDDEN');
      const current = await prisma.user.findUnique({ where: { id } });
      if (!current || current.role !== 'ADMIN') throw publicError('Admin account not found.');
      const data = {};
      if (Object.hasOwn(args, 'role')) {
        if (args.role !== 'ADMIN') throw publicError('Admin accounts cannot be promoted or demoted here.');
      }
      if (Object.hasOwn(args, 'email') && args.email != null) {
        const email = normalizeEmail(args.email);
        const duplicate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (duplicate && duplicate.id !== id) throw publicError('Email already registered.');
        data.email = email;
      }
      if (Object.hasOwn(args, 'password') && args.password != null) {
        data.password = await bcrypt.hash(validatePassword(args.password), 12);
      }
      const saved = Object.keys(data).length
        ? await prisma.user.update({
          where: { id }, data,
          select: { id: true, publicId: true, email: true, role: true, createdAt: true },
        })
        : current;
      audit('superadmin.account.update', actor.id, id);
      return safeAccount(saved);
    },
    deleteAdminAccount: async (_, { adminUserId }, { prisma, user }) => {
      const actor = requireRole(user, 'SUPERADMIN');
      const id = validateObjectId(adminUserId, 'admin account identifier');
      if (id === actor.id) throw publicError('You cannot delete your own account.', 'FORBIDDEN');
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!target || target.role !== 'ADMIN') throw publicError('Admin account not found.');
      await prisma.user.delete({ where: { id } });
      audit('superadmin.account.delete', actor.id, id);
      return true;
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
      if (!['ADMIN', 'SUPERADMIN'].includes(actor.role) && !isPatientOwner && !isTreatingDoctor) {
        throw publicError('Not authorized.', 'FORBIDDEN');
      }
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
      if (!['DOCTOR', 'ADMIN', 'SUPERADMIN'].includes(actor.role)) throw publicError('Not authorized.', 'FORBIDDEN');
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
Object.defineProperty(module.exports, 'createAccountWithProfile', { value: createAccountWithProfile });
Object.defineProperty(module.exports, 'makePublicId', { value: makePublicId });
