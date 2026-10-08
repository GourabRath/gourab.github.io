# MediCare backend

Express 5 + Apollo Server 4 GraphQL API backed by Prisma Client and MongoDB. The API is served at `/graphql`; no REST or alternate database is used.

## Local setup

Requirements: Node.js 20+ and MongoDB (local or a MongoDB Atlas connection string). From this directory:

```sh
npm ci
Copy-Item .env.example .env  # PowerShell; alternatively copy it using your OS
```

Edit `.env` locally. Set `DATABASE_URL` to a MongoDB URL and `JWT_SECRET` to a randomly generated value of at least 32 characters. Do not commit `.env` or use the example placeholder as a real secret.

```sh
npm run prisma:validate
npm run prisma:generate
npm run db:push
npm run seed
npm start
```

The seed creates patient, doctor, and admin demo accounts, each with the seed-only password `Password123!`:

- `asha@example.com` (`PATIENT`)
- `dr.watson@medicare.com` (`DOCTOR`)
- `admin@medicare.com` (`ADMIN`)

Change these credentials and remove/replace demo accounts before exposing an environment outside local development. Seed execution requires a reachable MongoDB database and the generated Prisma client. Registration writes the user/profile pair with the native MongoDB driver so it works on standalone MongoDB deployments that do not support Prisma's multi-document transaction flow.

## Configuration

- `DATABASE_URL` (required): MongoDB connection string, including the intended database name.
- `JWT_SECRET` (required): at least 32 characters. Tokens use HS256, issuer/audience validation, and an eight-hour expiry.
- `PORT` (optional; default `4000`): HTTP listening port.
- `NODE_ENV` (optional): set `production` to disable GraphQL introspection.
- `FRONTEND_ORIGIN` (optional): comma-separated exact browser origins; defaults to `http://localhost:3000,http://localhost:5173`.
- `GEMINI_API_KEY` (optional): enables symptom guidance. Without it or when the provider fails, the API returns an unavailable message with an emergency/clinical disclaimer.
- `STRIPE_SECRET_KEY` (optional): enables Stripe PaymentIntent creation. Without it, the payment mutation fails closed; this API does not mark payments paid. Payment settlement/webhooks are not implemented.

The server refuses startup for missing/weak JWT configuration or a missing/non-MongoDB database URL. Never place secrets or patient data in logs. Socket.IO requires the same signed bearer token as GraphQL; appointment events are not broadcast to other users.

## GraphQL contract

Use `Authorization: Bearer <token>` for authenticated operations. `login(email, password, role)` returns `{ token, user }`; email is case-insensitive, and a patient may also use their phone number as the identifier. Password hashes are never in the GraphQL `User` type or returned auth payload. `registerPatient` validates its inputs and returns a patient token. JWTs are checked on every request against MongoDB so deleted users and changed roles lose access. There is no server-side token revocation list; expiration is eight hours.

Public reads: `doctors`, `locations`, `specialities`, `healthPackages`, and `doctorAvailability(doctorId)`.

Authenticated operations:

- `adminOverview` is admin-only and returns real MongoDB-backed Prisma counts for patients, doctors, all appointments, and `PENDING` appointments.
- `me` returns the current user's safe profile; `myAppointments` is scoped to the patient/doctor, or all appointments for an admin.
- `bookAppointment(doctorId, date, startTime, notes)` is patient-only. It validates IDs, future dates, time, doctor and optional configured availability; rejects a non-cancelled doctor/date/time collision; and creates a `PENDING` appointment. For compatibility with the existing seed (which does not configure availability), a doctor with no availability rows is treated as having no configured restriction.
- `updateAppointmentStatus(appointmentId, status)` is restricted to the appointment patient, assigned doctor, or admin. Patients may cancel pending/confirmed appointments; doctors/admins may confirm pending appointments and complete/cancel/mark no-show on confirmed appointments. Terminal states cannot be reopened.
- `patientMedicalRecords(patientId)` allows only the patient themself, an admin, or a doctor with an appointment for that patient. A patient can supply their profile ID from `me.patient.id`; a treating doctor can use the relevant patient ID. `addMedicalRecord` is limited to admins and treating doctors.
- `createPaymentIntent(appointmentId)` is patient-owner-only and requires Stripe configuration; it never simulates a payment or changes payment status to paid.
- `askAIAssistant(message)` requires authentication and bounded input; responses are explicitly non-diagnostic and include a professional-care/emergency disclaimer.

Input/authentication failures have safe GraphQL error messages/codes; unexpected server/database errors are returned as `Request failed.`. The GraphQL endpoint has a bounded JSON body, exact-origin CORS, Helmet headers, bearer-only auth (no cookie CSRF surface), a general in-memory per-IP request limit, and a stricter 10-request/15-minute per-IP limit on login/registration operations.

## Validation

```sh
npm test
npm run prisma:validate
npm run prisma:generate
```

Tests use Node's built-in test runner and mocked Prisma calls; they do not require a live database or external AI/payment services.

## Deployment notes / remaining integrations

Deploy behind HTTPS with a managed MongoDB deployment, a unique high-entropy JWT secret, explicit production browser origins, protected secret storage, backups, and monitored rate limits. The in-memory limiter is per process and is not a distributed brute-force control. MongoDB's read-then-create slot check does not provide a distributed atomic reservation, so concurrent booking races require a production-grade reservation/locking design. Stripe webhook signature verification/payment settlement, durable notification delivery, token revocation, operational audit storage, and formal privacy/security/clinical compliance review are not implemented.
