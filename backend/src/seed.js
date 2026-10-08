const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomInt } = require('node:crypto');
const { normalizePhone } = require('./security');

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Password123!';

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function findOrCreateUser({ email, password, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  const prefix = role === 'PATIENT' ? 'P' : role === 'DOCTOR' ? 'D' : 'A';
  let user = existing || await prisma.user.create({
    data: { email, password, role, publicId: `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}` },
  });
  if (!user.publicId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { publicId: `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}` },
        });
        break;
      } catch (error) {
        if (attempt === 7 || !error || error.code !== 'P2002') throw error;
      }
    }
  }
  return user;
}

async function ensureProfilePublicId(model, profile, prefix) {
  if (profile.publicId) return profile;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await model.update({
        where: { id: profile.id },
        data: { publicId: `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}` },
      });
    } catch (error) {
      if (attempt === 7 || !error || error.code !== 'P2002') throw error;
    }
  }
  throw new Error('Unable to allocate a public profile identifier.');
}

async function main() {
  console.log('Seeding MediCare demo accounts and workflows...');
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);

  const patientUser = await findOrCreateUser({
    email: 'asha@example.com',
    password,
    role: 'PATIENT',
  });
  let patient = await prisma.patient.findUnique({ where: { userId: patientUser.id } });
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        firstName: 'Asha',
        lastName: 'Sharma',
        phone: normalizePhone('+1 555 010 1001'),
      },
    });
  } else if (!patient.phone) {
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { phone: normalizePhone('+1 555 010 1001') },
    });
  }
  patient = await ensureProfilePublicId(prisma.patient, patient, 'P');

  const location = await prisma.location.findFirst({
    where: { name: 'MediCare City Hospital' },
  }) || await prisma.location.create({
    data: {
      name: 'MediCare City Hospital',
      address: '123 Health Avenue',
      city: 'Bengaluru',
      state: 'Karnataka',
    },
  });

  const speciality = await prisma.speciality.findFirst({
    where: { name: 'Cardiology' },
  }) || await prisma.speciality.create({
    data: {
      name: 'Cardiology',
      description: 'Heart and cardiovascular care',
      icon: 'heart',
    },
  });

  const doctorUser = await findOrCreateUser({
    email: 'dr.watson@medicare.com',
    password,
    role: 'DOCTOR',
  });
  let doctor = await prisma.doctor.findUnique({ where: { userId: doctorUser.id } });
  if (!doctor) {
    doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        firstName: 'Emily',
        lastName: 'Watson',
        specialization: 'Cardiology',
        experienceYears: 12,
        locationId: location.id,
        specialityId: speciality.id,
      },
    });
  } else if (!doctor.locationId || !doctor.specialityId) {
    doctor = await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        locationId: doctor.locationId || location.id,
        specialityId: doctor.specialityId || speciality.id,
      },
    });
  }
  doctor = await ensureProfilePublicId(prisma.doctor, doctor, 'D');

  await findOrCreateUser({
    email: 'admin@medicare.com',
    password,
    role: 'ADMIN',
  });

  const demoAppointments = [
    {
      days: 1,
      startTime: '10:00',
      status: 'PENDING',
      notes: 'Demo appointment request: routine cardiology consultation.',
    },
    {
      days: 2,
      startTime: '11:00',
      status: 'CONFIRMED',
      notes: 'Demo appointment: follow-up consultation.',
    },
    {
      days: -7,
      startTime: '09:00',
      status: 'COMPLETED',
      notes: 'Demo appointment: routine wellness consultation.',
    },
  ];

  for (const demo of demoAppointments) {
    const existing = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        doctorId: doctor.id,
        notes: demo.notes,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          date: dateOffset(demo.days),
          startTime: demo.startTime,
          status: demo.status,
          notes: demo.notes,
        },
      });
    }
  }

  const completedAppointment = await prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      doctorId: doctor.id,
      notes: 'Demo appointment: routine wellness consultation.',
    },
    select: { id: true },
  });
  const existingRecord = await prisma.medicalRecord.findFirst({
    where: { patientId: patient.id, title: 'Demo visit summary' },
  });
  if (completedAppointment && !existingRecord) {
    await prisma.medicalRecord.create({
      data: {
        patientId: patient.id,
        title: 'Demo visit summary',
        description: 'Sample record for project demonstration only. No real patient information.',
      },
    });
  }

  console.log('Demo seed is ready.');
  console.log('Patient: asha@example.com / +1 555 010 1001');
  console.log('Doctor: dr.watson@medicare.com');
  console.log('Admin: admin@medicare.com');
  console.log(`All demo accounts use: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed. Verify the MongoDB URL, connection, and Prisma schema.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
