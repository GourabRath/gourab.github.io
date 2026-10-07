"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Register() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Form State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [address, setAddress] = useState("");

  // OTP State
  const [otpMethod, setOtpMethod] = useState("EMAIL"); // 'EMAIL' or 'MOBILE'
  const [otpCode, setOtpCode] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!firstName || !lastName || !email || !password || !phone) {
      setError("Please fill all required fields.");
      setLoading(false);
      return;
    }

    try {
      const fullPhone = `${countryCode}${phone}`;
      const res = await fetch("http://localhost:4000/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation RegisterPatient(
              $email: String!, $password: String!, $firstName: String!, $lastName: String!, 
              $phone: String!, $dob: String, $sex: String, $address: String
            ) {
              registerPatient(
                email: $email, password: $password, firstName: $firstName, lastName: $lastName,
                phone: $phone, dob: $dob, sex: $sex, address: $address
              ) {
                token
                user { id email role }
              }
            }
          `,
          variables: {
            email,
            password,
            firstName,
            lastName,
            phone: fullPhone,
            dob,
            sex,
            address,
          },
        }),
      });
      const { data, errors } = await res.json();
      if (errors) throw new Error(errors[0].message);

      // Successfully registered & logged in
      localStorage.setItem("token", data.registerPatient.token);
      localStorage.setItem("user", JSON.stringify(data.registerPatient.user));
      router.push("/patient/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* LEFT: photo / brand panel */}
      <div className="auth-visual">
        <div className="auth-visual-bg"></div>
        <div>
          <Link className="brand" href="/">
            <span className="mark">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
              >
                <path d="M12 21c-4.5-2.7-9-6.4-9-11.4C3 6 5.6 3.5 8.8 3.5c1.7 0 3.2.8 4.2 2.1 1-1.3 2.5-2.1 4.2-2.1C20.4 3.5 21 6 21 9.6 21 14.6 16.5 18.3 12 21z" />
              </svg>
            </span>
            MediCare Hospital
          </Link>
        </div>
        <div className="visual-copy">
          <div className="eyebrow">
            <span>●</span>Join MediCare
          </div>
          <h1>Start your healthcare journey today.</h1>
          <p>
            Register as a patient to book appointments, manage records, and talk
            to your AI healthcare assistant securely.
          </p>
        </div>
      </div>

      {/* RIGHT: form panel */}
      <div className="auth-form" style={{ overflowY: "auto" }}>
        <div className="form-head">
          <div className="eyebrow" style={{ color: "#C88A2E" }}>
            Patient Registration
          </div>
          <h2>Create Account</h2>
          <p>Step {step} of 3</p>
        </div>

        {error && (
          <div
            className="login-error"
            style={{ display: "block", color: "red", marginBottom: "15px" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div className="field">
              <label>First Name *</label>
              <div className="field-input">
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Last Name *</label>
              <div className="field-input">
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Email Address *</label>
            <div className="field-input">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>Password *</label>
            <div
              className="field-input"
              style={{ display: "flex", alignItems: "center" }}
            >
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-faint)",
                  padding: "0 5px",
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                }}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="field">
            <label>Phone Number *</label>
            <div
              className="field-input"
              style={{ display: "flex", alignItems: "center" }}
            >
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{
                  padding: "10px 5px",
                  border: "none",
                  borderRight: "1px solid #ccc",
                  background: "transparent",
                  outline: "none",
                  color: "#555",
                }}
              >
                <option value="+91">+91 (IN)</option>
                <option value="+1">+1 (US)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+61">+61 (AU)</option>
              </select>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  flex: 1,
                  paddingLeft: 10,
                  border: "none",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div className="field">
              <label>Date of Birth</label>
              <div className="field-input">
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Sex</label>
              <div className="field-input">
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    width: "100%",
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            <label>Full Address</label>
            <div className="field-input">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <button
            className="signin-btn"
            type="submit"
            style={{ background: "#C88A2E", marginTop: 15 }}
            disabled={loading}
          >
            <span>{loading ? "Creating..." : "Create Account"}</span>
          </button>
          <div
            style={{
              textAlign: "center",
              marginTop: 15,
              fontSize: 13,
              color: "var(--ink-soft)",
            }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              style={{
                color: "#C88A2E",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
