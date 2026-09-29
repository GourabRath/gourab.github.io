"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState(searchParams.get("role") || "patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation Login($email: String!, $password: String!, $role: String!) {
              login(email: $email, password: $password, role: $role) {
                token
                user { id email role }
              }
            }
          `,
          variables: { email, password, role }
        })
      });
      const { data, errors } = await res.json();
      if (errors && errors.length > 0) throw new Error(errors[0].message);
      
      if (data && data.login) {
        localStorage.setItem("token", data.login.token);
        localStorage.setItem("user", JSON.stringify(data.login.user));
        
        if (data.login.user.role === "PATIENT") router.push("/patient/dashboard");
        else if (data.login.user.role === "DOCTOR") router.push("/doctor/dashboard");
        else if (data.login.user.role === "ADMIN") router.push("/admin/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Failed to login. Check your credentials.");
    }
  };

  return (
    <div className="auth-shell">
      {/* LEFT: photo / brand panel */}
      <div className="auth-visual">
        <div className="auth-visual-bg"></div>
        <div>
          <Link className="brand" href="/"><span className="mark"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z"/></svg></span>MediCare Hospital</Link>
        </div>

        <div className="visual-copy">
          <div className="eyebrow"><span>●</span>Secure Portal Access</div>
          <h1>Your care team, always one sign-in away.</h1>
          <p>Whichever role you sign in with, MediCare keeps everything — appointments, records, and schedules — in one connected place.</p>
          <div className="quote-card">
            <div className="stars">★★★★★</div>
            <p>Booking a cardiology visit took less than a minute, and I got a reminder the morning of.</p>
            <div className="quote-who">
              <div className="av"></div>
              <div className="t"><b>Asha Sharma</b><span>Patient since 2024</span></div>
            </div>
          </div>
          <div className="visual-stats">
            <div className="s"><div className="num">45+</div><div className="lbl">Specialists</div></div>
            <div className="s"><div className="num">1,250+</div><div className="lbl">Patients</div></div>
            <div className="s"><div className="num">24/7</div><div className="lbl">Support</div></div>
          </div>
        </div>
      </div>

      {/* RIGHT: form panel */}
      <div className="auth-form">
        <div className="form-head">
          <div className="eyebrow" id="roleEyebrow" style={{ textTransform: 'capitalize' }}>{role} Portal</div>
          <h2 id="formTitle">Welcome back</h2>
          <p id="formSub">Sign in to <span>your {role} account</span></p>
        </div>

        <div className="role-switch" id="roleSwitch">
          <button className={role === 'patient' ? 'active' : ''} onClick={() => setRole('patient')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/></svg>
            Patient
          </button>
          <button className={role === 'doctor' ? 'active' : ''} onClick={() => setRole('doctor')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>
            Doctor
          </button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l7 3v6c0 5-3.4 8.7-7 10-3.6-1.3-7-5-7-10V5z"/></svg>
            Admin
          </button>
        </div>

        <form id="loginForm" onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="idInput">Email or Mobile No.</label>
            <div className="field-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
              <input id="idInput" type="text" placeholder="asha@example.com or +91..." value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pwInput">Password</label>
            <div className="field-input" style={{ display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>
              <input id="pwInput" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required style={{ flex: 1, border: 'none', outline: 'none' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: '0 5px', display: 'flex', alignItems: 'center', height: '100%' }}>
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button className="signin-btn" type="submit">
            <span>Sign In as {role}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          {error && <div className="login-error" style={{ display: 'block', color: 'red', marginTop: '10px' }}>{error}</div>}
        </form>

        {role === 'patient' && (
          <>
            <div className="divider">or</div>
            <div className="helper-note" style={{ textAlign: 'center', marginTop: 15, fontSize: 13, color: 'var(--ink-soft)' }}>
              New here? <Link href="/register" style={{ color: '#C88A2E', fontWeight: 600, textDecoration: 'none' }}>Create a patient account</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
// TEST COMMENT
