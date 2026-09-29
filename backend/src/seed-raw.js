const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function main() {
  console.log("Seeding with native MongoDB driver...");
  const client = new MongoClient("mongodb://localhost:27017/medicare?directConnection=true");
  
  try {
    await client.connect();
    const db = client.db("medicare");
    const password = await bcrypt.hash('Password123!', 10);

    // Patient
    let asha = await db.collection("User").findOne({ email: "asha@example.com" });
    if (!asha) {
      const userRes = await db.collection("User").insertOne({
        email: "asha@example.com",
        password: password,
        role: "PATIENT",
        createdAt: new Date()
      });
      await db.collection("Patient").insertOne({
        userId: userRes.insertedId,
        firstName: "Asha",
        lastName: "Sharma"
      });
    }

    // Doctor
    let dr = await db.collection("User").findOne({ email: "dr.watson@medicare.com" });
    if (!dr) {
      const userRes = await db.collection("User").insertOne({
        email: "dr.watson@medicare.com",
        password: password,
        role: "DOCTOR",
        createdAt: new Date()
      });
      await db.collection("Doctor").insertOne({
        userId: userRes.insertedId,
        firstName: "Emily",
        lastName: "Watson",
        specialization: "Cardiology",
        experienceYears: 12
      });
    }

    // Admin
    let admin = await db.collection("User").findOne({ email: "admin@medicare.com" });
    if (!admin) {
      await db.collection("User").insertOne({
        email: "admin@medicare.com",
        password: password,
        role: "ADMIN",
        createdAt: new Date()
      });
    }

    console.log("Seeding complete!");
  } finally {
    await client.close();
  }
}

main().catch(console.error);

