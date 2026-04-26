import { useState, lazy, Suspense } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../context/useAuth"
import DexioLogo from "../components/DexioLogo"
import toast, { Toaster } from "react-hot-toast"

const Background3D = lazy(() => import("../components/Background3D"))

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
    } catch {
      toast.error("Registration failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <Suspense fallback={null}>
        <Background3D variant="auth" />
      </Suspense>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#f4f4f5",
            border: "1px solid #27272a",
            fontSize: "13px",
            borderRadius: "10px",
          },
          error: { iconTheme: { primary: "#f87171", secondary: "#18181b" } },
        }}
      />

      <div className="auth-card glass auth-card-wrap">
        <div className="auth-logo">
          <DexioLogo size="md" />
        </div>

        <h1 className="auth-heading">Create account</h1>
        <p className="auth-sub">Start your journey with Dexio AI.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label>First Name</label>
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
              <label>Last Name</label>
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
            <label>Email Address</label>
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