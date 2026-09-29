# MediCare Hospital Platform

A beginner-friendly Express and SQLite foundation for the existing MediCare static portal. The server owns authentication, authorization, appointment conflicts, and persistence; the HTML pages are served from the same origin.

## Local setup

Requirements: Node.js 20 or newer.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd start
```

Open http://localhost:3000. The database is created at `data/medicare.sqlite` on first start, and `server.js` initializes or migrates its tables automatically. For development, the default JWT secret works; set a long random `JWT_SECRET` before any shared or production deployment.

PowerShell may block `npm.ps1`; use `npm.cmd` as shown above.

## Seed accounts

All seeded accounts use `Password123!` for local development only:

- Patient: `asha@example.com`
- Doctor: `e.watson@medicare-hospital.app`
- Admin: `r.kapoor`

Change or remove seed credentials before deployment. Passwords are stored as bcrypt hashes, never plaintext.

## API summary

JSON requests use `Content-Type: application/json`. Login creates an HTTP-only, SameSite session cookie. A bearer token is also accepted for API clients.

- `POST /api/auth/login` `{ identity, password, role }`
- `POST /api/auth/register` `{ name, email, password }` (creates a patient account)
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/doctors?search=&specialty=`
- `GET /api/doctors/:id/availability`
- `GET /api/appointments` (patient-owned or doctor-owned; admin sees all)
- `POST /api/appointments` (patient: `{ doctorId, date, time, reason }`)
- `PATCH /api/appointments/:id/cancel` (own patient appointment or admin)
- `PATCH /api/doctors/me/availability` (doctor: `{ availability: [{ dayOfWeek, startTime, endTime }] }`)
- `POST /api/prescriptions` (doctor: `{ patientId, appointmentId, medicine, instructions }`)
- `GET /api/admin/overview` (admin only)

Invalid input returns `400`, missing authentication `401`, wrong role `403`, missing records `404`, and appointment conflicts `409`.

## Checks

```powershell
npm.cmd run syntax
npm.cmd test
```

A quick manual check after starting the server:

```powershell
$body = @{ identity = 'asha@example.com'; password = 'Password123!'; role = 'patient' } | ConvertTo-Json
Invoke-WebRequest http://localhost:3000/api/auth/login -Method Post -ContentType 'application/json' -Body $body
Invoke-WebRequest http://localhost:3000/api/doctors?specialty=Cardiology
```

## Production notes

Use a strong secret and a real HTTPS origin, restrict `CORS_ORIGIN`, keep the SQLite file on persistent storage, and put the app behind a TLS-terminating reverse proxy. A production deployment should add a managed database, centralized session revocation, backups, monitoring, and a formal privacy/security review before handling real health information.

