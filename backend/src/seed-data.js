const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Location and Speciality data...");

  // Seed Locations
  const locations = [
    { name: "MediCare City Hospital", city: "Bangalore", state: "Karnataka", address: "123 Health Ave" },
    { name: "MediCare North", city: "Delhi", state: "Delhi", address: "45 Wellness Blvd" },
    { name: "MediCare West", city: "Mumbai", state: "Maharashtra", address: "88 Care St" },
    { name: "MediCare East", city: "Kolkata", state: "West Bengal", address: "9 Healing Rd" }
  ];

  for (const loc of locations) {
    await prisma.location.create({ data: loc });
  }

  // Seed Specialities
  const specialities = [
    { name: "Cardiac Sciences", description: "Advanced heart care and surgery", icon: "heart" },
    { name: "Neuro Sciences", description: "Brain and spine treatment", icon: "brain" },
    { name: "Cancer Care", description: "Comprehensive oncology", icon: "ribbon" },
    { name: "Gastro Sciences", description: "Digestive health", icon: "stomach" },
    { name: "Orthopaedics", description: "Bone and joint care", icon: "bone" }
  ];

  for (const spec of specialities) {
    await prisma.speciality.create({ data: spec });
  }

  console.log("Locations and Specialities seeded successfully!");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

