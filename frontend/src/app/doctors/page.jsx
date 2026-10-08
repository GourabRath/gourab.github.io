"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { graphqlRequest } from "@/lib/graphql";

function DoctorsContent() {
  const searchParams = useSearchParams();
  const [doctors, setDoctors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [locationId, setLocationId] = useState("");
  const [specialityId, setSpecialityId] = useState(searchParams.get("speciality") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadDoctors = async () => {
      try {
        const data = await graphqlRequest(
          `query DoctorDirectory($locationId: ID, $specialityId: ID, $search: String) {
            locations { id name city state }
            specialities { id name }
            doctors(locationId: $locationId, specialityId: $specialityId, search: $search) {
              id firstName lastName specialization experienceYears
              location { name city state }
              speciality { name }
            }
          }`,
          {
            locationId: locationId || null,
            specialityId: specialityId || null,
            search: search.trim() || null,
          },
        );
        if (active) {
          setDoctors(data.doctors || []);
          setLocations(data.locations || []);
          setSpecialities(data.specialities || []);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDoctors();
    return () => {
      active = false;
    };
  }, [locationId, search, specialityId]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-[var(--teal)]">MediCare Health</Link>
          <div className="flex gap-3">
            <Link href="/login?role=patient" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:bg-gray-50">Sign in</Link>
            <Link href="/register" className="rounded-lg bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-dark)]">Join as patient</Link>
          </div>
        </div>
      </header>

      <section className="bg-[var(--teal)] px-5 py-12 text-center text-white sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-white/75">Care starts with the right team</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Find a doctor</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/85">Browse specialists and request an appointment through your patient portal.</p>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="font-bold">Filter doctors</h2>
          <label className="mt-5 block text-sm font-semibold">
            Search
            <input
              className="mt-2 w-full rounded-lg border border-[var(--border)] p-3 font-normal"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or specialty"
              maxLength={100}
            />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Location
            <select className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-normal" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.city}, {location.state}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Specialty
            <select className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-normal" value={specialityId} onChange={(event) => setSpecialityId(event.target.value)}>
              <option value="">All specialties</option>
              {specialities.map((speciality) => (
                <option key={speciality.id} value={speciality.id}>{speciality.name}</option>
              ))}
            </select>
          </label>
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Available specialists</h2>
            {!loading && <span className="text-sm text-[var(--ink-soft)]">{doctors.length} found</span>}
          </div>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              Could not load the doctor directory: {error}
            </div>
          )}
          {loading ? (
            <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm" role="status">Loading doctors…</p>
          ) : doctors.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--ink-soft)]">No doctors match those filters. Try changing your search.</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {doctors.map((doctor) => (
                <li key={doctor.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Dr. {doctor.firstName} {doctor.lastName}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--teal)]">
                        {doctor.speciality?.name || doctor.specialization}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--teal-tint)] text-lg text-[var(--teal)]" aria-hidden="true">✚</div>
                  </div>
                  <p className="mt-4 text-sm text-[var(--ink-soft)]">
                    {doctor.experienceYears} years of experience
                    {doctor.location?.city ? ` · ${doctor.location.city}` : ""}
                  </p>
                  <Link href={`/login?role=patient&doctor=${encodeURIComponent(doctor.id)}`} className="mt-5 inline-flex rounded-lg bg-[var(--teal)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--teal-dark)]">
                    Book appointment
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--bg)] p-8">Loading doctor directory…</main>}>
      <DoctorsContent />
    </Suspense>
  );
}
