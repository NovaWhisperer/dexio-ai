const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
    ...options,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) throw new Error(data.message || "Something went wrong")

  return data
}

export const api = {
  register: (body) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  logout: () =>
    request("/api/auth/logout", { method: "POST" }),

  getChats: () =>
    request("/api/chat", { method: "GET" }),

  createChat: (body) =>
    request("/api/chat", { method: "POST", body: JSON.stringify(body) }),

  getChatMessages: (id) =>
    request(`/api/chat/${id}/messages`, { method: "GET" }),

  updateChatTitle: (id, title) =>
    request(`/api/chat/${id}/title`, { method: "PATCH", body: JSON.stringify({ title }) }),

  deleteChat: (id) =>
    request(`/api/chat/${id}`, { method: "DELETE" }),
}