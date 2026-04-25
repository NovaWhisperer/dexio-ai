import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/useAuth"
import { api } from "../services/api"
import { connectSocket, disconnectSocket } from "../services/socket"
import ReactMarkdown from "react-markdown"
import DexioLogo from "../components/DexioLogo"
import {
  Menu, X, Plus, Send, Square, Copy, Check,
  Trash2, LogOut, MessageSquare
} from "lucide-react"


export default function Chat() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // ── State ────────────────────────────────────────────────────────────────
  const [chats, setChats]               = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState("")
  const [waiting, setWaiting]           = useState(false)
  const [connected, setConnected]       = useState(false)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [deletingId, setDeletingId]     = useState(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [renamingId, setRenamingId]     = useState(null)
  const [renameValue, setRenameValue]   = useState("")
  const [copiedId, setCopiedId]         = useState(null)

  const socketRef   = useRef(null)
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)
  const renameRef   = useRef(null)
  const stoppedRef  = useRef(false)   // for stop generation

  // ── Load messages for a chat ─────────────────────────────────────────────
  const loadMessages = useCallback(async (chatId) => {
    setLoadingMsgs(true)
    setMessages([])
    try {
      const data = await api.getChatMessages(chatId)
      setMessages(data.messages.map(m => ({ role: m.role, content: m.content })))
    } catch (err) {
      console.error("loadMessages:", err.message)
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  // ── Load chats on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadChats() {
      try {
        const data = await api.getChats()
        setChats(data.chats)
        if (data.chats.length > 0) {
          setActiveChatId(data.chats[0]._id)
          loadMessages(data.chats[0]._id)
        }
      } catch (err) {
        console.error("loadChats:", err.message)
      } finally {
        setLoadingChats(false)
      }
    }
    loadChats()
  }, [loadMessages])

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, waiting])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "24px"
    el.style.height = Math.min(el.scrollHeight, 140) + "px"
  }, [input])

  // ── Focus rename input when it appears ───────────────────────────────────
  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  // ── Close sidebar on outside click (mobile) ──────────────────────────────
  useEffect(() => {
    function handleOutside(e) {
      if (sidebarOpen && !e.target.closest(".sidebar") && !e.target.closest(".hamburger-btn")) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [sidebarOpen])

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket()
    socketRef.current = socket

    socket.on("connect",    () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on("ai-response", ({ content }) => {
      // If user stopped generation, discard the response
      if (stoppedRef.current) {
        stoppedRef.current = false
        return
      }
      const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      setWaiting(false)
      setMessages(prev => [...prev, { role: "model", content: clean }])
    })

    // Auto-title: server sends updated title after first message
    socket.on("chat-title-updated", ({ chatId, title }) => {
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, title } : c))
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("ai-response")
      socket.off("chat-title-updated")
      disconnectSocket()
    }
  }, [])

  // ── New chat ─────────────────────────────────────────────────────────────
  async function handleNewChat() {
    const title = `New Chat`
    try {
      const data = await api.createChat({ title })
      const newChat = data.chat
      setChats(prev => [newChat, ...prev])
      setActiveChatId(newChat._id)
      setMessages([])
      setSidebarOpen(false)
    } catch (err) {
      console.error("createChat:", err.message)
    }
  }

  // ── Select chat ──────────────────────────────────────────────────────────
  function selectChat(chatId) {
    if (chatId === activeChatId) { setSidebarOpen(false); return }
    setActiveChatId(chatId)
    setWaiting(false)
    stoppedRef.current = false
    setSidebarOpen(false)
    loadMessages(chatId)
  }

  // ── Delete chat ──────────────────────────────────────────────────────────
  async function handleDeleteChat(e, chatId) {
    e.stopPropagation()
    setDeletingId(chatId)
    try {
      await api.deleteChat(chatId)
      const remaining = chats.filter(c => c._id !== chatId)
      setChats(remaining)
      if (chatId === activeChatId) {
        const next = remaining[0] || null
        setActiveChatId(next?._id || null)
        setMessages([])
        if (next) loadMessages(next._id)
      }
    } catch (err) {
      console.error("deleteChat:", err.message)
    } finally {
      setDeletingId(null)
    }
  }

  // ── Rename chat ──────────────────────────────────────────────────────────
  function handleDoubleClick(e, chat) {
    e.stopPropagation()
    setRenamingId(chat._id)
    setRenameValue(chat.title)
  }

  async function handleRenameSubmit(chatId) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed) return
    try {
      await api.updateChatTitle(chatId, trimmed)
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, title: trimmed } : c))
    } catch (err) {
      console.error("rename:", err.message)
    }
  }

  function handleRenameKeyDown(e, chatId) {
    if (e.key === "Enter")  { e.preventDefault(); handleRenameSubmit(chatId) }
    if (e.key === "Escape") { setRenamingId(null) }
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content || !activeChatId || waiting) return

    stoppedRef.current = false
    setMessages(prev => [...prev, { role: "user", content }])
    setInput("")
    setWaiting(true)

    socketRef.current.emit("ai-message", { chat: activeChatId, content })
  }, [input, activeChatId, waiting])

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Stop generation ──────────────────────────────────────────────────────
  function handleStop() {
    stoppedRef.current = true
    setWaiting(false)
  }

  // ── Copy message ─────────────────────────────────────────────────────────
  async function handleCopy(content, id) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error("copy:", err.message)
    }
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    disconnectSocket()
    await logout()
    navigate("/login")
  }

  const activeChat = chats.find(c => c._id === activeChatId)
  const initials   = user
    ? `${user.fullName?.firstName?.[0] ?? ""}${user.fullName?.lastName?.[0] ?? ""}`.toUpperCase()
    : "?"

  return (
    <div className="chat-shell">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-head">
          <DexioLogo size="sm" />
          <div className="sidebar-head-actions">
            <button className="btn-new-chat" onClick={handleNewChat}>
              <Plus size={14} /> New chat
            </button>
            <button className="btn-icon sidebar-close-btn" onClick={() => setSidebarOpen(false)} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="chat-list">
          {loadingChats ? (
            <p className="chat-list-empty">Loading chats…</p>
          ) : (
            <>
              {chats.length > 0 && (
                <div className="chat-list-label">Conversations</div>
              )}
              {chats.map(chat => (
                <div
                  key={chat._id}
                  className={`chat-item${chat._id === activeChatId ? " active" : ""}`}
                  onClick={() => selectChat(chat._id)}
                  onDoubleClick={(e) => handleDoubleClick(e, chat)}
                  title="Double-click to rename"
                >
                  {renamingId === chat._id ? (
                    <input
                      ref={renameRef}
                      className="rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => handleRenameKeyDown(e, chat._id)}
                      onBlur={() => handleRenameSubmit(chat._id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <MessageSquare size={13} className="chat-item-icon" />
                      <span className="chat-item-title">{chat.title}</span>
                      <button
                        className="btn-delete-chat"
                        onClick={(e) => handleDeleteChat(e, chat._id)}
                        disabled={deletingId === chat._id}
                        title="Delete chat"
                      >
                        {deletingId === chat._id ? "…" : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <p className="chat-list-empty">No chats yet — start a new one!</p>
              )}
            </>
          )}
        </div>

        <div className="sidebar-foot">
          <div className="user-pill">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">
                {user?.fullName?.firstName} {user?.fullName?.lastName}
              </div>
              <div className="user-email">{user?.email}</div>
            </div>
            <button onClick={handleLogout} title="Logout" className="btn-icon logout-btn">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="chat-main">
        <div className="chat-topbar">
          {/* Hamburger — mobile only */}
          <button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="topbar-center">
            <div
              className="status-dot"
              style={{ background: connected ? "var(--success)" : "var(--text3)" }}
            />
            <span>{activeChat ? activeChat.title : "Dexio AI"}</span>
            {!connected && (
              <span className="reconnecting-text">— reconnecting…</span>
            )}
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="messages-area">
          {!activeChatId ? (
            <div className="empty-state">
              <DexioLogo size="md"/>
              <h3>Kya baat karni hai aaj?</h3>
              <p>Create a new chat to get started.</p>
            </div>
          ) : loadingMsgs ? (
            <div className="empty-state">
              <p style={{ color: "var(--text3)", fontSize: 13 }}>Loading messages…</p>
            </div>
          ) : messages.length === 0 && !waiting ? (
            <div className="empty-state">
              <div className="empty-icon">D</div>
              <h3>Chat shuru karo</h3>
              <p>Type a message below.</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`msg-row ${msg.role}`}>
                  <div className="msg-bubble">
                    {msg.role === "model" ? (
                      <>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        <div className="msg-actions">
                          <button
                            className="btn-copy"
                            onClick={() => handleCopy(msg.content, i)}
                            title="Copy"
                          >
                            {copiedId === i
                              ? <Check size={13} />
                              : <Copy size={13} />
                            }
                          </button>
                        </div>
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {waiting && (
                <div className="typing-bubble">
                  <span/><span/><span/>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="input-area">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={activeChatId ? "Message Dexio AI…" : "Select or create a chat first"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeChatId || waiting}
            />
            {waiting ? (
              <button
                className="btn-stop"
                onClick={handleStop}
                title="Stop generation"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="btn-send"
                onClick={sendMessage}
                disabled={!input.trim() || !activeChatId}
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            )}
          </div>
          <p className="input-hint">Enter to send · Shift+Enter for new line · Double-click chat to rename</p>
        </div>
      </div>
    </div>
  )
}