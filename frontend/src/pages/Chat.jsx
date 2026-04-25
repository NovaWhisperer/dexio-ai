import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/useAuth"
import { api } from "../services/api"
import { connectSocket, disconnectSocket } from "../services/socket"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import toast, { Toaster } from "react-hot-toast"
import DexioLogo from "../components/DexioLogo"
import {
  Menu, X, Plus, Send, Square, Copy, Check,
  Trash2, LogOut, MessageSquare
} from "lucide-react"

// ── Dexio icon for AI message avatar ────────────────────────────────────────
function DexioIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      style={{ width: "18px", height: "18px", display: "block" }}
    >
      <path
        d="M20 3L35 11.5V28.5L20 37L5 28.5V11.5L20 3Z"
        fill="#2d1f6e"
        stroke="#7c3aed"
        strokeWidth="1.4"
      />
      <path
        d="M14 13H21C25.4 13 28 15.6 28 20C28 24.4 25.4 27 21 27H14V13Z"
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M17 16.5H20.5C23 16.5 24.5 17.9 24.5 20C24.5 22.1 23 23.5 20.5 23.5H17V16.5Z"
        fill="#7c3aed"
      />
      <circle cx="20" cy="7" r="1.5" fill="#a78bfa" />
    </svg>
  )
}

// ── Per-block code renderer with copy button ─────────────────────────────────
function CodeBlock({ language, value }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silently fail
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{language || "code"}</span>
        <button className="btn-copy-code" onClick={copyCode}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy code"}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || "text"}
        PreTag="div"
        customStyle={{
          borderRadius: "0 0 10px 10px",
          fontSize: "13px",
          margin: 0,
          border: "none",
          background: "#0c0c12",
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  )
}

// ── Markdown component map ────────────────────────────────────────────────────
const MarkdownComponents = {
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const value = String(children).replace(/\n$/, "")
    return !inline && match ? (
      <CodeBlock language={match[1]} value={value} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

export default function Chat() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // ── State ────────────────────────────────────────────────────────────────
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [waiting, setWaiting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState("")

  const socketRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const renameRef = useRef(null)
  const stoppedRef = useRef(false)

  // ── Load messages for a chat ─────────────────────────────────────────────
  const loadMessages = useCallback(async (chatId) => {
    setLoadingMsgs(true)
    setMessages([])
    try {
      const data = await api.getChatMessages(chatId)
      setMessages(data.messages.map(m => ({ role: m.role, content: m.content })))
    } catch {
      toast.error("Failed to load messages")
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
      } catch {
        toast.error("Failed to load chats")
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

  // ── Focus rename input ───────────────────────────────────────────────────
  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  // ── Close sidebar on outside click ──────────────────────────────────────
  useEffect(() => {
    function handleOutside(e) {
      if (
        sidebarOpen &&
        !e.target.closest(".sidebar") &&
        !e.target.closest(".hamburger-btn")
      ) {
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

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on("ai-response", ({ content }) => {
      if (stoppedRef.current) {
        stoppedRef.current = false
        return
      }
      const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      setWaiting(false)
      setMessages(prev => [...prev, { role: "model", content: clean }])
    })

    socket.on("chat-title-updated", ({ chatId, title }) => {
      setChats(prev => prev.map(c => (c._id === chatId ? { ...c, title } : c)))
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
    try {
      const data = await api.createChat({ title: "New Chat" })
      const newChat = data.chat
      setChats(prev => [newChat, ...prev])
      setActiveChatId(newChat._id)
      setMessages([])
      setSidebarOpen(false)
    } catch {
      toast.error("Couldn't create chat")
    }
  }

  // ── Select chat ──────────────────────────────────────────────────────────
  function selectChat(chatId) {
    if (chatId === activeChatId) {
      setSidebarOpen(false)
      return
    }
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
      toast.success("Chat deleted")
    } catch {
      toast.error("Couldn't delete chat")
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
      setChats(prev =>
        prev.map(c => (c._id === chatId ? { ...c, title: trimmed } : c))
      )
      toast.success("Chat renamed")
    } catch {
      toast.error("Couldn't rename chat")
    }
  }

  function handleRenameKeyDown(e, chatId) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleRenameSubmit(chatId)
    }
    if (e.key === "Escape") {
      setRenamingId(null)
    }
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
  async function handleCopy(content) {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied to clipboard", { duration: 1500 })
    } catch {
      toast.error("Copy failed")
    }
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    disconnectSocket()
    await logout()
    navigate("/login")
  }

  const activeChat = chats.find(c => c._id === activeChatId)
  const initials = user
    ? `${user.fullName?.firstName?.[0] ?? ""}${user.fullName?.lastName?.[0] ?? ""}`.toUpperCase()
    : "?"

  return (
    <div className="chat-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#18181f",
            color: "#e8e6f2",
            border: "1px solid #2a2a36",
            fontSize: "13px",
            borderRadius: "10px",
          },
          success: { iconTheme: { primary: "#4fd4a0", secondary: "#18181f" } },
          error: { iconTheme: { primary: "#f05c6a", secondary: "#18181f" } },
        }}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-head">
          <DexioLogo size="sm" />
          <div className="sidebar-head-actions">
            <button className="btn-new-chat" onClick={handleNewChat}>
              <Plus size={14} /> New chat
            </button>
            <button
              className="btn-icon sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="chat-list">
          {loadingChats ? (
            <div className="chat-list-loading">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
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
                  onDoubleClick={e => handleDoubleClick(e, chat)}
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
                        onClick={e => handleDeleteChat(e, chat._id)}
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
                <p className="chat-list-empty">
                  No chats yet — start a new one!
                </p>
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
            <button
              onClick={handleLogout}
              title="Logout"
              className="btn-icon logout-btn"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className="chat-main">
        <div className="chat-topbar">
          <button
            className="btn-icon hamburger-btn"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-center">
            <div
              className="status-dot"
              style={{
                background: connected ? "var(--success)" : "var(--text3)",
              }}
            />
            <span className="topbar-title">
              {activeChat ? activeChat.title : "Dexio AI"}
            </span>
            {!connected && (
              <span className="reconnecting-text">— reconnecting…</span>
            )}
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="messages-area">
          <div className="messages-col">
            {!activeChatId ? (
              <div className="empty-state">
                <DexioLogo size="lg" />
                <h3>Kya baat karni hai aaj?</h3>
                <p>Create a new chat to get started.</p>
              </div>
            ) : loadingMsgs ? (
              <div className="empty-state">
                <div className="msg-skeleton-wrap">
                  <span className="skeleton skeleton-msg" />
                  <span className="skeleton skeleton-msg short" />
                  <span className="skeleton skeleton-msg" />
                </div>
              </div>
            ) : messages.length === 0 && !waiting ? (
              <div className="empty-state">
                <DexioLogo size="lg" />
                <h3>Chat shuru karo</h3>
                <p>Type a message below to begin.</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`msg-row ${msg.role}`}>
                    {msg.role === "model" && (
                      <div className="msg-avatar">
                        <DexioIcon />
                      </div>
                    )}
                    <div className="msg-bubble">
                      {msg.role === "model" ? (
                        <>
                          <ReactMarkdown components={MarkdownComponents}>
                            {msg.content}
                          </ReactMarkdown>
                          <div className="msg-actions">
                            <button
                              className="btn-copy"
                              onClick={() => handleCopy(msg.content)}
                              title="Copy response"
                            >
                              <Copy size={12} /> Copy
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
                  <div className="msg-row model">
                    <div className="msg-avatar">
                      <DexioIcon />
                    </div>
                    <div className="typing-bubble">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="input-area">
          <div className="input-col">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={
                  activeChatId
                    ? "Message Dexio AI…"
                    : "Select or create a chat first"
                }
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
            <p className="input-hint">
              Enter to send · Shift+Enter for new line · Double-click chat to
              rename
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}