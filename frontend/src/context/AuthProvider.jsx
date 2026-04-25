import { useState } from "react"
import { AuthContext } from "./AuthContext"

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dexio_user")) || null
    } catch {
      return null
    }
  })

  function login(userData) {
    localStorage.setItem("dexio_user", JSON.stringify(userData))
    setUser(userData)
  }

  async function logout() {
    try {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // continue regardless — clear local state either way
    }
    localStorage.removeItem("dexio_user")
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}