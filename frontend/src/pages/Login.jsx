import { useState, lazy, Suspense } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../context/useAuth"
import DexioLogo from "../components/DexioLogo"
import { CustomToaster } from "../components/Toast"
import toast from "react-hot-toast"

const Background3D = lazy(() => import("../components/Background3D"))

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm]       = useState({ email: "", password: "" })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await api.login(form)
      login(data.user)
      navigate("/chat")
    } catch {
      toast.error("Invalid email or password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <Suspense fallback={null}>
        <Background3D variant="auth" />
      </Suspense>
      <CustomToaster />

      <div className="auth-card glass auth-card-wrap">
        <div className="auth-logo">
          <DexioLogo size="md" />
        </div>

        <h1 className="auth-heading">Welcome back</h1>
        <p className="auth-sub">Sign in to your AI workspace.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email Address</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <span className="btn-spinner-wrap">
                <span className="btn-spinner" /> Signing in…
              </span>
            ) : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  )
}