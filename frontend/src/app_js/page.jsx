"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery) {
      router.push(`/doctors?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg)",
        color: "var(--ink)",
        minHeight: "100vh",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Top Emergency Bar */}
      <div
        style={{
          backgroundColor: "var(--surface)",
          padding: "8px 20px",
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          fontSize: "13px",
        }}
      >
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <div
            style={{
              color: "var(--danger)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ color: "var(--danger)" }}>●</span> 24/7 Emergency
          </div>
          <div style={{ fontWeight: 500, color: "var(--ink)" }}>
            📞 1800 309 0309
          </div>
        </div>
        <div style={{ display: "flex", gap: "15px" }}>
          <Link
            href="/login?role=patient"
            style={{
              color: "var(--patient-c)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Patient Login
          </Link>
          <Link
            href="/login?role=doctor"
            style={{
              color: "var(--doctor-c)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Doctor Login
          </Link>
          <Link
            href="/login?role=admin"
            style={{
              color: "var(--admin-c)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Admin Login
          </Link>
        </div>
      </div>

      {/* Main Navigation (Mega Menu) */}
      <nav
        style={{
          padding: "15px 20px",
          display: "flex",
          alignItems: "center",
          gap: "40px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--teal)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--teal)"
            strokeWidth="2"
          >
            <path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z" />
          </svg>
          MediCare Health
        </Link>
        <div
          style={{
            display: "flex",
            gap: "25px",
            fontSize: "15px",
            fontWeight: 500,
          }}
        >
          <Link
            href="/doctors"
            style={{ color: "var(--ink)", textDecoration: "none" }}
          >
            Find a Doctor
          </Link>
          <Link
            href="/specialities"
            style={{ color: "var(--ink)", textDecoration: "none" }}
          >
            Treatments & Specialities
          </Link>
          <Link
            href="/hospitals"
            style={{ color: "var(--ink)", textDecoration: "none" }}
          >
            Hospitals & Clinics
          </Link>
          <Link
            href="/patients"
            style={{ color: "var(--ink)", textDecoration: "none" }}
          >
            Patients & Visitors
          </Link>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Link
            href="/doctors"
            style={{
              backgroundColor: "var(--gold)",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: "4px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Book Appointment
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          position: "relative",
          height: "400px",
          backgroundColor: "#f8f9fa",
          backgroundImage:
            "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url('https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&q=80&w=1200')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          textAlign: "center",
          padding: "0 20px",
        }}
      >
        <h1 style={{ fontSize: "42px", fontWeight: 700, marginBottom: "15px" }}>
          Trusted Care, Every Day
        </h1>
        <p
          style={{
            fontSize: "20px",
            fontWeight: 300,
            marginBottom: "40px",
            opacity: 0.9,
          }}
        >
          Compassion Backed by Expertise
        </p>

        {/* Global Search Bar */}
        <form
          onSubmit={handleSearch}
          style={{
            display: "flex",
            backgroundColor: "#fff",
            padding: "8px",
            borderRadius: "8px",
            width: "100%",
            maxWidth: "600px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
          }}
        >
          <input
            type="search"
            placeholder="Search for Doctors, Specialities, or Hospitals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: "12px 15px",
              border: "none",
              outline: "none",
              fontSize: "16px",
              color: "var(--ink)",
            }}
          />

          <button
            type="submit"
            style={{
              backgroundColor: "var(--teal)",
              color: "#fff",
              border: "none",
              padding: "0 25px",
              borderRadius: "4px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </section>

      {/* Centers of Excellence */}
      <section
        style={{ padding: "80px 20px", maxWidth: "1200px", margin: "0 auto" }}
      >
        <div style={{ textAlign: "center", marginBottom: "50px" }}>
          <h2
            style={{
              fontSize: "32px",
              color: "var(--teal)",
              fontWeight: 700,
              marginBottom: "15px",
            }}
          >
            Centers of Excellence
          </h2>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: "16px",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            Combining the best specialists and equipment to provide you nothing
            short of the best in healthcare
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "20px",
          }}
        >
          {[
            { name: "Cardiac Sciences", icon: "❤️" },
            { name: "Cancer Care", icon: "🎗️" },
            { name: "Neuro Sciences", icon: "🧠" },
            { name: "Gastro Sciences", icon: "🥗" },
            { name: "Orthopaedics", icon: "🦴" },
          ].map((spec) => (
            <Link
              key={spec.name}
              href={`/doctors?speciality=${spec.name}`}
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "30px 20px",
                textAlign: "center",
                textDecoration: "none",
                color: "var(--ink)",
                transition: "all 0.3s",
                boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "15px" }}>
                {spec.icon}
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 600 }}>{spec.name}</h3>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: "var(--navy-dark)",
          color: "#fff",
          padding: "60px 20px 20px",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "40px",
            marginBottom: "60px",
          }}
        >
          <div>
            <h4
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "20px",
                color: "var(--gold-tint)",
              }}
            >
              For Patients
            </h4>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "14px",
                opacity: 0.8,
              }}
            >
              <li>
                <Link
                  href="/doctors"
                  style={{ color: "#fff", textDecoration: "none" }}
                >
                  Book Appointment
                </Link>
              </li>
              <li>
                <Link
                  href="/hospitals"
                  style={{ color: "#fff", textDecoration: "none" }}
                >
                  Hospitals
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "20px",
                color: "var(--gold-tint)",
              }}
            >
              Center of Excellence
            </h4>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "14px",
                opacity: 0.8,
              }}
            >
              <li>Cardiac Sciences</li>
              <li>Cancer Care</li>
              <li>Neuro Sciences</li>
              <li>Gastro Sciences</li>
              <li>Orthopaedics</li>
            </ul>
          </div>
          <div>
            <h4
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "20px",
                color: "var(--gold-tint)",
              }}
            >
              Corporate
            </h4>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "14px",
                opacity: 0.8,
              }}
            >
              <li>About Us</li>
              <li>Leadership</li>
              <li>Careers</li>
              <li>Contact Us</li>
            </ul>
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "20px",
            fontSize: "13px",
            opacity: 0.6,
          }}
        >
          © MediCare Hospital Ltd | All Rights Reserved
        </div>
      </footer>
    </div>
  );
}
