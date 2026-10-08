require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { randomInt } = require('node:crypto');

const prisma = new PrismaClient();

function nextPublicId(prefix) {
  return `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

async function setMissingIds(model, rows, prefixFor) {
  let updated = 0;
  for (const row of rows) {
    const prefix = prefixFor(row);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await model.update({
          where: { id: row.id },
          data: { publicId: nextPublicId(prefix) },
        });
        updated += 1;
        break;
      } catch (error) {
        if (!error || error.code !== 'P2002' || attempt === 7) throw error;
      }
    }
  }
  return updated;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { publicId: null },
    select: { id: true, role: true },
  });
  const patients = await prisma.patient.findMany({
    where: { publicId: null },
    select: { id: true },
  });
  const doctors = await prisma.doctor.findMany({
    where: { publicId: null },
    select: { id: true },
  });
  const userCount = await setMissingIds(
    prisma.user,
    users,
    row => row.role === 'PATIENT' ? 'P' : row.role === 'DOCTOR' ? 'D' : 'A',
  );
  const patientCount = await setMissingIds(prisma.patient, patients, () => 'P');
  const doctorCount = await setMissingIds(prisma.doctor, doctors, () => 'D');
  console.info(`Assigned public identifiers to ${userCount} users, ${patientCount} patients, and ${doctorCount} doctors.`);
}

main()
  .catch(() => {
    console.error('Public ID backfill failed. Check database configuration and schema indexes.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
