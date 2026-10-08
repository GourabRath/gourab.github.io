const typeDefs = `#graphql
  type User {
    id: ID!
    publicId: String
    email: String
    role: String!
    patient: Patient
    doctor: Doctor
  }

  type Patient {
    id: ID!
    publicId: String
    firstName: String!
    lastName: String!
    phone: String
    dob: String
    sex: String
    address: String
    user: User
  }

  type Location {
    id: ID!
    name: String!
    city: String!
    state: String!
  }

  type Speciality {
    id: ID!
    name: String!
    description: String
    icon: String
  }

  type HealthPackage {
    id: ID!
    name: String!
    description: String!
    price: Int!
    tests: [String]
  }

  type Doctor {
    id: ID!
    publicId: String
    firstName: String!
    lastName: String!
    specialization: String!
    experienceYears: Int!
    profileImageUrl: String
    location: Location
    speciality: Speciality
    user: User
  }

  type Appointment {
    id: ID!
    date: String!
    startTime: String!
    status: String!
    notes: String
    fee: Int
    paymentStatus: String
    patient: Patient
    doctor: Doctor
  }

  type Availability {
    id: ID!
    doctorId: ID!
    dayOfWeek: Int!
    startTime: String!
    endTime: String!
  }

  type MedicalRecord {
    id: ID!
    title: String!
    description: String!
    fileUrl: String
    createdAt: String!
    patient: Patient
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type AdminOverview {
    patientCount: Int!
    doctorCount: Int!
    appointmentCount: Int!
    pendingAppointmentCount: Int!
  }

  type AdminAccount {
    id: ID!
    publicId: String
    email: String!
    role: String!
    createdAt: String!
  }

  type PlatformMetrics {
    patientCount: Int!
    doctorCount: Int!
    adminCount: Int!
    appointmentCount: Int!
    pendingAppointmentCount: Int!
    generatedAt: String!
  }

  type Query {
    me: User
    adminOverview: AdminOverview!
    platformMetrics: PlatformMetrics!
    superadminPatientProfiles(limit: Int, offset: Int): [Patient!]!
    superadminDoctorProfiles(limit: Int, offset: Int): [Doctor!]!
    superadminAccounts(limit: Int, offset: Int): [AdminAccount!]!
    doctors(locationId: ID, specialityId: ID, search: String): [Doctor]
    locations: [Location]
    specialities: [Speciality]
    healthPackages: [HealthPackage]
    doctorAvailability(doctorId: ID!): [Availability!]!
    myAppointments: [Appointment]
    myMedicalRecords: [MedicalRecord!]!
    patientMedicalRecords(patientId: ID!): [MedicalRecord]
  }

  type Mutation {
    registerPatient(
      email: String
      password: String!, 
      firstName: String!, 
      lastName: String!, 
      phone: String
      dob: String, 
      sex: String, 
      address: String
    ): AuthPayload!
    login(email: String!, password: String!, role: String!): AuthPayload!
    askAIAssistant(message: String!): String!
    bookAppointment(doctorId: ID!, date: String!, startTime: String!, notes: String): Appointment!
    updateAppointmentStatus(appointmentId: ID!, status: String!): Appointment!
    createPaymentIntent(appointmentId: ID!): String!
    addMedicalRecord(patientId: ID!, title: String!, description: String!, fileUrl: String): MedicalRecord!
    createPatientProfile(email: String, phone: String, password: String!, firstName: String!, lastName: String!, dob: String, sex: String, address: String): Patient!
    createDoctorProfile(email: String!, password: String!, firstName: String!, lastName: String!, specialization: String!, experienceYears: Int, locationId: ID, specialityId: ID, profileImageUrl: String): Doctor!
    updatePatientProfile(patientId: ID!, email: String, password: String, firstName: String, lastName: String, phone: String, dob: String, sex: String, address: String): Patient!
    updateDoctorProfile(doctorId: ID!, email: String, password: String, firstName: String, lastName: String, specialization: String, experienceYears: Int, locationId: ID, specialityId: ID, profileImageUrl: String): Doctor!
    deletePatientProfile(patientId: ID!): Boolean!
    deleteDoctorProfile(doctorId: ID!): Boolean!
    createAdminAccount(email: String!, password: String!): AdminAccount!
    updateAdminAccount(adminUserId: ID!, email: String, password: String, role: String): AdminAccount!
    deleteAdminAccount(adminUserId: ID!): Boolean!
  }
`;

module.exports = typeDefs;
