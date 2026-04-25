import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./context/AuthProvider"
import { useAuth } from "./context/useAuth"
import Register from "./pages/Register"
import Login    from "./pages/Login"
import Chat     from "./pages/Chat"

function Protected({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function PublicOnly({ children }) {
  const { user } = useAuth()
  return !user ? children : <Navigate to="/chat" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
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
      </BrowserRouter>
    </AuthProvider>
  )
}