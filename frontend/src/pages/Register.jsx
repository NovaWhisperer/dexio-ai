import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../context/useAuth"
import DexioLogo from "../components/DexioLogo"

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: ""
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <DexioLogo size="md" />
        </div>

        <h1 className="auth-heading">Create account</h1>
        <p className="auth-sub">Your AI assistant, personalised for you.</p>

        {error && <div className="error-msg">{error}</div>}

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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}