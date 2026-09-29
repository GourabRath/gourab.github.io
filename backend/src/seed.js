const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  const password = await bcrypt.hash('Password123!', 10);

  const existingPatient = await prisma.user.findUnique({ where: { email: 'asha@example.com' }});
  if (!existingPatient) {
    const user = await prisma.user.create({
      data: {
        email: 'asha@example.com',
        password: password,
        role: 'PATIENT'
      }
    });
    await prisma.patient.create({
      data: {
        userId: user.id,
        firstName: 'Asha',
        lastName: 'Sharma'
      }
    });
  }

  const existingDoctor = await prisma.user.findUnique({ where: { email: 'dr.watson@medicare.com' }});
  if (!existingDoctor) {
    const user = await prisma.user.create({
      data: {
        email: 'dr.watson@medicare.com',
        password: password,
        role: 'DOCTOR'
      }
    });
    await prisma.doctor.create({
      data: {
        userId: user.id,
        firstName: 'Emily',
        lastName: 'Watson',
        specialization: 'Cardiology',
        experienceYears: 12
      }
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@medicare.com' }});
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: 'admin@medicare.com',
        password: password,
        role: 'ADMIN'
      }
    });
  }

  console.log('Seeding finished.');
}

main().catch(console.error).finally(() => prisma.$disconnect());

