"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { graphqlRequest } from "@/lib/graphql";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState(
    ["patient", "doctor", "admin"].includes(searchParams.get("role"))
      ? searchParams.get("role")
      : "patient",
  );
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      const data = await graphqlRequest(
        `mutation Login($email: String!, $password: String!, $role: String!) {
          login(email: $email, password: $password, role: $role) {
            token user { id email role }
          }
        }`,
        { email: identity.trim(), password, role },
      );
      const { token, user } = data.login;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      const destination = {
        PATIENT: "/patient/dashboard",
        DOCTOR: "/doctor/dashboard",
        ADMIN: "/admin/dashboard",
      }[user.role];
      if (!destination) throw new Error("Your account does not have a supported role.");
      const doctorId =
        user.role === "PATIENT" ? searchParams.get("doctor") : null;
      router.replace(
        doctorId
          ? `${destination}?doctor=${encodeURIComponent(doctorId)}`
          : destination,
      );
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 sm:px-6">
      <div className="auth-shell mx-auto">
        <section className="auth-visual">
          <div className="auth-visual-bg" />
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true">✚</span>
            MediCare Hospital
          </Link>
          <div className="visual-copy">
            <div className="eyebrow">Secure portal access</div>
            <h1>Your care team, always one sign-in away.</h1>
            <p>Appointments and care coordination in one connected place.</p>
          </div>
        </section>

        <section className="auth-form">
          <Link href="/" className="register-back">← Back to MediCare</Link>
          <div className="form-head">
            <div className="eyebrow">{role} portal</div>
            <h2>Welcome back</h2>
            <p>Sign in to continue to your account.</p>
          </div>

          <div className="role-switch" aria-label="Choose account type">
            {["patient", "doctor", "admin"].map((accountRole) => (
              <button
                type="button"
                key={accountRole}
                className={role === accountRole ? "active" : ""}
                aria-pressed={role === accountRole}
                onClick={() => {
                  setRole(accountRole);
                  setError("");
                }}
              >
                {accountRole[0].toUpperCase() + accountRole.slice(1)}
              </button>
            ))}
          </div>

          <form onSubmit={signIn}>
            <div className="field">
              <label htmlFor="login-identity">Email or phone number</label>
              <div className="field-input">
                <input
                  id="login-identity"
                  type="text"
                  autoComplete="username"
                  value={identity}
                  onChange={(event) => setIdentity(event.target.value)}
                  placeholder="you@example.com or +91…"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="field-input">
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </div>
            {error && <p className="login-error visible" role="alert">{error}</p>}
            <button className="signin-btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : `Sign in as ${role}`}
            </button>
          </form>

          {role === "patient" && (
            <p className="helper-note">
              New to MediCare? <Link href="/register">Create a patient account</Link>
            </p>
          )}
          <p className="mt-6 text-center text-xs leading-5 text-[var(--ink-faint)]">
            For emergencies, call your local emergency number. This portal is not an emergency service.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading sign-in…</main>}>
      <LoginContent />
    </Suspense>
  );
}
