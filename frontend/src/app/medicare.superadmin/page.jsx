"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { formatDate, graphqlRequest, isAuthenticationError } from "@/lib/graphql";

const inputClass = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-[var(--navy)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:cursor-not-allowed disabled:opacity-50";

const MANAGEMENT_QUERY = `
  query SuperadminDashboard($patientOffset: Int!, $doctorOffset: Int!, $accountOffset: Int!) {
    me { id role }
    platformMetrics {
      patientCount doctorCount adminCount appointmentCount pendingAppointmentCount generatedAt
    }
    superadminPatientProfiles(limit: 100, offset: $patientOffset) {
      id publicId firstName lastName phone dob sex address user { email }
    }
    superadminDoctorProfiles(limit: 100, offset: $doctorOffset) {
      id publicId firstName lastName specialization experienceYears user { email }
    }
    superadminAccounts(limit: 100, offset: $accountOffset) {
      id publicId email role createdAt
    }
    myAppointments {
      id date startTime status
      patient { publicId firstName lastName }
      doctor { publicId firstName lastName specialization }
    }
  }
`;

export default function SuperadminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(null);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [offsets, setOffsets] = useState({ patients: 0, doctors: 0, accounts: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);
  const [patientForm, setPatientForm] = useState({ email: "", phone: "", password: "", firstName: "", lastName: "" });
  const [doctorForm, setDoctorForm] = useState({ email: "", password: "", firstName: "", lastName: "", specialization: "", experienceYears: "0" });
  const [adminForm, setAdminForm] = useState({ email: "", password: "" });
  const inFlight = useRef(false);

  const loadDashboard = useCallback(async (background = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (background) setRefreshing(true);
    try {
      const data = await graphqlRequest(MANAGEMENT_QUERY, {
        patientOffset: offsets.patients,
        doctorOffset: offsets.doctors,
        accountOffset: offsets.accounts,
      });
      if (data.me?.role !== "SUPERADMIN") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.replace("/login?role=superadmin");
        return;
      }
      setMetrics(data.platformMetrics);
      setPatients(data.superadminPatientProfiles || []);
      setDoctors(data.superadminDoctorProfiles || []);
      setAccounts(data.superadminAccounts || []);
      setAppointments(data.myAppointments || []);
      setLastUpdated(new Date());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
      if (isAuthenticationError(loadError)) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.replace("/login?role=superadmin");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      inFlight.current = false;
    }
  }, [offsets, router]);

  useEffect(() => {
    let active = true;
    const initial = window.setTimeout(() => {
      if (active) void loadDashboard();
    }, 0);
    const interval = window.setInterval(() => {
      if (active) void loadDashboard(true);
    }, 15000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const runMutation = async (key, query, variables, successMessage) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const data = await graphqlRequest(query, variables);
      setNotice(typeof successMessage === "function" ? successMessage(data) : successMessage);
      setEditing(null);
      await loadDashboard(true);
      return true;
    } catch (mutationError) {
      setError(mutationError.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  const createPatient = async (event) => {
    event.preventDefault();
    if (!patientForm.email && !patientForm.phone) {
      setError("Enter an email address or a mobile number for the patient.");
      return;
    }
    const created = await runMutation(
      "create-patient",
      `mutation CreatePatient($email: String, $phone: String, $password: String!, $firstName: String!, $lastName: String!) {
        createPatientProfile(email: $email, phone: $phone, password: $password, firstName: $firstName, lastName: $lastName) { publicId }
      }`,
      { ...patientForm, email: patientForm.email || null, phone: patientForm.phone || null },
      (data) => `Patient profile ${data.createPatientProfile.publicId} created. Share the ID and temporary password securely.`,
    );
    if (created) setPatientForm({ email: "", phone: "", password: "", firstName: "", lastName: "" });
  };

  const createDoctor = async (event) => {
    event.preventDefault();
    const created = await runMutation(
      "create-doctor",
      `mutation CreateDoctor($email: String!, $password: String!, $firstName: String!, $lastName: String!, $specialization: String!, $experienceYears: Int) {
        createDoctorProfile(email: $email, password: $password, firstName: $firstName, lastName: $lastName, specialization: $specialization, experienceYears: $experienceYears) { publicId }
      }`,
      { ...doctorForm, experienceYears: Number(doctorForm.experienceYears) },
      (data) => `Doctor profile ${data.createDoctorProfile.publicId} created. Share the ID and temporary password securely.`,
    );
    if (created) setDoctorForm({ email: "", password: "", firstName: "", lastName: "", specialization: "", experienceYears: "0" });
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    const created = await runMutation(
      "create-admin",
      `mutation CreateAdmin($email: String!, $password: String!) { createAdminAccount(email: $email, password: $password) { publicId } }`,
      adminForm,
      (data) => `Admin profile ${data.createAdminAccount.publicId} created. Share its ID and temporary password securely.`,
    );
    if (created) setAdminForm({ email: "", password: "" });
  };

  const savePatient = async (patient) => runMutation(
    `patient-${patient.id}`,
    `mutation UpdatePatient($id: ID!, $email: String, $password: String, $firstName: String, $lastName: String, $phone: String, $dob: String, $sex: String, $address: String) {
      updatePatientProfile(patientId: $id, email: $email, password: $password, firstName: $firstName, lastName: $lastName, phone: $phone, dob: $dob, sex: $sex, address: $address) { id }
    }`,
    { id: patient.id, email: editing.email || null, password: editing.password || null, firstName: editing.firstName, lastName: editing.lastName, phone: editing.phone || null, dob: editing.dob || null, sex: editing.sex || null, address: editing.address || null },
    "Patient profile updated.",
  );

  const saveDoctor = async (doctor) => runMutation(
    `doctor-${doctor.id}`,
    `mutation UpdateDoctor($id: ID!, $email: String, $password: String, $firstName: String, $lastName: String, $specialization: String, $experienceYears: Int) {
      updateDoctorProfile(doctorId: $id, email: $email, password: $password, firstName: $firstName, lastName: $lastName, specialization: $specialization, experienceYears: $experienceYears) { id }
    }`,
    { id: doctor.id, email: editing.email || null, password: editing.password || null, firstName: editing.firstName, lastName: editing.lastName, specialization: editing.specialization, experienceYears: Number(editing.experienceYears) },
    "Doctor profile updated.",
  );

  const saveAdmin = async (account) => {
    const query = `mutation UpdateAdmin($id: ID!, $email: String, $password: String, $role: String) {
      updateAdminAccount(adminUserId: $id, email: $email, password: $password, role: $role) { id }
    }`;
    const variables = {
      id: account.id,
      email: editing.email || null,
      password: editing.password || null,
      role: "ADMIN",
    };
    await runMutation(`admin-${account.id}`, query, variables, "Admin account updated.");
  };

  const deleteProfile = (kind, id, label) => {
    if (!window.confirm(`Permanently delete ${label}? Related appointment and medical records are also deleted.`)) return;
    const query = kind === "patient"
      ? `mutation DeletePatient($id: ID!) { deletePatientProfile(patientId: $id) }`
      : `mutation DeleteDoctor($id: ID!) { deleteDoctorProfile(doctorId: $id) }`;
    void runMutation(`delete-${kind}-${id}`, query, { id }, `${label} deleted.`);
  };

  const deleteAdmin = (account) => {
    if (!window.confirm(`Delete administrator ${account.email}?`)) return;
    void runMutation(
      `delete-admin-${account.id}`,
      `mutation DeleteAdmin($id: ID!) { deleteAdminAccount(adminUserId: $id) }`,
      { id: account.id },
      "Administrator account deleted.",
    );
  };

  const updateAppointment = (appointment, status) => runMutation(
    `appointment-${appointment.id}`,
    `mutation UpdateAppointment($id: ID!, $status: String!) { updateAppointmentStatus(appointmentId: $id, status: $status) { id } }`,
    { id: appointment.id, status },
    `Appointment ${status.toLowerCase()}.`,
  );

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login?role=superadmin");
  };

  if (loading) return <main className="min-h-screen p-8" role="status">Verifying superadmin access…</main>;

  const statCards = [
    ["Patients", metrics?.patientCount],
    ["Doctors", metrics?.doctorCount],
    ["Admins", metrics?.adminCount],
    ["Appointments", metrics?.appointmentCount],
    ["Pending", metrics?.pendingAppointmentCount],
  ];

  return (
    <main className="min-h-screen bg-[#f8f9fa] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--navy)] px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Restricted control plane</p>
            <h1 className="text-xl font-bold">MediCare Superadmin</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:inline" aria-live="polite">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${refreshing ? " · refreshing" : ""}` : "Connecting…"}
            </span>
            <button className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void loadDashboard(true)} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-8">
        <section>
          <p className="text-sm text-[var(--ink-soft)]">Authenticated platform-wide oversight. Statistics refresh every 15 seconds; no direct public navigation link is provided.</p>
        </section>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900" role="status">{notice}</p>}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Live platform metrics">
          {statCards.map(([label, value]) => (
            <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" key={label}>
              <p className="text-sm text-[var(--ink-soft)]">{label}</p>
              <p className="mt-2 text-3xl font-bold">{typeof value === "number" ? value.toLocaleString() : "—"}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <form className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" onSubmit={createPatient}>
            <h2 className="font-bold">Create patient</h2>
            <p className="text-xs text-[var(--ink-soft)]">Give the patient their generated P-number and temporary password securely.</p>
            <input className={inputClass} placeholder="First name" aria-label="New patient first name" required value={patientForm.firstName} onChange={(event) => setPatientForm({ ...patientForm, firstName: event.target.value })} />
            <input className={inputClass} placeholder="Last name" aria-label="New patient last name" required value={patientForm.lastName} onChange={(event) => setPatientForm({ ...patientForm, lastName: event.target.value })} />
            <input className={inputClass} placeholder="Email (optional)" aria-label="New patient email" type="email" value={patientForm.email} onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Mobile (optional)" aria-label="New patient phone" type="tel" value={patientForm.phone} onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })} />
            <input className={inputClass} placeholder="Temporary password (12+ characters)" aria-label="New patient password" type="password" minLength={12} required value={patientForm.password} onChange={(event) => setPatientForm({ ...patientForm, password: event.target.value })} />
            <button className={buttonClass} disabled={busy === "create-patient" || (!patientForm.email && !patientForm.phone)}>{busy === "create-patient" ? "Creating…" : "Create patient"}</button>
          </form>
          <form className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" onSubmit={createDoctor}>
            <h2 className="font-bold">Create doctor</h2>
            <p className="text-xs text-[var(--ink-soft)]">Doctor IDs use the D-prefix and six digits.</p>
            <input className={inputClass} placeholder="First name" aria-label="New doctor first name" required value={doctorForm.firstName} onChange={(event) => setDoctorForm({ ...doctorForm, firstName: event.target.value })} />
            <input className={inputClass} placeholder="Last name" aria-label="New doctor last name" required value={doctorForm.lastName} onChange={(event) => setDoctorForm({ ...doctorForm, lastName: event.target.value })} />
            <input className={inputClass} placeholder="Email" aria-label="New doctor email" type="email" required value={doctorForm.email} onChange={(event) => setDoctorForm({ ...doctorForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Specialization" aria-label="New doctor specialization" required value={doctorForm.specialization} onChange={(event) => setDoctorForm({ ...doctorForm, specialization: event.target.value })} />
            <input className={inputClass} placeholder="Years of experience" aria-label="New doctor experience" type="number" min="0" max="80" value={doctorForm.experienceYears} onChange={(event) => setDoctorForm({ ...doctorForm, experienceYears: event.target.value })} />
            <input className={inputClass} placeholder="Temporary password (12+ characters)" aria-label="New doctor password" type="password" minLength={12} required value={doctorForm.password} onChange={(event) => setDoctorForm({ ...doctorForm, password: event.target.value })} />
            <button className={buttonClass} disabled={busy === "create-doctor"}>{busy === "create-doctor" ? "Creating…" : "Create doctor"}</button>
          </form>
          <form className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm" onSubmit={createAdmin}>
            <h2 className="font-bold">Create administrator</h2>
            <p className="text-xs text-[var(--ink-soft)]">Admin IDs use the A-prefix. This cannot create another superadmin.</p>
            <input className={inputClass} placeholder="Admin email" aria-label="New admin email" type="email" required value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Temporary password (12+ characters)" aria-label="New admin password" type="password" minLength={12} required value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} />
            <button className={buttonClass} disabled={busy === "create-admin"}>{busy === "create-admin" ? "Creating…" : "Create admin"}</button>
          </form>
        </section>

        <ProfileTable
          title={`Patients (${patients.length})`}
          columns={["ID", "Name", "Email", "Phone", "Actions"]}
          empty="No patient profiles were returned."
          rows={patients}
          pagination={{
            offset: offsets.patients,
            count: metrics?.patientCount || 0,
            onPrevious: () => setOffsets((current) => ({ ...current, patients: Math.max(0, current.patients - 100) })),
            onNext: () => setOffsets((current) => ({ ...current, patients: current.patients + 100 })),
          }}
          render={(patient) => {
            const isEditing = editing?.kind === "patient" && editing.id === patient.id;
            return (
              <Fragment key={patient.id}>
              <tr key={patient.id}>
                <td className="font-mono">{patient.publicId || "—"}</td>
                <td>{isEditing ? <NameFields editing={editing} setEditing={setEditing} /> : `${patient.firstName} ${patient.lastName}`}</td>
                <td>{isEditing ? (
                  <div className="space-y-2">
                    <input className={inputClass} aria-label="Edit patient email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
                    <input className={inputClass} aria-label="Reset patient password" type="password" minLength={12} placeholder="New password (optional)" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} />
                  </div>
                ) : patient.user?.email || "—"}</td>
                <td>{isEditing ? <input className={inputClass} aria-label="Edit patient phone" value={editing.phone || ""} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /> : patient.phone || "—"}</td>
                <td><RowActions busy={busy} id={`patient-${patient.id}`} editing={isEditing} onEdit={() => setEditing({ kind: "patient", id: patient.id, firstName: patient.firstName, lastName: patient.lastName, email: patient.user?.email || "", password: "", phone: patient.phone || "", dob: patient.dob ? String(patient.dob).slice(0, 10) : "", sex: patient.sex || "", address: patient.address || "" })} onSave={() => void savePatient(patient)} onCancel={() => setEditing(null)} onDelete={() => deleteProfile("patient", patient.id, `patient ${patient.publicId}`)} /></td>
              </tr>
              {isEditing && (
                <tr key={`${patient.id}-additional`} className="bg-gray-50">
                  <td colSpan={5}>
                    <div className="grid gap-2 p-3 sm:grid-cols-4">
                      <input className={inputClass} aria-label="Edit patient date of birth" type="date" value={editing.dob} onChange={(event) => setEditing({ ...editing, dob: event.target.value })} />
                      <input className={inputClass} aria-label="Edit patient sex" placeholder="Sex" value={editing.sex} onChange={(event) => setEditing({ ...editing, sex: event.target.value })} />
                      <input className={inputClass} aria-label="Edit patient address" placeholder="Address" value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} />
                      <p className="text-xs text-[var(--ink-soft)]">Leave the optional new password blank to keep it unchanged.</p>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          }}
        />

        <ProfileTable
          title={`Doctors (${doctors.length})`}
          columns={["ID", "Name", "Email", "Specialty", "Experience", "Actions"]}
          empty="No doctor profiles were returned."
          rows={doctors}
          pagination={{
            offset: offsets.doctors,
            count: metrics?.doctorCount || 0,
            onPrevious: () => setOffsets((current) => ({ ...current, doctors: Math.max(0, current.doctors - 100) })),
            onNext: () => setOffsets((current) => ({ ...current, doctors: current.doctors + 100 })),
          }}
          render={(doctor) => {
            const isEditing = editing?.kind === "doctor" && editing.id === doctor.id;
            return (
              <tr key={doctor.id}>
                <td className="font-mono">{doctor.publicId || "—"}</td>
                <td>{isEditing ? <NameFields editing={editing} setEditing={setEditing} /> : `${doctor.firstName} ${doctor.lastName}`}</td>
                <td>{isEditing ? (
                  <div className="space-y-2">
                    <input className={inputClass} aria-label="Edit doctor email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
                    <input className={inputClass} aria-label="Reset doctor password" type="password" minLength={12} placeholder="New password (optional)" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} />
                  </div>
                ) : doctor.user?.email || "—"}</td>
                <td>{isEditing ? <input className={inputClass} aria-label="Edit doctor specialty" value={editing.specialization} onChange={(event) => setEditing({ ...editing, specialization: event.target.value })} /> : doctor.specialization}</td>
                <td>{isEditing ? <input className={inputClass} aria-label="Edit doctor experience" type="number" min="0" max="80" value={editing.experienceYears} onChange={(event) => setEditing({ ...editing, experienceYears: event.target.value })} /> : doctor.experienceYears}</td>
                <td><RowActions busy={busy} id={`doctor-${doctor.id}`} editing={isEditing} onEdit={() => setEditing({ kind: "doctor", id: doctor.id, firstName: doctor.firstName, lastName: doctor.lastName, email: doctor.user?.email || "", password: "", specialization: doctor.specialization, experienceYears: String(doctor.experienceYears) })} onSave={() => void saveDoctor(doctor)} onCancel={() => setEditing(null)} onDelete={() => deleteProfile("doctor", doctor.id, `doctor ${doctor.publicId}`)} /></td>
              </tr>
            );
          }}
        />

        <ProfileTable
          title={`Platform admin accounts (${accounts.length})`}
          columns={["ID", "Email", "Role", "Created", "Actions"]}
          empty="No administrator accounts were returned."
          rows={accounts}
          pagination={{
            offset: offsets.accounts,
            count: metrics?.adminCount || 0,
            onPrevious: () => setOffsets((current) => ({ ...current, accounts: Math.max(0, current.accounts - 100) })),
            onNext: () => setOffsets((current) => ({ ...current, accounts: current.accounts + 100 })),
          }}
          render={(account) => {
            const isEditing = editing?.kind === "admin" && editing.id === account.id;
            return (
              <tr key={account.id}>
                <td className="font-mono">{account.publicId || "—"}</td>
                <td>{isEditing ? (
                  <div className="space-y-2">
                    <input className={inputClass} aria-label="Edit admin email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
                    <input className={inputClass} aria-label="Set new admin password" type="password" placeholder="New password (optional)" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} />
                  </div>
                ) : account.email}</td>
                <td>{account.role}</td>
                <td>{formatDate(account.createdAt)}</td>
                <td>{account.role === "ADMIN" ? (
                  <RowActions busy={busy} id={`admin-${account.id}`} editing={isEditing} onEdit={() => setEditing({ kind: "admin", id: account.id, email: account.email, password: "" })} onSave={() => void saveAdmin(account)} onCancel={() => setEditing(null)} onDelete={() => deleteAdmin(account)} />
                ) : <span className="text-xs text-[var(--ink-soft)]">Protected account</span>}</td>
              </tr>
            );
          }}
        />

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <h2 className="border-b border-[var(--border)] px-5 py-4 text-lg font-bold">Platform appointments ({appointments.length})</h2>
          {!appointments.length ? <p className="p-5 text-sm text-[var(--ink-soft)]">No appointments were returned.</p> : (
            <ul className="divide-y divide-[var(--border)]">
              {appointments.map((appointment) => (
                <li className="flex flex-wrap items-center justify-between gap-4 p-4" key={appointment.id}>
                  <div>
                    <p className="font-semibold">{appointment.patient?.publicId} · {appointment.patient?.firstName} {appointment.patient?.lastName} <span className="font-normal text-[var(--ink-soft)]">with</span> {appointment.doctor?.publicId} · Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}</p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">{formatDate(appointment.date)} · {appointment.startTime} · {appointment.status}</p>
                  </div>
                  <div className="flex gap-2">
                    {appointment.status === "PENDING" && (
                      <>
                        <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" disabled={busy === `appointment-${appointment.id}`} onClick={() => void updateAppointment(appointment, "CANCELLED")}>Decline</button>
                        <button className={buttonClass} disabled={busy === `appointment-${appointment.id}`} onClick={() => void updateAppointment(appointment, "CONFIRMED")}>Confirm</button>
                      </>
                    )}
                    {appointment.status === "CONFIRMED" && <button className={buttonClass} disabled={busy === `appointment-${appointment.id}`} onClick={() => void updateAppointment(appointment, "COMPLETED")}>Complete</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs leading-5 text-[var(--ink-faint)]">Management is restricted by server-side SUPERADMIN authorization. Patient or doctor deletion also permanently deletes related appointments and medical records. Counts are database snapshots, not a clinical monitoring or uptime system.</p>
      </div>
    </main>
  );
}

function ProfileTable({ title, columns, rows, render, empty, pagination }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <h2 className="border-b border-[var(--border)] px-5 py-4 text-lg font-bold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="relative z-30 bg-gray-50 text-[var(--ink-soft)]"><tr>{columns.map((column) => <th className="px-4 py-3 font-semibold" key={column}>{column}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length ? rows.map(render) : <tr><td className="px-4 py-6 text-center text-[var(--ink-soft)]" colSpan={columns.length}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
          <span className="text-xs text-[var(--ink-soft)]">
            {pagination.count ? `${pagination.offset + 1}–${Math.min(pagination.offset + 100, pagination.count)} of ${pagination.count}` : "0 profiles"}
          </span>
          <div className="flex gap-2">
            <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40" onClick={pagination.onPrevious} disabled={pagination.offset === 0}>Previous</button>
            <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40" onClick={pagination.onNext} disabled={pagination.offset + rows.length >= pagination.count}>Next</button>
          </div>
        </div>
      )}
    </section>
  );
}

function NameFields({ editing, setEditing }) {
  return (
    <div className="flex min-w-48 flex-col gap-2">
      <input className={inputClass} aria-label="Edit first name" value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} />
      <input className={inputClass} aria-label="Edit last name" value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} />
    </div>
  );
}

function RowActions({ busy, id, editing, onEdit, onSave, onCancel, onDelete }) {
  return (
    <div className="flex flex-wrap gap-2">
      {editing ? (
        <>
          <button className={buttonClass} onClick={onSave} disabled={busy === id}>{busy === id ? "Saving…" : "Save"}</button>
          <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" onClick={onCancel}>Cancel</button>
        </>
      ) : (
        <>
          <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold" onClick={onEdit}>Edit</button>
          <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={onDelete} disabled={busy.startsWith("delete-")}>Delete</button>
        </>
      )}
    </div>
  );
}
