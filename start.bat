@echo off
echo Starting MediCare Hospital Backend...
start cmd /k "cd backend && node src/index.js"

echo Starting MediCare Hospital Frontend...
start cmd /k "cd frontend && npm run dev"

echo Both servers are starting up!

