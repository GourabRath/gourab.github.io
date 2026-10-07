"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PatientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  // AI State
  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Booking State
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [bookingMsg, setBookingMsg] = useState("");

  const fetchDashboardData = async (token) => {
    try {
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            query {
              me { patient { firstName lastName phone } }
              doctors { id firstName lastName specialization experienceYears }
              myAppointments { id date startTime status doctor { firstName lastName specialization } }
            }
          `,
        }),
      });
      const { data } = await res.json();
      if (data) {
        setDoctors(data.doctors || []);
        setAppointments(data.myAppointments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!userData || !token) {
      router.push("/login?role=patient");
    } else {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      fetchDashboardData(token);
      const { io } = require("socket.io-client");
      const socket = io("http://localhost:4000");
      socket.on("appointmentStatusUpdated", () => {
        fetchDashboardData(token);
      });
      return () => socket.disconnect();
    }
  }, [router]);

  const handleAskAI = async (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiResponse("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation AskAIAssistant($message: String!) {
              askAIAssistant(message: $message)
            }
          `,
          variables: { message: aiInput },
        }),
      });

      const { data, errors } = await res.json();
      if (errors) throw new Error(errors[0].message);
      setAiResponse(data.askAIAssistant);
    } catch (err) {
      setAiResponse(`Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
      setAiInput("");
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDoctorId || !selectedDate) {
      setBookingMsg("Select doctor and date");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation Book($doctorId: ID!, $date: String!, $startTime: String!) {
              bookAppointment(doctorId: $doctorId, date: $date, startTime: $startTime) { id status }
            }
          `,
          variables: {
            doctorId: selectedDoctorId,
            date: selectedDate,
            startTime: selectedTime,
          },
        }),
      });
      const { data, errors } = await res.json();
      if (errors) throw new Error(errors[0].message);
      setBookingMsg("Appointment booked successfully!");
      fetchDashboardData(token); // Refresh
    } catch (err) {
      setBookingMsg(err.message);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    try {
      const token = localStorage.getItem("token");
      await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation Cancel($id: ID!, $status: String!) {
              updateAppointmentStatus(appointmentId: $id, status: $status) { id }
            }
          `,
          variables: { id: appointmentId, status: "CANCELLED" },
        }),
      });
      fetchDashboardData(token); // Refresh
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?role=patient");
  };

  if (!user || loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-sans text-[var(--ink)]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[var(--border)] hidden md:flex flex-col">
        <div className="p-6 border-b border-[var(--border)]">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold text-[var(--teal)]"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z" />
            </svg>
            MediCare
          </Link>
        </div>
        <div className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-[var(--teal-tint)] text-[var(--teal)] flex items-center justify-center font-bold text-lg">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-sm truncate w-32">
                {user.email.split("@")[0]}
              </div>
              <div className="text-xs text-[var(--ink-soft)]">
                Patient Portal
              </div>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 bg-[var(--teal-tint)] text-[var(--teal)] rounded-lg font-medium"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              Dashboard
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-[var(--ink-soft)] hover:bg-gray-50 rounded-lg font-medium transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Medical Records
            </a>
          </nav>
        </div>
        <div className="p-6 border-t border-[var(--border)]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 text-[var(--danger)] hover:text-red-700 font-medium w-full px-4 py-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-[var(--border)] px-8 py-5 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold text-[var(--navy)]">
              Welcome back, {user.email.split("@")[0]}
            </h1>
            <p className="text-[var(--ink-soft)] text-sm mt-1">
              Here is what&apos;s next on your care plan.
            </p>
          </div>
          <Link
            href="/doctors"
            className="hidden sm:flex bg-[var(--gold)] hover:bg-[var(--gold-dark)] text-white px-5 py-2.5 rounded-md font-semibold transition-colors shadow-sm"
          >
            Find a Specialist
          </Link>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {/* Top Row: Doctors & Booking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Available Doctors */}
            <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden flex flex-col h-[400px]">
              <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-lg">Available Doctors</h3>
                <span className="text-xs font-bold bg-[var(--teal-tint)] text-[var(--teal)] px-2.5 py-1 rounded-full">
                  {doctors.length} Found
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {doctors.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoctorId(doc.id)}
                    className={`flex items-center gap-4 p-4 mx-2 my-2 rounded-lg cursor-pointer transition-all border ${selectedDoctorId === doc.id ? "border-[var(--gold)] bg-[var(--gold-tint)]/30" : "border-transparent hover:bg-gray-50"}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-[var(--teal-tint)] text-[var(--teal)] flex items-center justify-center text-xl">
                      👨‍⚕️
                    </div>
                    <div>
                      <div className="font-bold text-[var(--teal)]">
                        Dr. {doc.firstName} {doc.lastName}
                      </div>
                      <div className="text-sm text-[var(--ink-soft)]">
                        {doc.specialization} • {doc.experienceYears} yrs exp
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Booking */}
            <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden flex flex-col h-[400px]">
              <div className="px-6 py-4 border-b border-[var(--border)] bg-gray-50">
                <h3 className="font-semibold text-lg">Book Appointment</h3>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <div className="space-y-5 flex-1">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-[var(--ink-soft)]">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full p-3 border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-[var(--ink-soft)]">
                      Select Time Slot
                    </label>
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full p-3 border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)] transition-all bg-white"
                    >
                      <option value="09:00">09:00 AM</option>
                      <option value="10:00">10:00 AM</option>
                      <option value="11:00">11:00 AM</option>
                      <option value="14:00">02:00 PM</option>
                      <option value="15:00">03:00 PM</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4 mt-auto">
                  <button
                    onClick={handleBookAppointment}
                    className="w-full bg-[var(--teal)] hover:bg-[var(--teal-dark)] text-white py-3 rounded-lg font-bold transition-colors shadow-md"
                    disabled={!selectedDoctorId || !selectedDate}
                  >
                    Confirm Appointment
                  </button>
                  {bookingMsg && (
                    <div
                      className={`mt-3 text-sm text-center font-medium ${bookingMsg.includes("success") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                    >
                      {bookingMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Appointments & AI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* My Appointments */}
            <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-lg">My Appointments</h3>
              </div>
              <div className="p-0">
                {appointments.length === 0 ? (
                  <div className="p-8 text-center text-[var(--ink-soft)]">
                    No appointments scheduled.
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {appointments.map((appt) => (
                      <li
                        key={appt.id}
                        className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-[var(--navy-tint)] text-[var(--navy)] p-3 rounded-lg text-center min-w-[70px]">
                            <div className="font-bold text-lg">
                              {appt.startTime}
                            </div>
                            <div className="text-xs uppercase font-semibold">
                              {new Date(Number(appt.date)).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-lg">
                              Dr. {appt.doctor?.firstName}{" "}
                              {appt.doctor?.lastName}
                            </div>
                            <div className="text-[var(--ink-soft)] text-sm">
                              {appt.doctor?.specialization}
                            </div>
                            <div className="mt-2">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                  appt.status === "CONFIRMED"
                                    ? "bg-[var(--success-tint)] text-[var(--success)]"
                                    : appt.status === "PENDING"
                                      ? "bg-orange-100 text-orange-700"
                                      : appt.status === "CANCELLED"
                                        ? "bg-[var(--danger-tint)] text-[var(--danger)]"
                                        : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {appt.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        {appt.status !== "CANCELLED" &&
                          appt.status !== "COMPLETED" && (
                            <button
                              onClick={() => handleCancelAppointment(appt.id)}
                              className="self-start sm:self-center px-4 py-2 border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-tint)] rounded-md text-sm font-semibold transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* AI Assistant */}
            <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden flex flex-col h-[500px]">
              <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-[var(--navy)] to-[var(--teal)] text-white flex items-center gap-3">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                  <path d="M12 12 2.1 7.1" />
                  <path d="M12 12l9.9 4.9" />
                </svg>
                <h3 className="font-semibold text-lg">
                  AI Healthcare Assistant
                </h3>
              </div>
              <div className="p-6 flex-1 flex flex-col bg-gray-50/50">
                <div className="flex-1 bg-white border border-[var(--border)] rounded-lg p-5 mb-4 overflow-y-auto text-sm leading-relaxed shadow-inner whitespace-pre-wrap">
                  {aiResponse ? (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--teal)] text-white flex items-center justify-center flex-shrink-0">
                        ✨
                      </div>
                      <div className="pt-1">{aiResponse}</div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        className="mb-4"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <p>
                        Describe your symptoms to get guidance.
                        <br />
                        Remember, this is not a substitute for professional
                        medical advice.
                      </p>
                    </div>
                  )}
                </div>

                <form onSubmit={handleAskAI} className="flex gap-3 mt-auto">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="I have a mild fever and..."
                    className="flex-1 p-3 border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--navy)] focus:ring-1 focus:ring-[var(--navy)] shadow-sm"
                    disabled={isAiLoading}
                  />

                  <button
                    type="submit"
                    className="bg-[var(--navy)] hover:bg-[var(--navy-dark)] text-white px-6 py-3 rounded-lg font-bold transition-colors shadow-sm disabled:opacity-70"
                    disabled={isAiLoading}
                  >
                    {isAiLoading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>{" "}
                        Thinking
                      </span>
                    ) : (
                      "Ask AI"
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
