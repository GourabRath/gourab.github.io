# MediCare Health

MediCare is a full-stack healthcare management **demo** built with a Next.js
frontend and an Express, GraphQL, Prisma, and MongoDB backend. It includes
patient registration and sign-in, a doctor directory, appointment requests,
provider appointment management, patient visit notes, an admin overview, and
optional AI-generated health information.

> This project is for learning and demonstration. Do not enter real patient
> information or use it to make clinical decisions. It is not a certified
> electronic health record or emergency service.

## Requirements

- Node.js 20 or newer
- MongoDB running as a replica set locally or remotely (required by Prisma's MongoDB transaction support)

For a local single-node replica set, configure MongoDB to start with replica-set
name `rs0` and initialize it once with `mongosh --eval "rs.initiate()"`. Do not
run a second `mongod` against the same data directory while another MongoDB
service is active.

## Setup

From the repository root, install each app's dependencies:

```powershell
Set-Location backend
npm.cmd install
Copy-Item .env.example .env
```

Edit `backend/.env` before starting the server. Set `DATABASE_URL` to your
MongoDB replica-set database (for a local single-node replica set, include
`?replicaSet=rs0`) and replace `JWT_SECRET` with a randomly generated secret of
at least 32 characters. `GEMINI_API_KEY` is optional; without it, the AI
guidance feature reports that it is unavailable.

Then prepare and seed the database:

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run db:push
npm.cmd run seed
```

In a second terminal, install and start the frontend:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Open <http://localhost:3000>. The frontend connects to
`http://localhost:4000/graphql` by default. To use a different backend URL, set
`NEXT_PUBLIC_GRAPHQL_URL` in `frontend/.env.local`.

## Start the backend

In another terminal:

```powershell
Set-Location backend
npm.cmd start
```

The seed command creates local demo accounts and sample patient workflows when
they do not already exist (run it after database setup):

| Role | Email | Password |
|---|---|---|
| Patient | `asha@example.com` or `+1 555 010 1001` | `Password123!` |
| Doctor | `dr.watson@medicare.com` | `Password123!` |
| Admin | `admin@medicare.com` | `Password123!` |

These credentials are for local development only. Change/remove them before
sharing a deployment. Never commit `.env` files or use the example JWT secret
outside a local demo.

The sign-in page also includes an **Enter demo** button for the selected role.
It signs in through the normal backend login and does not bypass authentication.
Patients can sign in with their email address or mobile number and password.
Patient registration accepts either contact identifier (or both) and a
password; there is no OTP or second-factor step in this demo.

After installing dependencies, generating the Prisma client, pushing the
schema, and configuring `backend/.env`, you can run `start.bat` from the
repository root. It seeds the demo accounts, then opens the backend and
frontend in separate command windows. MongoDB must be running.

## Main routes

- `/` — public home page
- `/doctors` — searchable doctor directory
- `/register` — patient account registration
- `/login` — patient, doctor, or admin sign-in
- `/patient/dashboard` — appointments, records, and optional AI guidance
- `/doctor/dashboard` — appointment requests and visit-note entry
- `/admin/dashboard` — database-backed operational totals, appointment actions, and patient/doctor profile creation
- `/medicare.superadmin` — restricted account/profile management; requires a provisioned `SUPERADMIN` account and has no public navigation link

## Superadmin setup

Create the first superadmin only after the database replica set is configured,
the schema is pushed, and the Prisma client is generated. Set `SUPERADMIN_EMAIL`
and `SUPERADMIN_PASSWORD` in `backend/.env`, then run:

```powershell
Set-Location backend
npm.cmd run seed:superadmin
npm.cmd run backfill:public-ids
```

Remove the temporary bootstrap values after creating the account. Sign in at
`/login?role=superadmin`; successful authentication opens
`/medicare.superadmin`. The route is hidden from navigation but is not a
security boundary: all sensitive profile/admin APIs enforce the
`SUPERADMIN` role on the server. Ordinary admins may create patient and doctor
profiles; only superadmins may edit/delete profiles or manage admin accounts.
Profile numbers use `P`/`D`/`A` plus six digits and are not passwords or login
credentials.

## Validation

```powershell
Set-Location frontend
npm.cmd run lint
npm.cmd run build

Set-Location ..\backend
npm.cmd test
```

## Notes

- Backend authentication and role checks are enforced by the API; the
  dashboard redirects are not a substitute for authorization.
- Payments, third-party file storage, notifications, and production deployment
  are not enabled unless separately configured and implemented.
- AI health guidance is informational, may be unavailable without a provider
  key, and is not a diagnosis, prescription, or replacement for a clinician.
