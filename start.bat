@echo off
echo Starting MediCare Hospital Backend and preparing demo accounts...
start "MediCare Backend" cmd /k "cd /d ""%~dp0backend"" && npm.cmd run seed && npm.cmd start"

echo Starting MediCare Hospital Frontend...
start "MediCare Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm.cmd run dev"

echo Both servers are starting. Ensure MongoDB is running and backend/.env is configured.
