"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
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
              doctors { id firstName lastName specialization experienceYears user { email } }
            }
          `
        })
      });
      const { data } = await res.json();
      if (data) {
        setDoctors(data.doctors || []);
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
      router.push("/login?role=admin");
    } else {
      setUser(JSON.parse(userData));
      fetchDashboardData(token);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login?role=admin");
  };

  if (!user || loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-sans text-[var(--ink)]">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--navy)] text-white hidden md:flex flex-col">
        <div className="p-6 border-b border-[var(--navy-dark)]">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z"/></svg>
            MediCare Admin
          </Link>
        </div>
        <div className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-white text-[var(--navy)] flex items-center justify-center font-bold text-lg">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-sm truncate w-32">{user.email.split('@')[0]}</div>
              <div className="text-xs text-blue-200">System Administrator</div>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-[var(--navy-dark)] text-white rounded-lg font-medium">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              Dashboard
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-blue-200 hover:bg-[var(--navy-dark)] rounded-lg font-medium transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              User Management
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-blue-200 hover:bg-[var(--navy-dark)] rounded-lg font-medium transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Analytics
            </a>
          </nav>
        </div>
        <div className="p-6 border-t border-[var(--navy-dark)]">
          <button onClick={handleLogout} className="flex items-center gap-3 text-red-400 hover:text-red-300 font-medium w-full px-4 py-2 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-[var(--border)] px-8 py-5 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold text-[var(--navy)]">System Overview</h1>
            <p className="text-[var(--ink-soft)] text-sm mt-1">Manage hospital resources and view analytics.</p>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-[var(--border)] flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[var(--teal-tint)] text-[var(--teal)] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--navy)]">{doctors.length + 150}</div>
                <div className="text-sm text-[var(--ink-soft)] font-medium">Total Patients</div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-[var(--border)] flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[var(--gold-tint)] text-[var(--gold-dark)] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--navy)]">{doctors.length}</div>
                <div className="text-sm text-[var(--ink-soft)] font-medium">Registered Doctors</div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-[var(--border)] flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--navy)]">{doctors.length * 42}</div>
                <div className="text-sm text-[var(--ink-soft)] font-medium">Appointments This Month</div>
              </div>
            </div>
          </div>

          {/* Doctors Directory Table */}
          <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-lg">Doctors Directory</h3>
              <button className="px-4 py-2 bg-[var(--navy)] text-white text-sm font-semibold rounded-md hover:bg-[var(--navy-dark)] transition-colors">
                + Add Doctor
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-[var(--border)] text-[var(--ink-soft)] text-sm">
                    <th className="py-4 px-6 font-semibold">Doctor</th>
                    <th className="py-4 px-6 font-semibold">Specialization</th>
                    <th className="py-4 px-6 font-semibold">Experience</th>
                    <th className="py-4 px-6 font-semibold">Account ID</th>
                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {doctors.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-[var(--ink-soft)]">No doctors registered.</td></tr>
                  ) : doctors.map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--navy-tint)] text-[var(--navy)] flex items-center justify-center font-bold text-sm">
                            {doc.firstName.charAt(0)}{doc.lastName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-[var(--navy)]">Dr. {doc.firstName} {doc.lastName}</div>
                            <div className="text-xs text-[var(--ink-soft)]">{doc.user?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[var(--ink)] font-medium">
                        {doc.specialization}
                      </td>
                      <td className="py-4 px-6 text-[var(--ink-soft)]">
                        {doc.experienceYears} Years
                      </td>
                      <td className="py-4 px-6 text-xs font-mono text-[var(--ink-faint)]">
                        {doc.id}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-[var(--teal)] hover:text-[var(--teal-dark)] font-semibold text-sm mr-4">Edit</button>
                        <button className="text-[var(--danger)] hover:text-red-700 font-semibold text-sm">Revoke</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

