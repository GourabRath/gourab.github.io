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
- MongoDB running locally or a MongoDB connection string

## Setup

From the repository root, install each app's dependencies:

```powershell
Set-Location backend
npm.cmd install
npx.cmd prisma generate
Copy-Item .env.example .env
```

Edit `backend/.env` before starting the server. Set `DATABASE_URL` to your
MongoDB database and replace `JWT_SECRET` with a randomly generated secret of
at least 32 characters. `GEMINI_API_KEY` is optional; without it, the AI
guidance feature reports that it is unavailable.

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
node src/seed.js
node src/index.js
```

The seed command creates local demo accounts when they do not already exist:

| Role | Email | Password |
|---|---|---|
| Patient | `asha@example.com` | `Password123!` |
| Doctor | `dr.watson@medicare.com` | `Password123!` |
| Admin | `admin@medicare.com` | `Password123!` |

These credentials are for local development only. Change/remove them before
sharing a deployment. Never commit `.env` files or use the example JWT secret
outside a local demo.

You can also use `start.bat` from the repository root to open the backend and
frontend in separate command windows after configuring MongoDB and the backend
environment.

## Main routes

- `/` — public home page
- `/doctors` — searchable doctor directory
- `/register` — patient account registration
- `/login` — patient, doctor, or admin sign-in
- `/patient/dashboard` — appointments, records, and optional AI guidance
- `/doctor/dashboard` — appointment requests and visit-note entry
- `/admin/dashboard` — database-backed operational totals and doctor directory

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
