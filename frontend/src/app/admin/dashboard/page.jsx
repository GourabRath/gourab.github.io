"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { graphqlRequest } from "@/lib/graphql";

export default function AdminDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setError("");
    const data = await graphqlRequest(`
      query AdminDashboard {
        me { id email role }
        adminOverview {
          patientCount doctorCount appointmentCount pendingAppointmentCount
        }
        doctors {
          id firstName lastName specialization experienceYears
          user { email }
        }
      }
    `);
    if (data.me?.role !== "ADMIN") {
      throw new Error("This page is available to administrator accounts.");
    }
    setOverview(data.adminOverview);
    setDoctors(data.doctors || []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadDashboard();
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          if (loadError.message.toLowerCase().includes("auth")) {
            router.replace("/login?role=admin");
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

  const filteredDoctors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((doctor) =>
      `${doctor.firstName} ${doctor.lastName} ${doctor.specialization} ${doctor.user?.email}`
        .toLowerCase()
        .includes(term),
    );
  }, [doctors, search]);

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login?role=admin");
  };

  if (loading) {
    return <main className="min-h-screen bg-[#f8f9fa] p-8"><p role="status">Loading administration overview…</p></main>;
  }

  const metrics = [
    ["Patients", overview?.patientCount],
    ["Doctors", overview?.doctorCount],
    ["Appointments", overview?.appointmentCount],
    ["Pending requests", overview?.pendingAppointmentCount],
  ];

  return (
    <main className="min-h-screen bg-[#f8f9fa] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--navy)] px-5 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold">MediCare <span className="font-normal text-blue-200">/ Admin</span></Link>
          <button className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold transition hover:bg-white/10" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8">
        <section>
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--navy)]">Operations</p>
          <h1 className="mt-2 text-3xl font-bold">Hospital overview</h1>
          <p className="mt-2 text-[var(--ink-soft)]">Current totals are loaded from the application database.</p>
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

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">Doctor directory</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">Registered providers and account details.</p>
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
                  <th className="px-5 py-3 font-semibold">Doctor</th>
                  <th className="px-5 py-3 font-semibold">Specialty</th>
                  <th className="px-5 py-3 font-semibold">Experience</th>
                  <th className="px-5 py-3 font-semibold">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredDoctors.length === 0 ? (
                  <tr><td className="px-5 py-8 text-center text-sm text-[var(--ink-soft)]" colSpan={4}>No matching doctors found.</td></tr>
                ) : filteredDoctors.map((doctor) => (
                  <tr key={doctor.id} className="transition hover:bg-gray-50">
                    <td className="px-5 py-4 font-semibold">Dr. {doctor.firstName} {doctor.lastName}</td>
                    <td className="px-5 py-4">{doctor.specialization}</td>
                    <td className="px-5 py-4">{doctor.experienceYears} years</td>
                    <td className="px-5 py-4 text-sm text-[var(--ink-soft)]">{doctor.user?.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs leading-5 text-[var(--ink-faint)]">
          This demonstration dashboard shows operational counts only. It does not replace an audited hospital information system.
        </p>
      </div>
    </main>
  );
}
