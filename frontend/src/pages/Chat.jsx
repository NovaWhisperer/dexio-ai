import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/useAuth"
import { api } from "../services/api"
import { connectSocket, disconnectSocket } from "../services/socket"
import ReactMarkdown from "react-markdown"
import toast, { Toaster } from "react-hot-toast"
import DexioLogo from "../components/DexioLogo"
import { User, Menu, X, Plus, Send, Square, Copy, Trash2, LogOut, MessageSquare } from "lucide-react"

// ── Lazy loaded heavy components ──────────────────────────────────────────
const Background3D = lazy(() => import("../components/Background3D"))
const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then(mod => ({ default: mod.Prism }))
)

// ── Code block with hover copy button ────────────────────────────────────
function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false)
  const [style, setStyle]   = useState(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    import("react-syntax-highlighter/dist/esm/styles/prism").then(mod => {
      setStyle(mod.oneDark)
    })
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Copy failed")
    }
  }

  return (
    <div
      className="code-block-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover-only copy button — floats top-right */}
      <button
        className="btn-copy-code"
        onClick={handleCopy}
        style={{ opacity: hovered || copied ? 1 : 0 }}
      >
        {copied ? (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <Copy size={11} />
            Copy
          </>
        )}
      </button>

      <Suspense fallback={
        <pre style={{ background: "#0d0d10", padding: "18px 20px", borderRadius: "10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#a1a1aa", margin: 0, overflowX: "auto" }}>
          {children}
        </pre>
      }>
        {style ? (
          <SyntaxHighlighter
            style={style}
            language={language || "text"}
            PreTag="div"
            useInlineStyles={true}
            wrapLines={false}
            customStyle={{
              borderRadius: "10px",
              fontSize: "13.5px",
              margin: 0,
              border: "none",
              background: "#0d0d10",
              padding: "18px 20px",
              lineHeight: "1.7",
              overflowX: "auto",
            }}
            codeTagProps={{
              style: {
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: "13.5px",
              }
            }}
          >
            {children}
          </SyntaxHighlighter>
        ) : (
          <pre style={{ background: "#0d0d10", padding: "18px 20px", borderRadius: "10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#a1a1aa", margin: 0, overflowX: "auto" }}>
            {children}
          </pre>
        )}
      </Suspense>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────
const MarkdownComponents = {
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const code  = String(children).replace(/\n$/, "")
    return !inline && match
      ? <CodeBlock language={match[1]}>{code}</CodeBlock>
      : <code className={className} {...props}>{children}</code>
  }
}

// ── Format timestamp ──────────────────────────────────────────────────────
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

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

  const socketRef   = useRef(null)
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)
  const renameRef   = useRef(null)
  const stoppedRef  = useRef(false)
  const messagesAreaRef = useRef(null)

  // ── Streaming state ──────────────────────────────────────────────────────
  const [streamingId, setStreamingId]     = useState(null)
  const streamingContentRef               = useRef("")

  // ── Scroll to bottom button ──────────────────────────────────────────────
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // ── Suggested prompts ────────────────────────────────────────────────────
  const PROMPTS = [
    "Help me write code",
    "Explain a concept",
    "Brainstorm ideas",
    "Summarise something",
  ]

  // ── Load messages ────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (chatId) => {
    setLoadingMsgs(true)
    setMessages([])
    try {
      const data = await api.getChatMessages(chatId)
      setMessages(data.messages.map(m => ({
        role: m.role,
        content: m.content,
        time: m.createdAt || new Date().toISOString(),
      })))
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

  // ── Track scroll position for scroll-to-bottom button ───────────────────
  useEffect(() => {
    const el = messagesAreaRef.current
    if (!el) return
    function handleScroll() {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distFromBottom > 200)
    }
    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "26px"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [input])

  // ── Focus rename input ───────────────────────────────────────────────────
  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  // ── Close sidebar on outside click ──────────────────────────────────────
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
      if (stoppedRef.current) { stoppedRef.current = false; return }
      const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()

      // Start streaming — add empty message then type it out
      const msgId = Date.now().toString()
      setStreamingId(msgId)
      streamingContentRef.current = ""

      setMessages(prev => [...prev, { id: msgId, role: "model", content: "", time: new Date().toISOString() }])
      setWaiting(false)

      // Stream character by character
      let i = 0
      const speed = Math.max(8, Math.min(20, Math.floor(15000 / clean.length)))

      function typeNext() {
        if (stoppedRef.current) {
          stoppedRef.current = false
          setStreamingId(null)
          return
        }
        if (i < clean.length) {
          streamingContentRef.current += clean[i]
          const currentText = streamingContentRef.current
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, content: currentText } : m
          ))
          i++
          setTimeout(typeNext, speed)
        } else {
          setStreamingId(null)
        }
      }
      typeNext()
    })

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
      setChats(prev => prev.map(c => c._id === chatId ? { ...c, title: trimmed } : c))
      toast.success("Chat renamed")
    } catch {
      toast.error("Couldn't rename chat")
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
    setMessages(prev => [...prev, { role: "user", content, time: new Date().toISOString() }])
    setInput("")
    setWaiting(true)

    socketRef.current.emit("ai-message", { chat: activeChatId, content })
  }, [input, activeChatId, waiting])

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Scroll to bottom button ──────────────────────────────────────────────
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // ── Suggested prompt click ───────────────────────────────────────────────
  function handlePrompt(prompt) {
    if (!activeChatId || waiting || streamingId) return
    setInput(prompt)
    textareaRef.current?.focus()
  }

  // ── Stop generation ──────────────────────────────────────────────────────
  function handleStop() {
    stoppedRef.current = true
    setWaiting(false)
  }

  // ── Copy message ─────────────────────────────────────────────────────────
  async function handleCopyMessage(content) {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied", { duration: 1500 })
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
  const initials   = user
    ? `${user.fullName?.firstName?.[0] ?? ""}${user.fullName?.lastName?.[0] ?? ""}`.toUpperCase()
    : "?"

  return (
    <div className="chat-shell">
      <Suspense fallback={null}>
        <Background3D variant="chat" />
      </Suspense>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#f4f4f5",
            border: "1px solid #27272a",
            fontSize: "13px",
            borderRadius: "10px",
          },
          success: { iconTheme: { primary: "#10b981", secondary: "#18181b" } },
          error:   { iconTheme: { primary: "#f87171", secondary: "#18181b" } },
        }}
      />

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
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> New chat
              </span>
            </button>
            <button className="btn-icon sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
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
                <div className="chat-list-label">Recent History</div>
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
                        title="Delete"
                      >
                        {deletingId === chat._id ? "…" : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <p className="chat-list-empty">No chats yet — start one!</p>
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

        {/* Topbar */}
        <div className="chat-topbar">
          <button className="btn-icon hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="topbar-center">
            <div
              className="status-dot"
              style={{ background: connected ? "var(--accent)" : "var(--text3)" }}
            />
            <span>{activeChat ? activeChat.title : "Dexio AI"}</span>
            {!connected && (
              <span className="reconnecting-text">— reconnecting…</span>
            )}
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="messages-area" ref={messagesAreaRef}>
          <div className="messages-col">

            {!activeChatId ? (
              <div className="empty-state">
                <div className="empty-logo-wrap">
                  <DexioLogo size="md" showText={false} />
                </div>
                <h3>How can I help you today?</h3>
                <p>Create a new chat to get started with Dexio AI.</p>
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
                <div className="empty-logo-wrap">
                  <DexioLogo size="md" showText={false} />
                </div>
                <h3>Start the conversation</h3>
                <p>Ask me anything — I'm here to help.</p>
                <div className="prompt-chips">
                  {PROMPTS.map(p => (
                    <button
                      key={p}
                      className="prompt-chip"
                      onClick={() => handlePrompt(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`msg-row ${msg.role}`}>

                    {/* Avatar */}
                    {msg.role === "model" ? (
                      <div className="msg-avatar">
                        <DexioLogo size="sm" showText={false} />
                      </div>
                    ) : (
                      <div className="msg-avatar-user">
                        <User size={15} />
                      </div>
                    )}

                    {/* Content */}
                    <div className="msg-content">
                      {msg.role === "model" ? (
                        <>
                          <div className="msg-bubble-ai">
                            <ReactMarkdown components={MarkdownComponents}>
                              {msg.content}
                            </ReactMarkdown>
                            {streamingId === msg.id && (
                              <span className="streaming-cursor" />
                            )}
                          </div>
                          <div className="msg-actions">
                            <button
                              className="btn-copy"
                              onClick={() => handleCopyMessage(msg.content)}
                              title="Copy response"
                            >
                              <Copy size={11} /> Copy
                            </button>
                          </div>
                          <span className="msg-time">{formatTime(msg.time)}</span>
                        </>
                      ) : (
                        <>
                          <div className="msg-bubble-user">{msg.content}</div>
                          <span className="msg-time">{formatTime(msg.time)}</span>
                        </>
                      )}
                    </div>

                  </div>
                ))}

                {/* Typing indicator */}
                {waiting && (
                  <div className="msg-row model">
                    <div className="msg-avatar">
                      <DexioLogo size="sm" showText={false} />
                    </div>
                    <div className="msg-content">
                      <div className="typing-bubble">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button className="btn-scroll-bottom" onClick={scrollToBottom} title="Scroll to bottom">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="input-area">
          <div className="input-col">
            <div className="input-glow" />
            <div className="input-box">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={activeChatId ? "Ask Dexio anything…" : "Select or create a chat first"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!activeChatId || waiting}
              />
              {waiting ? (
                <button className="btn-stop" onClick={handleStop} title="Stop">
                  <Square size={14} />
                </button>
              ) : (
                <button
                  className="btn-send"
                  onClick={sendMessage}
                  disabled={!input.trim() || !activeChatId}
                  aria-label="Send"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
            <p className="input-hint">
              Enter to send · Shift+Enter for new line · Double-click chat to rename
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}