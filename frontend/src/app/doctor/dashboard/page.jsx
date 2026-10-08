"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, graphqlRequest, isAuthenticationError } from "@/lib/graphql";

export default function DoctorDashboard() {
  const router = useRouter();
  const [doctor, setDoctor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAppointmentId, setBusyAppointmentId] = useState("");
  const [noteAppointmentId, setNoteAppointmentId] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError("");
    const data = await graphqlRequest(`
      query DoctorDashboard {
        me { id email role doctor { id firstName lastName specialization } }
        myAppointments {
          id date startTime status notes
          patient { id firstName lastName }
        }
      }
    `);

    if (data.me?.role !== "DOCTOR" || !data.me.doctor) {
      throw new Error("This page is available to doctor accounts.");
    }
    setDoctor(data.me);
    setAppointments(data.myAppointments || []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadDashboard();
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          if (isAuthenticationError(loadError)) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            router.replace("/login?role=doctor");
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadDashboard, router]);

  const updateStatus = async (appointmentId, status) => {
    setBusyAppointmentId(appointmentId);
    setError("");
    try {
      await graphqlRequest(
        `mutation UpdateAppointmentStatus($id: ID!, $status: String!) {
          updateAppointmentStatus(appointmentId: $id, status: $status) { id status }
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

  const saveVisitNote = async (event, patientId) => {
    event.preventDefault();
    if (!noteTitle.trim() || !noteDescription.trim() || noteSaving) return;

    setNoteSaving(true);
    setNoteMessage("");
    try {
      await graphqlRequest(
        `mutation AddMedicalRecord($patientId: ID!, $title: String!, $description: String!) {
          addMedicalRecord(patientId: $patientId, title: $title, description: $description) {
            id
          }
        }`,
        {
          patientId,
          title: noteTitle.trim(),
          description: noteDescription.trim(),
        },
      );
      setNoteMessage("Visit note saved to the patient's records.");
      setNoteTitle("");
      setNoteDescription("");
      setNoteAppointmentId("");
    } catch (saveError) {
      setNoteMessage(saveError.message);
    } finally {
      setNoteSaving(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login?role=doctor");
  };

  const pendingCount = appointments.filter((item) => item.status === "PENDING").length;
  const confirmedCount = appointments.filter((item) => item.status === "CONFIRMED").length;

  if (loading) {
    return <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] p-8"><p role="status">Loading your schedule…</p></main>;
  }

  return (
    <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-[var(--gold-dark)]">
            MediCare <span className="font-normal text-[var(--ink-soft)]">/ Doctor portal</span>
          </Link>
          <button
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-gray-50"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8">
        <section>
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--gold-dark)]">Provider workspace</p>
          <h1 className="mt-2 text-3xl font-bold">
            Good day, Dr. {doctor?.doctor?.firstName || "Doctor"}
          </h1>
          <p className="mt-2 text-[var(--ink-soft)]">
            Review appointment requests, manage your schedule, and document completed visits.
          </p>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}
        {noteMessage && (
          <div className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm" role="status">
            {noteMessage}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Schedule summary">
          {[
            ["Total appointments", appointments.length],
            ["Requests to review", pendingCount],
            ["Confirmed visits", confirmedCount],
          ].map(([label, value]) => (
            <article key={label} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <p className="text-sm text-[var(--ink-soft)]">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--gold-dark)]">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">Appointment schedule</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Patient details are available only for your appointments.
              </p>
            </div>
            <button
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50"
              disabled={loading}
              onClick={() => loadDashboard().catch((refreshError) => setError(refreshError.message))}
            >
              Refresh
            </button>
          </div>

          {appointments.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--ink-soft)]">No appointments are on your schedule yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {appointment.patient?.firstName} {appointment.patient?.lastName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {formatDate(appointment.date)} · {appointment.startTime}
                      </p>
                      {appointment.notes && (
                        <p className="mt-2 text-sm text-[var(--ink-soft)]">
                          Visit reason: {appointment.notes}
                        </p>
                      )}
                      <span className="mt-2 inline-block rounded-full bg-[var(--gold-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--gold-dark)]">
                        {appointment.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {appointment.status === "PENDING" && (
                        <>
                          <button
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                            disabled={busyAppointmentId === appointment.id}
                            onClick={() => updateStatus(appointment.id, "CANCELLED")}
                          >
                            Decline
                          </button>
                          <button
                            className="rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--gold-dark)] disabled:opacity-50"
                            disabled={busyAppointmentId === appointment.id}
                            onClick={() => updateStatus(appointment.id, "CONFIRMED")}
                          >
                            {busyAppointmentId === appointment.id ? "Updating…" : "Confirm"}
                          </button>
                        </>
                      )}
                      {appointment.status === "CONFIRMED" && (
                        <button
                          className="rounded-lg bg-[var(--teal)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-dark)] disabled:opacity-50"
                          disabled={busyAppointmentId === appointment.id}
                          onClick={() => updateStatus(appointment.id, "COMPLETED")}
                        >
                          {busyAppointmentId === appointment.id ? "Updating…" : "Mark completed"}
                        </button>
                      )}
                      {appointment.status === "COMPLETED" && (
                        <button
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-gray-50"
                          onClick={() => {
                            setNoteAppointmentId((current) => current === appointment.id ? "" : appointment.id);
                            setNoteMessage("");
                          }}
                        >
                          Add visit note
                        </button>
                      )}
                    </div>
                  </div>
                  {noteAppointmentId === appointment.id && (
                    <form className="grid gap-3 rounded-lg bg-gray-50 p-4" onSubmit={(event) => saveVisitNote(event, appointment.patient.id)}>
                      <label className="text-sm font-semibold">
                        Record title
                        <input
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white p-2.5 font-normal"
                          value={noteTitle}
                          onChange={(event) => setNoteTitle(event.target.value)}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Clinical note
                        <textarea
                          className="mt-1 min-h-24 w-full rounded-lg border border-[var(--border)] bg-white p-2.5 font-normal"
                          value={noteDescription}
                          onChange={(event) => setNoteDescription(event.target.value)}
                          maxLength={3000}
                          required
                        />
                      </label>
                      <button disabled={noteSaving} className="justify-self-start rounded-lg bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-dark)] disabled:cursor-not-allowed disabled:opacity-50">
                        {noteSaving ? "Saving…" : "Save to patient records"}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
