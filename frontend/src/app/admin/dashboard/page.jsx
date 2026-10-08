"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, graphqlRequest, isAuthenticationError, isDemoSession } from "@/lib/graphql";

export default function AdminDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [busyAppointmentId, setBusyAppointmentId] = useState("");
  const [demoLogin, setDemoLogin] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [patientForm, setPatientForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", password: "",
  });
  const [doctorForm, setDoctorForm] = useState({
    firstName: "", lastName: "", email: "", specialization: "", password: "",
  });
  const refreshInFlight = useRef(false);

  const loadDashboard = useCallback(async (background = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (background) setRefreshing(true);
    else setError("");
    try {
      const data = await graphqlRequest(`
      query AdminDashboard {
        me { id email role }
        adminOverview {
          patientCount doctorCount appointmentCount pendingAppointmentCount
        }
        doctors {
          id publicId firstName lastName specialization experienceYears
        }
        myAppointments {
          id date startTime status
          patient { firstName lastName }
          doctor { firstName lastName specialization }
        }
      }
    `);
      if (data.me?.role !== "ADMIN") {
        throw new Error("This page is available to administrator accounts.");
      }
      setOverview(data.adminOverview);
      setDemoLogin(isDemoSession("ADMIN"));
      setDoctors(data.doctors || []);
      setAppointments(data.myAppointments || []);
      setUpdatedAt(new Date());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
      if (isAuthenticationError(loadError)) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("demoRole");
        router.replace("/login?role=admin");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshInFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    const initialTimeoutId = window.setTimeout(() => {
      if (active) void loadDashboard();
    }, 0);
    const intervalId = window.setInterval(() => {
      if (active) void loadDashboard(true);
    }, 15000);
    return () => {
      active = false;
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadDashboard, router]);

  const filteredDoctors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((doctor) =>
      `${doctor.firstName} ${doctor.lastName} ${doctor.specialization}`
        .toLowerCase()
        .includes(term),
    );
  }, [doctors, search]);

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("demoRole");
    router.replace("/login?role=admin");
  };

  const updateAppointment = async (appointmentId, status) => {
    setBusyAppointmentId(appointmentId);
    setError("");
    try {
      await graphqlRequest(
        `mutation UpdateAppointment($id: ID!, $status: String!) {
          updateAppointmentStatus(appointmentId: $id, status: $status) { id }
        }`,
        { id: appointmentId, status },
      );
      await loadDashboard();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyAppointmentId("");
    }
  };

  const createProfile = async (event, kind) => {
    event.preventDefault();
    if (creatingProfile) return;
    setCreatingProfile(true);
    setProfileNotice("");
    setError("");
    try {
      const isPatient = kind === "patient";
      const mutation = isPatient
        ? `mutation CreatePatient($email: String, $phone: String, $password: String!, $firstName: String!, $lastName: String!) {
            createPatientProfile(email: $email, phone: $phone, password: $password, firstName: $firstName, lastName: $lastName) { publicId firstName lastName }
          }`
        : `mutation CreateDoctor($email: String!, $password: String!, $firstName: String!, $lastName: String!, $specialization: String!, $experienceYears: Int) {
            createDoctorProfile(email: $email, password: $password, firstName: $firstName, lastName: $lastName, specialization: $specialization, experienceYears: $experienceYears) { publicId firstName lastName }
          }`;
      const variables = isPatient
        ? { ...patientForm, email: patientForm.email || null, phone: patientForm.phone || null }
        : { ...doctorForm, experienceYears: 0 };
      const data = await graphqlRequest(mutation, variables);
      const profile = isPatient ? data.createPatientProfile : data.createDoctorProfile;
      setProfileNotice(`Created ${isPatient ? "patient" : "doctor"} ${profile.publicId}: ${profile.firstName} ${profile.lastName}.`);
      setPatientForm({ firstName: "", lastName: "", email: "", phone: "", password: "" });
      setDoctorForm({ firstName: "", lastName: "", email: "", specialization: "", password: "" });
      await loadDashboard(true);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreatingProfile(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] p-8"><p role="status">Loading administration overview…</p></main>;
  }

  const metrics = [
    ["Patients", overview?.patientCount],
    ["Doctors", overview?.doctorCount],
    ["Appointments", overview?.appointmentCount],
    ["Pending requests", overview?.pendingAppointmentCount],
  ];

  return (
    <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--navy)] px-5 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold">MediCare <span className="font-normal text-blue-200">/ Admin</span></Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:inline" aria-live="polite">
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${refreshing ? " · refreshing" : ""}`
                : "Connecting to live stats…"}
            </span>
            <button
              className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              aria-label="Refresh dashboard"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold transition hover:bg-white/10" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8">
        <section>
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--navy)]">Operations</p>
          <h1 className="mt-2 text-3xl font-bold">{demoLogin ? "Welcome, Administrator" : "Hospital overview"}</h1>
          <p className="mt-2 text-[var(--ink-soft)]">Platform totals refresh automatically every 15 seconds and can be refreshed manually.</p>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Hospital metrics">
          {metrics.map(([label, value]) => (
            <article key={label} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <p className="text-sm text-[var(--ink-soft)]">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--navy)]">
                {typeof value === "number" ? value.toLocaleString() : "—"}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2" aria-label="Create patient or doctor profiles">
          <form className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" onSubmit={(event) => createProfile(event, "patient")}>
            <div>
              <h2 className="text-lg font-bold">Create a patient profile</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">Enter an email or mobile number. The patient ID is generated automatically.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Patient first name" placeholder="First name" required value={patientForm.firstName} onChange={(event) => setPatientForm({ ...patientForm, firstName: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Patient last name" placeholder="Last name" required value={patientForm.lastName} onChange={(event) => setPatientForm({ ...patientForm, lastName: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Patient email" placeholder="Email (optional)" type="email" value={patientForm.email} onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Patient phone" placeholder="Mobile (optional)" type="tel" value={patientForm.phone} onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2 sm:col-span-2" aria-label="Temporary patient password" placeholder="Temporary password (12+ characters)" type="password" minLength={12} required value={patientForm.password} onChange={(event) => setPatientForm({ ...patientForm, password: event.target.value })} />
            </div>
            <button className="rounded-lg bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:opacity-50" disabled={creatingProfile || (!patientForm.email && !patientForm.phone)} type="submit">
              {creatingProfile ? "Creating…" : "Create patient"}
            </button>
          </form>
          <form className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" onSubmit={(event) => createProfile(event, "doctor")}>
            <div>
              <h2 className="text-lg font-bold">Create a doctor profile</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">Doctor ID is generated automatically. A temporary password lets the doctor sign in.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Doctor first name" placeholder="First name" required value={doctorForm.firstName} onChange={(event) => setDoctorForm({ ...doctorForm, firstName: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Doctor last name" placeholder="Last name" required value={doctorForm.lastName} onChange={(event) => setDoctorForm({ ...doctorForm, lastName: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Doctor email" placeholder="Email" type="email" required value={doctorForm.email} onChange={(event) => setDoctorForm({ ...doctorForm, email: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Doctor specialty" placeholder="Specialty" required value={doctorForm.specialization} onChange={(event) => setDoctorForm({ ...doctorForm, specialization: event.target.value })} />
              <input className="rounded-lg border border-[var(--border)] px-3 py-2 sm:col-span-2" aria-label="Temporary doctor password" placeholder="Temporary password (12+ characters)" type="password" minLength={12} required value={doctorForm.password} onChange={(event) => setDoctorForm({ ...doctorForm, password: event.target.value })} />
            </div>
            <button className="rounded-lg bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:opacity-50" disabled={creatingProfile} type="submit">
              {creatingProfile ? "Creating…" : "Create doctor"}
            </button>
          </form>
        </section>
        {profileNotice && <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900" role="status">{profileNotice}</p>}

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">Doctor directory</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">Registered providers and specialties.</p>
            </div>
            <label className="text-sm">
              <span className="sr-only">Search doctors</span>
              <input
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 sm:w-64"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or specialty"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="relative z-30 bg-gray-50 text-sm text-[var(--ink-soft)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Profile ID</th>
                  <th className="px-5 py-3 font-semibold">Doctor</th>
                  <th className="px-5 py-3 font-semibold">Specialty</th>
                  <th className="px-5 py-3 font-semibold">Experience</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredDoctors.length === 0 ? (
                  <tr><td className="px-5 py-8 text-center text-sm text-[var(--ink-soft)]" colSpan={4}>No matching doctors found.</td></tr>
                ) : filteredDoctors.map((doctor) => (
                  <tr key={doctor.id} className="transition hover:bg-gray-50">
                    <td className="px-5 py-4 font-mono text-sm">{doctor.publicId || "—"}</td>
                    <td className="px-5 py-4 font-semibold">Dr. {doctor.firstName} {doctor.lastName}</td>
                    <td className="px-5 py-4">{doctor.specialization}</td>
                    <td className="px-5 py-4">{doctor.experienceYears} years</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-lg font-bold">Appointment management</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Review real appointment requests and update their status.</p>
          </div>
          {appointments.length === 0 ? (
            <p className="p-6 text-sm text-[var(--ink-soft)]">There are no appointments yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold">
                      {appointment.patient?.firstName} {appointment.patient?.lastName}
                      <span className="font-normal text-[var(--ink-soft)]"> with </span>
                      Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {formatDate(appointment.date)}
                      {" · "}{appointment.startTime}
                      {" · "}{appointment.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {appointment.status === "PENDING" && (
                      <>
                        <button
                          disabled={busyAppointmentId === appointment.id}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => updateAppointment(appointment.id, "CANCELLED")}
                        >
                          Decline
                        </button>
                        <button
                          disabled={busyAppointmentId === appointment.id}
                          className="rounded-lg bg-[var(--navy)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:opacity-50"
                          onClick={() => updateAppointment(appointment.id, "CONFIRMED")}
                        >
                          Confirm
                        </button>
                      </>
                    )}
                    {appointment.status === "CONFIRMED" && (
                      <button
                        disabled={busyAppointmentId === appointment.id}
                        className="rounded-lg bg-[var(--teal)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-dark)] disabled:opacity-50"
                        onClick={() => updateAppointment(appointment.id, "COMPLETED")}
                      >
                        Mark completed
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs leading-5 text-[var(--ink-faint)]">
          This demonstration dashboard shows operational counts only. It does not replace an audited hospital information system.
        </p>
      </div>
    </main>
  );
}
