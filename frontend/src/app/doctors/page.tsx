"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function DoctorsContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  
  const [doctors, setDoctors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [specialities, setSpecialities] = useState<any[]>([]);
  
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSpeciality, setSelectedSpeciality] = useState(searchParams.get("speciality") || "");
  const [loading, setLoading] = useState(true);

  const fetchFilters = async () => {
    try {
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query {
              locations { id city }
              specialities { id name }
            }
          `
        })
      });
      const { data } = await res.json();
      if (data) {
        setLocations(data.locations || []);
        setSpecialities(data.specialities || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetDoctors($loc: ID, $spec: ID, $search: String) {
              doctors(locationId: $loc, specialityId: $spec, search: $search) {
                id firstName lastName specialization experienceYears 
                location { name city }
                speciality { name }
              }
            }
          `,
          variables: { 
            loc: selectedLocation || null, 
            spec: selectedSpeciality || null, 
            search: search || null 
          }
        })
      });
      const { data } = await res.json();
      if (data) setDoctors(data.doctors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [selectedLocation, selectedSpeciality, search]);

  return (
    <div style={{ backgroundColor: 'var(--bg)', minHeight: '100vh', fontFamily: "var(--font-body)", color: 'var(--ink)' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'var(--teal)', color: '#fff', padding: '40px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>Find a Doctor</h1>
        <p style={{ opacity: 0.9 }}>Book appointments with the best specialists</p>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', display: 'flex', gap: '30px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* Filters Sidebar */}
        <div style={{ flex: '1 1 250px', backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--teal)', marginBottom: '20px' }}>Filter Results</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>City / Location</label>
            <select 
              value={selectedLocation} 
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'var(--bg)' }}
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.city}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Speciality</label>
            <select 
              value={selectedSpeciality} 
              onChange={(e) => setSelectedSpeciality(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'var(--bg)' }}
            >
              <option value="">All Specialities</option>
              {specialities.map(spec => (
                <option key={spec.id} value={spec.id}>{spec.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: '3 1 600px' }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>{doctors.length} Doctors Found</h2>
          </div>

          {loading ? <p>Loading...</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {doctors.map(doc => (
                <div key={doc.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--teal-tint)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                    👨‍⚕️
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--teal)', marginBottom: '5px' }}>Dr. {doc.firstName} {doc.lastName}</h3>
                    <div style={{ color: 'var(--ink-soft)', fontSize: '14px', marginBottom: '5px' }}>
                      <strong>{doc.speciality?.name || doc.specialization}</strong> • {doc.experienceYears} Years Exp
                    </div>
                    <div style={{ color: 'var(--ink-soft)', fontSize: '14px' }}>
                      📍 {doc.location?.name || "Main Campus"}, {doc.location?.city}
                    </div>
                  </div>
                  <div>
                    <Link href="/login?role=patient" style={{ backgroundColor: 'var(--gold)', color: '#fff', padding: '10px 20px', borderRadius: '4px', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>
                      Book Appointment
                    </Link>
                  </div>
                </div>
              ))}
              {doctors.length === 0 && (
                <div style={{ backgroundColor: 'var(--surface)', padding: '40px', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--ink-soft)' }}>No doctors found matching your criteria.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DoctorsDirectory() {
  return (
    <Suspense fallback={<div>Loading directory...</div>}>
      <DoctorsContent />
    </Suspense>
  );
}

