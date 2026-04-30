import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { AuthProvider } from "./context/AuthProvider"
import { useAuth } from "./context/useAuth"
import { useEffect, useRef, lazy, Suspense } from "react"
import Register from "./pages/Register"
import Login    from "./pages/Login"
import Chat     from "./pages/Chat"

const Background3D = lazy(() => import("./components/Background3D"))

function Protected({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function PublicOnly({ children }) {
  const { user } = useAuth()
  return !user ? children : <Navigate to="/chat" replace />
}

// ── Fade transition wrapper ───────────────────────────────────────────────
function AnimatedRoutes() {
  const location  = useLocation()
  const ref       = useRef(null)
  const prevPath  = useRef(location.pathname)

  // Determine background variant from current route
  const isAuth    = location.pathname === "/login" || location.pathname === "/register"
  const variant   = isAuth ? "auth" : "chat"

  useEffect(() => {
    if (prevPath.current === location.pathname) return
    prevPath.current = location.pathname

    const el = ref.current
    if (!el) return

    el.style.opacity    = "0"
    el.style.transform  = "translateY(8px)"
    el.style.transition = "none"

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "opacity 0.3s ease, transform 0.3s ease"
        el.style.opacity    = "1"
        el.style.transform  = "translateY(0)"
      })
    })
  }, [location.pathname])

  return (
    <>
      {/* Single Background3D instance — persists across all routes,
          never unmounts, WebGL context lives for the whole session */}
      <Suspense fallback={null}>
        <Background3D variant={variant} />
      </Suspense>

      <div
        ref={ref}
        style={{
          height:     "100%",
          opacity:    1,
          transform:  "translateY(0)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          position:   "relative",
          zIndex:     1,
        }}
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/chat" replace />} />

          <Route path="/register" element={
            <PublicOnly><Register /></PublicOnly>
          }/>

          <Route path="/login" element={
            <PublicOnly><Login /></PublicOnly>
          }/>

          <Route path="/chat" element={
            <Protected><Chat /></Protected>
          }/>
        </Routes>
      </div>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}