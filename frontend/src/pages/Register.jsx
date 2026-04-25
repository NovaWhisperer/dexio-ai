import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../context/useAuth"
import DexioLogo from "../components/DexioLogo"
import toast, { Toaster } from "react-hot-toast"

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: ""
  })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await api.register({
        fullName: { firstName: form.firstName, lastName: form.lastName },
        email: form.email,
        password: form.password,
      })
      login(data.user)
      navigate("/chat")
    } catch (err) {
      toast.error(err.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#18181f",
            color: "#e8e6f2",
            border: "1px solid #2a2a36",
            fontSize: "13px",
            borderRadius: "10px",
          },
          error: { iconTheme: { primary: "#f05c6a", secondary: "#18181f" } },
        }}
      />

      <div className="auth-card">
        <div className="auth-logo">
          <DexioLogo size="md" />
        </div>

        <h1 className="auth-heading">Create account</h1>
        <p className="auth-sub">Your AI assistant, personalised for you.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label>First name</label>
              <input
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="Arjun"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>Last name</label>
              <input
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="Sharma"
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Min 8 characters"
              required
              minLength={8}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <span className="btn-spinner-wrap">
                <span className="btn-spinner" /> Creating account…
              </span>
            ) : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}