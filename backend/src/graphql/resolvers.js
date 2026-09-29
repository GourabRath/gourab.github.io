const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const resolvers = {
  Query: {
    me: async (_, __, { prisma, user }) => {
      if (!user) throw new Error("Not authenticated");
      return prisma.user.findUnique({
        where: { id: user.id },
        include: { patient: true, doctor: true }
      });
    },
    doctors: async (_, { locationId, specialityId, search }, { prisma }) => {
      let where = {};
      if (locationId) where.locationId = locationId;
      if (specialityId) where.specialityId = specialityId;
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { specialization: { contains: search, mode: 'insensitive' } }
        ];
      }
      return prisma.doctor.findMany({ 
        where,
        include: { user: true, location: true, speciality: true } 
      });
    },
    locations: async (_, __, { prisma }) => {
      return prisma.location.findMany();
    },
    specialities: async (_, __, { prisma }) => {
      return prisma.speciality.findMany();
    },
    healthPackages: async (_, __, { prisma }) => {
      return prisma.healthPackage.findMany();
    },
    myAppointments: async (_, __, { prisma, user }) => {
      if (!user) throw new Error("Not authenticated");
      
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { patient: true, doctor: true }
      });

      if (user.role === 'PATIENT' && dbUser.patient) {
        return prisma.appointment.findMany({
          where: { patientId: dbUser.patient.id },
          include: { doctor: { include: { user: true } }, patient: true },
          orderBy: { date: 'desc' }
        });
      } else if (user.role === 'DOCTOR' && dbUser.doctor) {
        return prisma.appointment.findMany({
          where: { doctorId: dbUser.doctor.id },
          include: { patient: { include: { user: true } }, doctor: true },
          orderBy: { date: 'desc' }
        });
      }
      return [];
    },
    patientMedicalRecords: async (_, { patientId }, { prisma, user }) => {
      if (!user) throw new Error("Not authenticated");
      return prisma.medicalRecord.findMany({
        where: { patientId },
        include: { patient: true },
        orderBy: { createdAt: 'desc' }
      });
    }
  },
  Mutation: {
    registerPatient: async (_, args, { prisma }) => {
      const { email, password, firstName, lastName, phone, dob, sex, address } = args;
      
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) throw new Error("Email already registered");

      const existingPatient = await prisma.patient.findFirst({ where: { phone } });
      if (existingPatient) throw new Error("Phone number already registered");

      const hashedPassword = await bcrypt.hash(password, 10);

      // We use native MongoDB driver to bypass Prisma's transaction requirement for standalone MongoDB
      const { MongoClient, ObjectId } = require('mongodb');
      const client = new MongoClient(process.env.DATABASE_URL);
      await client.connect();
      const db = client.db();

      const userId = new ObjectId();
      await db.collection('User').insertOne({
        _id: userId,
        email,
        password: hashedPassword,
        role: "PATIENT",
        createdAt: new Date()
      });

      const patientId = new ObjectId();
      await db.collection('Patient').insertOne({
        _id: patientId,
        userId: userId,
        firstName,
        lastName,
        phone,
        sex: sex || null,
        address: address || null,
        dateOfBirth: dob ? new Date(dob) : null
      });

      await client.close();

      const user = { id: userId.toString(), email, role: "PATIENT" };

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        process.env.JWT_SECRET, 
        { expiresIn: "1d" }
      );

      return { token, user };
    },
    login: async (_, { email, password, role }, { prisma }) => {
      let user = await prisma.user.findUnique({ 
        where: { email },
        include: { patient: true, doctor: true } 
      });

      if (!user) {
        const patient = await prisma.patient.findFirst({
          where: { phone: email },
          include: { user: { include: { patient: true, doctor: true } } }
        });
        if (patient) {
          user = patient.user;
        }
      }

      if (!user) throw new Error("Invalid credentials");

      if (user.role !== role.toUpperCase()) {
        throw new Error(`Account is not registered as a ${role}`);
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error("Invalid credentials");

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        process.env.JWT_SECRET, 
        { expiresIn: "1d" }
      );

      return { token, user };
    },
    askAIAssistant: async (_, { message }, { user }) => {
      if (!user) throw new Error("Authentication required to use AI Assistant");
      
      const aiService = require('../services/ai.service');
      return await aiService.getSymptomGuidance(message);
    },
    bookAppointment: async (_, { doctorId, date, startTime, notes }, { prisma, user, io }) => {
      if (!user || user.role !== 'PATIENT') throw new Error("Only patients can book appointments");
      
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, include: { patient: true }});
      if (!dbUser || !dbUser.patient) throw new Error("Patient profile not found");

      const appointment = await prisma.appointment.create({
        data: {
          patientId: dbUser.patient.id,
          doctorId,
          date: new Date(date),
          startTime,
          notes,
          status: 'PENDING'
        },
        include: { doctor: true, patient: true }
      });

      // Emit event for real-time notification
      io.emit('appointmentBooked', appointment);

      return appointment;
    },
    updateAppointmentStatus: async (_, { appointmentId, status }, { prisma, user, io }) => {
      if (!user) throw new Error("Not authenticated");

      const appointment = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status },
        include: { doctor: true, patient: true }
      });

      io.emit('appointmentStatusUpdated', appointment);
      
      return appointment;
    },
    createPaymentIntent: async (_, { appointmentId }, { prisma, user }) => {
      if (!user || user.role !== 'PATIENT') throw new Error("Only patients can make payments");

      const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }});
      if (!appointment) throw new Error("Appointment not found");

      if (appointment.paymentStatus === 'PAID') {
        throw new Error("Appointment is already paid");
      }

      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: appointment.fee,
          currency: 'usd',
          metadata: { appointmentId: appointment.id }
        });

        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { paymentIntent: paymentIntent.id }
        });

        return paymentIntent.client_secret;
      } else {
        console.warn("[PAYMENTS] Stripe credentials missing in .env. Falling back to dummy success token.");
        
        // Update to PAID immediately for demo purposes
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { paymentStatus: 'PAID' }
        });

        return "dummy_client_secret_for_demo_mode_since_no_stripe_key_provided";
      }
    },
    addMedicalRecord: async (_, { patientId, title, description, fileUrl }, { prisma, user }) => {
      if (!user || user.role !== 'DOCTOR') throw new Error("Only doctors can add medical records");
      return prisma.medicalRecord.create({
        data: {
          patientId,
          title,
          description,
          fileUrl
        },
        include: { patient: true }
      });
    }
  }
};

module.exports = resolvers;
