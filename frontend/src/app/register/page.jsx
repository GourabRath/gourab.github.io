"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { graphqlRequest } from "@/lib/graphql";

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    dob: "",
    sex: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const register = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await graphqlRequest(
        `mutation RegisterPatient(
          $email: String!, $password: String!, $firstName: String!, $lastName: String!,
          $phone: String!, $dob: String, $sex: String, $address: String
        ) {
          registerPatient(
            email: $email, password: $password, firstName: $firstName, lastName: $lastName,
            phone: $phone, dob: $dob, sex: $sex, address: $address
          ) { token user { id email role } }
        }`,
        { ...form, email: form.email.trim(), phone: form.phone.trim() },
      );
      localStorage.setItem("token", data.registerPatient.token);
      localStorage.setItem("user", JSON.stringify(data.registerPatient.user));
      router.replace("/patient/dashboard");
    } catch (registrationError) {
      setError(registrationError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 sm:px-6">
      <div className="auth-shell register-shell mx-auto">
        <section className="auth-visual">
          <div className="auth-visual-bg" />
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true">✚</span>
            MediCare Hospital
          </Link>
          <div className="visual-copy">
            <div className="eyebrow">Patient registration</div>
            <h1>Start your healthcare journey today.</h1>
            <p>Create a patient account to request appointments and keep your care information together.</p>
          </div>
        </section>

        <section className="auth-form">
          <Link href="/" className="register-back">← Back to MediCare</Link>
          <div className="form-head">
            <div className="eyebrow">Patient account</div>
            <h2>Create your account</h2>
            <p>Fields marked with * are required.</p>
          </div>

          <form onSubmit={register}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="firstName">First name *</label>
                <div className="field-input">
                  <input id="firstName" name="firstName" autoComplete="given-name" value={form.firstName} onChange={updateField} maxLength={80} required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lastName">Last name *</label>
                <div className="field-input">
                  <input id="lastName" name="lastName" autoComplete="family-name" value={form.lastName} onChange={updateField} maxLength={80} required />
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">Email address *</label>
              <div className="field-input">
                <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} maxLength={254} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Password * (at least 8 characters)</label>
              <div className="field-input">
                <input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={updateField} minLength={8} maxLength={128} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number *</label>
              <div className="field-input">
                <input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={updateField} maxLength={24} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="dob">Date of birth</label>
                <div className="field-input">
                  <input id="dob" name="dob" type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={updateField} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sex">Sex</label>
                <div className="field-input">
                  <select id="sex" name="sex" value={form.sex} onChange={updateField}>
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <div className="field-input">
                <input id="address" name="address" autoComplete="street-address" value={form.address} onChange={updateField} maxLength={300} />
              </div>
            </div>
            {error && <p className="login-error visible" role="alert">{error}</p>}
            <button className="signin-btn" type="submit" disabled={loading}>
              {loading ? "Creating account…" : "Create patient account"}
            </button>
          </form>
          <p className="helper-note">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
