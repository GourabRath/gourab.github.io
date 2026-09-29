"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DoctorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{id: string, email: string} | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async (token: string) => {
    try {
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          query: `
            query {
              me { doctor { firstName lastName specialization } }
              myAppointments { id date startTime status patient { firstName lastName } }
            }
          `
        })
      });
      const { data } = await res.json();
      if (data) {
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
      router.push("/login?role=doctor");
    } else {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      fetchDashboardData(token);

      const { io } = require("socket.io-client");
      const socket = io("http://localhost:4000");
      socket.on("appointmentBooked", () => {
        fetchDashboardData(token);
      });
      return () => socket.disconnect();
    }
  }, [router]);

  const handleUpdateStatus = async (appointmentId: string, status: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          query: `
            mutation UpdateStatus($id: ID!, $status: String!) {
              updateAppointmentStatus(appointmentId: $id, status: $status) { id }
            }
          `,
          variables: { id: appointmentId, status }
        })
      });
      fetchDashboardData(token!); // Refresh
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?role=doctor");
  };

  if (!user || loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-sans text-[var(--ink)]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[var(--border)] hidden md:flex flex-col">
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-[var(--gold-dark)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z"/></svg>
            MediCare
          </Link>
        </div>
        <div className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-[var(--gold-tint)] text-[var(--gold-dark)] flex items-center justify-center font-bold text-lg">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-sm truncate w-32">{user.email.split('@')[0]}</div>
              <div className="text-xs text-[var(--ink-soft)]">Doctor Portal</div>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-[var(--gold-tint)] text-[var(--gold-dark)] rounded-lg font-medium">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              Dashboard
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-[var(--ink-soft)] hover:bg-gray-50 rounded-lg font-medium transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              My Patients
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-[var(--ink-soft)] hover:bg-gray-50 rounded-lg font-medium transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Availability
            </a>
          </nav>
        </div>
        <div className="p-6 border-t border-[var(--border)]">
          <button onClick={handleLogout} className="flex items-center gap-3 text-[var(--danger)] hover:text-red-700 font-medium w-full px-4 py-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-[var(--border)] px-8 py-5 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold text-[var(--navy)]">Doctor Dashboard</h1>
            <p className="text-[var(--ink-soft)] text-sm mt-1">Manage your appointments and patient records.</p>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto space-y-8">
          
          {/* Action Center - Pending Appointments */}
          <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gray-50 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
              <h3 className="font-semibold text-lg">Action Required</h3>
            </div>
            <div className="p-0">
              {appointments.filter(a => a.status === 'PENDING').length === 0 ? (
                <div className="p-8 text-center text-[var(--ink-soft)]">No pending appointments.</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {appointments.filter(a => a.status === 'PENDING').map(appt => (
                    <li key={appt.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-orange-50/30">
                      <div className="flex items-start gap-4">
                        <div className="bg-white border border-orange-200 text-orange-700 p-3 rounded-lg text-center min-w-[70px] shadow-sm">
                          <div className="font-bold text-lg">{appt.startTime}</div>
                          <div className="text-xs uppercase font-semibold">{new Date(Number(appt.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg">{appt.patient?.firstName} {appt.patient?.lastName}</div>
                          <div className="text-[var(--ink-soft)] text-sm">Requested an appointment</div>
                        </div>
                      </div>
                      <div className="flex gap-3 self-start sm:self-center">
                        <button 
                          onClick={() => handleUpdateStatus(appt.id, 'CANCELLED')} 
                          className="px-4 py-2 border border-[var(--border)] text-[var(--ink-soft)] hover:bg-gray-100 rounded-md text-sm font-semibold transition-colors"
                        >
                          Decline
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(appt.id, 'CONFIRMED')} 
                          className="px-4 py-2 bg-[var(--gold)] hover:bg-[var(--gold-dark)] text-white rounded-md text-sm font-semibold transition-colors shadow-sm"
                        >
                          Confirm
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Schedule View - Confirmed/Completed */}
          <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-lg">Upcoming Schedule</h3>
            </div>
            <div className="p-0">
              {appointments.filter(a => a.status !== 'PENDING').length === 0 ? (
                <div className="p-8 text-center text-[var(--ink-soft)]">No other appointments on the schedule.</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {appointments.filter(a => a.status !== 'PENDING').map(appt => (
                    <li key={appt.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="bg-[var(--gold-tint)] text-[var(--gold-dark)] p-3 rounded-lg text-center min-w-[70px]">
                          <div className="font-bold text-lg">{appt.startTime}</div>
                          <div className="text-xs uppercase font-semibold">{new Date(Number(appt.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg">{appt.patient?.firstName} {appt.patient?.lastName}</div>
                          <div className="mt-2">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                              appt.status === 'CONFIRMED' ? 'bg-[var(--success-tint)] text-[var(--success)]' : 
                              appt.status === 'COMPLETED' ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 
                              appt.status === 'CANCELLED' ? 'bg-[var(--danger-tint)] text-[var(--danger)]' : 
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {appt.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 self-start sm:self-center items-center">
                        {appt.status === 'CONFIRMED' && (
                          <button 
                            onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')} 
                            className="px-4 py-2 bg-[var(--teal-tint)] hover:bg-[var(--teal)] text-[var(--teal)] hover:text-white rounded-md text-sm font-semibold transition-colors"
                          >
                            Mark Completed
                          </button>
                        )}
                        <button className="p-2 text-[var(--ink-faint)] hover:text-[var(--gold)] transition-colors" title="View Medical Record">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

