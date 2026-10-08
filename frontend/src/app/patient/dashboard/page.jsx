"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, graphqlRequest, isAuthenticationError } from "@/lib/graphql";

const appointmentFields = `
  id date startTime status notes
  doctor { firstName lastName specialization }
`;

function localDateInputValue(daysAhead = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function PatientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [booking, setBooking] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState("");

  const loadDashboard = useCallback(async () => {
    setError("");
    const data = await graphqlRequest(`
      query PatientDashboard {
        me { id email role patient { id firstName lastName phone } }
        doctors { id firstName lastName specialization experienceYears }
        myAppointments { ${appointmentFields} }
        myMedicalRecords { id title description fileUrl createdAt }
      }
    `);

    if (data.me?.role !== "PATIENT" || !data.me.patient) {
      throw new Error("This page is available to patient accounts.");
    }

    setUser(data.me);
    setDoctors(data.doctors || []);
    setAppointments(data.myAppointments || []);
    setSelectedDoctorId(
      (current) =>
        current ||
        new URLSearchParams(window.location.search).get("doctor") ||
        "",
    );
    setRecords(data.myMedicalRecords || []);
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
            router.replace("/login?role=patient");
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

  const handleBookAppointment = async (event) => {
    event.preventDefault();
    if (booking || !selectedDoctorId || !selectedDate) return;

    setBooking(true);
    setBookingMessage("");
    try {
      await graphqlRequest(
        `mutation BookAppointment($doctorId: ID!, $date: String!, $startTime: String!) {
          bookAppointment(doctorId: $doctorId, date: $date, startTime: $startTime) {
            id status
          }
        }`,
        {
          doctorId: selectedDoctorId,
          date: selectedDate,
          startTime: selectedTime,
        },
      );
      setBookingMessage("Your appointment request has been sent.");
      await loadDashboard();
    } catch (bookingError) {
      setBookingMessage(bookingError.message);
    } finally {
      setBooking(false);
    }
  };

  const cancelAppointment = async (appointmentId) => {
    setBusyAppointmentId(appointmentId);
    setError("");
    try {
      await graphqlRequest(
        `mutation CancelAppointment($id: ID!, $status: String!) {
          updateAppointmentStatus(appointmentId: $id, status: $status) { id }
        }`,
        { id: appointmentId, status: "CANCELLED" },
      );
      await loadDashboard();
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setBusyAppointmentId("");
    }
  };

  const askAssistant = async (event) => {
    event.preventDefault();
    if (!aiInput.trim() || aiLoading) return;

    setAiLoading(true);
    setAiResponse("");
    try {
      const data = await graphqlRequest(
        `mutation AskAIAssistant($message: String!) {
          askAIAssistant(message: $message)
        }`,
        { message: aiInput.trim() },
      );
      setAiResponse(data.askAIAssistant);
      setAiInput("");
    } catch (assistantError) {
      setAiResponse(`Unable to get guidance: ${assistantError.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login?role=patient");
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingCount = appointments.filter(
    (appointment) =>
      ["PENDING", "CONFIRMED"].includes(appointment.status) &&
      new Date(appointment.date) >= today,
  ).length;

  if (loading) {
    return (
      <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] p-8 text-[var(--ink)]">
        <p role="status">Loading your patient portal…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen min-w-0 w-full bg-[#f8f9fa] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-[var(--teal)]">
            MediCare <span className="font-normal text-[var(--ink-soft)]">/ Patient portal</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--ink-soft)] sm:block">
              {user?.patient?.firstName || user?.email || user?.patient?.phone || "Patient"}
            </span>
            <button
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-[var(--teal)]">
              Your care, in one place
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Welcome, {user?.patient?.firstName || "Patient"}
            </h1>
            <p className="mt-2 text-[var(--ink-soft)]">
              Book visits, follow your appointments, and keep your records close.
            </p>
          </div>
          <Link
            href="/doctors"
            className="rounded-lg bg-[var(--teal)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--teal-dark)]"
          >
            Browse specialists
          </Link>
        </section>

        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Care summary">
          {[
            ["Appointments", appointments.length],
            ["Upcoming", upcomingCount],
            ["Medical records", records.length],
          ].map(([label, value]) => (
            <article key={label} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <p className="text-sm text-[var(--ink-soft)]">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[var(--teal)]">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-bold">Book an appointment</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Select a specialist and request a convenient visit.
              </p>
            </div>
            <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleBookAppointment}>
              <label className="text-sm font-semibold sm:col-span-2">
                Specialist
                <select
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-normal"
                  value={selectedDoctorId}
                  onChange={(event) => setSelectedDoctorId(event.target.value)}
                  required
                >
                  <option value="">Choose a doctor</option>
                  {doctors.map((doctor) => (
                    <option value={doctor.id} key={doctor.id}>
                      Dr. {doctor.firstName} {doctor.lastName} — {doctor.specialization}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Date
                <input
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-normal"
                  type="date"
                  min={localDateInputValue(1)}
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  required
                />
              </label>
              <label className="text-sm font-semibold">
                Preferred time
                <select
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-normal"
                  value={selectedTime}
                  onChange={(event) => setSelectedTime(event.target.value)}
                >
                  {["09:00", "10:00", "11:00", "14:00", "15:00"].map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={booking || doctors.length === 0}
                  className="w-full rounded-lg bg-[var(--teal)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--teal-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {booking ? "Sending request…" : "Request appointment"}
                </button>
                {bookingMessage && (
                  <p className="mt-3 text-sm" role="status">{bookingMessage}</p>
                )}
              </div>
            </form>
          </article>

          <article className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-bold">AI health guidance</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                General information to help you prepare for a clinician visit.
              </p>
            </div>
            <div className="p-5">
              <form onSubmit={askAssistant} className="space-y-3">
                <label htmlFor="health-question" className="sr-only">Describe your concern</label>
                <textarea
                  id="health-question"
                  className="min-h-24 w-full resize-y rounded-lg border border-[var(--border)] p-3"
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  maxLength={1200}
                  placeholder="What would you like general guidance about?"
                  required
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiInput.trim()}
                  className="rounded-lg bg-[var(--navy)] px-4 py-2.5 font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:opacity-50"
                >
                  {aiLoading ? "Preparing guidance…" : "Ask for guidance"}
                </button>
              </form>
              {aiResponse && (
                <div className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-6" role="status">
                  {aiResponse}
                </div>
              )}
              <p className="mt-4 text-xs leading-5 text-[var(--ink-soft)]">
                AI guidance is informational only, not a diagnosis or treatment plan. For urgent symptoms, contact emergency services.
              </p>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">My appointments</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">Requests and confirmed visits.</p>
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
              <p className="p-6 text-sm text-[var(--ink-soft)]">No appointments yet. Use the form above to request your first visit.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div>
                      <p className="font-semibold">
                        Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {appointment.doctor?.specialization} · {formatDate(appointment.date)} · {appointment.startTime}
                      </p>
                      <span className="mt-2 inline-block rounded-full bg-[var(--teal-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--teal)]">
                        {appointment.status}
                      </span>
                    </div>
                    {["PENDING", "CONFIRMED"].includes(appointment.status) && (
                      <button
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        disabled={busyAppointmentId === appointment.id}
                        onClick={() => cancelAppointment(appointment.id)}
                      >
                        {busyAppointmentId === appointment.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-bold">Medical records</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">Visit notes and documents shared with you.</p>
            </div>
            {records.length === 0 ? (
              <p className="p-6 text-sm text-[var(--ink-soft)]">No medical records have been added to your profile.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {records.map((record) => (
                  <li key={record.id} className="p-5">
                    <p className="font-semibold">{record.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">{record.description}</p>
                    <p className="mt-2 text-xs text-[var(--ink-faint)]">{formatDate(record.createdAt)}</p>
                    {record.fileUrl && (
                      <a className="mt-2 inline-block text-sm font-semibold text-[var(--teal)] underline" href={record.fileUrl} target="_blank" rel="noreferrer">
                        Open attached document
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
