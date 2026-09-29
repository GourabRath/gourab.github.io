const { MongoClient } = require('mongodb');

async function main() {
  const url = process.env.DATABASE_URL || "mongodb://localhost:27017/?authMechanism=DEFAULT&directConnection=true";
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db('medicare');

    const locations = [
      { name: "MediCare City Hospital", city: "Bangalore", state: "Karnataka", address: "123 Health Ave" },
      { name: "MediCare North", city: "Delhi", state: "Delhi", address: "45 Wellness Blvd" },
      { name: "MediCare West", city: "Mumbai", state: "Maharashtra", address: "88 Care St" },
      { name: "MediCare East", city: "Kolkata", state: "West Bengal", address: "9 Healing Rd" }
    ];

    await db.collection('Location').insertMany(locations);

    const specialities = [
      { name: "Cardiac Sciences", description: "Advanced heart care and surgery", icon: "heart" },
      { name: "Neuro Sciences", description: "Brain and spine treatment", icon: "brain" },
      { name: "Cancer Care", description: "Comprehensive oncology", icon: "ribbon" },
      { name: "Gastro Sciences", description: "Digestive health", icon: "stomach" },
      { name: "Orthopaedics", description: "Bone and joint care", icon: "bone" }
    ];

    await db.collection('Speciality').insertMany(specialities);

    console.log("Seeded successfully via native MongoDB driver!");
  } finally {
    await client.close();
  }
}

main().catch(console.error);

