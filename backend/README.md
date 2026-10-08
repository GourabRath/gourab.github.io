# MediCare backend

Express 5 + Apollo Server 4 GraphQL API backed by Prisma Client and MongoDB. The API is served at `/graphql`; no REST or alternate database is used.

## Local setup

Requirements: Node.js 20+ and MongoDB running as a replica set (local or MongoDB Atlas connection string). Prisma's MongoDB writes require transaction support; a standalone MongoDB server is insufficient for schema push, seeding, or appointment/record workflows. Configure a local `mongod` with `--replSet rs0`, then initialize it once with `mongosh --eval "rs.initiate()"`. Do not run a second `mongod` against a data directory while another MongoDB service is active. From this directory:

```sh
npm ci
Copy-Item .env.example .env  # PowerShell; alternatively copy it using your OS
```

Edit `.env` locally. Set `DATABASE_URL` to a MongoDB replica-set URL (for a local single-node replica set, include `?replicaSet=rs0`) and `JWT_SECRET` to a randomly generated value of at least 32 characters. Do not commit `.env` or use the example placeholder as a real secret.

```sh
npm run prisma:validate
npm run prisma:generate
npm run db:push
npm run backfill:public-ids
npm run seed
npm start
```

The seed creates patient, doctor, and admin demo accounts, each with the seed-only password `Password123!`:

- `asha@example.com` or `+1 555 010 1001` (`PATIENT`)
- `dr.watson@medicare.com` (`DOCTOR`)
- `admin@medicare.com` (`ADMIN`)

Change these credentials and remove/replace demo accounts before exposing an environment outside local development. Seed execution requires a reachable MongoDB database and the generated Prisma client. Registration and profile creation write related documents with the native MongoDB driver, but the complete platform still requires a MongoDB replica set for Prisma's multi-document writes and transactions.
The demo patient seed includes sample pending, confirmed, and completed appointments and a clearly marked fictional medical record so patient, doctor, and admin workflows can be tried immediately. Running the seed repeatedly does not duplicate those demo rows.

### Initial superadmin

Ordinary demo and operational accounts retain the `ADMIN` role. To provision the first platform superadmin, set `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` in the local environment (use a unique email and a password of at least 10 characters), then run:

```sh
npm run seed:superadmin
```

This command creates a `SUPERADMIN` login and fails if that email already exists; it does not promote an existing account or create a default superadmin. Keep the password out of source control and remove the temporary environment values after bootstrapping. Additional superadmins are intentionally not creatable through GraphQL; use a reviewed operational bootstrap procedure.

## Configuration

- `DATABASE_URL` (required): MongoDB connection string, including the intended database name.
- `JWT_SECRET` (required): at least 32 characters. Tokens use HS256, issuer/audience validation, and an eight-hour expiry.
- `PORT` (optional; default `4000`): HTTP listening port.
- `NODE_ENV` (optional): set `production` to disable GraphQL introspection.
- `FRONTEND_ORIGIN` (optional): comma-separated exact browser origins; defaults to `http://localhost:3000,http://localhost:5173`.
- `GEMINI_API_KEY` (optional): enables symptom guidance. Without it or when the provider fails, the API returns an unavailable message with an emergency/clinical disclaimer.
- `STRIPE_SECRET_KEY` (optional): enables Stripe PaymentIntent creation. Without it, the payment mutation fails closed; this API does not mark payments paid. Payment settlement/webhooks are not implemented.
- `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` (optional): used only by the explicit, one-time `seed:superadmin` bootstrap command. Never leave bootstrap credentials configured in a deployed application.

The server refuses startup for missing/weak JWT configuration or a missing/non-MongoDB database URL. Never place secrets or patient data in logs. Socket.IO requires the same signed bearer token as GraphQL; appointment events are not broadcast to other users.

## GraphQL contract

Use `Authorization: Bearer <token>` for authenticated operations. `login(email, password, role)` returns `{ token, user }`; email is case-insensitive, and a patient may also use their phone number as the identifier. Password hashes are never in the GraphQL `User` type or returned auth payload. `registerPatient` validates its inputs and returns a patient token. JWTs are checked on every request against MongoDB so deleted users and changed roles lose access. There is no server-side token revocation list; expiration is eight hours.

Public reads: `doctors`, `locations`, `specialities`, `healthPackages`, and `doctorAvailability(doctorId)`.

Authentication is password-only: `login(email, password, role)` returns `{ token, user }`; a patient may use an email address or mobile number in the `email` identifier argument. Registration accepts an email, a mobile number, or both, plus a password; at least one contact identifier is required. There is no OTP/2FA step. Phone-only accounts use an internal reserved `phone.invalid` identifier that is never returned as the patient's email.

Authenticated operations:

- `adminOverview` is admin-only and returns real MongoDB-backed Prisma counts as `patientCount`, `doctorCount`, `appointmentCount`, and `pendingAppointmentCount`.
- `me` returns the current user's safe profile; `myAppointments` is scoped to the patient/doctor, or all appointments for an admin.
- `bookAppointment(doctorId, date, startTime, notes)` is patient-only. It validates IDs, future dates, time, doctor and optional configured availability; rejects a non-cancelled doctor/date/time collision; and creates a `PENDING` appointment. For compatibility with the existing seed (which does not configure availability), a doctor with no availability rows is treated as having no configured restriction.
- `updateAppointmentStatus(appointmentId, status)` is restricted to the appointment patient, assigned doctor, or admin. Patients may cancel pending/confirmed appointments; doctors/admins may confirm pending appointments and complete/cancel/mark no-show on confirmed appointments. Terminal states cannot be reopened.
- `myMedicalRecords` returns the authenticated patient's own records without a client-supplied ID. `patientMedicalRecords(patientId)` allows only the patient themself, an admin, or a doctor with an appointment for that patient. A treating doctor can use the relevant patient ID. `addMedicalRecord` is limited to admins and treating doctors.
- `createPaymentIntent(appointmentId)` is patient-owner-only and requires Stripe configuration; it never simulates a payment or changes payment status to paid.
- `askAIAssistant(message)` requires authentication and bounded input; responses are explicitly non-diagnostic and include a professional-care/emergency disclaimer.

### Superadmin operations

The `SUPERADMIN` role is authenticated with the same signed JWT flow as other roles and is checked against the current MongoDB user role on every request. An obscure URL, client role selector, or ordinary `ADMIN` token does not grant these capabilities. `SUPERADMIN` can also use existing admin workflows.

- `superadminPatientProfiles(limit, offset)`, `superadminDoctorProfiles(limit, offset)`, and `superadminAccounts(limit, offset)` list profiles/accounts; pagination defaults to 100 rows, maximum 200.
- `createPatientProfile(...)` and `createDoctorProfile(...)` are available to both `ADMIN` and `SUPERADMIN`; they create credential-backed `PATIENT`/`DOCTOR` users and profiles in MongoDB. Passwords are bcrypt-hashed. `updatePatientProfile(...)`, `updateDoctorProfile(...)`, `deletePatientProfile(...)`, and `deleteDoctorProfile(...)` remain `SUPERADMIN`-only. Profile update mutations can optionally reset the login password; hashes are never returned.
- `createAdminAccount(email, password)`, `updateAdminAccount(adminUserId, email, password, role)`, and `deleteAdminAccount(adminUserId)` manage ordinary `ADMIN` accounts. The role field accepts only `ADMIN`; self-deletion and superadmin promotion/demotion/deletion through these operations are denied. Superadmins are created only by the explicit bootstrap command.
- `platformMetrics` returns a database-backed point-in-time count snapshot with `generatedAt`; it is not a streaming subscription or an uptime probe.

New user/profile codes use `P` + six digits for patients, `D` + six digits for doctors, and `A` + six digits for admin/superadmin accounts. These appear as `publicId`; the existing MongoDB ObjectId `id` remains unchanged for API compatibility and relationship keys. The database unique indexes enforce uniqueness and generation retries collisions. Run `npm run backfill:public-ids` after `db:push` to assign codes to existing rows; it only fills missing codes.

Patient deletion is irreversible and also removes that patient's appointments and medical records; doctor deletion removes that doctor's appointments and availability. These mutations require superadmin authorization and emit ID/action-only audit events. Verify retention and legal requirements before using deletion outside a disposable/development environment.

MongoDB notes: Prisma's MongoDB connector uses `db push` rather than relational SQL migrations. The new `publicId` values are optional in the schema so existing records remain readable until backfill. User/profile creation is deliberately performed using the MongoDB driver with compensating cleanup: it avoids assuming multi-document transaction support on the documented standalone local MongoDB setup. Profile edits and deletions span multiple MongoDB documents and are sequential, not atomic; a process/database failure can leave partial work requiring operational reconciliation. Production should use a replica set and add transaction-backed profile operations before relying on destructive management workflows.

Input/authentication failures have safe GraphQL error messages/codes; unexpected server/database errors are returned as `Request failed.`. The GraphQL endpoint has a bounded JSON body, exact-origin CORS, Helmet headers, bearer-only auth (no cookie CSRF surface), a general in-memory per-IP request limit, and a stricter 10-request/15-minute per-IP limit on login/registration operations.

## Validation

```sh
npm test
npm run prisma:validate
npm run prisma:generate
```

Tests use Node's built-in test runner and mocked Prisma/MongoDB calls; they do not require a live database or external AI/payment services. The public-ID backfill and seed commands do require the configured MongoDB database.

## Deployment notes / remaining integrations

Deploy behind HTTPS with a managed MongoDB deployment, a unique high-entropy JWT secret, explicit production browser origins, protected secret storage, backups, and monitored rate limits. The in-memory limiter is per process and is not a distributed brute-force control. MongoDB's read-then-create slot check does not provide a distributed atomic reservation, so concurrent booking races require a production-grade reservation/locking design. Stripe webhook signature verification/payment settlement, durable notification delivery, token revocation, operational audit storage, and formal privacy/security/clinical compliance review are not implemented.
